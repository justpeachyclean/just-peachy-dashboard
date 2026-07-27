import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { todayEastern, daysUntilEastern, daysSinceEastern } from '../utils/dates'

// ── Care types ──────────────────────────────────────────────────────────────
const CARE_TYPES = {
  welcome_call:      { label: 'Welcome Call',        icon: '🎉', color: 'bg-rose-50 text-rose-700 border-rose-100' },
  otc_24hr_call:     { label: 'OTC 24-Hr Call',      icon: '🕐', color: 'bg-orange-50 text-orange-700 border-orange-100' },
  first_recurring:   { label: '1st Recurring Call',  icon: '📞', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  fourth_recurring:  { label: '4th Recurring Call',  icon: '📞', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  sixth_recurring:   { label: '6th Recurring Call',  icon: '📞', color: 'bg-violet-50 text-violet-700 border-violet-100' },
  six_month:         { label: '6-Month Milestone',   icon: '📅', color: 'bg-purple-50 text-purple-700 border-purple-100' },
  one_year:          { label: '1-Year Anniversary',  icon: '🎂', color: 'bg-pink-50 text-pink-700 border-pink-100' },
  scorecard_followup:{ label: 'Scorecard Follow-up', icon: '⭐', color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  gift:              { label: 'Appreciation Gift',   icon: '🎁', color: 'bg-green-50 text-green-700 border-green-100' },
}

// Pipeline stages in order
const JOURNEY_STAGES = [
  { key: 'welcome_call',     short: 'Welcome' },
  { key: 'otc_24hr_call',   short: 'OTC 24hr' },
  { key: 'first_recurring',  short: '1st Call' },
  { key: 'fourth_recurring', short: '4th Call' },
  { key: 'sixth_recurring',  short: '6th Call' },
  { key: 'six_month',        short: '6 Months' },
  { key: 'one_year',         short: '1 Year' },
]

const GIFT_TYPES = {
  thank_you_card: { label: 'Thank You Card', icon: '💌' },
  cookies:        { label: 'Cookies',        icon: '🍪' },
  plant:          { label: 'Plant',          icon: '🌱' },
  other:          { label: 'Other',          icon: '🎀' },
}

// ── Win-back status ─────────────────────────────────────────────────────────
const WB_STATUS_COLORS = {
  pending:   'bg-yellow-50 text-yellow-700',
  contacted: 'bg-blue-50 text-blue-700',
  responded: 'bg-purple-50 text-purple-700',
  won_back:  'bg-green-50 text-green-700',
  lost:      'bg-gray-100 text-gray-500',
}
const WB_STATUS_LABELS = {
  pending: 'Pending', contacted: 'Contacted', responded: 'Responded',
  won_back: 'Won Back', lost: 'Lost',
}

const daysUntil = daysUntilEastern
const daysSince = daysSinceEastern

function CareTypeBadge({ type }) {
  const t = CARE_TYPES[type] || { label: type, icon: '•', color: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${t.color}`}>
      {t.icon} {t.label}
    </span>
  )
}

const BLANK_CARE = {
  client_name: '', care_type: 'first_recurring', gift_type: '',
  gift_notes: '', scheduled_date: todayEastern(),
  notes: '', assigned_to: '',
}

export default function ClientNurture() {
  const [tab, setTab] = useState('journey')

  // ── Care state ────────────────────────────────────────────────────────────
  const [careData, setCareData] = useState({ care: [], kpi: {} })
  const [showAddCare, setShowAddCare] = useState(false)
  const [addCareForm, setAddCareForm] = useState(BLANK_CARE)
  const [editingCare, setEditingCare] = useState(null)
  const [editCareForm, setEditCareForm] = useState({})
  const [careFilter, setCareFilter] = useState('pending')

  // ── Win-back state ────────────────────────────────────────────────────────
  const [wbClients, setWbClients] = useState([])
  const [wbEditing, setWbEditing] = useState({})
  const [wbSaving, setWbSaving] = useState({})
  const [showAddWb, setShowAddWb] = useState(false)
  const [addWbForm, setAddWbForm] = useState({ client_name: '', reason_code: 'T1', cancel_date: '', next_contact: '', call_date: '', call_notes: '' })

  // ── Journey stage panel (inline note + done) ─────────────────────────────
  const [activeStage, setActiveStage] = useState(null) // { clientName, stageKey, careId }
  const [stageNote, setStageNote] = useState('')

  // ── Quick note state ──────────────────────────────────────────────────────
  const [quickNoteId, setQuickNoteId] = useState(null)   // care item id
  const [quickNoteText, setQuickNoteText] = useState('')

  // ── Win-back call log state ───────────────────────────────────────────────
  const [wbCallLogId, setWbCallLogId] = useState(null)
  const [wbCallLogEntry, setWbCallLogEntry] = useState({ date: todayEastern(), notes: '' })

  const loadCare = () =>
    apiFetch(`/api/care?status=all`).then(r => r.json()).then(setCareData)

  const loadWb = () =>
    apiFetch('/api/nurture').then(r => r.json()).then(setWbClients)

  useEffect(() => { loadCare(); loadWb() }, [])

  // ── Care handlers ─────────────────────────────────────────────────────────
  const addCare = async (e) => {
    e.preventDefault()
    await apiFetch('/api/care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addCareForm),
    })
    setShowAddCare(false)
    setAddCareForm(BLANK_CARE)
    loadCare()
  }

  const completeCare = async (item) => {
    await apiFetch(`/api/care/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: 1, completed_date: todayEastern() }),
    })
    setCareFilter('all') // show completed items so ↩ Undo is accessible
    loadCare()
  }

  const uncompleteCare = async (item) => {
    await apiFetch(`/api/care/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: 0, completed_date: null }),
    })
    loadCare()
  }

  const saveCareEdit = async (id) => {
    await apiFetch(`/api/care/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editCareForm),
    })
    setEditingCare(null)
    loadCare()
  }

  const deleteCare = async (item) => {
    if (!window.confirm(`Remove ${item.client_name} from the care queue?`)) return
    await apiFetch(`/api/care/${item.id}`, { method: 'DELETE' })
    loadCare()
  }

  // ── Win-back handlers ─────────────────────────────────────────────────────
  const patchWb = async (id, updates) => {
    setWbSaving(p => ({ ...p, [id]: true }))
    await apiFetch(`/api/nurture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setWbSaving(p => ({ ...p, [id]: false }))
    setWbEditing(p => ({ ...p, [id]: null }))
    loadWb()
  }

  const markWonBack = (c) => {
    if (!window.confirm(`Mark ${c.client_name || 'this client'} as won back?`)) return
    patchWb(c.id, { status: 'won_back', won_back: 1, won_back_date: todayEastern() })
  }

  const deleteWb = async (c) => {
    if (!window.confirm(`Remove ${c.client_name || 'this client'} from the win-back queue?`)) return
    await apiFetch(`/api/nurture/${c.id}`, { method: 'DELETE' })
    loadWb()
  }

  const handleAddWb = async (e) => {
    e.preventDefault()
    const { call_date, call_notes, ...rest } = addWbForm
    const call_log_entry = call_notes.trim() ? { date: call_date || todayEastern(), notes: call_notes.trim() } : undefined
    await apiFetch('/api/nurture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, call_log_entry }),
    })
    setShowAddWb(false)
    setAddWbForm({ client_name: '', reason_code: 'T1', cancel_date: '', next_contact: '', call_date: '', call_notes: '' })
    loadWb()
  }

  // ── Journey stage handlers ────────────────────────────────────────────────
  const openStagePanel = (r) => {
    if (activeStage?.careId === r.id) { setActiveStage(null); setStageNote(''); return }
    setActiveStage({ clientName: r.client_name, stageKey: r.care_type, careId: r.id })
    setStageNote(r.notes || '')
  }

  const completeWithNote = async (r) => {
    await apiFetch(`/api/care/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: 1, completed_date: todayEastern(), notes: stageNote || r.notes || null }),
    })
    setActiveStage(null)
    setStageNote('')
    loadCare()
  }

  const saveStageNoteOnly = async (r) => {
    await apiFetch(`/api/care/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: stageNote }),
    })
    setActiveStage(null)
    setStageNote('')
    loadCare()
  }

  // ── Quick note handlers ───────────────────────────────────────────────────
  const saveQuickNote = async (id) => {
    await apiFetch(`/api/care/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: quickNoteText }),
    })
    setQuickNoteId(null)
    setQuickNoteText('')
    loadCare()
  }

  const saveWbCallLog = async (id) => {
    if (!wbCallLogEntry.notes.trim() && !wbCallLogEntry.date) return
    await apiFetch(`/api/nurture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_log_entry: wbCallLogEntry }),
    })
    setWbCallLogId(null)
    setWbCallLogEntry({ date: todayEastern(), notes: '' })
    loadWb()
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const { care, kpi } = careData
  const today = todayEastern()

  const pendingCare  = care.filter(r => !r.completed)
  const completedCare = care.filter(r => r.completed)
  const displayCare  = careFilter === 'pending' ? pendingCare : careFilter === 'completed' ? completedCare : care

  const wbActive  = wbClients.filter(c => c.status !== 'won_back' && c.status !== 'lost')
  const wbWonBack = wbClients.filter(c => c.status === 'won_back')
  const wbOverdue = wbActive.filter(c => c.next_contact && daysUntil(c.next_contact) < 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Nurture</h1>
          <p className="text-sm text-gray-500 mt-0.5">Care calls, milestones, gifts, and win-back queue · <span className="text-[11px] text-gray-400">✏️ all manual — log care calls, gifts &amp; win-back outreach here</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'journey', label: '🗺 Journey', count: null },
          { id: 'care', label: '📞 Care Queue', count: pendingCare.length },
          { id: 'winback', label: '🔄 Win-Back', count: wbActive.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.id ? 'bg-brand/10 text-brand' : 'bg-gray-200 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── JOURNEY PIPELINE TAB ──────────────────────────────────────────── */}
      {tab === 'journey' && (() => {
        // Group all care records by client name, skip cancelled clients
        const byClient = {}
        care.forEach(r => {
          if (r.client_cancelled) return
          const key = r.client_name || 'Unknown'
          if (!byClient[key]) byClient[key] = {}
          byClient[key][r.care_type] = r
        })

        // Sort: clients with overdue stages first, then by soonest upcoming
        const clientList = Object.entries(byClient).map(([name, stages]) => {
          const hasOverdue = JOURNEY_STAGES.some(s => {
            const r = stages[s.key]
            return r && !r.completed && daysUntil(r.scheduled_date) < 0
          })
          const nextPending = JOURNEY_STAGES.map(s => stages[s.key]).find(r => r && !r.completed)
          return { name, stages, hasOverdue, nextDate: nextPending?.scheduled_date }
        }).sort((a, b) => {
          if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1
          if (a.nextDate && b.nextDate) return a.nextDate < b.nextDate ? -1 : 1
          return a.name < b.name ? -1 : 1
        })

        const overdueCount = clientList.filter(c => c.hasOverdue).length

        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Active Clients', value: clientList.length },
                { label: 'Overdue Touchpoints', value: overdueCount, warn: overdueCount > 0 },
                { label: 'Completed This Mo', value: kpi.completed_month ?? '—' },
                { label: 'Total Gifts Sent', value: kpi.gifts_sent ?? '—' },
              ].map(({ label, value, warn }) => (
                <div key={label} className="card text-center py-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="card mb-4 bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-700">
                <strong>Auto-populated:</strong> When a lead is marked as recurring, the full 5-touchpoint journey is automatically created here.
                {' '}Scorecard alerts and gifts can be added manually via the <button onClick={() => setTab('care')} className="underline font-semibold">Care Queue</button>.
              </p>
            </div>

            {clientList.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">
                <p className="text-2xl mb-2">🌱</p>
                <p className="font-medium text-ink mb-1">No client journeys yet</p>
                <p className="text-xs">Mark a lead as recurring in the Client Log to auto-generate the care timeline.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clientList.map(({ name, stages, hasOverdue }) => {
                  const allDone = JOURNEY_STAGES.every(s => stages[s.key]?.completed)
                  return (
                    <div key={name} className={`card border ${hasOverdue ? 'border-warn/40 bg-yellow-50/20' : 'border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-semibold text-ink">{name}</span>
                          {allDone && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Journey Complete</span>}
                          {hasOverdue && <span className="ml-2 text-xs text-warn font-semibold">⚠ Overdue</span>}
                        </div>
                      </div>

                      {/* Stage timeline */}
                      <div className="flex items-start gap-0 overflow-x-auto pb-1">
                        {JOURNEY_STAGES.map((stage, idx) => {
                          const r = stages[stage.key]
                          const until = r ? daysUntil(r.scheduled_date) : null
                          const isOverdue = r && !r.completed && until !== null && until < 0
                          const isComplete = r?.completed
                          const isPending = r && !r.completed && !isOverdue
                          const isMissing = !r
                          const isActive = activeStage?.careId === r?.id
                          const hasNote = r?.notes?.trim()

                          const dotColor = isActive ? 'bg-brand border-brand ring-2 ring-brand/30'
                            : isComplete ? 'bg-green-500 border-green-500'
                            : isOverdue ? 'bg-warn border-warn'
                            : isPending ? 'bg-blue-400 border-blue-400'
                            : 'bg-gray-200 border-gray-200'

                          const labelColor = isActive ? 'text-brand font-bold'
                            : isComplete ? 'text-green-600'
                            : isOverdue ? 'text-warn'
                            : isPending ? 'text-blue-500'
                            : 'text-gray-300'

                          return (
                            <div key={stage.key} className="flex items-start flex-1 min-w-[90px]">
                              <div className="flex flex-col items-center flex-1">
                                {/* Node */}
                                <div className="relative">
                                  <button
                                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold shrink-0 transition-all ${dotColor} ${r ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                    title={r ? (isComplete ? 'Click to undo' : 'Click to open') : 'Not scheduled'}
                                    onClick={() => {
                                      if (!r) return
                                      if (isComplete) uncompleteCare(r)
                                      else openStagePanel(r)
                                    }}
                                  >
                                    {isComplete ? '✓' : idx + 1}
                                  </button>
                                  {/* Note indicator dot */}
                                  {hasNote && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white text-white flex items-center justify-center text-[7px] font-bold">💬</span>
                                  )}
                                </div>
                                {/* Label */}
                                <span className={`text-xs mt-1 font-medium text-center leading-tight ${labelColor}`}>{stage.short}</span>
                                {/* Date/status */}
                                {r && (
                                  <span className="text-xs text-gray-400 text-center mt-0.5 leading-tight">
                                    {isComplete
                                      ? r.completed_date
                                      : isOverdue
                                        ? `${Math.abs(until)}d late`
                                        : until === 0 ? 'Today'
                                        : `in ${until}d`
                                    }
                                  </span>
                                )}
                                {isMissing && <span className="text-xs text-gray-300 mt-0.5">—</span>}
                              </div>
                              {/* Connector line */}
                              {idx < JOURNEY_STAGES.length - 1 && (
                                <div className={`h-0.5 flex-1 mt-4 mx-1 ${isComplete ? 'bg-green-300' : 'bg-gray-100'}`} />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Inline stage panel — notes + mark done */}
                      {activeStage && Object.values(stages).some(r => r?.id === activeStage.careId) && (() => {
                        const r = Object.values(stages).find(r => r?.id === activeStage.careId)
                        const ct = CARE_TYPES[r.care_type] || {}
                        return (
                          <div className="mt-3 pt-3 border-t border-brand/20 bg-rose-50/40 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-brand">{ct.icon} {ct.label} — {r.scheduled_date}</span>
                              <button onClick={() => { setActiveStage(null); setStageNote('') }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                            </div>
                            <textarea
                              rows={3}
                              autoFocus
                              className="form-input text-sm w-full mb-3"
                              placeholder="Call notes — what was discussed, client mood, follow-up needed…"
                              value={stageNote}
                              onChange={e => setStageNote(e.target.value)}
                            />
                            <div className="flex gap-2 justify-end flex-wrap">
                              <button onClick={() => saveStageNoteOnly(r)} className="text-xs border border-gray-200 bg-white px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                                Save Note Only
                              </button>
                              <button onClick={() => completeWithNote(r)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold">
                                ✓ Save Note &amp; Mark Done
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      })()}

      {/* ── CLIENT CARE TAB ────────────────────────────────────────────────── */}
      {tab === 'care' && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Due This Week',      value: kpi.due_this_week ?? '—' },
              { label: 'Overdue',            value: kpi.overdue ?? '—',        warn: kpi.overdue > 0 },
              { label: 'Completed This Mo',  value: kpi.completed_month ?? '—' },
              { label: 'Total Gifts Sent',   value: kpi.gifts_sent ?? '—' },
            ].map(({ label, value, warn }) => (
              <div key={label} className="card text-center py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
              {[['pending','Pending'],['completed','Completed'],['all','All']].map(([v,l]) => (
                <button
                  key={v}
                  onClick={() => setCareFilter(v)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${careFilter === v ? 'bg-white text-ink shadow-sm' : 'text-gray-500'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddCare(p => !p)} className="btn-primary text-sm">
              {showAddCare ? 'Cancel' : '+ Add Care Item'}
            </button>
          </div>

          {/* Add form */}
          {showAddCare && (
            <div className="card mb-5">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">New Care Item</h2>
              <form onSubmit={addCare}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="form-label">Client Name *</label>
                    <input required className="form-input" value={addCareForm.client_name}
                      onChange={e => setAddCareForm(p => ({ ...p, client_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Care Type *</label>
                    <select className="form-input" value={addCareForm.care_type}
                      onChange={e => setAddCareForm(p => ({ ...p, care_type: e.target.value }))}>
                      {Object.entries(CARE_TYPES).map(([k,v]) => (
                        <option key={k} value={k}>{v.icon} {v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Scheduled Date</label>
                    <input type="date" className="form-input" value={addCareForm.scheduled_date}
                      onChange={e => setAddCareForm(p => ({ ...p, scheduled_date: e.target.value }))} />
                  </div>
                  {(addCareForm.care_type === 'gift' || addCareForm.gift_type) && (
                    <div>
                      <label className="form-label">Gift Type</label>
                      <select className="form-input" value={addCareForm.gift_type}
                        onChange={e => setAddCareForm(p => ({ ...p, gift_type: e.target.value }))}>
                        <option value="">— None —</option>
                        {Object.entries(GIFT_TYPES).map(([k,v]) => (
                          <option key={k} value={k}>{v.icon} {v.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {addCareForm.care_type !== 'gift' && (
                    <div>
                      <label className="form-label">Include Gift?</label>
                      <select className="form-input" value={addCareForm.gift_type}
                        onChange={e => setAddCareForm(p => ({ ...p, gift_type: e.target.value }))}>
                        <option value="">— No gift —</option>
                        {Object.entries(GIFT_TYPES).map(([k,v]) => (
                          <option key={k} value={k}>{v.icon} {v.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="form-label">Assigned To</label>
                    <input className="form-input" value={addCareForm.assigned_to} placeholder="Team member"
                      onChange={e => setAddCareForm(p => ({ ...p, assigned_to: e.target.value }))} />
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <label className="form-label">Notes</label>
                    <textarea rows={2} className="form-input" value={addCareForm.notes} placeholder="Call notes, what was discussed, follow-ups…"
                      onChange={e => setAddCareForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary text-sm">Add to Queue</button>
                </div>
              </form>
            </div>
          )}

          {/* Care list */}
          {displayCare.length === 0 ? (
            <div className="card text-center py-12 text-gray-400 text-sm">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-medium text-ink mb-1">
                {careFilter === 'pending' ? 'All caught up!' : 'No items here yet.'}
              </p>
              <p className="text-xs">Use "+ Add Care Item" to schedule a call or gift.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayCare.map(item => {
                const until = daysUntil(item.scheduled_date)
                const isOverdue = !item.completed && until !== null && until < 0
                const isEditing = editingCare === item.id
                const gift = item.gift_type ? GIFT_TYPES[item.gift_type] : null

                return (
                  <div key={item.id} className={`card border ${
                    item.completed ? 'opacity-60 border-gray-100' :
                    isOverdue ? 'border-warn/40 bg-yellow-50/20' : 'border-gray-100'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-ink">{item.client_name}</span>
                          <CareTypeBadge type={item.care_type} />
                          {gift && (
                            <span className="text-xs bg-green-50 border border-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              {gift.icon} {gift.label}
                            </span>
                          )}
                          {item.completed && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">✓ Done</span>
                          )}
                          {isOverdue && <span className="text-xs text-warn font-semibold">⚠ Overdue {Math.abs(until)}d</span>}
                        </div>
                        <div className="flex gap-4 text-xs text-gray-400">
                          {item.scheduled_date && !item.completed && (
                            <span>{until >= 0 ? `Due in ${until}d` : `${Math.abs(until)}d overdue`} · {item.scheduled_date}</span>
                          )}
                          {item.completed && item.completed_date && <span>Completed {item.completed_date}</span>}
                          {item.assigned_to && <span>→ {item.assigned_to}</span>}
                        </div>
                        {item.notes && <p className="text-xs text-gray-500 mt-1 italic">{item.notes}</p>}
                        {item.gift_notes && <p className="text-xs text-gray-500 mt-0.5">Gift note: {item.gift_notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!item.completed && (
                          <button
                            onClick={() => completeCare(item)}
                            className="text-xs bg-green-50 border border-green-100 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-100 font-medium"
                          >
                            ✓ Done
                          </button>
                        )}
                        {item.completed && (
                          <button
                            onClick={() => uncompleteCare(item)}
                            className="text-xs bg-gray-50 border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-700 font-medium"
                          >
                            ↩ Undo
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (quickNoteId === item.id) { setQuickNoteId(null); setQuickNoteText('') }
                            else { setQuickNoteId(item.id); setQuickNoteText(item.notes || '') }
                          }}
                          className="text-xs border border-blue-100 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 font-medium"
                        >📝 Note</button>
                        <button
                          onClick={() => { setEditingCare(isEditing ? null : item.id); setEditCareForm({ client_name: item.client_name, care_type: item.care_type, gift_type: item.gift_type || '', gift_notes: item.gift_notes || '', scheduled_date: item.scheduled_date || '', notes: item.notes || '', assigned_to: item.assigned_to || '' }) }}
                          className="text-xs border border-gray-200 bg-white px-2 py-1 rounded-lg hover:bg-gray-50 font-medium text-gray-600"
                        >
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                        <button onClick={() => deleteCare(item)} className="text-gray-300 hover:text-red-400 transition-colors px-1" title="Delete">✕</button>
                      </div>
                    </div>

                    {/* Quick note panel */}
                    {quickNoteId === item.id && (
                      <div className="mt-3 pt-3 border-t border-blue-100 flex flex-col gap-2">
                        <label className="text-xs font-semibold text-blue-700">📝 Call Notes</label>
                        <textarea
                          rows={3}
                          autoFocus
                          className="form-input text-sm"
                          placeholder="What was discussed, client mood, follow-up needed…"
                          value={quickNoteText}
                          onChange={e => setQuickNoteText(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setQuickNoteId(null); setQuickNoteText('') }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => saveQuickNote(item.id)} className="btn-primary text-sm">Save Note</button>
                        </div>
                      </div>
                    )}

                    {/* Inline edit */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="form-label text-xs">Client Name</label>
                          <input className="form-input py-1 text-sm" value={editCareForm.client_name}
                            onChange={e => setEditCareForm(p => ({ ...p, client_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Care Type</label>
                          <select className="form-input py-1 text-sm" value={editCareForm.care_type}
                            onChange={e => setEditCareForm(p => ({ ...p, care_type: e.target.value }))}>
                            {Object.entries(CARE_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label text-xs">Scheduled Date</label>
                          <input type="date" className="form-input py-1 text-sm" value={editCareForm.scheduled_date}
                            onChange={e => setEditCareForm(p => ({ ...p, scheduled_date: e.target.value }))} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Gift Type</label>
                          <select className="form-input py-1 text-sm" value={editCareForm.gift_type}
                            onChange={e => setEditCareForm(p => ({ ...p, gift_type: e.target.value }))}>
                            <option value="">— No gift —</option>
                            {Object.entries(GIFT_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label text-xs">Assigned To</label>
                          <input className="form-input py-1 text-sm" value={editCareForm.assigned_to}
                            onChange={e => setEditCareForm(p => ({ ...p, assigned_to: e.target.value }))} />
                        </div>
                        <div className="col-span-2 sm:col-span-3">
                          <label className="form-label text-xs">Notes</label>
                          <textarea rows={2} className="form-input text-sm py-1" value={editCareForm.notes}
                            placeholder="Call notes, what was discussed, follow-ups…"
                            onChange={e => setEditCareForm(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <div className="col-span-2 sm:col-span-3 flex justify-end gap-2">
                          <button onClick={() => setEditingCare(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                          <button onClick={() => saveCareEdit(item.id)} className="btn-primary text-sm">Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── WIN-BACK TAB ───────────────────────────────────────────────────── */}
      {tab === 'winback' && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'In Queue',          value: wbActive.length },
              { label: 'Overdue Follow-Up', value: wbOverdue.length, warn: wbOverdue.length > 0 },
              { label: 'Won Back',          value: wbWonBack.length },
              { label: 'Win-Back Rate',     value: wbClients.length > 0 ? `${Math.round((wbWonBack.length / wbClients.length) * 100)}%` : '—' },
            ].map(({ label, value, warn }) => (
              <div key={label} className="card text-center py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="card mb-4 bg-teal-50 border-teal-100">
            <p className="text-xs text-teal-700">
              <strong>Auto-populated:</strong> Any cancellation logged with a <strong>T-code</strong> (Temporary / Pause Worthy) is automatically added here with a 30-day follow-up.
              {' '}<Link to="/cancellations" className="underline">View Cancelled Clients →</Link>
            </p>
          </div>

          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAddWb(p => !p)} className="btn-primary text-sm">
              {showAddWb ? 'Cancel' : '+ Add Client'}
            </button>
          </div>

          {showAddWb && (
            <div className="card mb-5">
              <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Add to Win-Back Queue</h2>
              <form onSubmit={handleAddWb} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="form-label">Client Name *</label>
                  <input required className="form-input" value={addWbForm.client_name}
                    onChange={e => setAddWbForm(p => ({ ...p, client_name: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Reason Code</label>
                  <select className="form-input" value={addWbForm.reason_code}
                    onChange={e => setAddWbForm(p => ({ ...p, reason_code: e.target.value }))}>
                    {['T1','T2','T3','T4','T5'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Cancel Date</label>
                  <input type="date" className="form-input" value={addWbForm.cancel_date}
                    onChange={e => setAddWbForm(p => ({ ...p, cancel_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Next Contact</label>
                  <input type="date" className="form-input" value={addWbForm.next_contact}
                    onChange={e => setAddWbForm(p => ({ ...p, next_contact: e.target.value }))} />
                </div>
                <div className="col-span-2 sm:col-span-4 border-t border-gray-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-blue-700 mb-2">📞 Log Initial Call (optional)</p>
                  <div className="flex gap-3 flex-wrap">
                    <div className="shrink-0">
                      <label className="form-label text-xs">Date Called</label>
                      <input type="date" className="form-input py-1 text-sm" value={addWbForm.call_date}
                        onChange={e => setAddWbForm(p => ({ ...p, call_date: e.target.value }))} />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="form-label text-xs">Result / Notes</label>
                      <textarea rows={2} className="form-input text-sm" value={addWbForm.call_notes}
                        placeholder="Called, left voicemail. / Spoke with client — interested in returning…"
                        onChange={e => setAddWbForm(p => ({ ...p, call_notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-4 flex justify-end">
                  <button type="submit" className="btn-primary text-sm">Add to Queue</button>
                </div>
              </form>
            </div>
          )}

          {/* Active win-back queue */}
          <div className="card mb-5">
            <h2 className="font-semibold text-ink mb-4">Active Queue ({wbActive.length})</h2>
            {wbActive.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                <p>No clients in the win-back queue.</p>
                <p className="text-xs mt-1">T-coded cancellations auto-populate here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wbActive.map(c => {
                  const until = daysUntil(c.next_contact)
                  const isOverdue = until !== null && until < 0
                  const ed = wbEditing[c.id]

                  return (
                    <div key={c.id} className={`border rounded-xl p-4 ${isOverdue ? 'border-warn/40 bg-yellow-50/30' : 'border-gray-100 bg-white'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink">{c.client_name || '—'}</span>
                            {c.reason_code && <span className="text-xs bg-teal-100 text-teal-700 font-bold px-1.5 py-0.5 rounded">{c.reason_code}</span>}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${WB_STATUS_COLORS[c.status] || WB_STATUS_COLORS.pending}`}>
                              {WB_STATUS_LABELS[c.status] || c.status}
                            </span>
                            {isOverdue && <span className="text-xs text-warn font-semibold">⚠ {Math.abs(until)}d overdue</span>}
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-gray-400">
                            {c.cancel_date && <span>Cancelled {daysSince(c.cancel_date)}d ago</span>}
                            {c.reason_label && <span>{c.reason_label}</span>}
                            {c.next_contact && <span>Follow up: {until >= 0 ? `in ${until}d` : `${Math.abs(until)}d overdue`}</span>}
                          </div>
                          {c.contact_notes && <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1">{c.contact_notes}</p>}
                          {c.call_log?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {c.call_log.map((entry, i) => (
                                <div key={i} className="flex gap-2 text-xs bg-blue-50 rounded px-2 py-1">
                                  <span className="font-semibold text-blue-600 shrink-0">{entry.date}</span>
                                  <span className="text-gray-600">{entry.notes}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              if (wbCallLogId === c.id) { setWbCallLogId(null); setWbCallLogEntry({ date: todayEastern(), notes: '' }) }
                              else { setWbCallLogId(c.id); setWbCallLogEntry({ date: todayEastern(), notes: '' }) }
                            }}
                            className="text-xs border border-blue-100 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100 font-medium"
                          >📞 Log Call</button>
                          <button
                            onClick={() => setWbEditing(p => ({ ...p, [c.id]: p[c.id] ? null : {} }))}
                            className="text-xs border border-gray-200 bg-white px-2 py-1 rounded-lg hover:bg-gray-50 font-medium text-gray-600"
                          >Edit</button>
                          <button
                            onClick={() => markWonBack(c)}
                            className="text-xs bg-green-50 border border-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 font-medium"
                          >Won Back</button>
                          <button onClick={() => deleteWb(c)} className="text-gray-300 hover:text-red-400 px-1 transition-colors" title="Remove">✕</button>
                        </div>
                      </div>

                      {wbCallLogId === c.id && (
                        <div className="mt-3 pt-3 border-t border-blue-100 flex flex-col gap-3">
                          <label className="text-xs font-semibold text-blue-700">📞 Log Call</label>
                          <div className="flex gap-3 flex-wrap">
                            <div className="shrink-0">
                              <label className="form-label text-xs">Date Called</label>
                              <input
                                type="date"
                                className="form-input py-1 text-sm"
                                value={wbCallLogEntry.date}
                                onChange={e => setWbCallLogEntry(p => ({ ...p, date: e.target.value }))}
                              />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <label className="form-label text-xs">Result / Notes</label>
                              <textarea
                                rows={2}
                                autoFocus
                                className="form-input text-sm"
                                placeholder="Called, left voicemail. / Spoke with client — interested in returning…"
                                value={wbCallLogEntry.notes}
                                onChange={e => setWbCallLogEntry(p => ({ ...p, notes: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setWbCallLogId(null); setWbCallLogEntry({ date: todayEastern(), notes: '' }) }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                            <button onClick={() => saveWbCallLog(c.id)} className="btn-primary text-sm">Save</button>
                          </div>
                        </div>
                      )}

                      {ed !== null && ed !== undefined && (
                        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="form-label text-xs">Status</label>
                            <select className="form-input py-1 text-sm" defaultValue={c.status}
                              onChange={e => setWbEditing(p => ({ ...p, [c.id]: { ...p[c.id], status: e.target.value } }))}>
                              {Object.entries(WB_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label text-xs">Next Contact</label>
                            <input type="date" className="form-input py-1 text-sm" defaultValue={c.next_contact}
                              onChange={e => setWbEditing(p => ({ ...p, [c.id]: { ...p[c.id], next_contact: e.target.value } }))} />
                          </div>
                          <div className="col-span-2">
                            <label className="form-label text-xs">Contact Notes</label>
                            <input className="form-input py-1 text-sm" defaultValue={c.contact_notes} placeholder="What happened…"
                              onChange={e => setWbEditing(p => ({ ...p, [c.id]: { ...p[c.id], contact_notes: e.target.value } }))} />
                          </div>
                          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                            <button onClick={() => setWbEditing(p => ({ ...p, [c.id]: null }))} className="text-sm text-gray-500">Cancel</button>
                            <button onClick={() => patchWb(c.id, wbEditing[c.id])} disabled={wbSaving[c.id]} className="btn-primary text-sm">
                              {wbSaving[c.id] ? 'Saving…' : 'Save'}
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

          {/* Won back history */}
          {wbWonBack.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-ink mb-4">Won Back ({wbWonBack.length})</h2>
              <div className="space-y-2">
                {wbWonBack.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-ink">{c.client_name}</span>
                      {c.reason_code && <span className="ml-2 text-xs text-teal-600 font-semibold">{c.reason_code}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {c.won_back_date && `Won back ${c.won_back_date}`}
                      <button onClick={() => deleteWb(c)} className="text-gray-300 hover:text-red-400 transition-colors" title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
