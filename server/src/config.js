// Central configuration for SkillSwap (SPEC.md Section 5 & Slice 4)

export const STARTING_CREDITS = 10;
export const SESSION_COST = 5;
export const BONUS_FOR_FIVE_STAR = 1;

export const MATCH_WEIGHTS = {
  topic: 45,
  language: 15,
  availability: 15,
  online: 10,
  level: 10,
  rating: 5,
};

export const MATCH_KEYWORDS = {
  'React': ['react', 'jsx', 'hooks', 'usestate', 'useeffect', 're-render', 'rerender', 'component', 'redux', 'zustand'],
  'Node.js': ['node', 'nodejs', 'express', 'npm', 'middleware', 'libuv', 'cluster', 'fastify'],
  'Python': ['python', 'pandas', 'django', 'flask', 'fastapi', 'numpy', 'pip', 'pytest'],
  'DSA': ['array', 'tree', 'graph', 'dp', 'dynamic programming', 'recursion', 'leetcode', 'sorting', 'binary search', 'dijkstra'],
  'SQL/Database Design': ['sql', 'query', 'join', 'schema', 'database', 'postgres', 'index', 'sqlite', 'mysql', 'prisma'],
  'System Design': ['scalab', 'architecture', 'microservice', 'cache', 'load balanc', 'distributed', 'rate limit', 'message queue'],
  'WebGL/Three.js': ['webgl', 'three.js', 'threejs', 'shader', 'glsl', 'canvas', 'rendering', '3d', 'mesh'],
  'Machine Learning': ['machine learning', 'model', 'training', 'neural', 'embedding', 'llm', 'ai', 'pytorch', 'tensorflow', 'deep learning'],
  'DevOps/Docker': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'deploy', 'pipeline', 'container', 'nginx', 'terraform'],
  'Flutter': ['flutter', 'dart', 'widget', 'stateless', 'stateful', 'cross-platform', 'mobile'],
  'Git': ['git', 'merge conflict', 'rebase', 'branch', 'commit', 'cherry-pick', 'pull request', 'stash'],
  'TypeScript': ['typescript', 'generics', 'interface', 'tsc', 'types', 'tsconfig', 'type error'],
  'Java': ['java', 'spring', 'jvm', 'spring boot', 'hibernate', 'maven', 'gradle'],
  'CSS/UI': ['css', 'flexbox', 'grid', 'layout', 'responsive', 'animation', 'styling', 'tailwind', 'sass'],
};

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
 * Pure function to calculate user level from sessions completed as mentor.
 * Level 1 = 0-2, Level 2 = 3-9, Level 3 = 10+
 * @param {number} n
 * @returns {number} 1, 2, or 3
 */
export function getLevelForSessions(n = 0) {
  const sessions = Math.max(0, Number(n) || 0);
  if (sessions >= 10) return 3;
  if (sessions >= 3) return 2;
  return 1;
}

/**
 * Alias for getLevelForSessions to preserve backwards compatibility.
 * @param {number} mentorSessionsCompleted
 * @returns {number}
 */
