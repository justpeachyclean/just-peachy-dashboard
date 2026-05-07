/**
 * Import cancelled clients from:
 *   1. "Cancelled Service Sets" xlsx — 2024 data with reasons + scorecards
 *   2. "Cancelled clients" CSV — 2025 data
 */
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const db = require('../db')
const CODES = require('../lib/cancellationCodes')

// Map MC free-text reasons to standardized codes
const REASON_MAP = {
  'moving':                             'L1',
  'price':                              'P1',
  'poor cleaning':                      'Q2',
  'extended absence':                   'T1',
  'use as needed':                      'P3',
  'other':                              'O4',
  'breakage':                           'O5',
  'unhappy-something other than cleaning': 'C2',
  'personal housekeeper':               'P2',
  'non-payment':                        'P4',
  'sick':                               'L2',
  'customer abusive':                   'O1',
}

function mapReason(raw) {
  if (!raw) return { code: null, label: null, category: null }
  const key = raw.toLowerCase().trim()
  const code = REASON_MAP[key] || null
  if (!code) return { code: null, label: raw, category: null }
  const info = CODES[code]
  return { code, label: info?.label || raw, category: info?.category || null }
}

function parseDate(raw) {
  if (!raw) return null
  // Handle M/D/YYYY or MM/DD/YYYY
  const parts = String(raw).split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return `${y.trim()}-${m.trim().padStart(2, '0')}-${d.trim().padStart(2, '0')}`
  }
  // Handle Excel serial date numbers
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw)
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
  }
  return null
}

function mapFrequency(raw) {
  const f = (raw || '').toLowerCase()
  if (f.includes('every week') || f === 'weekly') return 'weekly'
  if (f.includes('two weeks') || f === 'biweekly') return 'biweekly'
  if (f.includes('four weeks') || f === 'monthly') return 'monthly'
  return 'one_time'
}

function monthlyRevenue(billRate, freq) {
  if (!billRate || billRate <= 0) return null
  const f = mapFrequency(freq)
  if (f === 'weekly')   return Math.round(billRate * 4.33)
  if (f === 'biweekly') return Math.round(billRate * 2.17)
  if (f === 'monthly')  return Math.round(billRate)
  return null
}

// ── 1. Import from xlsx (2024 data) ──────────────────────────────────────────
const xlsxPath = path.join(__dirname, '../../../Cancelled Service Sets - Just Peachy Clean (2).xlsx')
let xlsxImported = 0
let feedbackImported = 0

if (fs.existsSync(xlsxPath)) {
  const wb = XLSX.readFile(xlsxPath)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })

  const insertCancel = db.prepare(`
    INSERT OR IGNORE INTO cancelled_clients
      (client_name, cancel_date, reason_code, reason_label, reason_category,
       frequency, revenue_lost_monthly, notes, source)
    VALUES (?,?,?,?,?,?,?,?,'import')
  `)
  const insertFeedback = db.prepare(`
    INSERT OR IGNORE INTO client_feedback
      (client_name, feedback_date, rating, feedback_type, source)
    VALUES (?,?,?,'scorecard','import')
  `)

  const insertBoth = db.transaction((rows) => {
    for (const r of rows) {
      const cancelDate = parseDate(r['Date of Cancellation'])
      if (!cancelDate) continue

      const { code, label, category } = mapReason(r['Reason'])
      const freq = mapFrequency(r['Frequency'])
      const rev = monthlyRevenue(r['Bill Rate'], r['Frequency'])
      const notes = r['Notes'] || null

      insertCancel.run(
        r['Customer'] || null, cancelDate,
        code, label, category,
        freq, rev, notes
      )
      xlsxImported++

      // Import scorecard as feedback entry
      const score = parseInt(r['Last Scorecard'])
      if (score >= 1 && score <= 5) {
        insertFeedback.run(r['Customer'] || null, cancelDate, score)
        feedbackImported++
      }
    }
  })
  insertBoth(rows)
  console.log(`✓ xlsx: imported ${xlsxImported} cancellations, ${feedbackImported} scorecard feedback entries`)
} else {
  console.log('⚠ xlsx not found at:', xlsxPath)
}

// ── 2. Import from CSV (2025 data only) ──────────────────────────────────────
const csvPath = path.join(__dirname, '../../../Cancelled clients Jan.2024-July.2025.csv')
let csvImported = 0

if (fs.existsSync(csvPath)) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

  const insertCsv = db.prepare(`
    INSERT OR IGNORE INTO cancelled_clients
      (client_name, cancel_date, frequency, source)
    VALUES (?,?,?,'import')
  `)

  const csvTx = db.transaction((lines) => {
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
      const row = {}
      headers.forEach((h, i) => { row[h] = cols[i] || '' })

      const cancelDate = parseDate(row['Canceled Service'])
      if (!cancelDate) continue
      if (!cancelDate.startsWith('2025')) continue  // xlsx covers 2024

      const name = `${row['First'] || ''} ${row['Last'] || ''}`.trim() || null
      const freq = mapFrequency(row['Frequency'])

      insertCsv.run(name, cancelDate, freq)
      csvImported++
    }
  })
  csvTx(lines)
  console.log(`✓ csv: imported ${csvImported} 2025 cancellations`)
} else {
  console.log('⚠ csv not found at:', csvPath)
}

// ── 3. Auto-queue any T-coded imports into nurture ────────────────────────────
const tCoded = db.prepare(`
  SELECT id, client_id, client_name, reason_code, cancel_date
  FROM cancelled_clients
  WHERE source = 'import' AND reason_code LIKE 'T%'
`).all()

const insertNurture = db.prepare(`
  INSERT OR IGNORE INTO client_nurture
    (cancelled_id, client_id, client_name, reason_code, cancel_date, next_contact)
  VALUES (?,?,?,?,?,?)
`)
const nurtureInserter = db.transaction((rows) => {
  for (const r of rows) {
    const next = new Date(r.cancel_date)
    next.setDate(next.getDate() + 30)
    insertNurture.run(r.id, r.client_id, r.client_name, r.reason_code, r.cancel_date, next.toISOString().split('T')[0])
  }
})
nurtureInserter(tCoded)
console.log(`✓ nurture: queued ${tCoded.length} T-coded clients`)

// ── Summary ───────────────────────────────────────────────────────────────────
const totalCancels = db.prepare("SELECT COUNT(*) AS n FROM cancelled_clients WHERE source='import'").get().n
const totalFeedback = db.prepare("SELECT COUNT(*) AS n FROM client_feedback WHERE source='import'").get().n
console.log(`\nDB totals — cancellations: ${totalCancels}, feedback: ${totalFeedback}`)
