import express from 'express';
import { db } from '../db.js';
import { getUserAvailableCredits } from '../ledger.js';
import { calculateLevel, getLevelBadge, LEVEL_RULES, SESSION_COST } from '../config.js';

const router = express.Router();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Computes the next upcoming availability slot label from current local time.
 * @param {Array<{day_of_week: number, start_hour: number, end_hour: number}>} slots 
 * @param {Date} [currentDate=new Date()]
 * @returns {string | null}
 */
export function calculateNextSlotLabel(slots, currentDate = new Date()) {
  if (!slots || slots.length === 0) return null;

  const currentDay = currentDate.getDay();
  const currentHour = currentDate.getHours();

  // Find the slot with minimum hours until it starts or ends
  let closestSlot = null;
  let minHoursAway = Infinity;
  let isTodayActive = false;

  for (const slot of slots) {
    let dayDiff = slot.day_of_week - currentDay;
    if (dayDiff < 0) {
      dayDiff += 7;
    }

    let hoursAway;
    if (dayDiff === 0) {
      if (currentHour < slot.end_hour) {
        // Today and still upcoming or currently active
        hoursAway = Math.max(0, slot.start_hour - currentHour);
        if (hoursAway < minHoursAway) {
          minHoursAway = hoursAway;
          closestSlot = slot;
          isTodayActive = currentHour >= slot.start_hour && currentHour < slot.end_hour;
        }
        continue;
      } else {
        // Slot today already passed, rolls over to next week (+7 days)
        dayDiff = 7;
      }
    }

    hoursAway = dayDiff * 24 + (slot.start_hour - currentHour);
    if (hoursAway < minHoursAway) {
      minHoursAway = hoursAway;
      closestSlot = slot;
      isTodayActive = false;
    }
  }

  if (!closestSlot) return null;

  const formatTime = (h) => `${h.toString().padStart(2, '0')}:00`;
  const timeRange = `${formatTime(closestSlot.start_hour)}-${formatTime(closestSlot.end_hour)}`;

  const diffDays = Math.floor(minHoursAway / 24);
  const slotDay = closestSlot.day_of_week;

  if (slotDay === currentDay && minHoursAway < 24) {
    return isTodayActive ? `Today ${timeRange} (Active now)` : `Today ${timeRange}`;
  }
  if ((currentDay + 1) % 7 === slotDay && minHoursAway < 48) {
    return `Tomorrow ${timeRange}`;
  }
  return `${DAY_NAMES[slotDay]} ${timeRange}`;
}

/**
 * GET /api/meta
 * Returns distinct topics, distinct languages, and level info for filters.
 */
export function getMetaHandler(req, res) {
  try {
    // Distinct skill topics from user_skills
    const topicsRows = db.prepare(`
      SELECT DISTINCT topic 
      FROM user_skills 
      ORDER BY topic ASC
    `).all();
    const topics = topicsRows.map((r) => r.topic);

    // Distinct languages from users
    const langRows = db.prepare(`
      SELECT languages 
      FROM users 
      WHERE languages IS NOT NULL AND languages != ''
    `).all();

    const langSet = new Set();
    for (const row of langRows) {
      if (row.languages) {
        row.languages.split(',').forEach((l) => {
          const trimmed = l.trim();
          if (trimmed) langSet.add(trimmed);
        });
      }
    }
    const languages = Array.from(langSet).sort();

    // Levels metadata
    const levels = Object.values(LEVEL_RULES).map((l) => ({
      level: l.level,
      name: l.name,
      minSessions: l.minSessions,
      maxSessions: l.maxSessions,
    }));

    const days = DAY_NAMES.map((label, day) => ({ day, label }));

    const dayparts = [
      { id: 'morning', label: 'Morning (<12:00)' },
      { id: 'afternoon', label: 'Afternoon (12:00-17:00)' },
      { id: 'evening', label: 'Evening (17:00+)' },
    ];

    const isDemoMode = process.env.DEMO_MODE !== undefined
      ? process.env.DEMO_MODE === 'true'
      : process.env.NODE_ENV !== 'production';

    res.json({
      topics,
      languages,
      levels,
      days,
      dayparts,
      session_cost: SESSION_COST,
      demo_mode: isDemoMode,
    });
  } catch (err) {
    console.error('Error in GET /api/meta:', err);
    res.status(500).json({ error: 'Failed to retrieve metadata' });
  }
}

