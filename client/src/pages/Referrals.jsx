import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'
import { todayEastern } from '../utils/dates'

const fmt$ = n => n != null ? `$${Number(n).toLocaleString()}` : '—'

const BLANK = {
  referrer_name: '',
  client_name: '',
  referral_date: todayEastern(),
  notes: '',
}

function statusInfo(row) {
  if (row.payout_200_paid) return { label: 'Complete $350', color: 'text-ok', bg: 'bg-green-50 border-green-100' }
  if (row.payout_150_paid && !row.one_year_date) return { label: 'Awaiting 1yr', color: 'text-brand', bg: 'bg-teal-50 border-teal-100' }
  if (row.payout_150_paid && row.one_year_date) return { label: '1yr Pending $200', color: 'text-brand', bg: 'bg-teal-50 border-teal-100' }
  if (row.third_clean_date && !row.payout_150_paid) return { label: 'Payout Due $150', color: 'text-warn', bg: 'bg-yellow-50 border-yellow-100' }
  return { label: 'In Progress', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200' }
}

function rowEarnings(row) {
  const earned = (row.payout_150_paid ? 150 : 0) + (row.payout_200_paid ? 200 : 0)
  const pending = (row.third_clean_date && !row.payout_150_paid ? 150 : 0) + (row.one_year_date && !row.payout_200_paid ? 200 : 0)
  return { earned, pending }
}

export default function Referrals() {
  const [rows, setRows] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  const load = () =>
    apiFetch('/api/referrals')
      .then(r => r.json())
      .then(setRows)
      .catch(() => {})

  useEffect(() => { load() }, [])

  const set = k => e =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const openAdd = () => {
    setForm({ ...BLANK, referral_date: todayEastern() })
    setSaveMsg('')
    setShowForm(true)
  }

  const saveNew = async e => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await apiFetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referrer_name: form.referrer_name.trim(),
          client_name: form.client_name.trim(),
          referral_date: form.referral_date,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaveMsg('Saved!')
      setShowForm(false)
      load()
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const openExpand = row => {
    if (expandedId === row.id) { setExpandedId(null); return }
    setExpandedId(row.id)
    setEditMsg('')
    setEditForm({
      referrer_name: row.referrer_name || '',
      client_name: row.client_name || '',
      referral_date: row.referral_date || todayEastern(),
      third_clean_date: row.third_clean_date || '',
      one_year_date: row.one_year_date || '',
      payout_150_paid: !!row.payout_150_paid,
      payout_150_date: row.payout_150_date || '',
      payout_200_paid: !!row.payout_200_paid,
      payout_200_date: row.payout_200_date || '',
      notes: row.notes || '',
    })
  }

  const setE = k => e =>
    setEditForm(f => ({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const markMilestone = (field) => {
    setEditForm(f => ({
      ...f,
      [field]: f[field] ? f[field] : todayEastern(),
    }))
  }

  const saveEdit = async (id) => {
    setEditSaving(true)
    setEditMsg('')
    try {
      const payload = {
        referrer_name: editForm.referrer_name.trim(),
        client_name: editForm.client_name.trim(),
        referral_date: editForm.referral_date,
        third_clean_date: editForm.third_clean_date || null,
        one_year_date: editForm.one_year_date || null,
        payout_150_paid: editForm.payout_150_paid ? 1 : 0,
        payout_150_date: editForm.payout_150_date || null,
        payout_200_paid: editForm.payout_200_paid ? 1 : 0,
        payout_200_date: editForm.payout_200_date || null,
        notes: editForm.notes.trim() || null,
      }
      const res = await apiFetch(`/api/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditMsg('Saved!')
      setExpandedId(null)
      load()
    } catch (err) {
      setEditMsg(`Error: ${err.message}`)
    } finally {
      setEditSaving(false)
    }
  }

  const deleteRow = async (row) => {
    if (!window.confirm(`Delete referral for "${row.client_name}"?`)) return
    await apiFetch(`/api/referrals/${row.id}`, { method: 'DELETE' })
    setExpandedId(null)
    load()
  }

  // KPIs
  const totalReferrals = rows.length
  const pending150 = rows.filter(r => r.third_clean_date && !r.payout_150_paid).length
  const pending200 = rows.filter(r => r.one_year_date && !r.payout_200_paid).length
  const totalPaid = rows.reduce((sum, r) => sum + (r.payout_150_paid ? 150 : 0) + (r.payout_200_paid ? 200 : 0), 0)

  // Leaderboard
  const byReferrer = {}
  rows.forEach(r => {
    const name = r.referrer_name || 'Unknown'
    if (!byReferrer[name]) byReferrer[name] = { count: 0, paid: 0, pending: 0 }
    byReferrer[name].count++
    const { earned, pending } = rowEarnings(r)
    byReferrer[name].paid += earned
    byReferrer[name].pending += pending
  })
  const leaderboard = Object.entries(byReferrer)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)
  const maxCount = Math.max(1, ...leaderboard.map(([, v]) => v.count))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Referrals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            $150 after referred client's 3rd clean &middot; $200 after 1 full year &middot; $350 total per referral
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Referral</button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="kpi-card border-brand">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Referrals</p>
          <p className="text-3xl font-bold text-ink mt-2">{totalReferrals}</p>
          <p className="text-xs text-gray-400 mt-1">all time</p>
        </div>
        <div className="kpi-card border-warn">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending $150</p>
          <p className="text-3xl font-bold text-warn mt-2">{pending150}</p>
          <p className="text-xs text-gray-400 mt-1">3rd clean done, unpaid</p>
        </div>
        <div className="kpi-card border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending $200</p>
          <p className="text-3xl font-bold text-ink mt-2">{pending200}</p>
          <p className="text-xs text-gray-400 mt-1">1yr reached, unpaid</p>
        </div>
        <div className="kpi-card border-ok">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Paid Out</p>
          <p className="text-3xl font-bold text-ok mt-2">{fmt$(totalPaid)}</p>
          <p className="text-xs text-gray-400 mt-1">referral bonuses</p>
        </div>
      </div>

      {/* Leaderboard + Add Form row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Leaderboard */}
        <div className="card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Top Referrers</p>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No referrals yet</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map(([name, stats], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                  <span className="text-sm font-medium text-ink w-28 shrink-0 truncate" title={name}>{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-brand"
                      style={{ width: `${Math.round((stats.count / maxCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink w-4 text-right shrink-0">{stats.count}</span>
                  <div className="text-xs text-gray-400 w-28 text-right shrink-0">
                    {stats.paid > 0 && <span className="text-ok font-medium">{fmt$(stats.paid)} paid</span>}
                    {stats.paid > 0 && stats.pending > 0 && <span className="mx-1">/</span>}
                    {stats.pending > 0 && <span className="text-warn">{fmt$(stats.pending)} due</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Referral form (collapsible) */}
        <div className="card border border-brand/20">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-ink text-sm">Add New Referral</h2>
            {showForm && (
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            )}
          </div>
          {!showForm ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">Log when an employee refers a potential client</p>
              <button onClick={openAdd} className="btn-primary text-sm">+ Add Referral</button>
            </div>
          ) : (
            <form onSubmit={saveNew} className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Referrer Name *</label>
                  <input type="text" required className="form-input" placeholder="Employee name"
                    value={form.referrer_name} onChange={set('referrer_name')} />
                </div>
                <div>
                  <label className="form-label">Client Name *</label>
                  <input type="text" required className="form-input" placeholder="Referred client"
                    value={form.client_name} onChange={set('client_name')} />
                </div>
              </div>
              <div>
                <label className="form-label">Referral Date *</label>
                <input type="date" required className="form-input"
                  value={form.referral_date} onChange={set('referral_date')} />
              </div>
              <div>
                <label className="form-label">Notes (optional)</label>
                <textarea rows={2} className="form-input" placeholder="Any context about this referral…"
                  value={form.notes} onChange={set('notes')} />
              </div>
              <div className="flex items-center justify-between pt-1">
                {saveMsg && (
                  <p className={`text-sm font-medium ${saveMsg.startsWith('Error') ? 'text-danger' : 'text-ok'}`}>{saveMsg}</p>
                )}
                <div className="flex gap-3 ml-auto">
                  <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Add Referral'}</button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Referral table */}
      {rows.length === 0 ? (
        <div className="card text-center py-14 text-gray-400">
          <p className="text-3xl mb-3">🤝</p>
          <p className="font-medium text-ink mb-1">No referrals tracked yet</p>
          <p className="text-sm">
            <button onClick={openAdd} className="text-brand underline">Add the first one →</button>
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Referrer</th>
                <th className="text-left py-2 px-2 font-medium">Client</th>
                <th className="text-left py-2 px-2 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">3rd Clean</th>
                <th className="text-left py-2 px-2 font-medium">1-Yr Date</th>
                <th className="text-center py-2 px-2 font-medium">$150</th>
                <th className="text-center py-2 px-2 font-medium">$200</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const { label, color, bg } = statusInfo(row)
                const isExpanded = expandedId === row.id
                return (
                  <>
                    <tr
                      key={row.id}
                      className={`border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer ${isExpanded ? 'bg-gray-50' : ''}`}
                      onClick={() => openExpand(row)}
                    >
                      <td className="py-2.5 pr-3 font-medium text-ink">{row.referrer_name}</td>
                      <td className="py-2.5 px-2 text-gray-700">{row.client_name}</td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{row.referral_date}</td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">
                        {row.third_clean_date || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">
                        {row.one_year_date || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {row.payout_150_paid
                          ? <span className="text-ok font-semibold">✓</span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {row.payout_200_paid
                          ? <span className="text-ok font-semibold">✓</span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-xs border px-2 py-0.5 rounded-full font-semibold ${color} ${bg}`}>
                          {label}
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 text-gray-400 text-xs">
                        {isExpanded ? '▲' : '▼'}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${row.id}-edit`} className="border-b border-brand/20 bg-gray-50/80">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="space-y-4">
                            {/* Basic fields */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="form-label">Referrer Name</label>
                                <input type="text" className="form-input" value={editForm.referrer_name}
                                  onChange={setE('referrer_name')} />
                              </div>
                              <div>
                                <label className="form-label">Client Name</label>
                                <input type="text" className="form-input" value={editForm.client_name}
                                  onChange={setE('client_name')} />
                              </div>
                              <div>
                                <label className="form-label">Referral Date</label>
                                <input type="date" className="form-input" value={editForm.referral_date}
                                  onChange={setE('referral_date')} />
                              </div>
                            </div>

                            {/* Milestone checkboxes */}
                            <div className="border-t border-gray-200 pt-3">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Milestones</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-start gap-3">
                                  <input type="checkbox" id={`3rd-${row.id}`} className="w-4 h-4 mt-0.5 accent-brand"
                                    checked={!!editForm.third_clean_date}
                                    onChange={e => {
                                      if (e.target.checked) markMilestone('third_clean_date')
                                      else setEditForm(f => ({ ...f, third_clean_date: '' }))
                                    }} />
                                  <div className="flex-1">
                                    <label htmlFor={`3rd-${row.id}`} className="text-sm font-medium text-gray-700">3rd Clean Complete</label>
                                    {editForm.third_clean_date && (
                                      <input type="date" className="form-input mt-1" value={editForm.third_clean_date}
                                        onChange={setE('third_clean_date')} />
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <input type="checkbox" id={`1yr-${row.id}`} className="w-4 h-4 mt-0.5 accent-brand"
                                    checked={!!editForm.one_year_date}
                                    onChange={e => {
                                      if (e.target.checked) markMilestone('one_year_date')
                                      else setEditForm(f => ({ ...f, one_year_date: '' }))
                                    }} />
                                  <div className="flex-1">
                                    <label htmlFor={`1yr-${row.id}`} className="text-sm font-medium text-gray-700">1-Year Reached</label>
                                    {editForm.one_year_date && (
                                      <input type="date" className="form-input mt-1" value={editForm.one_year_date}
                                        onChange={setE('one_year_date')} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Payout toggles */}
                            <div className="border-t border-gray-200 pt-3">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payouts</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-start gap-3">
                                  <input type="checkbox" id={`p150-${row.id}`} className="w-4 h-4 mt-0.5 accent-ok"
                                    checked={!!editForm.payout_150_paid}
                                    onChange={e => {
                                      setEditForm(f => ({
                                        ...f,
                                        payout_150_paid: e.target.checked,
                                        payout_150_date: e.target.checked ? (f.payout_150_date || todayEastern()) : f.payout_150_date,
                                      }))
                                    }} />
                                  <div className="flex-1">
                                    <label htmlFor={`p150-${row.id}`} className="text-sm font-medium text-gray-700">$150 Paid</label>
                                    {editForm.payout_150_paid && (
                                      <input type="date" className="form-input mt-1" value={editForm.payout_150_date}
                                        onChange={setE('payout_150_date')} />
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <input type="checkbox" id={`p200-${row.id}`} className="w-4 h-4 mt-0.5 accent-ok"
                                    checked={!!editForm.payout_200_paid}
                                    onChange={e => {
                                      setEditForm(f => ({
                                        ...f,
                                        payout_200_paid: e.target.checked,
                                        payout_200_date: e.target.checked ? (f.payout_200_date || todayEastern()) : f.payout_200_date,
                                      }))
                                    }} />
                                  <div className="flex-1">
                                    <label htmlFor={`p200-${row.id}`} className="text-sm font-medium text-gray-700">$200 Paid</label>
                                    {editForm.payout_200_paid && (
                                      <input type="date" className="form-input mt-1" value={editForm.payout_200_date}
                                        onChange={setE('payout_200_date')} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Notes */}
                            <div>
                              <label className="form-label">Notes</label>
                              <textarea rows={2} className="form-input" placeholder="Any notes…"
                                value={editForm.notes} onChange={setE('notes')} />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                              <button
                                onClick={() => deleteRow(row)}
                                className="text-sm text-danger hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                Delete
                              </button>
                              <div className="flex items-center gap-3">
                                {editMsg && (
                                  <p className={`text-sm font-medium ${editMsg.startsWith('Error') ? 'text-danger' : 'text-ok'}`}>{editMsg}</p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(null)}
                                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={editSaving}
                                  onClick={() => saveEdit(row.id)}
                                  className="btn-primary text-sm"
                                >
                                  {editSaving ? 'Saving…' : 'Save Changes'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
