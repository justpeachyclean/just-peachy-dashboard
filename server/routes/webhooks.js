const express = require('express')
const router = express.Router()
const db = require('../db')
const CODES = require('../lib/cancellationCodes')

function resolveCode(code) {
  if (!code) return { label: null, category: null }
  const upper = code.toUpperCase().trim().split(/[\s–-]/)[0]
  return CODES[upper] || { label: code, category: 'Other' }
}

function verifySecret(req, res) {
  const secret = db.prepare("SELECT value FROM settings WHERE key='webhook_secret'").get()?.value
  const provided = req.headers['x-webhook-secret']
  if (secret && secret !== 'change-me-before-connecting-zapier' && provided !== secret) {
    res.status(401).json({ error: 'Invalid webhook secret' })
    return false
  }
  return true
}

// POST /api/webhook/ghl
router.post('/ghl', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const {
    event_type,
    contact_id,
    opportunity_id,
    rep_name,
    client_freq,
    event_date,
  } = payload

  if (!event_type) return res.status(400).json({ error: 'event_type required' })

  db.prepare(`
    INSERT INTO ghl_events (event_type, contact_id, opportunity_id, rep_name, client_freq, event_date, raw_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event_type,
    contact_id ?? null,
    opportunity_id ?? null,
    rep_name ?? null,
    client_freq ?? null,
    event_date ?? new Date().toISOString().split('T')[0],
    JSON.stringify(payload)
  )

  res.json({ ok: true })
})

// POST /api/webhook/maidcentral
router.post('/maidcentral', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const { event_type, client_id, amount, event_date } = payload

  if (!event_type) return res.status(400).json({ error: 'event_type required' })

  db.prepare(`
    INSERT INTO maidcentral_events (event_type, client_id, amount, event_date, raw_payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    event_type,
    client_id ?? null,
    amount ?? null,
    event_date ?? new Date().toISOString().split('T')[0],
    JSON.stringify(payload)
  )

  res.json({ ok: true })
})

// POST /api/webhook/cancellation  — MC client cancelled
router.post('/cancellation', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const {
    client_id, client_name, cancel_date, reason_code,
    client_quote, save_attempted, save_outcome, solution_offered,
    frequency, recurring_months, revenue_lost_monthly,
  } = payload

  const date = cancel_date || new Date().toISOString().split('T')[0]
  const { label, category } = resolveCode(reason_code)

  const result = db.prepare(`
    INSERT INTO cancelled_clients
      (client_id, client_name, cancel_date, reason_code, reason_label, reason_category,
       client_quote, save_attempted, save_outcome, solution_offered,
       frequency, recurring_months, revenue_lost_monthly, source, raw_payload)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'webhook',?)
  `).run(
    client_id ?? null, client_name ?? null, date,
    reason_code ?? null, label, category,
    client_quote ?? null,
    save_attempted ? 1 : 0,
    save_outcome ?? null, solution_offered ?? null,
    frequency ?? null,
    recurring_months ? parseInt(recurring_months) : null,
    revenue_lost_monthly ? parseFloat(revenue_lost_monthly) : null,
    JSON.stringify(payload)
  )

  // Auto-queue T-coded clients for nurture
  if (reason_code && reason_code.toUpperCase().startsWith('T')) {
    const next30 = new Date()
    next30.setDate(next30.getDate() + 30)
    db.prepare(`
      INSERT OR IGNORE INTO client_nurture
        (cancelled_id, client_id, client_name, reason_code, cancel_date, next_contact)
      VALUES (?,?,?,?,?,?)
    `).run(
      result.lastInsertRowid,
      client_id ?? null, client_name ?? null,
      reason_code, date,
      next30.toISOString().split('T')[0]
    )
  }

  res.json({ ok: true, id: result.lastInsertRowid })
})

// POST /api/webhook/feedback  — MC review / scorecard / survey
router.post('/feedback', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const { client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name } = payload

  db.prepare(`
    INSERT INTO client_feedback
      (client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name, source, raw_payload)
    VALUES (?,?,?,?,?,?,?,'webhook',?)
  `).run(
    client_id ?? null, client_name ?? null,
    feedback_date || new Date().toISOString().split('T')[0],
    rating ? parseInt(rating) : null,
    feedback_type || 'survey',
    comment ?? null, tech_name ?? null,
    JSON.stringify(payload)
  )

  res.json({ ok: true })
})

