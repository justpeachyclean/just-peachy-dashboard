const express = require('express')
const router = express.Router()
const db = require('../db')
const CODES = require('../lib/cancellationCodes')

function resolveCode(code) {
  if (!code) return { label: null, category: null }
  const upper = code.toUpperCase().trim().split(/[\s–-]/)[0]
  return CODES[upper] || { label: code, category: 'Other' }
}

function verifySecret(req, res) {
  const secret = db.prepare("SELECT value FROM settings WHERE key='webhook_secret'").get()?.value
  const provided = req.headers['x-webhook-secret']
  if (secret && secret !== 'change-me-before-connecting-zapier' && provided !== secret) {
    res.status(401).json({ error: 'Invalid webhook secret' })
    return false
  }
  return true
}

// Shared frequency → annual visits multiplier
const ANNUAL_VISITS = {
  weekly: 52, biweekly: 26, 'bi-weekly': 26,
  'tri-weekly': 17, 'every 4 weeks': 13, monthly: 13,
}

function calcAnnualFromPrice(price, freq) {
  if (!price || !freq) return null
  const mult = ANNUAL_VISITS[freq.toLowerCase().trim()]
  return mult ? Math.round(parseFloat(price) * mult) : null
}

// POST /api/webhook/ghl
router.post('/ghl', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const {
    event_type,
    contact_id,
    opportunity_id,
    rep_name,
    client_freq,
    event_date,
  } = payload

  if (!event_type) return res.status(400).json({ error: 'event_type required' })

  const eDate = event_date ?? new Date().toISOString().split('T')[0]

  db.prepare(`
    INSERT INTO ghl_events (event_type, contact_id, opportunity_id, rep_name, client_freq, event_date, raw_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event_type,
    contact_id ?? null,
    opportunity_id ?? null,
    rep_name ?? null,
    client_freq ?? null,
    eDate,
    JSON.stringify(payload)
  )

  // Auto-populate lead_records from GHL events.
  // Use opportunity_id as the dedup key (preferred over contact_id) so returning
  // clients who already exist in GHL get a NEW lead record for each new opportunity.
  const clientName = payload.client_name || contact_id || null
  const month = eDate.slice(0, 7)
  const extId = opportunity_id ?? contact_id ?? null
  const usedBefore = payload.used_before ?? null  // pass 'Yes'/'No' from GHL custom field

  const NEW_LEAD_TYPES = ['new_lead', 'lead_in', 'lead_inquiry']
  const QUOTE_TYPES    = ['quote_sent', 'lead_quoted', 'quote_updated', 'opportunity_updated']
  const WON_TYPES      = ['opportunity_won', 'lead_closed', 'lead_converted']
  const LOST_TYPES     = ['opportunity_lost', 'lead_lost']

  // Helper: update price on a lead, trying external_id first then client_name fallback
  const price = payload.price ?? payload.quote_amount ?? payload.amount ?? null
  function applyPrice(whereExtId) {
    if (price == null) return
    const p = parseFloat(price)
    if (whereExtId) {
      const updated = db.prepare(
        `UPDATE lead_records SET price_per_clean = ?, quote_amount = ? WHERE external_id = ?`
      ).run(p, p, whereExtId)
      if (updated.changes > 0) return
    }
    // Fallback: match by client name in the same month (most recent record)
    if (clientName) {
      db.prepare(`
        UPDATE lead_records SET price_per_clean = ?, quote_amount = ?
        WHERE id = (
          SELECT id FROM lead_records
          WHERE LOWER(client_name) = LOWER(?) AND (price_per_clean IS NULL OR price_per_clean = 0)
          ORDER BY record_date DESC LIMIT 1
        )
      `).run(p, p, clientName)
    }
  }

  // Find or create a lead record, deduplicating by external_id first, then name+month.
  // GHL fires multiple events per contact (new_lead, quote_sent, opportunity_won) with
  // different external_ids — this prevents each event from creating a separate row.
  const findOrCreateLead = () => {
    // 1. Exact match by extId (opportunity_id if present, else contact_id)
    if (extId) {
      const existing = db.prepare('SELECT id FROM lead_records WHERE external_id = ?').get(extId)
      if (existing) return existing.id
    }
    // 1.5. When this event has an opportunity_id (extId = opportunity_id), also try matching
    //      by contact_id — handles records created by new_lead events (which have no
    //      opportunity_id, so they store contact_id as external_id).
    if (opportunity_id && contact_id) {
      const existing = db.prepare('SELECT id FROM lead_records WHERE external_id = ?').get(contact_id)
      if (existing) {
        db.prepare(`
          UPDATE lead_records SET
            external_id   = COALESCE(external_id, ?),
            client_name   = CASE WHEN client_name = ? THEN COALESCE(?, client_name) ELSE COALESCE(client_name, ?) END,
            frequency     = COALESCE(frequency, ?),
            rep_name      = COALESCE(rep_name, ?),
            used_before   = COALESCE(used_before, ?)
          WHERE id = ?
        `).run(opportunity_id, contact_id, clientName, clientName, client_freq ?? null, rep_name ?? 'Lexi Ledom', usedBefore ?? null, existing.id)
        return existing.id
      }
    }
    // 2. Match by name + month (same person, different GHL event external_id)
    if (clientName) {
      const existing = db.prepare(
        'SELECT id FROM lead_records WHERE LOWER(TRIM(client_name)) = LOWER(TRIM(?)) AND month = ? ORDER BY id DESC LIMIT 1'
      ).get(clientName, month)
      if (existing) {
        db.prepare(`
          UPDATE lead_records SET
            external_id   = COALESCE(external_id, ?),
            frequency     = COALESCE(frequency, ?),
            rep_name      = COALESCE(rep_name, ?),
            used_before   = COALESCE(used_before, ?)
          WHERE id = ?
        `).run(extId ?? null, client_freq ?? null, rep_name ?? 'Lexi Ledom', usedBefore ?? null, existing.id)
        return existing.id
      }
    }
    // 3. Insert new record
    db.prepare(`
      INSERT INTO lead_records
        (record_date, client_name, rep_name, frequency, month, converted, source, external_id, used_before)
      VALUES (?, ?, ?, ?, ?, 0, 'ghl', ?, ?)
    `).run(eDate, clientName, rep_name ?? 'Lexi Ledom', client_freq ?? null, month, extId, usedBefore)
    return db.prepare('SELECT last_insert_rowid() AS id').get().id
  }

  if (NEW_LEAD_TYPES.includes(event_type)) {
    findOrCreateLead()
    applyPrice(extId)

  } else if (QUOTE_TYPES.includes(event_type)) {
    findOrCreateLead()
    applyPrice(extId)

  } else if (WON_TYPES.includes(event_type)) {
    findOrCreateLead()
    applyPrice(extId)

    if (extId) {
      db.prepare(`
        UPDATE lead_records SET
          converted = 1,
          recurring_retained = CASE WHEN LOWER(COALESCE(frequency,'')) NOT IN ('one_type','one-time','one time','') THEN 1 ELSE 0 END
        WHERE external_id = ?
      `).run(extId)
      // Compute and store annual_value now that we have price + frequency
      const lead = db.prepare('SELECT price_per_clean, frequency FROM lead_records WHERE external_id = ?').get(extId)
      if (lead) {
        const av = calcAnnualFromPrice(lead.price_per_clean, lead.frequency)
        if (av) db.prepare('UPDATE lead_records SET annual_value = ? WHERE external_id = ?').run(av, extId)
      }
    } else if (clientName) {
      // Fallback: match by name if no external_id
      db.prepare(`
        UPDATE lead_records SET converted = 1,
          recurring_retained = CASE WHEN LOWER(COALESCE(frequency,'')) NOT IN ('one_type','one-time','one time','') THEN 1 ELSE 0 END
        WHERE id = (SELECT id FROM lead_records WHERE LOWER(client_name) = LOWER(?) ORDER BY record_date DESC LIMIT 1)
      `).run(clientName)
      const lead = db.prepare(`SELECT id, price_per_clean, frequency FROM lead_records WHERE LOWER(client_name) = LOWER(?) ORDER BY record_date DESC LIMIT 1`).get(clientName)
      if (lead) {
        const av = calcAnnualFromPrice(lead.price_per_clean, lead.frequency)
        if (av) db.prepare('UPDATE lead_records SET annual_value = ? WHERE id = ?').run(av, lead.id)
      }
    }

  } else if (LOST_TYPES.includes(event_type)) {
    if (extId) {
      db.prepare(`UPDATE lead_records SET converted = 0 WHERE external_id = ?`).run(extId)
    }
  }

  res.json({ ok: true })
})

// POST /api/webhook/maidcentral
router.post('/maidcentral', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const { event_type, client_id, amount, event_date, client_count, date, total_revenue, job_count, recurring_clients } = payload

  if (!event_type) return res.status(400).json({ error: 'event_type required' })

  const eDate = event_date ?? date ?? new Date().toISOString().split('T')[0]

  // revenue_override: directly set invoice_revenue for a month (bypasses event accumulation)
  // POST { event_type: "revenue_override", amount: 57304.94, event_date: "2026-05-14" }
  if (event_type === 'revenue_override') {
    const month  = eDate.slice(0, 7)
    const newRev = parseFloat(amount ?? 0)
    if (isNaN(newRev) || newRev < 0) return res.status(400).json({ error: 'valid amount required' })
    db.prepare(`
      INSERT INTO monthly_sales (month, invoice_revenue) VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET invoice_revenue = excluded.invoice_revenue, updated_at = datetime('now')
    `).run(month, newRev)
    return res.json({ ok: true, month, invoice_revenue: newRev })
  }

  // invoice_created: dedup by invoice_id, skip generic maidcentral_events insert below
  if (event_type === 'invoice_created') {
    const invoiceId   = payload.invoice_id ?? null
    const tipAmount   = parseFloat(payload.tip_amount ?? payload.tip ?? 0) || 0
    const grossAmount = parseFloat(amount ?? 0)
    const netAmount   = Math.max(0, grossAmount - tipAmount)
    const month       = eDate.slice(0, 7)

    // Require invoice_id for dedup — reject events without one to prevent accumulation bugs
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoice_id required for invoice_created events' })
    }

    // Store individual invoice — INSERT OR IGNORE deduplicates by invoice_id
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO maidcentral_events (event_type, client_id, amount, event_date, external_id, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('invoice_created', client_id ?? null, netAmount, eDate, invoiceId, JSON.stringify(payload))

    if (inserted.changes > 0) {
      // Recompute the full month's invoice total and set it on monthly_sales
      const monthTotal = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM maidcentral_events WHERE event_type='invoice_created'
          AND event_date BETWEEN ? AND ?
      `).get(`${month}-01`, `${month}-31`)
      db.prepare(`
        INSERT INTO monthly_sales (month, invoice_revenue) VALUES (?, ?)
        ON CONFLICT(month) DO UPDATE SET invoice_revenue = excluded.invoice_revenue, updated_at = datetime('now')
      `).run(month, monthTotal.total)
    }

    return res.json({ ok: true, net_amount: netAmount, duplicate: inserted.changes === 0 })
  }

  db.prepare(`
    INSERT INTO maidcentral_events (event_type, client_id, amount, event_date, raw_payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    event_type,
    client_id ?? null,
    amount ?? null,
    eDate,
    JSON.stringify(payload)
  )

  const month = eDate.slice(0, 7)

  // job_completed: MC sends "Customer Total Revenue" (cumulative lifetime), NOT per-job invoice.
  // Accumulating it causes massive revenue inflation. Intentionally a no-op — use
  // revenue_override or the Sales & Leads manual form to set monthly revenue instead.

  if (event_type === 'recurring_client_snapshot' && client_count != null) {
    const snapCount = parseInt(client_count)
    db.prepare(`
      UPDATE monthly_sales SET recurring_clients = ? WHERE month = ?
    `).run(snapCount, month)
    // Keep the global "current" count in sync
    db.prepare(`UPDATE settings SET value=? WHERE key='recurring_clients_current'`).run(String(snapCount))
  }

  if (event_type === 'daily_revenue_summary') {
    // total_revenue is a cumulative MTD snapshot — upsert so it sets (not adds) the month total
    const rev = total_revenue != null ? parseFloat(total_revenue) : null
    if (rev != null && rev > 0) {
      db.prepare(`
        INSERT INTO monthly_sales (month, revenue) VALUES (?, ?)
        ON CONFLICT(month) DO UPDATE SET revenue = excluded.revenue, updated_at = datetime('now')
      `).run(month, rev)
    }
  }

  res.json({ ok: true })
})

// POST /api/webhook/cancellation  — MC client cancelled
router.post('/cancellation', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const {
    client_id, client_name, cancel_date, reason_code,
    client_quote, save_attempted, save_outcome, solution_offered,
    frequency, recurring_months, revenue_lost_monthly,
    price_per_visit,
    tech_name, technician,  // assigned technician (MC may send either field name)
    last_cleaner, last_clean_date, last_clean,  // last service info
    mc_client_id,  // MC's own ID for deduplication
  } = payload
  const techValue    = technician || tech_name || null
  const lastCleanVal = last_clean_date || last_clean || null
  const mcIdVal      = mc_client_id || client_id || null

  const date = cancel_date || new Date().toISOString().split('T')[0]
  const { label, category } = resolveCode(reason_code)

  // Auto-calculate annual_value_lost: prefer price × freq, fall back to monthly × 12
  const annualFromPpv = calcAnnualFromPrice(price_per_visit, frequency)
  const annualFromMonthly = revenue_lost_monthly ? Math.round(parseFloat(revenue_lost_monthly) * 12) : null
  const annualValueLost = annualFromPpv ?? annualFromMonthly ?? null

  const result = db.prepare(`
    INSERT INTO cancelled_clients
      (client_id, mc_client_id, client_name, cancel_date, reason_code, reason_label, reason_category,
       client_quote, save_attempted, save_outcome, solution_offered,
       frequency, recurring_months, revenue_lost_monthly, price_per_visit, annual_value_lost,
       technician, last_cleaner, last_clean_date, source, raw_payload)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'webhook',?)
  `).run(
    mcIdVal, mcIdVal, client_name ?? null, date,
    reason_code ?? null, label, category,
    client_quote ?? null,
    save_attempted ? 1 : 0,
    save_outcome ?? null, solution_offered ?? null,
    frequency ?? null,
    recurring_months ? parseInt(recurring_months) : null,
    revenue_lost_monthly ? parseFloat(revenue_lost_monthly) : null,
    price_per_visit ? parseFloat(price_per_visit) : null,
    annualValueLost,
    techValue,
    last_cleaner ?? null,
    lastCleanVal,
    JSON.stringify(payload)
  )

  // Auto-increment cancellations count in monthly_sales for this month
  const cancelMonth = date.slice(0, 7)
  db.prepare(`
    INSERT INTO monthly_sales (month, cancellations) VALUES (?, 1)
    ON CONFLICT(month) DO UPDATE SET cancellations = COALESCE(cancellations, 0) + 1, updated_at = datetime('now')
  `).run(cancelMonth)

  // Auto-queue T-coded clients for nurture
  if (reason_code && reason_code.toUpperCase().startsWith('T')) {
    const next30 = new Date()
    next30.setDate(next30.getDate() + 30)
    db.prepare(`
      INSERT OR IGNORE INTO client_nurture
        (cancelled_id, client_id, client_name, reason_code, cancel_date, next_contact)
      VALUES (?,?,?,?,?,?)
    `).run(
      result.lastInsertRowid,
      client_id ?? null, client_name ?? null,
      reason_code, date,
      next30.toISOString().split('T')[0]
    )
  }

  res.json({ ok: true, id: result.lastInsertRowid })
})

// POST|PATCH /api/webhook/cancellation-update  — Zap 2: Google Sheet row updated → sync detail fields
// Matches on client_name (case-insensitive); updates most-recent matching record
// Fields: technician (Assigned Cleaner), reason_code, reason_label, price_per_visit (Revenue),
//         last_cleaner, last_clean_date, cancel_date (Date from sheet)
// Accepts both POST (Zapier Webhooks default) and PATCH
function handleCancellationUpdate(req, res) {
  if (!verifySecret(req, res)) return

  const {
    client_name, cancel_date,
    technician, assigned_cleaner,
    reason_code, reason,
    price_per_visit, revenue,
    last_cleaner, last_clean_date, last_clean,
    frequency,
  } = req.body

  if (!client_name) return res.status(400).json({ error: 'client_name required' })

  const techValue     = technician || assigned_cleaner || null
  const priceValue    = price_per_visit || revenue || null
  const lastCleanVal  = last_clean_date || last_clean || null
  const codeToUse     = reason_code || null
  const { label, category } = resolveCode(codeToUse)

  // Find the most recent matching record
  const existing = db.prepare(`
    SELECT id, cancel_date FROM cancelled_clients
    WHERE LOWER(TRIM(client_name)) = LOWER(TRIM(?))
    ORDER BY id DESC LIMIT 1
  `).get(client_name)

  if (!existing) return res.status(200).json({ ok: false, skipped: true, reason: 'no_record', client_name })

  db.prepare(`
    UPDATE cancelled_clients SET
      cancel_date          = COALESCE(?, cancel_date),
      reason_code          = CASE WHEN ? IS NOT NULL THEN ? ELSE reason_code END,
      reason_label         = CASE WHEN ? IS NOT NULL THEN ? ELSE reason_label END,
      reason_category      = CASE WHEN ? IS NOT NULL THEN ? ELSE reason_category END,
      technician           = COALESCE(?, technician),
      last_cleaner         = COALESCE(?, last_cleaner),
      last_clean_date      = COALESCE(?, last_clean_date),
      price_per_visit      = COALESCE(?, price_per_visit),
      frequency            = COALESCE(?, frequency)
    WHERE id = ?
  `).run(
    cancel_date ?? null,
    codeToUse, codeToUse,          // reason_code: WHEN condition, THEN value
    codeToUse, label,              // reason_label: WHEN condition, THEN value
    codeToUse, category,           // reason_category: WHEN condition, THEN value
    techValue,
    last_cleaner ?? null,
    lastCleanVal,
    priceValue ? parseFloat(priceValue) : null,
    frequency ?? null,
    existing.id
  )

  // Recalculate annual value if price changed
  if (priceValue) {
    const row = db.prepare('SELECT price_per_visit, frequency, annual_value_lost FROM cancelled_clients WHERE id=?').get(existing.id)
    const annual = calcAnnualFromPrice(row.price_per_visit, row.frequency)
    if (annual) db.prepare('UPDATE cancelled_clients SET annual_value_lost=? WHERE id=?').run(annual, existing.id)
  }

  res.json({ ok: true, id: existing.id, client_name })
}
router.post('/cancellation-update', handleCancellationUpdate)
router.patch('/cancellation-update', handleCancellationUpdate)

// POST /api/webhook/feedback  — MC review / scorecard / survey
router.post('/feedback', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const { client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name } = payload

  db.prepare(`
    INSERT INTO client_feedback
      (client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name, source, raw_payload)
    VALUES (?,?,?,?,?,?,?,'webhook',?)
  `).run(
    client_id ?? null, client_name ?? null,
    feedback_date || new Date().toISOString().split('T')[0],
    rating ? parseInt(rating) : null,
    feedback_type || 'survey',
    comment ?? null, tech_name ?? null,
    JSON.stringify(payload)
  )

  res.json({ ok: true })
})

// POST /api/webhook/mc-lead  — MaidCentral "Lead Created" Zapier trigger
// MC field names: GivenName, FamilyName, CrmId, LeadDate, Phone, Email, LeadSource
router.post('/mc-lead', (req, res) => {
  if (!verifySecret(req, res)) return

  const p = req.body
  const firstName  = p.GivenName  || p.given_name  || p.first_name  || ''
  const lastName   = p.FamilyName || p.family_name || p.last_name   || ''
  const clientName = [firstName, lastName].filter(Boolean).join(' ').trim() || p.client_name || p.name || null
  const crmId      = p.CrmId      || p.crm_id      || p.lead_id     || p.external_id || null
  const rawDate    = p.LeadDate   || p.lead_date   || p.created_date || p.record_date || null

  // Normalise date: M/D/YYYY or YYYY-MM-DD → YYYY-MM-DD
  let eDate = new Date().toISOString().split('T')[0]
  if (rawDate) {
    const mdy = String(rawDate).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (mdy) eDate = `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
    else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) eDate = String(rawDate).slice(0, 10)
  }

  const month = eDate.slice(0, 7)

  db.prepare(`
    INSERT OR IGNORE INTO lead_records
      (record_date, client_name, rep_name, month, converted, source, external_id)
    VALUES (?, ?, 'Lexi Ledom', ?, 0, 'maidcentral', ?)
  `).run(eDate, clientName, month, crmId)

  res.json({ ok: true, client_name: clientName, record_date: eDate })
})

