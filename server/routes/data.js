const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/data/summary  — current-month KPIs
router.get('/summary', (req, res) => {
  const now = new Date()
  const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, mon] = month.split('-')
  const monthStart = `${year}-${mon}-01`
  const monthEnd   = `${year}-${mon}-31`

  const settings = db.prepare('SELECT key, value FROM settings').all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))

  // Pull from monthly_sales first (manual summary), fallback to webhook events
  const ms = db.prepare('SELECT * FROM monthly_sales WHERE month = ?').get(month)

  // Revenue: monthly_sales > maidcentral events
  const mcRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM maidcentral_events WHERE event_type='revenue' AND event_date BETWEEN ? AND ?
  `).get(monthStart, monthEnd)

  const revenue = ms?.revenue > 0 ? ms.revenue : mcRevenue.total

  // Recurring clients
  const mcRecurring = db.prepare(`
    SELECT COUNT(DISTINCT client_id) AS total FROM maidcentral_events WHERE event_type='recurring_client'
  `).get()
  const recurringClients = ms?.recurring_clients ?? mcRecurring.total

  // Cancellations
  const mcCancellations = db.prepare(`
    SELECT COUNT(*) AS total FROM maidcentral_events
    WHERE event_type='cancellation' AND event_date BETWEEN ? AND ?
  `).get(monthStart, monthEnd)
  const cancellations = ms?.cancellations ?? mcCancellations.total

  // Lead funnel: live counts from lead_records take priority over monthly_sales
  const leadCounts = db.prepare(`
    SELECT
      COUNT(*) AS leads_in,
      COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
      COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
      COUNT(CASE WHEN converted=1 AND frequency NOT IN ('one_time','one-time','one time','') THEN 1 END) AS recurring_closed
    FROM lead_records WHERE month = ?
  `).get(month)

  const leadsIn       = leadCounts.leads_in > 0 ? leadCounts.leads_in       : (ms?.leads_in     ?? 0)
  const leadsQuoted   = leadCounts.leads_in > 0 ? leadCounts.leads_quoted   : (ms?.leads_quoted ?? 0)
  const leadsClosed   = leadCounts.leads_in > 0 ? leadCounts.leads_closed   : (ms?.leads_closed ?? 0)
  const recurringClosed = leadCounts.leads_in > 0 ? leadCounts.recurring_closed : (ms?.recurring_closed ?? 0)

  // Marketing spend: QB > monthly_sales > manual entries
  const qbMarketing = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM quickbooks_expenses
    WHERE month = ? AND category = ?
  `).get(month, cfg.qb_marketing_category || 'Advertising')

  const manualMarketing = db.prepare(`
    SELECT COALESCE(SUM(marketing_spend), 0) AS total FROM manual_entries
    WHERE entry_date BETWEEN ? AND ? AND marketing_spend IS NOT NULL
  `).get(monthStart, monthEnd)

  const marketingSpend = qbMarketing.total > 0 ? qbMarketing.total
    : ms?.marketing_spend ?? manualMarketing.total

  // Staff
  const staffChanges = db.prepare(`
    SELECT
      COALESCE(SUM(new_hires), 0) AS new_hires,
      COALESCE(SUM(staff_quit), 0) AS quit,
      COALESCE(SUM(staff_fired), 0) AS fired,
      COALESCE(SUM(call_ins), 0) AS call_ins
    FROM manual_entries WHERE entry_date BETWEEN ? AND ?
  `).get(monthStart, monthEnd)

  const lastEntry = db.prepare(
    'SELECT entry_date FROM manual_entries ORDER BY entry_date DESC, id DESC LIMIT 1'
  ).get()

  const recurringAtStart = recurringClients + cancellations
  const attritionRate = recurringAtStart > 0 ? cancellations / recurringAtStart : 0

  res.json({
    month,
    revenue,
    recurring_clients: recurringClients,
    cancellations,
    attrition_rate: attritionRate,
    leads_in: leadsIn,
    leads_quoted: leadsQuoted,
    leads_closed: leadsClosed,
    recurring_closed: recurringClosed,
    initial_cleans: ms?.initial_cleans ?? 0,
    retained: ms?.retained ?? 0,
    skips: ms?.skips ?? 0,
    complaints: ms?.complaints ?? 0,
    marketing_spend: marketingSpend,
    staff: staffChanges,
    last_entry_date: lastEntry?.entry_date || null,
    settings: cfg,
  })
})

