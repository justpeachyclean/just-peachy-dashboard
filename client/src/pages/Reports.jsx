import { apiFetch } from '../AuthContext'
import { useState, useEffect } from 'react'

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

const fmt$ = n => n != null && n > 0 ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
const pct = (n, d) => (d && d > 0) ? `${((n / d) * 100).toFixed(1)}%` : '—'

function Field({ label, value, note }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-gray-100">
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <span className="text-sm font-semibold text-ink min-w-[80px] text-right">{value ?? '—'}</span>
      {note && <span className="text-xs text-gray-400 w-24 text-right">{note}</span>}
    </div>
  )
}

function ManualField({ label, value, onChange, prefix, suffix }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
        <input
          type="text"
          className="border border-gray-200 rounded px-2 py-0.5 text-sm text-right w-24 focus:outline-none focus:border-brand"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

function printReport(data, manual, type) {
  const { label, leads, cancellations, recurringClients, marketingSpend, grossSales } = data
  const isWeekly = type === 'weekly'
  const period = isWeekly ? 'week' : 'month'
  const closeRate = pct(leads.converted, leads.quoted)
  const retainRate = pct(leads.recurring_retained, leads.converted)
  const attrition = (recurringClients && cancellations != null)
    ? pct(cancellations, recurringClients) : '—'
  const showedUp = manual.hiringShowedUp
  const blank = '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>'

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${isWeekly ? 'Weekly' : 'Monthly'} Business Snapshot — ${label}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 36px 48px; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #e8905a; margin-bottom: 2px; }
  h2 { font-size: 13px; color: #888; margin-bottom: 20px; font-weight: normal; }
  .row { display: flex; align-items: baseline; border-bottom: 1px solid #eee; padding: 5px 0; gap: 8px; }
  .label { flex: 1; color: #444; }
  .value { font-weight: 700; min-width: 100px; text-align: right; }
  .note { color: #aaa; font-size: 11px; min-width: 90px; text-align: right; }
  .blank { display: inline-block; border-bottom: 1px solid #555; min-width: 100px; }
  .inline-row { display: flex; gap: 24px; }
  .inline-item { display: flex; align-items: baseline; gap: 6px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #e8905a; margin: 18px 0 6px; }
  @media print { body { padding: 24px 32px; } }
</style>
</head>
<body>
<h1>${isWeekly ? 'Weekly' : 'Monthly'} Business Snapshot</h1>
<h2>Just Peachy Clean — ${label}</h2>

<div class="section-title">Client Base</div>
<div class="row">
  <span class="label"># Recurring Clients</span>
  <span class="value">${recurringClients ?? blank}</span>
  <span class="note">(A)</span>
</div>
<div class="row">
  <span class="label">Customer hourly rate</span>
  <span class="value">${manual.hourlyRate ? '$' + manual.hourlyRate : blank}</span>
</div>

<div class="section-title">Leads &amp; Sales</div>
<div class="row">
  <span class="label">Leads came in this ${period}</span>
  <span class="value">${leads.total}</span>
</div>
<div class="row">
  <span class="label">Quoted &amp; Converted</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Quoted:</span> <strong>${leads.quoted}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Converted:</span> <strong>${leads.converted}</strong></div>
      <div class="inline-item"><strong>${closeRate}</strong></div>
    </div>
  </span>
</div>
<div class="row">
  <span class="label">Initial cleans completed</span>
  <span class="value">${leads.initial_clean_booked}</span>
</div>
<div class="row">
  <span class="label">Recurring customers cancelled</span>
  <span class="value">${cancellations}</span>
  <span class="note">(B)</span>
</div>
<div class="row">
  <span class="label">Initial Cleans &amp; Retained</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Initial:</span> <strong>${leads.initial_clean_booked}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Retained:</span> <strong>${leads.recurring_retained}</strong></div>
      <div class="inline-item"><strong>${retainRate}</strong></div>
    </div>
  </span>
</div>
<div class="row">
  <span class="label">Attrition Rate (C = B ÷ A)</span>
  <span class="value">${attrition}</span>
  <span class="note">(C)</span>
</div>

<div class="section-title">Financials</div>
<div class="row">
  <span class="label">Marketing spend this ${period}</span>
  <span class="value">${marketingSpend > 0 ? '$' + Number(marketingSpend).toLocaleString(undefined, { maximumFractionDigits: 0 }) : blank}</span>
</div>
<div class="row">
  <span class="label">Gross sales this ${period}</span>
  <span class="value">${grossSales > 0 ? '$' + Number(grossSales).toLocaleString(undefined, { maximumFractionDigits: 0 }) : blank}</span>
</div>

<div class="section-title">Staff</div>
<div class="row">
  <span class="label">Employees this ${period}</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Full time:</span> <strong>${manual.fullTime || blank}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Part time:</span> <strong>${manual.partTime || blank}</strong></div>
    </div>
  </span>
</div>
<div class="row">
  <span class="label">Hours YOU spent cleaning / managing</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Cleaning:</span> <strong>${manual.hoursCleaning || blank}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Managing:</span> <strong>${manual.hoursManaging || blank}</strong></div>
    </div>
  </span>
</div>
${isWeekly ? `
<div class="row">
  <span class="label">Employees quit/fired &amp; call outs</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Quit/Fired:</span> <strong>${manual.quitFired || blank}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Call outs:</span> <strong>${manual.callOuts || blank}</strong></div>
    </div>
  </span>
</div>` : ''}
<div class="row">
  <span class="label">Highest paid cleaner (excl. tips)</span>
  <span class="value">${manual.topEarner ? '$' + manual.topEarner : blank}</span>
</div>

<div class="section-title">Hiring</div>
<div class="row">
  <span class="label">Job inquiries</span>
  <span class="value">${manual.hiringInquiries || blank}</span>
</div>
<div class="row">
  <span class="label">Interviews booked / showed up</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Booked:</span> <strong>${manual.hiringBooked || blank}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Showed up:</span> <strong>${showedUp || blank}</strong></div>
    </div>
  </span>
</div>
<div class="row">
  <span class="label">Job offers / accepted</span>
  <span class="value">
    <div class="inline-row">
      <div class="inline-item"><span style="color:#888;font-weight:normal">Offers:</span> <strong>${manual.hiringOffers || blank}</strong></div>
      <div class="inline-item"><span style="color:#888;font-weight:normal">Accepted:</span> <strong>${manual.hiringAccepted || blank}</strong></div>
    </div>
  </span>
</div>
<div class="row">
  <span class="label">Actually started</span>
  <span class="value">${manual.hiringStarted || blank}</span>
</div>

<div class="section-title">Notes</div>
<div class="row" style="min-height:44px;align-items:flex-start;padding-top:8px;">
  <span class="label">${isWeekly ? 'Jobs this week' : 'Wins'}</span>
  <span style="flex:2;font-weight:normal">${(isWeekly ? manual.jobsThisWeek : manual.wins) || '<span style="border-bottom:1px solid #ccc;display:inline-block;min-width:320px;">&nbsp;</span>'}</span>
</div>
<div class="row" style="min-height:44px;align-items:flex-start;padding-top:8px;">
  <span class="label">Challenges</span>
  <span style="flex:2;font-weight:normal">${manual.challenges || '<span style="border-bottom:1px solid #ccc;display:inline-block;min-width:320px;">&nbsp;</span>'}</span>
</div>

<p style="margin-top:32px;font-size:10px;color:#ccc;text-align:center">Generated by Just Peachy Dashboard · ${label}</p>
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 400)
}

export default function Reports() {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [type, setType] = useState('monthly')
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [weekEnd, setWeekEnd] = useState(todayStr)
  const [customStart, setCustomStart] = useState(firstOfMonth)
  const [customEnd, setCustomEnd] = useState(todayStr)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const [manual, setManual] = useState({
    hourlyRate: '', fullTime: '', partTime: '',
    hoursCleaning: '', hoursManaging: '',
    quitFired: '', callOuts: '',
    topEarner: '',
    wins: '', jobsThisWeek: '', challenges: '',
    hiringInquiries: '', hiringBooked: '', hiringShowedUp: '',
    hiringOffers: '', hiringAccepted: '', hiringStarted: '',
  })
  const setM = k => v => setManual(p => ({ ...p, [k]: v }))

  // Seed hiring manual fields from DB data when it loads
  useEffect(() => {
    if (!data) return
    setManual(p => ({
      ...p,
      hiringInquiries: p.hiringInquiries || String(data.hiring.inquiries ?? ''),
      hiringBooked:    p.hiringBooked    || String(data.hiring.interviews_booked ?? ''),
      hiringShowedUp:  p.hiringShowedUp  || String(data.hiring.showed_up ?? (data.hiring.interviews_booked - (data.hiring.no_shows || 0)) ?? ''),
      hiringOffers:    p.hiringOffers    || String(data.hiring.offers ?? ''),
      hiringAccepted:  p.hiringAccepted  || String(data.hiring.accepted ?? ''),
      hiringStarted:   p.hiringStarted   || String(data.hiring.started ?? ''),
    }))
  }, [data])

  const fetchData = async () => {
    setLoading(true)
    try {
      let url
      if (type === 'custom') {
        if (!customStart || !customEnd) return
        url = `/api/reports/snapshot?type=custom&startDate=${customStart}&endDate=${customEnd}`
      } else {
        const dateParam = type === 'monthly' ? `${year}-${month}-01` : weekEnd
        url = `/api/reports/snapshot?type=${type}&date=${dateParam}`
      }
      const res = await apiFetch(url)
      setData(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [type, year, month, weekEnd, customStart, customEnd])

  const isWeekly = type === 'weekly'
  const isCustom = type === 'custom'
  const period = isWeekly || isCustom ? 'period' : 'month'
  const closeRate = data ? pct(data.leads.converted, data.leads.quoted) : '—'
  const retainRate = data
    ? pct(data.leads.recurring_retained, data.leads.initial_clean_booked > 0 ? data.leads.initial_clean_booked : data.leads.converted)
    : '—'
  const attrition = data && data.recurringClients
    ? pct(data.cancellations, data.recurringClients) : '—'

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Business Snapshot</h1>
          <p className="text-sm text-gray-500 mt-0.5">Auto-filled from dashboard data · fill in manual fields · print or save as PDF</p>
        </div>
        {data && (
          <button onClick={() => printReport(data, manual, type)} className="btn-primary text-sm">
            🖨 Print / Save as PDF
          </button>
        )}
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => setType('monthly')}
            className={`px-4 py-2 font-medium transition-colors ${type === 'monthly' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setType('weekly')}
            className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${type === 'weekly' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setType('custom')}
            className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${type === 'custom' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Custom Range
          </button>
        </div>

        {type === 'monthly' && (
          <>
            <select className="form-input w-24 text-sm" value={year} onChange={e => setYear(e.target.value)}>
              {['2026','2025','2024'].map(y => <option key={y}>{y}</option>)}
            </select>
            <select className="form-input w-36 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
              ))}
            </select>
          </>
        )}
        {type === 'weekly' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Week ending:</span>
            <input type="date" className="form-input text-sm w-44" value={weekEnd} onChange={e => setWeekEnd(e.target.value)} />
          </div>
        )}
        {type === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">From:</span>
            <input type="date" className="form-input text-sm w-44" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-sm text-gray-500">To:</span>
            <input type="date" className="form-input text-sm w-44" value={customEnd} max={todayStr} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}

        {loading && <span className="text-sm text-gray-400">Loading…</span>}
        {data && !loading && <span className="text-sm font-medium text-brand">{data.label}</span>}
      </div>

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Client Base</p>
              <Field label="# Recurring Clients (A)" value={data.recurringClients ?? 'not set'} note="set in Settings" />
              <ManualField label="Customer hourly rate" value={manual.hourlyRate} onChange={setM('hourlyRate')} prefix="$" />
            </div>

            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Leads &amp; Sales</p>
              <Field label={`Leads came in this ${period}`} value={data.leads.total} />
              <div className="py-1.5 border-b border-gray-100">
                <p className="text-sm text-gray-600 mb-1">Quoted &amp; Converted</p>
                <div className="flex gap-4 pl-2">
                  <span className="text-sm"><span className="text-gray-400">Quoted:</span> <strong>{data.leads.quoted}</strong></span>
                  <span className="text-sm"><span className="text-gray-400">Converted:</span> <strong>{data.leads.converted}</strong></span>
                  <span className="text-sm font-bold text-ok">{closeRate}</span>
                </div>
              </div>
              <Field label="Initial cleans completed" value={data.leads.initial_clean_booked} />
              <Field label="Recurring customers cancelled (B)" value={data.cancellations} />
              <div className="py-1.5 border-b border-gray-100">
                <p className="text-sm text-gray-600 mb-1">Initial Cleans &amp; Retained</p>
                <div className="flex gap-4 pl-2">
                  <span className="text-sm"><span className="text-gray-400">Initial:</span> <strong>{data.leads.initial_clean_booked}</strong></span>
                  <span className="text-sm"><span className="text-gray-400">Retained:</span> <strong>{data.leads.recurring_retained}</strong></span>
                  <span className="text-sm font-bold text-brand">{retainRate}</span>
                </div>
              </div>
              <Field
                label="Attrition Rate (C = B ÷ A)"
                value={attrition}
                note={data.recurringClients ? `${data.cancellations} ÷ ${data.recurringClients}` : 'set recurring clients'}
              />
            </div>

            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Financials</p>
              <Field
                label={`Marketing spend`}
                value={data.marketingSpend > 0 ? fmt$(data.marketingSpend) : 'not found in QB'}
                note={data.marketingSpend > 0 ? 'from QuickBooks' : ''}
              />
              <Field
                label={`Gross sales`}
                value={data.grossSales > 0 ? fmt$(data.grossSales) : 'not entered'}
                note={data.grossSales > 0 ? 'from daily entries' : ''}
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Staff</p>
              <div className="grid grid-cols-2 gap-x-4">
                <ManualField label="Full time" value={manual.fullTime} onChange={setM('fullTime')} />
                <ManualField label="Part time" value={manual.partTime} onChange={setM('partTime')} />
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <ManualField label="Hrs YOU cleaning" value={manual.hoursCleaning} onChange={setM('hoursCleaning')} suffix="hrs" />
                <ManualField label="Hrs YOU managing" value={manual.hoursManaging} onChange={setM('hoursManaging')} suffix="hrs" />
              </div>
              {(isWeekly || isCustom) && (
                <div className="grid grid-cols-2 gap-x-4">
                  <ManualField label="Quit / Fired" value={manual.quitFired} onChange={setM('quitFired')} />
                  <ManualField label="Call outs" value={manual.callOuts} onChange={setM('callOuts')} />
                </div>
              )}
              <ManualField label="Highest paid cleaner (excl. tips)" value={manual.topEarner} onChange={setM('topEarner')} prefix="$" />
            </div>

            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hiring <span className="text-gray-300 font-normal normal-case tracking-normal">(auto-filled · editable)</span></p>
              <ManualField label="Job inquiries" value={manual.hiringInquiries} onChange={setM('hiringInquiries')} />
              <div className="grid grid-cols-2 gap-x-4">
                <ManualField label="Interviews booked" value={manual.hiringBooked} onChange={setM('hiringBooked')} />
                <ManualField label="Showed up" value={manual.hiringShowedUp} onChange={setM('hiringShowedUp')} />
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <ManualField label="Offers made" value={manual.hiringOffers} onChange={setM('hiringOffers')} />
                <ManualField label="Offer accepted" value={manual.hiringAccepted} onChange={setM('hiringAccepted')} />
              </div>
              <ManualField label="Actually started" value={manual.hiringStarted} onChange={setM('hiringStarted')} />
            </div>

            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notes</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {isWeekly ? 'Jobs This Week' : 'Wins'}
                  </label>
                  <textarea
                    className="form-input text-sm"
                    rows={2}
                    value={isWeekly ? manual.jobsThisWeek : manual.wins}
                    onChange={e => setM(isWeekly ? 'jobsThisWeek' : 'wins')(e.target.value)}
                    placeholder={isWeekly ? 'Any notable jobs this week?' : 'What went well this month?'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Challenges</label>
                  <textarea
                    className="form-input text-sm"
                    rows={2}
                    value={manual.challenges}
                    onChange={e => setM('challenges')(e.target.value)}
                    placeholder="What needs work?"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-16 text-gray-400">Select a period above to generate a snapshot.</div>
      )}
    </div>
  )
}
