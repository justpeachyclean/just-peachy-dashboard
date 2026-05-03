const express = require('express')
const router = express.Router()
const db = require('../db')

// ── Sales Reps ─────────────────────────────────────────────────────────────

// GET /api/bonus/reps
router.get('/reps', (req, res) => {
  const rows = db.prepare('SELECT * FROM sales_reps ORDER BY active DESC, name').all()
  res.json(rows)
})

// POST /api/bonus/reps
router.post('/reps', (req, res) => {
  const { name, email, start_date, end_date, active = 1 } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const result = db.prepare(`
    INSERT INTO sales_reps (name, email, active, start_date, end_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email ?? null, active, start_date ?? null, end_date ?? null)
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/bonus/reps/:id
router.patch('/reps/:id', (req, res) => {
  const { name, email, active, start_date, end_date } = req.body
  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(req.params.id)
  if (!rep) return res.status(404).json({ error: 'Not found' })
  db.prepare(`
    UPDATE sales_reps SET name=?, email=?, active=?, start_date=?, end_date=?
    WHERE id=?
  `).run(
    name ?? rep.name,
    email ?? rep.email,
    active !== undefined ? active : rep.active,
    start_date ?? rep.start_date,
    end_date ?? rep.end_date,
    req.params.id
  )
  res.json({ ok: true })
})

// ── Bonus Records ──────────────────────────────────────────────────────────

// GET /api/bonus/records?year=2026
router.get('/records', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const rows = db.prepare(`
    SELECT br.*, sr.name as rep_name, sr.active as rep_active
    FROM bonus_records br
    JOIN sales_reps sr ON br.rep_id = sr.id
    WHERE br.month LIKE ?
    ORDER BY br.month DESC, sr.name
  `).all(`${year}-%`)
  res.json(rows)
})

// POST /api/bonus/records  — upsert a bonus record for rep+month
router.post('/records', (req, res) => {
  const {
    rep_id,
    month,
    quotes_given = 0,
    closed_sales = 0,
    recurring_closed = 0,
    status = 'pending',
    paid_date,
  } = req.body

  if (!rep_id || !month) return res.status(400).json({ error: 'rep_id and month required' })
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })

  const close_rate = quotes_given > 0 ? closed_sales / quotes_given : 0
  const recurring_ratio = closed_sales > 0 ? recurring_closed / closed_sales : 0

  // Tier logic
  let tier = 0
  let bonus_amount = 0
  if (close_rate >= 0.4) {
    if (recurring_ratio >= 0.75) { tier = 3; bonus_amount = 700 }
    else if (recurring_ratio >= 0.5) { tier = 2; bonus_amount = 400 }
    else { tier = 1; bonus_amount = 200 }
  }

  // Payout month = 2 months after qualifying month (m is 1-12; Date month is 0-11)
  const [y, m] = month.split('-').map(Number)
  const payoutDateFixed = new Date(y, m + 1, 1) // m is 1-based → m+1 skips 2 months in 0-based
  const pm = String(payoutDateFixed.getMonth() + 1).padStart(2, '0')
  const py = payoutDateFixed.getFullYear()
  const payout_month = `${py}-${pm}`

  // Check for quarterly streak bonus
  // Look back 2 prior months to see if all 3 reach same tier
  const prior2 = db.prepare(`
    SELECT month, tier FROM bonus_records
    WHERE rep_id = ? AND month < ? AND tier >= ?
    ORDER BY month DESC LIMIT 2
  `).all(rep_id, month, tier > 0 ? tier : 1)

  let quarterly_bonus = 0
  if (tier >= 2 && prior2.length === 2) {
    const allSameTier = prior2.every(r => r.tier >= tier)
    if (allSameTier) {
      quarterly_bonus = tier === 3 ? 500 : 250
    }
  }

  db.prepare(`
    INSERT INTO bonus_records
      (rep_id, month, quotes_given, closed_sales, recurring_closed,
       close_rate, recurring_ratio, tier, bonus_amount, quarterly_bonus,
       payout_month, status, paid_date, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(rep_id, month) DO UPDATE SET
      quotes_given     = excluded.quotes_given,
      closed_sales     = excluded.closed_sales,
      recurring_closed = excluded.recurring_closed,
      close_rate       = excluded.close_rate,
      recurring_ratio  = excluded.recurring_ratio,
      tier             = excluded.tier,
      bonus_amount     = excluded.bonus_amount,
      quarterly_bonus  = excluded.quarterly_bonus,
      payout_month     = excluded.payout_month,
      status           = excluded.status,
      paid_date        = excluded.paid_date,
      updated_at       = datetime('now')
  `).run(
    rep_id, month, quotes_given, closed_sales, recurring_closed,
    close_rate, recurring_ratio, tier, bonus_amount, quarterly_bonus,
    payout_month, status, paid_date ?? null
  )

  res.json({ ok: true, tier, bonus_amount, quarterly_bonus, payout_month, close_rate, recurring_ratio })
})

// PATCH /api/bonus/records/pay  — mark a record as paid
router.patch('/records/pay', (req, res) => {
  const { rep_id, month, paid_date } = req.body
  if (!rep_id || !month) return res.status(400).json({ error: 'rep_id and month required' })
  db.prepare(`
    UPDATE bonus_records SET status='paid', paid_date=?, updated_at=datetime('now')
    WHERE rep_id=? AND month=?
  `).run(paid_date || new Date().toISOString().slice(0, 10), rep_id, month)
  res.json({ ok: true })
})

// GET /api/bonus/payout-calendar  — pending payouts in next 6 months
router.get('/payout-calendar', (req, res) => {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 1)
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`

  const rows = db.prepare(`
    SELECT br.*, sr.name as rep_name
    FROM bonus_records br
    JOIN sales_reps sr ON br.rep_id = sr.id
    WHERE br.payout_month BETWEEN ? AND ?
      AND br.status != 'paid'
      AND sr.active = 1
      AND (br.bonus_amount + br.quarterly_bonus) > 0
    ORDER BY br.payout_month, sr.name
  `).all(start, end)

  res.json(rows)
})

module.exports = router