// POST /api/webhook/test  — sends a test event to verify the connection
router.post('/test', (req, res) => {
  if (!verifySecret(req, res)) return
  const { source = 'test' } = req.body
  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description, user) VALUES ('webhook_test', ?, 'Test ping received', 'zapier')`
  ).run(source)
  res.json({ ok: true, received_at: new Date().toISOString() })
})

// GET /api/webhook/events  — recent webhook events for the event log
router.get('/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100)

  const ghl = db.prepare(
    `SELECT 'ghl' AS source, event_type, event_date, created_at, contact_id AS ref_id FROM ghl_events ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const mc = db.prepare(
    `SELECT 'maidcentral' AS source, event_type, event_date, created_at, client_id AS ref_id FROM maidcentral_events ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const qb = db.prepare(
    `SELECT 'quickbooks' AS source, category AS event_type, month AS event_date, synced_at AS created_at, NULL AS ref_id FROM quickbooks_expenses ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const all = [...ghl, ...mc, ...qb]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)

  const counts = {
    ghl: db.prepare('SELECT COUNT(*) AS n FROM ghl_events').get().n,
    maidcentral: db.prepare('SELECT COUNT(*) AS n FROM maidcentral_events').get().n,
    quickbooks: db.prepare('SELECT COUNT(*) AS n FROM quickbooks_expenses').get().n,
    cancellations: db.prepare("SELECT COUNT(*) AS n FROM cancelled_clients WHERE source='webhook'").get().n,
    feedback: db.prepare("SELECT COUNT(*) AS n FROM client_feedback WHERE source='webhook'").get().n,
  }

  res.json({ events: all, counts })
})

