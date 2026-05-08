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
}
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'tri-weekly', 'every 4 weeks', 'one_time']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt$ = n => n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'

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
  const headers = ['Date', 'Rep', 'Client Name', 'Frequency', 'Quote', 'Annual Value', 'Converted', 'Recurring', 'Lead Source', 'Reason']
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

const VISITS = { weekly: 52, biweekly: 26, 'bi-weekly': 26, monthly: 13, 'every 4 weeks': 13, one_time: 1, 'one time': 1, 'one-time': 1, 'tri-weekly': 17 }

function calcAnnual(price, frequency) {
  if (!price || !frequency) return null
  const mult = VISITS[frequency.toLowerCase().trim()]
  if (!mult) return null
  return Math.round(parseFloat(price) * mult)
}

const BLANK_FORM = {
  record_date: new Date().toISOString().slice(0, 10),
  rep_name: 'Lexi',
  client_name: '',
  frequency: '',
  price_per_clean: '',
  converted: false,
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
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  const load = () => {
    const params = new URLSearchParams({ year: filter.year, limit: 2000 })
    if (filter.month) params.set('month', `${filter.year}-${filter.month}`)
    apiFetch(`/api/leads?${params}`)
      .then(r => r.json())
      .then(data => {
        setLeads(data)
      })
  }

  useEffect(() => { load() }, [filter.year, filter.month])

  const f = v => (v ?? '').toString()
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const openEdit = r => {
    setEditId(r.id)
    setForm({
      record_date:        r.record_date || new Date().toISOString().slice(0, 10),
      rep_name:           r.rep_name || '',
      client_name:        r.client_name || '',
      frequency:          r.frequency || '',
      price_per_clean:    r.price_per_clean ?? r.quote_amount ?? '',
      converted:          !!r.converted,
      recurring_retained: !!r.recurring_retained,
      lead_source:        r.lead_source || '',
      used_before:        r.used_before || '',
      reason:             r.reason || '',
      notes:              r.notes || '',
    })
    setShowForm(true)
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    const cleanPrice = form.price_per_clean ? parseFloat(form.price_per_clean) : null
    const payload = {
      ...form,
      quote_amount:    cleanPrice,
      price_per_clean: cleanPrice,
      converted:          form.converted          ? 1 : 0,
      recurring_retained: form.recurring_retained ? 1 : 0,
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

  // Apply converted filter
  const visible = leads.filter(r => {
    if (filter.converted === 'yes') return r.converted
    if (filter.converted === 'no') return !r.converted
    return true
  })

  const converted = leads.filter(r => r.converted)
  const recurring = converted.filter(r => r.recurring_retained)
  const totalAnnual = recurring.reduce((s, r) => s + (r.annual_value || 0), 0)
  const closeRate = leads.length > 0 ? converted.length / leads.length : null

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
          <p className="text-sm text-gray-500 mt-0.5">Lead tracking — {monthLabel}</p>
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


      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="kpi-card border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leads In</p>
          <p className="text-3xl font-bold text-ink mt-2">{leads.length}</p>
        </div>
        <div className="kpi-card border-ok">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Converted</p>
          <p className="text-3xl font-bold text-ok mt-2">{converted.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            {closeRate != null ? `${(closeRate * 100).toFixed(1)}% close rate` : ''}
          </p>
        </div>
        <div className="kpi-card border-brand">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recurring Retained</p>
          <p className="text-3xl font-bold text-brand mt-2">{recurring.length}</p>
        </div>
        <div className="kpi-card border-peach">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. Annual Value</p>
          <p className="text-3xl font-bold text-ink mt-2">{totalAnnual > 0 ? fmt$(totalAnnual) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">recurring only</p>
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
        <span className="text-sm text-gray-400">{visible.length} records</span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2 pr-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Rep</th>
              <th className="text-left py-2 px-2 font-medium">Client</th>
              <th className="text-center py-2 px-2 font-medium">Frequency</th>
              <th className="text-right py-2 px-2 font-medium">Quote</th>
              <th className="text-right py-2 px-2 font-medium">Annual Val.</th>
              <th className="text-center py-2 px-2 font-medium">Conv?</th>
              <th className="text-center py-2 px-2 font-medium">Recurring?</th>
              <th className="text-left py-2 px-2 font-medium">Source</th>
              <th className="py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-400 text-sm">
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

      {/* Add lead modal */}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Frequency / Service</label>
                  <select className="form-input" value={f(form.frequency)} onChange={set('frequency')}>
                    <option value="">— select —</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f] || f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Price Per Clean ($)</label>
                  <input type="number" min="0" step="0.01" className="form-input" placeholder="e.g. 185" value={f(form.price_per_clean)} onChange={set('price_per_clean')} />
                </div>
              </div>
              {/* Live annual value preview */}
              {form.price_per_clean && form.frequency && (() => {
                const annual = calcAnnual(form.price_per_clean, form.frequency)
                const freq = form.frequency.toLowerCase().trim()
                const isOneTime = ['one_time','one time','one-time'].includes(freq)
                const mult = VISITS[freq]
                if (!annual) return null
                return (
                  <div className="flex items-center gap-2 px-3 py-2 bg-brand/5 border border-brand/15 rounded-lg text-sm">
                    <span className="text-brand font-bold text-base">{fmt$(annual)}</span>
                    <span className="text-gray-500">
                      {isOneTime
                        ? 'one-time service'
                        : `annual value · ${fmt$(parseFloat(form.price_per_clean))} × ${mult} visits/yr`}
                    </span>
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
              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.converted} onChange={set('converted')} className="w-4 h-4 accent-ok" />
                  <span className="text-sm text-gray-700">Converted</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.recurring_retained} onChange={set('recurring_retained')} className="w-4 h-4 accent-brand" />
                  <span className="text-sm text-gray-700">Recurring Retained</span>
                </label>
              </div>
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
