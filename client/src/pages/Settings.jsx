import { useState, useEffect } from 'react'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MonthlySpend({ marketingCategory, recruitingCategory }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [spend, setSpend] = useState({})
  const [status, setStatus] = useState(null)
  const currentYear = new Date().getFullYear()
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    fetch(`/api/expenses?year=${year}`)
      .then(r => r.json())
      .then(rows => {
        const s = {}
        rows.forEach(r => {
          if (!s[r.month]) s[r.month] = {}
          if (r.category === marketingCategory) s[r.month].marketing = r.amount
          if (r.category === recruitingCategory) s[r.month].recruiting = r.amount
        })
        setSpend(s)
      })
  }, [year, marketingCategory, recruitingCategory])

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })

  const setField = (month, field, val) =>
    setSpend(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }))

  const handleSave = async () => {
    setStatus('saving')
    try {
      for (const month of months) {
        const s = spend[month] || {}
        if (s.marketing !== undefined && s.marketing !== '') {
          await fetch('/api/expenses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, category: marketingCategory, amount: parseFloat(s.marketing) || 0 }),
          })
        }
        if (s.recruiting !== undefined && s.recruiting !== '') {
          await fetch('/api/expenses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, category: recruitingCategory, amount: parseFloat(s.recruiting) || 0 }),
          })
        }
      }
      setStatus('saved')
      setTimeout(() => setStatus(null), 3000)
    } catch {
      setStatus('error')
    }
  }

  const years = Array.from({ length: 4 }, (_, i) => currentYear - 1 + i)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1 pb-2 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-sage uppercase tracking-wider">Monthly Spend</h2>
        <select
          className="form-input py-1 px-2 text-sm w-24"
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-400 mb-4 mt-3">Actual spend per month — used for CAC, cost-per-lead, and cost-per-hire calculations.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium pr-4">Month</th>
              <th className="text-left pb-2 font-medium pr-4">Marketing</th>
              <th className="text-left pb-2 font-medium">Recruiting</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {months.map((month, i) => {
              const isFuture = month > currentMonth
              const s = spend[month] || {}
              return (
                <tr key={month} className={isFuture ? 'opacity-40' : ''}>
                  <td className="py-1.5 pr-4 font-medium text-ink w-12">{MONTH_LABELS[i]}</td>
                  <td className="py-1.5 pr-3">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        className="form-input pl-6 py-1 text-sm"
                        value={s.marketing ?? ''}
                        onChange={e => setField(month, 'marketing', e.target.value)}
                        disabled={isFuture}
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className="py-1.5">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        className="form-input pl-6 py-1 text-sm"
                        value={s.recruiting ?? ''}
                        onChange={e => setField(month, 'recruiting', e.target.value)}
                        disabled={isFuture}
                        placeholder="0"
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        {status === 'saved' && <span className="text-ok text-sm font-medium">✓ Spend saved</span>}
        {status === 'error' && <span className="text-danger text-sm font-medium">✗ Error saving</span>}
        {!status && <span />}
        <button type="button" onClick={handleSave} className="btn-primary text-sm" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save Spend'}
        </button>
      </div>
    </div>
  )
}

const FIELDS = [
  {
    section: 'Revenue Targets',
    fields: [
      { key: 'break_even_daily', label: 'Break-Even Daily Revenue', prefix: '$', type: 'number', hint: 'Minimum daily revenue to cover all costs' },
      { key: 'billing_rate_per_rge', label: 'Billing Rate per RGE ($/hr)', prefix: '$', type: 'number', hint: 'Revenue charged per employee per hour (e.g. $55). Used to compute daily goal from RGE count.' },
      { key: 'goal_hours', label: 'Goal Hours per RGE per Day', type: 'number', hint: 'Daily hours target per revenue-generating employee (e.g. 6.5)' },
      { key: 'stretch_hours', label: 'Stretch Hours per RGE per Day', type: 'number', hint: 'Stretch hours target (e.g. 7). RGE × Stretch Hours × Billing Rate = stretch goal.' },
      { key: 'daily_goal', label: 'Fixed Daily Revenue Goal (fallback)', prefix: '$', type: 'number', hint: 'Used only if RGE rate/hours are not set' },
      { key: 'daily_stretch_goal', label: 'Fixed Daily Stretch Goal (fallback)', prefix: '$', type: 'number', hint: 'Used only if RGE rate/hours are not set' },
    ],
  },
  {
    section: 'Turnover Cost Inputs',
    fields: [
      { key: 'avg_training_hours', label: 'Avg Training Hours per New Hire', type: 'number', hint: 'Used to calculate cost of turnover' },
      { key: 'avg_hourly_labor_cost', label: 'Avg Hourly Labor Cost ($)', prefix: '$', type: 'number', hint: 'Fully-loaded cost per hour' },
      { key: 'avg_ramp_up_days', label: 'Avg Ramp-Up Days Before Full Productivity', type: 'number', hint: 'Days until a new hire generates full revenue' },
    ],
  },
  {
    section: 'Client Pricing (for Annual Value)',
    fields: [
      { key: 'avg_recurring_price', label: 'Avg Price per Recurring Clean', prefix: '$', type: 'number', hint: 'Used to calculate annual value for weekly/biweekly/monthly clients' },
      { key: 'avg_onetime_price', label: 'Avg Price per One-Time Clean', prefix: '$', type: 'number', hint: 'Used for initial and one-off cleans' },
    ],
  },
  {
    section: 'QuickBooks Expense Categories',
    fields: [
      { key: 'qb_marketing_category', label: 'Marketing Category Name', type: 'text', hint: 'Exact QuickBooks account/category name (e.g. "Advertising")' },
      { key: 'qb_recruiting_category', label: 'Recruiting Category Name', type: 'text', hint: 'e.g. "Recruiting", "Job Postings", "Indeed Ads"' },
      { key: 'qb_training_category', label: 'Training Category Name', type: 'text', hint: 'e.g. "Training", "Onboarding"' },
    ],
  },
  {
    section: 'Security',
    fields: [
      { key: 'webhook_secret', label: 'Zapier Webhook Secret', type: 'text', hint: 'Add this as X-Webhook-Secret header in all Zapier POSTs' },
    ],
  },
]

export default function Settings() {
  const [values, setValues] = useState({})
  const [status, setStatus] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setValues(data)
        setLoaded(true)
      })
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setStatus('saving')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('saved')
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  const set = (k, v) => setValues(prev => ({ ...prev, [k]: v }))

  if (!loaded) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
      Loading settings…
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">One-time configuration — set once, referenced by all dashboard calculations.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {FIELDS.map(({ section, fields }) => (
          <div key={section} className="card">
            <h2 className="text-sm font-semibold text-sage mb-4 pb-2 border-b border-gray-100 uppercase tracking-wider">{section}</h2>
            <div className="space-y-4">
              {fields.map(({ key, label, prefix, type, hint }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <div className="relative">
                    {prefix && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>
                    )}
                    <input
                      type={type}
                      step={type === 'number' ? 'any' : undefined}
                      className={`form-input ${prefix ? 'pl-7' : ''}`}
                      value={values[key] ?? ''}
                      onChange={e => set(key, e.target.value)}
                    />
                  </div>
                  {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between py-2">
          {status === 'saved' && (
            <span className="text-ok text-sm font-medium">✓ Settings saved</span>
          )}
          {status === 'error' && (
            <span className="text-danger text-sm font-medium">✗ Error saving settings</span>
          )}
          {!status && <span />}
          <button
            type="submit"
            className="btn-primary"
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className="mt-5">
        <MonthlySpend
          marketingCategory={values.qb_marketing_category || 'Advertising'}
          recruitingCategory={values.qb_recruiting_category || 'Recruiting'}
        />
      </div>
    </div>
  )
}
