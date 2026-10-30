// Central configuration for SkillSwap (SPEC.md Section 5)

export const STARTING_CREDITS = 10;
export const SESSION_COST = 5;

export const LEVEL_RULES = {
  1: { level: 1, name: 'Newcomer', minSessions: 0, maxSessions: 2 },
  2: { level: 2, name: 'Helper', minSessions: 3, maxSessions: 9 },
  3: { level: 3, name: 'Mentor', minSessions: 10, maxSessions: Infinity },
};

export const BADGE_NAMES = {
  LEVEL_1: 'Newcomer',
  LEVEL_2: 'Helper',
  LEVEL_3: 'Mentor',
  FIRST_SESSION: 'First Session',
  FIRST_10_SESSIONS: 'First 10 Sessions',
  QUICK_RESPONDER: 'Quick Responder',
};

/**
 * Calculates user level based on sessions completed as mentor.
 * @param {number} mentorSessionsCompleted
 * @returns {number} 1, 2, or 3
 */
export function calculateLevel(mentorSessionsCompleted = 0) {
  if (mentorSessionsCompleted >= 10) return 3;
  if (mentorSessionsCompleted >= 3) return 2;
  return 1;
}

/**
 * Gets the primary level badge name.
 * @param {number} level
 * @returns {string}
 */
export function getLevelBadge(level = 1) {
  if (level === 3) return BADGE_NAMES.LEVEL_3;
  if (level === 2) return BADGE_NAMES.LEVEL_2;
  return BADGE_NAMES.LEVEL_1;
}

/**
 * Gets all earned badges based on user stats.
 * @param {object} stats
 * @param {number} stats.mentorSessionsCompleted
 * @param {number} stats.acceptedBookingsCount
 * @returns {string[]}
 */
export function calculateBadges({ mentorSessionsCompleted = 0, acceptedBookingsCount = 0 } = {}) {
  const level = calculateLevel(mentorSessionsCompleted);
  const badges = [getLevelBadge(level)];

  if (mentorSessionsCompleted >= 1) {
    badges.push(BADGE_NAMES.FIRST_SESSION);
  }
  if (mentorSessionsCompleted >= 10) {
    badges.push(BADGE_NAMES.FIRST_10_SESSIONS);
  }
  if (acceptedBookingsCount >= 3) {
    badges.push(BADGE_NAMES.QUICK_RESPONDER);
  }

  return badges;
}