// POST /api/webhook/quickbooks  (also available as nightly pull — see cron)
router.post('/quickbooks', (req, res) => {
  if (!verifySecret(req, res)) return

  const { month, category, amount } = req.body
  if (!month || !category) return res.status(400).json({ error: 'month and category required' })

  db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(month, category) DO UPDATE SET amount=excluded.amount, synced_at=datetime('now')
  `).run(month, category, amount ?? 0)

  res.json({ ok: true })
})

// POST /api/webhook/seed-historical  — one-time import of historical data on production
router.post('/seed-historical', (req, res) => {
  if (!verifySecret(req, res)) return

  const results = { cancellations: 0, feedback: 0, expenses: 0, nurture: 0 }

  // ── QB expenses ──────────────────────────────────────────────────────────
  const ANNUAL = [
    { year: 2024, months: 12, marketing: 87183,  recruiting: 4685  },
    { year: 2025, months: 12, marketing: 137003, recruiting: 7402  },
    { year: 2026, months: 5,  marketing: 55725,  recruiting: 3927  },
  ]
  const upsertExp = db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(month, category) DO UPDATE SET amount=excluded.amount, synced_at=datetime('now')
  `)
  const expTx = db.transaction(() => {
    for (const { year, months, marketing, recruiting } of ANNUAL) {
      const mkt = Math.round((marketing  / months) * 100) / 100
      const rec = Math.round((recruiting / months) * 100) / 100
      for (let m = 1; m <= months; m++) {
        const month = `${year}-${String(m).padStart(2, '0')}`
        upsertExp.run(month, 'Marketing',  mkt)
        upsertExp.run(month, 'Recruiting', rec)
        results.expenses += 2
      }
    }
  })
  expTx()

  // Update settings to match
  db.prepare(`UPDATE settings SET value='Marketing'  WHERE key='qb_marketing_category'`).run()
  db.prepare(`UPDATE settings SET value='Recruiting' WHERE key='qb_recruiting_category'`).run()

  // ── Cancellations from embedded data ─────────────────────────────────────
  const FEEDBACK_DATA = [{"n":"Abby Shah","d":"2024-05-03","r":3},{"n":"Alexandra Tecce","d":"2024-04-15","r":4},{"n":"Amanda Benson","d":"2024-06-03","r":4},{"n":"Amelia West","d":"2024-05-08","r":4},{"n":"Amelia West","d":"2024-05-08","r":4},{"n":"Amy Robosky","d":"2024-03-22","r":4},{"n":"Angela Norris","d":"2024-08-22","r":4},{"n":"Ann McClure","d":"2024-06-27","r":3},{"n":"Ann Waidner","d":"2024-03-13","r":4},{"n":"Anna De La Torriente","d":"2024-06-27","r":3},{"n":"Barbara  Begley","d":"2024-08-16","r":4},{"n":"Barbara Fleming","d":"2024-04-22","r":4},{"n":"Beccy Schulze","d":"2024-07-18","r":4},{"n":"Bev Surrette","d":"2024-04-25","r":4},{"n":"Bev Surrette","d":"2024-06-06","r":4},{"n":"BG Sims","d":"2024-03-11","r":4},{"n":"Brienne Meinberg","d":"2024-05-21","r":4},{"n":"Carolina Gullo","d":"2024-02-13","r":4},{"n":"Caroline Atwell","d":"2024-07-08","r":3},{"n":"Cathy  Wood","d":"2024-03-05","r":4},{"n":"Chelsea Nataupsky","d":"2024-06-07","r":4},{"n":"Chris Shaw","d":"2024-06-25","r":4},{"n":"Christy Molina","d":"2024-01-17","r":4},{"n":"Cristen Coker","d":"2024-07-16","r":4},{"n":"Dana Ford","d":"2024-02-13","r":4},{"n":"David Pierce","d":"2024-01-24","r":4},{"n":"Debbie Chislo","d":"2024-07-15","r":4},{"n":"Delores Chapman","d":"2024-02-28","r":4},{"n":"Drema Bozich","d":"2024-07-16","r":4},{"n":"Ellen Yeaser","d":"2024-04-22","r":4},{"n":"Eric Boyle","d":"2024-06-05","r":4},{"n":"Faith Stainbrook","d":"2024-07-08","r":4},{"n":"Haley Stephens","d":"2024-05-13","r":4},{"n":"Holly Kotarski","d":"2024-08-19","r":4},{"n":"Jacquelyn Bennett","d":"2024-08-06","r":4},{"n":"Jamie Bailey","d":"2024-05-20","r":4},{"n":"Jane Katona","d":"2024-01-23","r":4},{"n":"Janet Lofquist","d":"2024-02-28","r":4},{"n":"Janet Lofquist","d":"2024-04-24","r":4},{"n":"Jay Murray","d":"2024-09-11","r":4},{"n":"Jean Gardner","d":"2024-07-25","r":4},{"n":"Jeanette  Goeden","d":"2024-04-04","r":4},{"n":"Jennifer Anderson","d":"2024-04-09","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-08-29","r":4},{"n":"Jenny Tacner","d":"2024-05-17","r":4},{"n":"Jessica Daly","d":"2024-08-29","r":4},{"n":"Joe Norwood","d":"2024-06-25","r":4},{"n":"John Hinton","d":"2024-06-03","r":4},{"n":"Joy Hale","d":"2024-07-09","r":3},{"n":"Joyce  Reynolds","d":"2024-06-05","r":4},{"n":"Joyce Holnquist","d":"2024-06-18","r":4},{"n":"Judy  Lampe","d":"2024-08-21","r":3},{"n":"Julie Graham","d":"2024-05-06","r":4},{"n":"Julie Moynihan","d":"2024-04-17","r":4},{"n":"Julie Shinew","d":"2024-08-28","r":4},{"n":"Kandi Schromm","d":"2024-07-26","r":4},{"n":"KAREN Brunetti","d":"2024-04-11","r":4},{"n":"Kayla Whittredge","d":"2024-03-18","r":4},{"n":"Kelly Bowman","d":"2024-02-16","r":4},{"n":"Kenneth Witcher","d":"2024-06-19","r":4},{"n":"Kylie Dawes","d":"2024-09-11","r":4},{"n":"Lane Gauntt","d":"2024-04-18","r":4},{"n":"Laura Thomas","d":"2024-07-22","r":4},{"n":"Lesley Coffrin","d":"2024-05-20","r":4},{"n":"Lynn Rosler","d":"2024-04-29","r":3},{"n":"Maria Moreno","d":"2024-08-06","r":4},{"n":"Marissa Greathouse","d":"2024-01-08","r":4},{"n":"Melissa Nangle","d":"2024-02-19","r":4},{"n":"Michelle Purvis","d":"2024-08-06","r":4},{"n":"Nancy Miller","d":"2024-02-21","r":4},{"n":"Nate &amp; Shannon Handlin","d":"2024-01-17","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-07-23","r":4},{"n":"Nelson Cambata","d":"2024-08-20","r":4},{"n":"Norina Burt","d":"2024-09-04","r":4},{"n":"Patricia McElwee","d":"2024-01-22","r":4},{"n":"Rosanne Lamb","d":"2024-04-01","r":4},{"n":"Rosanne Lamb","d":"2024-05-13","r":4},{"n":"Ryan Witt","d":"2024-09-09","r":4},{"n":"Sam Wallace","d":"2024-02-27","r":4},{"n":"Sam Wallace","d":"2024-05-03","r":4},{"n":"Samantha Henshaw","d":"2024-07-08","r":3},{"n":"Shelly Studley","d":"2024-05-15","r":4},{"n":"Tabatha Rash","d":"2024-07-29","r":4},{"n":"The Greenery","d":"2024-08-01","r":4},{"n":"Tom McCloskey","d":"2024-03-07","r":4},{"n":"Tracie Padgett","d":"2024-01-03","r":3}]
  const CANCELLATION_DATA = [{"n":"Kayley White","d":"2024-01-03","c":"O4","f":"biweekly","r":326},{"n":"Stephani Widmer","d":"2024-01-03","c":"O4","f":"monthly","r":239},{"n":"Tracie Padgett","d":"2024-01-03","c":"L1","f":"monthly","r":160},{"n":"Marissa Greathouse","d":"2024-01-08","c":"P1","f":"biweekly","r":480},{"n":"Christy Molina","d":"2024-01-17","c":"O4","f":"biweekly","r":310},{"n":"Nate &amp; Shannon Handlin","d":"2024-01-17","c":"O4","f":"biweekly","r":395},{"n":"Brianna Livingston","d":"2024-01-18","c":"O4","f":"monthly","r":194},{"n":"Patricia McElwee","d":"2024-01-22","c":"O4","f":"monthly","r":194},{"n":"Jane Katona","d":"2024-01-23","c":"O4","f":"biweekly","r":326},{"n":"David Pierce","d":"2024-01-24","c":"O4","f":"biweekly","r":564},{"n":"Bill Howell","d":"2024-02-13","c":"O4","f":"one_time"},{"n":"Carolina Gullo","d":"2024-02-13","c":"L1","f":"biweekly","r":260},{"n":"Dana Ford","d":"2024-02-13","c":"O4","f":"biweekly","r":423},{"n":"Kristi Brown","d":"2024-02-13","c":"P1","f":"monthly","r":182},{"n":"Kelly Bowman","d":"2024-02-16","c":"O4","f":"biweekly","r":585},{"n":"Melissa Nangle","d":"2024-02-19","c":"O4","f":"biweekly","r":286},{"n":"Nancy Miller","d":"2024-02-21","c":"P1","f":"monthly","r":202},{"n":"Tina Borel","d":"2024-02-22","c":"P1","f":"monthly","r":169},{"n":"Ruth/Roger Vaughn","d":"2024-02-26","c":"O4","f":"one_time"},{"n":"Robin Socha","d":"2024-02-27","c":"O4","f":"one_time"},{"n":"Sam Wallace","d":"2024-02-27","c":"L1","f":"monthly","r":175},{"n":"Delores Chapman","d":"2024-02-28","c":"P1","f":"biweekly","r":417},{"n":"Janet Lofquist","d":"2024-02-28","c":"L1","f":"biweekly","r":193},{"n":"Jennifer Chan","d":"2024-03-01","c":"O5","f":"biweekly","r":775},{"n":"Cathy  Wood","d":"2024-03-05","c":"L1","f":"monthly","r":144},{"n":"Charlene La Barge","d":"2024-03-05","c":"O5","f":"one_time"},{"n":"Jan Dick","d":"2024-03-06","c":"O5","f":"one_time"},{"n":"Tom McCloskey","d":"2024-03-07","c":"O4","f":"monthly","r":179},{"n":"BG Sims","d":"2024-03-11","c":"O5","f":"one_time"},{"n":"Kristine  Veale ","d":"2024-03-11","c":"O4","f":"one_time"},{"n":"Michelle Walker","d":"2024-03-11","c":"O5","f":"one_time"},{"n":"Susan Allen","d":"2024-03-12","c":"O4","f":"monthly","r":191},{"n":"Ann Waidner","d":"2024-03-13","c":"P1","f":"biweekly","r":389},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O4","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"biweekly","r":355},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Kayla Whittredge","d":"2024-03-18","c":"P2","f":"monthly","r":224},{"n":"Amy Robosky","d":"2024-03-22","c":"L1","f":"biweekly","r":389},{"n":"Dorene Taylor","d":"2024-03-22","c":"P1","f":"biweekly","r":282},{"n":"Jennifer Chan","d":"2024-03-25","c":"Q2","f":"biweekly","r":775},{"n":"Denise McCullough","d":"2024-03-26","c":"C2","f":"one_time"},{"n":"Rosanne Lamb","d":"2024-04-01","c":"L1","f":"biweekly","r":328},{"n":"Kimberly Smith","d":"2024-04-02","c":"L1","f":"monthly","r":191},{"n":"Stephanie Sweet","d":"2024-04-02","c":"O4","f":"monthly","r":191},{"n":"Bridget  Diefendorf ","d":"2024-04-03","c":"P1","f":"biweekly","r":370},{"n":"Lavonda West","d":"2024-04-03","c":"L1","f":"monthly","r":191},{"n":"Jeanette  Goeden","d":"2024-04-04","c":"Q2","f":"monthly","r":284},{"n":"Amber Leigh","d":"2024-04-09","c":"O5","f":"weekly","r":440},{"n":"Jennifer Anderson","d":"2024-04-09","c":"P1","f":"biweekly","r":361},{"n":"Connie Royer","d":"2024-04-10","c":"O4","f":"biweekly","r":451},{"n":"Sue Johnson","d":"2024-04-10","c":"P1","f":"one_time"},{"n":"KAREN Brunetti","d":"2024-04-11","c":"P1","f":"biweekly","r":688},{"n":"Alexandra Tecce","d":"2024-04-15","c":"O5","f":"biweekly","r":339},{"n":"Pat Mcclellan","d":"2024-04-15","c":"O5","f":"weekly","r":714},{"n":"Pat Mcclellan","d":"2024-04-16","c":"P1","f":"weekly","r":563},{"n":"Julie Moynihan","d":"2024-04-17","c":"O5","f":"biweekly","r":282},{"n":"Lane Gauntt","d":"2024-04-18","c":"O5","f":"biweekly","r":355},{"n":"Michelle Costello","d":"2024-04-18","c":"O5","f":"one_time"},{"n":"Michelle Costello","d":"2024-04-18","c":"O4","f":"one_time"},{"n":"Pat Mcclellan","d":"2024-04-19","c":"P1","f":"monthly","r":191},{"n":"Barbara Fleming","d":"2024-04-22","c":"P3","f":"monthly","r":179},{"n":"Ellen Yeaser","d":"2024-04-22","c":"O5","f":"monthly","r":179},{"n":"Haley Stephens","d":"2024-04-24","c":"O4","f":"weekly","r":585},{"n":"Janet Lofquist","d":"2024-04-24","c":"O4","f":"biweekly","r":193},{"n":"Bev Surrette","d":"2024-04-25","c":"O4","f":"monthly","r":224},{"n":"Tiffany  Jackson","d":"2024-04-25","c":"P4","f":"one_time"},{"n":"Tiffany  Jackson","d":"2024-04-26","c":"O4","f":"biweekly","r":349},{"n":"Linda Laprade","d":"2024-04-29","c":"P3","f":"biweekly","r":349},{"n":"Lynn Rosler","d":"2024-04-29","c":"O5","f":"monthly","r":182},{"n":"Ryan .","d":"2024-04-30","c":"O4","f":"biweekly","r":319},{"n":"Abby Shah","d":"2024-05-03","c":"P3","f":"monthly","r":209},{"n":"Sam Wallace","d":"2024-05-03","c":"L1","f":"monthly","r":175},{"n":"Dorene Taylor","d":"2024-05-06","c":"O4","f":"biweekly","r":315},{"n":"Julie Graham","d":"2024-05-06","c":"P1","f":"one_time"},{"n":"Nathan Henwood","d":"2024-05-06","c":"O4","f":"biweekly","r":337},{"n":"Nathan Henwood","d":"2024-05-06","c":"O4","f":"biweekly","r":337},{"n":"Nathan Henwood","d":"2024-05-06","c":"P1","f":"biweekly","r":337},{"n":"Amelia West","d":"2024-05-08","c":"O4","f":"biweekly","r":395},{"n":"Amelia West","d":"2024-05-08","c":"O4","f":"biweekly","r":395},{"n":"Haley Stephens","d":"2024-05-13","c":"O4","f":"biweekly","r":349},{"n":"Rosanne Lamb","d":"2024-05-13","c":"O5","f":"one_time"},{"n":"Diane Kallman","d":"2024-05-15","c":"O4","f":"biweekly","r":349},{"n":"Shelly Studley","d":"2024-05-15","c":"O4","f":"monthly","r":156},{"n":"Jenny Tacner","d":"2024-05-17","c":"O4","f":"one_time"},{"n":"Jamie Bailey","d":"2024-05-20","c":"P1","f":"biweekly","r":399},{"n":"Lesley Coffrin","d":"2024-05-20","c":"P1","f":"monthly","r":175},{"n":"Brienne Meinberg","d":"2024-05-21","c":"L1","f":"monthly","r":191},{"n":"Drema Bozich","d":"2024-05-24","c":"O5","f":"one_time"},{"n":"Jacquelyn Santo","d":"2024-05-31","c":"O4","f":"biweekly","r":488},{"n":"Amanda Benson","d":"2024-06-03","c":"O4","f":"biweekly","r":476},{"n":"Jennifer Richardson","d":"2024-06-03","c":"C2","f":"monthly","r":165},{"n":"John Hinton","d":"2024-06-03","c":"O4","f":"biweekly","r":367},{"n":"Eric Boyle","d":"2024-06-05","c":"P1","f":"monthly","r":156},{"n":"Joyce  Reynolds","d":"2024-06-05","c":"P1","f":"monthly","r":191},{"n":"Bev Surrette","d":"2024-06-06","c":"O4","f":"monthly","r":224},{"n":"Megan  White","d":"2024-06-06","c":"O4","f":"monthly","r":203},{"n":"Olga Grunsten","d":"2024-06-06","c":"O4","f":"biweekly","r":351},{"n":"Olga Grunsten","d":"2024-06-06","c":"O5","f":"monthly","r":197},{"n":"Chelsea Nataupsky","d":"2024-06-07","c":"O4","f":"biweekly","r":357},{"n":"Jim Byrd","d":"2024-06-07","c":"P4","f":"biweekly","r":429},{"n":"Sandi  Kerr","d":"2024-06-07","c":"O4","f":"monthly","r":191},{"n":"Melissa Powers","d":"2024-06-10","c":"O4","f":"one_time"},{"n":"Joyce Holnquist","d":"2024-06-18","c":"P2","f":"monthly","r":156},{"n":"Robin Llanes","d":"2024-06-18","c":"O4","f":"biweekly","r":485},{"n":"Kenneth Witcher","d":"2024-06-19","c":"P1","f":"monthly","r":195},{"n":"Chris Shaw","d":"2024-06-25","c":"O4","f":"monthly","r":191},{"n":"Joe Norwood","d":"2024-06-25","c":"P1","f":"biweekly","r":349},{"n":"Ann McClure","d":"2024-06-27","c":"T1","f":"monthly","r":191},{"n":"Anna De La Torriente","d":"2024-06-27","c":"O4","f":"monthly","r":254},{"n":"Caroline Atwell","d":"2024-07-08","c":"Q2","f":"monthly","r":170},{"n":"Faith Stainbrook","d":"2024-07-08","c":"P1","f":"biweekly","r":329},{"n":"Samantha Henshaw","d":"2024-07-08","c":"O4","f":"biweekly","r":349},{"n":"Joy Hale","d":"2024-07-09","c":"Q2","f":"monthly","r":191},{"n":"Mary Cortese","d":"2024-07-12","c":"P1","f":"one_time"},{"n":"Debbie Chislo","d":"2024-07-15","c":"P1","f":"biweekly","r":349},{"n":"Cristen Coker","d":"2024-07-16","c":"O4","f":"monthly","r":150},{"n":"Drema Bozich","d":"2024-07-16","c":"O4","f":"biweekly","r":349},{"n":"Malav Patel","d":"2024-07-17","c":"O4","f":"monthly","r":246},{"n":"Beccy Schulze","d":"2024-07-18","c":"O4","f":"biweekly","r":176},{"n":"Laura Thomas","d":"2024-07-22","c":"L1","f":"biweekly","r":297},{"n":"Jessica Roberts","d":"2024-07-23","c":"P4","f":"monthly","r":150},{"n":"Nathan Henwood","d":"2024-07-23","c":"O4","f":"biweekly","r":337},{"n":"Jean Gardner","d":"2024-07-25","c":"P1","f":"monthly","r":191},{"n":"Kandi Schromm","d":"2024-07-26","c":"P1","f":"biweekly","r":339},{"n":"Tabatha Rash","d":"2024-07-29","c":"O4","f":"biweekly","r":349},{"n":"Brianna Livingston","d":"2024-07-30","c":"L1","f":"biweekly","r":357},{"n":"Kathy  Carson","d":"2024-07-31","c":"O4","f":"monthly","r":213},{"n":"Lucyna Kornecki","d":"2024-07-31","c":"P3","f":"one_time"},{"n":"Lucyna Kornecki","d":"2024-08-01","c":"P1","f":"monthly","r":222},{"n":"Olga Grunsten","d":"2024-08-01","c":"P1","f":"monthly","r":197},{"n":"The Greenery","d":"2024-08-01","c":"P4","f":"weekly","r":652},{"n":"Jacquelyn Bennett","d":"2024-08-06","c":"C2","f":"biweekly","r":349},{"n":"Maria Moreno","d":"2024-08-06","c":"O4","f":"biweekly","r":385},{"n":"Michelle Purvis","d":"2024-08-06","c":"O4","f":"biweekly","r":415},{"n":"Jane Kennedy","d":"2024-08-12","c":"O4","f":"one_time"},{"n":"Jane Kennedy","d":"2024-08-12","c":"O5","f":"one_time"},{"n":"Barbara  Begley","d":"2024-08-16","c":"O4","f":"biweekly","r":362},{"n":"Holly Kotarski","d":"2024-08-19","c":"O4","f":"biweekly","r":339},{"n":"Nelson Cambata","d":"2024-08-20","c":"L2","f":"biweekly","r":426},{"n":"Judy  Lampe","d":"2024-08-21","c":"O4","f":"one_time"},{"n":"Angela Norris","d":"2024-08-22","c":"P1","f":"biweekly","r":349},{"n":"Maria Karafa","d":"2024-08-27","c":"P1","f":"biweekly","r":352},{"n":"Julie Shinew","d":"2024-08-28","c":"P3","f":"monthly","r":140},{"n":"Jennifer Arett","d":"2024-08-29","c":"P2","f":"weekly","r":585},{"n":"Jessica Daly","d":"2024-08-29","c":"L1","f":"biweekly","r":539},{"n":"Dana Leonard","d":"2024-08-30","c":"O4","f":"weekly","r":1066},{"n":"Dylan Rosenberg","d":"2024-08-30","c":"O4","f":"biweekly","r":456},{"n":"Nicole Salgado","d":"2024-09-03","c":"O4","f":"monthly","r":191},{"n":"Leigh Slayback","d":"2024-09-04","c":"O4","f":"biweekly","r":380},{"n":"Norina Burt","d":"2024-09-04","c":"P1","f":"monthly","r":165},{"n":"Kay Morris","d":"2024-09-09","c":"O5","f":"monthly","r":197},{"n":"Ryan Witt","d":"2024-09-09","c":"P1","f":"monthly","r":194},{"n":"Jay Murray","d":"2024-09-11","c":"O4","f":"monthly","r":144},{"n":"Kay Morris","d":"2024-09-11","c":"O5","f":"one_time"},{"n":"Kylie Dawes","d":"2024-09-11","c":"P1","f":"monthly","r":206},{"n":"Nae Desai","d":"2024-09-11","c":"Q2","f":"monthly","r":306},{"n":"Peggy Thomas","d":"2024-09-11","c":"O1","f":"one_time"},{"n":"Gail Filson","d":"2025-01-01","c":null,"f":"monthly"},{"n":"Joan Brendel","d":"2025-01-02","c":null,"f":"biweekly"},{"n":"Bella Mack","d":"2025-01-02","c":null,"f":"biweekly"},{"n":"Dasia Horn","d":"2025-01-06","c":null,"f":"monthly"},{"n":"Nichole York","d":"2025-01-06","c":null,"f":"biweekly"},{"n":"Susan Farrell","d":"2025-01-08","c":null,"f":"monthly"},{"n":"Roben-Marie Smith","d":"2025-01-09","c":null,"f":"monthly"},{"n":"Nicke Morris","d":"2025-01-10","c":null,"f":"monthly"},{"n":"Linda Messina","d":"2025-01-13","c":null,"f":"biweekly"},{"n":"Adam Winnicky","d":"2025-01-13","c":null,"f":"monthly"},{"n":"Addie Schoenberger","d":"2025-01-14","c":null,"f":"monthly"},{"n":"Kirsten Stroud","d":"2025-01-20","c":null,"f":"monthly"},{"n":"Melinda Andrisen","d":"2025-01-22","c":null,"f":"biweekly"},{"n":"Eileen Beniston","d":"2025-01-24","c":null,"f":"biweekly"},{"n":"Kelly Mountain","d":"2025-01-27","c":null,"f":"biweekly"},{"n":"Stephanie Valley","d":"2025-01-31","c":null,"f":"monthly"},{"n":"Ashley Filimon","d":"2025-02-06","c":null,"f":"biweekly"},{"n":"Angie Ritten","d":"2025-02-07","c":null,"f":"biweekly"},{"n":"Kathy Stark","d":"2025-02-14","c":null,"f":"biweekly"},{"n":"Tim DeWeese","d":"2025-02-19","c":null,"f":"biweekly"},{"n":"Lenore Egan","d":"2025-02-21","c":null,"f":"biweekly"},{"n":"John Himmelstein","d":"2025-02-24","c":null,"f":"biweekly"},{"n":"Emily Barnette","d":"2025-02-25","c":null,"f":"biweekly"},{"n":"Paul Budhai","d":"2025-02-27","c":null,"f":"biweekly"},{"n":"Kay Rademaker","d":"2025-02-28","c":null,"f":"monthly"},{"n":"Susan Miller","d":"2025-03-03","c":null,"f":"weekly"},{"n":"Kristi Naquin","d":"2025-03-03","c":null,"f":"biweekly"},{"n":"Elaine Haury","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Bailey O’Brien","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Robert Oldham","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Sharon Toole","d":"2025-03-11","c":null,"f":"biweekly"},{"n":"Malav Patel","d":"2025-03-12","c":null,"f":"monthly"},{"n":"Sheila Haufler","d":"2025-03-13","c":null,"f":"biweekly"},{"n":"Katie Eichenlaub","d":"2025-03-14","c":null,"f":"monthly"},{"n":"William Hilbrant","d":"2025-03-14","c":null,"f":"monthly"},{"n":"Sheila Volpicelli","d":"2025-03-14","c":null,"f":"biweekly"},{"n":"Amelia West","d":"2025-03-17","c":null,"f":"weekly"},{"n":"Brenda Geiger","d":"2025-03-20","c":null,"f":"biweekly"},{"n":"Carry Powell","d":"2025-03-21","c":null,"f":"weekly"},{"n":"Paul Aicher","d":"2025-03-24","c":null,"f":"biweekly"},{"n":"Gail Bell","d":"2025-03-24","c":null,"f":"monthly"},{"n":"Trecia & Ty Arrington","d":"2025-03-26","c":null,"f":"monthly"},{"n":"Ashley Foster","d":"2025-03-28","c":null,"f":"monthly"},{"n":"Tiara Baez","d":"2025-03-31","c":null,"f":"weekly"},{"n":"Judy Hays","d":"2025-04-03","c":null,"f":"biweekly"},{"n":"Teresa Mack","d":"2025-04-07","c":null,"f":"biweekly"},{"n":"Brett Galloway","d":"2025-04-08","c":null,"f":"monthly"},{"n":"Margaret Luke","d":"2025-04-09","c":null,"f":"biweekly"},{"n":"Kathleen Sampson","d":"2025-04-16","c":null,"f":"biweekly"},{"n":"Jennifer Couillard","d":"2025-04-18","c":null,"f":"monthly"},{"n":"Nathan Bernier","d":"2025-04-23","c":null,"f":"monthly"},{"n":"Pat Mcclellan","d":"2025-04-23","c":null,"f":"biweekly"},{"n":"Peggy Loos","d":"2025-04-25","c":null,"f":"monthly"},{"n":"Matt Wilson","d":"2025-04-28","c":null,"f":"biweekly"},{"n":"Desmond Larmer","d":"2025-04-29","c":null,"f":"biweekly"},{"n":"Gail Fifield","d":"2025-04-30","c":null,"f":"biweekly"},{"n":"Debbie Gayson","d":"2025-05-01","c":null,"f":"monthly"},{"n":"Andy Clark","d":"2025-05-02","c":null,"f":"monthly"},{"n":"Kathryn Franco","d":"2025-05-05","c":null,"f":"biweekly"},{"n":"Jennifer Harvey","d":"2025-05-05","c":null,"f":"monthly"},{"n":"Kailly Tonsberg","d":"2025-05-06","c":null,"f":"biweekly"},{"n":"Sheri Heckendorn","d":"2025-05-07","c":null,"f":"biweekly"},{"n":"Amanda Benson","d":"2025-05-08","c":null,"f":"monthly"},{"n":"Robin Freiberger","d":"2025-05-08","c":null,"f":"monthly"},{"n":"Jill Johnson","d":"2025-05-12","c":null,"f":"biweekly"},{"n":"Jorie Dicamillo","d":"2025-05-14","c":null,"f":"monthly"},{"n":"Tarah Sinclair","d":"2025-05-16","c":null,"f":"biweekly"},{"n":"Jill Knecht","d":"2025-05-20","c":null,"f":"monthly"},{"n":"Nicole Young","d":"2025-05-21","c":null,"f":"biweekly"},{"n":"Jane Comparato","d":"2025-05-22","c":null,"f":"monthly"},{"n":"Dan Koehler","d":"2025-05-22","c":null,"f":"monthly"},{"n":"Michael Ruff","d":"2025-05-22","c":null,"f":"biweekly"},{"n":"Dorothy Gibson","d":"2025-05-23","c":null,"f":"biweekly"},{"n":"Wes Smith","d":"2025-05-29","c":null,"f":"biweekly"},{"n":"Robert Hicks","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Brian Lewis","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Jack Surrette","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Trisha Rogers","d":"2025-06-03","c":null,"f":"monthly"},{"n":"Ashley Arends","d":"2025-06-05","c":null,"f":"monthly"},{"n":"Annie Ekstrom","d":"2025-06-10","c":null,"f":"monthly"},{"n":"Gayle Ewald","d":"2025-06-12","c":null,"f":"biweekly"},{"n":"Cindy Jackman","d":"2025-06-12","c":null,"f":"biweekly"},{"n":"Sima Tajik","d":"2025-06-17","c":null,"f":"biweekly"},{"n":"Glenn Bennett","d":"2025-06-19","c":null,"f":"weekly"},{"n":"Pat Iverson","d":"2025-06-20","c":null,"f":"monthly"},{"n":"Karen Hacker","d":"2025-06-26","c":null,"f":"biweekly"},{"n":"Maria Carver","d":"2025-06-30","c":null,"f":"monthly"},{"n":"Catherine Curry","d":"2025-06-30","c":null,"f":"biweekly"},{"n":"David Pierce","d":"2025-06-30","c":null,"f":"biweekly"},{"n":"Larry Buhl","d":"2025-07-01","c":null,"f":"biweekly"},{"n":"Sarah Larson","d":"2025-07-02","c":null,"f":"monthly"},{"n":"Robert Capko","d":"2025-07-07","c":null,"f":"monthly"},{"n":"Nancy Quick","d":"2025-07-07","c":null,"f":"biweekly"},{"n":"Lola Ferraiuolo","d":"2025-07-11","c":null,"f":"monthly"},{"n":"Jo-Ann Amaral","d":"2025-07-18","c":null,"f":"monthly"},{"n":"Rebecca Foley","d":"2025-08-11","c":null,"f":"monthly"}]

  const CODES_LOCAL = require('../lib/cancellationCodes')
  const insertCancel = db.prepare(`
    INSERT OR IGNORE INTO cancelled_clients
      (client_name, cancel_date, reason_code, reason_label, reason_category, frequency, revenue_lost_monthly, source)
    VALUES (?,?,?,?,?,?,?,'import')
  `)
  const insertFeedback = db.prepare(`
    INSERT OR IGNORE INTO client_feedback
      (client_name, feedback_date, rating, feedback_type, source)
    VALUES (?,?,?,'scorecard','import')
  `)
  const insertNurture = db.prepare(`
    INSERT OR IGNORE INTO client_nurture
      (cancelled_id, client_name, reason_code, cancel_date, next_contact)
    VALUES (?,?,?,?,?)
  `)

  const cancelTx = db.transaction(() => {
    for (const row of CANCELLATION_DATA) {
      const info = CODES_LOCAL[row.c] || { label: row.c, category: 'Other' }
      const result = insertCancel.run(row.n, row.d, row.c, info.label, info.category, row.f, row.r || null)
      results.cancellations++
      if (row.c?.startsWith('T') && result.lastInsertRowid) {
        const next = new Date(row.d); next.setDate(next.getDate() + 30)
        insertNurture.run(result.lastInsertRowid, row.n, row.c, row.d, next.toISOString().split('T')[0])
        results.nurture++
      }
    }
  })
  cancelTx()

  res.json({ ok: true, seeded: results })
})

module.exports = router