// POST /api/webhook/mc-lead-converted  — MaidCentral "Lead Closed" Zapier trigger
// Updates an existing lead record as converted/retained
router.post('/mc-lead-converted', (req, res) => {
  if (!verifySecret(req, res)) return

  const p = req.body
  const crmId = req.query.crm_id || p.CrmId || p.crm_id || p.lead_id || p.external_id || null
  const converted = p.converted !== undefined ? Number(p.converted) : 1
  const recurring_retained = p.recurring_retained !== undefined ? Number(p.recurring_retained) : 1

  if (!crmId) return res.status(400).json({ error: 'crm_id required' })

  const updated = db.prepare(`
    UPDATE lead_records SET converted = ?, recurring_retained = ?
    WHERE external_id = ?
  `).run(converted, recurring_retained, crmId)

  if (updated.changes === 0) {
    // Lead not found by external_id — return 200 but flag it
    return res.json({ ok: true, updated: 0, note: 'no matching lead found for crm_id' })
  }

  audit({ user: { username: 'zapier' } }, 'lead_converted', `Lead converted via webhook: ${crmId}`)
  res.json({ ok: true, updated: updated.changes, crm_id: crmId })
})

// POST /api/webhook/test  — sends a test event to verify the connection
router.post('/test', (req, res) => {
  if (!verifySecret(req, res)) return
  const { source = 'test' } = req.body
  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description, user) VALUES ('webhook_test', ?, 'Test ping received', 'zapier')`
  ).run(source)
  res.json({ ok: true, received_at: new Date().toISOString() })
})

// GET /api/webhook/events  — recent webhook events for the event log
router.get('/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100)

  const ghl = db.prepare(
    `SELECT 'ghl' AS source, event_type, event_date, created_at, contact_id AS ref_id FROM ghl_events ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const mc = db.prepare(
    `SELECT 'maidcentral' AS source, event_type, event_date, created_at, client_id AS ref_id FROM maidcentral_events ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const qb = db.prepare(
    `SELECT 'quickbooks' AS source, category AS event_type, month AS event_date, synced_at AS created_at, NULL AS ref_id FROM quickbooks_expenses ORDER BY id DESC LIMIT ?`
  ).all(limit)

  const all = [...ghl, ...mc, ...qb]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)

  const counts = {
    ghl: db.prepare('SELECT COUNT(*) AS n FROM ghl_events').get().n,
    maidcentral: db.prepare('SELECT COUNT(*) AS n FROM maidcentral_events').get().n,
    quickbooks: db.prepare('SELECT COUNT(*) AS n FROM quickbooks_expenses').get().n,
    cancellations: db.prepare("SELECT COUNT(*) AS n FROM cancelled_clients WHERE source='webhook'").get().n,
    feedback: db.prepare("SELECT COUNT(*) AS n FROM client_feedback WHERE source='webhook'").get().n,
  }

  res.json({ events: all, counts })
})

// POST /api/webhook/quickbooks  (also available as nightly pull — see cron)
router.post('/quickbooks', (req, res) => {
  if (!verifySecret(req, res)) return

  const { month, category, amount } = req.body
  if (!month || !category) return res.status(400).json({ error: 'month and category required' })

  db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(month, category) DO UPDATE SET amount=excluded.amount, synced_at=datetime('now')
  `).run(month, category, amount ?? 0)

  res.json({ ok: true })
})

