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

  // Daily revenue sum from manual entries (entered on Entry page each day)
  const dailyRevRow = db.prepare(`
    SELECT COALESCE(SUM(daily_revenue), 0) AS total
    FROM manual_entries WHERE entry_date BETWEEN ? AND ? AND daily_revenue IS NOT NULL
  `).get(monthStart, monthEnd)

  // Revenue priority: daily entry sum (live) > invoice_revenue (lump-sum fallback) > legacy revenue
  const revenue = (dailyRevRow.total > 0)
    ? dailyRevRow.total
    : (ms?.invoice_revenue > 0 ? ms.invoice_revenue : (ms?.revenue > 0 ? ms.revenue : 0))

  // Cancellations (computed first — needed for recurring client auto-calc)
  const mcCancellations = db.prepare(`
    SELECT COUNT(*) AS total FROM maidcentral_events
    WHERE event_type='cancellation' AND event_date BETWEEN ? AND ?
  `).get(monthStart, monthEnd)

  // cancelled_clients table (Cancellations page) is the most accurate source.
  // Exclude 'Saved' outcomes — those clients stayed, so they don't count as cancellations.
  const ccCancellations = db.prepare(`
    SELECT COUNT(*) AS total FROM cancelled_clients
    WHERE cancel_date BETWEEN ? AND ?
      AND (save_outcome IS NULL OR save_outcome != 'Saved')
  `).get(monthStart, monthEnd)

  const cancellations = ccCancellations.total > 0
    ? ccCancellations.total
    : (ms?.cancellations ?? mcCancellations.total)

  // Recurring clients — find the most recent snapshot, then apply live deltas on top.
  // A snapshot in monthly_sales is treated as the starting-point baseline for that month;
  // we always add this month's new closes (lead_records) and subtract this month's
  // cancellations (cancelled_clients) so the count stays live without a manual update.
  const mcRecurring = db.prepare(`
    SELECT COUNT(DISTINCT client_id) AS total FROM maidcentral_events WHERE event_type='recurring_client'
  `).get()

  // Find the best baseline: current month snapshot > most recent prior snapshot > MC count
  const currentMonthSnap = ms?.recurring_clients ?? null
  const priorBaseline = currentMonthSnap == null
    ? db.prepare(`
        SELECT month, recurring_clients FROM monthly_sales
        WHERE recurring_clients IS NOT NULL AND month < ?
        ORDER BY month DESC LIMIT 1
      `).get(month)
    : null

  let baselineClients
  let recurringClientsEstimated = true

  if (currentMonthSnap != null) {
    // User explicitly set the count for this month — treat as exact, no deltas
    baselineClients = currentMonthSnap
    recurringClientsEstimated = false
  } else if (priorBaseline) {
    // Add closes & cancellations for all complete months between baseline and now
    const pastChanges = db.prepare(`
      SELECT
        COALESCE(SUM(leads_closed), 0) AS closed,
        COALESCE(SUM(cancellations), 0) AS cancelled
      FROM monthly_sales
      WHERE month > ? AND month < ?
    `).get(priorBaseline.month, month)
    baselineClients = priorBaseline.recurring_clients + pastChanges.closed - pastChanges.cancelled
  } else {
    baselineClients = mcRecurring.total
    recurringClientsEstimated = false // no baseline to estimate from
  }

  // Lead funnel: live counts from lead_records take priority over monthly_sales
  const leadCounts = db.prepare(`
    SELECT
      COUNT(*) AS leads_in,
      COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
      COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
      COUNT(CASE WHEN converted=1 AND LOWER(TRIM(COALESCE(frequency,''))) NOT IN ('one_type','one-time','one time','','priority','move out','ttb','general') THEN 1 END) AS recurring_closed,
      COUNT(CASE WHEN initial_clean_booked=1 THEN 1 END) AS initial_cleans_booked,
      COUNT(CASE WHEN initial_clean_booked=1 AND recurring_retained IS NOT NULL THEN 1 END) AS initial_cleans_with_outcome,
      COUNT(CASE WHEN initial_clean_booked=1 AND recurring_retained=1 THEN 1 END) AS initial_to_recurring
    FROM lead_records WHERE month = ?
  `).get(month)

  const leadsIn             = leadCounts.leads_in > 0 ? leadCounts.leads_in       : (ms?.leads_in     ?? 0)
  const leadsQuoted         = leadCounts.leads_in > 0 ? leadCounts.leads_quoted   : (ms?.leads_quoted ?? 0)
  const leadsClosed         = leadCounts.leads_in > 0 ? leadCounts.leads_closed   : (ms?.leads_closed ?? 0)
  const recurringClosed     = leadCounts.leads_in > 0 ? leadCounts.recurring_closed : (ms?.recurring_closed ?? 0)
  const initialCleansBooked      = leadCounts.initial_cleans_booked ?? 0
  const initialCleansWithOutcome = leadCounts.initial_cleans_with_outcome ?? 0
  const initialToRecurring       = leadCounts.initial_to_recurring  ?? 0

  // When no explicit snapshot is set, estimate by applying this month's live deltas
  const newClosesThisMonth = recurringClosed > 0 ? recurringClosed : leadsClosed
  const recurringClients = recurringClientsEstimated
    ? baselineClients + newClosesThisMonth - cancellations
    : baselineClients

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

  // Staff + daily skips
  const staffChanges = db.prepare(`
    SELECT
      COALESCE(SUM(new_hires), 0) AS new_hires,
      COALESCE(SUM(staff_quit), 0) AS quit,
      COALESCE(SUM(staff_fired), 0) AS fired,
      COALESCE(SUM(call_ins), 0) AS call_ins,
      COALESCE(SUM(skips), 0) AS skips_sum,
      COALESCE(SUM(gift_card_sales), 0) AS gift_card_sales
    FROM manual_entries WHERE entry_date BETWEEN ? AND ?
  `).get(monthStart, monthEnd)

  // If staff_terminations has records for this month, use them for quit/fired (more accurate)
  const termCountsMonth = db.prepare(`
    SELECT
      COUNT(CASE WHEN termination_type = 'quit'  THEN 1 END) AS quit,
      COUNT(CASE WHEN termination_type = 'fired' THEN 1 END) AS fired,
      COUNT(*) AS total
    FROM staff_terminations WHERE SUBSTR(termination_date,1,7) = ?
  `).get(month)
  const usingTerminationRecords = termCountsMonth.total > 0
  if (usingTerminationRecords) {
    staffChanges.quit  = termCountsMonth.quit
    staffChanges.fired = termCountsMonth.fired
  }

  // Estimated current headcount from baseline + hires − departures
  const headcountBaseline     = parseInt(cfg.staff_headcount_baseline) || null
  const headcountBaselineDate = cfg.staff_headcount_baseline_date || null
  let estimatedCurrentHeadcount = null
  if (headcountBaseline !== null && headcountBaselineDate) {
    const hiresAfter = db.prepare(
      `SELECT COALESCE(SUM(new_hires),0) AS n FROM manual_entries WHERE entry_date > ?`
    ).get(headcountBaselineDate).n
    const termsAfter = db.prepare(
      `SELECT COUNT(*) AS n FROM staff_terminations WHERE termination_date > ?`
    ).get(headcountBaselineDate).n
    estimatedCurrentHeadcount = headcountBaseline + hiresAfter - termsAfter
  }

  const lastEntry = db.prepare(
    'SELECT entry_date FROM manual_entries ORDER BY entry_date DESC, id DESC LIMIT 1'
  ).get()

  // Latest tech (RGE) count for dynamic daily goal
  const latestRGERow = db.prepare(`
    SELECT revenue_generating_employees FROM manual_entries
    WHERE revenue_generating_employees IS NOT NULL
    ORDER BY entry_date DESC, id DESC LIMIT 1
  `).get()
  const latestRGE = latestRGERow?.revenue_generating_employees ?? null
  const billingRate = parseFloat(cfg.billing_rate_per_rge) || 58
  const goalHours   = parseFloat(cfg.goal_hours) || 6.5
  const dynamicDailyGoal = latestRGE ? latestRGE * goalHours * billingRate : null

  const recurringAtStart = recurringClients + cancellations
  const attritionRate = recurringAtStart > 0 ? cancellations / recurringAtStart : 0

  res.json({
    month,
    revenue,
    recurring_clients: recurringClients,
    recurring_clients_estimated: recurringClientsEstimated,
    cancellations,
    attrition_rate: attritionRate,
    leads_in: leadsIn,
    leads_quoted: leadsQuoted,
    leads_closed: leadsClosed,
    recurring_closed: recurringClosed,
    lead_to_quote_rate: leadsIn > 0 ? leadsQuoted / leadsIn : null,
    quote_to_sale_rate: leadsQuoted > 0 ? leadsClosed / leadsQuoted : null,
    initial_cleans_booked: initialCleansBooked,
    initial_to_recurring: initialToRecurring,
    initial_to_recurring_rate: leadsClosed > 0 ? initialToRecurring / leadsClosed : null,
    initial_cleans: initialCleansWithOutcome > 0 ? initialCleansWithOutcome : (ms?.initial_cleans ?? 0),
    retained: initialCleansWithOutcome > 0 ? initialToRecurring : (ms?.retained ?? 0),
    skips: ms?.skips > 0 ? ms.skips : staffChanges.skips_sum,
    complaints: ms?.complaints ?? 0,
    marketing_spend: marketingSpend,
    staff: staffChanges,
    staff_using_termination_records: usingTerminationRecords,
    estimated_current_headcount: estimatedCurrentHeadcount,
    gift_card_sales_mtd: staffChanges.gift_card_sales || 0,
    last_entry_date: lastEntry?.entry_date || null,
    rge_count: latestRGE,
    dynamic_daily_goal: dynamicDailyGoal,
    goal_rate: billingRate,
    goal_hours: goalHours,
    settings: cfg,
  })
})

