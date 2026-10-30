// Credit & Ledger logic (SPEC.md Section 4, 5 & Slice 4)
// All credit calculations and ledger mutations MUST live in this file.

import { db } from './db.js';
import { STARTING_CREDITS, getLevelForSessions } from './config.js';

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

/**
 * Reads existing settlement details for an already-completed booking.
 * 
 * @param {object} booking 
 * @param {object} [targetDb=db] 
 * @returns {object}
 */
export function getExistingSettlement(booking, targetDb = db) {
  const rows = targetDb.prepare(`
    SELECT * FROM ledger_entries WHERE booking_id = ?
  `).all(booking.id);

  const spendRow = rows.find((r) => r.kind === 'session_spend');
  const earnRow = rows.find((r) => r.kind === 'session_earn');

  const learnerBalance = getUserBalance(booking.learner_id, targetDb);
  const mentorBalance = getUserBalance(booking.mentor_id, targetDb);

  const mentorCompletedSessions = targetDb.prepare(`
    SELECT COUNT(*) AS count FROM bookings WHERE mentor_id = ? AND status = 'completed'
  `).get(booking.mentor_id).count;

  const mentorLevel = getLevelForSessions(mentorCompletedSessions);

  const learner = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(booking.learner_id);
  const mentor = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(booking.mentor_id);

  return {
    booking,
    settlement: {
      amount: Number(booking.cost),
      spend_entry_id: spendRow ? spendRow.id : null,
      earn_entry_id: earnRow ? earnRow.id : null,
      learner: {
        id: learner ? learner.id : booking.learner_id,
        name: learner ? learner.name : 'Learner',
        new_balance: learnerBalance,
      },
      mentor: {
        id: mentor ? mentor.id : booking.mentor_id,
        name: mentor ? mentor.name : 'Mentor',
        new_balance: mentorBalance,
      },
      mentor_level_before: mentorLevel,
      mentor_level_after: mentorLevel,
      leveled_up: false,
    },
    alreadySettled: true,
  };
}

/**
 * Settles a booking atomically inside ONE transaction.
 * 
 * Rules:
 * 1. Participant check (learner or mentor only, else 403)
 * 2. If status is already 'completed', returns existing settlement with alreadySettled: true
 * 3. Status must be 'in_progress' (else 409)
 * 4. Learner balance must be >= cost (else 409)
 * 5. Inserts session_spend (-cost) and session_earn (+cost) with booking_id
 * 6. Sets booking status = 'completed' and completed_at
 * 7. UNIQUE(booking_id, kind) constraint prevents duplicate settlement
 * 
 * @param {string} bookingId 
 * @param {string} actingUserId 
 * @param {object} [targetDb=db] 
 * @param {object} [options]
 * @param {boolean} [options._forceThrowAfterSpend=false] - For rollback simulation testing
 * @returns {object} { booking, settlement, alreadySettled }
 */
