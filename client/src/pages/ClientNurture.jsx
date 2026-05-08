import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const STATUS_COLORS = {
  pending:   'bg-yellow-50 text-yellow-700',
  contacted: 'bg-blue-50 text-blue-700',
  responded: 'bg-purple-50 text-purple-700',
  won_back:  'bg-green-50 text-green-700',
  lost:      'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  pending:   'Pending',
  contacted: 'Contacted',
  responded: 'Responded',
  won_back:  'Won Back',
  lost:      'Lost',
}

const CODE_LABELS = {
  T1:'Seasonal Pause',T2:'Travel',T3:'New Baby',T4:'Trialing Competitor',T5:'Wants to Resume',
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function ClientNurture() {
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ client_name: '', reason_code: 'T1', cancel_date: '', next_contact: '' })

  const load = () =>
    fetch('/api/nurture')
      .then(r => r.json())
      .then(setClients)

  useEffect(() => { load() }, [])

  const patch = async (id, updates) => {
    setSaving(p => ({ ...p, [id]: true }))
    await fetch(`/api/nurture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSaving(p => ({ ...p, [id]: false }))
    setEditing(p => ({ ...p, [id]: null }))
    load()
  }

  const markWonBack = (c) => {
    if (!window.confirm(`Mark ${c.client_name || 'this client'} as won back?`)) return
    patch(c.id, { status: 'won_back', won_back: 1, won_back_date: new Date().toISOString().split('T')[0] })
  }

  const deleteClient = async (c) => {
    if (!window.confirm(`Remove ${c.client_name || 'this client'} from the nurture queue?`)) return
    await fetch(`/api/nurture/${c.id}`, { method: 'DELETE' })
    load()
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    await fetch('/api/nurture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    setShowAdd(false)
    setAddForm({ client_name: '', reason_code: 'T1', cancel_date: '', next_contact: '' })
    load()
  }

  const active = clients.filter(c => c.status !== 'won_back' && c.status !== 'lost')
  const wonBack = clients.filter(c => c.status === 'won_back')
  const overdue = active.filter(c => c.next_contact && daysUntil(c.next_contact) < 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Nurture</h1>
          <p className="text-sm text-gray-500 mt-0.5">Win-back queue for paused and temporary cancellations</p>
        </div>
        <button onClick={() => setShowAdd(p => !p)} className="btn-primary text-sm">
          {showAdd ? 'Cancel' : '+ Add Client'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Add to Nurture Queue</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="form-label">Client Name *</label>
              <input required className="form-input" value={addForm.client_name} onChange={e => setAddForm(p => ({ ...p, client_name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Reason Code</label>
              <select className="form-input" value={addForm.reason_code} onChange={e => setAddForm(p => ({ ...p, reason_code: e.target.value }))}>
                {Object.entries(CODE_LABELS).map(([k,v]) => <option key={k} value={k}>{k} – {v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Cancel Date</label>
              <input type="date" className="form-input" value={addForm.cancel_date} onChange={e => setAddForm(p => ({ ...p, cancel_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Next Contact</label>
              <input type="date" className="form-input" value={addForm.next_contact} onChange={e => setAddForm(p => ({ ...p, next_contact: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-4 flex justify-end">
              <button type="submit" className="btn-primary text-sm">Add to Queue</button>
            </div>
          </form>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'In Queue', value: active.length },
          { label: 'Overdue Follow-Up', value: overdue.length, warn: overdue.length > 0 },
          { label: 'Won Back', value: wonBack.length },
          { label: 'Win-Back Rate', value: clients.length > 0 ? `${Math.round((wonBack.length / clients.length) * 100)}%` : '—' },
        ].map(({ label, value, warn }) => (
          <div key={label} className="card text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* How it works note */}
      <div className="card mb-5 bg-teal-50 border-teal-100">
        <p className="text-xs text-teal-700">
          <strong>Auto-populated:</strong> Any cancellation logged with a <strong>T-code</strong> (Temporary / Pause Worthy) is automatically added here with a 30-day follow-up date. You can also manually add clients above.
          {' '}<Link to="/cancellations" className="underline">View Cancelled Clients →</Link>
        </p>
      </div>

      {/* Active queue */}
      <div className="card mb-5">
        <h2 className="font-semibold text-ink mb-4">Active Queue ({active.length})</h2>

        {active.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p className="mb-1">No clients in the nurture queue.</p>
            <p className="text-xs">T-coded cancellations (Temporary/Pause Worthy) auto-populate here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(c => {
              const until = daysUntil(c.next_contact)
              const since = daysSince(c.cancel_date)
              const isOverdue = until !== null && until < 0
              const ed = editing[c.id] || {}

              return (
                <div key={c.id} className={`border rounded-xl p-4 ${isOverdue ? 'border-warn/40 bg-yellow-50/30' : 'border-gray-100 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">{c.client_name || '—'}</span>
                        {c.reason_code && (
                          <span className="text-xs bg-teal-100 text-teal-700 font-bold px-1.5 py-0.5 rounded">{c.reason_code}</span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || STATUS_COLORS.pending}`}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                        {isOverdue && <span className="text-xs text-warn font-semibold">⚠ Overdue {Math.abs(until)}d</span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-400">
                        {c.cancel_date && <span>Cancelled {since != null ? `${since}d ago` : c.cancel_date}</span>}
                        {c.reason_label && <span>{c.reason_label}</span>}
                        {c.frequency && <span>{c.frequency}</span>}
                        {c.revenue_lost_monthly && <span>${Math.round(c.revenue_lost_monthly)}/mo lost</span>}
                      </div>
                      {c.client_quote && (
                        <p className="text-xs text-gray-400 italic mt-1">"{c.client_quote}"</p>
                      )}
                      {c.contact_notes && (
                        <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1">{c.contact_notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right text-xs text-gray-400">
                        {c.next_contact && (
                          until >= 0
                            ? <span className="text-gray-500">Follow up in <strong>{until}d</strong></span>
                            : <span className="text-warn font-semibold">{Math.abs(until)}d overdue</span>
                        )}
                      </div>
                      <button
                        onClick={() => setEditing(p => ({ ...p, [c.id]: p[c.id] ? null : {} }))}
                        className="text-xs border border-gray-200 bg-white px-2 py-1 rounded-lg hover:bg-gray-50 font-medium text-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => markWonBack(c)}
                        className="text-xs bg-green-50 border border-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 font-medium"
                      >
                        Won Back
                      </button>
                      <button
                        onClick={() => deleteClient(c)}
                        className="text-xs text-gray-300 hover:text-red-400 px-1 py-1 transition-colors"
                        title="Remove from queue"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {editing[c.id] !== undefined && editing[c.id] !== null && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="form-label text-xs">Status</label>
                        <select
                          className="form-input py-1 text-sm"
                          defaultValue={c.status}
                          onChange={e => setEditing(p => ({ ...p, [c.id]: { ...p[c.id], status: e.target.value } }))}
                        >
                          {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label text-xs">Next Contact</label>
                        <input
                          type="date"
                          className="form-input py-1 text-sm"
                          defaultValue={c.next_contact}
                          onChange={e => setEditing(p => ({ ...p, [c.id]: { ...p[c.id], next_contact: e.target.value } }))}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label text-xs">Contact Notes</label>
                        <input
                          className="form-input py-1 text-sm"
                          defaultValue={c.contact_notes}
                          placeholder="What happened on last contact…"
                          onChange={e => setEditing(p => ({ ...p, [c.id]: { ...p[c.id], contact_notes: e.target.value } }))}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                        <button onClick={() => setEditing(p => ({ ...p, [c.id]: null }))} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                        <button
                          onClick={() => patch(c.id, editing[c.id])}
                          disabled={saving[c.id]}
                          className="btn-primary text-sm"
                        >
                          {saving[c.id] ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Won back */}
      {wonBack.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-ink mb-4">Won Back ({wonBack.length})</h2>
          <div className="space-y-2">
            {wonBack.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-ink">{c.client_name}</span>
                  {c.reason_code && <span className="ml-2 text-xs text-teal-600 font-semibold">{c.reason_code}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {c.won_back_date && `Won back ${c.won_back_date}`}
                  {c.cancel_date && ` · was out ${daysSince(c.cancel_date) != null && c.won_back_date
                    ? Math.round((new Date(c.won_back_date) - new Date(c.cancel_date)) / (1000*60*60*24)) + 'd'
                    : ''}`}
                  <button
                    onClick={() => deleteClient(c)}
                    className="text-gray-300 hover:text-red-400 transition-colors ml-2"
                    title="Remove"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
