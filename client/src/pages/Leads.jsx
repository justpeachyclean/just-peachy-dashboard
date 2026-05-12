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
  rep_name: 'Lexi',
  client_name: '',
  frequency: '',
  initial_clean_price: '',
  price_per_clean: '',
  converted: false,
  initial_clean_booked: false,
  recurring_retained: false,
  lead_source: '',
  used_before: '',
  reason: '',
  notes: '',
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [filter, setFilter] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    converted: 'all',
  })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [careMsg, setCareMsg] = useState(null)

  // Debounce search input → search state (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = () => {
    const params = new URLSearchParams({ limit: 2000 })
    // When searching, drop the month filter so we search all records
    if (search.trim()) {
      // no month/year filter — load everything
    } else if (filter.month) {
      params.set('month', `${filter.year}-${filter.month}`)
    } else {
      params.set('year', filter.year)
    }
    apiFetch(`/api/leads?${params}`)
      .then(r => r.json())
      .then(setLeads)
  }

  useEffect(() => { load() }, [filter.year, filter.month, search])

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
      lead_source:          r.lead_source || '',
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
      recurring_retained:   form.recurring_retained   ? 1 : 0,
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

  const converted      = leads.filter(r => r.converted)
  const recurring      = converted.filter(r => r.recurring_retained)
  const quoted         = leads.filter(r => r.price_per_clean != null || r.quote_amount != null || r.initial_clean_price != null)
  const initialBooked  = leads.filter(r => r.initial_clean_booked)

  const totalAnnual    = recurring.reduce((s, r) => s + (r.annual_value || 0), 0)

  // Funnel rates — Initial→Recurring uses converted as denominator
  // (checking Recurring Retained auto-checks Initial Clean Booked, so they're equivalent)
  const leadToQuoteRate        = leads.length > 0     ? quoted.length / leads.length       : null
  const quoteToSaleRate        = quoted.length > 0    ? converted.length / quoted.length   : null
  const initialToRecurringRate = converted.length > 0 ? recurring.length / converted.length : null

  const monthLabel = filter.month
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
          <p className="text-sm text-gray-500 mt-0.5">Lead tracking — {monthLabel} · <span className="text-[11px] text-gray-400">🤖 new closes auto via GHL · Zapier (Step 5. Accepted) · ✏️ quotes &amp; details updated manually</span></p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => exportCsv(agencyFilename, agencyRows)} className="btn-secondary text-sm">
            ↓ Agency Export
          </button>
          <button onClick={() => exportCsv(exportFilename, visible)} className="btn-secondary text-sm">
            ↓ Full Export
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
        <select className="form-input w-24 text-sm" value={filter.year} onChange={e => setFilter(f => ({ ...f, year: e.target.value }))}>
          {['2026','2025','2024'].map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="form-input w-36 text-sm" value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}>
          <option value="">All months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
        </select>
        <select className="form-input w-36 text-sm" value={filter.converted} onChange={e => setFilter(f => ({ ...f, converted: e.target.value }))}>
          <option value="all">All leads</option>
          <option value="yes">Converted only</option>
          <option value="no">Not converted</option>
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
              <th className="text-left py-2 pr-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Rep</th>
              <th className="text-left py-2 px-2 font-medium">Client</th>
              <th className="text-center py-2 px-2 font-medium">Frequency</th>
              <th className="text-right py-2 px-2 font-medium">Quote</th>
              <th className="text-right py-2 px-2 font-medium">Annual Val.</th>
              <th className="text-center py-2 px-2 font-medium">Conv?</th>
              <th className="text-center py-2 px-2 font-medium" title="Initial clean booked">Init?</th>
              <th className="text-center py-2 px-2 font-medium">Recur?</th>
              <th className="text-left py-2 px-2 font-medium">Source</th>
              <th className="py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400 text-sm">
                  No leads for {monthLabel}.{' '}
                  <button onClick={() => { setEditId(null); setForm(BLANK_FORM); setShowForm(true) }} className="text-brand underline">Add one →</button>
                </td>
              </tr>
            ) : visible.map(r => (
              <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/40 cursor-pointer ${r.converted ? '' : 'opacity-60'}`} onClick={() => openEdit(r)}>
                <td className="py-2 pr-2 text-gray-500 whitespace-nowrap text-xs">{r.record_date}</td>
                <td className="py-2 px-2 text-gray-500 text-xs">{r.rep_name || '—'}</td>
                <td className="py-2 px-2 font-medium text-ink">{r.client_name || <span className="text-gray-300">—</span>}</td>
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
                    ? <span className="text-xs font-bold text-brand">Y</span>
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
                  <input type="text" className="form-input" value={f(form.rep_name)} onChange={set('rep_name')} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Client Name</label>
                <input type="text" className="form-input" value={f(form.client_name)} onChange={set('client_name')} />
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
              </div>
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
