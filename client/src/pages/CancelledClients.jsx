import { useState, useEffect } from 'react'

const CATEGORY_COLORS = {
  'Service / Quality':       'bg-red-100 text-red-700',
  'Scheduling / Consistency':'bg-orange-100 text-orange-700',
  'Pricing / Value':         'bg-yellow-100 text-yellow-700',
  'Life Changes':            'bg-blue-100 text-blue-700',
  'Communication':           'bg-purple-100 text-purple-700',
  'Temporary / Pause Worthy':'bg-teal-100 text-teal-700',
  'Other':                   'bg-gray-100 text-gray-600',
}

const OUTCOME_COLORS = {
  Lost:   'bg-red-50 text-red-600',
  Saved:  'bg-green-50 text-green-700',
  Paused: 'bg-yellow-50 text-yellow-700',
}

const CODE_PREFIXES = ['Q','S','P','L','C','T','O']
const ALL_CODES = {}
;['Q','S','P','L','C','T','O'].forEach(p => {
  for (let i = 1; i <= 5; i++) {
    const code = `${p}${i}`
    ALL_CODES[code] = code
  }
})

const REASON_CODES = {
  Q1:'Missed Areas',Q2:'Inconsistent Tech',Q3:'Rushed Clean',Q4:'Repeated Issue',Q5:'Reclean Dissatisfaction',
  S1:'Tech Late',S2:"Window Doesn't Work",S3:'Too Many Tech Changes',S4:'Day/Time Unavailable',S5:'Last-Minute Reschedules',
  P1:'Too Expensive',P2:'Cheaper Competitor',P3:'Frequency Downgrade',P4:'Financial Hardship',P5:"Didn't See Value",
  L1:'Moving',L2:'Medical/Health',L3:'Death in Family',L4:'Job Loss',L5:'Home Sold/Reno',
  C1:'Office Slow Response',C2:'Misunderstood Service',C3:'Expectation Not Set',C4:"Tech Didn't Communicate",C5:'Policy Dispute',
  T1:'Seasonal Pause',T2:'Travel',T3:'New Baby',T4:'Trialing Competitor',T5:'Wants to Resume',
  O1:'Personality Conflict',O2:'House Not Ready',O3:'Pet Issues',O4:'Unspecified',O5:'Other',
}

const CODE_CATEGORIES = {
  Q:'Service / Quality',S:'Scheduling / Consistency',P:'Pricing / Value',
  L:'Life Changes',C:'Communication',T:'Temporary / Pause Worthy',O:'Other',
}

function fmt$(n) { return n != null ? `$${Math.round(n).toLocaleString()}` : '—' }

function BarRow({ label, value, max, color, extra }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-gray-600 w-40 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-ink w-6 text-right">{value}</span>
      {extra && <span className="text-xs text-gray-400 w-12 text-right">{extra}</span>}
    </div>
  )
}

