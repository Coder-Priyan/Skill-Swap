// Bookings service & state machine (SPEC.md Section 6, 7 & 13 Slice 3)
import { db } from './db.js';
import { calculateLevel, SESSION_COST } from './config.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(h) {
  return `${h.toString().padStart(2, '0')}:00`;
}

function getUserLevel(userId, targetDb = db) {
  const mentorSessions = targetDb.prepare(`
    SELECT COUNT(*) AS count 
    FROM bookings 
    WHERE mentor_id = ? AND status = 'completed'
  `).get(userId).count;

  return calculateLevel(mentorSessions);
}

function getMiniProfile(userId, targetDb = db) {
  const user = targetDb.prepare(`
    SELECT id, name, handle, avatar_color 
    FROM users 
    WHERE id = ?
  `).get(userId);

  if (!user) return null;
  const level = getUserLevel(userId, targetDb);
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar_color: user.avatar_color,
    level,
  };
}

/**
 * Creates a new booking in 'pending' state.
 */
export function createBooking({ learnerId, mentorId, topic, problemNote, slotId }, targetDb = db) {
  // 1. Validate participants
  if (!learnerId) {
    const err = new Error('Learner ID is required');
    err.status = 400;
    throw err;
  }
  if (!mentorId) {
    const err = new Error('Mentor ID is required');
    err.status = 400;
    throw err;
  }
  if (learnerId === mentorId) {
    const err = new Error('You cannot book a mentorship session with yourself');
    err.status = 400;
    throw err;
  }

  const mentor = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(mentorId);
  if (!mentor) {
    const err = new Error('Selected mentor does not exist');
    err.status = 404;
    throw err;
  }

  const learner = targetDb.prepare('SELECT id, name FROM users WHERE id = ?').get(learnerId);
  if (!learner) {
    const err = new Error('Learner does not exist');
    err.status = 404;
    throw err;
  }

  // 2. Validate topic against mentor skills
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    const err = new Error('Topic is required');
    err.status = 400;
    throw err;
  }

  const mentorSkill = targetDb.prepare(`
    SELECT topic FROM user_skills 
    WHERE user_id = ? AND LOWER(topic) = LOWER(?)
  `).get(mentorId, topic.trim());

  if (!mentorSkill) {
    const err = new Error(`Mentor does not offer mentorship in topic '${topic}'`);
    err.status = 400;
    throw err;
  }

  // 3. Validate problem note (10 to 500 chars)
  const trimmedNote = (problemNote || '').trim();
  if (trimmedNote.length < 10 || trimmedNote.length > 500) {
    const err = new Error('Problem note must be between 10 and 500 characters');
    err.status = 400;
    throw err;
  }

  // 4. Validate slot belongs to mentor
  if (!slotId) {
    const err = new Error('Slot ID is required');
    err.status = 400;
    throw err;
  }

  // Support slotId with or without 'slt_' prefix or numeric
  const cleanSlotId = typeof slotId === 'string' && slotId.startsWith('slt_') ? slotId.replace(/^slt_/, '') : slotId;
  const slot = targetDb.prepare(`
    SELECT id, day_of_week, start_hour, end_hour 
    FROM availability_slots 
    WHERE (id = ? OR id = ?) AND user_id = ?
  `).get(slotId, cleanSlotId, mentorId);

  if (!slot) {
    const err = new Error('Selected availability slot does not belong to this mentor');
    err.status = 400;
    throw err;
  }

  const slotLabel = `${DAY_NAMES[slot.day_of_week]}: ${formatHour(slot.start_hour)}-${formatHour(slot.end_hour)}`;

  // 5. Validate learner available credits >= SESSION_COST
  const learnerBalance = targetDb.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE user_id = ?
  `).get(learnerId).balance;

  const learnerReserved = targetDb.prepare(`
    SELECT COALESCE(SUM(cost), 0) AS reserved FROM bookings 
    WHERE learner_id = ? AND status IN ('accepted', 'in_progress')
  `).get(learnerId).reserved;

  const availableCredits = learnerBalance - learnerReserved;

  if (availableCredits < SESSION_COST) {
    const err = new Error(`Not enough available credits (need ${SESSION_COST} cr, have ${availableCredits} cr)`);
    err.status = 402;
    throw err;
  }

  // 6. Validate mentor.level >= learner.level
  const mentorLevel = getUserLevel(mentorId, targetDb);
  const learnerLevel = getUserLevel(learnerId, targetDb);
  if (mentorLevel < learnerLevel) {
    const err = new Error(`Mentor level (Level ${mentorLevel}) must be greater than or equal to learner level (Level ${learnerLevel})`);
    err.status = 400;
    throw err;
  }

  // 7. Check duplicate open request for same learner + mentor
  const duplicate = targetDb.prepare(`
    SELECT id FROM bookings 
    WHERE learner_id = ? AND mentor_id = ? 
      AND status IN ('requested', 'accepted')
  `).get(learnerId, mentorId);

  if (duplicate) {
    const err = new Error('An active booking request already exists for this mentor');
    err.status = 409;
    throw err;
  }

  // 8. Insert booking in 'requested' status
  const bookingId = `bok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const requestedAt = new Date().toISOString();

  targetDb.prepare(`
    INSERT INTO bookings (
      id, learner_id, mentor_id, topic, problem_note, slot_label,
      status, cost, room_id, requested_at, accepted_at, started_at, completed_at, cancelled_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NULL, ?, NULL, NULL, NULL, NULL)
  `).run(
    bookingId,
    learnerId,
    mentorId,
    mentorSkill.topic,
    trimmedNote,
    slotLabel,
    SESSION_COST,
    requestedAt
  );

  return getBookingById(bookingId, learnerId, targetDb);
}

