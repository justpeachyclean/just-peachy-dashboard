/**
 * Date helpers — all outputs anchored to America/New_York (Eastern).
 * Use these instead of new Date().toISOString() for anything user-visible.
 */

const TZ = 'America/New_York'

/** Today's date in YYYY-MM-DD, Eastern time */
export function todayEastern() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/**
 * Format a UTC SQLite timestamp ("2026-05-08 14:30:00") to a human-readable
 * Eastern date+time string, e.g. "May 8, 2026, 10:30 AM".
 */
export function fmtTimestamp(utcStr) {
  if (!utcStr) return '—'
  // SQLite stores "YYYY-MM-DD HH:MM:SS" — append Z to treat as UTC
  const iso = utcStr.replace(' ', 'T') + (utcStr.includes('T') ? '' : 'Z')
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Format a date string (YYYY-MM-DD) as "May 8, 2026".
 * These are stored without time, so no tz conversion needed — just pretty-print.
 */
export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(y, m - 1, d))
}

/**
 * Days until a YYYY-MM-DD date from today (Eastern).
 * Negative = overdue.
 */
export function daysUntilEastern(dateStr) {
  if (!dateStr) return null
  const [ty, tm, td] = todayEastern().split('-').map(Number)
  const [dy, dm, dd] = dateStr.split('-').map(Number)
  const todayMs = Date.UTC(ty, tm - 1, td)
  const targetMs = Date.UTC(dy, dm - 1, dd)
  return Math.ceil((targetMs - todayMs) / 864e5)
}

/**
 * Days since a YYYY-MM-DD date from today (Eastern).
 * Positive = N days ago.
 */
export function daysSinceEastern(dateStr) {
  if (!dateStr) return null
  const until = daysUntilEastern(dateStr)
  return until === null ? null : -until
}