// GET /api/data/value-avgs?year=YYYY
// Returns actual per-record annual value averages from lead_records and cancelled_clients.
// Used by the Sales page to show real Value Gained / Value Lost when price+frequency data exists.
router.get('/value-avgs', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const yearStr = String(year)

  // Average annual value from converted recurring leads with stored price × frequency
  const gained = db.prepare(`
    SELECT
      AVG(annual_value) AS avg_annual,
      COUNT(*) AS n
    FROM lead_records
    WHERE converted = 1
      AND annual_value > 0
      AND LOWER(TRIM(COALESCE(frequency,''))) NOT IN ('one_type','one-time','one time','','priority','move out','ttb','general')
      AND month LIKE ?
  `).get(`${yearStr}-%`)

  // Average annual value lost from cancellations with stored annual_value_lost
  const lost = db.prepare(`
    SELECT
      AVG(annual_value_lost) AS avg_annual,
      COUNT(*) AS n
    FROM cancelled_clients
    WHERE annual_value_lost > 0
      AND SUBSTR(cancel_date, 1, 4) = ?
  `).get(yearStr)

  res.json({
    year: yearStr,
    avg_value_gained: gained?.avg_annual ?? null,
    avg_value_gained_count: gained?.n ?? 0,
    avg_value_lost: lost?.avg_annual ?? null,
    avg_value_lost_count: lost?.n ?? 0,
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

    // Daily revenue sum from Entry page
    const dailyRevRow = db.prepare(`
      SELECT COALESCE(SUM(daily_revenue), 0) AS total
      FROM manual_entries WHERE entry_date BETWEEN ? AND ? AND daily_revenue IS NOT NULL
    `).get(monthStart, monthEnd)

    // Revenue priority: daily entry sum (live) > invoice_revenue (lump-sum fallback) > legacy revenue
    const revenue = (dailyRevRow.total > 0)
      ? dailyRevRow.total
      : (ms?.invoice_revenue > 0 ? ms.invoice_revenue : (ms?.revenue > 0 ? ms.revenue : 0))

    // Lead counts from lead_records take priority over monthly_sales
    const mlc = db.prepare(`
      SELECT
        COUNT(*) AS leads_in,
        COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
        COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
        COUNT(CASE WHEN converted=1 AND LOWER(TRIM(COALESCE(frequency,''))) NOT IN ('one_type','one-time','one time','','priority','move out','ttb','general') THEN 1 END) AS recurring_closed,
        COUNT(CASE WHEN initial_clean_booked=1 THEN 1 END) AS initial_cleans_booked,
        COUNT(CASE WHEN initial_clean_booked=1 AND recurring_retained=1 THEN 1 END) AS initial_to_recurring
      FROM lead_records WHERE month = ?
    `).get(month)

    const mLeadsIn             = mlc.leads_in > 0 ? mlc.leads_in       : (ms?.leads_in     ?? 0)
    const mLeadsQuoted         = mlc.leads_in > 0 ? mlc.leads_quoted   : (ms?.leads_quoted ?? 0)
    const mLeadsClosed         = mlc.leads_in > 0 ? mlc.leads_closed   : (ms?.leads_closed ?? 0)
    const mRecurringClosed     = mlc.leads_in > 0 ? mlc.recurring_closed : (ms?.recurring_closed ?? 0)
    const mInitialCleansBooked = mlc.initial_cleans_booked ?? 0
    const mInitialToRecurring  = mlc.initial_to_recurring  ?? 0

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
      lead_to_quote_rate: mLeadsIn > 0 ? mLeadsQuoted / mLeadsIn : null,
      quote_to_sale_rate: mLeadsQuoted > 0 ? mLeadsClosed / mLeadsQuoted : null,
      initial_cleans_booked: mInitialCleansBooked,
      initial_to_recurring: mInitialToRecurring,
      initial_to_recurring_rate: mLeadsClosed > 0 ? mInitialToRecurring / mLeadsClosed : null,
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

  // YTD monthly_sales aggregates — prefer invoice_revenue per month when available
  const ytdSales = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN invoice_revenue > 0 THEN invoice_revenue ELSE revenue END), 0) AS revenue,
      COALESCE(SUM(marketing_spend), 0)  AS marketing_spend,
      COALESCE(SUM(leads_in), 0)         AS leads_in,
      COALESCE(SUM(leads_quoted), 0)     AS leads_quoted,
      COALESCE(SUM(leads_closed), 0)     AS leads_closed,
      COALESCE(SUM(recurring_closed), 0) AS recurring_closed,
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
      COUNT(CASE WHEN price_per_clean IS NOT NULL OR quote_amount IS NOT NULL THEN 1 END) AS leads_quoted,
      COUNT(CASE WHEN converted=1 THEN 1 END) AS leads_closed,
      COUNT(CASE WHEN converted=1 AND recurring_retained=1 THEN 1 END) AS recurring_closed
    FROM lead_records WHERE month LIKE ? AND month <= ?
  `).get(`${year}-%`, currentMonth)

  const ytdLeadsIn        = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.leads_in        : ytdSales.leads_in
  const ytdLeadsQuoted    = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.leads_quoted    : ytdSales.leads_quoted
  const ytdLeadsClosed    = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.leads_closed    : ytdSales.leads_closed
  const ytdRecurringClosed = ytdLeadCounts.leads_in > 0 ? ytdLeadCounts.recurring_closed : ytdSales.recurring_closed
  const ytdOneTimeClosed  = ytdLeadsClosed - ytdRecurringClosed

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

  // YTD cancellations: cancelled_clients is the primary source (same logic as /summary)
  // Excludes 'Saved' outcomes since those clients stayed
  const ccYTD = db.prepare(`
    SELECT COUNT(*) AS total FROM cancelled_clients
    WHERE SUBSTR(cancel_date,1,4) = ?
      AND (save_outcome IS NULL OR save_outcome != 'Saved')
  `).get(String(year))
  const ytdCancellations = ccYTD.total > 0 ? ccYTD.total : ytdSales.cancellations

  const attritionRate = (() => {
    const recurring = clientSnap.avg_clients || 0
    const cancels = ytdCancellations
    const atStart = recurring + cancels
    return atStart > 0 ? cancels / atStart / (ytdSales.months_with_data || 1) : null
  })()

  const avgLifetimeMonths = attritionRate > 0 ? 1 / attritionRate : null
  const ltv = avgRevenuePerClient && avgLifetimeMonths
    ? avgRevenuePerClient * avgLifetimeMonths
    : null

  const cpl = ytdLeadsIn > 0 && marketingSpend > 0
    ? marketingSpend / ytdLeadsIn
    : null

  const cpl_quoted = ytdLeadsQuoted > 0 && marketingSpend > 0
    ? marketingSpend / ytdLeadsQuoted
    : null

  const cac = ytdLeadsClosed > 0 && marketingSpend > 0
    ? marketingSpend / ytdLeadsClosed
    : null

  const cac_recurring = ytdRecurringClosed > 0 && marketingSpend > 0
    ? marketingSpend / ytdRecurringClosed
    : null

  const cac_onetime = ytdOneTimeClosed > 0 && marketingSpend > 0
    ? marketingSpend / ytdOneTimeClosed
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

  // Use staff_terminations for quit/fired YTD when records exist (same logic as /hiring endpoint)
  const termYTD = db.prepare(`
    SELECT
      COUNT(CASE WHEN termination_type = 'quit'  THEN 1 END) AS quit,
      COUNT(CASE WHEN termination_type = 'fired' THEN 1 END) AS fired,
      COUNT(*) AS total
    FROM staff_terminations WHERE SUBSTR(termination_date,1,4) = ?
  `).get(String(year))
  const ytdQuit  = termYTD.total > 0 ? termYTD.quit  : manualYTD.quit
  const ytdFired = termYTD.total > 0 ? termYTD.fired : manualYTD.fired

  const totalTurnover = ytdQuit + ytdFired
  const turnoverCostTotal = costOfTurnover ? costOfTurnover * totalTurnover : null

  res.json({
    year,
    ytd: {
      revenue: ytdSales.revenue,
      marketing_spend: marketingSpend,
      recruiting_spend: recruitingSpend,
      training_spend: trainingSpend,
      leads_in: ytdLeadsIn,
      leads_quoted: ytdLeadsQuoted,
      leads_closed: ytdLeadsClosed,
      recurring_closed: ytdRecurringClosed,
      one_time_closed: ytdOneTimeClosed,
      cancellations: ytdCancellations,
      new_hires: manualYTD.new_hires,
      quit: ytdQuit,
      fired: ytdFired,
      call_ins: manualYTD.call_ins,
      months_with_data: ytdSales.months_with_data,
    },
    metrics: {
      cpl,
      cpl_quoted,
      cac,
      cac_recurring,
      cac_onetime,
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
  // Check if staff_terminations table has any records this year — if so, use it for quit/fired
  const hasTerminationRecords = db.prepare(
    `SELECT COUNT(*) as n FROM staff_terminations WHERE SUBSTR(termination_date,1,4) = ?`
  ).get(String(year)).n > 0

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

    // If termination records exist for this year, use them for quit/fired (more accurate, per-name)
    let quit = entries.quit
    let fired = entries.fired
    let terminations = []
    if (hasTerminationRecords) {
      const t = db.prepare(`
        SELECT
          COUNT(CASE WHEN termination_type = 'quit'  THEN 1 END) AS quit,
          COUNT(CASE WHEN termination_type = 'fired' THEN 1 END) AS fired
        FROM staff_terminations
        WHERE SUBSTR(termination_date,1,7) = ?
      `).get(month)
      // Use terminations table counts (they override manual entry counts when present)
      quit  = t.quit
      fired = t.fired
      terminations = db.prepare(
        `SELECT id, employee_name, termination_type, termination_date, source, reason, notes
         FROM staff_terminations WHERE SUBSTR(termination_date,1,7) = ?
         ORDER BY termination_date DESC`
      ).all(month)
    }

    return {
      month,
      label: MONTH_SHORT[parseInt(m) - 1],
      new_hires: entries.new_hires,
      quit,
      fired,
      call_ins: entries.call_ins,
      net_change: entries.new_hires - quit - fired,
      avg_rge: entries.avg_rge ? Math.round(entries.avg_rge) : null,
      has_data: entries.entry_count > 0 || quit > 0 || fired > 0,
      terminations,
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

  // Headcount baseline for current-headcount estimation
  const headcountBaseline = parseInt(cfg.staff_headcount_baseline) || null
  const headcountBaselineDate = cfg.staff_headcount_baseline_date || null

  // Current headcount estimate: baseline + all hires since baseline_date - all terminations since
  let estimatedCurrentHeadcount = null
  if (headcountBaseline !== null && headcountBaselineDate) {
    const hiresAfter = db.prepare(
      `SELECT COALESCE(SUM(new_hires),0) AS n FROM manual_entries WHERE entry_date > ?`
    ).get(headcountBaselineDate).n
    const termsAfter = db.prepare(
      `SELECT COUNT(*) AS n FROM staff_terminations WHERE termination_date > ?`
    ).get(headcountBaselineDate).n
    estimatedCurrentHeadcount = headcountBaseline + hiresAfter - termsAfter
  }

  res.json({
    year,
    months: result,
    cost_per_turnover: costPerTurnover,
    recruiting_spend_ytd: recruitingSpendYTD,
    cost_per_hire: costPerHire,
    ytd_new_hires: ytdNewHires,
    headcount_baseline: headcountBaseline,
    headcount_baseline_date: headcountBaselineDate,
    estimated_current_headcount: estimatedCurrentHeadcount,
    using_termination_records: hasTerminationRecords,
    inputs: { training_hours: trainingHours, hourly_cost: hourlyCost, ramp_days: rampDays, break_even_daily: breakEvenDaily },
  })
})

module.exports = router