/**
 * Accept a pending booking (mentor only).
 * Atomic transaction re-checking learner's available credits.
 */
export function acceptBooking({ bookingId, mentorId }, targetDb = db) {
  const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }

  if (booking.mentor_id !== mentorId) {
    const err = new Error('Only the assigned mentor can accept this booking');
    err.status = 403;
    throw err;
  }

  if (booking.status !== 'requested') {
    const err = new Error(`Cannot accept booking in status '${booking.status}'`);
    err.status = 409;
    throw err;
  }

  const roomId = `room_${Math.random().toString(36).substring(2, 12)}`;
  const acceptedAt = new Date().toISOString();

  // Run atomic accept transaction
  const tx = targetDb.transaction(() => {
    // Re-check learner available credits inside transaction
    const learnerBalance = targetDb.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE user_id = ?
    `).get(booking.learner_id).balance;

    const learnerReserved = targetDb.prepare(`
      SELECT COALESCE(SUM(cost), 0) AS reserved FROM bookings 
      WHERE learner_id = ? AND status IN ('accepted', 'in_progress')
    `).get(booking.learner_id).reserved;

    const available = learnerBalance - learnerReserved;

    if (available < booking.cost) {
      const err = new Error('Learner no longer has enough free credits to accept this booking');
      err.status = 402;
      throw err;
    }

    targetDb.prepare(`
      UPDATE bookings 
      SET status = 'accepted', accepted_at = ?, room_id = ?
      WHERE id = ?
    `).run(acceptedAt, roomId, bookingId);
  });

  tx();

  return getBookingById(bookingId, mentorId, targetDb);
}

/**
 * Decline a requested booking (mentor only).
 */
export function declineBooking({ bookingId, mentorId }, targetDb = db) {
  const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }

  if (booking.mentor_id !== mentorId) {
    const err = new Error('Only the assigned mentor can decline this booking');
    err.status = 403;
    throw err;
  }

  if (booking.status !== 'requested') {
    const err = new Error(`Cannot decline booking in status '${booking.status}'`);
    err.status = 409;
    throw err;
  }

  targetDb.prepare(`
    UPDATE bookings 
    SET status = 'declined'
    WHERE id = ?
  `).run(bookingId);

  return getBookingById(bookingId, mentorId, targetDb);
}

/**
 * Cancel a booking.
 * Learner can cancel 'requested' or 'accepted'.
 * Mentor can cancel 'accepted' only.
 */
export function cancelBooking({ bookingId, userId }, targetDb = db) {
  const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }

  const isLearner = booking.learner_id === userId;
  const isMentor = booking.mentor_id === userId;

  if (!isLearner && !isMentor) {
    const err = new Error('You do not have permission to cancel this booking');
    err.status = 403;
    throw err;
  }

  if (booking.status === 'requested') {
    if (!isLearner) {
      const err = new Error('Mentors cannot cancel a requested booking; use decline instead');
      err.status = 403;
      throw err;
    }
  } else if (booking.status === 'accepted') {
    // Both learner and mentor can cancel an accepted booking
  } else {
    const err = new Error(`Cannot cancel booking in status '${booking.status}'`);
    err.status = 409;
    throw err;
  }

  const cancelledBy = isLearner ? 'learner' : 'mentor';
  const cancelledAt = new Date().toISOString();

  targetDb.prepare(`
    UPDATE bookings 
    SET status = 'cancelled', cancelled_by = ?
    WHERE id = ?
  `).run(cancelledBy, bookingId);

  return getBookingById(bookingId, userId, targetDb);
}

/**
 * Retrieve a single booking with mini profiles and computed available actions.
 */
export function getBookingById(bookingId, currentUserId, targetDb = db) {
  const booking = targetDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return null;

  const learner = getMiniProfile(booking.learner_id, targetDb);
  const mentor = getMiniProfile(booking.mentor_id, targetDb);
  const myRole = booking.learner_id === currentUserId ? 'learner' : 'mentor';

  // Compute available actions based on role and status
  const availableActions = [];
  if (myRole === 'mentor') {
    if (booking.status === 'requested') {
      availableActions.push('accept', 'decline');
    } else if (booking.status === 'accepted') {
      availableActions.push('cancel');
    }
  } else if (myRole === 'learner') {
    if (booking.status === 'requested' || booking.status === 'accepted') {
      availableActions.push('cancel');
    }
  }

  // Accept block reason for mentor on requested booking
  let acceptBlockReason = null;
  if (myRole === 'mentor' && booking.status === 'requested') {
    const learnerBalance = targetDb.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE user_id = ?
    `).get(booking.learner_id).balance;

    const learnerReserved = targetDb.prepare(`
      SELECT COALESCE(SUM(cost), 0) AS reserved FROM bookings 
      WHERE learner_id = ? AND status IN ('accepted', 'in_progress')
    `).get(booking.learner_id).reserved;

    const available = learnerBalance - learnerReserved;
    if (available < booking.cost) {
      acceptBlockReason = `Learner currently lacks free credits (need ${booking.cost} cr, has ${available} cr)`;
    }
  }

  return {
    ...booking,
    cost: Number(booking.cost),
    learner,
    mentor,
    my_role: myRole,
    available_actions: availableActions,
    accept_block_reason: acceptBlockReason,
  };
}

