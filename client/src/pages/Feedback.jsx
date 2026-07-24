import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// MaidCentral rates 0–4 (there is no 5th star)
const RATING_MAX = 4

function StarRating({ value, max = RATING_MAX }) {
  if (value == null || value === '') return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className="text-sm">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'text-yellow-400' : 'text-gray-200'}>★</span>
      ))}
      <span className="text-xs text-gray-500 ml-1">{value}/{max}</span>
    </span>
  )
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

const BLANK = {
  client_name: '', feedback_date: today(),
  rating: '4', feedback_type: 'survey', comment: '', tech_name: '',
}

const RECLEAN_BLANK = {
  reclean_date: today(), original_clean_date: '',
  client_name: '', tech_name: '', reason: '', notes: '',
}

function splitCSVLine(line) {
  const cells = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
    else { cur += c }
  }
  cells.push(cur.trim())
  return cells
}

function parseMCDate(raw) {
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10)
  return null
}

function parseMCRating(raw) {
  if (!raw) return null
  const m = raw.match(/^(\d)/)
  return m ? parseInt(m[1]) : null
}

function parseMCComment(raw) {
  if (!raw) return null
  return raw.replace(/^Text Response:\s*\d+\s*/i, '').trim() || null
}

function parseScorecardsCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase())

  const col = name => headers.indexOf(name)
  const iCustomer  = col('customer')
  const iJobDate   = col('job date')
  const iTechs     = col('techs')
  const iResponse  = headers.findIndex(h => h === 'response')
  const iComments  = col('comments')

  const iDate = iJobDate >= 0 ? iJobDate : headers.findIndex(h => h.includes('date') && !h.includes('sent') && !h.includes('last'))
  const iName = iCustomer >= 0 ? iCustomer : headers.findIndex(h => h.includes('customer') || h.includes('client') || h === 'name')
  const iTech = iTechs >= 0 ? iTechs : headers.findIndex(h => h.includes('tech') || h.includes('cleaner') || h.includes('employee'))
  const iRate = iResponse >= 0 ? iResponse : headers.findIndex(h => h.includes('response') || h.includes('rating') || h.includes('score'))
  const iNote = iComments >= 0 ? iComments : headers.findIndex(h => h.includes('comment') || h.includes('notes'))

  if (iDate < 0) return []

  return lines.slice(1).map(line => {
    if (!line.trim()) return null
    const row = splitCSVLine(line)
    const feedback_date = parseMCDate(row[iDate])
    if (!feedback_date) return null
    const client_name = iName >= 0 ? (row[iName]?.trim() || null) : null
    const tech_name   = iTech >= 0 ? (row[iTech]?.trim() || null) : null
    const rating      = iRate >= 0 ? parseMCRating(row[iRate]) : null
    const comment     = iNote >= 0 ? parseMCComment(row[iNote]) : null
    const external_id = [client_name, feedback_date, tech_name].filter(Boolean).join('|')
    return { client_name, feedback_date, rating, feedback_type: 'scorecard', tech_name, comment, external_id: external_id || null }
  }).filter(Boolean)
}

