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

module.exports = router