// POST /api/webhook/seed-historical  — one-time import of historical data on production
router.post('/seed-historical', (req, res) => {
  if (!verifySecret(req, res)) return

  const results = { cancellations: 0, feedback: 0, expenses: 0, nurture: 0 }

  // ── QB expenses ──────────────────────────────────────────────────────────
  const ANNUAL = [
    { year: 2024, months: 12, marketing: 87183,  recruiting: 4685  },
    { year: 2025, months: 12, marketing: 137003, recruiting: 7402  },
    { year: 2026, months: 5,  marketing: 55725,  recruiting: 3927  },
  ]
  const upsertExp = db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(month, category) DO UPDATE SET amount=excluded.amount, synced_at=datetime('now')
  `)
  const expTx = db.transaction(() => {
    for (const { year, months, marketing, recruiting } of ANNUAL) {
      const mkt = Math.round((marketing  / months) * 100) / 100
      const rec = Math.round((recruiting / months) * 100) / 100
      for (let m = 1; m <= months; m++) {
        const month = `${year}-${String(m).padStart(2, '0')}`
        upsertExp.run(month, 'Marketing',  mkt)
        upsertExp.run(month, 'Recruiting', rec)
        results.expenses += 2
      }
    }
  })
  expTx()

  // Update settings to match
  db.prepare(`UPDATE settings SET value='Marketing'  WHERE key='qb_marketing_category'`).run()
  db.prepare(`UPDATE settings SET value='Recruiting' WHERE key='qb_recruiting_category'`).run()

  // ── Cancellations from embedded data ─────────────────────────────────────
  const FEEDBACK_DATA = [{"n":"Abby Shah","d":"2024-05-03","r":3},{"n":"Alexandra Tecce","d":"2024-04-15","r":4},{"n":"Amanda Benson","d":"2024-06-03","r":4},{"n":"Amelia West","d":"2024-05-08","r":4},{"n":"Amelia West","d":"2024-05-08","r":4},{"n":"Amy Robosky","d":"2024-03-22","r":4},{"n":"Angela Norris","d":"2024-08-22","r":4},{"n":"Ann McClure","d":"2024-06-27","r":3},{"n":"Ann Waidner","d":"2024-03-13","r":4},{"n":"Anna De La Torriente","d":"2024-06-27","r":3},{"n":"Barbara  Begley","d":"2024-08-16","r":4},{"n":"Barbara Fleming","d":"2024-04-22","r":4},{"n":"Beccy Schulze","d":"2024-07-18","r":4},{"n":"Bev Surrette","d":"2024-04-25","r":4},{"n":"Bev Surrette","d":"2024-06-06","r":4},{"n":"BG Sims","d":"2024-03-11","r":4},{"n":"Brienne Meinberg","d":"2024-05-21","r":4},{"n":"Carolina Gullo","d":"2024-02-13","r":4},{"n":"Caroline Atwell","d":"2024-07-08","r":3},{"n":"Cathy  Wood","d":"2024-03-05","r":4},{"n":"Chelsea Nataupsky","d":"2024-06-07","r":4},{"n":"Chris Shaw","d":"2024-06-25","r":4},{"n":"Christy Molina","d":"2024-01-17","r":4},{"n":"Cristen Coker","d":"2024-07-16","r":4},{"n":"Dana Ford","d":"2024-02-13","r":4},{"n":"David Pierce","d":"2024-01-24","r":4},{"n":"Debbie Chislo","d":"2024-07-15","r":4},{"n":"Delores Chapman","d":"2024-02-28","r":4},{"n":"Drema Bozich","d":"2024-07-16","r":4},{"n":"Ellen Yeaser","d":"2024-04-22","r":4},{"n":"Eric Boyle","d":"2024-06-05","r":4},{"n":"Faith Stainbrook","d":"2024-07-08","r":4},{"n":"Haley Stephens","d":"2024-05-13","r":4},{"n":"Holly Kotarski","d":"2024-08-19","r":4},{"n":"Jacquelyn Bennett","d":"2024-08-06","r":4},{"n":"Jamie Bailey","d":"2024-05-20","r":4},{"n":"Jane Katona","d":"2024-01-23","r":4},{"n":"Janet Lofquist","d":"2024-02-28","r":4},{"n":"Janet Lofquist","d":"2024-04-24","r":4},{"n":"Jay Murray","d":"2024-09-11","r":4},{"n":"Jean Gardner","d":"2024-07-25","r":4},{"n":"Jeanette  Goeden","d":"2024-04-04","r":4},{"n":"Jennifer Anderson","d":"2024-04-09","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-03-13","r":4},{"n":"Jennifer Arett","d":"2024-08-29","r":4},{"n":"Jenny Tacner","d":"2024-05-17","r":4},{"n":"Jessica Daly","d":"2024-08-29","r":4},{"n":"Joe Norwood","d":"2024-06-25","r":4},{"n":"John Hinton","d":"2024-06-03","r":4},{"n":"Joy Hale","d":"2024-07-09","r":3},{"n":"Joyce  Reynolds","d":"2024-06-05","r":4},{"n":"Joyce Holnquist","d":"2024-06-18","r":4},{"n":"Judy  Lampe","d":"2024-08-21","r":3},{"n":"Julie Graham","d":"2024-05-06","r":4},{"n":"Julie Moynihan","d":"2024-04-17","r":4},{"n":"Julie Shinew","d":"2024-08-28","r":4},{"n":"Kandi Schromm","d":"2024-07-26","r":4},{"n":"KAREN Brunetti","d":"2024-04-11","r":4},{"n":"Kayla Whittredge","d":"2024-03-18","r":4},{"n":"Kelly Bowman","d":"2024-02-16","r":4},{"n":"Kenneth Witcher","d":"2024-06-19","r":4},{"n":"Kylie Dawes","d":"2024-09-11","r":4},{"n":"Lane Gauntt","d":"2024-04-18","r":4},{"n":"Laura Thomas","d":"2024-07-22","r":4},{"n":"Lesley Coffrin","d":"2024-05-20","r":4},{"n":"Lynn Rosler","d":"2024-04-29","r":3},{"n":"Maria Moreno","d":"2024-08-06","r":4},{"n":"Marissa Greathouse","d":"2024-01-08","r":4},{"n":"Melissa Nangle","d":"2024-02-19","r":4},{"n":"Michelle Purvis","d":"2024-08-06","r":4},{"n":"Nancy Miller","d":"2024-02-21","r":4},{"n":"Nate &amp; Shannon Handlin","d":"2024-01-17","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-05-06","r":4},{"n":"Nathan Henwood","d":"2024-07-23","r":4},{"n":"Nelson Cambata","d":"2024-08-20","r":4},{"n":"Norina Burt","d":"2024-09-04","r":4},{"n":"Patricia McElwee","d":"2024-01-22","r":4},{"n":"Rosanne Lamb","d":"2024-04-01","r":4},{"n":"Rosanne Lamb","d":"2024-05-13","r":4},{"n":"Ryan Witt","d":"2024-09-09","r":4},{"n":"Sam Wallace","d":"2024-02-27","r":4},{"n":"Sam Wallace","d":"2024-05-03","r":4},{"n":"Samantha Henshaw","d":"2024-07-08","r":3},{"n":"Shelly Studley","d":"2024-05-15","r":4},{"n":"Tabatha Rash","d":"2024-07-29","r":4},{"n":"The Greenery","d":"2024-08-01","r":4},{"n":"Tom McCloskey","d":"2024-03-07","r":4},{"n":"Tracie Padgett","d":"2024-01-03","r":3}]
  const CANCELLATION_DATA = [{"n":"Kayley White","d":"2024-01-03","c":"O4","f":"biweekly","r":326},{"n":"Stephani Widmer","d":"2024-01-03","c":"O4","f":"monthly","r":239},{"n":"Tracie Padgett","d":"2024-01-03","c":"L1","f":"monthly","r":160},{"n":"Marissa Greathouse","d":"2024-01-08","c":"P1","f":"biweekly","r":480},{"n":"Christy Molina","d":"2024-01-17","c":"O4","f":"biweekly","r":310},{"n":"Nate &amp; Shannon Handlin","d":"2024-01-17","c":"O4","f":"biweekly","r":395},{"n":"Brianna Livingston","d":"2024-01-18","c":"O4","f":"monthly","r":194},{"n":"Patricia McElwee","d":"2024-01-22","c":"O4","f":"monthly","r":194},{"n":"Jane Katona","d":"2024-01-23","c":"O4","f":"biweekly","r":326},{"n":"David Pierce","d":"2024-01-24","c":"O4","f":"biweekly","r":564},{"n":"Bill Howell","d":"2024-02-13","c":"O4","f":"one_time"},{"n":"Carolina Gullo","d":"2024-02-13","c":"L1","f":"biweekly","r":260},{"n":"Dana Ford","d":"2024-02-13","c":"O4","f":"biweekly","r":423},{"n":"Kristi Brown","d":"2024-02-13","c":"P1","f":"monthly","r":182},{"n":"Kelly Bowman","d":"2024-02-16","c":"O4","f":"biweekly","r":585},{"n":"Melissa Nangle","d":"2024-02-19","c":"O4","f":"biweekly","r":286},{"n":"Nancy Miller","d":"2024-02-21","c":"P1","f":"monthly","r":202},{"n":"Tina Borel","d":"2024-02-22","c":"P1","f":"monthly","r":169},{"n":"Ruth/Roger Vaughn","d":"2024-02-26","c":"O4","f":"one_time"},{"n":"Robin Socha","d":"2024-02-27","c":"O4","f":"one_time"},{"n":"Sam Wallace","d":"2024-02-27","c":"L1","f":"monthly","r":175},{"n":"Delores Chapman","d":"2024-02-28","c":"P1","f":"biweekly","r":417},{"n":"Janet Lofquist","d":"2024-02-28","c":"L1","f":"biweekly","r":193},{"n":"Jennifer Chan","d":"2024-03-01","c":"O5","f":"biweekly","r":775},{"n":"Cathy  Wood","d":"2024-03-05","c":"L1","f":"monthly","r":144},{"n":"Charlene La Barge","d":"2024-03-05","c":"O5","f":"one_time"},{"n":"Jan Dick","d":"2024-03-06","c":"O5","f":"one_time"},{"n":"Tom McCloskey","d":"2024-03-07","c":"O4","f":"monthly","r":179},{"n":"BG Sims","d":"2024-03-11","c":"O5","f":"one_time"},{"n":"Kristine  Veale ","d":"2024-03-11","c":"O4","f":"one_time"},{"n":"Michelle Walker","d":"2024-03-11","c":"O5","f":"one_time"},{"n":"Susan Allen","d":"2024-03-12","c":"O4","f":"monthly","r":191},{"n":"Ann Waidner","d":"2024-03-13","c":"P1","f":"biweekly","r":389},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O4","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"biweekly","r":355},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Jennifer Arett","d":"2024-03-13","c":"O5","f":"weekly","r":585},{"n":"Kayla Whittredge","d":"2024-03-18","c":"P2","f":"monthly","r":224},{"n":"Amy Robosky","d":"2024-03-22","c":"L1","f":"biweekly","r":389},{"n":"Dorene Taylor","d":"2024-03-22","c":"P1","f":"biweekly","r":282},{"n":"Jennifer Chan","d":"2024-03-25","c":"Q2","f":"biweekly","r":775},{"n":"Denise McCullough","d":"2024-03-26","c":"C2","f":"one_time"},{"n":"Rosanne Lamb","d":"2024-04-01","c":"L1","f":"biweekly","r":328},{"n":"Kimberly Smith","d":"2024-04-02","c":"L1","f":"monthly","r":191},{"n":"Stephanie Sweet","d":"2024-04-02","c":"O4","f":"monthly","r":191},{"n":"Bridget  Diefendorf ","d":"2024-04-03","c":"P1","f":"biweekly","r":370},{"n":"Lavonda West","d":"2024-04-03","c":"L1","f":"monthly","r":191},{"n":"Jeanette  Goeden","d":"2024-04-04","c":"Q2","f":"monthly","r":284},{"n":"Amber Leigh","d":"2024-04-09","c":"O5","f":"weekly","r":440},{"n":"Jennifer Anderson","d":"2024-04-09","c":"P1","f":"biweekly","r":361},{"n":"Connie Royer","d":"2024-04-10","c":"O4","f":"biweekly","r":451},{"n":"Sue Johnson","d":"2024-04-10","c":"P1","f":"one_time"},{"n":"KAREN Brunetti","d":"2024-04-11","c":"P1","f":"biweekly","r":688},{"n":"Alexandra Tecce","d":"2024-04-15","c":"O5","f":"biweekly","r":339},{"n":"Pat Mcclellan","d":"2024-04-15","c":"O5","f":"weekly","r":714},{"n":"Pat Mcclellan","d":"2024-04-16","c":"P1","f":"weekly","r":563},{"n":"Julie Moynihan","d":"2024-04-17","c":"O5","f":"biweekly","r":282},{"n":"Lane Gauntt","d":"2024-04-18","c":"O5","f":"biweekly","r":355},{"n":"Michelle Costello","d":"2024-04-18","c":"O5","f":"one_time"},{"n":"Michelle Costello","d":"2024-04-18","c":"O4","f":"one_time"},{"n":"Pat Mcclellan","d":"2024-04-19","c":"P1","f":"monthly","r":191},{"n":"Barbara Fleming","d":"2024-04-22","c":"P3","f":"monthly","r":179},{"n":"Ellen Yeaser","d":"2024-04-22","c":"O5","f":"monthly","r":179},{"n":"Haley Stephens","d":"2024-04-24","c":"O4","f":"weekly","r":585},{"n":"Janet Lofquist","d":"2024-04-24","c":"O4","f":"biweekly","r":193},{"n":"Bev Surrette","d":"2024-04-25","c":"O4","f":"monthly","r":224},{"n":"Tiffany  Jackson","d":"2024-04-25","c":"P4","f":"one_time"},{"n":"Tiffany  Jackson","d":"2024-04-26","c":"O4","f":"biweekly","r":349},{"n":"Linda Laprade","d":"2024-04-29","c":"P3","f":"biweekly","r":349},{"n":"Lynn Rosler","d":"2024-04-29","c":"O5","f":"monthly","r":182},{"n":"Ryan .","d":"2024-04-30","c":"O4","f":"biweekly","r":319},{"n":"Abby Shah","d":"2024-05-03","c":"P3","f":"monthly","r":209},{"n":"Sam Wallace","d":"2024-05-03","c":"L1","f":"monthly","r":175},{"n":"Dorene Taylor","d":"2024-05-06","c":"O4","f":"biweekly","r":315},{"n":"Julie Graham","d":"2024-05-06","c":"P1","f":"one_time"},{"n":"Nathan Henwood","d":"2024-05-06","c":"O4","f":"biweekly","r":337},{"n":"Nathan Henwood","d":"2024-05-06","c":"O4","f":"biweekly","r":337},{"n":"Nathan Henwood","d":"2024-05-06","c":"P1","f":"biweekly","r":337},{"n":"Amelia West","d":"2024-05-08","c":"O4","f":"biweekly","r":395},{"n":"Amelia West","d":"2024-05-08","c":"O4","f":"biweekly","r":395},{"n":"Haley Stephens","d":"2024-05-13","c":"O4","f":"biweekly","r":349},{"n":"Rosanne Lamb","d":"2024-05-13","c":"O5","f":"one_time"},{"n":"Diane Kallman","d":"2024-05-15","c":"O4","f":"biweekly","r":349},{"n":"Shelly Studley","d":"2024-05-15","c":"O4","f":"monthly","r":156},{"n":"Jenny Tacner","d":"2024-05-17","c":"O4","f":"one_time"},{"n":"Jamie Bailey","d":"2024-05-20","c":"P1","f":"biweekly","r":399},{"n":"Lesley Coffrin","d":"2024-05-20","c":"P1","f":"monthly","r":175},{"n":"Brienne Meinberg","d":"2024-05-21","c":"L1","f":"monthly","r":191},{"n":"Drema Bozich","d":"2024-05-24","c":"O5","f":"one_time"},{"n":"Jacquelyn Santo","d":"2024-05-31","c":"O4","f":"biweekly","r":488},{"n":"Amanda Benson","d":"2024-06-03","c":"O4","f":"biweekly","r":476},{"n":"Jennifer Richardson","d":"2024-06-03","c":"C2","f":"monthly","r":165},{"n":"John Hinton","d":"2024-06-03","c":"O4","f":"biweekly","r":367},{"n":"Eric Boyle","d":"2024-06-05","c":"P1","f":"monthly","r":156},{"n":"Joyce  Reynolds","d":"2024-06-05","c":"P1","f":"monthly","r":191},{"n":"Bev Surrette","d":"2024-06-06","c":"O4","f":"monthly","r":224},{"n":"Megan  White","d":"2024-06-06","c":"O4","f":"monthly","r":203},{"n":"Olga Grunsten","d":"2024-06-06","c":"O4","f":"biweekly","r":351},{"n":"Olga Grunsten","d":"2024-06-06","c":"O5","f":"monthly","r":197},{"n":"Chelsea Nataupsky","d":"2024-06-07","c":"O4","f":"biweekly","r":357},{"n":"Jim Byrd","d":"2024-06-07","c":"P4","f":"biweekly","r":429},{"n":"Sandi  Kerr","d":"2024-06-07","c":"O4","f":"monthly","r":191},{"n":"Melissa Powers","d":"2024-06-10","c":"O4","f":"one_time"},{"n":"Joyce Holnquist","d":"2024-06-18","c":"P2","f":"monthly","r":156},{"n":"Robin Llanes","d":"2024-06-18","c":"O4","f":"biweekly","r":485},{"n":"Kenneth Witcher","d":"2024-06-19","c":"P1","f":"monthly","r":195},{"n":"Chris Shaw","d":"2024-06-25","c":"O4","f":"monthly","r":191},{"n":"Joe Norwood","d":"2024-06-25","c":"P1","f":"biweekly","r":349},{"n":"Ann McClure","d":"2024-06-27","c":"T1","f":"monthly","r":191},{"n":"Anna De La Torriente","d":"2024-06-27","c":"O4","f":"monthly","r":254},{"n":"Caroline Atwell","d":"2024-07-08","c":"Q2","f":"monthly","r":170},{"n":"Faith Stainbrook","d":"2024-07-08","c":"P1","f":"biweekly","r":329},{"n":"Samantha Henshaw","d":"2024-07-08","c":"O4","f":"biweekly","r":349},{"n":"Joy Hale","d":"2024-07-09","c":"Q2","f":"monthly","r":191},{"n":"Mary Cortese","d":"2024-07-12","c":"P1","f":"one_time"},{"n":"Debbie Chislo","d":"2024-07-15","c":"P1","f":"biweekly","r":349},{"n":"Cristen Coker","d":"2024-07-16","c":"O4","f":"monthly","r":150},{"n":"Drema Bozich","d":"2024-07-16","c":"O4","f":"biweekly","r":349},{"n":"Malav Patel","d":"2024-07-17","c":"O4","f":"monthly","r":246},{"n":"Beccy Schulze","d":"2024-07-18","c":"O4","f":"biweekly","r":176},{"n":"Laura Thomas","d":"2024-07-22","c":"L1","f":"biweekly","r":297},{"n":"Jessica Roberts","d":"2024-07-23","c":"P4","f":"monthly","r":150},{"n":"Nathan Henwood","d":"2024-07-23","c":"O4","f":"biweekly","r":337},{"n":"Jean Gardner","d":"2024-07-25","c":"P1","f":"monthly","r":191},{"n":"Kandi Schromm","d":"2024-07-26","c":"P1","f":"biweekly","r":339},{"n":"Tabatha Rash","d":"2024-07-29","c":"O4","f":"biweekly","r":349},{"n":"Brianna Livingston","d":"2024-07-30","c":"L1","f":"biweekly","r":357},{"n":"Kathy  Carson","d":"2024-07-31","c":"O4","f":"monthly","r":213},{"n":"Lucyna Kornecki","d":"2024-07-31","c":"P3","f":"one_time"},{"n":"Lucyna Kornecki","d":"2024-08-01","c":"P1","f":"monthly","r":222},{"n":"Olga Grunsten","d":"2024-08-01","c":"P1","f":"monthly","r":197},{"n":"The Greenery","d":"2024-08-01","c":"P4","f":"weekly","r":652},{"n":"Jacquelyn Bennett","d":"2024-08-06","c":"C2","f":"biweekly","r":349},{"n":"Maria Moreno","d":"2024-08-06","c":"O4","f":"biweekly","r":385},{"n":"Michelle Purvis","d":"2024-08-06","c":"O4","f":"biweekly","r":415},{"n":"Jane Kennedy","d":"2024-08-12","c":"O4","f":"one_time"},{"n":"Jane Kennedy","d":"2024-08-12","c":"O5","f":"one_time"},{"n":"Barbara  Begley","d":"2024-08-16","c":"O4","f":"biweekly","r":362},{"n":"Holly Kotarski","d":"2024-08-19","c":"O4","f":"biweekly","r":339},{"n":"Nelson Cambata","d":"2024-08-20","c":"L2","f":"biweekly","r":426},{"n":"Judy  Lampe","d":"2024-08-21","c":"O4","f":"one_time"},{"n":"Angela Norris","d":"2024-08-22","c":"P1","f":"biweekly","r":349},{"n":"Maria Karafa","d":"2024-08-27","c":"P1","f":"biweekly","r":352},{"n":"Julie Shinew","d":"2024-08-28","c":"P3","f":"monthly","r":140},{"n":"Jennifer Arett","d":"2024-08-29","c":"P2","f":"weekly","r":585},{"n":"Jessica Daly","d":"2024-08-29","c":"L1","f":"biweekly","r":539},{"n":"Dana Leonard","d":"2024-08-30","c":"O4","f":"weekly","r":1066},{"n":"Dylan Rosenberg","d":"2024-08-30","c":"O4","f":"biweekly","r":456},{"n":"Nicole Salgado","d":"2024-09-03","c":"O4","f":"monthly","r":191},{"n":"Leigh Slayback","d":"2024-09-04","c":"O4","f":"biweekly","r":380},{"n":"Norina Burt","d":"2024-09-04","c":"P1","f":"monthly","r":165},{"n":"Kay Morris","d":"2024-09-09","c":"O5","f":"monthly","r":197},{"n":"Ryan Witt","d":"2024-09-09","c":"P1","f":"monthly","r":194},{"n":"Jay Murray","d":"2024-09-11","c":"O4","f":"monthly","r":144},{"n":"Kay Morris","d":"2024-09-11","c":"O5","f":"one_time"},{"n":"Kylie Dawes","d":"2024-09-11","c":"P1","f":"monthly","r":206},{"n":"Nae Desai","d":"2024-09-11","c":"Q2","f":"monthly","r":306},{"n":"Peggy Thomas","d":"2024-09-11","c":"O1","f":"one_time"},{"n":"Gail Filson","d":"2025-01-01","c":null,"f":"monthly"},{"n":"Joan Brendel","d":"2025-01-02","c":null,"f":"biweekly"},{"n":"Bella Mack","d":"2025-01-02","c":null,"f":"biweekly"},{"n":"Dasia Horn","d":"2025-01-06","c":null,"f":"monthly"},{"n":"Nichole York","d":"2025-01-06","c":null,"f":"biweekly"},{"n":"Susan Farrell","d":"2025-01-08","c":null,"f":"monthly"},{"n":"Roben-Marie Smith","d":"2025-01-09","c":null,"f":"monthly"},{"n":"Nicke Morris","d":"2025-01-10","c":null,"f":"monthly"},{"n":"Linda Messina","d":"2025-01-13","c":null,"f":"biweekly"},{"n":"Adam Winnicky","d":"2025-01-13","c":null,"f":"monthly"},{"n":"Addie Schoenberger","d":"2025-01-14","c":null,"f":"monthly"},{"n":"Kirsten Stroud","d":"2025-01-20","c":null,"f":"monthly"},{"n":"Melinda Andrisen","d":"2025-01-22","c":null,"f":"biweekly"},{"n":"Eileen Beniston","d":"2025-01-24","c":null,"f":"biweekly"},{"n":"Kelly Mountain","d":"2025-01-27","c":null,"f":"biweekly"},{"n":"Stephanie Valley","d":"2025-01-31","c":null,"f":"monthly"},{"n":"Ashley Filimon","d":"2025-02-06","c":null,"f":"biweekly"},{"n":"Angie Ritten","d":"2025-02-07","c":null,"f":"biweekly"},{"n":"Kathy Stark","d":"2025-02-14","c":null,"f":"biweekly"},{"n":"Tim DeWeese","d":"2025-02-19","c":null,"f":"biweekly"},{"n":"Lenore Egan","d":"2025-02-21","c":null,"f":"biweekly"},{"n":"John Himmelstein","d":"2025-02-24","c":null,"f":"biweekly"},{"n":"Emily Barnette","d":"2025-02-25","c":null,"f":"biweekly"},{"n":"Paul Budhai","d":"2025-02-27","c":null,"f":"biweekly"},{"n":"Kay Rademaker","d":"2025-02-28","c":null,"f":"monthly"},{"n":"Susan Miller","d":"2025-03-03","c":null,"f":"weekly"},{"n":"Kristi Naquin","d":"2025-03-03","c":null,"f":"biweekly"},{"n":"Elaine Haury","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Bailey O’Brien","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Robert Oldham","d":"2025-03-04","c":null,"f":"monthly"},{"n":"Sharon Toole","d":"2025-03-11","c":null,"f":"biweekly"},{"n":"Malav Patel","d":"2025-03-12","c":null,"f":"monthly"},{"n":"Sheila Haufler","d":"2025-03-13","c":null,"f":"biweekly"},{"n":"Katie Eichenlaub","d":"2025-03-14","c":null,"f":"monthly"},{"n":"William Hilbrant","d":"2025-03-14","c":null,"f":"monthly"},{"n":"Sheila Volpicelli","d":"2025-03-14","c":null,"f":"biweekly"},{"n":"Amelia West","d":"2025-03-17","c":null,"f":"weekly"},{"n":"Brenda Geiger","d":"2025-03-20","c":null,"f":"biweekly"},{"n":"Carry Powell","d":"2025-03-21","c":null,"f":"weekly"},{"n":"Paul Aicher","d":"2025-03-24","c":null,"f":"biweekly"},{"n":"Gail Bell","d":"2025-03-24","c":null,"f":"monthly"},{"n":"Trecia & Ty Arrington","d":"2025-03-26","c":null,"f":"monthly"},{"n":"Ashley Foster","d":"2025-03-28","c":null,"f":"monthly"},{"n":"Tiara Baez","d":"2025-03-31","c":null,"f":"weekly"},{"n":"Judy Hays","d":"2025-04-03","c":null,"f":"biweekly"},{"n":"Teresa Mack","d":"2025-04-07","c":null,"f":"biweekly"},{"n":"Brett Galloway","d":"2025-04-08","c":null,"f":"monthly"},{"n":"Margaret Luke","d":"2025-04-09","c":null,"f":"biweekly"},{"n":"Kathleen Sampson","d":"2025-04-16","c":null,"f":"biweekly"},{"n":"Jennifer Couillard","d":"2025-04-18","c":null,"f":"monthly"},{"n":"Nathan Bernier","d":"2025-04-23","c":null,"f":"monthly"},{"n":"Pat Mcclellan","d":"2025-04-23","c":null,"f":"biweekly"},{"n":"Peggy Loos","d":"2025-04-25","c":null,"f":"monthly"},{"n":"Matt Wilson","d":"2025-04-28","c":null,"f":"biweekly"},{"n":"Desmond Larmer","d":"2025-04-29","c":null,"f":"biweekly"},{"n":"Gail Fifield","d":"2025-04-30","c":null,"f":"biweekly"},{"n":"Debbie Gayson","d":"2025-05-01","c":null,"f":"monthly"},{"n":"Andy Clark","d":"2025-05-02","c":null,"f":"monthly"},{"n":"Kathryn Franco","d":"2025-05-05","c":null,"f":"biweekly"},{"n":"Jennifer Harvey","d":"2025-05-05","c":null,"f":"monthly"},{"n":"Kailly Tonsberg","d":"2025-05-06","c":null,"f":"biweekly"},{"n":"Sheri Heckendorn","d":"2025-05-07","c":null,"f":"biweekly"},{"n":"Amanda Benson","d":"2025-05-08","c":null,"f":"monthly"},{"n":"Robin Freiberger","d":"2025-05-08","c":null,"f":"monthly"},{"n":"Jill Johnson","d":"2025-05-12","c":null,"f":"biweekly"},{"n":"Jorie Dicamillo","d":"2025-05-14","c":null,"f":"monthly"},{"n":"Tarah Sinclair","d":"2025-05-16","c":null,"f":"biweekly"},{"n":"Jill Knecht","d":"2025-05-20","c":null,"f":"monthly"},{"n":"Nicole Young","d":"2025-05-21","c":null,"f":"biweekly"},{"n":"Jane Comparato","d":"2025-05-22","c":null,"f":"monthly"},{"n":"Dan Koehler","d":"2025-05-22","c":null,"f":"monthly"},{"n":"Michael Ruff","d":"2025-05-22","c":null,"f":"biweekly"},{"n":"Dorothy Gibson","d":"2025-05-23","c":null,"f":"biweekly"},{"n":"Wes Smith","d":"2025-05-29","c":null,"f":"biweekly"},{"n":"Robert Hicks","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Brian Lewis","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Jack Surrette","d":"2025-05-30","c":null,"f":"monthly"},{"n":"Trisha Rogers","d":"2025-06-03","c":null,"f":"monthly"},{"n":"Ashley Arends","d":"2025-06-05","c":null,"f":"monthly"},{"n":"Annie Ekstrom","d":"2025-06-10","c":null,"f":"monthly"},{"n":"Gayle Ewald","d":"2025-06-12","c":null,"f":"biweekly"},{"n":"Cindy Jackman","d":"2025-06-12","c":null,"f":"biweekly"},{"n":"Sima Tajik","d":"2025-06-17","c":null,"f":"biweekly"},{"n":"Glenn Bennett","d":"2025-06-19","c":null,"f":"weekly"},{"n":"Pat Iverson","d":"2025-06-20","c":null,"f":"monthly"},{"n":"Karen Hacker","d":"2025-06-26","c":null,"f":"biweekly"},{"n":"Maria Carver","d":"2025-06-30","c":null,"f":"monthly"},{"n":"Catherine Curry","d":"2025-06-30","c":null,"f":"biweekly"},{"n":"David Pierce","d":"2025-06-30","c":null,"f":"biweekly"},{"n":"Larry Buhl","d":"2025-07-01","c":null,"f":"biweekly"},{"n":"Sarah Larson","d":"2025-07-02","c":null,"f":"monthly"},{"n":"Robert Capko","d":"2025-07-07","c":null,"f":"monthly"},{"n":"Nancy Quick","d":"2025-07-07","c":null,"f":"biweekly"},{"n":"Lola Ferraiuolo","d":"2025-07-11","c":null,"f":"monthly"},{"n":"Jo-Ann Amaral","d":"2025-07-18","c":null,"f":"monthly"},{"n":"Rebecca Foley","d":"2025-08-11","c":null,"f":"monthly"}]

  const CODES_LOCAL = require('../lib/cancellationCodes')
  const insertCancel = db.prepare(`
    INSERT OR IGNORE INTO cancelled_clients
      (client_name, cancel_date, reason_code, reason_label, reason_category, frequency, revenue_lost_monthly, source)
    VALUES (?,?,?,?,?,?,?,'import')
  `)
  const insertFeedback = db.prepare(`
    INSERT OR IGNORE INTO client_feedback
      (client_name, feedback_date, rating, feedback_type, source)
    VALUES (?,?,?,'scorecard','import')
  `)
  const insertNurture = db.prepare(`
    INSERT OR IGNORE INTO client_nurture
      (cancelled_id, client_name, reason_code, cancel_date, next_contact)
    VALUES (?,?,?,?,?)
  `)

  const cancelTx = db.transaction(() => {
    for (const row of CANCELLATION_DATA) {
      const info = CODES_LOCAL[row.c] || { label: row.c, category: 'Other' }
      const result = insertCancel.run(row.n, row.d, row.c, info.label, info.category, row.f, row.r || null)
      results.cancellations++
      if (row.c?.startsWith('T') && result.lastInsertRowid) {
        const next = new Date(row.d); next.setDate(next.getDate() + 30)
        insertNurture.run(result.lastInsertRowid, row.n, row.c, row.d, next.toISOString().split('T')[0])
        results.nurture++
      }
    }
  })
  cancelTx()

  res.json({ ok: true, seeded: results })
})

// POST /api/webhook/hiring  — GHL workflow fires when candidate stage changes in Woot Recruit
router.post('/hiring', (req, res) => {
  if (!verifySecret(req, res)) return

  const payload = req.body
  const {
    contact_id,
    applicant_name,
    phone,
    email,
    stage,          // applied | phone_screen | interviewed | offered | hired | rejected | no_show
    stage_date,
    position,
    notes,
    source = 'woot',
  } = payload

  const eDate = stage_date ?? new Date().toISOString().split('T')[0]
  const extId = contact_id ?? null

  // Map common GHL stage names to our stage values
  const STAGE_MAP = {
    'new':           'applied',
    'new lead':      'applied',
    'applied':       'applied',
    'phone screen':  'phone_screen',
    'phone_screen':  'phone_screen',
    'scheduled':     'phone_screen',
    'interview':     'interviewed',
    'interviewed':   'interviewed',
    'offer':         'offered',
    'offered':       'offered',
    'hired':         'hired',
    'won':           'hired',
    'rejected':      'rejected',
    'lost':          'rejected',
    'no show':       'no_show',
    'no_show':       'no_show',
    'no-show':       'no_show',
  }
  const mappedStage = STAGE_MAP[(stage || '').toLowerCase()] ?? stage ?? 'applied'
  const isHired = mappedStage === 'hired'
  const isNoShow = mappedStage === 'no_show'

  if (extId) {
    // Upsert by contact_id
    const existing = db.prepare('SELECT id FROM hiring_pipeline WHERE external_id = ?').get(extId)
    if (existing) {
      db.prepare(`
        UPDATE hiring_pipeline SET
          stage = ?, stage_date = ?, hired = ?, no_show = ?,
          hire_date = CASE WHEN ? = 1 THEN ? ELSE hire_date END,
          notes = COALESCE(?, notes), position = COALESCE(?, position),
          raw_payload = ?, updated_at = datetime('now')
        WHERE external_id = ?
      `).run(mappedStage, eDate, isHired ? 1 : 0, isNoShow ? 1 : 0, isHired ? 1 : 0, eDate, notes ?? null, position ?? null, JSON.stringify(payload), extId)
    } else {
      db.prepare(`
        INSERT INTO hiring_pipeline
          (applicant_name, contact_id, phone, email, stage, stage_date, source, position, notes, hired, no_show, external_id, raw_payload)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(applicant_name ?? null, extId, phone ?? null, email ?? null, mappedStage, eDate, source, position ?? null, notes ?? null, isHired ? 1 : 0, isNoShow ? 1 : 0, extId, JSON.stringify(payload))
    }
  } else {
    db.prepare(`
      INSERT INTO hiring_pipeline
        (applicant_name, phone, email, stage, stage_date, source, position, notes, hired, no_show, raw_payload)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(applicant_name ?? null, phone ?? null, email ?? null, mappedStage, eDate, source, position ?? null, notes ?? null, isHired ? 1 : 0, isNoShow ? 1 : 0, JSON.stringify(payload))
  }

  res.json({ ok: true })
})

// GET /api/webhook/setup-guide
router.get('/setup-guide', (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host')
  res.json({
    maidcentral_job_completed: {
      url: `${baseUrl}/api/webhook/maidcentral`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '(your secret)' },
      payload: { event_type: 'job_completed', client_id: '{{Client ID}}', client_name: '{{Client Name}}', amount: '{{Job Amount}}', event_date: '{{Completion Date YYYY-MM-DD}}', frequency: '{{Service Frequency}}' }
    },
    maidcentral_cancellation: {
      url: `${baseUrl}/api/webhook/cancellation`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '(your secret)' },
      payload: { client_id: '{{Client ID}}', client_name: '{{Client Name}}', cancel_date: '{{Cancel Date YYYY-MM-DD}}', frequency: '{{Frequency}}', revenue_lost_monthly: '{{Monthly Revenue}}' }
    },
    ghl_new_lead: {
      url: `${baseUrl}/api/webhook/ghl`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '(your secret)' },
      payload: { event_type: 'new_lead', contact_id: '{{Contact ID}}', client_name: '{{Contact Name}}', rep_name: '{{Assigned User}}', client_freq: '{{Frequency Custom Field}}', event_date: '{{Date YYYY-MM-DD}}' }
    },
    ghl_lead_closed: {
      url: `${baseUrl}/api/webhook/ghl`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '(your secret)' },
      payload: { event_type: 'opportunity_won', contact_id: '{{Contact ID}}', client_name: '{{Contact Name}}', rep_name: '{{Assigned User}}', client_freq: '{{Frequency}}', price: '{{Deal Value}}', event_date: '{{Close Date YYYY-MM-DD}}' }
    },
    hiring_stage_change: {
      url: `${baseUrl}/api/webhook/hiring`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '(your secret)' },
      payload: { contact_id: '{{Contact ID}}', applicant_name: '{{Contact Name}}', phone: '{{Phone}}', email: '{{Email}}', stage: '{{Pipeline Stage Name}}', stage_date: '{{Date YYYY-MM-DD}}', position: 'Cleaning Technician' }
    }
  })
})


// POST /api/webhook/termination  — MaidCentral fires when an employee is terminated
// Body: { employee_name, employee_id, termination_date, termination_type (fired|quit), reason }
router.post('/termination', (req, res) => {
  if (!verifySecret(req, res)) return

  const {
    employee_name,
    employee_id,
    termination_date,
    termination_type = 'fired',
    reason,
    notes,
  } = req.body

  if (!employee_name) return res.status(400).json({ error: 'employee_name required' })

  const date = termination_date || new Date().toISOString().split('T')[0]
  const type = ['fired', 'quit'].includes((termination_type || '').toLowerCase())
    ? termination_type.toLowerCase()
    : 'fired'

  db.prepare(`
    INSERT INTO staff_terminations
      (employee_name, termination_date, termination_type, reason, source, external_id, notes)
    VALUES (?, ?, ?, ?, 'webhook', ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      termination_type = excluded.termination_type,
      termination_date = excluded.termination_date,
      reason           = excluded.reason
  `).run(employee_name, date, type, reason ?? null, employee_id ?? null, notes ?? null)

  db.prepare(`INSERT INTO audit_log (action_type, entity, description) VALUES ('webhook','staff_termination',?)`)
    .run(`MC termination: ${type} — ${employee_name} on ${date}`)

  res.json({ ok: true })
})

// ── QuickBooks Marketing Expense (Zapier) ──────────────────────────────────
// POST /api/webhook/qb-expense
// Zapier trigger: New Transaction in QB filtered to "6005 *Marketing"
// Fields expected: txn_id, txn_date (or date), amount, memo, vendor (all optional except amount+date)
router.post('/qb-expense', (req, res) => {
  if (!verifySecret(req, res)) return

  const {
    txn_id,
    txn_date,
    date,
    amount,
    memo,
    vendor,
    category,
  } = req.body

  const rawAmount = parseFloat(amount)
  if (!rawAmount || isNaN(rawAmount)) return res.status(400).json({ error: 'amount required and must be a number' })

  const dateStr = (txn_date || date || '').toString().trim()
  if (!dateStr) return res.status(400).json({ error: 'txn_date or date required' })

  // Normalise to YYYY-MM-DD — QB sends various formats
  let isoDate = dateStr
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) isoDate = `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  const month = isoDate.slice(0, 7)

  const cat = (category || '6005 *Marketing').toString().trim()

  // Unique key for idempotency — use txn_id if provided, else date+amount+vendor
  const uniqueKey = txn_id
    ? txn_id.toString()
    : `${isoDate}|${rawAmount}|${(vendor || '').trim()}`

  // Check for duplicate
  const existing = db.prepare('SELECT id FROM qb_transactions WHERE txn_id = ?').get(uniqueKey)
  if (existing) return res.json({ ok: true, skipped: true, reason: 'duplicate transaction' })

  // Insert individual transaction record
  db.prepare(`
    INSERT INTO qb_transactions (txn_id, txn_date, month, category, amount, memo, vendor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uniqueKey, isoDate, month, cat, rawAmount, memo ?? null, vendor ?? null)

  // Recompute and upsert the monthly total from all transactions for this month+category
  const total = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM qb_transactions WHERE month = ? AND category = ?'
  ).get(month, cat).total

  db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount, synced_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(month, category) DO UPDATE SET
      amount    = excluded.amount,
      synced_at = datetime('now')
  `).run(month, cat, Math.round(total * 100) / 100)

  db.prepare(`INSERT INTO audit_log (action_type, entity, description) VALUES ('webhook','qb_expense',?)`)
    .run(`QB marketing: ${cat} ${isoDate} $${rawAmount} — monthly total now $${Math.round(total * 100) / 100}`)

  res.json({ ok: true, month, category: cat, transaction_amount: rawAmount, monthly_total: Math.round(total * 100) / 100 })
})

module.exports = router