// GET /api/data/monthly?year=2026  — 12-month rollup for charts
router.get('/monthly', (req, res) => {
  const year = req.query.year || new Date().getFullYear()

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const settings = db.prepare('SELECT key, value FROM settings').all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))
  const fallbackDailyGoal = parseFloat(cfg.daily_goal) || 0
  const billingRate = parseFloat(cfg.billing_rate_per_rge) || 0
  const goalHours = parseFloat(cfg.goal_hours) || 0
  const stretchHours = parseFloat(cfg.stretch_hours) || 0

  const result = months.map(month => {
    const ms = db.prepare('SELECT * FROM monthly_sales WHERE month = ?').get(month)
    const [y, m] = month.split('-')
    const daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate()
    const [monthStart, monthEnd] = [`${y}-${m}-01`, `${y}-${m}-31`]

    // Dynamic goal from avg RGE × rate × hours; fall back to fixed daily_goal
    const rgeRow = db.prepare(`
      SELECT AVG(revenue_generating_employees) AS avg_rge
      FROM manual_entries
      WHERE entry_date BETWEEN ? AND ? AND revenue_generating_employees IS NOT NULL
    `).get(monthStart, monthEnd)
    const avgRge = rgeRow?.avg_rge || 0

    const monthlyGoal = avgRge && billingRate && goalHours
      ? Math.round(avgRge * goalHours * billingRate * daysInMonth)
      : fallbackDailyGoal * daysInMonth

    const monthlyStretch = avgRge && billingRate && stretchHours
      ? Math.round(avgRge * stretchHours * billingRate * daysInMonth)
      : null

    // Fallback to webhook events if no manual summary
    const mcRev = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total FROM maidcentral_events
      WHERE event_type='revenue' AND event_date BETWEEN ? AND ?
    `).get(monthStart, monthEnd)

    const revenue = ms?.revenue > 0 ? ms.revenue : mcRev.total

    // Lead counts from lead_records take priority over monthly_sales
    const mlc = db.prepare(`
      SELECT
        COUNT(*) AS leads_in,
        COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
        COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
        COUNT(CASE WHEN converted=1 AND frequency NOT IN ('one_time','one-time','one time','') THEN 1 END) AS recurring_closed
      FROM lead_records WHERE month = ?
    `).get(month)

    const mLeadsIn       = mlc.leads_in > 0 ? mlc.leads_in       : (ms?.leads_in     ?? 0)
    const mLeadsQuoted   = mlc.leads_in > 0 ? mlc.leads_quoted   : (ms?.leads_quoted ?? 0)
    const mLeadsClosed   = mlc.leads_in > 0 ? mlc.leads_closed   : (ms?.leads_closed ?? 0)
    const mRecurringClosed = mlc.leads_in > 0 ? mlc.recurring_closed : (ms?.recurring_closed ?? 0)

    const closeRate = mLeadsQuoted > 0
      ? mLeadsClosed / mLeadsQuoted
      : null

    const recurringRatio = mLeadsClosed > 0
      ? mRecurringClosed / mLeadsClosed
      : null

    return {
      month,
      label: MONTH_SHORT[parseInt(m) - 1],
      revenue,
      goal: monthlyGoal,
      stretch_goal: monthlyStretch,
      avg_rge: avgRge ? Math.round(avgRge * 10) / 10 : null,
      leads_in: mLeadsIn,
      leads_quoted: mLeadsQuoted,
      leads_closed: mLeadsClosed,
      recurring_closed: mRecurringClosed,
      initial_cleans: ms?.initial_cleans ?? 0,
      move_out_cleans: ms?.move_out_cleans ?? 0,
      retained: ms?.retained ?? 0,
      cancellations: ms?.cancellations ?? 0,
      skips: ms?.skips ?? 0,
      close_rate: closeRate,
      recurring_ratio: recurringRatio,
      marketing_spend: ms?.marketing_spend ?? 0,
      recurring_clients: ms?.recurring_clients ?? null,
    }
  })

  res.json(result)
})

// GET /api/data/audit
router.get('/audit', (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all()
  res.json(rows)
})

// GET /api/data/economics?year=2026  — unit economics aggregates
router.get('/economics', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const settings = db.prepare('SELECT key, value FROM settings').all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))

  // YTD monthly_sales aggregates
  const ytdSales = db.prepare(`
    SELECT
      COALESCE(SUM(revenue), 0)          AS revenue,
      COALESCE(SUM(marketing_spend), 0)  AS marketing_spend,
      COALESCE(SUM(leads_in), 0)         AS leads_in,
      COALESCE(SUM(leads_closed), 0)     AS leads_closed,
      COALESCE(SUM(cancellations), 0)    AS cancellations,
      COALESCE(SUM(initial_cleans), 0)   AS initial_cleans,
      COALESCE(SUM(retained), 0)         AS retained,
      COUNT(*) AS months_with_data
    FROM monthly_sales WHERE month LIKE ? AND month <= ?
  `).get(`${year}-%`, currentMonth)

  // YTD lead counts from lead_records (takes priority over monthly_sales)
  const ytdLeadCounts = db.prepare(`
    SELECT
      COUNT(*) AS leads_in,
      COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed
    FROM lead_records WHERE month LIKE ? AND month <= ?
  `).get(`${year}-%`, currentMonth)

  const ytdLeadsIn     = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.leads_in     : ytdSales.leads_in
  const ytdLeadsClosed = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.leads_closed : ytdSales.leads_closed

  // Avg recurring clients across months that have a snapshot
  const clientSnap = db.prepare(`
    SELECT AVG(recurring_clients) AS avg_clients
    FROM monthly_sales WHERE month LIKE ? AND month <= ? AND recurring_clients IS NOT NULL
  `).get(`${year}-%`, currentMonth)

  // Manual entries YTD: RGE, hires, quit, fired, call-ins, marketing spend
  const [y] = [year]
  const manualYTD = db.prepare(`
    SELECT
      COALESCE(AVG(revenue_generating_employees), 0) AS avg_rge,
      COALESCE(SUM(new_hires), 0)                    AS new_hires,
      COALESCE(SUM(staff_quit), 0)                   AS quit,
      COALESCE(SUM(staff_fired), 0)                  AS fired,
      COALESCE(SUM(call_ins), 0)                     AS call_ins,
      COALESCE(SUM(marketing_spend), 0)              AS marketing_spend,
      COUNT(*) AS entry_count
    FROM manual_entries WHERE entry_date LIKE ?
  `).get(`${year}-%`)

  // QuickBooks YTD
  const qbYTD = db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) AS total
    FROM quickbooks_expenses WHERE month LIKE ? GROUP BY category
  `).all(`${year}-%`)
  const qb = Object.fromEntries(qbYTD.map(r => [r.category, r.total]))

  const mktCategory = cfg.qb_marketing_category || 'Advertising'
  const recruitCategory = cfg.qb_recruiting_category || 'Recruiting'
  const trainCategory = cfg.qb_training_category || 'Training'

  // Marketing spend: prefer QB > manual entries > monthly_sales manual
  const marketingSpend = (qb[mktCategory] || 0) > 0
    ? qb[mktCategory]
    : manualYTD.marketing_spend > 0
      ? manualYTD.marketing_spend
      : ytdSales.marketing_spend

  const recruitingSpend = qb[recruitCategory] || 0
  const trainingSpend = qb[trainCategory] || 0

  // Derived metrics
  const avgRevenuePerClient = clientSnap.avg_clients > 0
    ? ytdSales.revenue / ytdSales.months_with_data / clientSnap.avg_clients
    : null

  const attritionRate = (() => {
    const recurring = clientSnap.avg_clients || 0
    const cancels = ytdSales.cancellations
    const atStart = recurring + cancels
    return atStart > 0 ? cancels / atStart / ytdSales.months_with_data : null
  })()

  const avgLifetimeMonths = attritionRate > 0 ? 1 / attritionRate : null
  const ltv = avgRevenuePerClient && avgLifetimeMonths
    ? avgRevenuePerClient * avgLifetimeMonths
    : null

  const cpl = ytdLeadsIn > 0 && marketingSpend > 0
    ? marketingSpend / ytdLeadsIn
    : null

  const cac = ytdLeadsClosed > 0 && marketingSpend > 0
    ? marketingSpend / ytdLeadsClosed
    : null

  const ltvCacRatio = ltv && cac ? ltv / cac : null

  const trainingHours = parseFloat(cfg.avg_training_hours) || null
  const hourlyCost = parseFloat(cfg.avg_hourly_labor_cost) || null
  const rampDays = parseFloat(cfg.avg_ramp_up_days) || null
  const breakEvenDaily = parseFloat(cfg.break_even_daily) || null
  const dailyGoal = parseFloat(cfg.daily_goal) || null

  const trainingCostPerHire = trainingHours && hourlyCost ? trainingHours * hourlyCost : null
  const rampUpLostRevenue = rampDays && breakEvenDaily ? rampDays * breakEvenDaily : null
  const costOfTurnover = trainingCostPerHire && rampUpLostRevenue
    ? trainingCostPerHire + rampUpLostRevenue + recruitingSpend
    : null

  const avgRGE = manualYTD.avg_rge > 0 ? manualYTD.avg_rge : null
  const revenuePerRGE = avgRGE && ytdSales.revenue > 0 && ytdSales.months_with_data > 0
    ? ytdSales.revenue / ytdSales.months_with_data / avgRGE
    : null

  const totalTurnover = manualYTD.quit + manualYTD.fired
  const turnoverCostTotal = costOfTurnover ? costOfTurnover * totalTurnover : null

  res.json({
    year,
    ytd: {
      revenue: ytdSales.revenue,
      marketing_spend: marketingSpend,
      recruiting_spend: recruitingSpend,
      training_spend: trainingSpend,
      leads_in: ytdLeadsIn,
      leads_closed: ytdLeadsClosed,
      cancellations: ytdSales.cancellations,
      new_hires: manualYTD.new_hires,
      quit: manualYTD.quit,
      fired: manualYTD.fired,
      call_ins: manualYTD.call_ins,
      months_with_data: ytdSales.months_with_data,
    },
    metrics: {
      cpl,
      cac,
      ltv,
      ltv_cac_ratio: ltvCacRatio,
      avg_revenue_per_client: avgRevenuePerClient,
      avg_lifetime_months: avgLifetimeMonths,
      attrition_rate: attritionRate,
      revenue_per_rge: revenuePerRGE,
      training_cost_per_hire: trainingCostPerHire,
      ramp_up_lost_revenue: rampUpLostRevenue,
      cost_of_turnover: costOfTurnover,
      turnover_cost_total: turnoverCostTotal,
    },
    inputs: {
      break_even_daily: breakEvenDaily,
      daily_goal: dailyGoal,
      training_hours: trainingHours,
      hourly_cost: hourlyCost,
      ramp_days: rampDays,
    },
  })
})