function CancelRow({ row: r, onSaved }) {
  const [open, setOpen] = useState(false)
  const [ed, setEd] = useState({})
  const [saving, setSaving] = useState(false)

  const cat = r.reason_category || 'Other'
  const set = (k, v) => setEd(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await fetch(`/api/cancellations/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ed),
    })
    setSaving(false)
    setOpen(false)
    setEd({})
    onSaved()
  }

  const displayCode = ed.reason_code ?? r.reason_code
  const displayCat = displayCode ? (CODE_CATEGORIES[displayCode[0]] || 'Other') : cat
  const displayOutcome = ed.save_outcome ?? r.save_outcome

  return (
    <div className={`rounded-xl border ${open ? 'border-brand/30 bg-brand/5' : 'border-transparent hover:border-gray-100 hover:bg-gray-50/50'}`}>
      {/* Summary row */}
      <div
        className="grid grid-cols-[90px_1fr_60px_80px_80px_24px] gap-2 px-3 py-2 cursor-pointer items-center"
        onClick={() => { setOpen(p => !p); if (!open) setEd({}) }}
      >
        <span className="text-xs text-gray-500 whitespace-nowrap">{r.cancel_date}</span>
        <span className="font-medium text-ink text-sm truncate">
          {r.client_name || <span className="text-gray-300">Unnamed</span>}
          {r.client_quote && <span className="text-xs text-gray-400 font-normal italic ml-1">"{r.client_quote}"</span>}
        </span>
        <span>
          {displayCode
            ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${CATEGORY_COLORS[displayCat]}`}>{displayCode}</span>
            : <span className="text-xs text-warn font-semibold">+ Code</span>
          }
        </span>
        <span className="hidden sm:block">
          {displayOutcome
            ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${OUTCOME_COLORS[displayOutcome] || 'bg-gray-50 text-gray-500'}`}>{displayOutcome}</span>
            : <span className="text-gray-300 text-xs">—</span>
          }
        </span>
        <span className="hidden md:block text-right text-xs text-gray-500">
          {r.revenue_lost_monthly ? fmt$(r.revenue_lost_monthly) : '—'}
        </span>
        <span className="text-gray-400 text-xs text-right">{open ? '▲' : '▼'}</span>
      </div>

      {/* Inline edit panel */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-brand/10">
          <p className="text-xs text-gray-400 mb-3">
            Update the reason code and structured fields — MC notes come in as free text, code them here.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label text-xs">Reason Code</label>
              <select
                className="form-input py-1 text-sm"
                defaultValue={r.reason_code || ''}
                onChange={e => set('reason_code', e.target.value || null)}
              >
                <option value="">— Select Code —</option>
                {CODE_PREFIXES.map(p => (
                  <optgroup key={p} label={CODE_CATEGORIES[p]}>
                    {[1,2,3,4,5].map(n => {
                      const code = `${p}${n}`
                      return <option key={code} value={code}>{code} – {REASON_CODES[code]}</option>
                    })}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label text-xs">Save Outcome</label>
              <select
                className="form-input py-1 text-sm"
                defaultValue={r.save_outcome || 'Lost'}
                onChange={e => set('save_outcome', e.target.value)}
              >
                <option>Lost</option>
                <option>Saved</option>
                <option>Paused</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label text-xs">Client's Exact Words (from MC notes)</label>
              <input
                className="form-input py-1 text-sm"
                defaultValue={r.client_quote || ''}
                placeholder='"Every visit felt different…"'
                onChange={e => set('client_quote', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label text-xs">Solution Offered</label>
              <input
                className="form-input py-1 text-sm"
                defaultValue={r.solution_offered || ''}
                placeholder="Tech swap / Reclean…"
                onChange={e => set('solution_offered', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label text-xs">Monthly Revenue Lost ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                <input
                  type="number" min="0" step="0.01"
                  className="form-input pl-6 py-1 text-sm"
                  defaultValue={r.revenue_lost_monthly || ''}
                  placeholder="0"
                  onChange={e => set('revenue_lost_monthly', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id={`sa-${r.id}`}
                defaultChecked={r.save_attempted === 1}
                onChange={e => set('save_attempted', e.target.checked)}
                className="accent-brand"
              />
              <label htmlFor={`sa-${r.id}`} className="text-sm text-gray-700 cursor-pointer">Save attempt was made</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setOpen(false); setEd({}) }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const BLANK = {
  client_name:'', cancel_date: new Date().toISOString().split('T')[0],
  reason_code:'', client_quote:'', save_attempted: false,
  save_outcome:'Lost', solution_offered:'', frequency:'',
  recurring_months:'', revenue_lost_monthly:'', notes:'',
}

export default function CancelledClients() {
  const year = new Date().getFullYear()
  const [selYear, setSelYear] = useState(year)
  const [data, setData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState('')

  const load = () =>
    fetch(`/api/cancellations?year=${selYear}`)
      .then(r => r.json())
      .then(setData)

  useEffect(() => { load() }, [selYear])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/cancellations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        save_attempted: form.save_attempted ? 1 : 0,
        recurring_months: form.recurring_months ? parseInt(form.recurring_months) : null,
        revenue_lost_monthly: form.revenue_lost_monthly ? parseFloat(form.revenue_lost_monthly) : null,
      }),
    })
    setSaving(false)
    setSaved(true)
    setForm(BLANK)
    setShowForm(false)
    setTimeout(() => setSaved(false), 3000)
    load()
  }

  const stats = data?.stats || {}
  const rows = (data?.cancellations || []).filter(r =>
    !filter || (r.client_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.reason_code || '').toLowerCase().includes(filter.toLowerCase())
  )

  const catMax = Math.max(1, ...Object.values(stats.by_category || {}))
  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Cancelled Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cancellation reasons, save attempts, and revenue impact</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="form-input py-1.5 px-2 text-sm w-24"
            value={selYear}
            onChange={e => setSelYear(parseInt(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setShowForm(p => !p)}
            className="btn-primary text-sm"
          >
            {showForm ? 'Cancel' : '+ Log Cancellation'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
          ✓ Cancellation logged
        </div>
      )}

      {/* Manual entry form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
            Log Cancellation
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Client Name</label>
                <input className="form-input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="form-label">Cancel Date *</label>
                <input type="date" className="form-input" required value={form.cancel_date} onChange={e => set('cancel_date', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Reason Code</label>
                <select className="form-input" value={form.reason_code} onChange={e => set('reason_code', e.target.value)}>
                  <option value="">— Select Code —</option>
                  {CODE_PREFIXES.map(p => (
                    <optgroup key={p} label={CODE_CATEGORIES[p]}>
                      {[1,2,3,4,5].map(n => {
                        const code = `${p}${n}`
                        return <option key={code} value={code}>{code} – {REASON_CODES[code]}</option>
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Frequency</label>
                <select className="form-input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                  <option value="">—</option>
                  <option>weekly</option>
                  <option>biweekly</option>
                  <option>monthly</option>
                  <option>one_time</option>
                </select>
              </div>
              <div>
                <label className="form-label">Client's Exact Words (Short Quote)</label>
                <input className="form-input" value={form.client_quote} onChange={e => set('client_quote', e.target.value)} placeholder='"Every visit felt different…"' />
              </div>
              <div>
                <label className="form-label">Save Outcome</label>
                <select className="form-input" value={form.save_outcome} onChange={e => set('save_outcome', e.target.value)}>
                  <option>Lost</option>
                  <option>Saved</option>
                  <option>Paused</option>
                </select>
              </div>
              <div>
                <label className="form-label">Solution Offered</label>
                <input className="form-input" value={form.solution_offered} onChange={e => set('solution_offered', e.target.value)} placeholder="Tech swap / Reclean / Price explanation…" />
              </div>
              <div>
                <label className="form-label">Monthly Revenue Lost ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01" className="form-input pl-7" value={form.revenue_lost_monthly} onChange={e => set('revenue_lost_monthly', e.target.value)} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="form-label">Months as Client</label>
                <input type="number" min="0" className="form-input" value={form.recurring_months} onChange={e => set('recurring_months', e.target.value)} placeholder="0" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="save_attempted" checked={form.save_attempted} onChange={e => set('save_attempted', e.target.checked)} className="accent-brand" />
                <label htmlFor="save_attempted" className="text-sm text-gray-700 cursor-pointer">Save attempt was made</label>
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">Notes</label>
              <textarea className="form-input h-16 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional context…" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save Cancellation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Cancelled', value: stats.total ?? '—', sub: `${selYear}` },
          { label: 'Save Rate', value: stats.total > 0 ? `${stats.save_rate}%` : '—', sub: `${stats.saved ?? 0} saved · ${stats.paused ?? 0} paused` },
          { label: 'Lost', value: stats.lost ?? '—', sub: 'no save outcome' },
          { label: 'Revenue Lost/Mo', value: stats.revenue_lost_monthly > 0 ? fmt$(stats.revenue_lost_monthly) : '—', sub: 'from logged records' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-ink">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Category breakdown */}
        <div className="card">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">By Category</h2>
          {Object.keys(stats.by_category || {}).length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">No cancellations logged yet.</p>
            : Object.entries(stats.by_category)
                .sort(([,a],[,b]) => b - a)
                .map(([cat, count]) => (
                  <BarRow
                    key={cat}
                    label={cat}
                    value={count}
                    max={catMax}
                    color={cat === 'Service / Quality' ? 'bg-red-400' :
                           cat === 'Pricing / Value' ? 'bg-yellow-400' :
                           cat === 'Temporary / Pause Worthy' ? 'bg-teal-400' :
                           cat === 'Life Changes' ? 'bg-blue-400' :
                           cat === 'Scheduling / Consistency' ? 'bg-orange-400' :
                           cat === 'Communication' ? 'bg-purple-400' : 'bg-gray-300'}
                    extra={stats.total > 0 ? `${Math.round((count/stats.total)*100)}%` : null}
                  />
                ))
          }
        </div>

        {/* Top reason codes */}
        <div className="card">
          <h2 className="text-sm font-semibold text-sage uppercase tracking-wider mb-4">Top Reason Codes</h2>
          {Object.keys(stats.by_code || {}).length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">No reason codes recorded yet.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="text-left pb-2 font-medium pr-3">Code</th>
                    <th className="text-left pb-2 font-medium pr-3">Reason</th>
                    <th className="text-right pb-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.by_code)
                    .sort(([,a],[,b]) => b - a)
                    .slice(0, 8)
                    .map(([code, count]) => {
                      const cat = CODE_CATEGORIES[code[0]] || 'Other'
                      return (
                        <tr key={code} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${CATEGORY_COLORS[cat]}`}>{code}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-gray-600 text-xs">{REASON_CODES[code] || code}</td>
                          <td className="py-1.5 text-right font-semibold text-ink">{count}</td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* Full table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">All Cancellations</h2>
          <input
            className="form-input py-1.5 text-sm w-48"
            placeholder="Search client or code…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <p className="mb-1">No cancellations logged yet for {selYear}.</p>
            <p className="text-xs">Use "+ Log Cancellation" above or set up the MaidCentral Zap to auto-populate.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[90px_1fr_60px_80px_80px_24px] gap-2 px-3 pb-1 border-b border-gray-100 text-xs text-gray-400 uppercase font-medium tracking-wide">
              <span>Date</span><span>Client</span><span>Code</span><span className="hidden sm:block">Outcome</span><span className="hidden md:block text-right">Rev/Mo</span><span />
            </div>
            {rows.map(r => (
              <CancelRow key={r.id} row={r} onSaved={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
