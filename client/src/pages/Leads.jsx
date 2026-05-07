import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const FREQ_LABELS = {
  weekly:        'Weekly',
  biweekly:      'Biweekly',
  'bi-weekly':   'Biweekly',
  monthly:       'Monthly',
  'tri-weekly':  'Tri-Weekly',
  'every 4 weeks': 'Every 4 Wks',
  one_time:      'One-Time',
  'one time':    'One-Time',
  'one-time':    'One-Time',
}

const FREQ_COLORS = {
  weekly:        'bg-brand/10 text-brand',
  biweekly:      'bg-ok/10 text-ok',
  'bi-weekly':   'bg-ok/10 text-ok',
  monthly:       'bg-peach/20 text-amber-700',
  'tri-weekly':  'bg-purple-50 text-purple-700',
  'every 4 weeks': 'bg-peach/20 text-amber-700',
  one_time:      'bg-gray-100 text-gray-500',
  'one time':    'bg-gray-100 text-gray-500',
  'one-time':    'bg-gray-100 text-gray-500',
}

const fmt$ = n => n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function FreqBadge({ freq }) {
  if (!freq) return <span className="text-gray-300 text-xs">—</span>
  const key = freq.toLowerCase().trim()
  const label = FREQ_LABELS[key] || freq
  const color = FREQ_COLORS[key] || 'bg-gray-100 text-gray-500'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
}