export function calculateLevel(mentorSessionsCompleted = 0) {
  return getLevelForSessions(mentorSessionsCompleted);
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
 * Computes level progress structure for a user.
 * { level, name, sessions_as_mentor, next_level, next_name, sessions_to_next, percent }
 * (for level 3: next_level null, next_name null, sessions_to_next 0, percent 100)
 * 
 * @param {number} mentorSessionsCompleted 
 * @returns {object}
 */
export function getLevelProgress(mentorSessionsCompleted = 0) {
  const n = Math.max(0, Number(mentorSessionsCompleted) || 0);
  const level = getLevelForSessions(n);
  const name = getLevelBadge(level);

  if (level === 3) {
    return {
      level: 3,
      name,
      sessions_as_mentor: n,
      next_level: null,
      next_name: null,
      sessions_to_next: 0,
      percent: 100,
    };
  }

  if (level === 2) {
    const sessionsToNext = Math.max(0, 10 - n);
    // Progress within Level 2 (3 to 10 sessions = span of 7)
    const percent = Math.min(100, Math.round(((n - 3) / 7) * 100));
    return {
      level: 2,
      name,
      sessions_as_mentor: n,
      next_level: 3,
      next_name: 'Mentor',
      sessions_to_next: sessionsToNext,
      percent,
    };
  }

  // Level 1: 0 to 3 sessions
  const sessionsToNext = Math.max(0, 3 - n);
  const percent = Math.min(100, Math.round((n / 3) * 100));
  return {
    level: 1,
    name,
    sessions_as_mentor: n,
    next_level: 2,
    next_name: 'Helper',
    sessions_to_next: sessionsToNext,
    percent,
  };
}

/**
 * Detailed badges array covering all earned and locked badges.
 * 
 * @param {object} stats
 * @param {number} stats.mentorSessionsCompleted
 * @param {number} stats.acceptedBookingsCount
 * @returns {Array<{ key: string, name: string, description: string, earned: boolean, progress: string }>}
 */
export function getBadgeDetails({ mentorSessionsCompleted = 0, acceptedBookingsCount = 0 } = {}) {
  const m = Math.max(0, Number(mentorSessionsCompleted) || 0);
  const a = Math.max(0, Number(acceptedBookingsCount) || 0);

  return [
    {
      key: 'newcomer',
      name: BADGE_NAMES.LEVEL_1,
      description: 'Welcome to SkillSwap! Completed 0-2 sessions as mentor (Level 1)',
      earned: true, // All registered users earn Level 1 Newcomer
      progress: '1/1',
    },
    {
      key: 'helper',
      name: BADGE_NAMES.LEVEL_2,
      description: 'Completed 3 or more sessions as mentor (Level 2)',
      earned: m >= 3,
      progress: `${Math.min(m, 3)}/3`,
    },
    {
      key: 'mentor',
      name: BADGE_NAMES.LEVEL_3,
      description: 'Completed 10 or more sessions as mentor (Level 3)',
      earned: m >= 10,
      progress: `${Math.min(m, 10)}/10`,
    },
    {
      key: 'first_session',
      name: BADGE_NAMES.FIRST_SESSION,
      description: 'Completed your first mentorship session as a mentor',
      earned: m >= 1,
      progress: `${Math.min(m, 1)}/1`,
    },
    {
      key: 'first_10_sessions',
      name: BADGE_NAMES.FIRST_10_SESSIONS,
      description: 'Completed 10 mentorship sessions as a mentor',
      earned: m >= 10,
      progress: `${Math.min(m, 10)}/10`,
    },
    {
      key: 'quick_responder',
      name: BADGE_NAMES.QUICK_RESPONDER,
      description: 'Accepted 3 or more booking requests as a mentor',
      earned: a >= 3,
      progress: `${Math.min(a, 3)}/3`,
    },
  ];
}

/**
 * Gets all earned badge names (strings) based on user stats.
 * Preserves backwards compatibility with Slice 1 & 2.
 * 
 * @param {object} stats
 * @param {number} stats.mentorSessionsCompleted
 * @param {number} stats.acceptedBookingsCount
 * @returns {string[]}
 */
export function calculateBadges({ mentorSessionsCompleted = 0, acceptedBookingsCount = 0 } = {}) {
  const details = getBadgeDetails({ mentorSessionsCompleted, acceptedBookingsCount });
  return details.filter((b) => b.earned).map((b) => b.name);
}

// WebRTC Audio Calling Configuration (Feature: Voice in the room)
export const RTC_ENABLED = process.env.RTC_ENABLED !== 'false' && process.env.RTC_ENABLED !== '0';
export const RTC_SIGNAL_MAX_BYTES = Number(process.env.RTC_SIGNAL_MAX_BYTES) || 16384;
export const RTC_RATE_LIMIT = Number(process.env.RTC_RATE_LIMIT) || 60; // 60 signaling messages per 10 s per socket
export const RTC_STUN_URLS = (process.env.RTC_STUN_URLS || 'stun:stun.l.google.com:19302')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const RTC_TURN_URL = process.env.RTC_TURN_URL ? process.env.RTC_TURN_URL.trim() : null;
export const RTC_TURN_USERNAME = process.env.RTC_TURN_USERNAME ? process.env.RTC_TURN_USERNAME.trim() : null;
export const RTC_TURN_CREDENTIAL = process.env.RTC_TURN_CREDENTIAL ? process.env.RTC_TURN_CREDENTIAL.trim() : null;