export default function Feedback() {
  const year = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState('feedback')
  const [selYear, setSelYear] = useState(year)

  // Feedback state
  const [data, setData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState('')
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)

  // Recleans state
  const [recleanData, setRecleanData] = useState(null)
  const [showRecleanForm, setShowRecleanForm] = useState(false)
  const [recleanForm, setRecleanForm] = useState(RECLEAN_BLANK)
  const [recleanSaving, setRecleanSaving] = useState(false)
  const [recleanSaved, setRecleanSaved] = useState(false)
  const [recleanFilter, setRecleanFilter] = useState('')
  const [editingReclean, setEditingReclean] = useState(null)
  const [editRecleanForm, setEditRecleanForm] = useState({})
  const [editRecleanSaving, setEditRecleanSaving] = useState(false)

  const load = () =>
    apiFetch(`/api/feedback?year=${selYear}`)
      .then(r => r.json())
      .then(setData)

  const loadRecleans = () =>
    apiFetch(`/api/recleans?year=${selYear}`)
      .then(r => r.json())
      .then(setRecleanData)

  useEffect(() => {
    load()
    loadRecleans()
  }, [selYear])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setR = (k, v) => setRecleanForm(p => ({ ...p, [k]: v }))

  // Feedback handlers
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await apiFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, rating: parseInt(form.rating) }),
    })
    setSaving(false)
    setSaved(true)
    setForm(BLANK)
    setShowForm(false)
    setTimeout(() => setSaved(false), 3000)
    load()
  }

  const startEdit = (r) => {
    setEditingRow(r.id)
    setEditForm({
      client_name: r.client_name || '',
      feedback_date: r.feedback_date || '',
      rating: String(r.rating ?? '4'),
      feedback_type: r.feedback_type || 'survey',
      comment: r.comment || '',
      tech_name: r.tech_name || '',
    })
  }

  const saveEdit = async (id) => {
    setEditSaving(true)
    await apiFetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, rating: parseInt(editForm.rating) }),
    })
    setEditSaving(false)
    setEditingRow(null)
    load()
  }

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const records = parseScorecardsCSV(text)
      if (records.length === 0) {
        const firstLine = text.split('\n')[0].slice(0, 120)
        setImportResult({ error: `No valid rows parsed. Header row detected: "${firstLine}". Expected columns: Customer, Job Date, Techs, Response.` })
        return
      }
      const res = await apiFetch('/api/feedback/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const d = await res.json()
      setImportResult(d)
      if (d.inserted > 0) load()
    } catch (err) {
      setImportResult({ error: err.message })
    } finally {
      setImporting(false)
      setTimeout(() => setImportResult(null), 8000)
    }
  }

  const deleteRow = async (r) => {
    if (!window.confirm(`Delete feedback from ${r.client_name || 'this client'}?`)) return
    await apiFetch(`/api/feedback/${r.id}`, { method: 'DELETE' })
    load()
  }

  // Reclean handlers
  const handleRecleanSubmit = async (e) => {
    e.preventDefault()
    setRecleanSaving(true)
    await apiFetch('/api/recleans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recleanForm),
    })
    setRecleanSaving(false)
    setRecleanSaved(true)
    setRecleanForm(RECLEAN_BLANK)
    setShowRecleanForm(false)
    setTimeout(() => setRecleanSaved(false), 3000)
    loadRecleans()
  }

  const startEditReclean = (r) => {
    setEditingReclean(r.id)
    setEditRecleanForm({
      reclean_date: r.reclean_date || '',
      original_clean_date: r.original_clean_date || '',
      client_name: r.client_name || '',
      tech_name: r.tech_name || '',
      reason: r.reason || '',
      notes: r.notes || '',
    })
  }

  const saveEditReclean = async (id) => {
    setEditRecleanSaving(true)
    await apiFetch(`/api/recleans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editRecleanForm),
    })
    setEditRecleanSaving(false)
    setEditingReclean(null)
    loadRecleans()
  }

  const deleteReclean = async (r) => {
    if (!window.confirm(`Delete reclean for ${r.client_name || 'this client'}?`)) return
    await apiFetch(`/api/recleans/${r.id}`, { method: 'DELETE' })
    loadRecleans()
  }

  const stats = data?.stats || {}
  const monthly = data?.stats?.monthly || []
  const rows = (data?.feedback || []).filter(r =>
    !filter ||
    (r.client_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.comment || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.tech_name || '').toLowerCase().includes(filter.toLowerCase())
  )

  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i)

  const dist = [4,3,2,1,0].map(star => ({
    star,
    count: (data?.feedback || []).filter(r => r.rating === star).length,
  }))
  const distMax = Math.max(1, ...dist.map(d => d.count))

  const recleans = (recleanData?.recleans || []).filter(r =>
    !recleanFilter ||
    (r.client_name || '').toLowerCase().includes(recleanFilter.toLowerCase()) ||
    (r.tech_name || '').toLowerCase().includes(recleanFilter.toLowerCase()) ||
    (r.reason || '').toLowerCase().includes(recleanFilter.toLowerCase())
  )
  const recleanMonthly = recleanData?.stats?.monthly || []
  const recleanByTech = recleanData?.stats?.by_tech || []
  const recleanMonthMax = Math.max(1, ...recleanMonthly.map(m => m.count))
  const recleanTechMax = Math.max(1, ...recleanByTech.map(t => t.count))

  // MTD reclean count (current month)
  const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()).slice(0, 7)
  const recleanMTD = (recleanData?.recleans || []).filter(r => r.reclean_date?.startsWith(currentMonth)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">Scorecards, reviews, satisfaction trends · recleans</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="form-input py-1.5 px-2 text-sm w-24"
            value={selYear}
            onChange={e => setSelYear(parseInt(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {activeTab === 'feedback' && (
            <>
              <label className={`btn-secondary text-sm cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                {importing ? 'Importing…' : '↑ Import Scorecards'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
              </label>
              <button onClick={() => setShowForm(p => !p)} className="btn-primary text-sm">
                {showForm ? 'Cancel' : '+ Log Feedback'}
              </button>
            </>
          )}
          {activeTab === 'recleans' && (
            <button onClick={() => setShowRecleanForm(p => !p)} className="btn-primary text-sm">
              {showRecleanForm ? 'Cancel' : '+ Log Reclean'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 w-fit">
        {[['feedback', 'Feedback'], ['recleans', 'Recleans']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === key ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {key === 'recleans' && recleanMTD > 0 && (
              <span className="ml-1.5 bg-warn/20 text-warn text-xs font-semibold px-1.5 py-0.5 rounded-full">{recleanMTD}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── FEEDBACK TAB ── */}
      {activeTab === 'feedback' && (
        <>
          {importResult && (
            <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-medium border ${importResult.error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
              {importResult.error
                ? `Import error: ${importResult.error}`
                : `✓ Import complete — ${importResult.inserted} added, ${importResult.skipped} skipped (already existed or had manual entry)`
              }
            </div>
          )}

          {saved && (
            <div className="mb-4 px-4 py-2 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
              ✓ Feedback logged
            </div>
          )}

          {showForm && (
            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Log Feedback
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="form-label">Client Name</label>
                    <input className="form-input" value={form.client_name} onChange={e => set('client_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Date *</label>
                    <input type="date" required className="form-input" value={form.feedback_date} onChange={e => set('feedback_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Rating (0–4)</label>
                    <select className="form-input" value={form.rating} onChange={e => set('rating', e.target.value)}>
                      {[4,3,2,1,0].map(n => <option key={n} value={n}>{n} — {'★'.repeat(n) || 'no stars'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Type</label>
                    <select className="form-input" value={form.feedback_type} onChange={e => set('feedback_type', e.target.value)}>
                      <option value="survey">Survey</option>
                      <option value="review">Google / Online Review</option>
                      <option value="nps">NPS</option>
                      <option value="complaint">Complaint</option>
                      <option value="compliment">Compliment</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Tech Name</label>
                    <input className="form-input" value={form.tech_name} onChange={e => set('tech_name', e.target.value)} placeholder="Which cleaner" />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label">Comment / Verbatim</label>
                  <textarea className="form-input h-20 resize-none" value={form.comment} onChange={e => set('comment', e.target.value)} placeholder="Client's exact words…" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Saving…' : 'Save Feedback'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Responses', value: stats.total ?? '—' },
              { label: 'Avg Rating', value: stats.avg_rating != null ? `${stats.avg_rating} / ${RATING_MAX}` : '—' },
              { label: 'Top (4★) Reviews', value: (data?.feedback || []).filter(r => r.rating === 4).length || '—' },
              { label: 'Complaints', value: (data?.feedback || []).filter(r => r.rating != null && r.rating <= 1).length || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="card text-center py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="card">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Monthly Avg Rating</h2>
              {monthly.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
                : (
                  <div className="space-y-2">
                    {monthly.map(m => {
                      const month = parseInt(m.month.split('-')[1]) - 1
                      const pct = Math.round((m.avg / RATING_MAX) * 100)
                      return (
                        <div key={m.month} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-8 shrink-0">{MONTH_LABELS[month]}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${m.avg >= 3.5 ? 'bg-green-400' : m.avg >= 2.5 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-ink w-8">{m.avg}</span>
                          <span className="text-xs text-gray-400 w-12 text-right">{m.count} resp.</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Rating Distribution</h2>
              {stats.total === 0
                ? <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
                : (
                  <div className="space-y-2">
                    {dist.map(({ star, count }) => (
                      <div key={star} className="flex items-center gap-3">
                        <span className="text-xs text-yellow-500 w-10 shrink-0">{star === 0 ? '0★' : '★'.repeat(star)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${star >= 3 ? 'bg-green-400' : star === 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${distMax > 0 ? Math.round((count/distMax)*100) : 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-ink w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-ink">All Feedback</h2>
              <input
                className="form-input py-1.5 text-sm w-48"
                placeholder="Search client, tech, comment…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>

            {rows.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <p className="mb-1">No feedback logged yet for {selYear}.</p>
                <p className="text-xs">Log manually or connect the webhook for automatic tracking.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left py-2 pr-3 font-medium">Date</th>
                      <th className="text-left py-2 pr-3 font-medium">Client</th>
                      <th className="text-left py-2 pr-3 font-medium">Rating</th>
                      <th className="text-left py-2 pr-3 font-medium hidden sm:table-cell">Tech</th>
                      <th className="text-left py-2 font-medium">Comment</th>
                      <th className="py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <>
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{r.feedback_date}</td>
                          <td className="py-2 pr-3 font-medium text-ink">{r.client_name || '—'}</td>
                          <td className="py-2 pr-3"><StarRating value={r.rating} /></td>
                          <td className="py-2 pr-3 text-xs text-gray-500 hidden sm:table-cell">{r.tech_name || '—'}</td>
                          <td className="py-2 text-xs text-gray-600 max-w-xs truncate italic">
                            {r.comment ? `"${r.comment}"` : <span className="text-gray-300 not-italic">—</span>}
                          </td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => editingRow === r.id ? setEditingRow(null) : startEdit(r)}
                                className="text-xs text-sage hover:text-sagehover font-medium"
                              >
                                {editingRow === r.id ? 'Cancel' : 'Edit'}
                              </button>
                              <button
                                onClick={() => deleteRow(r)}
                                className="text-gray-300 hover:text-red-400 transition-colors text-xs"
                                title="Delete"
                              >✕</button>
                            </div>
                          </td>
                        </tr>
                        {editingRow === r.id && (
                          <tr key={`edit-${r.id}`} className="bg-gray-50/60">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                                <div>
                                  <label className="form-label text-xs">Client Name</label>
                                  <input className="form-input py-1 text-sm" value={editForm.client_name} onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Date</label>
                                  <input type="date" className="form-input py-1 text-sm" value={editForm.feedback_date} onChange={e => setEditForm(p => ({ ...p, feedback_date: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Rating</label>
                                  <select className="form-input py-1 text-sm" value={editForm.rating} onChange={e => setEditForm(p => ({ ...p, rating: e.target.value }))}>
                                    {[4,3,2,1,0].map(n => <option key={n} value={n}>{n} ★</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="form-label text-xs">Type</label>
                                  <select className="form-input py-1 text-sm" value={editForm.feedback_type} onChange={e => setEditForm(p => ({ ...p, feedback_type: e.target.value }))}>
                                    <option value="survey">Survey</option>
                                    <option value="review">Review</option>
                                    <option value="nps">NPS</option>
                                    <option value="complaint">Complaint</option>
                                    <option value="compliment">Compliment</option>
                                    <option value="scorecard">Scorecard</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="form-label text-xs">Tech Name</label>
                                  <input className="form-input py-1 text-sm" value={editForm.tech_name} onChange={e => setEditForm(p => ({ ...p, tech_name: e.target.value }))} />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="form-label text-xs">Comment</label>
                                  <input className="form-input py-1 text-sm" value={editForm.comment} onChange={e => setEditForm(p => ({ ...p, comment: e.target.value }))} />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingRow(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                                <button onClick={() => saveEdit(r.id)} disabled={editSaving} className="btn-primary text-sm">
                                  {editSaving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── RECLEANS TAB ── */}
      {activeTab === 'recleans' && (
        <>
          {recleanSaved && (
            <div className="mb-4 px-4 py-2 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
              ✓ Reclean logged
            </div>
          )}

          {showRecleanForm && (
            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Log Reclean
              </h2>
              <form onSubmit={handleRecleanSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="form-label">Client Name</label>
                    <input className="form-input" value={recleanForm.client_name} onChange={e => setR('client_name', e.target.value)} placeholder="Who requested the reclean" />
                  </div>
                  <div>
                    <label className="form-label">Tech Name</label>
                    <input className="form-input" value={recleanForm.tech_name} onChange={e => setR('tech_name', e.target.value)} placeholder="Which cleaner did the original clean" />
                  </div>
                  <div>
                    <label className="form-label">Reclean Date *</label>
                    <input type="date" required className="form-input" value={recleanForm.reclean_date} onChange={e => setR('reclean_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Original Clean Date</label>
                    <input type="date" className="form-input" value={recleanForm.original_clean_date} onChange={e => setR('original_clean_date', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Reason</label>
                    <input className="form-input" value={recleanForm.reason} onChange={e => setR('reason', e.target.value)} placeholder="e.g. Missed baseboards, bathroom not cleaned, etc." />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input h-16 resize-none" value={recleanForm.notes} onChange={e => setR('notes', e.target.value)} placeholder="Any additional context…" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={recleanSaving} className="btn-primary">
                    {recleanSaving ? 'Saving…' : 'Save Reclean'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Reclean KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total This Year', value: recleanData?.stats?.total ?? '—' },
              { label: 'This Month', value: recleanMTD || '0' },
              { label: 'Busiest Month', value: recleanMonthly.length ? `${recleanMonthly.reduce((best, m) => m.count > best.count ? m : best, recleanMonthly[0])?.count ?? 0}` : '—' },
              { label: 'Most Frequent Tech', value: recleanByTech[0]?.tech || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="card text-center py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* Monthly reclean trend */}
            <div className="card">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Monthly Reclean Count</h2>
              {recleanMonthly.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">No recleans logged yet for {selYear}.</p>
                : (
                  <div className="space-y-2">
                    {recleanMonthly.map(m => {
                      const month = parseInt(m.month.split('-')[1]) - 1
                      const pct = Math.round((m.count / recleanMonthMax) * 100)
                      return (
                        <div key={m.month} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-8 shrink-0">{MONTH_LABELS[month]}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-warn" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-ink w-6 text-right">{m.count}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </div>

            {/* By tech */}
            <div className="card">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Recleans by Technician</h2>
              {recleanByTech.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
                : (
                  <div className="space-y-2">
                    {recleanByTech.map(({ tech, count }) => (
                      <div key={tech} className="flex items-center gap-3">
                        <span className="text-xs text-gray-700 w-28 shrink-0 truncate">{tech}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-warn" style={{ width: `${Math.round((count / recleanTechMax) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-ink w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          {/* Recleans table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-ink">All Recleans — {selYear}</h2>
              <input
                className="form-input py-1.5 text-sm w-48"
                placeholder="Search client, tech, reason…"
                value={recleanFilter}
                onChange={e => setRecleanFilter(e.target.value)}
              />
            </div>

            {recleans.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <p className="mb-1">No recleans logged for {selYear}.</p>
                <p className="text-xs">Use "+ Log Reclean" to record one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left py-2 pr-3 font-medium">Reclean Date</th>
                      <th className="text-left py-2 pr-3 font-medium">Client</th>
                      <th className="text-left py-2 pr-3 font-medium hidden sm:table-cell">Orig. Clean</th>
                      <th className="text-left py-2 pr-3 font-medium hidden sm:table-cell">Tech</th>
                      <th className="text-left py-2 font-medium">Reason</th>
                      <th className="py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recleans.map(r => (
                      <>
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{r.reclean_date}</td>
                          <td className="py-2 pr-3 font-medium text-ink">{r.client_name || '—'}</td>
                          <td className="py-2 pr-3 text-xs text-gray-500 hidden sm:table-cell">{r.original_clean_date || '—'}</td>
                          <td className="py-2 pr-3 text-xs text-gray-500 hidden sm:table-cell">{r.tech_name || '—'}</td>
                          <td className="py-2 text-xs text-gray-600 max-w-xs truncate">{r.reason || '—'}</td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => editingReclean === r.id ? setEditingReclean(null) : startEditReclean(r)}
                                className="text-xs text-sage hover:text-sagehover font-medium"
                              >
                                {editingReclean === r.id ? 'Cancel' : 'Edit'}
                              </button>
                              <button
                                onClick={() => deleteReclean(r)}
                                className="text-gray-300 hover:text-red-400 transition-colors text-xs"
                                title="Delete"
                              >✕</button>
                            </div>
                          </td>
                        </tr>
                        {editingReclean === r.id && (
                          <tr key={`edit-${r.id}`} className="bg-gray-50/60">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                                <div>
                                  <label className="form-label text-xs">Client Name</label>
                                  <input className="form-input py-1 text-sm" value={editRecleanForm.client_name} onChange={e => setEditRecleanForm(p => ({ ...p, client_name: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Tech Name</label>
                                  <input className="form-input py-1 text-sm" value={editRecleanForm.tech_name} onChange={e => setEditRecleanForm(p => ({ ...p, tech_name: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Reclean Date</label>
                                  <input type="date" className="form-input py-1 text-sm" value={editRecleanForm.reclean_date} onChange={e => setEditRecleanForm(p => ({ ...p, reclean_date: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Original Clean Date</label>
                                  <input type="date" className="form-input py-1 text-sm" value={editRecleanForm.original_clean_date} onChange={e => setEditRecleanForm(p => ({ ...p, original_clean_date: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Reason</label>
                                  <input className="form-input py-1 text-sm" value={editRecleanForm.reason} onChange={e => setEditRecleanForm(p => ({ ...p, reason: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="form-label text-xs">Notes</label>
                                  <input className="form-input py-1 text-sm" value={editRecleanForm.notes} onChange={e => setEditRecleanForm(p => ({ ...p, notes: e.target.value }))} />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingReclean(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                                <button onClick={() => saveEditReclean(r.id)} disabled={editRecleanSaving} className="btn-primary text-sm">
                                  {editRecleanSaving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
