import express from 'express';
import { db } from '../db.js';
import {
  createBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  getBookings,
  getBookingsSummary,
} from '../bookings.js';
import { emitToUser } from '../sockets.js';

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

export default router;
