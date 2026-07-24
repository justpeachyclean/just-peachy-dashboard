const db = require('../db')

const ONE_TIME_FREQS = new Set([
  'one_time','one-time','one time','ttb','general','priority',
  'move out','move in','move out clean','move in clean',
  'vacation clean','post construction','pcc','vc',
])

/**
 * Recalculate bonus records for all active reps for the given month(s).
 * Safe to call after any lead change — skips months that are already paid.
 * @param {string|string[]} months - YYYY-MM or array of YYYY-MM
 */
function calcBonusForMonths(months) {
  const monthList = Array.isArray(months) ? [...new Set(months)] : [months]
  const reps = db.prepare('SELECT * FROM sales_reps WHERE active=1').all()

  for (const month of monthList) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) continue

    const [year, mon] = month.split('-')
    const monthStart = `${year}-${mon}-01`
    const monthEnd   = `${year}-${mon}-31`

    const cancelledThisMonth = db.prepare(`
      SELECT LOWER(TRIM(client_name)) AS name FROM cancelled_clients
      WHERE cancel_date BETWEEN ? AND ?
        AND (save_outcome IS NULL OR save_outcome != 'Saved')
    `).all(monthStart, monthEnd).map(r => r.name)
    const cancelledSet = new Set(cancelledThisMonth)

    for (const rep of reps) {
      const leads = db.prepare(`
        SELECT client_name, record_date, converted, recurring_retained, frequency,
               price_per_clean, quote_amount, is_flex, is_current_client,
               month, converted_date, recurring_converted_date, cancelled_after_initial
        FROM lead_records
        WHERE rep_name = ? COLLATE NOCASE
          AND (
            month = ?
            OR (converted = 1 AND converted_date IS NOT NULL AND SUBSTR(converted_date, 1, 7) = ?)
            OR (recurring_retained = 1 AND recurring_converted_date IS NOT NULL AND SUBSTR(recurring_converted_date, 1, 7) = ?)
          )
      `).all(rep.name, month, month, month)

      let quotes_given = 0, closed_sales = 0, recurring_closed = 0, weekly_biweekly_closed = 0
      const seenQuotes    = new Set()
      const seenClose     = new Set()
      const seenRecurring = new Set()

      for (const l of leads) {
        if (l.is_flex || l.is_current_client) continue
        const nameKey = (l.client_name || '').toLowerCase().trim()

        if (l.month === month && (l.price_per_clean != null || l.quote_amount != null) && !seenQuotes.has(nameKey)) {
          seenQuotes.add(nameKey)
          quotes_given++
        }
        if (l.converted) {
          const closeMonth = l.converted_date ? l.converted_date.slice(0, 7) : l.month
          if (closeMonth === month && !seenClose.has(nameKey)) {
            seenClose.add(nameKey)
            closed_sales++
          }
        }
        if (l.recurring_retained) {
          if (cancelledSet.has(nameKey)) continue
          if (l.cancelled_after_initial) continue
          const freqKey = (l.frequency || '').toLowerCase().trim()
          const recurringMonth = l.recurring_converted_date
            ? l.recurring_converted_date.slice(0, 7)
            : l.converted_date ? l.converted_date.slice(0, 7) : l.month
          if (recurringMonth === month && !seenRecurring.has(nameKey)) {
            seenRecurring.add(nameKey)
            recurring_closed++
            if (['weekly','biweekly','bi-weekly'].includes(freqKey)) weekly_biweekly_closed++
          }
        }
      }

      if (quotes_given === 0 && closed_sales === 0) continue

      const closeRate      = quotes_given > 0    ? closed_sales           / quotes_given    : 0
      const recurringRatio = recurring_closed > 0 ? weekly_biweekly_closed / recurring_closed : 0

      let tier = 0, bonus_amount = 0
      if (closeRate >= 0.40) {
        if (recurringRatio >= 0.75)      { tier = 3; bonus_amount = 700 }
        else if (recurringRatio >= 0.50) { tier = 2; bonus_amount = 400 }
        else                             { tier = 1; bonus_amount = 200 }
      }

      // Payout month = 2 months after qualifying month
      const [y, m] = month.split('-').map(Number)
      const payoutDate = new Date(y, m + 1, 1)
      const payout_month = `${payoutDate.getFullYear()}-${String(payoutDate.getMonth() + 1).padStart(2, '0')}`

      // Check quarterly streak bonus (2 prior months at same tier or higher)
      const prior2 = db.prepare(`
        SELECT month, tier FROM bonus_records
        WHERE rep_id = ? AND month < ? AND tier >= ?
        ORDER BY month DESC LIMIT 2
      `).all(rep.id, month, tier > 0 ? tier : 1)

      let quarterly_bonus = 0
      if (tier >= 2 && prior2.length === 2 && prior2.every(r => r.tier >= tier)) {
        quarterly_bonus = tier === 3 ? 500 : 250
      }

      db.prepare(`
        INSERT INTO bonus_records
          (rep_id, month, quotes_given, closed_sales, recurring_closed, weekly_biweekly_closed,
           close_rate, recurring_ratio, tier, bonus_amount, quarterly_bonus, payout_month, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(rep_id, month) DO UPDATE SET
          quotes_given           = excluded.quotes_given,
          closed_sales           = excluded.closed_sales,
          recurring_closed       = excluded.recurring_closed,
          weekly_biweekly_closed = excluded.weekly_biweekly_closed,
          close_rate             = excluded.close_rate,
          recurring_ratio        = excluded.recurring_ratio,
          tier                   = excluded.tier,
          bonus_amount           = excluded.bonus_amount,
          quarterly_bonus        = excluded.quarterly_bonus,
          payout_month           = excluded.payout_month,
          updated_at             = datetime('now')
        WHERE status != 'paid'
      `).run(
        rep.id, month, quotes_given, closed_sales, recurring_closed, weekly_biweekly_closed,
        closeRate, recurringRatio, tier, bonus_amount, quarterly_bonus, payout_month
      )
    }
  }
}

module.exports = { calcBonusForMonths }
