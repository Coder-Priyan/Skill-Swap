// Credit & Ledger logic (SPEC.md Section 4 & 5)
// All credit calculations and ledger mutations MUST live in this file.

import { db } from './db.js';
import { STARTING_CREDITS } from './config.js';

/**
 * Computes a user's current balance from the append-only ledger.
 * Balance = SUM(delta) over ledger_entries for that user.
 * 
 * @param {string} userId 
 * @returns {number}
 */
export function getUserBalance(userId) {
  const row = db.prepare(`
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
 * @returns {number}
 */
export function getUserReservedCredits(userId) {
  const row = db.prepare(`
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
 * @returns {number}
 */
export function getUserAvailableCredits(userId) {
  const balance = getUserBalance(userId);
  const reserved = getUserReservedCredits(userId);
  return balance - reserved;
}

/**
 * Record a starting grant or bonus in the ledger.
 * 
 * @param {string} userId 
 * @param {number} amount 
 * @param {string} reason 
 * @returns {object} The created entry
 */
export function recordGrant(userId, amount = STARTING_CREDITS, reason = 'Welcome bonus') {
  const id = `led_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const createdAt = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
    VALUES (?, ?, ?, 'grant', ?, NULL, ?)
  `);

  insert.run(id, userId, amount, reason, createdAt);
  return { id, user_id: userId, delta: amount, kind: 'grant', reason, created_at: createdAt };
}
