const express = require('express')
const router = express.Router()
const db = require('../db')

// GET all monthly sales records — enriched with live data from lead_records + cancelled_clients
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 36)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Build a list of months that either have a monthly_sales row OR have lead_records data
  const msRows = db.prepare(`SELECT * FROM monthly_sales ORDER BY month DESC LIMIT ?`).all(limit)
  const msMap = Object.fromEntries(msRows.map(r => [r.month, r]))

  // Months with lead activity not already in monthly_sales
  const leadsMonths = db.prepare(`
    SELECT DISTINCT month FROM lead_records
    WHERE month <= ? ORDER BY month DESC LIMIT ?
  `).all(currentMonth, limit)

  const allMonths = Array.from(new Set([
    ...msRows.map(r => r.month),
    ...leadsMonths.map(r => r.month),
  ])).sort((a, b) => b.localeCompare(a)).slice(0, limit)

  const enriched = allMonths.map(month => {
    const row = msMap[month] || { month }
    const [y, m] = month.split('-')
    const monthStart = `${y}-${m}-01`
    const monthEnd   = `${y}-${m}-31`

    // Cancellations: prefer cancelled_clients (most accurate, excludes saved)
    const ccCancel = db.prepare(`
      SELECT COUNT(*) AS total FROM cancelled_clients
      WHERE cancel_date BETWEEN ? AND ?
        AND (save_outcome IS NULL OR save_outcome != 'Saved')
    `).get(monthStart, monthEnd)

    // Lead funnel from lead_records
    const lc = db.prepare(`
      SELECT
        COUNT(*) AS leads_in,
        COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
        COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
        COUNT(CASE WHEN converted=1 AND LOWER(TRIM(COALESCE(frequency,''))) NOT IN
          ('one_type','one-time','one time','','priority','move out','ttb','general') THEN 1 END) AS recurring_closed,
        COUNT(CASE WHEN initial_clean_booked=1 THEN 1 END) AS initial_with_outcome,
        COUNT(CASE WHEN recurring_retained=1 AND (cancelled_after_initial IS NULL OR cancelled_after_initial=0) THEN 1 END) AS initial_retained
      FROM lead_records WHERE month = ?
    `).get(month)

    // Skips from manual_entries if not in monthly_sales
    const skipsRow = db.prepare(`
      SELECT COALESCE(SUM(skips),0) AS total FROM manual_entries
      WHERE entry_date BETWEEN ? AND ?
    `).get(monthStart, monthEnd)

    // Daily revenue sum from Entry page entries for this month
    const dailyRevRow = db.prepare(`
      SELECT COALESCE(SUM(daily_revenue), 0) AS total
      FROM manual_entries WHERE entry_date BETWEEN ? AND ? AND daily_revenue IS NOT NULL
    `).get(monthStart, monthEnd)
    const revenue = dailyRevRow.total > 0
      ? dailyRevRow.total
      : (row.invoice_revenue > 0 ? row.invoice_revenue : (row.revenue ?? 0))

    return {
      ...row,
      revenue,
      invoice_revenue: dailyRevRow.total > 0 ? dailyRevRow.total : (row.invoice_revenue ?? 0),
      cancellations: ccCancel.total > 0 ? ccCancel.total : (row.cancellations ?? 0),
      leads_in:         lc.leads_in > 0 ? lc.leads_in         : (row.leads_in         ?? 0),
      leads_quoted:     lc.leads_in > 0 ? lc.leads_quoted     : (row.leads_quoted     ?? 0),
      leads_closed:     lc.leads_in > 0 ? lc.leads_closed     : (row.leads_closed     ?? 0),
      recurring_closed: lc.leads_in > 0 ? lc.recurring_closed : (row.recurring_closed ?? 0),
      initial_cleans:   lc.initial_with_outcome > 0 ? lc.initial_with_outcome : (row.initial_cleans ?? 0),
      retained:         lc.initial_with_outcome > 0 ? lc.initial_retained     : (row.retained      ?? 0),
      skips:            (row.skips ?? 0) > 0 ? row.skips : skipsRow.total,
    }
  })

  res.json(enriched)
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
    invoice_revenue,
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
       revenue, invoice_revenue, marketing_spend, recurring_clients, move_out_cleans, notes, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
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
      invoice_revenue   = COALESCE(excluded.invoice_revenue,   invoice_revenue),
      marketing_spend   = COALESCE(excluded.marketing_spend,   marketing_spend),
      recurring_clients = COALESCE(excluded.recurring_clients, recurring_clients),
      move_out_cleans   = COALESCE(excluded.move_out_cleans,   move_out_cleans),
      notes             = COALESCE(excluded.notes,             notes),
      updated_at        = datetime('now')
  `).run(
    month, rep_name ?? null,
    leads_in ?? null, leads_quoted ?? null, leads_closed ?? null, recurring_closed ?? null,
    initial_cleans ?? null, retained ?? null, cancellations ?? null, skips ?? null, complaints ?? null,
    revenue ?? null, invoice_revenue ?? null, marketing_spend ?? null, recurring_clients ?? null,
    move_out_cleans ?? null, notes ?? null
  )

  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description) VALUES ('upsert', 'monthly_sales', ?)`
  ).run(`Sales summary for ${month}`)

  res.json({ ok: true, month })
})

module.exports = router
