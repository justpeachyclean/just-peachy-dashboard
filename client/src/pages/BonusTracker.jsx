import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { exportCsv } from '../utils/exportCsv'

const fmtPct = (n) => n !== null && n !== undefined ? `${(n * 100).toFixed(1)}%` : '—'
const fmt$ = (n) => `$${Number(n || 0).toLocaleString()}`

const TIERS = [
  { tier: 1, label: 'Tier 1', criteria: 'Close rate ≥ 40%', amount: 200, color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { tier: 2, label: 'Tier 2', criteria: '≥ 40% close + ≥ 50% of recurring are W/BW', amount: 400, color: 'bg-ok/10 border-ok/30 text-ok' },
  { tier: 3, label: 'Tier 3', criteria: '≥ 40% close + ≥ 75% of recurring are W/BW', amount: 700, color: 'bg-brand/10 border-brand/30 text-brand' },
]

const TIER_COLORS = {
  0: 'bg-gray-100 text-gray-400',
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-green-100 text-green-700',
  3: 'bg-brand/20 text-brand',
}

function TierBadge({ tier }) {
  if (!tier) return <span className="text-xs text-gray-300">—</span>
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${TIER_COLORS[tier]}`}>
      T{tier}
    </span>
  )
}

function StreakDots({ streak }) {
  return (
    <span className="flex gap-0.5 items-center justify-center">
      {[0, 1, 2].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < streak ? 'bg-ok' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(m) {
  const [yr, mm] = m.split('-')
  return `${MONTH_LABELS[parseInt(mm) - 1]} ${yr}`
}

function currentYear() { return new Date().getFullYear() }

export default function BonusTracker() {
  const [reps, setReps] = useState([])
  const [records, setRecords] = useState([])
  const [calendar, setCalendar] = useState([])
  const [year, setYear] = useState(currentYear())
  const [error, setError] = useState(null)

  // Rep modal
  const [autoCalcMsg, setAutoCalcMsg] = useState('')
  const [autoCalcLoading, setAutoCalcLoading] = useState(false)
  const [autoCalcMonth, setAutoCalcMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })

  const [showRepForm, setShowRepForm] = useState(false)
  const [editRep, setEditRep] = useState(null)
  const [repForm, setRepForm] = useState({ name: '', email: '', start_date: '', active: 1 })
  const [repSaving, setRepSaving] = useState(false)

  // Record entry modal
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordForm, setRecordForm] = useState({ rep_id: '', month: '', quotes_given: '', closed_sales: '', recurring_closed: '', weekly_biweekly_closed: '' })
  const [recordSaving, setRecordSaving] = useState(false)
  const [recordResult, setRecordResult] = useState(null)
  const [recordMsg, setRecordMsg] = useState('')

  const loadAll = () => {
    Promise.all([
      apiFetch('/api/bonus/reps').then(r => r.json()),
      apiFetch(`/api/bonus/records?year=${year}`).then(r => r.json()),
      apiFetch('/api/bonus/payout-calendar').then(r => r.json()),
    ])
      .then(([r, rec, cal]) => { setReps(r); setRecords(rec); setCalendar(cal) })
      .catch(setError)
  }

  useEffect(() => { loadAll() }, [year])

  // Build months array for table header
  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0')
    return `${year}-${mm}`
  })
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Index records by rep+month
  const recMap = {}
  records.forEach(r => {
    if (!recMap[r.rep_id]) recMap[r.rep_id] = {}
    recMap[r.rep_id][r.month] = r
  })

  // Calculate streak for a rep up to a given month
  function getStreak(repId, upToMonth) {
    const priorMonths = months.filter(m => m <= upToMonth)
    let streak = 0
    for (let i = priorMonths.length - 1; i >= 0; i--) {
      const rec = recMap[repId]?.[priorMonths[i]]
      if (rec && rec.tier >= 2) streak++
      else break
    }
    return Math.min(streak, 3)
  }

  // Rep form handlers
  const openRepForm = (rep = null) => {
    setEditRep(rep)
    setRepForm(rep ? { name: rep.name, email: rep.email || '', start_date: rep.start_date || '', active: rep.active } : { name: '', email: '', start_date: '', active: 1 })
    setShowRepForm(true)
  }

  const saveRep = async (e) => {
    e.preventDefault()
    setRepSaving(true)
    try {
      const url = editRep ? `/api/bonus/reps/${editRep.id}` : '/api/bonus/reps'
      const method = editRep ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(repForm) })
      if (!res.ok) throw new Error(await res.text())
      loadAll()
      setShowRepForm(false)
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setRepSaving(false)
    }
  }

  // Record form handlers
  const openRecordForm = (repId = '', month = '') => {
    const existing = repId && month ? recMap[repId]?.[month] : null
    setRecordForm({
      rep_id: repId || '',
      month: month || currentMonth,
      quotes_given: existing?.quotes_given ?? '',
      closed_sales: existing?.closed_sales ?? '',
      recurring_closed: existing?.recurring_closed ?? '',
      weekly_biweekly_closed: existing?.weekly_biweekly_closed ?? '',
    })
    setRecordResult(null)
    setRecordMsg('')
    setShowRecordForm(true)
  }

  const saveRecord = async (e) => {
    e.preventDefault()
    setRecordSaving(true)
    setRecordMsg('')
    try {
      const payload = {
        rep_id: parseInt(recordForm.rep_id),
        month: recordForm.month,
        quotes_given: parseInt(recordForm.quotes_given) || 0,
        closed_sales: parseInt(recordForm.closed_sales) || 0,
        recurring_closed: parseInt(recordForm.recurring_closed) || 0,
        weekly_biweekly_closed: parseInt(recordForm.weekly_biweekly_closed) || 0,
      }
      const res = await apiFetch('/api/bonus/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setRecordResult(result)
      setRecordMsg('Saved!')
      loadAll()
    } catch (err) {
      setRecordMsg(`Error: ${err.message}`)
    } finally {
      setRecordSaving(false)
    }
  }

  const markPaid = async (repId, month) => {
    await apiFetch('/api/bonus/records/pay', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rep_id: repId, month }),
    })
    loadAll()
  }

  const autoCalculate = async () => {
    setAutoCalcLoading(true)
    setAutoCalcMsg('')
    try {
      const res = await apiFetch('/api/bonus/auto-calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: autoCalcMonth }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAutoCalcMsg(`Calculated ${data.calculated} rep${data.calculated !== 1 ? 's' : ''} for ${autoCalcMonth}`)
      loadAll()
    } catch (err) {
      setAutoCalcMsg(`Error: ${err.message}`)
    } finally {
      setAutoCalcLoading(false)
    }
  }

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not load bonus data.</p>
    </div>
  )

  const activeReps = reps.filter(r => r.active)

  // Total pending payouts this month
  const thisMonthPayouts = calendar.filter(c => c.payout_month === currentMonth)
  const pendingTotal = thisMonthPayouts.reduce((s, c) => s + (c.bonus_amount || 0) + (c.quarterly_bonus || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Bonus Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Per-rep tier calculations &amp; payout calendar</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1">
            <input
              type="month"
              className="form-input text-sm py-1.5 w-36"
              value={autoCalcMonth}
              onChange={e => setAutoCalcMonth(e.target.value)}
            />
            <button
              onClick={autoCalculate}
              disabled={autoCalcLoading}
              className="text-sm border border-gray-200 bg-white text-gray-600 hover:text-ink font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              title="Auto-calculate bonus records from lead_records data"
            >
              {autoCalcLoading ? 'Calculating…' : 'Auto-Calculate from Leads'}
            </button>
          </div>
          <button
            onClick={() => exportCsv(`jpc-bonus-${new Date().toISOString().slice(0,10)}.csv`, records.map(r => ({ month: r.month, rep: r.rep_name, tier: r.tier, bonus: r.bonus_amount, streak_bonus: r.streak_bonus, paid: r.paid ? 'Yes' : 'No', payout_month: r.payout_month })))}
            className="btn-secondary text-sm"
          >↓ Export CSV</button>
          <button onClick={() => openRecordForm()} className="btn-primary text-sm">+ Log Month</button>
          <button onClick={() => openRepForm()} className="text-sm border border-gray-200 bg-white text-gray-600 hover:text-ink font-medium px-4 py-2 rounded-lg transition-colors">+ Add Rep</button>
        </div>
      </div>

      {/* Auto-calc status message */}
      {autoCalcMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${autoCalcMsg.startsWith('Error') ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}>
          {autoCalcMsg}
        </div>
      )}

      {/* Tier reference */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Bonus Tiers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {TIERS.map(t => (
            <div key={t.tier} className={`border rounded-xl p-4 text-center ${t.color}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{t.label}</p>
              <p className="text-2xl font-bold mt-1">{fmt$(t.amount)}<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs mt-1.5 opacity-80">{t.criteria}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          <strong>Quarterly Streak:</strong> Tier 2 for 3 consecutive months = <span className="text-ok font-semibold">+$250</span>.
          Tier 3 for 3 consecutive months = <span className="text-ok font-semibold">+$500</span>.{' '}
          Paid 2 months after qualifying month. Must be actively employed at payout.
        </div>
      </div>

      {/* Payout calendar */}
      {calendar.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Upcoming Payouts</h2>
            {pendingTotal > 0 && (
              <span className="text-xs font-semibold text-warn bg-warn/10 px-2 py-1 rounded-full">
                {fmt$(pendingTotal)} due this month
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left py-2 pr-3 font-medium">Rep</th>
                  <th className="text-left py-2 px-2 font-medium">Qualifying Month</th>
                  <th className="text-center py-2 px-2 font-medium">Tier</th>
                  <th className="text-right py-2 px-2 font-medium">Bonus</th>
                  <th className="text-right py-2 px-2 font-medium">Streak +</th>
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                  <th className="text-left py-2 pl-3 font-medium">Payout Month</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {calendar.map(c => (
                  <tr key={`${c.rep_id}-${c.month}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 pr-3 font-medium text-ink">{c.rep_name}</td>
                    <td className="py-2.5 px-2 text-gray-600">{monthLabel(c.month)}</td>
                    <td className="py-2.5 px-2 text-center"><TierBadge tier={c.tier} /></td>
                    <td className="text-right py-2.5 px-2 font-medium text-gray-700">{fmt$(c.bonus_amount)}</td>
                    <td className="text-right py-2.5 px-2">
                      {c.quarterly_bonus > 0
                        ? <span className="text-ok font-semibold">+{fmt$(c.quarterly_bonus)}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="text-right py-2.5 px-2 font-bold text-ink">{fmt$(c.bonus_amount + c.quarterly_bonus)}</td>
                    <td className={`py-2.5 pl-3 font-medium ${c.payout_month === currentMonth ? 'text-warn' : 'text-gray-600'}`}>
                      {monthLabel(c.payout_month)}
                      {c.payout_month === currentMonth && <span className="ml-1 text-xs text-warn">← due now</span>}
                    </td>
                    <td className="py-2.5 pl-3">
                      <button
                        onClick={() => markPaid(c.rep_id, c.month)}
                        className="text-xs text-sage hover:underline whitespace-nowrap"
                      >
                        Mark paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Year selector + monthly grid */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Monthly Tier Grid — {year}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">‹</button>
            <span className="text-sm font-medium text-gray-700">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">›</button>
          </div>
        </div>

        {activeReps.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No reps yet.{' '}
            <button onClick={() => openRepForm()} className="text-brand underline">Add a sales rep</button>
            {' '}to start tracking bonuses.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium uppercase tracking-wide">Rep</th>
                  {months.map(m => {
                    const [, mm] = m.split('-')
                    const isPast = m < currentMonth
                    const isCurrent = m === currentMonth
                    return (
                      <th key={m} className={`text-center py-2 px-1 font-medium uppercase tracking-wide w-16 ${isCurrent ? 'text-brand' : isPast ? 'text-gray-400' : 'text-gray-200'}`}>
                        {MONTH_LABELS[parseInt(mm) - 1]}
                      </th>
                    )
                  })}
                  <th className="text-right py-2 pl-3 font-medium uppercase tracking-wide">YTD Total</th>
                </tr>
              </thead>
              <tbody>
                {activeReps.map(rep => {
                  const ytdTotal = months
                    .filter(m => m <= currentMonth)
                    .reduce((s, m) => {
                      const rec = recMap[rep.id]?.[m]
                      return s + (rec?.bonus_amount || 0) + (rec?.quarterly_bonus || 0)
                    }, 0)

                  return (
                    <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openRepForm(rep)} className="font-semibold text-ink hover:text-brand transition-colors">
                            {rep.name}
                          </button>
                        </div>
                      </td>
                      {months.map(m => {
                        const rec = recMap[rep.id]?.[m]
                        const isFuture = m > currentMonth
                        const streak = rec ? getStreak(rep.id, m) : 0
                        return (
                          <td key={m} className="text-center py-3 px-1">
                            {isFuture ? (
                              <span className="text-gray-200 text-xs">·</span>
                            ) : rec ? (
                              <div className="flex flex-col items-center gap-1">
                                <TierBadge tier={rec.tier} />
                                {rec.tier >= 2 && <StreakDots streak={streak} />}
                                {rec.quarterly_bonus > 0 && (
                                  <span className="text-xs text-ok font-semibold">+${rec.quarterly_bonus}</span>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => openRecordForm(rep.id, m)}
                                className="text-gray-200 hover:text-sage text-lg leading-none transition-colors"
                                title="Log this month"
                              >
                                +
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-right py-3 pl-3 font-bold text-ink">
                        {ytdTotal > 0 ? fmt$(ytdTotal) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive reps */}
      {reps.filter(r => !r.active).length > 0 && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Inactive Reps</h2>
          <div className="flex flex-wrap gap-2">
            {reps.filter(r => !r.active).map(rep => (
              <button key={rep.id} onClick={() => openRepForm(rep)} className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1 hover:bg-gray-100">
                {rep.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rep modal */}
      {showRepForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-ink">{editRep ? 'Edit Rep' : 'Add Sales Rep'}</h3>
              <button onClick={() => setShowRepForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={saveRep} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name</label>
                <input type="text" required className="form-input" value={repForm.name} onChange={e => setRepForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email (optional)</label>
                <input type="email" className="form-input" value={repForm.email} onChange={e => setRepForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
                <input type="date" className="form-input" value={repForm.start_date} onChange={e => setRepForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="repActive" checked={!!repForm.active} onChange={e => setRepForm(p => ({ ...p, active: e.target.checked ? 1 : 0 }))} className="w-4 h-4 accent-brand" />
                <label htmlFor="repActive" className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowRepForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button type="submit" disabled={repSaving} className="btn-primary text-sm">{repSaving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record entry modal */}
      {showRecordForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-ink">Log Monthly Performance</h3>
              <button onClick={() => setShowRecordForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={saveRecord} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sales Rep</label>
                <select className="form-input" value={recordForm.rep_id} onChange={e => setRecordForm(p => ({ ...p, rep_id: e.target.value }))} required>
                  <option value="">— Select rep —</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Month</label>
                <input type="month" className="form-input" value={recordForm.month} onChange={e => setRecordForm(p => ({ ...p, month: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Quotes Given</label>
                <input type="number" min="0" className="form-input" value={recordForm.quotes_given} onChange={e => setRecordForm(p => ({ ...p, quotes_given: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Closed Sales</label>
                <input type="number" min="0" className="form-input" value={recordForm.closed_sales} onChange={e => setRecordForm(p => ({ ...p, closed_sales: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Recurring Closed</label>
                <input type="number" min="0" className="form-input" value={recordForm.recurring_closed} onChange={e => setRecordForm(p => ({ ...p, recurring_closed: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Weekly / Biweekly (subset of recurring)</label>
                <input type="number" min="0" className="form-input" value={recordForm.weekly_biweekly_closed} onChange={e => setRecordForm(p => ({ ...p, weekly_biweekly_closed: e.target.value }))} />
              </div>

              {recordResult && (
                <div className={`rounded-lg p-3 text-sm ${recordResult.tier > 0 ? 'bg-ok/10 border border-ok/20' : 'bg-gray-50 border border-gray-100'}`}>
                  <p className="font-semibold text-ink mb-1">
                    {recordResult.tier > 0 ? `Tier ${recordResult.tier} — ${fmt$(recordResult.bonus_amount)}/mo` : 'No tier reached'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Close rate: {fmtPct(recordResult.close_rate)} · W/BW ratio: {fmtPct(recordResult.recurring_ratio)}
                  </p>
                  {recordResult.quarterly_bonus > 0 && (
                    <p className="text-xs text-ok font-semibold mt-1">🎉 Quarterly streak bonus: +{fmt$(recordResult.quarterly_bonus)}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Payout month: {monthLabel(recordResult.payout_month)}</p>
                </div>
              )}

              {recordMsg && !recordResult && (
                <p className={recordMsg.startsWith('Error') ? 'text-danger text-sm' : 'text-ok text-sm'}>{recordMsg}</p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowRecordForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button type="submit" disabled={recordSaving} className="btn-primary text-sm">{recordSaving ? 'Saving…' : 'Calculate & Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
