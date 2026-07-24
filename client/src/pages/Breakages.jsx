import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'

const fmt$ = n => n != null ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

const BLANK = {
  report_date: today(),
  tech_name: '',
  client_name: '',
  item_broken: '',
  value: '',
  resolved: false,
  resolution_notes: '',
  notes: '',
}

export default function Breakages() {
  const [data, setData] = useState({ breakages: [], stats: {} })
  const [year, setYear] = useState(new Date().getFullYear())
  const [filter, setFilter] = useState('unresolved') // unresolved | resolved | all
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const load = () =>
    apiFetch(`/api/breakages?year=${year}&resolved=all`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})

  useEffect(() => { load() }, [year, filter])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const openAdd = () => {
    setEditId(null)
    setForm(BLANK)
    setSaveMsg('')
    setShowForm(true)
  }

  const openEdit = (row) => {
    setEditId(row.id)
    setForm({
      report_date: row.report_date || today(),
      tech_name: row.tech_name || '',
      client_name: row.client_name || '',
      item_broken: row.item_broken || '',
      value: row.value ?? '',
      resolved: !!row.resolved,
      resolution_notes: row.resolution_notes || '',
      notes: row.notes || '',
    })
    setSaveMsg('')
    setShowForm(true)
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const payload = {
        ...form,
        value: form.value !== '' ? parseFloat(form.value) : null,
        resolved: form.resolved ? 1 : 0,
      }
      const url = editId ? `/api/breakages/${editId}` : '/api/breakages'
      const method = editId ? 'PATCH' : 'POST'
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await res.text())
      setSaveMsg('Saved!')
      setShowForm(false)
      setEditId(null)
      load()
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const markResolved = async (row) => {
    await apiFetch(`/api/breakages/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: 1 }),
    })
    load()
  }

  const deleteRow = async (row) => {
    if (!window.confirm(`Delete breakage record for "${row.item_broken}"?`)) return
    await apiFetch(`/api/breakages/${row.id}`, { method: 'DELETE' })
    load()
  }

  const { breakages: allBreakages, stats } = data

  // Trends — computed from ALL records for the year (not filtered by tab)
  const allYear = allBreakages
  const byMonth = {}
  const byTech  = {}
  allYear.forEach(r => {
    const m = r.report_date?.slice(0, 7)
    if (m) {
      if (!byMonth[m]) byMonth[m] = { total: 0, resolved: 0, value: 0 }
      byMonth[m].total++
      if (r.resolved) byMonth[m].resolved++
      byMonth[m].value += r.value || 0
    }
    const t = r.tech_name?.trim() || 'Unknown'
    if (!byTech[t]) byTech[t] = { total: 0, value: 0 }
    byTech[t].total++
    byTech[t].value += r.value || 0
  })
  const monthRows = Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b))
  const techRows  = Object.entries(byTech).sort(([,a],[,b]) => b.total - a.total).slice(0, 8)
  const maxMonthTotal = Math.max(1, ...monthRows.map(([,v]) => v.total))
  const maxTechTotal  = Math.max(1, ...techRows.map(([,v]) => v.total))

  const breakages = filter === 'all' ? allBreakages
    : allBreakages.filter(r => filter === 'unresolved' ? !r.resolved : !!r.resolved)
  const currentYear = new Date().getFullYear()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Breakages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track items broken on the job — tech, client, value, and resolution</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="form-input text-sm py-1.5 w-28"
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={openAdd} className="btn-primary text-sm">+ Log Breakage</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="kpi-card border-danger">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unresolved</p>
          <p className="text-3xl font-bold text-danger mt-2">{stats.unresolved ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt$(stats.unresolved_value)} outstanding</p>
        </div>
        <div className="kpi-card border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total {year}</p>
          <p className="text-3xl font-bold text-ink mt-2">{stats.total ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.resolved ?? 0} resolved</p>
        </div>
        <div className="kpi-card border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Value</p>
          <p className="text-3xl font-bold text-ink mt-2">{fmt$(stats.total_value)}</p>
          <p className="text-xs text-gray-400 mt-1">all breakages {year}</p>
        </div>
        <div className="kpi-card border-ok">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resolved</p>
          <p className="text-3xl font-bold text-ok mt-2">{stats.resolved ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.total > 0 ? `${Math.round((stats.resolved / stats.total) * 100)}% resolution rate` : '—'}
          </p>
        </div>
      </div>

      {/* Trends */}
      {monthRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Monthly breakdown */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Monthly Breakdown</p>
            <div className="space-y-2">
              {monthRows.map(([month, d]) => {
                const label = new Date(month + '-15').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
                const barW = Math.round((d.total / maxMonthTotal) * 100)
                const resolvedW = d.total > 0 ? Math.round((d.resolved / d.total) * 100) : 0
                return (
                  <div key={month} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-8 shrink-0">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-3 rounded-full bg-red-200 relative" style={{ width: `${barW}%` }}>
                        <div className="absolute inset-y-0 left-0 bg-green-400 rounded-full" style={{ width: `${resolvedW}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-ink w-4 text-right">{d.total}</span>
                    <span className="text-xs text-gray-400 w-16 text-right">{d.value > 0 ? fmt$(d.value) : ''}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="inline-block w-3 h-3 rounded-full bg-green-400"></span>Resolved</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="inline-block w-3 h-3 rounded-full bg-red-200"></span>Open</span>
            </div>
          </div>

          {/* By technician */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">By Technician</p>
            {techRows.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No technician data</p>
              : (
                <div className="space-y-2">
                  {techRows.map(([tech, d]) => (
                    <div key={tech} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-28 shrink-0 truncate" title={tech}>{tech}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="h-3 rounded-full bg-warn" style={{ width: `${Math.round((d.total / maxTechTotal) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-ink w-4 text-right">{d.total}</span>
                      <span className="text-xs text-gray-400 w-16 text-right">{d.value > 0 ? fmt$(d.value) : ''}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
          {[['unresolved','Unresolved'],['resolved','Resolved'],['all','All']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${filter === v ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6 border border-brand/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">{editId ? 'Edit Breakage' : 'Log New Breakage'}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" required className="form-input" value={form.report_date} onChange={set('report_date')} />
              </div>
              <div>
                <label className="form-label">Technician Name</label>
                <input type="text" className="form-input" placeholder="e.g. Maria" value={form.tech_name} onChange={set('tech_name')} />
              </div>
              <div>
                <label className="form-label">Client Name</label>
                <input type="text" className="form-input" placeholder="Whose home" value={form.client_name} onChange={set('client_name')} />
              </div>
              <div className="col-span-2 sm:col-span-2">
                <label className="form-label">What Was Broken *</label>
                <input type="text" required className="form-input" placeholder="e.g. Ceramic vase, window blind, picture frame" value={form.item_broken} onChange={set('item_broken')} />
              </div>
              <div>
                <label className="form-label">Estimated Value ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01" className="form-input pl-7" placeholder="0.00"
                    value={form.value} onChange={set('value')} />
                </div>
              </div>
            </div>
            <div>
              <label className="form-label">Additional Notes</label>
              <textarea rows={2} className="form-input" placeholder="How it happened, any other context…"
                value={form.notes} onChange={set('notes')} />
            </div>
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-3 mb-3">
                <input type="checkbox" id="resolved" className="w-4 h-4 accent-ok"
                  checked={form.resolved} onChange={set('resolved')} />
                <label htmlFor="resolved" className="text-sm font-medium text-gray-700">Mark as Resolved</label>
              </div>
              {form.resolved && (
                <div>
                  <label className="form-label">How Was It Resolved?</label>
                  <textarea rows={2} className="form-input" placeholder="e.g. Replaced item, client compensated $X, no action needed…"
                    value={form.resolution_notes} onChange={set('resolution_notes')} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              {saveMsg && <p className={`text-sm font-medium ${saveMsg.startsWith('Error') ? 'text-danger' : 'text-ok'}`}>{saveMsg}</p>}
              <div className="flex gap-3 ml-auto">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Breakage'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {breakages.length === 0 ? (
        <div className="card text-center py-14 text-gray-400">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-medium text-ink mb-1">
            {filter === 'unresolved' ? 'No unresolved breakages' : 'No breakages recorded'}
          </p>
          <p className="text-sm">
            {filter === 'unresolved'
              ? 'All breakages for this year are resolved.'
              : <button onClick={openAdd} className="text-brand underline">Log the first one →</button>}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Technician</th>
                <th className="text-left py-2 px-2 font-medium">Client</th>
                <th className="text-left py-2 px-2 font-medium">What Was Broken</th>
                <th className="text-right py-2 px-2 font-medium">Value</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Resolution</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {breakages.map(row => (
                <tr key={row.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${row.resolved ? 'opacity-70' : ''}`}>
                  <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{row.report_date}</td>
                  <td className="py-2.5 px-2 font-medium text-ink">{row.tech_name || <span className="text-gray-300">—</span>}</td>
                  <td className="py-2.5 px-2 text-gray-600">{row.client_name || <span className="text-gray-300">—</span>}</td>
                  <td className="py-2.5 px-2">
                    <span className="font-medium text-ink">{row.item_broken}</span>
                    {row.notes && <p className="text-xs text-gray-400 mt-0.5">{row.notes}</p>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-medium">
                    {row.value != null
                      ? <span className={row.resolved ? 'text-gray-400' : 'text-danger'}>{fmt$(row.value)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 px-2">
                    {row.resolved
                      ? <span className="text-xs bg-green-50 text-ok border border-green-100 px-2 py-0.5 rounded-full font-semibold">✓ Resolved</span>
                      : <span className="text-xs bg-red-50 text-danger border border-red-100 px-2 py-0.5 rounded-full font-semibold">Open</span>}
                  </td>
                  <td className="py-2.5 px-2 text-xs text-gray-500 max-w-[180px]">
                    {row.resolution_notes
                      ? <span title={row.resolution_notes}>{row.resolution_notes.length > 50 ? row.resolution_notes.slice(0, 50) + '…' : row.resolution_notes}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 pl-2">
                    <div className="flex items-center gap-1.5">
                      {!row.resolved && (
                        <button onClick={() => markResolved(row)}
                          className="text-xs bg-green-50 border border-green-100 text-ok px-2 py-1 rounded-lg hover:bg-green-100 font-medium whitespace-nowrap">
                          ✓ Resolve
                        </button>
                      )}
                      <button onClick={() => openEdit(row)}
                        className="text-xs border border-gray-200 bg-white px-2 py-1 rounded-lg hover:bg-gray-50 font-medium text-gray-600">
                        Edit
                      </button>
                      <button onClick={() => deleteRow(row)}
                        className="text-gray-300 hover:text-danger transition-colors px-1" title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
