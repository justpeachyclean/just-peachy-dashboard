import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { exportCsv } from '../utils/exportCsv'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

const fmt$ = (n) => n !== null && n !== undefined ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const fmtN = (n) => n !== null && n !== undefined ? Number(n).toLocaleString() : '—'

function StatCard({ label, value, color = 'text-ink', sub }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function NetChangeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-ink mb-1">{d?.label}</p>
      <p className="text-ok">Hires: <span className="font-bold">{d?.new_hires}</span></p>
      <p className="text-warn">Quit: <span className="font-bold">{d?.quit}</span></p>
      <p className="text-danger">Fired: <span className="font-bold">{d?.fired}</span></p>
      <p className={d?.net_change >= 0 ? 'text-ok' : 'text-danger'}>
        Net: <span className="font-bold">{d?.net_change >= 0 ? '+' : ''}{d?.net_change}</span>
      </p>
    </div>
  )
}

const STAGE_CONFIG = {
  applied:      { label: 'Applied',      color: 'bg-gray-100 text-gray-600' },
  phone_screen: { label: 'Phone Screen', color: 'bg-blue-100 text-blue-700' },
  interviewed:  { label: 'Interviewed',  color: 'bg-amber-100 text-amber-700' },
  offered:      { label: 'Offered',      color: 'bg-purple-100 text-purple-700' },
  hired:        { label: 'Hired',        color: 'bg-green-100 text-green-700' },
  rejected:     { label: 'Rejected',     color: 'bg-red-100 text-red-600' },
  no_show:      { label: 'No Show',      color: 'bg-orange-100 text-orange-600' },
}

