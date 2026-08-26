import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const FREQ_LABELS = {
  weekly:           'Weekly',
  biweekly:         'Biweekly',
  'bi-weekly':      'Biweekly',
  monthly:          'Monthly',
  'tri-weekly':     'Tri-Weekly',
  'every 4 weeks':  'Every 4 Wks',
  one_time:         'One-Time',
  'one time':       'One-Time',
  'one-time':       'One-Time',
  priority:         'Priority',
  'move out':       'Move Out',
  ttb:              'TTB',
  general:          'General',
}
const FREQ_COLORS = {
  weekly:           'bg-brand/10 text-brand',
  biweekly:         'bg-ok/10 text-ok',
  'bi-weekly':      'bg-ok/10 text-ok',
  monthly:          'bg-peach/20 text-amber-700',
  'tri-weekly':     'bg-purple-50 text-purple-700',
  'every 4 weeks':  'bg-peach/20 text-amber-700',
  one_time:         'bg-gray-100 text-gray-500',
  'one time':       'bg-gray-100 text-gray-500',
  'one-time':       'bg-gray-100 text-gray-500',
  priority:         'bg-rose-50 text-rose-600',
  'move out':       'bg-orange-50 text-orange-600',
  ttb:              'bg-blue-50 text-blue-600',
  general:          'bg-gray-100 text-gray-500',
}
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'tri-weekly', 'every 4 weeks', 'one_time', 'priority', 'move out', 'ttb', 'general']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt$ = n => n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const pct = n => n != null ? `${(n * 100).toFixed(1)}%` : '—'

