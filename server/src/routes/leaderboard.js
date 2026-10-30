import express from 'express';
import { db } from '../db.js';
import { calculateLevel, getLevelBadge } from '../config.js';

const router = express.Router();

/**
 * GET /api/leaderboard
 * Top helpers ranked by sessions completed as mentor DESC, then rating_avg DESC, then total_earned DESC.
 * Accessible to any valid user.
 * Contains NO per-user balances.
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

    // Query all users with their mentor stats and earnings
    const rawUsers = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.handle,
        u.avatar_color,
        (
          SELECT COUNT(*) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.status = 'completed'
        ) AS sessions_as_mentor,
        (
          SELECT ROUND(AVG(b.rating), 1) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.status = 'completed' AND b.rating IS NOT NULL
        ) AS rating_avg,
        (
          SELECT COUNT(b.rating) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.status = 'completed' AND b.rating IS NOT NULL
        ) AS rating_count,
        (
          SELECT COALESCE(SUM(le.delta), 0) 
          FROM ledger_entries le 
          WHERE le.user_id = u.id AND le.kind IN ('session_earn', 'bonus')
        ) AS total_earned
      FROM users u
    `).all();

    // Filter to ONLY users with >= 1 completed session as mentor
    const activeMentors = rawUsers
      .filter((u) => Number(u.sessions_as_mentor) >= 1)
      .map((u) => {
        const sessions = Number(u.sessions_as_mentor);
        const level = calculateLevel(sessions);
        const badge = getLevelBadge(level);
        return {
          id: u.id,
          name: u.name,
          handle: u.handle,
          avatar_color: u.avatar_color,
          level,
          badge,
          sessions_as_mentor: sessions,
          rating_avg: u.rating_avg !== null ? Number(u.rating_avg) : null,
          rating_count: Number(u.rating_count) || 0,
          total_earned: Number(u.total_earned) || 0,
        };
      });

    // Rank tie-breakers:
    // 1. sessions_as_mentor DESC
    // 2. rating_avg DESC (nulls last)
    // 3. total_earned DESC
    // 4. name ASC (deterministic)
    activeMentors.sort((a, b) => {
      if (b.sessions_as_mentor !== a.sessions_as_mentor) {
        return b.sessions_as_mentor - a.sessions_as_mentor;
      }
      const rA = a.rating_avg !== null ? a.rating_avg : -1;
      const rB = b.rating_avg !== null ? b.rating_avg : -1;
      if (rB !== rA) {
        return rB - rA;
      }
      if (b.total_earned !== a.total_earned) {
        return b.total_earned - a.total_earned;
      }
      return a.name.localeCompare(b.name);
    });

    // Assign 1-indexed ranks
    const ranked = activeMentors.map((u, idx) => ({
      rank: idx + 1,
      ...u,
    }));

    const top10 = ranked.slice(0, 10);
    const myEntry = ranked.find((u) => u.id === currentUserId) || null;

    res.json({
      leaderboard: top10,
      my_rank: myEntry ? { ...myEntry } : null,
      total_mentors: ranked.length,
      total_helpers: ranked.length, // backwards-compatible alias
    });
  } catch (err) {
    console.error('Error in GET /api/leaderboard:', err);
    res.status(500).json({ error: 'Failed to retrieve leaderboard' });
  }
});

export default router;