// GET /api/data/hiring?year=2026  — monthly staffing aggregates
router.get('/hiring', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const settings = db.prepare('SELECT key, value FROM settings').all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const result = months.map(month => {
    const [y, m] = month.split('-')
    const start = `${y}-${m}-01`
    const end = `${y}-${m}-31`

    const entries = db.prepare(`
      SELECT
        COALESCE(SUM(new_hires), 0)    AS new_hires,
        COALESCE(SUM(staff_quit), 0)   AS quit,
        COALESCE(SUM(staff_fired), 0)  AS fired,
        COALESCE(SUM(call_ins), 0)     AS call_ins,
        COUNT(*) AS entry_count,
        AVG(revenue_generating_employees) AS avg_rge
      FROM manual_entries WHERE entry_date BETWEEN ? AND ?
    `).get(start, end)

    return {
      month,
      label: MONTH_SHORT[parseInt(m) - 1],
      new_hires: entries.new_hires,
      quit: entries.quit,
      fired: entries.fired,
      call_ins: entries.call_ins,
      net_change: entries.new_hires - entries.quit - entries.fired,
      avg_rge: entries.avg_rge ? Math.round(entries.avg_rge) : null,
      has_data: entries.entry_count > 0,
    }
  })

  const trainingHours = parseFloat(cfg.avg_training_hours) || null
  const hourlyCost = parseFloat(cfg.avg_hourly_labor_cost) || null
  const rampDays = parseFloat(cfg.avg_ramp_up_days) || null
  const breakEvenDaily = parseFloat(cfg.break_even_daily) || null

  const trainingCostPerHire = trainingHours && hourlyCost ? trainingHours * hourlyCost : null
  const rampUpCost = rampDays && breakEvenDaily ? rampDays * breakEvenDaily : null
  const costPerTurnover = trainingCostPerHire && rampUpCost ? trainingCostPerHire + rampUpCost : null

  // Recruiting spend from QB expenses
  const recruitCategory = cfg.qb_recruiting_category || 'Recruiting'
  const recruitingSpendYTD = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM quickbooks_expenses WHERE month LIKE ? AND category = ?
  `).get(`${year}-%`, recruitCategory).total || 0

  const ytdNewHires = result.reduce((sum, m) => sum + m.new_hires, 0)
  const costPerHire = ytdNewHires > 0 && recruitingSpendYTD > 0
    ? Math.round(recruitingSpendYTD / ytdNewHires)
    : null

  res.json({
    year,
    months: result,
    cost_per_turnover: costPerTurnover,
    recruiting_spend_ytd: recruitingSpendYTD,
    cost_per_hire: costPerHire,
    ytd_new_hires: ytdNewHires,
    inputs: { training_hours: trainingHours, hourly_cost: hourlyCost, ramp_days: rampDays, break_even_daily: breakEvenDaily },
  })
})

module.exports = router
