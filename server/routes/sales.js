const express = require('express')
const router = express.Router()
const db = require('../db')

// GET all monthly sales records (most recent first)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 36)
  const rows = db.prepare(
    `SELECT * FROM monthly_sales ORDER BY month DESC LIMIT ?`
  ).all(limit)
  res.json(rows)
})

// GET one month
router.get('/:month', (req, res) => {
  const row = db.prepare('SELECT * FROM monthly_sales WHERE month = ?').get(req.params.month)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

// POST or update a month's sales summary
router.post('/', (req, res) => {
  const {
    month,
    rep_name,
    leads_in = 0,
    leads_quoted = 0,
    leads_closed = 0,
    recurring_closed = 0,
    initial_cleans = 0,
    retained = 0,
    cancellations = 0,
    skips = 0,
    complaints = 0,
    revenue = 0,
    marketing_spend,
    recurring_clients,
    move_out_cleans = 0,
    notes,
  } = req.body

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month required (YYYY-MM)' })
  }

  db.prepare(`
    INSERT INTO monthly_sales
      (month, rep_name, leads_in, leads_quoted, leads_closed, recurring_closed,
       initial_cleans, retained, cancellations, skips, complaints,
       revenue, marketing_spend, recurring_clients, move_out_cleans, notes, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(month) DO UPDATE SET
      rep_name          = excluded.rep_name,
      leads_in          = excluded.leads_in,
      leads_quoted      = excluded.leads_quoted,
      leads_closed      = excluded.leads_closed,
      recurring_closed  = excluded.recurring_closed,
      initial_cleans    = excluded.initial_cleans,
      retained          = excluded.retained,
      cancellations     = excluded.cancellations,
      skips             = excluded.skips,
      complaints        = excluded.complaints,
      revenue           = excluded.revenue,
      marketing_spend   = excluded.marketing_spend,
      recurring_clients = excluded.recurring_clients,
      move_out_cleans   = excluded.move_out_cleans,
      notes             = excluded.notes,
      updated_at        = datetime('now')
  `).run(
    month, rep_name ?? null, leads_in, leads_quoted, leads_closed, recurring_closed,
    initial_cleans, retained, cancellations, skips, complaints,
    revenue, marketing_spend ?? null, recurring_clients ?? null, move_out_cleans, notes ?? null
  )

  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description) VALUES ('upsert', 'monthly_sales', ?)`
  ).run(`Sales summary for ${month}`)

  res.json({ ok: true, month })
})

module.exports = router