/**
 * List bookings for a user by role and status.
 */
export function getBookings({ userId, role, status }, targetDb = db) {
  const whereClauses = [];
  const params = [];

  if (role === 'learner') {
    whereClauses.push('b.learner_id = ?');
    params.push(userId);
  } else if (role === 'mentor') {
    whereClauses.push('b.mentor_id = ?');
    params.push(userId);
  } else {
    whereClauses.push('(b.learner_id = ? OR b.mentor_id = ?)');
    params.push(userId, userId);
  }

  if (status) {
    if (status === 'active') {
      whereClauses.push("b.status IN ('requested', 'accepted', 'in_progress')");
    } else if (status === 'closed') {
      whereClauses.push("b.status IN ('completed', 'declined', 'cancelled')");
    } else {
      whereClauses.push('b.status = ?');
      params.push(status);
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const rows = targetDb.prepare(`
    SELECT b.id 
    FROM bookings b 
    ${whereSql}
    ORDER BY b.requested_at DESC
  `).all(...params);

  return rows.map((r) => getBookingById(r.id, userId, targetDb));
}

/**
 * Summary counts for navigation badge and alerts.
 */
export function getBookingsSummary(userId, targetDb = db) {
  const pendingMentor = targetDb.prepare(`
    SELECT COUNT(*) AS count FROM bookings 
    WHERE mentor_id = ? AND status = 'requested'
  `).get(userId).count;

  const pendingLearner = targetDb.prepare(`
    SELECT COUNT(*) AS count FROM bookings 
    WHERE learner_id = ? AND status = 'requested'
  `).get(userId).count;

  const acceptedLearner = targetDb.prepare(`
    SELECT COUNT(*) AS count FROM bookings 
    WHERE learner_id = ? AND status = 'accepted'
  `).get(userId).count;

  const acceptedMentor = targetDb.prepare(`
    SELECT COUNT(*) AS count FROM bookings 
    WHERE mentor_id = ? AND status = 'accepted'
  `).get(userId).count;

  return {
    pending_mentor: pendingMentor,
    pending_learner: pendingLearner,
    accepted_learner: acceptedLearner,
    accepted_mentor: acceptedMentor,
    total_actionable: pendingMentor,
  };
}
