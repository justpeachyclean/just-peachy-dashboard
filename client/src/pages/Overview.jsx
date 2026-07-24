import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

function KpiCard({ label, value, sub, borderColor = 'border-brand', badge, source }) {
  return (
    <div className={`kpi-card ${borderColor}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {badge}
      </div>
      <p className="text-3xl font-bold text-ink mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {source && <p className="text-[10px] text-gray-400 mt-1.5 italic">{source}</p>}
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

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function nowMonth() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export default function Overview() {
  const [selectedMonth, setSelectedMonth] = useState(nowMonth)
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [error, setError] = useState(null)
  const [showYtd, setShowYtd] = useState(false)
  const [breakageData, setBreakageData] = useState(null)
  const [recleanData, setRecleanData] = useState(null)

  useEffect(() => {
    setSummary(null)
    setBreakageData(null)
    setRecleanData(null)
    const year = selectedMonth.split('-')[0]
    Promise.all([
      apiFetch(`/api/data/summary?month=${selectedMonth}`).then(r => r.json()),
      apiFetch(`/api/data/monthly?year=${year}`).then(r => r.json()),
      apiFetch(`/api/breakages?year=${year}`).then(r => r.json()).catch(() => null),
      apiFetch(`/api/recleans?year=${year}`).then(r => r.json()).catch(() => null),
    ])
      .then(([s, m, b, rc]) => {
        setSummary(s)
        setMonthly(m)
        if (b?.breakages) {
          const monthBreakages = b.breakages.filter(r => r.report_date?.startsWith(selectedMonth))
          const ytdBreakages = b.breakages
          setBreakageData({
            mtd: monthBreakages.length,
            mtd_unresolved: monthBreakages.filter(r => !r.resolved).length,
            mtd_resolved: monthBreakages.filter(r => r.resolved).length,
            mtd_value: monthBreakages.reduce((s, r) => s + (r.value || 0), 0),
            ytd: ytdBreakages.length,
            ytd_unresolved: ytdBreakages.filter(r => !r.resolved).length,
            ytd_value: ytdBreakages.reduce((s, r) => s + (r.value || 0), 0),
          })
        }
        if (rc?.recleans) {
          const mtd = rc.recleans.filter(r => r.reclean_date?.startsWith(selectedMonth)).length
          setRecleanData({ mtd, ytd: rc.stats?.total || 0 })
        }
      })
      .catch(setError)
  }, [selectedMonth])

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not connect to the server.</p>
      <p className="text-sm text-gray-500 mt-1">Make sure the backend is running on port 3001.</p>
    </div>
  )

  const isCurrentMonth = selectedMonth === nowMonth()
  const [selYear, selMon] = selectedMonth.split('-')
  const selectedMonthLabel = `${MONTH_NAMES[parseInt(selMon) - 1]} ${selYear}`

  if (!summary) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedMonthLabel}</p>
        </div>
        <input type="month" className="form-input text-sm py-1.5 w-40"
          value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => <div key={i} className="kpi-card border-gray-200 h-28 bg-white" />)}
      </div>
    </div>
  )

  const staleAlert = isCurrentMonth && (() => {
    if (!summary.last_entry_date) return true
    return (Date.now() - new Date(summary.last_entry_date).getTime()) / 86400000 > 3
  })()

  const closeRate = summary.leads_quoted > 0 ? summary.leads_closed / summary.leads_quoted : null
  const dailyGoal = summary.dynamic_daily_goal || parseFloat(summary.settings?.daily_goal) || null
  const rgeCount  = summary.rge_count
  const goalRate  = summary.goal_rate
  const goalHours = summary.goal_hours

  // Chart data — only months with any revenue or up to current month
  const currentMonth = nowMonth()
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

  // YTD aggregates from monthly data
  const ytdMonths = monthly.filter(m => m.month <= currentMonth)
  const ytdCancellations = ytdMonths.reduce((s, m) => s + (m.cancellations || 0), 0)
  const ytdNewCloses = ytdMonths.reduce((s, m) => s + (m.leads_closed || 0), 0)
  const ytdLeadsIn = ytdMonths.reduce((s, m) => s + (m.leads_in || 0), 0)
  const ytdQuoted = ytdMonths.reduce((s, m) => s + (m.leads_quoted || 0), 0)
  const ytdClosed = ytdMonths.reduce((s, m) => s + (m.leads_closed || 0), 0)
  const ytdCloseRate = ytdQuoted > 0 ? ytdClosed / ytdQuoted : null
  const ytdInitial = ytdMonths.reduce((s, m) => s + (m.initial_cleans || 0), 0)
  const ytdRetained = ytdMonths.reduce((s, m) => s + (m.retained || 0), 0)
  const ytdAttritionRate = ytdInitial > 0 ? 1 - ytdRetained / ytdInitial : null
  const ytdSkips = ytdMonths.reduce((s, m) => s + (m.skips || 0), 0)

  // Last 6 months for the MoM table
  const momMonths = chartData.slice(-6)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedMonthLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            className="form-input text-sm py-1.5 w-40"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
          {!isCurrentMonth && (
            <button onClick={() => setSelectedMonth(nowMonth())}
              className="text-xs text-sage hover:underline whitespace-nowrap">
              ← Back to current
            </button>
          )}
          <Link to="/entry" className="btn-primary text-sm">+ Log Data</Link>
        </div>
      </div>

      {/* Stale data alert — only for current month */}
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

      {/* Past month banner */}
      {!isCurrentMonth && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-4 py-3 mb-5 text-sm font-medium">
          <span>📅</span>
          <span>Showing historical data for <strong>{selectedMonthLabel}</strong></span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Recurring Clients"
          value={summary.recurring_clients.toLocaleString()}
          borderColor="border-brand"
          sub={`${summary.cancellations} cancelled this month`}
          badge={summary.recurring_clients_estimated
            ? <span className="text-xs font-medium text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">est.</span>
            : null}
          source={summary.recurring_clients_estimated
            ? "🔄 estimated: last snapshot + new closes − cancellations · update via Entry"
            : "🔄 auto via MaidCentral · manual snapshot via Entry"}
        />
        <KpiCard
          label="MTD Revenue"
          value={fmt$(summary.revenue)}
          borderColor="border-peach"
          sub={dailyGoal
            ? rgeCount
              ? `Daily goal: ${fmt$(dailyGoal)} · ${rgeCount} techs × ${goalHours}hrs × $${goalRate}`
              : `Daily goal: ${fmt$(dailyGoal)}`
            : 'Log RGE count in Entry to see goal'}
          source="✏️ enter monthly total in Log Data"
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
          source="🤖 auto-calculated from cancellations ÷ clients"
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
          source="🤖 auto via GHL · Zapier"
        />
      </div>

      {/* Daily Revenue Goal */}
      {dailyGoal && (
        <div className="flex items-center gap-4 bg-peach/10 border border-peach/30 rounded-xl px-5 py-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-peach text-lg">🎯</span>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Revenue Goal</p>
              <p className="text-2xl font-bold text-ink">{fmt$(dailyGoal)}</p>
            </div>
          </div>
          {rgeCount && (
            <div className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-ink">{rgeCount}</span>
              <span>techs</span>
              <span className="text-gray-300">×</span>
              <span className="font-semibold text-ink">{goalHours}</span>
              <span>JTH</span>
              <span className="text-gray-300">×</span>
              <span className="font-semibold text-ink">${goalRate}</span>
              <span className="text-gray-400 text-xs ml-1">· update tech count in Log Data</span>
            </div>
          )}
          {!rgeCount && (
            <p className="text-xs text-gray-400">Log current tech count (RGE) in <Link to="/entry" className="text-brand underline">Log Data</Link> to see formula</p>
          )}
        </div>
      )}

      {/* Revenue chart */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-ink">Revenue vs Goal — {selYear}</h2>
            <p className="text-[10px] text-gray-400 italic mt-0.5">🤖 auto via MaidCentral · falls back to manual Sales summaries</p>
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
                  const isSelected = entry.month === selectedMonth
                  const pct = entry.goal > 0 ? entry.revenue / entry.goal : 1
                  const color = pct >= 1 ? '#22c55e' : pct >= 0.95 ? '#f59e0b' : '#8B1F2F'
                  return <Cell key={entry.month} fill={color} opacity={isSelected ? 1 : 0.7} />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Cancellations (MTD)" value={summary.cancellations} borderColor="border-gray-200"
          source="🤖 auto via MaidCentral · Zapier" />
        <KpiCard label="Skips (MTD)" value={summary.skips} borderColor="border-gray-200"
          source="✏️ manual · logged via Entry page daily" />
        <KpiCard label="Retention Rate" value={summary.initial_cleans > 0 ? fmtPct(summary.retained / summary.initial_cleans) : '—'}
          sub={`${summary.retained} of ${summary.initial_cleans} initials kept`}
          borderColor="border-gray-200"
          source="🔄 auto via client log (GHL) · falls back to manual Entry" />
        <KpiCard
          label="Recleans (MTD)"
          value={recleanData ? recleanData.mtd : '—'}
          sub={recleanData && recleanData.ytd > 0 ? `${recleanData.ytd} YTD` : undefined}
          borderColor={recleanData && recleanData.mtd > 2 ? 'border-warn' : 'border-gray-200'}
          source="✏️ manual · logged via Feedback → Recleans"
        />
      </div>

      {/* YTD Summary — collapsible */}
      <div className="card mb-5">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setShowYtd(v => !v)}
        >
          <div>
            <h2 className="font-semibold text-ink">Year-to-Date Summary — {selYear}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt$(ytdRevenue)} revenue · {ytdCancellations} cancellations · {ytdNewCloses} new clients
            </p>
          </div>
          <span className="text-gray-400 text-lg leading-none ml-4">{showYtd ? '▲' : '▼'}</span>
        </button>

        {showYtd && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">{fmt$(ytdRevenue)}</p>
                <p className="text-xs text-gray-500 mt-1">YTD Revenue</p>
                {ytdGoal > 0 && (
                  <p className={`text-xs mt-0.5 font-medium ${ytdRevenue >= ytdGoal ? 'text-ok' : 'text-warn'}`}>
                    {fmtPct(ytdRevenue / ytdGoal)} of goal
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">{ytdCancellations}</p>
                <p className="text-xs text-gray-500 mt-1">YTD Cancellations</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ok">{ytdNewCloses}</p>
                <p className="text-xs text-gray-500 mt-1">YTD New Clients</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">{ytdLeadsIn}</p>
                <p className="text-xs text-gray-500 mt-1">YTD Leads In</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${ytdCloseRate !== null && ytdCloseRate >= 0.4 ? 'text-ok' : 'text-danger'}`}>
                  {ytdCloseRate !== null ? fmtPct(ytdCloseRate) : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">YTD Close Rate</p>
                <p className="text-xs text-gray-400 mt-0.5">{ytdClosed} / {ytdQuoted} quoted</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${ytdAttritionRate !== null && ytdAttritionRate <= 0.4 ? 'text-ok' : 'text-warn'}`}>
                  {ytdAttritionRate !== null ? fmtPct(ytdAttritionRate) : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">YTD Attrition</p>
                <p className="text-xs text-gray-400 mt-0.5">{ytdRetained} of {ytdInitial} initials kept</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">{ytdSkips}</p>
                <p className="text-xs text-gray-500 mt-1">YTD Skips</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">
                  {ytdCancellations > 0 && ytdNewCloses > 0
                    ? (ytdNewCloses - ytdCancellations >= 0 ? '+' : '') + (ytdNewCloses - ytdCancellations)
                    : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Net Client Growth</p>
                <p className="text-xs text-gray-400 mt-0.5">{ytdNewCloses} in − {ytdCancellations} out</p>
              </div>
            </div>

            {/* Monthly breakdown mini-table */}
            {chartData.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left py-1.5 pr-3 font-medium">Month</th>
                      <th className="text-right py-1.5 px-2 font-medium">Revenue</th>
                      <th className="text-right py-1.5 px-2 font-medium">Goal</th>
                      <th className="text-right py-1.5 px-2 font-medium">New Clients</th>
                      <th className="text-right py-1.5 px-2 font-medium">Cancels</th>
                      <th className="text-right py-1.5 px-2 font-medium">Net</th>
                      <th className="text-right py-1.5 px-2 font-medium">Close %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map(m => {
                      const net = (m.leads_closed || 0) - (m.cancellations || 0)
                      const cr = m.leads_quoted > 0 ? m.leads_closed / m.leads_quoted : null
                      const isSelected = m.month === selectedMonth
                      return (
                        <tr key={m.month}
                          className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50/50 ${isSelected ? 'bg-brand/5' : ''}`}
                          onClick={() => setSelectedMonth(m.month)}
                        >
                          <td className={`py-1.5 pr-3 font-medium ${isSelected ? 'text-brand' : 'text-ink'}`}>
                            {MONTH_SHORT[parseInt(m.month.split('-')[1]) - 1]} {m.month.split('-')[0]}
                          </td>
                          <td className="text-right py-1.5 px-2 text-gray-700">{m.revenue > 0 ? fmt$(m.revenue) : '—'}</td>
                          <td className="text-right py-1.5 px-2 text-gray-400">{m.goal > 0 ? fmt$(m.goal) : '—'}</td>
                          <td className="text-right py-1.5 px-2 text-ok font-medium">{m.leads_closed > 0 ? `+${m.leads_closed}` : '—'}</td>
                          <td className="text-right py-1.5 px-2 text-danger">{m.cancellations > 0 ? m.cancellations : '—'}</td>
                          <td className={`text-right py-1.5 px-2 font-semibold ${net > 0 ? 'text-ok' : net < 0 ? 'text-danger' : 'text-gray-400'}`}>
                            {m.leads_closed > 0 || m.cancellations > 0 ? (net >= 0 ? `+${net}` : net) : '—'}
                          </td>
                          <td className={`text-right py-1.5 px-2 font-medium ${cr !== null ? (cr >= 0.4 ? 'text-ok' : 'text-danger') : 'text-gray-300'}`}>
                            {cr !== null ? fmtPct(cr) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {/* YTD totals row */}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="py-2 pr-3 text-ink">YTD Total</td>
                      <td className="text-right py-2 px-2 text-ink">{fmt$(ytdRevenue)}</td>
                      <td className="text-right py-2 px-2 text-gray-500">{ytdGoal > 0 ? fmt$(ytdGoal) : '—'}</td>
                      <td className="text-right py-2 px-2 text-ok">+{ytdNewCloses}</td>
                      <td className="text-right py-2 px-2 text-danger">{ytdCancellations}</td>
                      <td className={`text-right py-2 px-2 ${ytdNewCloses - ytdCancellations >= 0 ? 'text-ok' : 'text-danger'}`}>
                        {ytdNewCloses - ytdCancellations >= 0 ? '+' : ''}{ytdNewCloses - ytdCancellations}
                      </td>
                      <td className={`text-right py-2 px-2 ${ytdCloseRate !== null ? (ytdCloseRate >= 0.4 ? 'text-ok' : 'text-danger') : 'text-gray-300'}`}>
                        {ytdCloseRate !== null ? fmtPct(ytdCloseRate) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gift Card Sales */}
      {(summary.gift_card_sales_mtd > 0) && (
        <div className="card mb-5 border border-peach/30 bg-peach/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gift Card Sales (MTD)</p>
              <p className="text-3xl font-bold text-ink mt-1">{fmt$(summary.gift_card_sales_mtd)}</p>
              <p className="text-[10px] text-gray-400 italic mt-1">🔄 Gift Up auto via Zapier (coming soon) · ✏️ manual via Entry page</p>
            </div>
            <Link to="/entry" className="text-xs text-sage hover:underline">+ Log sale →</Link>
          </div>
        </div>
      )}
      {(summary.gift_card_sales_mtd === 0) && (
        <div className="card mb-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gift Card Sales (MTD)</p>
              <p className="text-3xl font-bold text-gray-300 mt-1">$0</p>
              <p className="text-[10px] text-gray-400 italic mt-1">🔄 Gift Up auto via Zapier (coming soon) · ✏️ manual via Entry page</p>
            </div>
            <Link to="/entry" className="text-xs text-sage hover:underline">+ Log sale →</Link>
          </div>
        </div>
      )}

      {/* Breakages */}
      {breakageData && (breakageData.ytd > 0) && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Breakages</h2>
            <Link to="/breakages" className="text-xs text-sage hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-ink">{breakageData.mtd}</p>
              <p className="text-xs text-gray-500 mt-1">This Month</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${breakageData.mtd_unresolved > 0 ? 'text-danger' : 'text-gray-300'}`}>{breakageData.mtd_unresolved}</p>
              <p className="text-xs text-gray-500 mt-1">Open</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok">{breakageData.mtd_resolved}</p>
              <p className="text-xs text-gray-500 mt-1">Resolved</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warn">{breakageData.mtd_value > 0 ? fmt$(breakageData.mtd_value) : '—'}</p>
              <p className="text-xs text-gray-500 mt-1">Est. Value</p>
            </div>
          </div>
          {breakageData.ytd > breakageData.mtd && (
            <p className="text-xs text-gray-400 mt-3 text-right">
              YTD: {breakageData.ytd} total · {breakageData.ytd_unresolved} open · {breakageData.ytd_value > 0 ? fmt$(breakageData.ytd_value) : '$0'} value
            </p>
          )}
        </div>
      )}

      {/* Staff */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Staff Activity (MTD)</h2>
          <span className="text-[10px] text-gray-400 italic">
            {summary.staff_using_termination_records
              ? '🤖 quit/fired auto via MaidCentral · ✏️ hires & call-ins via Entry'
              : '✏️ manual · logged via Entry page'}
          </span>
        </div>

        {summary.estimated_current_headcount != null && (
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-ink">{summary.estimated_current_headcount}</p>
              <p className="text-xs text-gray-500 mt-0.5">est. current employees</p>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              Baseline: {summary.settings?.staff_headcount_baseline} as of {summary.settings?.staff_headcount_baseline_date}<br />
              +{summary.staff.new_hires} hires this month · −{summary.staff.quit + summary.staff.fired} departures this month<br />
              <Link to="/hiring" className="text-sage underline">Update in Hiring → Departures</Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div><p className="text-2xl font-bold text-ok">{summary.staff.new_hires}</p><p className="text-xs text-gray-500 mt-1">New Hires</p></div>
          <div>
            <p className="text-2xl font-bold text-warn">{summary.staff.quit}</p>
            <p className="text-xs text-gray-500 mt-1">Quit</p>
            {summary.staff_using_termination_records && <p className="text-[9px] text-blue-400 mt-0.5">🤖 MC</p>}
          </div>
          <div>
            <p className="text-2xl font-bold text-danger">{summary.staff.fired}</p>
            <p className="text-xs text-gray-500 mt-1">Fired</p>
            {summary.staff_using_termination_records && <p className="text-[9px] text-blue-400 mt-0.5">🤖 MC</p>}
          </div>
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

      {/* Month-over-Month Snapshot */}
      {momMonths.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-ink">Month-over-Month Snapshot</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last 6 months · lead funnel at a glance</p>
            </div>
            <Link to="/leads" className="text-xs text-sage hover:underline">Full lead log →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-400 uppercase tracking-wide w-36">Metric</th>
                  {momMonths.map(m => {
                    const [yr, mo] = m.month.split('-')
                    return (
                      <th key={m.month} className={`text-right py-2 px-2 font-medium uppercase tracking-wide ${m.month === currentMonth ? 'text-brand' : 'text-gray-400'}`}>
                        {MONTH_SHORT[parseInt(mo) - 1]} {yr.slice(2)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Leads In',           val: m => m.leads_in || 0,           fmt: v => v > 0 ? v : '—',                       cls: () => 'text-ink' },
                  { label: 'Quoted',              val: m => m.leads_quoted || 0,       fmt: v => v > 0 ? v : '—',                       cls: () => 'text-ink' },
                  { label: 'Lead→Quote %',        val: m => m.leads_in > 0 ? m.leads_quoted / m.leads_in : null,
                                                  fmt: v => v != null ? fmtPct(v) : '—',
                                                  cls: v => v == null ? 'text-gray-300' : v >= 0.5 ? 'text-ok' : v >= 0.3 ? 'text-warn' : 'text-danger' },
                  { label: 'Converted',           val: m => m.leads_closed || 0,      fmt: v => v > 0 ? v : '—',                       cls: () => 'text-ink' },
                  { label: 'Quote→Sale %',        val: m => m.leads_quoted > 0 ? m.leads_closed / m.leads_quoted : null,
                                                  fmt: v => v != null ? fmtPct(v) : '—',
                                                  cls: v => v == null ? 'text-gray-300' : v >= 0.4 ? 'text-ok' : v >= 0.25 ? 'text-warn' : 'text-danger' },
                  { label: 'Recurring Retained',  val: m => m.initial_to_recurring || 0, fmt: v => v > 0 ? v : '—',                    cls: () => 'text-ok' },
                  { label: 'Cancellations',       val: m => m.cancellations || 0,     fmt: v => v > 0 ? v : '—',                       cls: v => v === 0 ? 'text-gray-300' : v <= 3 ? 'text-warn' : 'text-danger' },
                ].map(({ label, val, fmt, cls }, i) => (
                  <tr key={label} className={`border-b border-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                    <td className="py-2 pr-4 text-gray-500 font-medium">{label}</td>
                    {momMonths.map(m => {
                      const v = val(m)
                      return (
                        <td key={m.month} className={`text-right py-2 px-2 font-semibold ${cls(v)} ${m.month === currentMonth ? 'bg-brand/5' : ''}`}>
                          {fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
