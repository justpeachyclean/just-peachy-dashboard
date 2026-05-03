import { useState, useEffect } from 'react'

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
    </div>
  )
}
