/**
 * Historical data import — reads all spreadsheets and POSTs to the API.
 * Usage: node scripts/import-history.js [API_BASE_URL]
 * Default URL: https://brave-success-production-41ea.up.railway.app
 */
const xlsx = require('xlsx')
const path = require('path')

const API_BASE = process.argv[2] || 'https://brave-success-production-41ea.up.railway.app'
const DOWNLOADS = '/Users/user/Downloads'

async function post(endpoint, data) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${endpoint}: ${JSON.stringify(json)}`)
  return json
}

async function get(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`)
  return res.json()
}

const MONTH_NAMES = {
  january: '01', february: '02', febuary: '02', feb: '02',
  march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10',
  november: '11', december: '12',
}

function parseMonthCode(str) {
  const lower = str.toLowerCase()
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (lower.includes(name)) {
      const yr = str.match(/\d{4}/)?.[0]
      return yr ? `${yr}-${num}` : null
    }
  }
  return null
}

// Excel serial date → YYYY-MM-DD
function xlDate(v) {
  if (typeof v !== 'number') return null
  const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
  return d.toISOString().slice(0, 10)
}

// ─── CLIENT LOG SHEETS (leads/close/recurring by month) ───────────────────────
async function importLeadSheets(wb) {
  console.log('\n── Lead/Client Log Sheets ──')

  // Sheet name → month code
  const SHEETS = {
    'January 2026 Leads':  '2026-01',
    'February 2026 Leads': '2026-02',
    'Client log March 2026': '2026-03',
    'Client Log April 2026': '2026-04',
    'Client Log May 2026 ':  '2026-05',
  }

  for (const [sn, month] of Object.entries(SHEETS)) {
    const sheet = wb.Sheets[sn]
    if (!sheet) { console.log(`  ✗ ${month}: sheet not found`); continue }

    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })
    let leads = 0, quoted = 0, converted = 0, recurring = 0

    for (let i = 4; i < rows.length; i++) {
      const r = rows[i]
      if (!r) continue
      const date = r[0]
      if (!date) continue
      if (typeof date === 'string' && (
        date.toLowerCase().includes('date') ||
        date.toLowerCase().includes('highlight') ||
        date.toLowerCase().includes('instructions')
      )) continue
      leads++
      if (r[8] != null && r[8] !== '') quoted++
      const conv = r[10] ? String(r[10]).toLowerCase().trim() : ''
      if (conv === 'y' || conv === 'yes') converted++
      const rec = r[11] ? String(r[11]).toLowerCase().trim() : ''
      if (rec === 'y' || rec === 'yes') recurring++
    }

    try {
      await post('/api/sales', {
        month,
        leads_in: leads,
        leads_quoted: quoted,
        leads_closed: converted,
        recurring_closed: recurring,
      })
      console.log(`  ✓ ${month}  leads=${leads}  quoted=${quoted}  closed=${converted}  recurring=${recurring}`)
    } catch (e) {
      console.error(`  ✗ ${month}:`, e.message)
    }
  }
}

