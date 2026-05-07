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

export default function Hiring() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    fetch(`/api/data/hiring?year=${year}`)
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

  // Chart data — only months at/before current
  const chartData = months.filter(m => m.month <= currentMonth)

  const hasAnyData = ytdMonths.length > 0

  const missingInputs = !inputs.training_hours || !inputs.hourly_cost || !inputs.ramp_days

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Hiring &amp; Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">Headcount, turnover, and call-in trends</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">‹</button>
            <span className="text-sm font-medium text-gray-700 w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="text-gray-400 hover:text-ink px-2 py-1 rounded text-sm">›</button>
          </div>
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
                const isFuture = m.month > currentMonth
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

      {/* GHL interview funnel placeholder */}
      <div className="card text-center py-8 border-dashed border-2 border-gray-100">
        <p className="text-sm font-semibold text-gray-500 mb-2">Interview Funnel</p>
        <div className="flex justify-center gap-4 mb-3">
          {['Scheduled', 'Showed Up', 'Offered', 'Started'].map(s => (
            <div key={s} className="text-center">
              <p className="text-lg font-bold text-gray-200">—</p>
              <p className="text-xs text-gray-300 mt-0.5">{s}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Live funnel data available after connecting GHL webhook.{' '}
          See <Link to="/settings" className="text-brand underline">Settings → Webhook Secret</Link>.
        </p>
      </div>
    </div>
  )
}
