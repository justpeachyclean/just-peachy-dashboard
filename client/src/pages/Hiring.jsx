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

export default function Hiring() {
  const [tab, setTab] = useState('pipeline')
  const [year, setYear] = useState(new Date().getFullYear())

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Hiring &amp; Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">Applicant pipeline and staffing trends · <span className="text-[11px] text-gray-400">🤖 pipeline auto via Woot Recruit · ✏️ hires/fires/call-ins logged via Entry</span></p>
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
      </div>

      {tab === 'pipeline' && <PipelineTab year={year} setYear={setYear} />}
      {tab === 'staffing' && <StaffingTrendsTab year={year} setYear={setYear} />}
    </div>
  )
}