function StageBadge({ stage }) {
  const cfg = STAGE_CONFIG[stage] || { label: stage, color: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

const STAGES = Object.entries(STAGE_CONFIG).map(([value, { label }]) => ({ value, label }))

function AddApplicantModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    applicant_name: '',
    phone: '',
    email: '',
    stage: 'applied',
    position: '',
    stage_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.applicant_name.trim()) return setErr('Name is required')
    setSaving(true)
    setErr(null)
    try {
      const r = await apiFetch('/api/hiring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) throw new Error('Failed to add')
      onSaved()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-ink">Add Applicant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          {err && <p className="text-danger text-sm">{err}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input className="input w-full" value={form.applicant_name} onChange={e => set('applicant_name', e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input className="input w-full" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input className="input w-full" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
              <select className="input w-full" value={form.stage} onChange={e => set('stage', e.target.value)}>
                {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Stage Date</label>
              <input className="input w-full" type="date" value={form.stage_date} onChange={e => set('stage_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
            <input className="input w-full" value={form.position} onChange={e => set('position', e.target.value)} placeholder="e.g. Cleaning Technician" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : 'Add Applicant'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PipelineTab({ year, setYear }) {
  const [data, setData] = useState(null)
  const [stageFilter, setStageFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    apiFetch(`/api/hiring?year=${year}&stage=${stageFilter}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, stageFilter])

  async function updateStage(id, stage) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    const body = { stage, stage_date: today }
    if (stage === 'hired') body.hired = true
    if (stage === 'no_show') body.no_show = true
    await apiFetch(`/api/hiring/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    load()
  }

  async function deleteApplicant(id, name) {
    if (!confirm(`Delete ${name}?`)) return
    await apiFetch(`/api/hiring/${id}`, { method: 'DELETE' })
    load()
  }

  const { applicants = [], kpi = {} } = data || {}

  return (
    <div>
      {/* KPI cards */}
      <div className="card mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Applicants" value={kpi.total_applicants ?? '—'} color="text-ink" />
          <StatCard label="Interviews" value={kpi.interviews ?? '—'} color="text-blue-600" />
          <StatCard label="Hired YTD" value={kpi.hired ?? '—'} color="text-ok" />
          <StatCard label="No-Shows" value={kpi.no_shows ?? '—'} color="text-orange-500" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">‹</button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">›</button>
        </div>
        <select className="input text-sm py-1.5" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All Stages</option>
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {applicants.length > 0 && (
            <button
              onClick={() => exportCsv(`jpc-pipeline-${year}.csv`, applicants.map(a => ({ date: a.stage_date || a.created_at?.slice(0,10), name: a.applicant_name, phone: a.phone, email: a.email, stage: a.stage, position: a.position, notes: a.notes })))}
              className="btn-secondary text-sm"
            >↓ Export</button>
          )}
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ Add Applicant</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
        ) : applicants.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm mb-2">No applicants found for {year}{stageFilter !== 'all' ? ` — ${STAGE_CONFIG[stageFilter]?.label}` : ''}.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ Add First Applicant</button>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Name</th>
                <th className="text-left py-2 px-2 font-medium">Phone</th>
                <th className="text-left py-2 px-2 font-medium">Stage</th>
                <th className="text-left py-2 px-2 font-medium">Position</th>
                <th className="text-left py-2 px-2 font-medium">Notes</th>
                <th className="text-right py-2 pl-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map(a => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                    {a.stage_date || a.created_at?.slice(0, 10) || '—'}
                  </td>
                  <td className="py-2.5 px-2 font-medium text-ink whitespace-nowrap">{a.applicant_name || '—'}</td>
                  <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{a.phone || '—'}</td>
                  <td className="py-2.5 px-2"><StageBadge stage={a.stage} /></td>
                  <td className="py-2.5 px-2 text-gray-500">{a.position || '—'}</td>
                  <td className="py-2.5 px-2 text-gray-400 max-w-[160px] truncate" title={a.notes}>{a.notes || '—'}</td>
                  <td className="py-2.5 pl-2 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {a.stage === 'applied' && (
                        <button onClick={() => updateStage(a.id, 'phone_screen')} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap">
                          Screen
                        </button>
                      )}
                      {(a.stage === 'applied' || a.stage === 'phone_screen') && (
                        <button onClick={() => updateStage(a.id, 'interviewed')} className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 whitespace-nowrap">
                          Interview
                        </button>
                      )}
                      {(a.stage === 'interviewed') && (
                        <button onClick={() => updateStage(a.id, 'offered')} className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 whitespace-nowrap">
                          Offer
                        </button>
                      )}
                      {!['hired', 'rejected', 'no_show'].includes(a.stage) && (
                        <>
                          <button onClick={() => updateStage(a.id, 'hired')} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 whitespace-nowrap">
                            Hire
                          </button>
                          <button onClick={() => updateStage(a.id, 'no_show')} className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-500 hover:bg-orange-100 whitespace-nowrap">
                            No Show
                          </button>
                          <button onClick={() => updateStage(a.id, 'rejected')} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 whitespace-nowrap">
                            Reject
                          </button>
                        </>
                      )}
                      <button onClick={() => deleteApplicant(a.id, a.applicant_name)} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 whitespace-nowrap">
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddApplicantModal
          onClose={() => setShowAdd(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function StaffingTrendsTab({ year, setYear }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch(`/api/data/hiring?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .catch(setError)
  }, [year])

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not load hiring data.</p>
    </div>
  )

  if (!data) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="kpi-card border-gray-200 h-28 bg-white" />)}
    </div>
  )

  const { months, cost_per_turnover, recruiting_spend_ytd, cost_per_hire, inputs } = data
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const ytdMonths = months.filter(m => m.month <= currentMonth && m.has_data)
  const totalHires = ytdMonths.reduce((s, m) => s + m.new_hires, 0)
  const totalQuit = ytdMonths.reduce((s, m) => s + m.quit, 0)
  const totalFired = ytdMonths.reduce((s, m) => s + m.fired, 0)
  const totalCallIns = ytdMonths.reduce((s, m) => s + m.call_ins, 0)
  const netHeadcount = totalHires - totalQuit - totalFired

  const totalExits = totalQuit + totalFired
  const turnoverCostTotal = cost_per_turnover ? cost_per_turnover * totalExits : null

  const chartData = months.filter(m => m.month <= currentMonth)
  const hasAnyData = ytdMonths.length > 0
  const missingInputs = !inputs.training_hours || !inputs.hourly_cost || !inputs.ramp_days

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">‹</button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">›</button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCsv(`jpc-hiring-${year}.csv`, data.months.filter(m => m.has_data).map(m => ({ month: m.month, new_hires: m.new_hires, quit: m.quit, fired: m.fired, call_ins: m.call_ins, net_change: m.net_change, avg_rge: m.avg_rge })))}
            className="btn-secondary text-sm"
          >↓ Export CSV</button>
          <Link to="/entry" className="btn-primary text-sm">+ Log Data</Link>
        </div>
      </div>

      {missingInputs && (
        <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-xl px-4 py-3 text-xs text-gray-500 mb-5">
          <span className="text-warn mt-0.5">⚠</span>
          <span>
            Set training hours, hourly cost, and ramp-up days in{' '}
            <Link to="/settings" className="text-brand underline">Settings</Link>{' '}
            to enable turnover cost estimates.
          </span>
        </div>
      )}

      {/* YTD summary */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">YTD {year} Summary</h2>
        {!hasAnyData ? (
          <p className="text-center text-gray-400 text-sm py-6">
            No staff entries logged yet.{' '}
            <Link to="/entry" className="text-brand underline">Log daily data →</Link>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
              <StatCard label="New Hires" value={totalHires} color="text-ok" />
              <StatCard label="Quit" value={totalQuit} color="text-warn" />
              <StatCard label="Fired" value={totalFired} color="text-danger" />
              <StatCard
                label="Net Headcount"
                value={`${netHeadcount >= 0 ? '+' : ''}${netHeadcount}`}
                color={netHeadcount >= 0 ? 'text-ok' : 'text-danger'}
              />
              <StatCard label="Total Call-Ins" value={fmtN(totalCallIns)} color="text-warn" />
            </div>
            {(recruiting_spend_ytd > 0 || cost_per_hire !== null) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <StatCard
                  label="Recruiting Spend YTD"
                  value={fmt$(recruiting_spend_ytd)}
                  color="text-ink"
                />
                <StatCard
                  label="Cost Per Hire"
                  value={cost_per_hire !== null ? fmt$(cost_per_hire) : '—'}
                  sub={cost_per_hire !== null ? `${totalHires} hire${totalHires !== 1 ? 's' : ''}` : 'Enter recruiting spend in Settings'}
                  color="text-ink"
                />
                {cost_per_turnover !== null && cost_per_hire !== null && (
                  <StatCard
                    label="Total Cost Per Hire + Turnover"
                    value={fmt$(cost_per_hire + cost_per_turnover)}
                    sub="Recruiting + training + ramp-up"
                    color="text-ink"
                  />
                )}
              </div>
            )}
            {recruiting_spend_ytd === 0 && (
              <p className="text-xs text-gray-400 text-center pt-3 border-t border-gray-100">
                Add recruiting spend in <Link to="/settings" className="text-brand underline">Settings → Monthly Spend</Link> to see cost-per-hire.
              </p>
            )}
            {turnoverCostTotal !== null && (
              <div className="bg-danger/5 border border-danger/15 rounded-xl px-4 py-3 text-sm text-center">
                <span className="text-gray-500">Estimated turnover cost YTD: </span>
                <span className="font-bold text-danger">{fmt$(turnoverCostTotal)}</span>
                <span className="text-gray-400 text-xs ml-2">
                  ({totalExits} exits × {fmt$(cost_per_turnover)}/ea)
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Net headcount chart */}
      {hasAnyData && (
        <div className="card mb-5">
          <h2 className="font-semibold text-ink mb-4">Monthly Headcount Change</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<NetChangeTooltip />} cursor={{ fill: 'rgba(139,31,47,0.05)' }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Bar dataKey="net_change" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.net_change >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-ok mr-1" />Net gain</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-danger mr-1" />Net loss</span>
          </div>
        </div>
      )}

      {/* Monthly detail table */}
      <div className="card mb-5 overflow-x-auto">
        <h2 className="font-semibold text-ink mb-4">Monthly Detail — {year}</h2>
        <table className="w-full text-sm min-w-[540px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2 pr-3 font-medium">Month</th>
              <th className="text-right py-2 px-2 font-medium">Hires</th>
              <th className="text-right py-2 px-2 font-medium">Quit</th>
              <th className="text-right py-2 px-2 font-medium">Fired</th>
              <th className="text-right py-2 px-2 font-medium">Net</th>
              <th className="text-right py-2 px-2 font-medium">Call-Ins</th>
              <th className="text-right py-2 pl-2 font-medium">Turnover Cost</th>
            </tr>
          </thead>
          <tbody>
            {months
              .filter(m => m.month <= currentMonth)
              .map(m => {
                const exits = m.quit + m.fired
                const mCost = cost_per_turnover ? exits * cost_per_turnover : null
                return (
                  <tr key={m.month} className={`border-b border-gray-50 ${m.has_data ? '' : 'opacity-40'}`}>
                    <td className="py-2.5 pr-3 font-semibold text-ink">{m.label} {year}</td>
                    <td className="text-right py-2.5 px-2">
                      {m.new_hires > 0 ? <span className="text-ok font-medium">+{m.new_hires}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-2">
                      {m.quit > 0 ? <span className="text-warn">{m.quit}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-2">
                      {m.fired > 0 ? <span className="text-danger">{m.fired}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-2 font-semibold">
                      {m.has_data
                        ? <span className={m.net_change >= 0 ? 'text-ok' : 'text-danger'}>{m.net_change >= 0 ? '+' : ''}{m.net_change}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-600">
                      {m.call_ins > 0 ? m.call_ins : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 pl-2 text-gray-600">
                      {mCost && exits > 0 ? <span className="text-danger">{fmt$(mCost)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Turnover cost breakdown */}
      {cost_per_turnover && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Cost of Turnover Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Training Cost</p>
              <p className="text-xl font-bold text-ink">
                {inputs.training_hours && inputs.hourly_cost
                  ? fmt$(inputs.training_hours * inputs.hourly_cost)
                  : '—'}
              </p>
              {inputs.training_hours && inputs.hourly_cost && (
                <p className="text-xs text-gray-400 mt-1">{inputs.training_hours} hrs × ${inputs.hourly_cost}/hr</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ramp-Up Lost Revenue</p>
              <p className="text-xl font-bold text-ink">
                {inputs.ramp_days && inputs.break_even_daily
                  ? fmt$(inputs.ramp_days * inputs.break_even_daily)
                  : inputs.ramp_days
                  ? `${inputs.ramp_days} days`
                  : '—'}
              </p>
              {inputs.ramp_days && (
                <p className="text-xs text-gray-400 mt-1">{inputs.ramp_days} days × {inputs.break_even_daily ? fmt$(inputs.break_even_daily) + '/day' : 'daily break-even'}</p>
              )}
            </div>
            <div className="bg-danger/5 border border-danger/15 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total per Exit</p>
              <p className="text-xl font-bold text-danger">{fmt$(cost_per_turnover)}</p>
              <p className="text-xs text-gray-400 mt-1">Training + ramp-up cost</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeparturesTab({ year, setYear }) {
  const [terminations, setTerminations] = useState([])
  const [hiringData, setHiringData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [baselineForm, setBaselineForm] = useState({ baseline: '', baseline_date: '' })
  const [baselineSaving, setBaselineSaving] = useState(false)
  const [addForm, setAddForm] = useState({ employee_name: '', termination_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()), termination_type: 'fired', reason: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addErr, setAddErr] = useState(null)

  function loadAll() {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/staff/terminations?year=${year}`).then(r => r.json()),
      apiFetch(`/api/data/hiring?year=${year}`).then(r => r.json()),
    ]).then(([terms, hiring]) => {
      setTerminations(terms)
      setHiringData(hiring)
      setBaselineForm({
        baseline: hiring.headcount_baseline ?? '',
        baseline_date: hiring.headcount_baseline_date ?? '',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadAll() }, [year])

  async function toggleType(t) {
    const next = t.termination_type === 'fired' ? 'quit' : 'fired'
    await apiFetch(`/api/staff/terminations/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termination_type: next }),
    })
    loadAll()
  }

  async function deleteTermination(t) {
    if (!confirm(`Delete ${t.employee_name}?`)) return
    await apiFetch(`/api/staff/terminations/${t.id}`, { method: 'DELETE' })
    loadAll()
  }

  async function saveBaseline(e) {
    e.preventDefault()
    setBaselineSaving(true)
    await apiFetch('/api/staff/headcount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline: baselineForm.baseline !== '' ? parseInt(baselineForm.baseline) : null,
        baseline_date: baselineForm.baseline_date || null,
      }),
    })
    setBaselineSaving(false)
    loadAll()
  }

  async function addDeparture(e) {
    e.preventDefault()
    if (!addForm.employee_name.trim()) return setAddErr('Name required')
    setAddSaving(true)
    setAddErr(null)
    const r = await apiFetch('/api/staff/terminations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...addForm, source: 'manual' }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setAddErr(d.error || 'Failed to save')
      setAddSaving(false)
      return
    }
    setAddForm(f => ({ ...f, employee_name: '', reason: '' }))
    setAddSaving(false)
    loadAll()
  }

  const totalFired = terminations.filter(t => t.termination_type === 'fired').length
  const totalQuit  = terminations.filter(t => t.termination_type === 'quit').length
  const totalHiresYear = (hiringData?.months ?? []).reduce((s, m) => s + (m.new_hires || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">‹</button>
          <span className="text-sm font-medium text-gray-700 w-12 text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">›</button>
        </div>
        <p className="text-xs text-gray-400 italic">🤖 future terminations auto via MaidCentral webhook · ✏️ import historical below</p>
      </div>

      {/* Headcount baseline card */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Current Headcount Estimate</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Left: set baseline */}
          <form onSubmit={saveBaseline} className="space-y-3">
            <p className="text-xs text-gray-400">Set a known headcount at a specific date. We'll add hires and subtract departures to estimate today's count.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Baseline Count</label>
                <input
                  type="number" min="0" className="input w-full" placeholder="e.g. 18"
                  value={baselineForm.baseline}
                  onChange={e => setBaselineForm(f => ({ ...f, baseline: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">As of Date</label>
                <input
                  type="date" className="input w-full"
                  value={baselineForm.baseline_date}
                  onChange={e => setBaselineForm(f => ({ ...f, baseline_date: e.target.value }))}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary text-sm w-full" disabled={baselineSaving}>
              {baselineSaving ? 'Saving...' : 'Save Baseline'}
            </button>
          </form>

          {/* Right: estimated current */}
          <div className="flex flex-col justify-center items-center text-center gap-2">
            {hiringData?.estimated_current_headcount != null ? (
              <>
                <p className="text-4xl font-bold text-ink">{hiringData.estimated_current_headcount}</p>
                <p className="text-xs text-gray-500">estimated current employees</p>
                <p className="text-xs text-gray-400">
                  baseline {hiringData.headcount_baseline} as of {hiringData.headcount_baseline_date}
                  {' · '}+{totalHiresYear} hires, −{terminations.length} departures ({year})
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">Set a baseline to see estimated headcount.</p>
            )}
            {terminations.length > 0 && (
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-danger font-medium">{totalFired} fired</span>
                <span className="text-xs text-warn font-medium">{totalQuit} quit</span>
                <span className="text-xs text-gray-400">{year} YTD</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick-add form */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Log a Departure</h2>
        <form onSubmit={addDeparture} className="flex flex-wrap gap-3 items-end">
          {addErr && <p className="w-full text-danger text-xs">{addErr}</p>}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Employee Name *</label>
            <input className="input w-full" placeholder="Full name" value={addForm.employee_name} onChange={e => setAddForm(f => ({ ...f, employee_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" className="input" value={addForm.termination_date} onChange={e => setAddForm(f => ({ ...f, termination_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select className="input" value={addForm.termination_type} onChange={e => setAddForm(f => ({ ...f, termination_type: e.target.value }))}>
              <option value="fired">Fired</option>
              <option value="quit">Quit</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
            <input className="input w-full" placeholder="e.g. attendance" value={addForm.reason} onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary text-sm whitespace-nowrap" disabled={addSaving}>
            {addSaving ? 'Saving...' : '+ Add'}
          </button>
        </form>
      </div>

      {/* Terminations list */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">Departures — {year}</h2>
          {terminations.length > 0 && (
            <button
              onClick={() => exportCsv(`jpc-departures-${year}.csv`, terminations.map(t => ({ name: t.employee_name, date: t.termination_date, type: t.termination_type, source: t.source, reason: t.reason || '' })))}
              className="btn-secondary text-sm"
            >↓ Export</button>
          )}
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
        ) : terminations.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400 text-sm">No departures recorded for {year}.</p>
            <p className="text-gray-400 text-xs mt-1">Use the form above to import historical records.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Name</th>
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-left py-2 px-2 font-medium">Source</th>
                <th className="text-left py-2 px-2 font-medium">Reason</th>
                <th className="text-right py-2 pl-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {terminations.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{t.termination_date || '—'}</td>
                  <td className="py-2.5 px-2 font-medium text-ink whitespace-nowrap">{t.employee_name}</td>
                  <td className="py-2.5 px-2">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${t.termination_type === 'fired' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {t.termination_type === 'fired' ? 'Fired' : 'Quit'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${t.source === 'webhook' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {t.source === 'webhook' ? '🤖 MC' : '✏️ Manual'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-gray-400 max-w-[160px] truncate" title={t.reason}>{t.reason || '—'}</td>
                  <td className="py-2.5 pl-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggleType(t)}
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 whitespace-nowrap"
                        title="Toggle fired ↔ quit"
                      >
                        {t.termination_type === 'fired' ? '→ Quit' : '→ Fired'}
                      </button>
                      <button
                        onClick={() => deleteTermination(t)}
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 whitespace-nowrap"
                      >Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Staff Directory tab ───────────────────────────────────────────────────
function StaffDirectoryTab() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [addForm, setAddForm] = useState({ employee_name: '', hire_date: '', termination_date: '', termination_type: '', notes: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addErr, setAddErr] = useState(null)
  const [importRows, setImportRows] = useState(null)   // rows after parse
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)
  const [importTypeMap, setImportTypeMap] = useState({}) // index → type override

  function load() {
    setLoading(true)
    apiFetch('/api/staff/employees').then(r => r.json()).then(d => { setEmployees(d); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  // ── helpers ─────────────────────────────────────────────────────────────
  function tenureLabel(hire, term) {
    if (!hire) return null
    const start = new Date(hire + 'T12:00:00Z')
    const end   = term ? new Date(term + 'T12:00:00Z') : new Date()
    const days  = Math.round((end - start) / 86400000)
    if (days < 0) return null
    if (days < 30) return `${days}d`
    const months = Math.round(days / 30.4)
    if (months < 12) return `${months}mo`
    const years = (days / 365.25).toFixed(1)
    return `${years}yr`
  }

  // ── File import ─────────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setImportMsg(null)
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const r = await apiFetch('/api/staff/employees/parse-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: b64 }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Parse failed')
      setImportRows(d.rows)
      setImportTypeMap({})
    } catch (err) {
      setImportMsg({ type: 'error', text: `Parse error: ${err.message}` })
    } finally {
      setImporting(false)
    }
  }

  async function commitImport() {
    if (!importRows?.length) return
    setImporting(true)
    try {
      const rows = importRows.map((r, i) => ({
        ...r,
        termination_type: importTypeMap[i] !== undefined ? importTypeMap[i] : r.termination_type,
      }))
      const res = await apiFetch('/api/staff/employees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const d = await res.json()
      setImportMsg({ type: 'ok', text: `✓ Imported ${d.inserted} employees` })
      setImportRows(null)
      load()
    } catch (err) {
      setImportMsg({ type: 'error', text: err.message })
    } finally {
      setImporting(false)
    }
  }

  // ── Add one ──────────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!addForm.employee_name.trim()) return setAddErr('Name required')
    setAddSaving(true); setAddErr(null)
    const payload = { ...addForm }
    if (!payload.termination_date) { payload.termination_date = null; payload.termination_type = null }
    const r = await apiFetch('/api/staff/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) { const d = await r.json(); setAddErr(d.error || 'Failed'); setAddSaving(false); return }
    setAddForm({ employee_name: '', hire_date: '', termination_date: '', termination_type: '', notes: '' })
    setShowAdd(false)
    setAddSaving(false)
    load()
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  function startEdit(emp) {
    setEditId(emp.id)
    setEditForm({
      employee_name: emp.employee_name,
      hire_date: emp.hire_date || '',
      termination_date: emp.termination_date || '',
      termination_type: emp.termination_type || '',
      notes: emp.notes || '',
    })
  }

  async function saveEdit(id) {
    const payload = { ...editForm }
    if (!payload.termination_date) { payload.termination_date = null; payload.termination_type = null }
    await apiFetch(`/api/staff/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setEditId(null)
    load()
  }

  async function deleteEmp(emp) {
    if (!confirm(`Delete ${emp.employee_name}?`)) return
    await apiFetch(`/api/staff/employees/${emp.id}`, { method: 'DELETE' })
    load()
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    if (statusFilter === 'active' && e.termination_date) return false
    if (statusFilter === 'terminated' && !e.termination_date) return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.employee_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const activeCount     = employees.filter(e => !e.termination_date).length
  const terminatedCount = employees.filter(e => !!e.termination_date).length

  return (
    <div>
      {/* Summary bar */}
      <div className="card mb-5">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Records" value={employees.length} color="text-ink" />
          <StatCard label="Active" value={activeCount} color="text-ok" />
          <StatCard label="Alumni" value={terminatedCount} color="text-gray-500" />
        </div>
      </div>

      {/* Import banner */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Import from Excel / CSV</h2>
          <label className={`btn-primary text-sm cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? 'Parsing…' : '↑ Choose File'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} disabled={importing} />
          </label>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Expects columns: <span className="font-mono">First name, Last name, Hire Date, Termination Date</span>.
          Employees without a termination date are imported as active.
        </p>
        {importMsg && (
          <p className={`text-sm font-medium ${importMsg.type === 'ok' ? 'text-ok' : 'text-danger'}`}>{importMsg.text}</p>
        )}

        {importRows && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">{importRows.length} rows parsed — set termination type for leavers, then confirm</p>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" onClick={() => setImportRows(null)}>Cancel</button>
                <button className="btn-primary text-xs" onClick={commitImport} disabled={importing}>
                  {importing ? 'Importing…' : `Import ${importRows.length} employees`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto border border-gray-100 rounded-xl">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-gray-400 uppercase border-b border-gray-100">
                    <th className="text-left py-1.5 px-2 font-medium">Name</th>
                    <th className="text-left py-1.5 px-2 font-medium">Hire Date</th>
                    <th className="text-left py-1.5 px-2 font-medium">Term Date</th>
                    <th className="text-left py-1.5 px-2 font-medium">Type</th>
                    <th className="text-left py-1.5 px-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 px-2 font-medium text-ink">{r.employee_name}</td>
                      <td className="py-1.5 px-2 text-gray-500">{r.hire_date || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-500">{r.termination_date || <span className="text-ok">Active</span>}</td>
                      <td className="py-1.5 px-2">
                        {r.termination_date ? (
                          <select
                            className="input py-0.5 text-xs"
                            value={importTypeMap[i] ?? ''}
                            onChange={e => setImportTypeMap(m => ({ ...m, [i]: e.target.value || null }))}
                          >
                            <option value="">— select —</option>
                            <option value="quit">Quit</option>
                            <option value="fired">Fired</option>
                          </select>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-gray-400">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {[['all', 'All'], ['active', 'Active'], ['terminated', 'Alumni']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === v ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
            >{l}</button>
          ))}
        </div>
        <input
          className="input text-sm py-1.5 flex-1 min-w-[160px] max-w-xs"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ml-auto">
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary text-sm">+ Add Employee</button>
        </div>
      </div>

      {/* Quick add form */}
      {showAdd && (
        <div className="card mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Employee</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            {addErr && <p className="col-span-full text-danger text-xs">{addErr}</p>}
            <div className="col-span-full sm:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
              <input className="input w-full" placeholder="Full name" value={addForm.employee_name} onChange={e => setAddForm(f => ({ ...f, employee_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hire Date</label>
              <input type="date" className="input w-full" value={addForm.hire_date} onChange={e => setAddForm(f => ({ ...f, hire_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Termination Date</label>
              <input type="date" className="input w-full" value={addForm.termination_date} onChange={e => setAddForm(f => ({ ...f, termination_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select className="input w-full" value={addForm.termination_type} onChange={e => setAddForm(f => ({ ...f, termination_type: e.target.value }))} disabled={!addForm.termination_date}>
                <option value="">Active</option>
                <option value="quit">Quit</option>
                <option value="fired">Fired</option>
              </select>
            </div>
            <div className="col-span-full sm:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <input className="input w-full" placeholder="Optional…" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 col-span-full sm:col-span-1">
              <button type="button" className="btn-secondary flex-1 text-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1 text-sm" disabled={addSaving}>{addSaving ? 'Saving…' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Employee table */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">
            Staff Directory
            {search || statusFilter !== 'all' ? <span className="text-sm text-gray-400 font-normal ml-2">({filtered.length} shown)</span> : ''}
          </h2>
          {filtered.length > 0 && (
            <button
              onClick={() => exportCsv('jpc-staff.csv', filtered.map(e => ({ name: e.employee_name, hire_date: e.hire_date || '', termination_date: e.termination_date || '', type: e.termination_type || 'active', notes: e.notes || '' })))}
              className="btn-secondary text-sm"
            >↓ Export</button>
          )}
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm animate-pulse">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400 text-sm">No employees found.</p>
            <p className="text-gray-400 text-xs mt-1">Import from Excel above or add manually.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Name</th>
                <th className="text-left py-2 px-2 font-medium">Hire Date</th>
                <th className="text-left py-2 px-2 font-medium">Tenure</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Term Date</th>
                <th className="text-left py-2 px-2 font-medium">Notes</th>
                <th className="text-right py-2 pl-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  {editId === emp.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input className="input w-full text-xs py-1" value={editForm.employee_name} onChange={e => setEditForm(f => ({ ...f, employee_name: e.target.value }))} />
                      </td>
                      <td className="py-2 px-2">
                        <input type="date" className="input text-xs py-1" value={editForm.hire_date} onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))} />
                      </td>
                      <td className="py-2 px-2 text-gray-400 text-xs">{tenureLabel(editForm.hire_date || null, editForm.termination_date || null) || '—'}</td>
                      <td className="py-2 px-2">
                        <select className="input text-xs py-1" value={editForm.termination_type} onChange={e => setEditForm(f => ({ ...f, termination_type: e.target.value }))} disabled={!editForm.termination_date}>
                          <option value="">Active</option>
                          <option value="quit">Quit</option>
                          <option value="fired">Fired</option>
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input type="date" className="input text-xs py-1" value={editForm.termination_date} onChange={e => setEditForm(f => ({ ...f, termination_date: e.target.value }))} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="input text-xs py-1 w-full" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes…" />
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEdit(emp.id)} className="text-xs px-2 py-0.5 rounded bg-ok/10 text-ok hover:bg-ok/20">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 pr-3 font-medium text-ink whitespace-nowrap">{emp.employee_name}</td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{emp.hire_date || '—'}</td>
                      <td className="py-2.5 px-2 text-gray-400 text-xs whitespace-nowrap">{tenureLabel(emp.hire_date, emp.termination_date) || '—'}</td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {!emp.termination_date ? (
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                        ) : emp.termination_type === 'quit' ? (
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Quit</span>
                        ) : emp.termination_type === 'fired' ? (
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">Fired</span>
                        ) : (
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Alumni</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{emp.termination_date || '—'}</td>
                      <td className="py-2.5 px-2 text-gray-400 max-w-[160px] truncate" title={emp.notes}>{emp.notes || '—'}</td>
                      <td className="py-2.5 pl-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEdit(emp)} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">Edit</button>
                          <button onClick={() => deleteEmp(emp)} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500">Del</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function Hiring() {
  const [tab, setTab] = useState('pipeline')
  const [year, setYear] = useState(new Date().getFullYear())

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Hiring &amp; Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">Applicant pipeline, staffing trends &amp; departures · <span className="text-[11px] text-gray-400">🤖 pipeline auto via Woot Recruit · 🤖 terminations auto via MaidCentral · ✏️ hires/fires/call-ins logged via Entry</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setTab('pipeline')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'pipeline' ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
        >
          Pipeline
        </button>
        <button
          onClick={() => setTab('staffing')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'staffing' ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
        >
          Staffing Trends
        </button>
        <button
          onClick={() => setTab('departures')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'departures' ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
        >
          Departures
        </button>
        <button
          onClick={() => setTab('directory')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'directory' ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
        >
          Staff Directory
        </button>
      </div>

      {tab === 'pipeline' && <PipelineTab year={year} setYear={setYear} />}
      {tab === 'staffing' && <StaffingTrendsTab year={year} setYear={setYear} />}
      {tab === 'departures' && <DeparturesTab year={year} setYear={setYear} />}
      {tab === 'directory' && <StaffDirectoryTab />}
    </div>
  )
}
