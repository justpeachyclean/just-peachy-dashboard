import { useState, useEffect } from 'react'
import { useAuth, apiFetch } from '../AuthContext'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MonthlySpend({ marketingCategory, recruitingCategory }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [spend, setSpend] = useState({})
  const [status, setStatus] = useState(null)
  const currentYear = new Date().getFullYear()
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    apiFetch(`/api/expenses?year=${year}`)
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
          await apiFetch('/api/expenses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, category: marketingCategory, amount: parseFloat(s.marketing) || 0 }),
          })
        }
        if (s.recruiting !== undefined && s.recruiting !== '') {
          await apiFetch('/api/expenses', {
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
      { key: 'dashboard_password', label: 'Team Login Password', type: 'password', hint: 'Set a password so your team must log in. Leave blank to keep the dashboard open.' },
      { key: 'webhook_secret', label: 'Zapier Webhook Secret', type: 'text', hint: 'Add this as X-Webhook-Secret header in all Zapier POSTs' },
    ],
  },
]

function TeamMembers() {
  const { currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', role: 'member' })
  const [addStatus, setAddStatus] = useState(null)
  const [resetId, setResetId] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [resetStatus, setResetStatus] = useState(null)

  const load = () => {
    apiFetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setUsers(data)
    })
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setAddStatus('saving')
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      if (!res.ok) {
        const err = await res.json()
        setAddStatus(err.error || 'Error')
        return
      }
      setNewUser({ username: '', display_name: '', password: '', role: 'member' })
      setAddStatus('saved')
      setTimeout(() => setAddStatus(null), 3000)
      load()
    } catch {
      setAddStatus('Error adding user')
    }
  }

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user?')) return
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
    load()
  }

  const handleResetPassword = async (id) => {
    if (!resetPw.trim()) return
    setResetStatus('saving')
    try {
      const res = await apiFetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPw }),
      })
      if (!res.ok) { setResetStatus('Error'); return }
      setResetId(null)
      setResetPw('')
      setResetStatus(null)
    } catch {
      setResetStatus('Error')
    }
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-sage mb-4 pb-2 border-b border-gray-100 uppercase tracking-wider">Team Members</h2>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium pr-3">Username</th>
              <th className="text-left pb-2 font-medium pr-3">Display Name</th>
              <th className="text-left pb-2 font-medium pr-3">Role</th>
              <th className="text-left pb-2 font-medium pr-3">Last Login</th>
              <th className="text-left pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.filter(u => u.active).map(u => (
              <tr key={u.id}>
                <td className="py-2 pr-3 font-medium text-ink">{u.username}</td>
                <td className="py-2 pr-3 text-gray-600">{u.display_name || '—'}</td>
                <td className="py-2 pr-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-400 text-xs">{u.last_login ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(u.last_login.replace(' ','T')+'Z')) : 'Never'}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {resetId === u.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="password"
                          className="form-input py-0.5 px-2 text-xs w-32"
                          placeholder="New password"
                          value={resetPw}
                          onChange={e => setResetPw(e.target.value)}
                        />
                        <button className="text-xs text-ok font-medium" onClick={() => handleResetPassword(u.id)}>
                          {resetStatus === 'saving' ? '…' : 'Set'}
                        </button>
                        <button className="text-xs text-gray-400" onClick={() => { setResetId(null); setResetPw('') }}>Cancel</button>
                      </div>
                    ) : (
                      <button className="text-xs text-blue-500 hover:underline" onClick={() => setResetId(u.id)}>Reset PW</button>
                    )}
                    {u.id !== currentUser?.id && (
                      <button className="text-xs text-danger hover:underline" onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold text-ink mb-3">Add Team Member</h3>
      <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Username</label>
          <input type="text" required className="form-input" placeholder="e.g. lexi" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Display Name</label>
          <input type="text" className="form-input" placeholder="e.g. Lexi" value={newUser.display_name} onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Password</label>
          <input type="password" required className="form-input" placeholder="Initial password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Role</label>
          <select className="form-input" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <button type="submit" className="btn-primary text-sm" disabled={addStatus === 'saving'}>
            {addStatus === 'saving' ? 'Adding…' : 'Add User'}
          </button>
          {addStatus === 'saved' && <span className="text-ok text-sm font-medium">User added</span>}
          {addStatus && addStatus !== 'saving' && addStatus !== 'saved' && <span className="text-danger text-sm font-medium">{addStatus}</span>}
        </div>
      </form>
    </div>
  )
}

function AuditLog() {
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    apiFetch('/api/audit').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setEntries(data)
      setLoaded(true)
    })
  }, [])

  if (!loaded) return <div className="text-gray-400 text-sm py-4">Loading audit log…</div>

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-sage mb-4 pb-2 border-b border-gray-100 uppercase tracking-wider">Audit Log</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium pr-3">When</th>
              <th className="text-left pb-2 font-medium pr-3">User</th>
              <th className="text-left pb-2 font-medium pr-3">Action</th>
              <th className="text-left pb-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.slice(0, 50).map(e => (
              <tr key={e.id}>
                <td className="py-1.5 pr-3 text-gray-400 text-xs whitespace-nowrap">{new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date((e.created_at||'').replace(' ','T')+'Z'))}</td>
                <td className="py-1.5 pr-3 text-gray-600 text-xs">{e.user || 'system'}</td>
                <td className="py-1.5 pr-3 text-xs">
                  <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{e.action_type}</span>
                </td>
                <td className="py-1.5 text-gray-600 text-xs">{e.description}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-gray-400 text-xs">No audit entries yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Settings() {
  const { currentUser } = useAuth()
  const [values, setValues] = useState({})
  const [status, setStatus] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    apiFetch('/api/settings')
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
      const res = await apiFetch('/api/settings', {
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

      {currentUser?.role === 'admin' && (
        <div className="mt-5 space-y-5">
          <TeamMembers />
          <AuditLog />
        </div>
      )}
    </div>
  )
}