// ─── DAILY FOCUS SHEETS (daily RGE entries + monthly totals from Total column) ──
async function importDailyFocus(wb) {
  console.log('\n── Daily Focus Sheets ──')

  const SHEETS = {
    'Daily Focus January 2026': '2026-01',
    'Daily Focus Feb 2026':     '2026-02',
    'Daily Focus March 2026':   '2026-03',
    'Daily Focus April 2026':   '2026-04',
    'Daily Focus May 2026':     '2026-05',
  }

  // Row indices
  const R = {
    rec_clients:   1,
    leads:         2,
    leads_quoted:  3,
    leads_conv:    5,
    initial:       7,
    retained:      9,   // clients from initial who became recurring
    new_recurring: 11,
    absences:      13,
    complaints:    14,
    cancellations: 15,
    daily_rev:     20,
    rge:           27,
    marketing:     36,
  }

  const monthlyTotals = {}

  for (const [sn, monthCode] of Object.entries(SHEETS)) {
    const sheet = wb.Sheets[sn]
    if (!sheet) { console.log(`  ✗ ${monthCode}: sheet not found`); continue }

    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })
    const headerRow = rows[0] || []
    const totalCol = headerRow.length - 1  // last col = "Total"
    const [yr, mo] = monthCode.split('-').map(Number)
    const daysInMonth = new Date(yr, mo, 0).getDate()

    // ── Monthly totals from the spreadsheet's own Total column ──
    const num = (rowIdx) => {
      const v = rows[rowIdx]?.[totalCol]
      return typeof v === 'number' ? v : null
    }
    // For rec_clients use the last non-null value (end-of-month snapshot)
    const recClientsRow = rows[R.rec_clients] || []
    const lastRecClients = [...recClientsRow].reverse().find(v => typeof v === 'number') ?? null

    monthlyTotals[monthCode] = {
      leads_in:         num(R.leads),
      leads_quoted:     num(R.leads_quoted),
      leads_closed:     num(R.leads_conv),
      recurring_closed: num(R.new_recurring),
      initial_cleans:   num(R.initial),
      retained:         num(R.retained),
      complaints:       num(R.complaints),
      revenue:          num(R.daily_rev),
      marketing_spend:  num(R.marketing),
      recurring_clients: lastRecClients,
    }

    // ── Per-day manual_entries for RGE / absences ──
    let imported = 0
    for (let col = 3; col < headerRow.length - 1; col++) {
      const dayNum = headerRow[col]
      if (typeof dayNum !== 'number' || dayNum < 1 || dayNum > daysInMonth) continue

      const rge = rows[R.rge]?.[col]
      const abs = rows[R.absences]?.[col]
      const mkt = rows[R.marketing]?.[col]

      const hasData = (typeof rge === 'number' && rge > 0)
                   || (typeof abs === 'number' && abs > 0)
                   || (typeof mkt === 'number' && mkt > 0)
      if (!hasData) continue

      const entryDate = `${yr}-${String(mo).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
      try {
        await post('/api/entry/manual', {
          entry_date: entryDate,
          revenue_generating_employees: typeof rge === 'number' ? Math.round(rge) : null,
          absences: typeof abs === 'number' ? Math.round(abs * 2) / 2 : 0,
          marketing_spend: typeof mkt === 'number' && mkt > 0 ? mkt : null,
          entered_by: 'import',
        })
        imported++
      } catch (e) {
        console.error(`    ✗ ${entryDate}:`, e.message)
      }
    }

    const t = monthlyTotals[monthCode]
    console.log(`  ✓ ${monthCode}: ${imported} days  leads=${t.leads_in}  closed=${t.leads_closed}  retained=${t.retained}  rec_clients=${lastRecClients}  rev=$${t.revenue ?? 0}`)
  }

  return monthlyTotals
}

// ─── CANCELLATIONS SHEET (individual records → monthly counts) ─────────────────
async function importCancellationCounts(wb) {
  console.log('\n── Cancellations Sheet ──')
  const sheet = wb.Sheets['Cancellations']
  if (!sheet) { console.log('  ✗ Sheet not found'); return {} }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })
  const byMonth = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const dateStr = xlDate(r[0])
    if (!dateStr) continue
    const mo = dateStr.slice(0, 7)
    byMonth[mo] = (byMonth[mo] || 0) + 1
  }
  console.log('  Cancellations by month:', JSON.stringify(byMonth))
  return byMonth
}

// ─── BONUS TRACKER import ─────────────────────────────────────────────────────
async function importBonusRecords(repId, salesByMonth) {
  console.log('\n── Bonus Records (Sales Bonus Tracker) ──')

  const wb = xlsx.readFile(path.join(DOWNLOADS, 'Sales Bonus Tracker (1).xlsx'))
  const ONE_TIME_WORDS = ['one time', 'single', 'on demand', '1x', 'one-time']
  const WB_WORDS = ['weekly', 'biweekly', 'bi-weekly', 'bi weekly', 'every week', 'every 2']

  const accum = {}

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('template')) continue
    const monthCode = parseMonthCode(sheetName)
    if (!monthCode || monthCode.startsWith('2025')) continue

    const sheet = wb.Sheets[sheetName]
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })

    let headerIdx = -1
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      if (data[i]?.some(v => v && String(v).toLowerCase().includes('date sold'))) {
        headerIdx = i; break
      }
    }
    if (headerIdx === -1) continue

    const headers = data[headerIdx].map(h => h ? String(h).toLowerCase().trim() : '')
    const freqIdx = headers.findIndex(h => h.includes('frequency'))
    const paidIdx = headers.findIndex(h => h === 'paid')

    if (!accum[monthCode]) accum[monthCode] = { total: 0, recurring: 0, weekly_biweekly: 0 }

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i]
      if (!row?.[0] || row[0] === data[headerIdx][0]) continue
      if (typeof row[0] === 'string' && !row[0].match(/\d/)) continue
      if (paidIdx >= 0 && row[0] && data.length > 200 && i > 100 &&
          row[paidIdx] === false) continue

      accum[monthCode].total++

      const freq = freqIdx >= 0 && row[freqIdx]
        ? String(row[freqIdx]).toLowerCase().trim()
        : ''
      const isOneTime = ONE_TIME_WORDS.some(w => freq.includes(w)) || freq === ''
      if (!isOneTime) {
        accum[monthCode].recurring++
        if (WB_WORDS.some(w => freq.includes(w))) accum[monthCode].weekly_biweekly++
      }
    }
  }

  for (const [month, { total, recurring, weekly_biweekly }] of Object.entries(accum)) {
    if (total === 0) continue
    const sales = salesByMonth[month]
    const quotesGiven = sales?.leads_quoted || total

    try {
      const r = await post('/api/bonus/records', {
        rep_id: repId,
        month,
        quotes_given: quotesGiven,
        closed_sales: total,
        recurring_closed: recurring,
        weekly_biweekly_closed: weekly_biweekly,
      })
      const streak = r.quarterly_bonus ? ` + $${r.quarterly_bonus} streak bonus` : ''
      console.log(`  ✓ ${month}: ${total} sales (${recurring} recurring, ${weekly_biweekly} W/BW) → Tier ${r.tier}, $${r.bonus_amount}${streak}`)
    } catch (e) {
      console.error(`  ✗ ${month}:`, e.message)
    }
  }
}

// ─── HIRING DATA (2026 Snapshots MONTHLY sheet) ───────────────────────────────
async function importHiringData() {
  console.log('\n── Hiring Data (2026 Snapshots MONTHLY) ──')

  const SNAPSHOTS_FILE = path.join(DOWNLOADS, '2026 SNAPSHOTS DAILY WEEKLY MONTHLY... (2).xlsx')
  const wb = xlsx.readFile(SNAPSHOTS_FILE)
  const sheet = wb.Sheets['MONTHLY']
  if (!sheet) { console.log('  ✗ MONTHLY sheet not found'); return }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Header: col 0=label, cols 1-13=Week 1-4 through Week 49-52, col 14=totals
  // Map cols 1-12 → Jan-Dec (skip col 13, the week 49-52 overflow)
  const ROW = { new_hires: 30, quit_fired: 32, call_ins: 31 }

  for (let i = 0; i < 12; i++) {
    const col = i + 1
    const month = String(i + 1).padStart(2, '0')
    const entryDate = `2026-${month}-01`

    const newHires  = rows[ROW.new_hires]?.[col]
    const quitFired = rows[ROW.quit_fired]?.[col]
    const callIns   = rows[ROW.call_ins]?.[col]

    const hasData = (typeof newHires === 'number' && newHires > 0)
                 || (typeof quitFired === 'number' && quitFired > 0)
                 || (typeof callIns === 'number' && callIns > 0)
    if (!hasData) continue

    try {
      await post('/api/entry/manual', {
        entry_date: entryDate,
        new_hires:  typeof newHires === 'number'  ? Math.round(newHires)  : 0,
        staff_quit: typeof quitFired === 'number' ? Math.round(quitFired) : 0,
        staff_fired: 0,
        call_ins:   typeof callIns === 'number'   ? callIns               : 0,
        entered_by: 'snapshot',
      })
      console.log(`  ✓ 2026-${month}: hires=${Math.round(newHires || 0)}  exits=${Math.round(quitFired || 0)}  call_ins=${callIns || 0}`)
    } catch (e) {
      console.error(`  ✗ 2026-${month}:`, e.message)
    }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Importing to: ${API_BASE}\n`)

  // Get Lexi's rep ID
  const reps = await get('/api/bonus/reps')
  const lexi = reps.find(r => r.name.toLowerCase().includes('lexi'))
  if (!lexi) {
    console.error('ERROR: Could not find Lexi in sales reps. Add her in the Bonus Tracker tab first.')
    process.exit(1)
  }
  console.log(`Found rep: ${lexi.name} (id=${lexi.id})`)

  // Load the client logs tracker (new, richer file)
  const clientWb = xlsx.readFile(path.join(DOWNLOADS, 'Client logs_Tracker 2026 (2).xlsx'))

  // 1. Lead counts from client log sheets (most accurate)
  await importLeadSheets(clientWb)

  // 2. Daily entries + monthly totals from Daily Focus sheets
  const dailyTotals = await importDailyFocus(clientWb)

  // 3. Cancellation counts from the Cancellations sheet
  const cancByMonth = await importCancellationCounts(clientWb)

  // 4. Patch monthly_sales with recurring_clients + cancellations + revenue from daily focus
  //    Merge with existing data so leads/close counts from step 1 are preserved
  console.log('\n── Patching monthly_sales with Daily Focus totals ──')
  const existingSales = await get('/api/sales?limit=12')
  const existingByMonth = Object.fromEntries(existingSales.map(s => [s.month, s]))

  for (const [month, totals] of Object.entries(dailyTotals)) {
    const existing = existingByMonth[month] || {}
    const merged = {
      month,
      leads_in:         totals.leads_in         ?? existing.leads_in         ?? 0,
      leads_quoted:     totals.leads_quoted      ?? existing.leads_quoted     ?? 0,
      leads_closed:     totals.leads_closed      ?? existing.leads_closed     ?? 0,
      recurring_closed: totals.recurring_closed  ?? existing.recurring_closed ?? 0,
      initial_cleans:   totals.initial_cleans    ?? existing.initial_cleans   ?? 0,
      retained:         totals.retained          ?? existing.retained         ?? 0,
      complaints:       totals.complaints        ?? existing.complaints       ?? 0,
      move_out_cleans:  existing.move_out_cleans || 0,
      skips:            existing.skips           || 0,
      recurring_clients: totals.recurring_clients ?? existing.recurring_clients ?? null,
      cancellations:    cancByMonth[month]        ?? existing.cancellations   ?? 0,
      revenue:          totals.revenue            ?? existing.revenue         ?? 0,
      marketing_spend:  totals.marketing_spend    ?? existing.marketing_spend ?? null,
    }
    try {
      await post('/api/sales', merged)
      console.log(`  ✓ ${month}: rec_clients=${merged.recurring_clients}  canc=${merged.cancellations}  rev=$${merged.revenue}`)
    } catch (e) {
      console.error(`  ✗ ${month}:`, e.message)
    }
  }

  // 5. Bonus records (use updated monthly sales data for quotes_given)
  const salesData = await get('/api/sales?limit=12')
  const salesByMonth = Object.fromEntries(salesData.map(s => [s.month, s]))
  await importBonusRecords(lexi.id, salesByMonth)

  // 6. Hiring data from 2026 Snapshots MONTHLY sheet
  await importHiringData()

  console.log('\n✅ Import complete!')
}

main().catch(err => { console.error('\n❌ Import failed:', err.message); process.exit(1) })
