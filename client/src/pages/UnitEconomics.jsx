import { useState, useEffect } from 'react'
import { exportCsv } from '../utils/exportCsv'
import { Link } from 'react-router-dom'

const fmt$ = (n) => n !== null && n !== undefined ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const fmtPct = (n) => n !== null && n !== undefined ? `${(n * 100).toFixed(1)}%` : '—'
const fmtX = (n) => n !== null && n !== undefined ? `${Number(n).toFixed(1)}x` : '—'
const fmtN = (n, dec = 0) => n !== null && n !== undefined ? Number(n).toLocaleString(undefined, { maximumFractionDigits: dec }) : '—'

function MetricCard({ label, value, sub, color = 'border-brand', badge, hint }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {badge}
      </div>
      <p className="text-3xl font-bold text-ink mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {hint && <p className="text-xs text-gray-300 mt-1 italic">{hint}</p>}
    </div>
  )
}

function MissingInputsNote({ inputs, settingsPath = '/settings' }) {
  const missing = inputs.filter(i => !i.value)
  if (!missing.length) return null
  return (
    <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-xl px-4 py-3 text-xs text-gray-500 mb-5">
      <span className="text-warn mt-0.5">⚠</span>
      <span>
        Some metrics need configuration:{' '}
        <span className="font-medium text-ink">{missing.map(i => i.label).join(', ')}</span>.{' '}
        <Link to={settingsPath} className="text-brand underline">Set them in Settings →</Link>
      </span>
    </div>
  )
}

