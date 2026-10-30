import express from 'express';
import { db } from '../db.js';
import { checkIntegrity } from '../ledger.js';

const router = express.Router();

/**
 * GET /api/audit
 * Transparent whole-system audit and verification report.
 * Accessible to any valid authenticated user (SPEC Slice 7).
 * Contains NO per-user balance fields.
 */
router.get('/', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(currentUserId);
    if (!userExists) {
      return res.status(401).json({ error: 'Invalid user: user does not exist' });
    }

    // Run core ledger integrity engine
    const integrity = checkIntegrity(db);

    // Entity counts
    const usersCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const completedBookingsCount = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'completed'").get().c;
    const ledgerEntriesCount = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;

    // Recent settlements (last 10 completed bookings with matched ledger rows)
    const rawSettlements = db.prepare(`
      SELECT 
        b.id,
        b.topic,
        b.cost AS amount,
        b.completed_at,
        b.learner_id,
        u_l.name AS learner_name,
        u_l.handle AS learner_handle,
        b.mentor_id,
        u_m.name AS mentor_name,
        u_m.handle AS mentor_handle,
        (SELECT id FROM ledger_entries WHERE booking_id = b.id AND kind = 'session_spend' LIMIT 1) AS spend_entry_id,
        (SELECT id FROM ledger_entries WHERE booking_id = b.id AND kind = 'session_earn' LIMIT 1) AS earn_entry_id
      FROM bookings b
      LEFT JOIN users u_l ON b.learner_id = u_l.id
      LEFT JOIN users u_m ON b.mentor_id = u_m.id
      WHERE b.status = 'completed'
      ORDER BY b.completed_at DESC, b.rowid DESC
      LIMIT 10
    `).all();

    const recent_settlements = rawSettlements.map((s) => ({
      id: s.id,
      topic: s.topic,
      amount: s.amount,
      completed_at: s.completed_at,
      learner: {
        id: s.learner_id,
        name: s.learner_name || 'Learner',
        handle: s.learner_handle || 'learner',
      },
      mentor: {
        id: s.mentor_id,
        name: s.mentor_name || 'Mentor',
        handle: s.mentor_handle || 'mentor',
      },
      spend_entry_id: s.spend_entry_id,
      earn_entry_id: s.earn_entry_id,
      running_proof: `-${s.amount} / +${s.amount}`,
    }));

    // Format clean checks response per SPEC B1: { key, label, ok, detail }
    const checks = integrity.checks.map((c) => ({
      key: c.key,
      label: c.label || c.name,
      ok: Boolean(c.ok),
      detail: c.detail || c.details,
    }));

    res.json({
      generated_at: new Date().toISOString(),
      minted: integrity.minted,
      in_balances_total: integrity.in_balances_total,
      conserved: Boolean(integrity.conserved),
      checks,
      counts: {
        users: usersCount,
        bookings_completed: completedBookingsCount,
        ledger_entries: ledgerEntriesCount,
      },
      recent_settlements,
    });
  } catch (err) {
    console.error('Error in GET /api/audit:', err);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
});

export default router;
