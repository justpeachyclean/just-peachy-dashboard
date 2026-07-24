// Background bridge: forward tech-attributed breakages / cancellations / feedback to the
// Employee Journey dashboard's inbox, where they feed the performance Barometer. Fire-and-forget;
// never blocks or breaks the request that triggered it. Configured via env:
//   EMP_DASH_URL           e.g. https://employee-journey-dashboard-production.up.railway.app
//   EMP_DASH_INBOUND_KEY   the inbound API key from that app's Settings → Integrations
const https = require('https')
const http = require('http')
const db = require('../db')

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url) } catch (e) { return reject(e) }
    const lib = u.protocol === 'http:' ? http : https
    const req = lib.request(u, { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } }, r => { r.on('data', () => {}); r.on('end', () => resolve(r.statusCode)) })
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('timeout')))
    req.write(body); req.end()
  })
}

function send(type, rec) {
  const base = process.env.EMP_DASH_URL, key = process.env.EMP_DASH_INBOUND_KEY
  if (!base || !key || !rec.tech) return
  const body = JSON.stringify({ tech: rec.tech, type, date: rec.date || null, client: rec.client || null, note: rec.note || null })
  post(base.replace(/\/+$/, '') + '/api/inbound/incident', { 'Content-Type': 'application/json', 'X-API-Key': key }, body).catch(() => {})
}

// forward a record ONCE (idempotent via a forwarded_at column); skips if no tech attribution
function maybeForward(table, id, type, rec) {
  try {
    if (!rec.tech) return
    const row = db.prepare(`SELECT forwarded_at FROM ${table} WHERE id=?`).get(id)
    if (!row || row.forwarded_at) return
    db.prepare(`UPDATE ${table} SET forwarded_at=datetime('now') WHERE id=?`).run(id)
    send(type, rec)
  } catch (_) {}
}

// One-time catch-up: forward recent, not-yet-forwarded scorecard feedback (with a tech + a
// non-neutral rating) to the Employee dashboard. Bounded to the last 120 days so a big historical
// backlog can't flood it. Idempotent via forwarded_at.
const RECENT_DAYS = 120
function backfillFeedback() {
  try {
    if (!process.env.EMP_DASH_URL || !process.env.EMP_DASH_INBOUND_KEY) return
    const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10)
    const rows = db.prepare(`SELECT id,tech_name,rating,feedback_date,client_name,comment FROM client_feedback
      WHERE forwarded_at IS NULL AND tech_name IS NOT NULL AND tech_name!='' AND rating IS NOT NULL AND rating<>3 AND feedback_date>=? LIMIT 1000`).all(cutoff)
    for (const r of rows) {
      db.prepare("UPDATE client_feedback SET forwarded_at=datetime('now') WHERE id=?").run(r.id)
      send(r.rating >= 4 ? 'praise' : 'complaint', { tech: r.tech_name, date: r.feedback_date, client: r.client_name, note: r.comment })
    }
    if (rows.length) console.log(`↪️  forwarded ${rows.length} scorecard feedbacks to the Employee dashboard`)
  } catch (e) { console.warn('feedback backfill skipped:', e.message) }
}

module.exports = { send, maybeForward, backfillFeedback }
