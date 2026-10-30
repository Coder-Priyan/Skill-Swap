import express from 'express';
import { db } from '../db.js';
import { getUserBalance, getUserAvailableCredits, getUserReservedCredits } from '../ledger.js';
import { calculateLevel, getLevelBadge, calculateBadges, getLevelProgress, getBadgeDetails } from '../config.js';

const router = express.Router();

/**
 * Middleware to validate X-User-Id header if present
 */
export function validateUserHeader(req, res, next) {
  const userId = req.header('X-User-Id');
  if (userId) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid X-User-Id: user does not exist' });
    }
    req.currentUserId = userId;
  }
  next();
}

/**
 * GET /api/users
 * Returns list of user summaries including balance, available credits, reserved credits, level, and badge.
 */
router.get('/', validateUserHeader, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, handle, avatar_color, bio, experience, languages, is_online, created_at
      FROM users
      ORDER BY name ASC
    `).all();

    const result = users.map((u) => {
      const mentorSessions = db.prepare(`
        SELECT COUNT(*) AS count 
        FROM bookings 
        WHERE mentor_id = ? AND status = 'completed'
      `).get(u.id).count;

      const level = calculateLevel(mentorSessions);
      const badge = getLevelBadge(level);
      const balance = getUserBalance(u.id);
      const reservedCredits = getUserReservedCredits(u.id);
      const availableCredits = getUserAvailableCredits(u.id);

      return {
        id: u.id,
        name: u.name,
        handle: u.handle,
        avatar_color: u.avatar_color,
        bio: u.bio,
        experience: u.experience,
        languages: u.languages ? u.languages.split(',').map((s) => s.trim()) : [],
        is_online: Boolean(u.is_online),
        level,
        badge,
        balance,
        reserved_credits: reservedCredits,
        available_credits: availableCredits,
        created_at: u.created_at,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error in GET /api/users:', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

/**
 * GET /api/users/:id
 * Returns detailed profile for user including balance = SUM(delta),
 * available credits, level, badges, skills, slots, and stats.
 */
router.get('/:id', validateUserHeader, (req, res) => {
  try {
    const { id } = req.params;
    const user = db.prepare(`
      SELECT id, name, handle, avatar_color, bio, experience, languages, is_online, created_at
      FROM users
      WHERE id = ?
    `).get(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Skills
    const skills = db.prepare(`
      SELECT topic FROM user_skills WHERE user_id = ? ORDER BY topic ASC
    `).all(id).map((row) => row.topic);

    // Availability slots
    const slots = db.prepare(`
      SELECT id, day_of_week, start_hour, end_hour 
      FROM availability_slots 
      WHERE user_id = ? 
      ORDER BY day_of_week ASC, start_hour ASC
    `).all(id);

    // Stats
    const mentorSessions = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE mentor_id = ? AND status = 'completed'
    `).get(id).count;

    const learnerSessions = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE learner_id = ? AND status = 'completed'
    `).get(id).count;

    const acceptedBookings = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE mentor_id = ? AND accepted_at IS NOT NULL
    `).get(id).count;

    const ratingRow = db.prepare(`
      SELECT AVG(rating) AS avg_rating, COUNT(rating) AS rating_count
      FROM bookings 
      WHERE mentor_id = ? AND rating IS NOT NULL
    `).get(id);

    const totalCreditsEarned = db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS total 
      FROM ledger_entries 
      WHERE user_id = ? AND kind IN ('session_earn', 'bonus')
    `).get(id).total;

    const totalCreditsSpent = db.prepare(`
      SELECT COALESCE(SUM(ABS(delta)), 0) AS total 
      FROM ledger_entries 
      WHERE user_id = ? AND kind = 'session_spend'
    `).get(id).total;

    // Check if requesting user is viewing their own profile
    const currentUserId = req.header('X-User-Id');
    const isSelf = currentUserId === id;

    // Credit calculations via ledger.js (Section 4) - only for self
    let balance;
    let reservedCredits;
    let availableCredits;
    if (isSelf) {
      balance = getUserBalance(id);
      reservedCredits = getUserReservedCredits(id);
      availableCredits = getUserAvailableCredits(id);
    }

    // Level and badge rules (Section 5 & Slice 4)
    const level = calculateLevel(mentorSessions);
    const badge = getLevelBadge(level);
    const badges = calculateBadges({
      mentorSessionsCompleted: mentorSessions,
      acceptedBookingsCount: acceptedBookings,
    });
    const levelProgress = getLevelProgress(mentorSessions);
    const badgeDetails = getBadgeDetails({
      mentorSessionsCompleted: mentorSessions,
      acceptedBookingsCount: acceptedBookings,
    });

    const stats = {
      sessions_completed_as_mentor: mentorSessions,
      sessions_completed_as_learner: learnerSessions,
      total_sessions_completed: mentorSessions + learnerSessions,
      rating_avg: ratingRow.avg_rating ? Math.round(ratingRow.avg_rating * 10) / 10 : null,
      rating_count: ratingRow.rating_count || 0,
    };

    if (isSelf) {
      stats.total_credits_earned = totalCreditsEarned;
      stats.total_credits_spent = totalCreditsSpent;
    }

    const profile = {
      id: user.id,
      name: user.name,
      handle: user.handle,
      avatar_color: user.avatar_color,
      bio: user.bio,
      experience: user.experience,
      languages: user.languages ? user.languages.split(',').map((s) => s.trim()) : [],
      is_online: Boolean(user.is_online),
      created_at: user.created_at,
      level,
      badge,
      badges,
      level_progress: levelProgress,
      badge_details: badgeDetails,
      skills,
      slots,
      stats,
    };

    if (isSelf) {
      profile.balance = balance;
      profile.reserved_credits = reservedCredits;
      profile.available_credits = availableCredits;
    }

    res.json(profile);
  } catch (err) {
    console.error(`Error in GET /api/users/${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

export default router;
