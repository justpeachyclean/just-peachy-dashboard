import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { exportCsv } from '../utils/exportCsv'

const fmt$ = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const fmtPct = (n, decimals = 1) => `${(n * 100).toFixed(decimals)}%`

function PctBadge({ value, goal }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>
  const pct = value * 100
  const goalPct = goal * 100
  let colorClass
  if (pct >= goalPct) colorClass = 'text-ok font-semibold'
  else if (pct >= goalPct * 0.9) colorClass = 'text-warn font-semibold'
  else colorClass = 'text-danger font-semibold'
  return <span className={colorClass}>{pct.toFixed(1)}%</span>
}

function SummaryCard({ label, value, sub, color = 'border-brand' }) {
  return (
    <div className={`kpi-card ${color}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-ink mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(m) {
  const [yr, mm] = m.split('-')
  return `${MONTH_LABELS[parseInt(mm) - 1]} ${yr}`
}

export default function Sales() {
  const [rows, setRows] = useState([])
  const [valueAvgs, setValueAvgs] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formMonth, setFormMonth] = useState('')
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const load = () =>
    apiFetch('/api/sales?limit=12')
      .then(r => r.json())
      .then(setRows)
      .catch(setError)

  useEffect(() => {
    load()
    const year = new Date().getFullYear()
    apiFetch(`/api/data/value-avgs?year=${year}`)
      .then(r => r.json())
      .then(setValueAvgs)
      .catch(() => {})
  }, [])

  const openForm = (month = '') => {
    if (month) {
      setFormMonth(month)
      const existing = rows.find(r => r.month === month)
      setFormData(existing ? { ...existing } : {})
    } else {
      const now = new Date()
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setFormMonth(m)
      setFormData({})
    }
    setShowForm(true)
    setSaveMsg('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const payload = { month: formMonth, ...formData }
      Object.keys(payload).forEach(k => {
        if (k !== 'month' && k !== 'rep_name' && k !== 'notes') {
          payload[k] = payload[k] !== '' && payload[k] !== undefined ? parseFloat(payload[k]) || 0 : undefined
        }
      })
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaveMsg('Saved!')
      load()
      setTimeout(() => setShowForm(false), 800)
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const fi = (field) => ({
    value: formData[field] ?? '',
    onChange: e => setFormData(prev => ({ ...prev, [field]: e.target.value })),
  })

  // YTD aggregates
  const now = new Date()
  const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const ytdRows = rows.filter(r => r.month <= cutoff)

  const totalLeadsIn = ytdRows.reduce((s, r) => s + (r.leads_in || 0), 0)
  const totalQuoted = ytdRows.reduce((s, r) => s + (r.leads_quoted || 0), 0)
  const totalClosed = ytdRows.reduce((s, r) => s + (r.leads_closed || 0), 0)
  const totalInitial = ytdRows.reduce((s, r) => s + (r.initial_cleans || 0), 0)
  const totalRetained = ytdRows.reduce((s, r) => s + (r.retained || 0), 0)
  const totalCancellations = ytdRows.reduce((s, r) => s + (r.cancellations || 0), 0)

  const ytdQuoteRate = totalLeadsIn > 0 ? totalQuoted / totalLeadsIn : null
  const ytdCloseRate = totalQuoted > 0 ? totalClosed / totalQuoted : null
  const ytdRetentionRate = totalInitial > 0 ? totalRetained / totalInitial : null

  // Annualized value: prefer real per-record averages, fall back to revenue ÷ clients
  const avgMonthlyRevPerClient = (() => {
    const withBoth = ytdRows.filter(r => r.revenue > 0 && r.recurring_clients > 0)
    if (!withBoth.length) return null
    return withBoth.reduce((s, r) => s + r.revenue / r.recurring_clients, 0) / withBoth.length
  })()
  const fallbackAnnual = avgMonthlyRevPerClient ? avgMonthlyRevPerClient * 12 : null

  const valueGained = valueAvgs?.avg_value_gained ?? fallbackAnnual
  const valueLost   = valueAvgs?.avg_value_lost   ?? fallbackAnnual
  const gainedIsReal = !!valueAvgs?.avg_value_gained
  const lostIsReal   = !!valueAvgs?.avg_value_lost
  const annualValuePerClient = fallbackAnnual // keep for YTD impact calc

  if (error) return (
    <div className="card text-center py-12">
      <p className="text-danger font-medium">Could not load sales data.</p>
      <p className="text-sm text-gray-500 mt-1">Make sure the backend is running on port 3001.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Sales &amp; Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly funnel performance · <span className="text-[11px] text-gray-400">🔄 hybrid: GHL auto-tracks leads · use "+ Add / Edit Month" for revenue &amp; retention</span></p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCsv(`jpc-sales-${new Date().toISOString().slice(0,10)}.csv`, rows)}
            className="btn-secondary text-sm"
          >↓ Export CSV</button>
          <button onClick={() => openForm()} className="btn-primary text-sm">+ Add / Edit Month</button>
        </div>
      </div>

      {/* YTD summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="YTD Leads In"
          value={totalLeadsIn.toLocaleString()}
          sub={`${totalQuoted} quoted`}
          color="border-brand"
        />
        <SummaryCard
          label="YTD Quote Rate"
          value={ytdQuoteRate !== null ? fmtPct(ytdQuoteRate) : '—'}
          sub="goal: 90%"
          color={ytdQuoteRate !== null ? (ytdQuoteRate >= 0.9 ? 'border-ok' : 'border-warn') : 'border-gray-200'}
        />
        <SummaryCard
          label="YTD Close Rate"
          value={ytdCloseRate !== null ? fmtPct(ytdCloseRate) : '—'}
          sub={`${totalClosed} closed / ${totalQuoted} quoted`}
          color={ytdCloseRate !== null ? (ytdCloseRate >= 0.4 ? 'border-ok' : 'border-danger') : 'border-gray-200'}
        />
        <SummaryCard
          label="Initial Retention"
          value={ytdRetentionRate !== null ? fmtPct(ytdRetentionRate) : '—'}
          sub={`${totalRetained} of ${totalInitial} kept`}
          color={ytdRetentionRate !== null ? (ytdRetentionRate >= 0.6 ? 'border-ok' : 'border-warn') : 'border-gray-200'}
        />
      </div>

      {/* Annualized value cards */}
      {(valueGained || valueLost) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="card" style={{ background: 'rgb(34 197 94 / 0.05)', border: '1px solid rgb(34 197 94 / 0.2)' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Value Gained / New Recurring</p>
            <p className="text-2xl font-bold text-ok">{fmt$(valueGained)}<span className="text-sm font-normal text-gray-400"> /yr</span></p>
            <p className="text-xs text-gray-400 mt-1">
              {gainedIsReal
                ? `Avg from ${valueAvgs.avg_value_gained_count} real client price${valueAvgs.avg_value_gained_count !== 1 ? 's' : ''} this year`
                : 'Est. from avg monthly revenue ÷ active clients'}
            </p>
            {!gainedIsReal && <p className="text-[10px] text-gray-400 mt-1 italic">Add frequency to GHL Zap to get real per-client figures →</p>}
          </div>
          <div className="card" style={{ background: 'rgb(239 68 68 / 0.05)', border: '1px solid rgb(239 68 68 / 0.2)' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Value Lost / Cancellation</p>
            <p className="text-2xl font-bold text-danger">({fmt$(valueLost)}<span className="text-sm font-normal text-gray-400"> /yr)</span></p>
            <p className="text-xs text-gray-400 mt-1">
              {lostIsReal
                ? `Avg from ${valueAvgs.avg_value_lost_count} real cancellation price${valueAvgs.avg_value_lost_count !== 1 ? 's' : ''} this year`
                : `YTD cancellation impact: ${fmt$(totalCancellations * (valueLost || 0))}`}
            </p>
            {lostIsReal && <p className="text-xs text-gray-400 mt-0.5">YTD impact: {fmt$(totalCancellations * valueLost)}</p>}
            {!lostIsReal && <p className="text-[10px] text-gray-400 mt-1 italic">Log price + frequency on cancellation records to get real figures →</p>}
          </div>
        </div>
      )}

      {/* Monthly funnel table */}
      <div className="card mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-ink">Monthly Funnel</h2>
            <p className="text-[10px] text-gray-400 italic mt-0.5">
              🤖 Leads / quotes / closes auto via GHL &nbsp;·&nbsp; ✏️ Revenue, cancellations &amp; retention via monthly summary
            </p>
          </div>
          <div className="flex gap-3 text-xs text-gray-400">
            <span><span className="inline-block w-2 h-2 rounded-full bg-ok mr-1" />At goal</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-warn mr-1" />Near goal</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-danger mr-1" />Below</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No data yet.{' '}
            <button onClick={() => openForm()} className="text-brand underline">Add a monthly summary</button>.
          </div>
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Month</th>
                <th className="text-right py-2 px-2 font-medium">Leads In</th>
                <th className="text-right py-2 px-2 font-medium">Quoted</th>
                <th className="text-right py-2 px-2 font-medium">Quote %<br/><span className="text-gray-400 normal-case font-normal">goal 90%</span></th>
                <th className="text-right py-2 px-2 font-medium">Closed</th>
                <th className="text-right py-2 px-2 font-medium">Close %<br/><span className="text-gray-400 normal-case font-normal">min 40%</span></th>
                <th className="text-right py-2 px-2 font-medium">Move-Outs</th>
                <th className="text-right py-2 px-2 font-medium">Initials</th>
                <th className="text-right py-2 px-2 font-medium">Retained</th>
                <th className="text-right py-2 px-2 font-medium">Retention %</th>
                <th className="text-right py-2 px-2 font-medium">Cancels</th>
                <th className="text-right py-2 px-2 font-medium">Skips</th>
                <th className="text-right py-2 px-2 font-medium">Complaints</th>
                <th className="text-right py-2 pl-2 font-medium">Revenue</th>
                <th className="py-2 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const quoteRate = row.leads_in > 0 ? row.leads_quoted / row.leads_in : null
                const closeRate = row.leads_quoted > 0 ? row.leads_closed / row.leads_quoted : null
                const retentionRate = row.initial_cleans > 0 ? row.retained / row.initial_cleans : null
                return (
                  <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2.5 pr-3 font-semibold text-ink whitespace-nowrap">{monthLabel(row.month)}</td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.leads_in > 0 ? row.leads_in : '—'}</td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.leads_quoted > 0 ? row.leads_quoted : '—'}</td>
                    <td className="text-right py-2.5 px-2"><PctBadge value={quoteRate} goal={0.9} /></td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.leads_closed > 0 ? row.leads_closed : '—'}</td>
                    <td className="text-right py-2.5 px-2"><PctBadge value={closeRate} goal={0.4} /></td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.move_out_cleans > 0 ? row.move_out_cleans : '—'}</td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.initial_cleans > 0 ? row.initial_cleans : '—'}</td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.retained > 0 ? row.retained : '—'}</td>
                    <td className="text-right py-2.5 px-2">
                      {retentionRate !== null
                        ? <span className={retentionRate >= 0.6 ? 'text-ok font-semibold' : retentionRate >= 0.4 ? 'text-warn font-semibold' : 'text-danger font-semibold'}>
                            {fmtPct(retentionRate)}
                          </span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className={row.cancellations > 10 ? 'text-danger font-semibold' : row.cancellations > 5 ? 'text-warn' : 'text-gray-700'}>
                        {row.cancellations ?? '—'}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.skips ?? '—'}</td>
                    <td className="text-right py-2.5 px-2 text-gray-700">{row.complaints ?? '—'}</td>
                    <td className="text-right py-2.5 pl-2 font-medium text-gray-700 whitespace-nowrap">
                      {row.revenue > 0 ? fmt$(row.revenue) : '—'}
                    </td>
                    <td className="py-2.5 pl-3">
                      <button onClick={() => openForm(row.month)} className="text-xs text-sage hover:underline whitespace-nowrap">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Goal benchmarks */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Goal Benchmarks</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-ink mb-1">Quote Rate</p>
            <div className="space-y-0.5 text-xs text-gray-500">
              <p><span className="text-ok font-semibold">≥ 90%</span> — On target</p>
              <p><span className="text-warn font-semibold">81–89%</span> — Needs attention</p>
              <p><span className="text-danger font-semibold">&lt; 81%</span> — Below minimum</p>
            </div>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Close Rate</p>
            <div className="space-y-0.5 text-xs text-gray-500">
              <p><span className="text-ok font-semibold">≥ 40%</span> — On target</p>
              <p><span className="text-warn font-semibold">36–39%</span> — Near threshold</p>
              <p><span className="text-danger font-semibold">&lt; 36%</span> — Below minimum</p>
            </div>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Initial → Recurring Retention</p>
            <div className="space-y-0.5 text-xs text-gray-500">
              <p><span className="text-ok font-semibold">≥ 60%</span> — Healthy</p>
              <p><span className="text-warn font-semibold">40–59%</span> — Watch</p>
              <p><span className="text-danger font-semibold">&lt; 40%</span> — Investigate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-ink text-lg">Monthly Sales Summary</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Month</label>
                <input
                  type="month"
                  value={formMonth}
                  onChange={e => setFormMonth(e.target.value)}
                  className="form-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['leads_in', 'Leads In'],
                  ['leads_quoted', 'Leads Quoted'],
                  ['leads_closed', 'Leads Closed'],
                  ['recurring_closed', 'Recurring Closed'],
                  ['move_out_cleans', 'Move Out Cleans'],
                  ['initial_cleans', 'Initial Cleans'],
                  ['retained', 'Retained (→ Recurring)'],
                  ['cancellations', 'Cancellations'],
                  ['skips', 'Skips'],
                  ['complaints', 'Complaints'],
                  ['recurring_clients', 'Recurring Clients (snapshot)'],
                  ['revenue', 'Revenue ($)'],
                  ['marketing_spend', 'Marketing Spend ($)'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
                    <input
                      type="number"
                      min="0"
                      step={field === 'revenue' || field === 'marketing_spend' ? '0.01' : '1'}
                      className="form-input"
                      {...fi(field)}
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rep Name</label>
                <input type="text" className="form-input" {...fi('rep_name')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea rows={2} className="form-input" {...fi('notes')} />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  {saveMsg && (
                    <p className={saveMsg.startsWith('Error') ? 'text-danger text-sm' : 'text-ok text-sm font-medium'}>
                      {saveMsg}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="btn-primary text-sm">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