/**
 * GET /api/peers
 * Directory search and filter endpoint per SPEC Section 7.
 * Requires X-User-Id header to compute booking eligibility and exclude self.
 */
router.get('/', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    // Verify current user exists
    const currentUser = db.prepare('SELECT id FROM users WHERE id = ?').get(currentUserId);
    if (!currentUser) {
      return res.status(401).json({ error: 'Invalid X-User-Id: user does not exist' });
    }

    // Get current learner stats for eligibility computation
    const learnerMentorSessions = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE mentor_id = ? AND status = 'completed'
    `).get(currentUserId).count;

    const learnerLevel = calculateLevel(learnerMentorSessions);
    const learnerAvailableCredits = getUserAvailableCredits(currentUserId);

    // Parse query filters
    const {
      q,
      topic,
      language,
      day,
      daypart,
      onlineNow,
      minLevel,
      sort = 'default',
    } = req.query;

    // Build parameterized query excluding self
    const whereClauses = ['u.id != ?'];
    const params = [currentUserId];

    // Filter: q (case-insensitive partial match on name, handle, bio, or skill topic)
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      whereClauses.push(`(
        LOWER(u.name) LIKE ? OR
        LOWER(u.handle) LIKE ? OR
        LOWER(COALESCE(u.bio, '')) LIKE ? OR
        EXISTS (
          SELECT 1 FROM user_skills us2 
          WHERE us2.user_id = u.id AND LOWER(us2.topic) LIKE ?
        )
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Filter: topic
    if (topic && topic.trim()) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM user_skills us_filter 
        WHERE us_filter.user_id = u.id AND LOWER(us_filter.topic) = LOWER(?)
      )`);
      params.push(topic.trim());
    }

    // Filter: language
    if (language && language.trim()) {
      whereClauses.push(`LOWER(u.languages) LIKE ?`);
      params.push(`%${language.trim().toLowerCase()}%`);
    }

    // Filter: day (0-6)
    if (day !== undefined && day !== null && day !== '') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM availability_slots as_day 
        WHERE as_day.user_id = u.id AND as_day.day_of_week = ?
      )`);
      params.push(Number(day));
    }

    // Filter: daypart (morning <12, afternoon 12-17, evening 17+)
    if (daypart && daypart.trim()) {
      const dp = daypart.trim().toLowerCase();
      if (dp === 'morning') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM availability_slots as_dp 
          WHERE as_dp.user_id = u.id AND as_dp.start_hour < 12
        )`);
      } else if (dp === 'afternoon') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM availability_slots as_dp 
          WHERE as_dp.user_id = u.id AND as_dp.start_hour < 17 AND as_dp.end_hour > 12
        )`);
      } else if (dp === 'evening') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM availability_slots as_dp 
          WHERE as_dp.user_id = u.id AND as_dp.end_hour > 17
        )`);
      }
    }

    // Filter: onlineNow
    if (onlineNow === 'true' || onlineNow === '1') {
      whereClauses.push(`u.is_online = 1`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Fetch matching users
    const querySql = `
      SELECT 
        u.id, 
        u.name, 
        u.handle, 
        u.avatar_color, 
        u.bio, 
        u.experience, 
        u.languages, 
        u.is_online, 
        u.created_at,
        (
          SELECT COUNT(*) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.status = 'completed'
        ) AS sessions_completed_as_mentor,
        (
          SELECT ROUND(AVG(rating), 1) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.rating IS NOT NULL
        ) AS rating_avg,
        (
          SELECT COUNT(rating) 
          FROM bookings b 
          WHERE b.mentor_id = u.id AND b.rating IS NOT NULL
        ) AS rating_count
      FROM users u
      ${whereSql}
    `;

    const rawPeers = db.prepare(querySql).all(...params);

    // Hydrate skills, slots, level, badge, next slot label, and booking eligibility
    const hydratedPeers = rawPeers.map((p) => {
      const mentorSessions = Number(p.sessions_completed_as_mentor) || 0;
      const level = calculateLevel(mentorSessions);
      const badge = getLevelBadge(level);

      const skills = db.prepare(`
        SELECT topic FROM user_skills WHERE user_id = ? ORDER BY topic ASC
      `).all(p.id).map((r) => r.topic);

      const slots = db.prepare(`
        SELECT id, day_of_week, start_hour, end_hour 
        FROM availability_slots 
        WHERE user_id = ? 
        ORDER BY day_of_week ASC, start_hour ASC
      `).all(p.id);

      const nextSlotLabel = calculateNextSlotLabel(slots);

      // Eligibility computation for current user
      let canBook = true;
      let blockReason = null;

      if (learnerAvailableCredits < SESSION_COST) {
        canBook = false;
        blockReason = `Not enough available credits (need ${SESSION_COST} cr, have ${learnerAvailableCredits} cr)`;
      } else if (level < learnerLevel) {
        canBook = false;
        blockReason = `Mentor level (Level ${level}) must be greater than or equal to your level (Level ${learnerLevel})`;
      }

      const levelRelation = level > learnerLevel ? 'higher' : level === learnerLevel ? 'same' : 'lower';

      return {
        id: p.id,
        name: p.name,
        handle: p.handle,
        avatar_color: p.avatar_color,
        bio: p.bio,
        experience: p.experience,
        languages: p.languages ? p.languages.split(',').map((s) => s.trim()) : [],
        is_online: Boolean(p.is_online),
        level,
        badge,
        skills,
        slots,
        rating_avg: p.rating_avg !== null ? Number(p.rating_avg) : null,
        rating_count: Number(p.rating_count) || 0,
        sessions_completed_as_mentor: mentorSessions,
        next_slot_label: nextSlotLabel,
        can_book: canBook,
        block_reason: blockReason,
        level_relation: levelRelation,
      };
    });

    // Post-filter minLevel if specified
    let filteredPeers = hydratedPeers;
    if (minLevel) {
      const minLvlNum = Number(minLevel);
      filteredPeers = filteredPeers.filter((p) => p.level >= minLvlNum);
    }

    // Sort: default (online first, then higher level, then higher rating)
    filteredPeers.sort((a, b) => {
      if (sort === 'level') {
        if (b.level !== a.level) return b.level - a.level;
        const rDiff = (b.rating_avg || 0) - (a.rating_avg || 0);
        if (rDiff !== 0) return rDiff;
        return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
      }
      if (sort === 'rating') {
        const rDiff = (b.rating_avg || 0) - (a.rating_avg || 0);
        if (rDiff !== 0) return rDiff;
        if (b.rating_count !== a.rating_count) return b.rating_count - a.rating_count;
        return b.level - a.level;
      }
      if (sort === 'online') {
        if (b.is_online !== a.is_online) return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
        if (b.level !== a.level) return b.level - a.level;
        return (b.rating_avg || 0) - (a.rating_avg || 0);
      }

      // Default sort: online first, then higher level, then higher rating
      if (b.is_online !== a.is_online) return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
      if (b.level !== a.level) return b.level - a.level;
      const rDiff = (b.rating_avg || 0) - (a.rating_avg || 0);
      if (rDiff !== 0) return rDiff;
      return a.name.localeCompare(b.name);
    });

    res.json(filteredPeers);
  } catch (err) {
    console.error('Error in GET /api/peers:', err);
    res.status(500).json({ error: 'Failed to retrieve peers' });
  }
});

export default router;
