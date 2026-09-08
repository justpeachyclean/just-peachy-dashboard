import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'

const fmt$ = n => n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const fmtMo = n => n == null ? '—' : n < 1 ? `${Math.round(n * 30)}d` : `${n.toFixed(1)}mo`

const FREQ_LABELS = {
  weekly: 'Weekly', biweekly: 'Biweekly', 'bi-weekly': 'Biweekly',
  monthly: 'Monthly', 'tri-weekly': 'Tri-Weekly', 'every 4 weeks': 'Every 4 Wks',
}
const FREQ_COLORS = {
  weekly: 'bg-brand/10 text-brand', biweekly: 'bg-ok/10 text-ok',
  'bi-weekly': 'bg-ok/10 text-ok', monthly: 'bg-peach/20 text-amber-700',
  'tri-weekly': 'bg-purple-50 text-purple-700', 'every 4 weeks': 'bg-peach/20 text-amber-700',
}

function CleanProgress({ cleans }) {
  if (cleans == null) return <span className="text-gray-300 text-xs">No start date</span>
  const capped = Math.min(cleans, 6)
  const pct = (capped / 6) * 100
  const color = cleans >= 6 ? 'bg-ok' : cleans >= 4 ? 'bg-amber-400' : 'bg-danger'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
        {cleans >= 6 ? '6+' : cleans}/6
      </span>
    </div>
  )
}

function StatusBadge({ cleans }) {
  if (cleans == null) return <span className="text-xs text-gray-300">—</span>
  if (cleans >= 6) return <span className="text-xs font-semibold text-ok bg-ok/10 px-2 py-0.5 rounded-full">Loyal</span>
  if (cleans >= 4) return <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">At cliff</span>
  return <span className="text-xs font-semibold text-danger bg-danger/10 px-2 py-0.5 rounded-full">New</span>
}

const TABS = [
  { key: 'danger', label: 'Danger Zone', sub: '< 6 cleans' },
  { key: 'all',    label: 'All Active',  sub: '' },
  { key: 'loyal',  label: 'Loyal',       sub: '6+ cleans' },
]

