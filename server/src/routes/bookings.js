import express from 'express';
import { db } from '../db.js';
import {
  createBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  startBooking,
  getBookingById,
  getBookings,
  getBookingsSummary,
} from '../bookings.js';
import { settleBooking, rateBooking } from '../ledger.js';
import { emitToUser, emitToRoom, getIO } from '../sockets.js';
import { snapshotAndCloseRoom } from '../yjs.js';
import { endRoomVoice } from '../rtc.js';

const router = express.Router();

/**
 * Middleware: require valid X-User-Id header for all booking endpoints
 */
function requireUser(req, res, next) {
  const userId = req.header('X-User-Id');
  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header required' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid X-User-Id: user does not exist' });
  }

  req.currentUserId = userId;
  next();
}

router.use(requireUser);

/**
 * GET /api/bookings/summary
 * Summary counts for navigation badges
 */
router.get('/summary', (req, res) => {
  try {
    const summary = getBookingsSummary(req.currentUserId);
    res.json(summary);
  } catch (err) {
    console.error('Error in GET /api/bookings/summary:', err);
    res.status(500).json({ error: 'Failed to retrieve bookings summary' });
  }
});

/**
 * GET /api/bookings
 * List bookings for current user by role and status
 */
router.get('/', (req, res) => {
  try {
    const { role, status } = req.query;
    const bookings = getBookings({
      userId: req.currentUserId,
      role,
      status,
    });
    res.json(bookings);
  } catch (err) {
    console.error('Error in GET /api/bookings:', err);
    res.status(500).json({ error: 'Failed to retrieve bookings' });
  }
});

/**
 * POST /api/bookings
 * Create a new booking request { mentorId, topic, problemNote, slotId }
 */
router.post('/', (req, res) => {
  try {
    const { mentorId, topic, problemNote, slotId } = req.body;
    const booking = createBooking({
      learnerId: req.currentUserId,
      mentorId,
      topic,
      problemNote,
      slotId,
    });

    // Notify mentor via Socket.io AFTER successful DB commit
    emitToUser(mentorId, 'booking:requested', {
      booking,
      message: `${booking.learner.name} requested a ${booking.topic} session`,
    });

    res.status(201).json(booking);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error('Error in POST /api/bookings:', err);
    }
    res.status(status).json({ error: err.message || 'Failed to create booking' });
  }
});

/**
 * POST /api/bookings/:id/accept
 * Mentor accepts a requested booking
 */
router.post('/:id/accept', (req, res) => {
  try {
    const { id } = req.params;
    const booking = acceptBooking({
      bookingId: id,
      mentorId: req.currentUserId,
    });

    // Notify learner of acceptance and credit reservation
    emitToUser(booking.learner_id, 'booking:accepted', {
      booking,
      message: `${booking.mentor.name} accepted your ${booking.topic} session!`,
    });

    emitToUser(booking.learner_id, 'ledger:updated', {
      userId: booking.learner_id,
      message: 'Credits reserved for accepted session',
    });

    res.json(booking);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/accept:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to accept booking' });
  }
});

/**
 * POST /api/bookings/:id/decline
 * Mentor declines a requested booking
 */
router.post('/:id/decline', (req, res) => {
  try {
    const { id } = req.params;
    const booking = declineBooking({
      bookingId: id,
      mentorId: req.currentUserId,
    });

    // Notify learner of decline
    emitToUser(booking.learner_id, 'booking:declined', {
      booking,
      message: `${booking.mentor.name} declined your ${booking.topic} request`,
    });

    res.json(booking);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/decline:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to decline booking' });
  }
});

/**
 * POST /api/bookings/:id/cancel
 * Learner cancels requested or accepted; Mentor cancels accepted
 */
router.post('/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    // Check previous status before cancelling
    const existing = db.prepare('SELECT status, learner_id, mentor_id, topic FROM bookings WHERE id = ?').get(id);
    const wasAccepted = existing?.status === 'accepted';

    const booking = cancelBooking({
      bookingId: id,
      userId: req.currentUserId,
    });

    if (booking.room_id) {
      endRoomVoice(booking.room_id, getIO());
    }

    // Notify the other party
    const recipientId = booking.cancelled_by === 'learner' ? booking.mentor_id : booking.learner_id;
    const cancellerName = req.currentUserId === booking.learner_id ? booking.learner.name : booking.mentor.name;

    emitToUser(recipientId, 'booking:cancelled', {
      booking,
      message: `Session on ${booking.topic} was cancelled by ${cancellerName}`,
    });

    // If booking was accepted, learner's reserved credits are now freed
    if (wasAccepted) {
      emitToUser(booking.learner_id, 'ledger:updated', {
        userId: booking.learner_id,
        message: 'Credits freed from cancelled session',
      });
    }

    res.json(booking);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/cancel:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to cancel booking' });
  }
});

