const express = require('express')
const router = express.Router()
const db = require('../db')

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

// GET /api/reports/snapshot?type=monthly|weekly&date=YYYY-MM-DD
router.get('/snapshot', (req, res) => {
  const { type = 'monthly', date } = req.query

  let startDate, endDate, label
  const refDate = date ? new Date(date + 'T12:00:00Z') : new Date()

  if (type === 'custom') {
    const { startDate: sd, endDate: ed } = req.query
    if (!sd || !ed) return res.status(400).json({ error: 'startDate and endDate required for custom range' })
    startDate = sd
    endDate   = ed
    const s = new Date(sd + 'T12:00:00Z')
    const e = new Date(ed + 'T12:00:00Z')
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' }
    label = `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  } else if (type === 'weekly') {
    const end = new Date(refDate)
    const start = new Date(refDate)
    start.setUTCDate(start.getUTCDate() - 6)
    startDate = start.toISOString().split('T')[0]
    endDate   = end.toISOString().split('T')[0]
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' }
    label = `Week of ${start.toLocaleDateString('en-US', opts)}–${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  } else {
    const y = refDate.getUTCFullYear()
    const m = refDate.getUTCMonth()
    startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`
    endDate   = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0]
    label = `${MONTH_NAMES[m]} ${y}`
  }

  const leads = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL OR initial_clean_price IS NOT NULL THEN 1 END) AS quoted,
      COUNT(CASE WHEN converted=1 THEN 1 END) AS converted,
      COUNT(CASE WHEN initial_clean_booked=1 THEN 1 END) AS initial_clean_booked,
      COUNT(CASE WHEN recurring_retained=1 AND (cancelled_after_initial IS NULL OR cancelled_after_initial=0) THEN 1 END) AS recurring_retained
    FROM lead_records
    WHERE record_date BETWEEN ? AND ?
  `).get(startDate, endDate)

  const cancellations = db.prepare(`
    SELECT COUNT(*) AS n FROM cancelled_clients
    WHERE cancel_date BETWEEN ? AND ?
      AND (save_outcome IS NULL OR save_outcome != 'Saved')
  `).get(startDate, endDate).n

  const recurringClients = parseInt(
    db.prepare("SELECT value FROM settings WHERE key='recurring_clients_current'").get()?.value || '0'
  ) || null

  let marketingSpend = 0
  try {
    marketingSpend = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM qb_transactions
      WHERE txn_date BETWEEN ? AND ?
    `).get(startDate, endDate).total || 0
  } catch (_) {}

  const grossSales = db.prepare(`
    SELECT COALESCE(SUM(daily_revenue), 0) AS total FROM manual_entries
    WHERE entry_date BETWEEN ? AND ?
  `).get(startDate, endDate).total || 0

  const billingRate = parseFloat(
    db.prepare("SELECT value FROM settings WHERE key='billing_rate_per_rge'").get()?.value || '58'
  )

  let hiring = { inquiries: 0, interviews_booked: 0, no_shows: 0, showed_up: 0, offers: 0, accepted: 0, started: 0 }
  try {
    const h = db.prepare(`
      SELECT
        COUNT(*) AS inquiries,
        COUNT(CASE WHEN stage IN ('interview_scheduled','interview_complete','offered','hired') THEN 1 END) AS interviews_booked,
        COUNT(CASE WHEN no_show=1 THEN 1 END) AS no_shows,
        COUNT(CASE WHEN stage IN ('interview_complete','offered','hired') AND no_show=0 THEN 1 END) AS showed_up,
        COUNT(CASE WHEN stage IN ('offered','hired') THEN 1 END) AS offers,
        COUNT(CASE WHEN stage = 'hired' OR hired=1 THEN 1 END) AS accepted,
        COUNT(CASE WHEN hired=1 AND hire_date IS NOT NULL THEN 1 END) AS started
      FROM hiring_pipeline
      WHERE (stage_date BETWEEN ? AND ?)
         OR (stage_date IS NULL AND date(created_at) BETWEEN ? AND ?)
    `).get(startDate, endDate, startDate, endDate)
    hiring = h
  } catch (_) {}

  res.json({
    ok: true,
    type,
    label,
    startDate,
    endDate,
    leads,
    cancellations,
    recurringClients,
    marketingSpend,
    grossSales,
    billingRate,
    hiring,
  })
})

module.exports = router
