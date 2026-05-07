import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'

function KpiCard({ label, value, sub, borderColor = 'border-brand', badge }) {
  return (
    <div className={`kpi-card ${borderColor}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {badge}
      </div>
      <p className="text-3xl font-bold text-ink mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

const fmt$ = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-ink mb-1">{d?.fullLabel || label}</p>
      <p className="text-brand">Revenue: <span className="font-bold">{fmt$(d?.revenue)}</span></p>
      {d?.goal > 0 && <p className="text-gray-500">Goal: {fmt$(d?.goal)}</p>}
    </div>
  )
}

export default function Overview() {
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const year = new Date().getFullYear()
    Promise.all([
      fetch('/api/data/summary').then(r => r.json()),
      fetch(`/api/data/monthly?year=${year}`).then(r => r.json()),
    ])
      .then(([s, m]) => { setSummary(s); setMonthly(m) })
      .catch(setError)
  }, [])

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not connect to the server.</p>
      <p className="text-sm text-gray-500 mt-1">Make sure the backend is running on port 3001.</p>
    </div>
  )

  if (!summary) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="kpi-card border-gray-200 h-28 bg-white" />)}
    </div>
  )

  const staleAlert = (() => {
    if (!summary.last_entry_date) return true
    return (Date.now() - new Date(summary.last_entry_date).getTime()) / 86400000 > 3
  })()

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const [mYear, mMon] = summary.month.split('-')
  const monthLabel = `${MONTH_NAMES[parseInt(mMon) - 1]} ${mYear}`
  const closeRate = summary.leads_quoted > 0 ? summary.leads_closed / summary.leads_quoted : null
  const dailyGoal = parseFloat(summary.settings?.daily_goal)

  // Chart data — only months with any revenue or up to current month
  const currentMonth = summary.month
  const chartData = monthly
    .filter(m => m.month <= currentMonth)
    .map(m => ({
      ...m,
      fullLabel: MONTH_NAMES[parseInt(m.month.split('-')[1]) - 1],
    }))

  const ytdRevenue = monthly
    .filter(m => m.month <= currentMonth)
    .reduce((sum, m) => sum + (m.revenue || 0), 0)

  const ytdGoal = monthly
    .filter(m => m.month <= currentMonth)
    .reduce((sum, m) => sum + (m.goal || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthLabel}</p>
        </div>
        <Link to="/entry" className="btn-primary text-sm">+ Log Data</Link>
      </div>

      {/* Stale data alert */}
      {staleAlert && (
        <div className="flex items-center gap-3 bg-warn/10 border border-warn/30 text-warn rounded-xl px-4 py-3 mb-5 text-sm font-medium">
          <span>⚠️</span>
          <span>
            {summary.last_entry_date
              ? `Last entry was ${summary.last_entry_date} — over 3 days ago.`
              : 'No manual entries logged yet.'}
            {' '}<Link to="/entry" className="underline">Log data now →</Link>
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Recurring Clients"
          value={summary.recurring_clients.toLocaleString()}
          borderColor="border-brand"
          sub={`${summary.cancellations} cancelled this month`}
        />
        <KpiCard
          label="MTD Revenue"
          value={fmt$(summary.revenue)}
          borderColor="border-peach"
          sub={dailyGoal ? `Daily goal: ${fmt$(dailyGoal)}` : 'Set goal in Settings'}
        />
        <KpiCard
          label="Attrition Rate"
          value={fmtPct(summary.attrition_rate)}
          borderColor={summary.attrition_rate > 0.08 ? 'border-danger' : summary.attrition_rate > 0.05 ? 'border-warn' : 'border-ok'}
          badge={
            summary.attrition_rate > 0.08
              ? <span className="text-xs font-semibold text-danger">▼ High</span>
              : summary.attrition_rate > 0.05
              ? <span className="text-xs font-semibold text-warn">▲ Watch</span>
              : <span className="text-xs font-semibold text-ok">▲ Good</span>
          }
        />
        <KpiCard
          label="Close Rate (MTD)"
          value={closeRate !== null ? fmtPct(closeRate) : '—'}
          sub={`${summary.leads_closed} closed / ${summary.leads_quoted} quoted`}
          borderColor={closeRate !== null && closeRate >= 0.4 ? 'border-ok' : closeRate !== null ? 'border-danger' : 'border-gray-200'}
          badge={closeRate !== null
            ? closeRate >= 0.4
              ? <span className="text-xs font-semibold text-ok">✓ On Track</span>
              : <span className="text-xs font-semibold text-danger">✗ Below 40%</span>
            : null}
        />
      </div>

      {/* Revenue chart */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-ink">Revenue vs Goal — {new Date().getFullYear()}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              YTD: <span className="text-ink font-semibold">{fmt$(ytdRevenue)}</span>
              {ytdGoal > 0 && (
                <span className={ytdRevenue >= ytdGoal ? ' text-ok' : ' text-warn'}>
                  {' '}({fmtPct(ytdRevenue / ytdGoal)} of goal)
                </span>
              )}
            </p>
          </div>
          {!dailyGoal && (
            <Link to="/settings" className="text-xs text-sage hover:underline">Set revenue goals →</Link>
          )}
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            No revenue data yet. Connect Zapier or enter monthly summaries in{' '}
            <Link to="/sales" className="ml-1 text-sage underline">Sales & Leads</Link>.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139,31,47,0.05)' }} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {chartData.map((entry) => {
                  const pct = entry.goal > 0 ? entry.revenue / entry.goal : 1
                  const color = pct >= 1 ? '#22c55e' : pct >= 0.95 ? '#f59e0b' : '#8B1F2F'
                  return <Cell key={entry.month} fill={color} />
                })}
              </Bar>
              {dailyGoal > 0 && chartData.some(d => d.goal > 0) && (
                <Bar dataKey="goal" fill="#e5e7eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartData.length > 0 && (
          <div className="flex gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-ok inline-block" /> At/over goal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warn inline-block" /> Within 5%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" /> Below goal</span>
          </div>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Cancellations (MTD)" value={summary.cancellations} borderColor="border-gray-200" />
        <KpiCard label="Skips (MTD)" value={summary.skips} borderColor="border-gray-200" />
        <KpiCard label="Retention Rate" value={summary.initial_cleans > 0 ? fmtPct(summary.retained / summary.initial_cleans) : '—'}
          sub={`${summary.retained} of ${summary.initial_cleans} initials kept`}
          borderColor="border-gray-200" />
      </div>

      {/* Staff */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Staff Activity (MTD)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div><p className="text-2xl font-bold text-ok">{summary.staff.new_hires}</p><p className="text-xs text-gray-500 mt-1">New Hires</p></div>
          <div><p className="text-2xl font-bold text-warn">{summary.staff.quit}</p><p className="text-xs text-gray-500 mt-1">Quit</p></div>
          <div><p className="text-2xl font-bold text-danger">{summary.staff.fired}</p><p className="text-xs text-gray-500 mt-1">Fired</p></div>
          <div><p className="text-2xl font-bold text-ink">{summary.staff.call_ins}</p><p className="text-xs text-gray-500 mt-1">Call-ins</p></div>
        </div>
      </div>

      {!dailyGoal && (
        <div className="flex items-center gap-3 bg-brand/5 border border-brand/20 rounded-xl px-4 py-3 text-sm">
          <span>🍑</span>
          <span className="text-gray-600">
            Configure revenue goals in{' '}
            <Link to="/settings" className="text-brand font-semibold underline">Settings</Link>{' '}
            to enable goal tracking on the chart.
          </span>
        </div>
      )}
    </div>
  )
}
