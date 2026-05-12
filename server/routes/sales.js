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
    leads_in,
    leads_quoted,
    leads_closed,
    recurring_closed,
    initial_cleans,
    retained,
    cancellations,
    skips,
    complaints,
    revenue,
    marketing_spend,
    recurring_clients,
    move_out_cleans,
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
      rep_name          = COALESCE(excluded.rep_name,          rep_name),
      leads_in          = COALESCE(excluded.leads_in,          leads_in),
      leads_quoted      = COALESCE(excluded.leads_quoted,      leads_quoted),
      leads_closed      = COALESCE(excluded.leads_closed,      leads_closed),
      recurring_closed  = COALESCE(excluded.recurring_closed,  recurring_closed),
      initial_cleans    = COALESCE(excluded.initial_cleans,    initial_cleans),
      retained          = COALESCE(excluded.retained,          retained),
      cancellations     = COALESCE(excluded.cancellations,     cancellations),
      skips             = COALESCE(excluded.skips,             skips),
      complaints        = COALESCE(excluded.complaints,        complaints),
      revenue           = COALESCE(excluded.revenue,           revenue),
      marketing_spend   = COALESCE(excluded.marketing_spend,   marketing_spend),
      recurring_clients = COALESCE(excluded.recurring_clients, recurring_clients),
      move_out_cleans   = COALESCE(excluded.move_out_cleans,   move_out_cleans),
      notes             = COALESCE(excluded.notes,             notes),
      updated_at        = datetime('now')
  `).run(
    month, rep_name ?? null,
    leads_in ?? null, leads_quoted ?? null, leads_closed ?? null, recurring_closed ?? null,
    initial_cleans ?? null, retained ?? null, cancellations ?? null, skips ?? null, complaints ?? null,
    revenue ?? null, marketing_spend ?? null, recurring_clients ?? null, move_out_cleans ?? null, notes ?? null
  )

  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description) VALUES ('upsert', 'monthly_sales', ?)`
  ).run(`Sales summary for ${month}`)

  res.json({ ok: true, month })
})

module.exports = router
