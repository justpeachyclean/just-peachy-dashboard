import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function StarRating({ value, max = 5 }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className="text-sm">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'text-yellow-400' : 'text-gray-200'}>★</span>
      ))}
      <span className="text-xs text-gray-500 ml-1">{value}/{max}</span>
    </span>
  )
}

const BLANK = {
  client_name: '', feedback_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  rating: '5', feedback_type: 'survey', comment: '', tech_name: '',
}

export default function Feedback() {
  const year = new Date().getFullYear()
  const [selYear, setSelYear] = useState(year)
  const [data, setData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState('')
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  const load = () =>
    apiFetch(`/api/feedback?year=${selYear}`)
      .then(r => r.json())
      .then(setData)

  useEffect(() => { load() }, [selYear])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
      rating: String(r.rating || '5'),
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

  const deleteRow = async (r) => {
    if (!window.confirm(`Delete feedback from ${r.client_name || 'this client'}?`)) return
    await apiFetch(`/api/feedback/${r.id}`, { method: 'DELETE' })
    load()
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

  // Distribution
  const dist = [5,4,3,2,1].map(star => ({
    star,
    count: (data?.feedback || []).filter(r => r.rating === star).length,
  }))
  const distMax = Math.max(1, ...dist.map(d => d.count))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">Scorecards, reviews, and satisfaction trends</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="form-input py-1.5 px-2 text-sm w-24"
            value={selYear}
            onChange={e => setSelYear(parseInt(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowForm(p => !p)} className="btn-primary text-sm">
            {showForm ? 'Cancel' : '+ Log Feedback'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
          ✓ Feedback logged
        </div>
      )}

      {/* Manual entry form */}
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
                <label className="form-label">Rating (1–5)</label>
                <select className="form-input" value={form.rating} onChange={e => set('rating', e.target.value)}>
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} — {'★'.repeat(n)}</option>)}
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
          { label: 'Avg Rating', value: stats.avg_rating != null ? `${stats.avg_rating} / 5` : '—' },
          { label: '5-Star Reviews', value: (data?.feedback || []).filter(r => r.rating === 5).length || '—' },
          { label: 'Complaints', value: (data?.feedback || []).filter(r => r.rating <= 2).length || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Monthly trend */}
        <div className="card">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Monthly Avg Rating</h2>
          {monthly.length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
            : (
              <div className="space-y-2">
                {monthly.map(m => {
                  const month = parseInt(m.month.split('-')[1]) - 1
                  const pct = Math.round((m.avg / 5) * 100)
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 shrink-0">{MONTH_LABELS[month]}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${m.avg >= 4.5 ? 'bg-green-400' : m.avg >= 3.5 ? 'bg-yellow-400' : 'bg-red-400'}`}
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

        {/* Rating distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Rating Distribution</h2>
          {stats.total === 0
            ? <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
            : (
              <div className="space-y-2">
                {dist.map(({ star, count }) => (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-xs text-yellow-500 w-8 shrink-0">{'★'.repeat(star)}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${star >= 4 ? 'bg-green-400' : star === 3 ? 'bg-yellow-400' : 'bg-red-400'}`}
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

      {/* Feedback table */}
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
                                {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ★</option>)}
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
    </div>
  )
}
