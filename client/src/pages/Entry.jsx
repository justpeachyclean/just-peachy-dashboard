import { apiFetch } from '../AuthContext'
import { useState } from 'react'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const currentMonth = () => today().substring(0, 7)

const INITIAL = {
  entry_date: today(),
  daily_revenue: '',
  new_hires: '',
  staff_quit: '',
  staff_fired: '',
  quit_type: 'Voluntary',
  call_ins: '',
  absences: '',
  revenue_generating_employees: '',
  marketing_spend: '',
  skips: '',
  client_count: '',
  gift_card_sales: '',
  notes: '',
  entered_by: 'manager',
}

export default function Entry() {
  const [form, setForm] = useState(INITIAL)
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved' | 'error'
  const [recentEntries, setRecentEntries] = useState([])
  const [showRecent, setShowRecent] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editRevenue, setEditRevenue] = useState('')

  // MTD Revenue quick-entry
  const [revMonth, setRevMonth] = useState(currentMonth())
  const [revAmount, setRevAmount] = useState('')
  const [revStatus, setRevStatus] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('saving')

    const payload = {
      entry_date: form.entry_date,
      new_hires: parseInt(form.new_hires) || 0,
      staff_quit: parseInt(form.staff_quit) || 0,
      staff_fired: parseInt(form.staff_fired) || 0,
      call_ins: parseFloat(form.call_ins) || 0,
      absences: parseInt(form.absences) || 0,
      revenue_generating_employees: form.revenue_generating_employees !== '' ? parseInt(form.revenue_generating_employees) : null,
      marketing_spend: form.marketing_spend !== '' ? parseFloat(form.marketing_spend) : null,
      daily_revenue: form.daily_revenue !== '' ? parseFloat(form.daily_revenue) : null,
      skips: parseInt(form.skips) || 0,
      client_count: form.client_count !== '' ? parseInt(form.client_count) : null,
      gift_card_sales: form.gift_card_sales !== '' ? parseFloat(form.gift_card_sales) : null,
      notes: form.notes || null,
      entered_by: form.entered_by,
    }

    try {
      const res = await apiFetch('/api/entry/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('saved')
      setForm(INITIAL)
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  const loadRecent = async () => {
    const res = await apiFetch('/api/entry/manual?limit=20')
    const data = await res.json()
    setRecentEntries(data)
    setShowRecent(true)
  }

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return
    await apiFetch(`/api/entry/manual/${id}`, { method: 'DELETE' })
    loadRecent()
  }

  const saveEditRevenue = async (id) => {
    await apiFetch(`/api/entry/manual/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_revenue: editRevenue === '' ? null : parseFloat(editRevenue) }),
    })
    setEditingId(null)
    loadRecent()
  }

  const saveMtdRevenue = async (e) => {
    e.preventDefault()
    if (!revAmount) return
    setRevStatus('saving')
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: revMonth, invoice_revenue: parseFloat(revAmount) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setRevStatus('saved')
      setRevAmount('')
      setTimeout(() => setRevStatus(null), 3000)
    } catch {
      setRevStatus('error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Log Daily Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enter staffing, attendance, and spend data for any date.</p>
        </div>
        <button onClick={loadRecent} className="btn-secondary text-sm">
          View Recent
        </button>
      </div>

      {/* MTD Revenue quick-entry */}
      <form onSubmit={saveMtdRevenue} className="card mb-5 border border-peach bg-peach/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">MTD Revenue</h3>
        <p className="text-xs text-gray-400 mb-3">Enter the month's total invoice revenue (pull from MC → Reports). Updates the Overview revenue card.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="form-label">Month</label>
            <input
              type="month"
              className="form-input text-sm py-1.5"
              value={revMonth}
              onChange={e => setRevMonth(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="form-label">Revenue Total ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input pl-7"
                placeholder="e.g. 42000.00"
                value={revAmount}
                onChange={e => setRevAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pb-0.5">
            <button type="submit" className="btn-primary text-sm" disabled={revStatus === 'saving'}>
              {revStatus === 'saving' ? 'Saving…' : 'Save Revenue'}
            </button>
            {revStatus === 'saved' && <span className="text-ok text-sm font-medium">✓ Saved</span>}
            {revStatus === 'error' && <span className="text-danger text-sm font-medium">✗ Error</span>}
          </div>
        </div>
      </form>

      {/* Automation guide */}
      <div className="card mb-5 border border-blue-100 bg-blue-50/40">
        <h3 className="text-xs font-semibold text-blue-700 mb-2">📋 What's automated vs. what you enter here</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
          <span className="text-blue-600">✏️ Revenue → MTD total above (MC invoice total excl. tips)</span>
          <span className="text-blue-600">✏️ New hires / quit / fired → here (daily)</span>
          <span className="text-green-600">🤖 Leads, quotes, closes ← auto via GHL</span>
          <span className="text-blue-600">✏️ Call-ins / absences → here (daily)</span>
          <span className="text-green-600">🤖 Cancellations ← auto via MaidCentral</span>
          <span className="text-blue-600">✏️ Revenue-Generating Employees → here (weekly)</span>
          <span className="text-green-600">🤖 Hiring pipeline ← auto via Woot Recruit</span>
          <span className="text-blue-600">✏️ Marketing spend → here (only if not in QuickBooks)</span>
          <span className="text-green-600">🤖 New closed clients ← auto via GHL (Step 5. Accepted)</span>
          <span className="text-blue-600">✏️ Client count snapshot → here (when it changes)</span>
          <span className="text-green-600">🤖 Client feedback / reviews ← auto via GHL</span>
          <span className="text-blue-600">✏️ Skips → here (daily)</span>
        </div>
      </div>

      {/* Recent entries drawer */}
      {showRecent && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-700">Recent Entries</h2>
            <button onClick={() => setShowRecent(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-gray-500">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left pb-2">Date</th>
                    <th className="text-right pb-2">Revenue</th>
                    <th className="text-right pb-2">Hires</th>
                    <th className="text-right pb-2">Quit</th>
                    <th className="text-right pb-2">Fired</th>
                    <th className="text-right pb-2">Call-ins</th>
                    <th className="text-right pb-2">RGE</th>
                    <th className="text-right pb-2">Skips</th>
                    <th className="text-right pb-2">Clients</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map(e => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1.5 font-medium text-xs">{e.entry_date}</td>
                      <td className="text-right font-medium text-ok text-xs">
                        {editingId === e.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              className="w-24 text-xs border border-gray-200 rounded px-1 py-0.5 text-right"
                              value={editRevenue}
                              onChange={ev => setEditRevenue(ev.target.value)}
                              autoFocus
                            />
                            <button onClick={() => saveEditRevenue(e.id)} className="text-ok text-xs hover:underline">✓</button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs hover:underline">✕</button>
                          </div>
                        ) : (
                          <span onClick={() => { setEditingId(e.id); setEditRevenue(e.daily_revenue ?? '') }} className="cursor-pointer hover:text-brand" title="Click to edit">
                            {e.daily_revenue != null ? `$${Number(e.daily_revenue).toLocaleString(undefined, {maximumFractionDigits: 0})}` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="text-right text-ok text-xs">{e.new_hires || '—'}</td>
                      <td className="text-right text-warn text-xs">{e.staff_quit || '—'}</td>
                      <td className="text-right text-danger text-xs">{e.staff_fired || '—'}</td>
                      <td className="text-right text-xs">{e.call_ins || '—'}</td>
                      <td className="text-right text-xs">{e.revenue_generating_employees ?? '—'}</td>
                      <td className="text-right text-xs">{e.skips || '—'}</td>
                      <td className="text-right text-xs">{e.client_count ?? '—'}</td>
                      <td className="pl-2">
                        <button onClick={() => deleteEntry(e.id)} className="text-gray-300 hover:text-danger text-xs" title="Delete entry">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Date */}
        <div>
          <label className="form-label">Date</label>
          <input
            type="date"
            className="form-input"
            value={form.entry_date}
            onChange={e => set('entry_date', e.target.value)}
            required
          />
        </div>

        {/* Daily Revenue */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Today's Revenue</h3>
          <div>
            <label className="form-label">Invoice Revenue Today ($) <span className="text-gray-400 font-normal normal-case">excl. tips</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input pl-7"
                placeholder="e.g. 1840.00"
                value={form.daily_revenue}
                onChange={e => set('daily_revenue', e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Pull from MC → Reports → today's completed jobs. Sums into MTD revenue on Overview automatically. Leave blank if no jobs ran today.</p>
          </div>
        </div>

        {/* Staff changes */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Staff Changes</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">New Hires Started</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={form.new_hires}
                onChange={e => set('new_hires', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Staff Quit</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={form.staff_quit}
                onChange={e => set('staff_quit', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Staff Fired</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={form.staff_fired}
                onChange={e => set('staff_fired', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Attendance</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Call-ins</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="form-input"
                placeholder="0"
                value={form.call_ins}
                onChange={e => set('call_ins', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Called in same day</p>
            </div>
            <div>
              <label className="form-label">Absences</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={form.absences}
                onChange={e => set('absences', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">No-shows / unexcused</p>
            </div>
            <div>
              <label className="form-label">Revenue-Generating Employees (RGE)</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 14"
                value={form.revenue_generating_employees}
                onChange={e => set('revenue_generating_employees', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Update weekly</p>
            </div>
          </div>
        </div>

        {/* Marketing */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Marketing Spend</h3>
          <div>
            <label className="form-label">Marketing Spend This Week ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input pl-7"
                placeholder="Leave blank if tracked in QuickBooks"
                value={form.marketing_spend}
                onChange={e => set('marketing_spend', e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Only enter if not already in QuickBooks</p>
          </div>
        </div>

        {/* Client snapshot */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Client Snapshot</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Current Client Count</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 78"
                value={form.client_count}
                onChange={e => set('client_count', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Updates Overview's recurring client total</p>
            </div>
            <div>
              <label className="form-label">Skips Today</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={form.skips}
                onChange={e => set('skips', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Adds to monthly skip count on Overview</p>
            </div>
          </div>
        </div>

        {/* Gift Card Sales */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Gift Card Sales</h3>
          <div>
            <label className="form-label">Gift Cards Sold ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input pl-7"
                placeholder="Leave blank if none sold today"
                value={form.gift_card_sales}
                onChange={e => set('gift_card_sales', e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Log Gift Up sales automatically via Zapier, or enter manual phone sales here</p>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Any context, incidents, or follow-ups…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {/* Entered by */}
        <div>
          <label className="form-label">Entered By</label>
          <input
            type="text"
            className="form-input"
            placeholder="manager"
            value={form.entered_by}
            onChange={e => set('entered_by', e.target.value)}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          {status === 'saved' && (
            <span className="text-ok text-sm font-medium">✓ Entry saved successfully</span>
          )}
          {status === 'error' && (
            <span className="text-danger text-sm font-medium">✗ Error saving — check console</span>
          )}
          {!status && <span />}
          <button
            type="submit"
            className="btn-primary"
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </form>
    </div>
  )
}
