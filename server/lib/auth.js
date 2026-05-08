const crypto = require('crypto')
const db = require('../db')

function getSigningKey() {
  const ws = db.prepare("SELECT value FROM settings WHERE key='webhook_secret'").get()?.value || 'fallback'
  return crypto.createHash('sha256').update(ws + ':session-v1').digest('hex')
}

function makeToken(password) {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  const key = getSigningKey()
  const sig = crypto.createHmac('sha256', key).update(`${password}:${expiry}`).digest('hex')
  return Buffer.from(`${expiry}:${sig}`).toString('base64url')
}

function verifyToken(token) {
  try {
    const stored = db.prepare("SELECT value FROM settings WHERE key='dashboard_password'").get()?.value
    if (!stored || stored.trim() === '') return true // no auth configured
    if (!token) return false

    const decoded = Buffer.from(token, 'base64url').toString()
    const colonIdx = decoded.indexOf(':')
    const expiry = decoded.slice(0, colonIdx)
    const sig = decoded.slice(colonIdx + 1)

    if (Date.now() > parseInt(expiry)) return false

    const key = getSigningKey()
    const expected = crypto.createHmac('sha256', key).update(`${stored}:${expiry}`).digest('hex')
    if (sig.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch { return false }
}

function authMiddleware(req, res, next) {
  // Always allow these paths without a token
  const p = req.path
  if (p.startsWith('/api/auth') || p.startsWith('/api/webhook') || p === '/api/health') return next()

  const stored = db.prepare("SELECT value FROM settings WHERE key='dashboard_password'").get()?.value
  if (!stored || stored.trim() === '') return next() // auth not configured

  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (verifyToken(token)) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

module.exports = { makeToken, verifyToken, authMiddleware }