export default function ClientLedger() {
  const [data, setData]     = useState(null)
  const [tab, setTab]       = useState('danger')
  const [search, setSearch] = useState('')
  const [careMsg, setCareMsg] = useState({})

  useEffect(() => {
    apiFetch('/api/leads/ledger').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  if (!data) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="kpi-card border-gray-200 h-24 bg-white" />)}
    </div>
  )

  const { stats, clients } = data
  const active = clients.filter(r => r.is_active)

  const rows = active.filter(r => {
    if (tab === 'danger') return r.estimated_cleans == null || r.estimated_cleans < 6
    if (tab === 'loyal')  return r.estimated_cleans != null && r.estimated_cleans >= 6
    return true
  }).filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (r.client_name || '').toLowerCase().includes(q)
  }).sort((a, b) => {
    // danger zone: sort by estimated_cleans asc (most at risk first)
    // loyal: sort by months desc (longest tenure first)
    if (tab === 'danger') {
      if (a.estimated_cleans == null) return 1
      if (b.estimated_cleans == null) return -1
      return a.estimated_cleans - b.estimated_cleans
    }
    if (a.months_as_client == null) return 1
    if (b.months_as_client == null) return -1
    return (tab === 'loyal')
      ? b.months_as_client - a.months_as_client
      : (a.estimated_cleans ?? 999) - (b.estimated_cleans ?? 999)
  })

  const flagForCare = async (id, name) => {
    try {
      const r = await apiFetch(`/api/leads/${id}/care`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await r.json()
      setCareMsg(m => ({ ...m, [id]: d.created ? '✓ Added to care queue' : '✓ Already in queue' }))
    } catch { setCareMsg(m => ({ ...m, [id]: 'Error' })) }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Client Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            6-clean journey — clients who reach their 6th recurring clean have the highest retention
            <span className="text-[11px] text-gray-400 ml-2">· estimated from start date &amp; frequency</span>
          </p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="kpi-card border-brand">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Recurring</p>
          <p className="text-3xl font-bold text-ink mt-2">{stats.total_active}</p>
        </div>
        <div className="kpi-card border-danger">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Danger Zone</p>
          <p className="text-3xl font-bold text-danger mt-2">{stats.danger_zone}</p>
          <p className="text-xs text-gray-400 mt-1">under 6 cleans · highest churn risk</p>
        </div>
        <div className="kpi-card border-ok">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Loyal (6+ cleans)</p>
          <p className="text-3xl font-bold text-ok mt-2">{stats.survived}</p>
          <p className="text-xs text-gray-400 mt-1">past the loyalty milestone</p>
        </div>
        <div className="kpi-card border-peach">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Annual LTV</p>
          <p className="text-3xl font-bold text-ink mt-2">{fmt$(stats.avg_annual_ltv)}</p>
          <p className="text-xs text-gray-400 mt-1">per active recurring client</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 font-medium transition-colors border-l first:border-l-0 border-gray-200 ${
                tab === t.key ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
              {t.key === 'danger' && stats.danger_zone > 0 &&
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'danger' ? 'bg-white/20 text-white' : 'bg-danger/10 text-danger'}`}>
                  {stats.danger_zone}
                </span>}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search clients…"
          className="form-input text-sm w-52"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-sm text-gray-400">{rows.length} clients</span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2 pr-4 font-medium">Client</th>
              <th className="text-left py-2 px-2 font-medium">Frequency</th>
              <th className="py-2 px-2 font-medium text-left" style={{ minWidth: 120 }}>Journey</th>
              <th className="text-center py-2 px-2 font-medium">Status</th>
              <th className="text-right py-2 px-2 font-medium">Monthly</th>
              <th className="text-right py-2 px-2 font-medium">Annual LTV</th>
              <th className="text-left py-2 px-2 font-medium">Since</th>
              <th className="py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  {tab === 'danger' ? 'No clients in the danger zone — great retention!' : 'No clients found.'}
                </td>
              </tr>
            ) : rows.map(r => {
              const freqKey = (r.frequency || '').toLowerCase().trim()
              const isDanger = r.estimated_cleans != null && r.estimated_cleans < 6
              return (
                <tr
                  key={r.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/40 ${isDanger ? 'bg-red-50/30' : ''}`}
                >
                  <td className="py-2 pr-4 font-medium text-ink">{r.client_name || '—'}</td>
                  <td className="py-2 px-2">
                    {r.frequency
                      ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FREQ_COLORS[freqKey] || 'bg-gray-100 text-gray-500'}`}>
                          {FREQ_LABELS[freqKey] || r.frequency}
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="py-2 px-2" style={{ minWidth: 140 }}>
                    <CleanProgress cleans={r.estimated_cleans} />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <StatusBadge cleans={r.estimated_cleans} />
                  </td>
                  <td className="py-2 px-2 text-right text-gray-600 text-xs">
                    {r.price_per_clean != null ? fmt$(r.price_per_clean) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-xs">
                    {r.annual_value != null ? fmt$(r.annual_value) : '—'}
                  </td>
                  <td className="py-2 px-2 text-gray-400 text-xs whitespace-nowrap">
                    {r.start_date
                      ? <span title={r.start_date}>{fmtMo(r.months_as_client)} ago</span>
                      : <span className="text-gray-300">No date</span>}
                  </td>
                  <td className="py-2 pl-2">
                    {careMsg[r.id]
                      ? <span className="text-xs text-ok">{careMsg[r.id]}</span>
                      : isDanger
                        ? <button
                            onClick={() => flagForCare(r.id, r.client_name)}
                            className="text-xs text-brand hover:underline whitespace-nowrap"
                          >
                            Flag for care
                          </button>
                        : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {stats.no_start_date > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {stats.no_start_date} clients have no start date recorded — add a "Recurring Set Up" date on their lead record to include them in the journey tracker.
        </p>
      )}
    </div>
  )
}
