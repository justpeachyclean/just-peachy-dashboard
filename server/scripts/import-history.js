/**
 * Historical data import — reads all 3 spreadsheets and POSTs to the API.
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
  january: '01', february: '02', febuary: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
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

// ─── MONTHLY SHEET import ────────────────────────────────────────────────────
async function importMonthlySales(wb) {
  console.log('\n── Monthly Sales (MONTHLY sheet) ──')
  const sheet = wb.Sheets['MONTHLY']
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Row indices confirmed from inspection:
  const R = {
    total_recurring: 6, leads_in: 7, leads_quoted: 8, leads_closed: 9,
    cancellations: 11, skips: 12, move_out_cleans: 15,
    initial_cleans: 16, retained: 17,
    revenue: 22, marketing_spend: 23,
    interviews: 27, showed_up: 28, job_offers: 29,
    new_hires: 30, call_ins: 31, quit_fired: 32,
  }

  // Columns: 1=Jan, 2=Feb, 3=Mar … 12=Dec
  for (let col = 1; col <= 12; col++) {
    const month = `2026-${String(col).padStart(2, '0')}`
    const n = (r) => {
      const v = rows[r]?.[col]
      return typeof v === 'number' ? v : 0
    }

    const leads_in = n(R.leads_in)
    const revenue = n(R.revenue)
    if (leads_in === 0 && revenue === 0) continue // no data for this month

    const payload = {
      month,
      leads_in,
      leads_quoted: n(R.leads_quoted),
      leads_closed: n(R.leads_closed),
      recurring_closed: 0, // filled in from bonus tracker
      initial_cleans: n(R.initial_cleans),
      move_out_cleans: n(R.move_out_cleans),
      retained: n(R.retained),
      cancellations: n(R.cancellations),
      skips: n(R.skips),
      recurring_clients: n(R.total_recurring),
      revenue,
      marketing_spend: n(R.marketing_spend) || null,
    }

    try {
      await post('/api/sales', payload)
      console.log(`  ✓ ${month}  leads=${leads_in}  rev=$${revenue.toLocaleString()}`)
    } catch (e) {
      console.error(`  ✗ ${month}:`, e.message)
    }
  }
}

// ─── DAILY FOCUS sheets import ───────────────────────────────────────────────
async function importDailyEntries(wb) {
  console.log('\n── Daily Entries (Daily Focus sheets) ──')

  // Row indices confirmed from inspection:
  const ROW_ABSENCES = 13
  const ROW_RGE = 27
  const ROW_MARKETING = 36

  for (const sheetName of wb.SheetNames) {
    if (!sheetName.toLowerCase().startsWith('daily focus')) continue

    const monthCode = parseMonthCode(sheetName)
    if (!monthCode) continue

    const sheet = wb.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })

    const [yr, mo] = monthCode.split('-').map(Number)
    const daysInMonth = new Date(yr, mo, 0).getDate()

    // Row 0 has day numbers in columns 3+ (col D onwards)
    const dayRow = rows[0] || []
    let imported = 0

    for (let c = 3; c < dayRow.length; c++) {
      const day = dayRow[c]
      if (typeof day !== 'number' || day < 1 || day > daysInMonth) continue

      const rge = rows[ROW_RGE]?.[c]
      const absences = rows[ROW_ABSENCES]?.[c]
      const mkt = rows[ROW_MARKETING]?.[c]

      const hasData = (typeof rge === 'number' && rge > 0) ||
                      (typeof absences === 'number' && absences > 0) ||
                      (typeof mkt === 'number' && mkt > 0)
      if (!hasData) continue

      const entryDate = `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      try {
        await post('/api/entry/manual', {
          entry_date: entryDate,
          revenue_generating_employees: typeof rge === 'number' ? Math.round(rge) : null,
          absences: typeof absences === 'number' ? Math.round(absences) : 0,
          marketing_spend: typeof mkt === 'number' && mkt > 0 ? mkt : null,
          entered_by: 'import',
        })
        imported++
      } catch (e) {
        console.error(`    ✗ ${entryDate}:`, e.message)
      }
    }
    console.log(`  ✓ ${monthCode} (${sheetName.replace('Daily Focus ', '')}): ${imported} days imported`)
  }
}

// ─── BONUS TRACKER import ─────────────────────────────────────────────────────
async function importBonusRecords(repId, salesByMonth) {
  console.log('\n── Bonus Records (Sales Bonus Tracker) ──')

  const wb = xlsx.readFile(path.join(DOWNLOADS, 'Sales Bonus Tracker (1).xlsx'))
  const ONE_TIME_WORDS = ['one time', 'single', 'on demand', '1x', 'one-time']

  // Accumulate across Recurring + One Time sheets for the same month
  const accum = {}

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('template')) continue
    const monthCode = parseMonthCode(sheetName)
    if (!monthCode || monthCode.startsWith('2025')) continue

    const sheet = wb.Sheets[sheetName]
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null })

    // Find header row
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

    if (!accum[monthCode]) accum[monthCode] = { total: 0, recurring: 0 }

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i]
      if (!row?.[0] || row[0] === data[headerIdx][0]) continue // skip blank/dup header
      // Skip template empty rows (no date value)
      if (typeof row[0] === 'string' && !row[0].match(/\d/)) continue
      if (paidIdx >= 0 && row[0] && data.length > 200 && i > 100 &&
          row[paidIdx] === false) continue // skip unfilled template rows in Dec sheet

      accum[monthCode].total++

      const freq = freqIdx >= 0 && row[freqIdx]
        ? String(row[freqIdx]).toLowerCase().trim()
        : ''
      const isOneTime = ONE_TIME_WORDS.some(w => freq.includes(w)) || freq === ''
      if (!isOneTime) accum[monthCode].recurring++
    }
  }

  // Post one bonus record per month
  for (const [month, { total, recurring }] of Object.entries(accum)) {
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
      })
      const streak = r.quarterly_bonus ? ` + $${r.quarterly_bonus} streak bonus` : ''
      console.log(`  ✓ ${month}: ${total} sales (${recurring} recurring) → Tier ${r.tier}, $${r.bonus_amount}${streak}`)
    } catch (e) {
      console.error(`  ✗ ${month}:`, e.message)
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

  // Load integrated tracker
  const wb = xlsx.readFile(path.join(DOWNLOADS, '2026_Business_Tracker_INTEGRATED.xlsx'))

  // 1. Monthly sales
  await importMonthlySales(wb)

  // 2. Daily entries
  await importDailyEntries(wb)

  // 3. Bonus records (needs monthly sales data for quotes_given)
  const salesData = await get('/api/sales?limit=12')
  const salesByMonth = Object.fromEntries(salesData.map(s => [s.month, s]))
  await importBonusRecords(lexi.id, salesByMonth)

  console.log('\n✅ Import complete!')
}

main().catch(err => { console.error('\n❌ Import failed:', err.message); process.exit(1) })
