import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

const BASE_URL = window.location.origin

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors whitespace-nowrap"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function StatusDot({ count }) {
  if (count === undefined) return <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />
  return count > 0
    ? <span className="w-2 h-2 rounded-full bg-ok inline-block" title={`${count} events received`} />
    : <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="No events yet" />
}

const SOURCE_COLORS = {
  ghl: 'bg-blue-50 text-blue-700 border-blue-100',
  maidcentral: 'bg-peach/20 text-peachdark border-peach/30',
  quickbooks: 'bg-green-50 text-green-700 border-green-100',
  test: 'bg-gray-50 text-gray-600 border-gray-100',
}

const SOURCE_LABELS = {
  ghl: 'GHL',
  maidcentral: 'MaidCentral',
  quickbooks: 'QuickBooks',
  test: 'Test',
}

export default function Connections() {
  const [secret, setSecret] = useState('')
  const [events, setEvents] = useState([])
  const [counts, setCounts] = useState({})
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadSecret = () =>
    fetch('/api/settings').then(r => r.json()).then(s => setSecret(s.webhook_secret || ''))

  const loadEvents = useCallback(() =>
    fetch('/api/webhook/events')
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setCounts(d.counts || {}) })
  , [])

  useEffect(() => {
    loadSecret()
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(loadEvents, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, loadEvents])

  const sendTest = async (source) => {
    setTesting(p => ({ ...p, [source]: true }))
    setTestResults(p => ({ ...p, [source]: null }))
    try {
      const res = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      setTestResults(p => ({ ...p, [source]: res.ok ? 'ok' : 'error' }))
      if (res.ok) loadEvents()
    } catch {
      setTestResults(p => ({ ...p, [source]: 'error' }))
    } finally {
      setTesting(p => ({ ...p, [source]: false }))
    }
  }

  const webhookUrl = (path) => `${BASE_URL}/api/webhook/${path}`

  const ghlFields = [
    { field: 'event_type', values: 'new_lead · quoted · closed · interview_scheduled · interview_showed', required: true },
    { field: 'contact_id', values: 'GHL Contact ID', required: false },
    { field: 'opportunity_id', values: 'GHL Opportunity ID', required: false },
    { field: 'rep_name', values: 'Sales rep full name', required: false },
    { field: 'client_freq', values: 'weekly · biweekly · monthly · one_time', required: false },
    { field: 'event_date', values: 'YYYY-MM-DD (defaults to today)', required: false },
  ]

  const mcFields = [
    { field: 'event_type', values: 'revenue · recurring_client · cancellation · skip · complaint', required: true },
    { field: 'client_id', values: 'MaidCentral Client ID', required: false },
    { field: 'amount', values: 'Dollar amount (for revenue events)', required: false },
    { field: 'event_date', values: 'YYYY-MM-DD (defaults to today)', required: false },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Connections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Zapier webhook setup &amp; live event log</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-brand"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadEvents} className="text-sm border border-gray-200 bg-white text-gray-600 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Connection status strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { key: 'ghl', label: 'Go High Level', icon: '📞', desc: 'Leads, quotes, closes' },
          { key: 'maidcentral', label: 'MaidCentral', icon: '🧹', desc: 'Revenue, clients, cancels' },
          { key: 'quickbooks', label: 'QuickBooks', icon: '📊', desc: 'Expense categories' },
        ].map(({ key, label, icon, desc }) => (
          <div key={key} className="card text-center py-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <StatusDot count={counts[key]} />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl mb-1">{icon}</p>
            <p className="text-xs text-gray-400">{desc}</p>
            <p className="text-xs font-semibold mt-2">
              {counts[key] > 0
                ? <span className="text-ok">{counts[key].toLocaleString()} events received</span>
                : <span className="text-gray-300">No events yet</span>
              }
            </p>
          </div>
        ))}
      </div>

      {/* Webhook secret */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Webhook Secret</h2>
          <Link to="/settings" className="text-xs text-sage hover:underline">Change in Settings →</Link>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Add this as the <code className="bg-gray-100 px-1 rounded">X-Webhook-Secret</code> header on every Zapier POST.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          <code className="flex-1 text-sm font-mono text-ink truncate">{secret || '—'}</code>
          {secret && <CopyButton text={secret} />}
        </div>
        {(!secret || secret === 'change-me-before-connecting-zapier') && (
          <p className="text-xs text-warn mt-2">⚠ Set a real secret in Settings before going live.</p>
        )}
      </div>

      {/* GHL Setup */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">📞</span>
          <div>
            <h2 className="font-semibold text-ink">Go High Level → Dashboard</h2>
            <p className="text-xs text-gray-400">Automates: new leads, quotes, closes, interview tracking</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusDot count={counts.ghl} />
            <button
              onClick={() => sendTest('ghl')}
              disabled={testing.ghl}
              className="text-xs border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium text-gray-600 transition-colors"
            >
              {testing.ghl ? 'Sending…' : 'Send Test'}
            </button>
            {testResults.ghl === 'ok' && <span className="text-xs text-ok font-semibold">✓ Working</span>}
            {testResults.ghl === 'error' && <span className="text-xs text-danger font-semibold">✗ Failed</span>}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Webhook URL</p>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-ink truncate">{webhookUrl('ghl')}</code>
            <CopyButton text={webhookUrl('ghl')} />
          </div>
        </div>

        <details className="group">
          <summary className="text-xs font-semibold text-sage cursor-pointer hover:text-sagehover select-none">
            Field mapping &amp; Zapier steps ▸
          </summary>
          <div className="mt-3 space-y-3">
            <div className="bg-brand/5 border border-brand/10 rounded-xl p-4 text-xs">
              <p className="font-semibold text-ink mb-2">Zapier setup (4 steps per trigger):</p>
              <ol className="space-y-1 text-gray-600 list-decimal list-inside">
                <li>In Zapier, create a new Zap. Trigger = <strong>GoHighLevel → Contact Updated</strong> (or Opportunity Stage Changed)</li>
                <li>Action = <strong>Webhooks by Zapier → POST</strong></li>
                <li>URL = the webhook URL above. Headers: <code className="bg-white px-1 rounded">X-Webhook-Secret</code> = your secret</li>
                <li>Map the fields below in the Payload section (JSON)</li>
              </ol>
              <p className="text-gray-500 mt-2">Repeat for each event type: new_lead, quoted, closed.</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 pr-3 font-medium">JSON field</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Value / GHL field to map</th>
                  <th className="text-left py-1.5 font-medium">Required</th>
                </tr>
              </thead>
              <tbody>
                {ghlFields.map(f => (
                  <tr key={f.field} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3"><code className="bg-gray-100 px-1 rounded">{f.field}</code></td>
                    <td className="py-1.5 pr-3 text-gray-600">{f.values}</td>
                    <td className="py-1.5">
                      {f.required
                        ? <span className="text-danger font-semibold">Yes</span>
                        : <span className="text-gray-300">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* MaidCentral Setup */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">🧹</span>
          <div>
            <h2 className="font-semibold text-ink">MaidCentral → Dashboard</h2>
            <p className="text-xs text-gray-400">Automates: revenue, recurring clients, cancellations, skips, complaints</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusDot count={counts.maidcentral} />
            <button
              onClick={() => sendTest('maidcentral')}
              disabled={testing.maidcentral}
              className="text-xs border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium text-gray-600 transition-colors"
            >
              {testing.maidcentral ? 'Sending…' : 'Send Test'}
            </button>
            {testResults.maidcentral === 'ok' && <span className="text-xs text-ok font-semibold">✓ Working</span>}
            {testResults.maidcentral === 'error' && <span className="text-xs text-danger font-semibold">✗ Failed</span>}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Webhook URL</p>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-ink truncate">{webhookUrl('maidcentral')}</code>
            <CopyButton text={webhookUrl('maidcentral')} />
          </div>
        </div>

        <details className="group">
          <summary className="text-xs font-semibold text-sage cursor-pointer hover:text-sagehover select-none">
            Field mapping &amp; Zapier steps ▸
          </summary>
          <div className="mt-3 space-y-3">
            <div className="bg-brand/5 border border-brand/10 rounded-xl p-4 text-xs">
              <p className="font-semibold text-ink mb-2">Zapier setup:</p>
              <ol className="space-y-1 text-gray-600 list-decimal list-inside">
                <li>Trigger = <strong>MaidCentral → Job Completed</strong> (for revenue events)</li>
                <li>Action = <strong>Webhooks by Zapier → POST</strong></li>
                <li>URL = the webhook URL above. Headers: <code className="bg-white px-1 rounded">X-Webhook-Secret</code> = your secret</li>
                <li>Map the fields below. Create separate Zaps for cancellations and skips.</li>
              </ol>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 pr-3 font-medium">JSON field</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Value / MaidCentral field</th>
                  <th className="text-left py-1.5 font-medium">Required</th>
                </tr>
              </thead>
              <tbody>
                {mcFields.map(f => (
                  <tr key={f.field} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3"><code className="bg-gray-100 px-1 rounded">{f.field}</code></td>
                    <td className="py-1.5 pr-3 text-gray-600">{f.values}</td>
                    <td className="py-1.5">
                      {f.required
                        ? <span className="text-danger font-semibold">Yes</span>
                        : <span className="text-gray-300">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* QuickBooks */}
      <div className="card mb-5 opacity-75">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h2 className="font-semibold text-ink">QuickBooks → Dashboard</h2>
            <p className="text-xs text-gray-400">Marketing, recruiting &amp; training spend — requires OAuth setup</p>
          </div>
          <span className="ml-auto text-xs bg-gray-100 text-gray-500 font-medium px-2 py-1 rounded-full">Coming soon</span>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Until OAuth is live, you can manually post expense data via{' '}
          <code className="bg-gray-100 px-1 rounded">POST /api/webhook/quickbooks</code>{' '}
          with fields: <code className="bg-gray-100 px-1 rounded">month</code>, <code className="bg-gray-100 px-1 rounded">category</code>, <code className="bg-gray-100 px-1 rounded">amount</code>.
        </p>
      </div>

      {/* Live event log */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Live Event Log</h2>
          <span className="text-xs text-gray-400">{events.length} recent events</span>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p className="mb-1">No webhook events received yet.</p>
            <p className="text-xs">Use <strong>Send Test</strong> above to verify your connections, or start sending real events from Zapier.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left py-2 pr-3 font-medium">Source</th>
                  <th className="text-left py-2 px-2 font-medium">Event Type</th>
                  <th className="text-left py-2 px-2 font-medium">Event Date</th>
                  <th className="text-left py-2 pl-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 pr-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SOURCE_COLORS[e.source] || SOURCE_COLORS.test}`}>
                        {SOURCE_LABELS[e.source] || e.source}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono text-xs text-gray-700">{e.event_type}</td>
                    <td className="py-2 px-2 text-gray-500 text-xs">{e.event_date || '—'}</td>
                    <td className="py-2 pl-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString('default', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