export function settleBooking(bookingId, actingUserId, targetDb = db, { _forceThrowAfterSpend = false } = {}) {
  const tx = targetDb.transaction(() => {
    // 1. Load booking
    const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }

    // 2. Participant check
    if (booking.learner_id !== actingUserId && booking.mentor_id !== actingUserId) {
      const err = new Error('Forbidden: you are not a participant in this booking');
      err.status = 403;
      throw err;
    }

    // 3. Already completed check
    if (booking.status === 'completed') {
      return getExistingSettlement(booking, targetDb);
    }

    // 4. Must be in_progress
    if (booking.status !== 'in_progress') {
      const err = new Error(`Cannot settle booking with status '${booking.status}'. Only in_progress sessions can be completed.`);
      err.status = 409;
      throw err;
    }

    // 5. Learner balance check
    const learnerBalance = getUserBalance(booking.learner_id, targetDb);
    const cost = Number(booking.cost);
    if (learnerBalance < cost) {
      const err = new Error(`Learner has insufficient balance (${learnerBalance} cr) to settle cost (${cost} cr)`);
      err.status = 409;
      throw err;
    }

    // Check if ledger rows already exist for this booking (backstop)
    const existingRows = targetDb.prepare('SELECT * FROM ledger_entries WHERE booking_id = ?').all(booking.id);
    if (existingRows.length > 0) {
      return getExistingSettlement(booking, targetDb);
    }

    // Mentor levels before and after
    const mentorSessionsBefore = targetDb.prepare(`
      SELECT COUNT(*) AS count FROM bookings WHERE mentor_id = ? AND status = 'completed'
    `).get(booking.mentor_id).count;
    const mentorLevelBefore = getLevelForSessions(mentorSessionsBefore);
    const mentorLevelAfter = getLevelForSessions(mentorSessionsBefore + 1);
    const leveledUp = mentorLevelAfter > mentorLevelBefore;

    const learner = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(booking.learner_id);
    const mentor = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(booking.mentor_id);

    const spendId = `led_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const earnId = `led_${Date.now() + 1}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    try {
      // Insert session_spend (learner)
      targetDb.prepare(`
        INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
        VALUES (?, ?, ?, 'session_spend', ?, ?, ?)
      `).run(
        spendId,
        booking.learner_id,
        -cost,
        `Session on ${booking.topic} with ${mentor ? mentor.name : 'Mentor'}`,
        booking.id,
        nowIso
      );

      // Simulation hook for Case 9 (rollback test)
      if (_forceThrowAfterSpend) {
        throw new Error('Simulated failure after first insert inside transaction');
      }

      // Insert session_earn (mentor)
      targetDb.prepare(`
        INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
        VALUES (?, ?, ?, 'session_earn', ?, ?, ?)
      `).run(
        earnId,
        booking.mentor_id,
        cost,
        `Mentored ${learner ? learner.name : 'Learner'} on ${booking.topic}`,
        booking.id,
        nowIso
      );
    } catch (insertErr) {
      // UNIQUE constraint violation backstop -> treat as already settled
      if (insertErr.message && insertErr.message.includes('UNIQUE')) {
        return getExistingSettlement(booking, targetDb);
      }
      throw insertErr;
    }

    // Update booking to completed
    targetDb.prepare(`
      UPDATE bookings 
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `).run(nowIso, booking.id);

    const updatedBooking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    const newLearnerBalance = getUserBalance(booking.learner_id, targetDb);
    const newMentorBalance = getUserBalance(booking.mentor_id, targetDb);

    return {
      booking: updatedBooking,
      settlement: {
        amount: cost,
        spend_entry_id: spendId,
        earn_entry_id: earnId,
        learner: {
          id: learner ? learner.id : booking.learner_id,
          name: learner ? learner.name : 'Learner',
          new_balance: newLearnerBalance,
        },
        mentor: {
          id: mentor ? mentor.id : booking.mentor_id,
          name: mentor ? mentor.name : 'Mentor',
          new_balance: newMentorBalance,
        },
        mentor_level_before: mentorLevelBefore,
        mentor_level_after: mentorLevelAfter,
        leveled_up: leveledUp,
      },
      alreadySettled: false,
    };
  });

  return tx();
}

/**
 * Rates a completed booking and awards a +1 platform bonus credit to the mentor if rated 5 stars.
 * All operations take place in ONE atomic transaction.
 *
 * @param {string} bookingId
 * @param {string} actingUserId
 * @param {number} rating 1..5
 * @param {string|null} [comment] Optional comment max 300 chars
 * @param {object} [targetDb=db]
 * @returns {{ booking: object, bonusPaid: boolean, bonusEntryId: string | null, mentor: { id: string, name: string, new_balance: number | null } }}
 */