export default function UnitEconomics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const year = new Date().getFullYear()

  useEffect(() => {
    fetch(`/api/data/economics?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .catch(setError)
  }, [])

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not load economics data.</p>
    </div>
  )

  if (!data) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(8)].map((_, i) => <div key={i} className="kpi-card border-gray-200 h-28 bg-white" />)}
    </div>
  )

  const { ytd, metrics, inputs } = data

  const missingInputs = [
    { label: 'Break-Even Daily Revenue', value: inputs.break_even_daily },
    { label: 'Daily Revenue Goal', value: inputs.daily_goal },
    { label: 'Avg Training Hours', value: inputs.training_hours },
    { label: 'Avg Hourly Labor Cost', value: inputs.hourly_cost },
    { label: 'Avg Ramp-Up Days', value: inputs.ramp_days },
  ]

  const ltvColor = metrics.ltv_cac_ratio !== null
    ? metrics.ltv_cac_ratio >= 3 ? 'border-ok'
    : metrics.ltv_cac_ratio >= 2 ? 'border-warn'
    : 'border-danger'
    : 'border-gray-200'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Unit Economics</h1>
          <p className="text-sm text-gray-500 mt-0.5">YTD {year} — CAC, LTV, turnover cost &amp; productivity</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!data?.metrics) return
              const m = data.metrics
              exportCsv(`jpc-economics-${year}.csv`, [{ year, cpl: m.cpl, cac: m.cac, ltv: m.ltv, ltv_cac_ratio: m.ltv_cac_ratio, attrition_rate: m.attrition_rate, revenue_per_rge: m.revenue_per_rge, training_cost_per_hire: m.training_cost_per_hire, cost_of_turnover: m.cost_of_turnover }])
            }}
            className="btn-secondary text-sm"
          >↓ Export CSV</button>
          <Link to="/settings" className="text-xs text-sage hover:underline">Configure inputs →</Link>
        </div>
      </div>

      <MissingInputsNote inputs={missingInputs} />

      {/* Marketing Efficiency */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Marketing Efficiency</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Marketing Spend YTD"
          value={fmt$(ytd.marketing_spend)}
          sub={`${ytd.leads_in} leads in`}
          color="border-peach"
        />
        <MetricCard
          label="Cost Per Lead"
          value={fmt$(metrics.cpl)}
          sub="Marketing ÷ Leads In"
          color="border-peach"
          badge={metrics.cpl !== null && metrics.cpl < 50
            ? <span className="text-xs text-ok font-semibold">✓ Efficient</span>
            : metrics.cpl !== null
            ? <span className="text-xs text-warn font-semibold">Watch</span>
            : null}
        />
        <MetricCard
          label="Customer Acquisition Cost"
          value={fmt$(metrics.cac)}
          sub="Marketing ÷ Closed"
          color="border-peach"
        />
        <MetricCard
          label="LTV : CAC"
          value={fmtX(metrics.ltv_cac_ratio)}
          sub="Goal: ≥ 3x"
          color={ltvColor}
          badge={metrics.ltv_cac_ratio !== null
            ? metrics.ltv_cac_ratio >= 3
              ? <span className="text-xs text-ok font-semibold">✓ Healthy</span>
              : metrics.ltv_cac_ratio >= 2
              ? <span className="text-xs text-warn font-semibold">Tight</span>
              : <span className="text-xs text-danger font-semibold">Low</span>
            : null}
        />
      </div>

      {/* Client Economics */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Client Economics</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Avg Monthly Rev / Client"
          value={fmt$(metrics.avg_revenue_per_client)}
          sub="Revenue ÷ Active Clients"
          color="border-brand"
        />
        <MetricCard
          label="Avg Client Lifetime"
          value={metrics.avg_lifetime_months !== null ? `${fmtN(metrics.avg_lifetime_months, 1)} mo` : '—'}
          sub="1 ÷ Monthly Attrition Rate"
          color="border-brand"
        />
        <MetricCard
          label="Client Lifetime Value"
          value={fmt$(metrics.ltv)}
          sub="Monthly Rev × Lifetime Months"
          color="border-brand"
          badge={metrics.ltv !== null && metrics.ltv > 5000
            ? <span className="text-xs text-ok font-semibold">Strong</span>
            : null}
        />
        <MetricCard
          label="Monthly Attrition Rate"
          value={fmtPct(metrics.attrition_rate)}
          sub="Cancellations ÷ Active"
          color={metrics.attrition_rate !== null
            ? metrics.attrition_rate < 0.04 ? 'border-ok'
            : metrics.attrition_rate < 0.07 ? 'border-warn'
            : 'border-danger'
            : 'border-gray-200'}
        />
      </div>

      {/* Staff Economics */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Staff Economics</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Revenue per RGE"
          value={fmt$(metrics.revenue_per_rge)}
          sub="Monthly Rev ÷ Avg RGEs"
          color="border-sage"
          hint={metrics.revenue_per_rge === null ? 'Log RGE count in daily entries' : null}
        />
        <MetricCard
          label="Training Cost / New Hire"
          value={fmt$(metrics.training_cost_per_hire)}
          sub={inputs.training_hours && inputs.hourly_cost
            ? `${fmtN(inputs.training_hours)} hrs × ${fmt$(inputs.hourly_cost)}/hr`
            : 'Set in Settings'}
          color="border-sage"
        />
        <MetricCard
          label="Cost of Turnover / Employee"
          value={fmt$(metrics.cost_of_turnover)}
          sub="Training + Ramp-Up Lost Revenue"
          color={metrics.cost_of_turnover !== null && metrics.cost_of_turnover > 5000 ? 'border-danger' : 'border-sage'}
          badge={metrics.cost_of_turnover !== null && metrics.cost_of_turnover > 5000
            ? <span className="text-xs text-danger font-semibold">High</span>
            : null}
        />
      </div>

      {/* YTD Turnover Impact */}
      {(ytd.quit > 0 || ytd.fired > 0) && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">YTD Turnover Impact</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-ok">{ytd.new_hires}</p>
              <p className="text-xs text-gray-500 mt-1">New Hires</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warn">{ytd.quit}</p>
              <p className="text-xs text-gray-500 mt-1">Quit</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-danger">{ytd.fired}</p>
              <p className="text-xs text-gray-500 mt-1">Fired</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${ytd.quit + ytd.fired > ytd.new_hires ? 'text-danger' : 'text-ok'}`}>
                {ytd.new_hires - ytd.quit - ytd.fired > 0 ? '+' : ''}{ytd.new_hires - ytd.quit - ytd.fired}
              </p>
              <p className="text-xs text-gray-500 mt-1">Net Change</p>
            </div>
          </div>
          {metrics.turnover_cost_total !== null && (
            <div className="bg-danger/5 border border-danger/15 rounded-xl px-4 py-3 text-sm text-center">
              <span className="text-gray-500">Estimated total turnover cost YTD: </span>
              <span className="font-bold text-danger">{fmt$(metrics.turnover_cost_total)}</span>
              <span className="text-gray-400 text-xs ml-2">({ytd.quit + ytd.fired} exits × {fmt$(metrics.cost_of_turnover)}/ea)</span>
            </div>
          )}
        </div>
      )}

      {/* Break-Even Reference */}
      {(inputs.break_even_daily || inputs.daily_goal) && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Revenue Targets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {inputs.break_even_daily && (
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Break-Even Daily</p>
                <p className="text-2xl font-bold text-ink">{fmt$(inputs.break_even_daily)}</p>
                <p className="text-xs text-gray-400 mt-1">~{fmt$(inputs.break_even_daily * 30)}/mo</p>
              </div>
            )}
            {inputs.daily_goal && (
              <div className="text-center p-4 bg-brand/5 rounded-xl border border-brand/10">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Daily Goal</p>
                <p className="text-2xl font-bold text-brand">{fmt$(inputs.daily_goal)}</p>
                <p className="text-xs text-gray-400 mt-1">~{fmt$(inputs.daily_goal * 30)}/mo</p>
              </div>
            )}
            {inputs.break_even_daily && metrics.avg_revenue_per_client && (
              <div className="text-center p-4 bg-ok/5 rounded-xl border border-ok/15">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Clients to Break Even</p>
                <p className="text-2xl font-bold text-ok">
                  {Math.ceil((inputs.break_even_daily * 30) / metrics.avg_revenue_per_client)}
                </p>
                <p className="text-xs text-gray-400 mt-1">recurring clients needed</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No data nudge */}
      {ytd.marketing_spend === 0 && ytd.months_with_data === 0 && (
        <div className="card text-center py-10 text-gray-400 text-sm">
          <p className="mb-2">No YTD data yet. Enter monthly summaries in{' '}
            <Link to="/sales" className="text-brand underline">Sales &amp; Leads</Link>{' '}
            and daily metrics in{' '}
            <Link to="/entry" className="text-brand underline">Log Data</Link>.
          </p>
          <p>Set cost inputs in <Link to="/settings" className="text-brand underline">Settings</Link> to unlock turnover and ramp-up calculations.</p>
        </div>
      )}
    </div>
  )
}