/**
 * GET /api/bookings/:id
 * Retrieve single booking for participant
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const booking = getBookingById(id, req.currentUserId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.learner_id !== req.currentUserId && booking.mentor_id !== req.currentUserId) {
      return res.status(403).json({ error: 'Forbidden: you are not a participant in this booking' });
    }

    res.json(booking);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to retrieve booking' });
  }
});

/**
 * POST /api/bookings/:id/start
 * Starts session (transitions accepted -> in_progress), idempotent
 */
router.post('/:id/start', (req, res) => {
  try {
    const { id } = req.params;
    const { booking, transitioned } = startBooking({
      bookingId: id,
      userId: req.currentUserId,
    });

    if (transitioned) {
      const otherUserId = req.currentUserId === booking.learner_id ? booking.mentor_id : booking.learner_id;
      const starterName = req.currentUserId === booking.learner_id ? booking.learner.name : booking.mentor.name;
      emitToUser(otherUserId, 'booking:started', {
        bookingId: booking.id,
        roomId: booking.room_id,
        booking,
        message: `${starterName} joined the room`,
      });
    }

    res.json(booking);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/start:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to start booking' });
  }
});

/**
 * POST /api/bookings/:id/complete
 * Atomically completes session, moves credits via ledger.js, snapshots code and closes room.
 */
router.post('/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    const { booking, settlement, alreadySettled } = settleBooking(id, req.currentUserId);

    if (!alreadySettled) {
      // 1. Snapshot code and close Yjs room & voice
      snapshotAndCloseRoom(booking.room_id, booking.id);
      endRoomVoice(booking.room_id, getIO());

      // 2. Base payload for room
      const roomPayload = {
        bookingId: booking.id,
        roomId: booking.room_id,
        amount: settlement.amount,
        learner: { id: settlement.learner.id, name: settlement.learner.name },
        mentor: { id: settlement.mentor.id, name: settlement.mentor.name },
        mentor_level_before: settlement.mentor_level_before,
        mentor_level_after: settlement.mentor_level_after,
        leveled_up: settlement.leveled_up,
      };

      // 3. Emit session:ended to room and users
      emitToRoom(booking.room_id, 'session:ended', roomPayload);

      emitToUser(booking.learner_id, 'session:ended', {
        ...roomPayload,
        my_new_balance: settlement.learner.new_balance,
      });

      emitToUser(booking.mentor_id, 'session:ended', {
        ...roomPayload,
        my_new_balance: settlement.mentor.new_balance,
      });

      // 4. Emit ledger:updated to both users
      emitToUser(booking.learner_id, 'ledger:updated', {
        userId: booking.learner_id,
        message: `Session completed - ${settlement.amount} credits transferred`,
      });

      emitToUser(booking.mentor_id, 'ledger:updated', {
        userId: booking.mentor_id,
        message: `Session completed - ${settlement.amount} credits earned`,
      });
    }

    // Prepare response with privacy applied (only show caller's own new_balance)
    const callerIsLearner = req.currentUserId === booking.learner_id;
    const clientSettlement = {
      amount: settlement.amount,
      spend_entry_id: settlement.spend_entry_id,
      earn_entry_id: settlement.earn_entry_id,
      learner: {
        id: settlement.learner.id,
        name: settlement.learner.name,
        ...(callerIsLearner ? { new_balance: settlement.learner.new_balance } : {}),
      },
      mentor: {
        id: settlement.mentor.id,
        name: settlement.mentor.name,
        ...(!callerIsLearner ? { new_balance: settlement.mentor.new_balance } : {}),
      },
      mentor_level_before: settlement.mentor_level_before,
      mentor_level_after: settlement.mentor_level_after,
      leveled_up: settlement.leveled_up,
    };

    res.json({
      booking,
      settlement: clientSettlement,
      alreadySettled,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/complete:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to complete booking' });
  }
});

/**
 * GET /api/bookings/:id/notes
 * Retrieve final code snapshot and language for participant
 */
router.get('/:id/notes', (req, res) => {
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT learner_id, mentor_id FROM bookings WHERE id = ?').get(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.learner_id !== req.currentUserId && booking.mentor_id !== req.currentUserId) {
      return res.status(403).json({ error: 'Forbidden: you are not a participant in this booking' });
    }

    const note = db.prepare(`
      SELECT id, booking_id, summary, final_code, language, saved_at 
      FROM session_notes 
      WHERE booking_id = ? 
      ORDER BY saved_at DESC LIMIT 1
    `).get(id);

    if (!note) {
      return res.json({
        booking_id: id,
        summary: null,
        final_code: '',
        language: 'javascript',
        saved_at: null,
      });
    }

    return res.json(note);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to retrieve notes' });
  }
});