export function rateBooking(bookingId, actingUserId, rating, comment = null, targetDb = db) {
  if (!bookingId) {
    const err = new Error('Booking ID is required');
    err.status = 400;
    throw err;
  }

  // Validate rating integer 1..5
  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    const err = new Error('Rating must be an integer between 1 and 5');
    err.status = 400;
    throw err;
  }

  // Validate optional comment
  let cleanComment = null;
  if (comment !== undefined && comment !== null) {
    cleanComment = String(comment).trim();
    if (cleanComment.length > 300) {
      const err = new Error('Rating comment cannot exceed 300 characters');
      err.status = 400;
      throw err;
    }
    if (cleanComment.length === 0) {
      cleanComment = null;
    }
  }

  const tx = targetDb.transaction(() => {
    // Load booking with write lock
    const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }

    // Learner only
    if (booking.learner_id !== actingUserId) {
      const err = new Error('Only the learner can rate this booking');
      err.status = 403;
      throw err;
    }

    // Must be completed
    if (booking.status !== 'completed') {
      const err = new Error(`Cannot rate booking in status '${booking.status}'; must be completed`);
      err.status = 409;
      throw err;
    }

    // Already rated check
    if (booking.rating !== null && booking.rating !== undefined) {
      const err = new Error('Booking has already been rated');
      err.status = 409;
      throw err;
    }

    // Update booking rating
    targetDb.prepare(`
      UPDATE bookings 
      SET rating = ?, rating_comment = ?
      WHERE id = ?
    `).run(numRating, cleanComment, booking.id);

    let bonusPaid = false;
    let bonusEntryId = null;

    if (numRating === 5) {
      const learner = targetDb.prepare('SELECT name FROM users WHERE id = ?').get(booking.learner_id);
      const learnerName = learner ? learner.name : 'Learner';
      bonusEntryId = `led_${Date.now()}_bonus_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      try {
        targetDb.prepare(`
          INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
          VALUES (?, ?, ?, 'bonus', ?, ?, ?)
        `).run(
          bonusEntryId,
          booking.mentor_id,
          1,
          `5-star bonus from ${learnerName}`,
          booking.id,
          nowIso
        );
        bonusPaid = true;
      } catch (insertErr) {
        // UNIQUE(booking_id, kind) constraint prevents double bonus
        if (insertErr.message && insertErr.message.includes('UNIQUE')) {
          const existingBonus = targetDb.prepare(`
            SELECT id FROM ledger_entries WHERE booking_id = ? AND kind = 'bonus'
          `).get(booking.id);
          bonusEntryId = existingBonus ? existingBonus.id : null;
          bonusPaid = false;
        } else {
          throw insertErr;
        }
      }
    }

    const updatedBooking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    const mentor = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(booking.mentor_id);
    const newMentorBalance = getUserBalance(booking.mentor_id, targetDb);

    return {
      booking: updatedBooking,
      bonusPaid,
      bonusEntryId,
      mentor: {
        id: mentor ? mentor.id : booking.mentor_id,
        name: mentor ? mentor.name : 'Mentor',
        new_balance: newMentorBalance,
      },
    };
  });

  return tx();
}

/**
 * Validates whole-system credit conservation and integrity rules.
 * 
 * Checks:
 * 1. credits_conserved: SUM(all deltas) == minted total == sum of all user balances
 * 2. no_negative_balances: No user has balance < 0
 * 3. no_historical_negative_balance: For every user, the running balance in chronological order never drops below 0 at any point in history
 * 4. matched_booking_settlements: Every completed booking has exactly one session_spend and one session_earn of equal and opposite deltas
 * 5. booking_references_valid: Every ledger entry with a booking_id references an existing booking
 * 6. bonuses_valid: Every bonus row belongs to a completed booking rated 5
 * 7. no_duplicate_settlements: No booking has multiple settlements of the same kind
 * 
 * @param {object} [targetDb=db]
 * @returns {{ ok: boolean, conserved: boolean, total_credits_minted: number, total_balance_sum: number, sum_all_deltas: number, minted: { grants: number, bonuses: number, total: number }, in_balances_total: number, checks: Array<object> }}
 */
export function checkIntegrity(targetDb = db) {
  const checks = [];

  // Check 1: Total credits minted == sum of all balances == sum of all deltas
  const grantsRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS total 
    FROM ledger_entries 
    WHERE kind = 'grant'
  `).get();
  const bonusesRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS total 
    FROM ledger_entries 
    WHERE kind = 'bonus'
  `).get();
  const grants = Number(grantsRow ? grantsRow.total : 0);
  const bonuses = Number(bonusesRow ? bonusesRow.total : 0);
  const totalMinted = grants + bonuses;

  const deltaSumRow = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS total 
    FROM ledger_entries
  `).get();
  const deltaSum = Number(deltaSumRow ? deltaSumRow.total : 0);

  // User balances sum
  const userBalances = targetDb.prepare(`
    SELECT user_id, COALESCE(SUM(delta), 0) AS balance 
    FROM ledger_entries 
    GROUP BY user_id
  `).all();
  const totalBalances = userBalances.reduce((acc, u) => acc + Number(u.balance), 0);

  const conserved = (totalMinted === deltaSum) && (deltaSum === totalBalances);
  checks.push({
    key: 'credits_conserved',
    name: 'credits_conserved',
    label: 'Platform credits strictly conserved',
    description: 'Total credits minted equals sum of all user balances',
    ok: conserved,
    passed: conserved,
    detail: `Minted: ${totalMinted} cr (Grants: ${grants}, Bonuses: ${bonuses}) == Balances: ${totalBalances} cr == Deltas: ${deltaSum}`,
    details: `Minted: ${totalMinted} cr (Grants: ${grants}, Bonuses: ${bonuses}) == Balances: ${totalBalances} cr == Deltas: ${deltaSum}`,
  });

  // Check 2: No user has negative balance currently
  const negativeUsers = userBalances.filter((u) => Number(u.balance) < 0);
  const noNegBalances = negativeUsers.length === 0;
  checks.push({
    key: 'no_negative_balances',
    name: 'no_negative_balances',
    label: 'No negative current balances',
    description: 'No user has a negative credit balance',
    ok: noNegBalances,
    passed: noNegBalances,
    detail: noNegBalances
      ? 'All user current balances are non-negative (>= 0)'
      : `Found ${negativeUsers.length} user(s) with negative balance`,
    details: noNegBalances
      ? 'All user current balances are non-negative (>= 0)'
      : `Found ${negativeUsers.length} user(s) with negative balance`,
  });

  // Check 3: Historical running balance never drops below 0 at any point in history
  const allUsers = targetDb.prepare('SELECT id FROM users').all();
  let historicalViolation = false;
  const violationDetails = [];
  for (const u of allUsers) {
    const entries = targetDb.prepare(`
      SELECT delta, created_at, rowid
      FROM ledger_entries
      WHERE user_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(u.id);

    let running = 0;
    for (const e of entries) {
      running += Number(e.delta);
      if (running < 0) {
        historicalViolation = true;
        violationDetails.push(`User ${u.id} running balance dropped to ${running} at ${e.created_at}`);
        break;
      }
    }
  }
  const noHistoricalNeg = !historicalViolation;
  checks.push({
    key: 'no_historical_negative_balance',
    name: 'no_historical_negative_balance',
    label: 'Chronological running balance never negative',
    description: 'For every user, the running balance in chronological order never drops below 0 at any point in history',
    ok: noHistoricalNeg,
    passed: noHistoricalNeg,
    detail: noHistoricalNeg
      ? 'Running balance >= 0 for all users at every point in history'
      : violationDetails.join('; '),
    details: noHistoricalNeg
      ? 'Running balance >= 0 for all users at every point in history'
      : violationDetails.join('; '),
  });

  // Check 4: Every completed booking has exactly one spend and one earn of equal and opposite values
  const completedBookings = targetDb.prepare(`
    SELECT id, cost FROM bookings WHERE status = 'completed'
  `).all();

  let matchedBookings = true;
  const mismatchedDetails = [];

  for (const b of completedBookings) {
    const entries = targetDb.prepare(`
      SELECT kind, delta FROM ledger_entries WHERE booking_id = ?
    `).all(b.id);

    const spends = entries.filter((e) => e.kind === 'session_spend');
    const earns = entries.filter((e) => e.kind === 'session_earn');

    if (spends.length !== 1 || earns.length !== 1) {
      matchedBookings = false;
      mismatchedDetails.push(`Booking ${b.id} has ${spends.length} spends and ${earns.length} earns (expected 1 each)`);
    } else {
      const spend = spends[0];
      const earn = earns[0];
      if (
        Number(spend.delta) !== -Number(b.cost) ||
        Number(earn.delta) !== Number(b.cost) ||
        (Number(spend.delta) + Number(earn.delta) !== 0)
      ) {
        matchedBookings = false;
        mismatchedDetails.push(`Booking ${b.id} amounts do not match cost ${b.cost}: spend ${spend.delta}, earn ${earn.delta}`);
      }
    }
  }

  checks.push({
    key: 'matched_booking_settlements',
    name: 'matched_booking_settlements',
    label: 'Matching spend & earn pairs for sessions',
    description: 'Every completed booking has exactly one session_spend and one session_earn with equal and opposite amounts',
    ok: matchedBookings,
    passed: matchedBookings,
    detail: matchedBookings
      ? `${completedBookings.length} completed booking(s) verified with equal and opposite settlement entries`
      : mismatchedDetails.join('; '),
    details: matchedBookings
      ? `${completedBookings.length} completed booking(s) verified with equal and opposite settlement entries`
      : mismatchedDetails.join('; '),
  });

  // Check 5: Every ledger entry with a booking_id references an existing booking
  const orphanedEntries = targetDb.prepare(`
    SELECT le.id, le.booking_id
    FROM ledger_entries le
    LEFT JOIN bookings b ON le.booking_id = b.id
    WHERE le.booking_id IS NOT NULL AND b.id IS NULL
  `).all();
  const noOrphans = orphanedEntries.length === 0;
  checks.push({
    key: 'booking_references_valid',
    name: 'booking_references_valid',
    label: 'Booking references are valid foreign keys',
    description: 'Every ledger entry with a booking_id references an existing booking',
    ok: noOrphans,
    passed: noOrphans,
    detail: noOrphans
      ? 'All ledger booking_id references exist in bookings table'
      : `Found ${orphanedEntries.length} orphaned ledger entries: ${orphanedEntries.map((e) => e.id).join(', ')}`,
    details: noOrphans
      ? 'All ledger booking_id references exist in bookings table'
      : `Found ${orphanedEntries.length} orphaned ledger entries: ${orphanedEntries.map((e) => e.id).join(', ')}`,
  });

  // Check 6: Every bonus row belongs to a completed booking rated 5
  const invalidBonuses = targetDb.prepare(`
    SELECT le.id, le.booking_id, b.status, b.rating
    FROM ledger_entries le
    LEFT JOIN bookings b ON le.booking_id = b.id
    WHERE le.kind = 'bonus' AND (b.id IS NULL OR b.status != 'completed' OR b.rating != 5)
  `).all();
  const bonusesValid = invalidBonuses.length === 0;
  checks.push({
    key: 'bonuses_valid',
    name: 'bonuses_valid',
    label: 'Platform bonus credits verified',
    description: 'Every bonus row belongs to a completed booking rated 5 stars',
    ok: bonusesValid,
    passed: bonusesValid,
    detail: bonusesValid
      ? 'All platform bonus rows correspond to verified 5-star completed sessions'
      : `Found ${invalidBonuses.length} invalid bonus row(s)`,
    details: bonusesValid
      ? 'All platform bonus rows correspond to verified 5-star completed sessions'
      : `Found ${invalidBonuses.length} invalid bonus row(s)`,
  });

  // Check 7: No duplicate settlements (no booking has more than one settlement of same kind)
  const duplicateSettlements = targetDb.prepare(`
    SELECT booking_id, kind, COUNT(*) AS c 
    FROM ledger_entries 
    WHERE booking_id IS NOT NULL 
    GROUP BY booking_id, kind 
    HAVING c > 1
  `).all();
  const noDuplicates = duplicateSettlements.length === 0;
  checks.push({
    key: 'no_duplicate_settlements',
    name: 'no_duplicate_settlements',
    label: 'No duplicate settlements of same kind',
    description: 'No booking has multiple settlements of the same kind',
    ok: noDuplicates,
    passed: noDuplicates,
    detail: noDuplicates
      ? 'No duplicate settlements found (UNIQUE constraint active)'
      : `Found ${duplicateSettlements.length} duplicate settlements`,
    details: noDuplicates
      ? 'No duplicate settlements found (UNIQUE constraint active)'
      : `Found ${duplicateSettlements.length} duplicate settlements`,
  });

  const ok = checks.every((c) => c.ok);

  return {
    ok,
    conserved,
    total_credits_minted: totalMinted,
    total_balance_sum: totalBalances,
    sum_all_deltas: deltaSum,
    minted: {
      grants,
      bonuses,
      total: totalMinted,
    },
    in_balances_total: totalBalances,
    checks,
  };
}