function exportCsv(filename, rows) {
  const headers = ['Date', 'Client Name', 'Frequency', 'Price/Clean', 'Annual Value', 'Rep']
  const lines = [headers.join(','), ...rows.map(r => [
    r.record_date,
    `"${(r.client_name || '').replace(/"/g, '""')}"`,
    r.frequency || '',
    r.price_per_clean != null ? r.price_per_clean : '',
    r.annual_value != null ? r.annual_value : '',
    `"${(r.rep_name || '').replace(/"/g, '""')}"`,
  ].join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'tri-weekly', 'every 4 weeks', 'one_time']
const currentYM = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [filter, setFilter] = useState({ year: String(new Date().getFullYear()), month: '' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ record_date: new Date().toISOString().slice(0, 10), client_name: '', frequency: 'biweekly', price_per_clean: '', rep_name: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [pricingSet, setPricingSet] = useState(true)

  const load = () => {
    const params = new URLSearchParams({ year: filter.year, limit: 1000 })
    if (filter.month) params.set('month', `${filter.year}-${filter.month}`)
    fetch(`/api/leads?${params}`)
      .then(r => r.json())
      .then(data => {
        setLeads(data)
        if (data.length > 0 && data.some(r => r.annual_value == null && r.frequency !== 'one_time')) {
          setPricingSet(false)
        } else {
          setPricingSet(true)
        }
      })
  }

  useEffect(() => { load() }, [filter])

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, price_per_clean: form.price_per_clean ? parseFloat(form.price_per_clean) : null, source: 'manual' }),
    })
    setSaving(false)
    setShowForm(false)
    setForm({ record_date: new Date().toISOString().slice(0, 10), client_name: '', frequency: 'biweekly', price_per_clean: '', rep_name: '', notes: '' })
    load()
  }

  const del = async id => {
    if (!confirm('Remove this record?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    load()
  }

  const totalAnnual = leads.reduce((s, r) => s + (r.annual_value || 0), 0)
  const recurring = leads.filter(r => !['one_time','one time','one-time'].includes((r.frequency || '').toLowerCase()))
  const oneTime = leads.filter(r => ['one_time','one time','one-time'].includes((r.frequency || '').toLowerCase()))

  const monthLabel = filter.month
    ? `${MONTH_NAMES[parseInt(filter.month) - 1]} ${filter.year}`
    : filter.year

  const exportFilename = `jpc-leads-${filter.month ? `${filter.year}-${filter.month}` : filter.year}.csv`

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Closed sales — frequency &amp; annual value</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCsv(exportFilename, leads)}
            className="btn-secondary text-sm"
          >
            ↓ Export for Agency
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Record</button>
        </div>
      </div>

      {!pricingSet && (
        <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-xl px-4 py-3 text-xs text-gray-500 mb-5">
          <span className="text-warn mt-0.5">⚠</span>
          <span>
            Annual values are incomplete — set avg clean prices in{' '}
            <Link to="/settings" className="text-brand underline">Settings → Client Pricing</Link>.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select
          className="form-input w-28 text-sm"
          value={filter.year}
          onChange={e => setFilter(f => ({ ...f, year: e.target.value, month: '' }))}
        >
          {['2026','2025','2024'].map(y => <option key={y}>{y}</option>)}
        </select>
        <select
          className="form-input w-36 text-sm"
          value={filter.month}
          onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}
        >
          <option value="">All months</option>
          {MONTH_NAMES.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400">{leads.length} records</span>
      </div>

      {/* Summary cards */}
      {leads.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="kpi-card border-brand">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Closes</p>
            <p className="text-3xl font-bold text-ink mt-2">{leads.length}</p>
            <p className="text-xs text-gray-400 mt-1">{recurring.length} recurring · {oneTime.length} one-time</p>
          </div>
          <div className="kpi-card border-peach">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. Annual Value</p>
            <p className="text-3xl font-bold text-ink mt-2">{fmt$(totalAnnual || null)}</p>
            <p className="text-xs text-gray-400 mt-1">recurring clients only</p>
          </div>
          <div className="kpi-card border-ok">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Weekly / Biweekly</p>
            <p className="text-3xl font-bold text-ok mt-2">
              {leads.filter(r => ['weekly','biweekly','bi-weekly'].includes((r.frequency||'').toLowerCase())).length}
            </p>
            <p className="text-xs text-gray-400 mt-1">highest-value frequency</p>
          </div>
          <div className="kpi-card border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Annual Value</p>
            <p className="text-3xl font-bold text-ink mt-2">
              {recurring.length > 0 && totalAnnual ? fmt$(Math.round(totalAnnual / recurring.length)) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">per recurring client</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2 pr-3 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Client</th>
              <th className="text-center py-2 px-2 font-medium">Frequency</th>
              <th className="text-right py-2 px-2 font-medium">Price/Clean</th>
              <th className="text-right py-2 px-2 font-medium">Annual Value</th>
              <th className="text-left py-2 px-2 font-medium">Rep</th>
              <th className="py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  No records for {monthLabel}.{' '}
                  <button onClick={() => setShowForm(true)} className="text-brand underline">Add one →</button>
                </td>
              </tr>
            ) : leads.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{r.record_date}</td>
                <td className="py-2.5 px-2 font-medium text-ink">{r.client_name || <span className="text-gray-300">—</span>}</td>
                <td className="py-2.5 px-2 text-center"><FreqBadge freq={r.frequency} /></td>
                <td className="py-2.5 px-2 text-right text-gray-600">
                  {r.price_per_clean != null ? fmt$(r.price_per_clean) : <span className="text-gray-300">avg</span>}
                </td>
                <td className="py-2.5 px-2 text-right font-semibold">
                  {r.annual_value != null ? <span className="text-ink">{fmt$(r.annual_value)}</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 px-2 text-gray-500">{r.rep_name || <span className="text-gray-300">—</span>}</td>
                <td className="py-2.5 pl-2">
                  <button onClick={() => del(r.id)} className="text-gray-200 hover:text-danger text-xs transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add record modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-ink">Add Closed Sale</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date</label>
                <input type="date" required className="form-input" value={form.record_date} onChange={e => setForm(p => ({ ...p, record_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Client Name</label>
                <input type="text" className="form-input" value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Frequency</label>
                <select className="form-input" value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f] || f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Price per Clean (optional — uses avg if blank)</label>
                <input type="number" min="0" step="0.01" className="form-input" placeholder="leave blank for avg" value={form.price_per_clean} onChange={e => setForm(p => ({ ...p, price_per_clean: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rep Name</label>
                <input type="text" className="form-input" value={form.rep_name} onChange={e => setForm(p => ({ ...p, rep_name: e.target.value }))} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
