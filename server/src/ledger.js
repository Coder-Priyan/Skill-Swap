// Credit & Ledger logic (SPEC.md Section 4, 5 & Slice 4)
// All credit calculations and ledger mutations MUST live in this file.

import { db } from './db.js';
import { STARTING_CREDITS } from './config.js';

/**
 * Computes a user's current balance from the append-only ledger.
 * Balance = SUM(delta) over ledger_entries for that user.
 * 
 * @param {string} userId 
 * @param {object} [targetDb=db]
 * @returns {number}
 */
export function getUserBalance(userId, targetDb = db) {
  const row = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS balance 
    FROM ledger_entries 
    WHERE user_id = ?
  `).get(userId);

  return row ? Number(row.balance) : 0;
}

/**
 * Computes reserved credits for a learner.
 * Reserved credits = sum of cost of bookings in 'accepted' or 'in_progress' state.
 * 
 * @param {string} userId 
 * @param {object} [targetDb=db]
 * @returns {number}
 */
export function getUserReservedCredits(userId, targetDb = db) {
  const row = targetDb.prepare(`
    SELECT COALESCE(SUM(cost), 0) AS reserved 
    FROM bookings 
    WHERE learner_id = ? 
      AND status IN ('accepted', 'in_progress')
  `).get(userId);

  return row ? Number(row.reserved) : 0;
}

/**
 * Available credits = balance minus reserved credits.
 * 
 * @param {string} userId 
 * @param {object} [targetDb=db]
 * @returns {number}
 */
export function getUserAvailableCredits(userId, targetDb = db) {
  const balance = getUserBalance(userId, targetDb);
  const reserved = getUserReservedCredits(userId, targetDb);
  return balance - reserved;
}

/**
 * Computes summary totals for user's ledger:
 * total_earned, total_spent, grants, net, entry_count.
 * 
 * @param {string} userId 
 * @param {object} [targetDb=db]
 * @returns {object}
 */
export function getLedgerTotals(userId, targetDb = db) {
  const earnedRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS val 
    FROM ledger_entries 
    WHERE user_id = ? AND kind IN ('session_earn', 'bonus')
  `).get(userId);

  const spentRow = targetDb.prepare(`
    SELECT COALESCE(SUM(ABS(delta)), 0) AS val 
    FROM ledger_entries 
    WHERE user_id = ? AND kind = 'session_spend'
  `).get(userId);

  const grantsRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS val 
    FROM ledger_entries 
    WHERE user_id = ? AND kind = 'grant'
  `).get(userId);

  const netRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS val, COUNT(*) AS count 
    FROM ledger_entries 
    WHERE user_id = ?
  `).get(userId);

  return {
    total_earned: Number(earnedRow.val),
    total_spent: Number(spentRow.val), // positive number
    grants: Number(grantsRow.val),
    net: Number(netRow.val),
    entry_count: Number(netRow.count),
  };
}

/**
 * Returns ledger entries newest first with running_balance and linked booking context.
 * 
 * @param {string} userId 
 * @param {object} [options]
 * @param {string} [options.kind]
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @param {object} [targetDb=db]
 * @returns {{ entries: Array<object>, balance: number, count: number }}
 */
export function getLedgerForUser(userId, { kind, limit = 50, offset = 0 } = {}, targetDb = db) {
  // Query all user entries in ascending order (created_at then rowid) to calculate running_balance
  const allRows = targetDb.prepare(`
    SELECT 
      l.id,
      l.user_id,
      l.delta,
      l.kind,
      l.reason,
      l.booking_id,
      l.created_at,
      l.rowid,
      b.topic AS booking_topic,
      b.learner_id AS booking_learner_id,
      b.mentor_id AS booking_mentor_id,
      u_learner.name AS learner_name,
      u_learner.handle AS learner_handle,
      u_mentor.name AS mentor_name,
      u_mentor.handle AS mentor_handle
    FROM ledger_entries l
    LEFT JOIN bookings b ON l.booking_id = b.id
    LEFT JOIN users u_learner ON b.learner_id = u_learner.id
    LEFT JOIN users u_mentor ON b.mentor_id = u_mentor.id
    WHERE l.user_id = ?
    ORDER BY l.created_at ASC, l.rowid ASC
  `).all(userId);

  let running = 0;
  const enriched = [];

  for (const row of allRows) {
    running += Number(row.delta);

    let topic = null;
    let counterpart = null;

    if (row.booking_id) {
      topic = row.booking_topic || null;
      if (row.user_id === row.booking_learner_id) {
        // current user was the learner, counterpart is the mentor
        if (row.mentor_name) {
          counterpart = {
            id: row.booking_mentor_id,
            name: row.mentor_name,
            handle: row.mentor_handle,
          };
        }
      } else {
        // current user was the mentor, counterpart is the learner
        if (row.learner_name) {
          counterpart = {
            id: row.booking_learner_id,
            name: row.learner_name,
            handle: row.learner_handle,
          };
        }
      }
    }

    enriched.push({
      id: row.id,
      user_id: row.user_id,
      delta: Number(row.delta),
      kind: row.kind,
      reason: row.reason,
      booking_id: row.booking_id,
      topic,
      counterpart,
      running_balance: running,
      created_at: row.created_at,
    });
  }

  // Current balance is the final running balance across all chronological entries
  const totalBalance = enriched.length > 0 ? enriched[enriched.length - 1].running_balance : 0;

  // Newest first
  let result = enriched.slice().reverse();

  // Filter by kind if specified
  if (kind && typeof kind === 'string' && kind.trim()) {
    const filterKind = kind.trim().toLowerCase();
    result = result.filter((e) => e.kind.toLowerCase() === filterKind);
  }

  const count = result.length;
  const numLimit = Math.max(1, Number(limit) || 50);
  const numOffset = Math.max(0, Number(offset) || 0);

  const paginatedEntries = result.slice(numOffset, numOffset + numLimit);

  return {
    entries: paginatedEntries,
    balance: totalBalance,
    count,
  };
}

/**
 * Record a starting grant or bonus in the ledger.
 * 
 * @param {string} userId 
 * @param {number} amount 
 * @param {string} reason 
 * @param {object} [targetDb=db]
 * @returns {object} The created entry
 */
export function recordGrant(userId, amount = STARTING_CREDITS, reason = 'Welcome bonus', targetDb = db) {
  const id = `led_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const createdAt = new Date().toISOString();

  const insert = targetDb.prepare(`
    INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
    VALUES (?, ?, ?, 'grant', ?, NULL, ?)
  `);

  insert.run(id, userId, amount, reason, createdAt);
  return { id, user_id: userId, delta: amount, kind: 'grant', reason, created_at: createdAt };
}