function FreqBadge({ freq }) {
  if (!freq) return <span className="text-gray-300 text-xs">—</span>
  const key = freq.toLowerCase().trim()
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FREQ_COLORS[key] || 'bg-gray-100 text-gray-500'}`}>
      {FREQ_LABELS[key] || freq}
    </span>
  )
}

function exportCsv(filename, rows) {
  const headers = ['Date', 'Rep', 'Client Name', 'Frequency', 'Quote', 'Annual Value', 'Converted', 'Initial Clean', 'Recurring', 'Lead Source', 'Reason']
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.record_date,
      escape(r.rep_name),
      escape(r.client_name),
      r.frequency || '',
      r.quote_amount != null ? r.quote_amount : '',
      r.annual_value != null ? r.annual_value : '',
      r.converted ? 'Y' : 'N',
      r.initial_clean_booked ? 'Y' : 'N',
      r.recurring_retained ? 'Y' : 'N',
      escape(r.lead_source),
      escape(r.reason),
    ].join(','))
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

const VISITS = { weekly: 52, biweekly: 26, 'bi-weekly': 26, monthly: 13, 'every 4 weeks': 13, one_time: 1, 'one time': 1, 'one-time': 1, 'tri-weekly': 17, priority: 1, 'move out': 1, ttb: 1, general: 1 }
// Recurring visits after the initial clean (total − 1)
const RECURRING_VISITS = { weekly: 51, biweekly: 25, 'bi-weekly': 25, monthly: 12, 'every 4 weeks': 12, 'tri-weekly': 16 }
const ONE_TIME_FREQS = ['one_time', 'one time', 'one-time', 'priority', 'move out', 'ttb', 'general']

// Two-tier annual value: initial clean price + recurring price × remaining visits
function calcAnnual(initialPrice, recurringPrice, frequency) {
  if (!frequency) return null
  const f = frequency.toLowerCase().trim()
  if (ONE_TIME_FREQS.includes(f)) return initialPrice ? Math.round(parseFloat(initialPrice)) : null
  const remaining = RECURRING_VISITS[f]
  const total = VISITS[f]
  // Both prices: two-tier formula
  if (initialPrice && recurringPrice && remaining != null) {
    return Math.round(parseFloat(initialPrice) + parseFloat(recurringPrice) * remaining)
  }
  // Single price fallback: multiply by all visits
  const price = recurringPrice || initialPrice
  return (price && total) ? Math.round(parseFloat(price) * total) : null
}

// Funnel stage card
function FunnelStage({ label, from, to, rate, goal, stretch, showArrow = true }) {
  let color = 'text-gray-400'
  let barColor = 'bg-gray-200'
  let badge = null

  if (rate != null && goal != null) {
    const pctOfGoal = rate / goal
    if (stretch && rate >= stretch) {
      color = 'text-brand'; barColor = 'bg-brand'; badge = '🎯 Stretch'
    } else if (rate >= goal) {
      color = 'text-ok'; barColor = 'bg-ok'; badge = '✓ Goal'
    } else if (pctOfGoal >= 0.75) {
      color = 'text-amber-500'; barColor = 'bg-amber-400'; badge = 'Near goal'
    } else {
      color = 'text-danger'; barColor = 'bg-danger'
    }
  } else if (rate != null) {
    color = 'text-brand'; barColor = 'bg-brand'
  }

  const barWidth = rate != null && goal != null
    ? Math.min(100, (rate / (stretch || goal)) * 100)
    : rate != null ? Math.min(100, rate * 100) : 0

  return (
    <div className="flex-1 min-w-0">
      <div className="kpi-card h-full border-gray-200">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className={`text-2xl font-bold ${color}`}>{rate != null ? pct(rate) : '—'}</span>
          {from != null && to != null && (
            <span className="text-xs text-gray-400">{to}/{from}</span>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        {/* Goals */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {goal != null && <>Goal: <span className="font-semibold text-gray-600">{pct(goal)}</span></>}
            {stretch != null && <> · Stretch: <span className="font-semibold text-brand">{pct(stretch)}</span></>}
          </span>
          {badge && <span className="font-semibold text-xs">{badge}</span>}
        </div>
      </div>
    </div>
  )
}

const BLANK_FORM = {
  record_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  rep_name: 'Lexi Ledom',
  client_name: '',
  frequency: '',
  initial_clean_price: '',
  price_per_clean: '',
  converted: false,
  initial_clean_booked: false,
  recurring_retained: false,
  is_flex: false,
  is_current_client: false,
  converted_date: '',
  recurring_converted_date: '',
  cancelled_after_initial: false,
  lead_source: '',
  used_before: '',
  reason: '',
  notes: '',
}

// ── CSV Import helpers ────────────────────────────────────────────────────
const IMPORT_COLS = [
  { key: 'record_date',        label: 'Date *',               hint: 'MM/DD/YYYY or YYYY-MM-DD' },
  { key: 'client_name',        label: 'Client Name',          hint: '' },
  { key: 'rep_name',           label: 'Sales Rep',            hint: 'defaults to Lexi Ledom' },
  { key: 'frequency',          label: 'Frequency',            hint: 'weekly, biweekly, monthly…' },
  { key: 'price_per_clean',    label: 'Recurring Price ($)',  hint: '' },
  { key: 'initial_clean_price',label: 'Initial Clean Price ($)',hint: '' },
  { key: 'quote_amount',       label: 'Quote Amount ($)',     hint: '' },
  { key: 'converted',          label: 'Converted? (Y/N)',     hint: '' },
  { key: 'initial_clean_booked',label: 'Initial Clean Booked? (Y/N)', hint: '' },
  { key: 'recurring_retained', label: 'Recurring Retained? (Y/N)', hint: '' },
  { key: 'lead_source',        label: 'Lead Source',          hint: '' },
  { key: 'reason',             label: 'Reason Not Converted', hint: '' },
  { key: 'notes',              label: 'Notes',                hint: '' },
]

function parseDate(raw) {
  if (!raw) return null
  // Strip any time component (e.g. "06/01/26 10:57 AM" → "06/01/26")
  const s = raw.trim().split(/\s+/)[0]
  // YYYY-MM-DD already fine
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // M/D/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  // M/D/YY  e.g. 6/3/26
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (m2) return `20${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`
  return null
}

function normalizeRep(name) {
  const n = (name || '').trim().toLowerCase()
  if (n === 'lexi') return 'Lexi Ledom'
  return (name || '').trim() || 'Lexi Ledom'
}

function parseBool(v) {
  if (v == null) return false
  const s = v.toString().toLowerCase().trim()
  return ['y','yes','1','true','x'].includes(s)
}

function parseFreq(v) {
  if (!v) return ''
  const map = {
    weekly:'weekly', 'bi-weekly':'biweekly', biweekly:'biweekly',
    monthly:'monthly', 'tri-weekly':'tri-weekly', 'every 4 weeks':'every 4 weeks',
    'one time':'one_time', 'one-time':'one_time', 'one_time':'one_time',
    priority:'priority', 'move out':'move out', ttb:'ttb', general:'general'
  }
  return map[v.toLowerCase().trim()] || v.trim()
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  // detect delimiter: tab or comma
  const delim = lines[0].includes('\t') ? '\t' : ','
  const splitLine = line => {
    if (delim === ',') {
      // simple CSV split respecting quotes
      const cells = []
      let cur = '', inQ = false
      for (const ch of line + ',') {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
        else cur += ch
      }
      return cells
    }
    return line.split('\t').map(s => s.trim())
  }
  const headers = splitLine(lines[0])
  const rows = lines.slice(1).map(l => {
    const cells = splitLine(l)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || '' })
    return obj
  })
  return { headers, rows }
}

function autoMapColumns(headers) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'')
  // Matching: normalized header must equal OR start with a pattern
  const hints = [
    ['record_date',         ['date','recorddate','leaddate']],
    ['client_name',         ['clientname','callername','caller','client','name','contact']],
    ['rep_name',            ['salesrep','repname','rep']],
    ['frequency',           ['desiredservice','frequency','freq','servicetype']],
    ['price_per_clean',     ['recurringprice','priceperclean','recurprice']],
    ['initial_clean_price', ['initialcleanprice','initialprice','deepclean']],
    ['quote_amount',        ['estimategiven','quoteamount','quote','estimate','amount']],
    ['converted',           ['converted','closed','sold']],
    ['initial_clean_booked',['initialcleanbooked','initialbooked','icbooked']],
    ['recurring_retained',  ['recurringretained']],
    ['lead_source',         ['leadsource','leadinitial','initialcontact','howthey']],
    ['used_before',         ['usedbefore','usedaclean','usedservice']],
    ['reason',              ['ifnoreason','reasonnot','whynot','reason']],
    ['notes',               ['notes','note','occasion','comments']],
  ]
  const mapping = {}
  for (const [colKey, patterns] of hints) {
    for (const h of headers) {
      const n = norm(h)
      if (patterns.some(p => n === p || n.startsWith(p))) { mapping[colKey] = h; break }
    }
  }
  return mapping
}

function ImportModal({ onClose, onImported }) {
  const [step, setStep] = useState(1) // 1=paste, 2=map, 3=preview
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const handleParse = () => {
    const { headers, rows } = parseCsv(raw)
    if (!headers.length) return alert('Could not parse — paste your spreadsheet data (copy all cells from Google Sheets or Excel)')
    const autoMap = autoMapColumns(headers)
    setParsed({ headers, rows })
    setMapping(autoMap)
    setStep(2)
  }

  const buildPreview = () => {
    const rows = parsed.rows.slice(0, 5).map(row => mapRow(row, mapping))
    setPreview(rows)
    setStep(3)
  }

  const mapRow = (row, map) => {
    const d = parseDate(row[map.record_date])
    return {
      record_date:          d,
      client_name:          row[map.client_name] || '',
      rep_name:             normalizeRep(row[map.rep_name]),
      frequency:            parseFreq(row[map.frequency]),
      price_per_clean:      row[map.price_per_clean] ? parseFloat(row[map.price_per_clean].replace(/[$,]/g,'')) : null,
      initial_clean_price:  row[map.initial_clean_price] ? parseFloat(row[map.initial_clean_price].replace(/[$,]/g,'')) : null,
      quote_amount:         row[map.quote_amount] ? parseFloat(row[map.quote_amount].replace(/[$,]/g,'')) : null,
      converted:            parseBool(row[map.converted]),
      initial_clean_booked: parseBool(row[map.initial_clean_booked]),
      recurring_retained:   parseBool(row[map.recurring_retained]),
      lead_source:          row[map.lead_source] || '',
      reason:               row[map.reason] || '',
      notes:                row[map.notes] || '',
    }
  }

  const doImport = async () => {
    setImporting(true)
    const leads = parsed.rows.map(row => mapRow(row, mapping)).filter(r => r.record_date)
    try {
      const res = await apiFetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads }),
      })
      const data = await res.json()
      setResult(data)
    } catch(e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-ink">Import Leads from Spreadsheet</h3>
            <p className="text-xs text-gray-400 mt-0.5">Step {step} of 3 — {step===1?'Paste data':step===2?'Map columns':'Preview & import'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="text-center py-6">
              {result.ok ? (
                <>
                  <p className="text-3xl mb-3">✅</p>
                  <p className="text-xl font-bold text-ok mb-1">{result.imported} leads imported!</p>
                  {result.duplicates > 0 && <p className="text-sm text-gray-400">{result.duplicates} already existed — skipped (no duplicates created)</p>}
                  {result.skipped > 0 && <p className="text-sm text-gray-400">{result.skipped} rows skipped (missing date)</p>}
                  {result.errors?.length > 0 && (
                    <div className="mt-3 text-left text-xs text-danger bg-red-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                      {result.errors.map((e,i) => <div key={i}>{e.row}: {e.error}</div>)}
                    </div>
                  )}
                  <button onClick={() => { onImported(); onClose() }} className="btn-primary mt-5">Done — reload leads</button>
                </>
              ) : (
                <>
                  <p className="text-danger font-medium">Import failed: {result.error}</p>
                  <button onClick={() => setResult(null)} className="btn-secondary mt-3 text-sm">Try again</button>
                </>
              )}
            </div>
          ) : step === 1 ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Open your June leads spreadsheet → select all cells → Copy → paste below.<br/>
                <span className="text-gray-400 text-xs">Works with Google Sheets, Excel, or any CSV. First row must be column headers.</span>
              </p>
              <p className="text-xs font-medium text-gray-500 mb-1">Recognized column names include: <span className="text-gray-400">Date, Client Name, Rep, Frequency, Quote Amount, Recurring Price, Initial Clean Price, Converted, Recurring Retained, Lead Source, Reason, Notes</span></p>
              <textarea
                className="form-input font-mono text-xs"
                rows={10}
                placeholder={"Date\tClient Name\tRep\tFrequency\tQuote\tConverted\n6/1/2026\tSarah Smith\tLexi Ledom\tBiweekly\t185\tY\n6/2/2026\tJohn Doe\tLexi Ledom\tWeekly\t\tN"}
                value={raw}
                onChange={e => setRaw(e.target.value)}
              />
              <div className="flex justify-end mt-3 gap-3">
                <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
                <button onClick={handleParse} disabled={!raw.trim()} className="btn-primary text-sm">Parse →</button>
              </div>
            </div>
          ) : step === 2 ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Found <strong>{parsed.headers.length}</strong> columns, <strong>{parsed.rows.length}</strong> rows. Map your columns to the fields below:
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 max-h-80 overflow-y-auto pr-1">
                {IMPORT_COLS.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <div className="w-40 flex-shrink-0">
                      <p className="text-xs font-medium text-gray-700">{col.label}</p>
                      {col.hint && <p className="text-xs text-gray-400">{col.hint}</p>}
                    </div>
                    <select
                      className="form-input text-xs py-1 flex-1"
                      value={mapping[col.key] || ''}
                      onChange={e => setMapping(m => ({ ...m, [col.key]: e.target.value || undefined }))}
                    >
                      <option value="">— skip —</option>
                      {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4 gap-3">
                <button onClick={() => setStep(1)} className="text-sm text-gray-500 px-4 py-2">← Back</button>
                <div className="flex gap-3">
                  <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
                  <button onClick={buildPreview} disabled={!mapping.record_date} className="btn-primary text-sm">Preview →</button>
                </div>
              </div>
              {!mapping.record_date && <p className="text-xs text-danger mt-2">Date column is required</p>}
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Preview of first 5 rows (total: <strong>{parsed.rows.length}</strong> leads). Rows without a valid date will be skipped.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px] border border-gray-100 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Date','Client','Rep','Freq','Quote','Conv?','Recur?','Source'].map(h => (
                        <th key={h} className="text-left px-2 py-1.5 font-medium text-gray-500 border-b border-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${!r.record_date ? 'bg-red-50' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-600">{r.record_date || <span className="text-danger">invalid</span>}</td>
                        <td className="px-2 py-1.5 font-medium text-ink">{r.client_name || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500">{r.rep_name}</td>
                        <td className="px-2 py-1.5 text-gray-500">{r.frequency || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500">{r.price_per_clean || r.quote_amount ? `$${r.price_per_clean || r.quote_amount}` : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{r.converted ? <span className="text-ok font-bold">Y</span> : <span className="text-gray-300">N</span>}</td>
                        <td className="px-2 py-1.5 text-center">{r.recurring_retained ? <span className="text-brand font-bold">Y</span> : <span className="text-gray-300">N</span>}</td>
                        <td className="px-2 py-1.5 text-gray-400">{r.lead_source || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.some(r => !r.record_date) && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mt-2">
                  Some rows have invalid dates — go back and check your Date column mapping.
                </p>
              )}
              <div className="flex justify-between mt-4 gap-3">
                <button onClick={() => setStep(2)} className="text-sm text-gray-500 px-4 py-2">← Back</button>
                <div className="flex gap-3">
                  <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
                  <button onClick={doImport} disabled={importing || preview.some(r=>!r.record_date)} className="btn-primary text-sm">
                    {importing ? 'Importing…' : `Import all ${parsed.rows.length} leads →`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [reps, setReps] = useState([])
  const _now = new Date()
  const _todayStr = _now.toISOString().split('T')[0]
  const _firstOfMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`
  const [filter, setFilter] = useState({
    year: String(_now.getFullYear()),
    month: String(_now.getMonth() + 1).padStart(2, '0'),
    converted: 'all',
  })
  const [rangeMode, setRangeMode] = useState('month')
  const [dateStart, setDateStart] = useState(_firstOfMonth)
  const [dateEnd, setDateEnd] = useState(_todayStr)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [careMsg, setCareMsg] = useState(null)
  const [dupMatches, setDupMatches] = useState([])
  const [sortCol, setSortCol] = useState('record_date')
  const [sortDir, setSortDir] = useState('desc')

  // Check for duplicate client name when adding (not editing)
  useEffect(() => {
    if (editId) { setDupMatches([]); return }
    const name = (form.client_name || '').trim()
    if (name.length < 2) { setDupMatches([]); return }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/check?name=${encodeURIComponent(name)}`)
        .then(r => r.json())
        .then(rows => setDupMatches(Array.isArray(rows) ? rows : []))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [form.client_name, editId])

  // Debounce search input → search state (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = () => {
    const params = new URLSearchParams({ limit: 2000 })
    if (search.trim()) {
      // no date filter — search all records
    } else if (rangeMode === 'range' && dateStart && dateEnd) {
      params.set('startDate', dateStart)
      params.set('endDate', dateEnd)
    } else if (filter.month) {
      params.set('month', `${filter.year}-${filter.month}`)
    } else {
      params.set('year', filter.year)
    }
    apiFetch(`/api/leads?${params}`)
      .then(r => r.json())
      .then(setLeads)
  }

  useEffect(() => { load() }, [filter.year, filter.month, search, rangeMode, dateStart, dateEnd])

  useEffect(() => {
    apiFetch('/api/bonus/reps').then(r => r.json()).then(rows => {
      setReps(rows.filter(r => r.active))
    }).catch(() => {})
  }, [])

  const f = v => (v ?? '').toString()
  const set = k => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(p => {
      const next = { ...p, [k]: val }
      // Auto-check initial_clean_booked when recurring_retained is checked
      if (k === 'recurring_retained' && val) next.initial_clean_booked = true
      // Auto-check converted when either booking or recurring is checked
      if ((k === 'initial_clean_booked' || k === 'recurring_retained') && val) next.converted = true
      return next
    })
  }

  const openEdit = r => {
    setCareMsg(null)
    setEditId(r.id)
    setForm({
      record_date:          r.record_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
      rep_name:             r.rep_name || '',
      client_name:          r.client_name || '',
      frequency:            r.frequency || '',
      initial_clean_price:  r.initial_clean_price ?? '',
      price_per_clean:      r.price_per_clean ?? r.quote_amount ?? '',
      converted:            !!r.converted,
      initial_clean_booked: !!r.initial_clean_booked,
      recurring_retained:   !!r.recurring_retained,
      is_flex:              !!r.is_flex,
      is_current_client:    !!r.is_current_client,
      converted_date:           r.converted_date || '',
      recurring_converted_date: r.recurring_converted_date || '',
      cancelled_after_initial:  !!r.cancelled_after_initial,
      lead_source:              r.lead_source || '',
      used_before:          r.used_before || '',
      reason:               r.reason || '',
      notes:                r.notes || '',
    })
    setShowForm(true)
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    const cleanPrice = form.price_per_clean ? parseFloat(form.price_per_clean) : null
    const initPrice  = form.initial_clean_price ? parseFloat(form.initial_clean_price) : null
    const payload = {
      ...form,
      quote_amount:         cleanPrice ?? initPrice,
      price_per_clean:      cleanPrice,
      initial_clean_price:  initPrice,
      converted:            form.converted            ? 1 : 0,
      initial_clean_booked: form.initial_clean_booked ? 1 : 0,
      recurring_retained:      form.recurring_retained      ? 1 : 0,
      is_flex:                 form.is_flex                 ? 1 : 0,
      is_current_client:       form.is_current_client       ? 1 : 0,
      cancelled_after_initial: form.cancelled_after_initial ? 1 : 0,
      converted_date:           form.converted          ? (form.converted_date || null)           : null,
      recurring_converted_date: form.recurring_retained ? (form.recurring_converted_date || null) : null,
      source: 'manual',
    }
    if (editId) {
      await apiFetch(`/api/leads/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await apiFetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm(BLANK_FORM)
    load()
  }

  const del = async id => {
    if (!confirm('Remove this record?')) return
    await apiFetch(`/api/leads/${id}`, { method: 'DELETE' })
    load()
  }

  // Apply filters: converted + search
  const visible = leads.filter(r => {
    if (filter.converted === 'yes' && !r.converted) return false
    if (filter.converted === 'no' && r.converted) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return (r.client_name || '').toLowerCase().includes(q) ||
             (r.rep_name || '').toLowerCase().includes(q) ||
             (r.notes || '').toLowerCase().includes(q)
    }
    return true
  })

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = [...visible].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    const av = a[sortCol], bv = b[sortCol]
    if (av == null && bv == null) return 0
    if (av == null) return mul
    if (bv == null) return -mul
    if (typeof av === 'number' || typeof bv === 'number') {
      return ((Number(av) || 0) - (Number(bv) || 0)) * mul
    }
    return String(av).localeCompare(String(bv)) * mul
  })

  const converted      = leads.filter(r => r.converted)
  const recurring      = converted.filter(r => r.recurring_retained && !r.cancelled_after_initial)
  // A lead is "quoted" only if a price was actually entered in the system
  const quoted         = leads.filter(r => r.price_per_clean != null || r.quote_amount != null || r.initial_clean_price != null)
  const initialBooked  = leads.filter(r => r.initial_clean_booked)

  const totalAnnual    = recurring.reduce((s, r) => s + (r.annual_value || 0), 0)

  const leadToQuoteRate        = leads.length > 0        ? quoted.length / leads.length        : null
  const quoteToSaleRate        = quoted.length > 0       ? converted.length / quoted.length    : null
  const initialToRecurringRate = converted.length > 0 ? recurring.length / converted.length : null

  const monthLabel = rangeMode === 'range'
    ? (dateStart && dateEnd ? `${dateStart} – ${dateEnd}` : 'custom range')
    : filter.month
      ? `${MONTH_NAMES[parseInt(filter.month) - 1]} ${filter.year}`
      : filter.year

  // Agency export: converted recurring only
  const agencyRows = leads.filter(r => r.converted && r.recurring_retained)
  const exportFilename = `jpc-client-log-${filter.month ? `${filter.year}-${filter.month}` : filter.year}.csv`
  const agencyFilename = `jpc-agency-recurring-${filter.month ? `${filter.year}-${filter.month}` : filter.year}.csv`

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">All leads — {monthLabel} · <span className="text-[11px] text-gray-400">includes unquoted leads · ✏️ add manually or use ↑ Import CSV when Zapier is down</span></p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => exportCsv(agencyFilename, agencyRows)} className="btn-secondary text-sm">
            ↓ Agency Export
          </button>
          <button onClick={() => exportCsv(exportFilename, visible)} className="btn-secondary text-sm">
            ↓ Full Export
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary text-sm">
            ↑ Import CSV
          </button>
          <button onClick={() => { setEditId(null); setForm(BLANK_FORM); setShowForm(true) }} className="btn-primary text-sm">
            + Add Lead
          </button>
        </div>
      </div>

      {/* KPI Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="kpi-card border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leads In</p>
          <p className="text-3xl font-bold text-ink mt-2">{leads.length}</p>
        </div>
        <div className="kpi-card border-ok">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Converted</p>
          <p className="text-3xl font-bold text-ok mt-2">{converted.length}</p>
          <p className="text-xs text-gray-400 mt-1">{quoted.length > 0 ? `${pct(quoteToSaleRate)} of quoted` : ''}</p>
        </div>
        <div className="kpi-card border-brand">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recurring Retained</p>
          <p className="text-3xl font-bold text-brand mt-2">{recurring.length}</p>
          {converted.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{recurring.length}/{converted.length} converted→recurring</p>
          )}
        </div>
        <div className="kpi-card border-peach">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. Annual Value</p>
          <p className="text-3xl font-bold text-ink mt-2">{totalAnnual > 0 ? fmt$(totalAnnual) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">recurring only</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Conversion Funnel</p>
        <div className="flex gap-3 items-stretch">
          <FunnelStage
            label="Lead → Quote"
            from={leads.length}
            to={quoted.length}
            rate={leadToQuoteRate}
            goal={0.90}
          />
          <div className="flex items-center text-gray-300 text-lg font-light self-center">›</div>
          <FunnelStage
            label="Quote → Sale"
            from={quoted.length}
            to={converted.length}
            rate={quoteToSaleRate}
            goal={0.40}
            stretch={0.50}
          />
          <div className="flex items-center text-gray-300 text-lg font-light self-center">›</div>
          <FunnelStage
            label="Converted → Recurring"
            from={converted.length}
            to={recurring.length}
            rate={initialToRecurringRate}
            goal={0.35}
            stretch={0.45}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Month / Date Range toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => setRangeMode('month')}
            className={`px-3 py-1.5 font-medium transition-colors ${rangeMode === 'month' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >Month</button>
          <button
            onClick={() => setRangeMode('range')}
            className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 ${rangeMode === 'range' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >Date Range</button>
        </div>

        {rangeMode === 'month' ? (
          <>
            <select className="form-input w-24 text-sm" value={filter.year} onChange={e => setFilter(f => ({ ...f, year: e.target.value }))}>
              {['2026','2025','2024'].map(y => <option key={y}>{y}</option>)}
            </select>
            <select className="form-input w-36 text-sm" value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}>
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
            </select>
          </>
        ) : (
          <>
            <input type="date" className="form-input text-sm w-44" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            <span className="text-sm text-gray-400">to</span>
            <input type="date" className="form-input text-sm w-44" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </>
        )}

        <select className="form-input w-44 text-sm" value={filter.converted} onChange={e => setFilter(f => ({ ...f, converted: e.target.value }))}>
          <option value="yes">✓ Clients (converted)</option>
          <option value="all">All leads (funnel view)</option>
          <option value="no">Quoted, not closed</option>
        </select>
        <input
          type="text"
          className="form-input text-sm w-52"
          placeholder="🔍 Search all records…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button onClick={() => { setSearchInput(''); setSearch('') }} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
        )}
        {search.trim()
          ? <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-1 rounded-full">Searching all months · {visible.length} found</span>
          : <span className="text-sm text-gray-400">{visible.length} records</span>
        }
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              {[
                { col: 'record_date',        label: 'Date',        align: 'left',   pad: 'py-2 pr-2' },
                { col: 'rep_name',           label: 'Rep',         align: 'left',   pad: 'py-2 px-2' },
                { col: 'client_name',        label: 'Client',      align: 'left',   pad: 'py-2 px-2' },
                { col: 'frequency',          label: 'Frequency',   align: 'center', pad: 'py-2 px-2' },
                { col: 'quote_amount',       label: 'Quote',       align: 'right',  pad: 'py-2 px-2' },
                { col: 'annual_value',       label: 'Annual Val.', align: 'right',  pad: 'py-2 px-2' },
                { col: 'converted',          label: 'Conv?',       align: 'center', pad: 'py-2 px-2' },
                { col: 'initial_clean_booked', label: 'Init?',     align: 'center', pad: 'py-2 px-2', title: 'Initial clean booked' },
                { col: 'recurring_retained', label: 'Recur?',      align: 'center', pad: 'py-2 px-2' },
                { col: 'lead_source',        label: 'Source',      align: 'left',   pad: 'py-2 px-2' },
              ].map(({ col, label, align, pad, title }) => (
                <th
                  key={col}
                  className={`text-${align} ${pad} font-medium cursor-pointer select-none hover:text-gray-600 whitespace-nowrap`}
                  title={title}
                  onClick={() => toggleSort(col)}
                >
                  {label}
                  {sortCol === col
                    ? <span className="ml-1 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span className="ml-1 opacity-20">↕</span>}
                </th>
              ))}
              <th className="py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400 text-sm">
                  No leads for {monthLabel}.{' '}
                  <button onClick={() => { setEditId(null); setForm(BLANK_FORM); setShowForm(true) }} className="text-brand underline">Add one →</button>
                </td>
              </tr>
            ) : sorted.map(r => (
              <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/40 cursor-pointer ${r.converted ? '' : 'opacity-60'}`} onClick={() => openEdit(r)}>
                <td className="py-2 pr-2 text-gray-500 whitespace-nowrap text-xs">{r.record_date}</td>
                <td className="py-2 px-2 text-gray-500 text-xs">{r.rep_name || '—'}</td>
                <td className="py-2 px-2 font-medium text-ink">
                  <span className="flex items-center gap-1.5">
                    {r.client_name || <span className="text-gray-300">—</span>}
                    {r.is_current_client ? <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">CC</span> : null}
                  </span>
                </td>
                <td className="py-2 px-2 text-center"><FreqBadge freq={r.frequency} /></td>
                <td className="py-2 px-2 text-right text-gray-600 text-xs">{r.quote_amount != null ? fmt$(r.quote_amount) : '—'}</td>
                <td className="py-2 px-2 text-right font-semibold text-xs">
                  {r.annual_value != null ? <span className="text-ink">{fmt$(r.annual_value)}</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {r.converted
                    ? <span className="text-xs font-bold text-ok">Y</span>
                    : <span className="text-xs text-gray-300">N</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {r.initial_clean_booked
                    ? <span className="text-xs font-bold text-amber-500">Y</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="py-2 px-2 text-center">
                  {r.recurring_retained
                    ? r.cancelled_after_initial
                      ? <span className="text-xs font-semibold text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded-full line-through" title="Cancelled after initial — excluded from bonus">Y</span>
                      : r.is_flex
                        ? <span className="text-xs font-semibold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded-full">Flex</span>
                        : <span className="text-xs font-bold text-brand">Y</span>
                    : <span className="text-xs text-gray-300">N</span>}
                </td>
                <td className="py-2 px-2 text-gray-400 text-xs">{r.lead_source || '—'}</td>
                <td className="py-2 pl-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => del(r.id)} className="text-gray-200 hover:text-danger text-xs transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { load(); setShowImport(false) }}
        />
      )}

      {/* Add/Edit lead modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-ink">{editId ? 'Edit Lead' : 'Add Lead'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date</label>
                  <input type="date" required className="form-input" value={f(form.record_date)} onChange={set('record_date')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sales Rep</label>
                  {reps.length > 0 ? (
                    <select className="form-input" value={f(form.rep_name)} onChange={set('rep_name')}>
                      {reps.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" className="form-input" value={f(form.rep_name)} onChange={set('rep_name')} />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Client Name</label>
                <input type="text" className="form-input" value={f(form.client_name)} onChange={set('client_name')} />
                {!editId && dupMatches.length > 0 && (
                  <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                    <p className="font-medium text-amber-800">This client already has a record.</p>
                    {dupMatches.slice(0, 3).map(d => (
                      <div key={d.id} className="flex items-center justify-between mt-1">
                        <span className="text-amber-700 text-xs">
                          {d.rep_name} · {d.record_date} · {d.converted ? 'Converted' : 'Lead'}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-amber-900 underline font-medium ml-2"
                          onClick={() => { openEdit(d); setDupMatches([]) }}
                        >
                          Edit existing
                        </button>
                      </div>
                    ))}
                    <p className="text-amber-600 text-xs mt-1">Update the existing record instead of creating a duplicate.</p>
                  </div>
                )}
              </div>
              {/* Frequency */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Frequency / Service</label>
                <select className="form-input" value={f(form.frequency)} onChange={set('frequency')}>
                  <option value="">— select —</option>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f] || f}</option>)}
                </select>
              </div>
              {/* Pricing — two-tier for recurring, single for one-time */}
              {(() => {
                const freq = (form.frequency || '').toLowerCase().trim()
                const isOneTime = ONE_TIME_FREQS.includes(freq)
                const noFreq = !form.frequency
                if (noFreq || isOneTime) {
                  return (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {isOneTime ? 'One-Time Price ($)' : 'Quote / Price ($)'}
                      </label>
                      <input type="number" min="0" step="0.01" className="form-input" placeholder="e.g. 300"
                        value={f(form.initial_clean_price || form.price_per_clean)}
                        onChange={e => setForm(p => ({ ...p, initial_clean_price: e.target.value, price_per_clean: '' }))} />
                    </div>
                  )
                }
                // Recurring frequency — show two price boxes
                const remaining = RECURRING_VISITS[freq]
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Initial Clean Price ($)</label>
                        <input type="number" min="0" step="0.01" className="form-input" placeholder="e.g. 350"
                          value={f(form.initial_clean_price)} onChange={set('initial_clean_price')} />
                        <p className="text-xs text-gray-400 mt-0.5">One-time deep clean rate</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Recurring Price ($)</label>
                        <input type="number" min="0" step="0.01" className="form-input" placeholder="e.g. 185"
                          value={f(form.price_per_clean)} onChange={set('price_per_clean')} />
                        <p className="text-xs text-gray-400 mt-0.5">Per clean going forward</p>
                      </div>
                    </div>
                    {/* Live annual value preview */}
                    {(form.initial_clean_price || form.price_per_clean) && (() => {
                      const annual = calcAnnual(form.initial_clean_price, form.price_per_clean, form.frequency)
                      if (!annual) return null
                      const initAmt = form.initial_clean_price ? parseFloat(form.initial_clean_price) : null
                      const recAmt  = form.price_per_clean    ? parseFloat(form.price_per_clean)    : null
                      return (
                        <div className="px-3 py-2 bg-brand/5 border border-brand/15 rounded-lg text-sm">
                          <div className="flex items-baseline gap-2">
                            <span className="text-brand font-bold text-base">{fmt$(annual)}</span>
                            <span className="text-gray-500">estimated annual value</span>
                          </div>
                          {initAmt && recAmt && remaining != null && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {fmt$(initAmt)} initial + {fmt$(recAmt)} × {remaining} visits
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Lead Source</label>
                  <input type="text" className="form-input" placeholder="e.g. Inbound Call" value={f(form.lead_source)} onChange={set('lead_source')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Used Service Before?</label>
                  <select className="form-input" value={f(form.used_before)} onChange={set('used_before')}>
                    <option value="">—</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>
              {/* Current Client flag */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer" title="Lead is an existing current client — excluded from sales bonus">
                  <input type="checkbox" checked={!!form.is_current_client} onChange={set('is_current_client')} className="w-4 h-4 accent-sky-500" />
                  <span className="text-sm text-gray-700">Current Client</span>
                  <span className="text-xs text-gray-400">(excludes from bonus)</span>
                </label>
              </div>
              {/* Conversion checkboxes */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.converted} onChange={set('converted')} className="w-4 h-4 accent-ok" />
                  <span className="text-sm text-gray-700">Converted</span>
                </label>
                {form.converted && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.initial_clean_booked} onChange={set('initial_clean_booked')} className="w-4 h-4 accent-amber-500" />
                    <span className="text-sm text-gray-700">Initial Clean Booked</span>
                  </label>
                )}
                {form.converted && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.recurring_retained} onChange={set('recurring_retained')} className="w-4 h-4 accent-brand" />
                    <span className="text-sm text-gray-700">Recurring Retained</span>
                  </label>
                )}
                {/* Inline frequency + price when recurring is checked */}
                {form.converted && form.recurring_retained && (
                  <div className="mt-2 p-3 bg-brand/5 border border-brand/20 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-brand uppercase tracking-wide">Recurring Details</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                        <select className="form-input py-1.5 text-sm" value={f(form.frequency)} onChange={set('frequency')}>
                          <option value="">— select —</option>
                          {FREQUENCIES.map(fq => <option key={fq} value={fq}>{FREQ_LABELS[fq] || fq}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Price per Clean ($)</label>
                        <input type="number" min="0" step="0.01" className="form-input py-1.5 text-sm" placeholder="e.g. 185"
                          value={f(form.price_per_clean)} onChange={set('price_per_clean')} />
                      </div>
                    </div>
                  </div>
                )}
                {form.converted && form.recurring_retained && (
                  <label className="flex items-center gap-2 cursor-pointer" title="Flex clients book on-demand (not a fixed schedule). Excluded from bonus calculation.">
                    <input type="checkbox" checked={!!form.is_flex} onChange={set('is_flex')} className="w-4 h-4 accent-purple-500" />
                    <span className="text-sm text-gray-700">Flex Client</span>
                    <span className="text-xs text-gray-400">(excludes from bonus)</span>
                  </label>
                )}
                {form.converted && form.recurring_retained && (
                  <label className="flex items-center gap-2 cursor-pointer" title="Client cancelled after their initial clean and never became a true recurring client.">
                    <input type="checkbox" checked={!!form.cancelled_after_initial} onChange={set('cancelled_after_initial')} className="w-4 h-4 accent-rose-500" />
                    <span className="text-sm text-gray-700">Cancelled after initial</span>
                    <span className="text-xs text-gray-400">(disqualifies from recurring bonus)</span>
                  </label>
                )}
              </div>
              {/* Date Initial Converted — shown when converted */}
              {form.converted && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date Initial Converted</label>
                  <input type="date" className="form-input" value={f(form.converted_date)} onChange={set('converted_date')} />
                  <p className="text-xs text-gray-400 mt-0.5">When the initial clean was booked</p>
                </div>
              )}
              {/* Date Recurring Set Up — only shown when recurring is checked */}
              {form.recurring_retained && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date Recurring Set Up</label>
                  <input type="date" className="form-input" value={f(form.recurring_converted_date)} onChange={set('recurring_converted_date')} />
                  <p className="text-xs text-gray-400 mt-0.5">When recurring service was scheduled — if different from initial, counts toward that month's bonus</p>
                </div>
              )}
              {form.converted && form.initial_clean_booked && !form.recurring_retained && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                  Initial clean booked — check "Recurring Retained" once they schedule ongoing service.
                </p>
              )}
              {!form.converted && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason Not Converted</label>
                  <input type="text" className="form-input" value={f(form.reason)} onChange={set('reason')} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <input type="text" className="form-input" value={f(form.notes)} onChange={set('notes')} />
              </div>
              {/* Add to Care Queue — shown when editing an existing recurring client */}
              {editId && form.recurring_retained && (
                <div className="pt-1 border-t border-gray-100">
                  {careMsg
                    ? <p className="text-xs text-ok font-medium py-1">{careMsg}</p>
                    : (
                      <button
                        type="button"
                        className="text-xs text-sage underline hover:no-underline"
                        onClick={async () => {
                          const r = await apiFetch(`/api/leads/${editId}/care`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                          const d = await r.json()
                          setCareMsg(d.created ? '✓ Care timeline created — check Client Care page' : '✓ Already in care queue')
                        }}
                      >
                        🌱 Add to Care Queue
                      </button>
                    )
                  }
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => { setShowForm(false); setCareMsg(null) }} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