/**
 * POST /api/bookings/:id/rate
 * Learner rates mentor (1-5 stars, awards +1 bonus if 5)
 * OR Mentor rates learner (1-5 stars on communication & engagement)
 */
router.post('/:id/rate', (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body || {};

    const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (existing.status !== 'completed') {
      return res.status(409).json({ error: `Cannot rate booking in status '${existing.status}'; must be completed` });
    }

    // Mentor rating Learner (explicit role: 'mentor')
    if (existing.mentor_id === req.currentUserId && (req.body?.role === 'mentor' || req.body?.targetRole === 'learner')) {
      const numRating = Number(rating);
      if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      }
      const cleanComment = comment ? String(comment).trim().slice(0, 300) : null;
      db.prepare(`
        UPDATE bookings
        SET mentor_rating = ?, mentor_rating_comment = ?
        WHERE id = ?
      `).run(numRating, cleanComment, id);

      const mentor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.currentUserId);
      const mentorName = mentor ? mentor.name : 'Mentor';

      emitToUser(existing.learner_id, 'booking:rated', {
        bookingId: existing.id,
        mentorRating: numRating,
        mentorComment: cleanComment,
        mentorName,
        message: `${mentorName} shared positive feedback on your session!`,
      });

      const updated = getBookingById(id, req.currentUserId, db);
      return res.json({
        booking: updated,
        role: 'mentor',
        bonusPaid: false,
      });
    }

    // Learner rating Mentor
    const result = rateBooking(id, req.currentUserId, rating, comment, db);

    // After commit, emit socket events
    const learner = db.prepare('SELECT name FROM users WHERE id = ?').get(req.currentUserId);
    const learnerName = learner ? learner.name : 'Learner';

    // booking:rated to mentor
    emitToUser(result.booking.mentor_id, 'booking:rated', {
      bookingId: result.booking.id,
      rating: result.booking.rating,
      comment: result.booking.rating_comment,
      bonusPaid: result.bonusPaid,
      learnerName,
      message: result.bonusPaid
        ? `${learnerName} rated you 5 stars (+1 bonus credit)`
        : `${learnerName} rated your session ${result.booking.rating} stars`,
    });

    // ledger:updated to mentor if bonus paid
    if (result.bonusPaid) {
      emitToUser(result.booking.mentor_id, 'ledger:updated', {
        userId: result.booking.mentor_id,
        newBalance: result.mentor.new_balance,
        message: 'Received +1 bonus credit for 5-star mentorship session',
      });
    }

    res.json({
      booking: result.booking,
      bonusPaid: result.bonusPaid,
      bonusEntryId: result.bonusEntryId,
      role: 'learner',
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/rate:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to submit rating' });
  }
});

/**
 * POST /api/bookings/:id/notes
 * Accepts { summary } (participant only, completed bookings only, max 1000 chars)
 * Never overwrites final_code or language
 */
router.post('/:id/notes', (req, res) => {
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT id, learner_id, mentor_id, status FROM bookings WHERE id = ?').get(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.learner_id !== req.currentUserId && booking.mentor_id !== req.currentUserId) {
      return res.status(403).json({ error: 'Forbidden: you are not a participant in this booking' });
    }

    if (booking.status !== 'completed') {
      return res.status(409).json({ error: `Cannot save notes for booking in status '${booking.status}'; must be completed` });
    }

    const { summary } = req.body || {};
    let cleanSummary = null;
    if (summary !== undefined && summary !== null) {
      cleanSummary = String(summary).trim();
      if (cleanSummary.length > 1000) {
        return res.status(400).json({ error: 'Summary cannot exceed 1000 characters' });
      }
      if (cleanSummary.length === 0) {
        cleanSummary = null;
      }
    }

    const existing = db.prepare('SELECT id, final_code, language FROM session_notes WHERE booking_id = ?').get(id);
    const nowIso = new Date().toISOString();

    if (existing) {
      db.prepare(`
        UPDATE session_notes
        SET summary = ?, saved_at = ?
        WHERE id = ?
      `).run(cleanSummary, nowIso, existing.id);
    } else {
      const noteId = `not_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      db.prepare(`
        INSERT INTO session_notes (id, booking_id, summary, final_code, language, saved_at)
        VALUES (?, ?, ?, '', 'javascript', ?)
      `).run(noteId, id, cleanSummary, nowIso);
    }

    const updated = db.prepare(`
      SELECT id, booking_id, summary, final_code, language, saved_at
      FROM session_notes
      WHERE booking_id = ?
    `).get(id);

    res.json(updated);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`Error in POST /api/bookings/${req.params.id}/notes:`, err);
    }
    res.status(status).json({ error: err.message || 'Failed to update notes' });
  }
});

export default router;

