import { MATCH_WEIGHTS, MATCH_KEYWORDS } from './config.js';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Checks whether an availability slot overlaps the specified day and/or daypart.
 * Reuses the same overlap definition as the peers route:
 * - morning: start_hour < 12
 * - afternoon: start_hour < 17 && end_hour > 12
 * - evening: end_hour > 17
 * 
 * @param {object} slot
 * @param {object} query
 * @param {number|string} [query.day]
 * @param {string} [query.daypart]
 * @returns {boolean}
 */
export function slotMatchesAvailability(slot, { day, daypart } = {}) {
  if (!slot) return false;

  // Day filter check (0 to 6)
  if (day !== undefined && day !== null && day !== '') {
    if (Number(slot.day_of_week) !== Number(day)) {
      return false;
    }
  }

  // Daypart filter check
  if (daypart && String(daypart).trim()) {
    const dp = String(daypart).trim().toLowerCase();
    if (dp === 'morning') {
      if (!(slot.start_hour < 12)) return false;
    } else if (dp === 'afternoon') {
      if (!(slot.start_hour < 17 && slot.end_hour > 12)) return false;
    } else if (dp === 'evening') {
      if (!(slot.end_hour > 17)) return false;
    }
  }

  return true;
}

/**
 * Helper to construct boundary-aware RegExp for matching topic keywords/phrases.
 * Ensures word-boundary isolation so "git" does not match "digit" and "java" does not match "javascript".
 * Allows stems like "scalab" and "load balanc" to match related extensions.
 * 
 * @param {string} kw
 * @returns {RegExp}
 */
function buildKeywordRegex(kw) {
  const trimmed = kw.trim();
  const escaped = trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  // Stems explicitly supported
  if (trimmed === 'scalab' || trimmed === 'load balanc') {
    return new RegExp(`(?<=[^a-zA-Z0-9_]|^)${escaped}[a-zA-Z]*`, 'i');
  }

  // General keywords with boundary awareness and optional plural/participle suffixes
  return new RegExp(`(?<=[^a-zA-Z0-9_]|^)${escaped}(?:s|es|ing|ed|ers|er)?(?=[^a-zA-Z0-9_]|$)`, 'i');
}

/**
 * PURE FUNCTION: Detects topics mentioned in problem text.
 * Case-insensitive matching against MATCH_KEYWORDS in config.js.
 * Only topics that exist in availableTopics are returned.
 * Returns topics ordered by keyword hit count DESC, then alphabetically.
 * 
 * @param {string} problemText
 * @param {string[]} availableTopics
 * @returns {string[]}
 */
export function detectTopics(problemText = '', availableTopics = []) {
  if (!problemText || typeof problemText !== 'string' || !availableTopics || !Array.isArray(availableTopics)) {
    return [];
  }

  const text = problemText.trim();
  if (!text) return [];

  const availableSet = new Set(availableTopics);
  const hitsByTopic = [];

  for (const [topic, keywords] of Object.entries(MATCH_KEYWORDS)) {
    if (!availableSet.has(topic)) continue;

    let hitCount = 0;
    for (const kw of keywords) {
      const rx = buildKeywordRegex(kw);
      const matches = text.match(new RegExp(rx.source, 'gi'));
      if (matches) {
        hitCount += matches.length;
      }
    }

    if (hitCount > 0) {
      hitsByTopic.push({ topic, hits: hitCount });
    }
  }

  // Order by hit count DESC, then alphabetically ASC
  hitsByTopic.sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    return a.topic.localeCompare(b.topic);
  });

  return hitsByTopic.map((item) => item.topic);
}

/**
 * PURE FUNCTION: Detects spoken languages mentioned in problem text.
 * Case-insensitive matching with word boundaries against knownLanguages list from DB.
 * Languages should not match substrings of other words (e.g. "Hindi" inside "hindsight").
 * 
 * @param {string} problemText
 * @param {string[]} knownLanguages - List of canonical language names from the DB
 * @returns {string[]}
 */
export function detectLanguages(problemText = '', knownLanguages = []) {
  if (!problemText || typeof problemText !== 'string' || !knownLanguages || !Array.isArray(knownLanguages)) {
    return [];
  }

  const text = problemText.trim();
  if (!text) return [];

  const hits = [];

  for (const lang of knownLanguages) {
    if (!lang || typeof lang !== 'string') continue;
    const trimmed = lang.trim();
    if (!trimmed) continue;

    const escaped = trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Word boundary regex: ensure not preceded or followed by word characters
    const rx = new RegExp(`(?<=[^a-zA-Z0-9_]|^)${escaped}(?=[^a-zA-Z0-9_]|$)`, 'ig');
    const match = rx.exec(text);
    if (match) {
      hits.push({ lang: trimmed, index: match.index });
    }
  }

  // Preserve order of appearance in text
  hits.sort((a, b) => a.index - b.index);

  // Return unique canonical names
  const result = [];
  for (const h of hits) {
    if (!result.some((r) => r.toLowerCase() === h.lang.toLowerCase())) {
      result.push(h.lang);
    }
  }
  return result;
}

/**
 * PURE FUNCTION: Scores a mentor against learner preferences.
 * 
 * @param {object} input
 * @param {object} input.mentor - Peer object with skills, slots, level, is_online, rating_avg, rating_count
 * @param {object} input.learner - Learner object with level, languages
 * @param {string[]} [input.usedTopics] - Topics used for matching
 * @param {string[]} [input.languages] - Languages used for matching
 * @param {string[]} [input.detectedLanguages] - Explicitly detected languages from query text
 * @param {number|string} [input.day] - Optional preferred day (0-6)
 * @param {string} [input.daypart] - Optional preferred daypart (morning|afternoon|evening)
 * @param {boolean} [input.onlineNow] - Optional online preference
 * @returns {{ score: number, max_possible: number, breakdown: Array, reasons: Array, suggested_slot_id: string|null }}
 */
export function scoreMentor({
  mentor,
  learner = {},
  usedTopics = [],
  languages = [],
  detectedLanguages = [],
  day,
  daypart,
  onlineNow,
}) {
  if (!mentor) {
    throw new Error('scoreMentor requires a mentor object');
  }

  const mentorSkills = Array.isArray(mentor.skills) ? mentor.skills : [];
  const mentorSlots = Array.isArray(mentor.slots) ? mentor.slots : [];
  const mentorLangs = (mentor.languages || []).map((l) => String(l).toLowerCase().trim());
  const learnerLevel = Number(learner.level) || 1;
  const mentorLevel = Number(mentor.level) || 1;

  const breakdown = [];
  const reasons = [];

  // 1. Topic component (Weight: 45)
  const topicSignaled = Boolean(usedTopics && usedTopics.length > 0);
  let topicPoints = 0;
  let topicOk = false;
  let topicDetail = 'No topic signaled';

  if (topicSignaled) {
    const matchedCount = usedTopics.filter((ut) =>
      mentorSkills.some((ms) => ms.toLowerCase() === ut.toLowerCase())
    ).length;

    topicPoints = MATCH_WEIGHTS.topic * (matchedCount / usedTopics.length);
    topicOk = matchedCount > 0;
    topicDetail = `${matchedCount}/${usedTopics.length} topics matched`;

    // Add per-topic reason chips
    for (const ut of usedTopics) {
      const hasTopic = mentorSkills.some((ms) => ms.toLowerCase() === ut.toLowerCase());
      reasons.push({ key: 'topic', label: ut, ok: hasTopic });
    }
  }

  breakdown.push({
    key: 'topic',
    label: 'Topic Match',
    weight: MATCH_WEIGHTS.topic,
    points: topicSignaled ? topicPoints : 0,
    signaled: topicSignaled,
    ok: topicOk,
    detail: topicDetail,
  });

  // 2. Language component (Weight: 15)
  // Always signaled; defaults to learner's preferred languages
  const targetLangs = (languages || []).map((l) => String(l).toLowerCase().trim());
  const detectedLangs = (detectedLanguages || []).map((l) => String(l).toLowerCase().trim());

  let hasLangMatch = false;
  let primaryLang = null;

  if (detectedLangs.length > 0) {
    // If specific languages were detected in query, mentor must speak at least one detected language
    const matchedDetected = detectedLangs.filter((dl) => mentorLangs.includes(dl));
    if (matchedDetected.length > 0) {
      hasLangMatch = true;
      primaryLang = matchedDetected[0].charAt(0).toUpperCase() + matchedDetected[0].slice(1);
    }
  } else {
    // Standard preference matching in targetLangs order
    const matchedLangs = targetLangs.filter((tl) => mentorLangs.includes(tl));
    if (matchedLangs.length > 0) {
      hasLangMatch = true;
      primaryLang = matchedLangs[0].charAt(0).toUpperCase() + matchedLangs[0].slice(1);
    }
  }

  const langPoints = hasLangMatch ? MATCH_WEIGHTS.language : 0;

  breakdown.push({
    key: 'language',
    label: 'Language',
    weight: MATCH_WEIGHTS.language,
    points: langPoints,
    signaled: true,
    ok: hasLangMatch,
    detail: hasLangMatch
      ? `Speaks ${primaryLang}`
      : `Does not share preferred languages`,
  });

  if (hasLangMatch) {
    reasons.push({ key: 'language', label: primaryLang, ok: true });
  } else {
    const requested = detectedLangs.length > 0
      ? detectedLangs.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')
      : targetLangs.length > 0
        ? targetLangs.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')
        : 'Languages';
    reasons.push({ key: 'language', label: requested, ok: false });
  }

  // 3. Availability component (Weight: 15)
  // Signaled only when day or daypart is given
  const availSignaled = (day !== undefined && day !== null && day !== '') || Boolean(daypart);
  let suggestedSlotId = null;
  let matchingSlot = null;
  let availPoints = 0;
  let availOk = false;
  let availDetail = 'No time preference signaled';

  if (availSignaled) {
    matchingSlot = mentorSlots.find((s) => slotMatchesAvailability(s, { day, daypart })) || null;
    if (matchingSlot) {
      suggestedSlotId = matchingSlot.id;
      availPoints = MATCH_WEIGHTS.availability;
      availOk = true;
      const dayName = DAY_NAMES[matchingSlot.day_of_week] || 'Day';
      availDetail = `${dayName} ${matchingSlot.start_hour}:00-${matchingSlot.end_hour}:00`;
      reasons.push({ key: 'availability', label: `${dayName} slot`, ok: true });
    } else {
      availDetail = 'No matching slot found';
      reasons.push({ key: 'availability', label: 'No matching slot', ok: false });
    }
  }

  breakdown.push({
    key: 'availability',
    label: 'Availability',
    weight: MATCH_WEIGHTS.availability,
    points: availPoints,
    signaled: availSignaled,
    ok: availOk,
    detail: availDetail,
  });

  // 4. Online component (Weight: 10)
  // Always signaled
  const isOnline = Boolean(mentor.is_online);
  const onlinePoints = isOnline ? MATCH_WEIGHTS.online : 0;

  breakdown.push({
    key: 'online',
    label: 'Online Status',
    weight: MATCH_WEIGHTS.online,
    points: onlinePoints,
    signaled: true,
    ok: isOnline,
    detail: isOnline ? 'Online now' : 'Currently offline',
  });

  reasons.push({
    key: 'online',
    label: isOnline ? 'Online now' : 'Offline',
    ok: isOnline,
  });

  // 5. Level component (Weight: 10)
  // Always signaled
  let levelPoints = 0;
  let levelOk = false;
  let levelDetail = '';

  if (mentorLevel > learnerLevel) {
    levelPoints = MATCH_WEIGHTS.level;
    levelOk = true;
    levelDetail = `Level ${mentorLevel} exceeds your Level ${learnerLevel}`;
  } else if (mentorLevel === learnerLevel) {
    levelPoints = MATCH_WEIGHTS.level / 2;
    levelOk = true;
    levelDetail = `Level ${mentorLevel} matches your Level ${learnerLevel}`;
  } else {
    levelPoints = 0;
    levelOk = false;
    levelDetail = `Level ${mentorLevel} is lower than your Level ${learnerLevel}`;
  }

  breakdown.push({
    key: 'level',
    label: 'Level Match',
    weight: MATCH_WEIGHTS.level,
    points: levelPoints,
    signaled: true,
    ok: levelOk,
    detail: levelDetail,
  });

  reasons.push({
    key: 'level',
    label: `Level ${mentorLevel} ${mentor.badge || ''}`.trim(),
    ok: levelOk,
  });

  // 6. Rating component (Weight: 5)
  // Always signaled
  const ratingCount = Number(mentor.rating_count) || 0;
  const ratingAvg = mentor.rating_avg !== null && mentor.rating_avg !== undefined
    ? Number(mentor.rating_avg)
    : 0;

  let ratingPoints = 0;
  let ratingOk = false;
  let ratingDetail = 'No ratings yet';

  if (ratingCount >= 3) {
    ratingPoints = MATCH_WEIGHTS.rating * (ratingAvg / 5);
    ratingOk = ratingAvg >= 4.0;
    ratingDetail = `${ratingAvg.toFixed(1)} avg (${ratingCount} reviews)`;
  } else if (ratingCount > 0) {
    ratingPoints = (MATCH_WEIGHTS.rating * (ratingAvg / 5)) / 2;
    ratingOk = ratingAvg >= 4.0;
    ratingDetail = `${ratingAvg.toFixed(1)} avg (${ratingCount} reviews)`;
  }

  breakdown.push({
    key: 'rating',
    label: 'Rating',
    weight: MATCH_WEIGHTS.rating,
    points: ratingPoints,
    signaled: true,
    ok: ratingOk,
    detail: ratingDetail,
  });

  if (ratingCount > 0) {
    reasons.push({
      key: 'rating',
      label: `${ratingAvg.toFixed(1)} stars (${ratingCount})`,
      ok: ratingOk,
    });
  } else {
    reasons.push({
      key: 'rating',
      label: 'No ratings yet',
      ok: false,
    });
  }

  // Calculate final score
  const signaledBreakdown = breakdown.filter((b) => b.signaled);
  const maxPossible = signaledBreakdown.reduce((sum, b) => sum + b.weight, 0);
  const earned = signaledBreakdown.reduce((sum, b) => sum + b.points, 0);
  const score = maxPossible > 0 ? Math.round((100 * earned) / maxPossible) : 0;

  return {
    score,
    max_possible: maxPossible,
    breakdown,
    reasons,
    suggested_slot_id: suggestedSlotId,
  };
}

/**
 * PURE FUNCTION: Sorts and ranks scored peers deterministically per SPEC Section B2.
 * 
 * Ranking rules:
 * 1. Peers that pass the level rule (mentor.level >= learner.level) first, ineligible peers last
 * 2. match_score DESC
 * 3. is_online DESC (online first)
 * 4. rating_avg DESC (nulls last)
 * 5. sessions_completed_as_mentor DESC
 * 6. name ASC
 * 
 * @param {Array} scoredPeers
 * @param {number} learnerLevel
 * @returns {{ rankedPeers: Array, bestMatchId: string|null }}
 */
export function rankMatchResults(scoredPeers, learnerLevel = 1) {
  const sorted = [...scoredPeers].sort((a, b) => {
    // 1. Level eligibility: eligible first, ineligible last
    const aEligible = (a.level || 1) >= learnerLevel;
    const bEligible = (b.level || 1) >= learnerLevel;
    if (aEligible !== bEligible) {
      return aEligible ? -1 : 1;
    }

    // 2. match_score DESC
    if (b.match_score !== a.match_score) {
      return b.match_score - a.match_score;
    }

    // 3. is_online DESC (online first)
    if (Boolean(b.is_online) !== Boolean(a.is_online)) {
      return b.is_online ? 1 : -1;
    }

    // 4. rating_avg DESC (nulls last)
    const aRating = a.rating_avg !== null && a.rating_avg !== undefined ? a.rating_avg : -1;
    const bRating = b.rating_avg !== null && b.rating_avg !== undefined ? b.rating_avg : -1;
    if (bRating !== aRating) {
      return bRating - aRating;
    }

    // 5. sessions_completed_as_mentor DESC
    const aSessions = Number(a.sessions_completed_as_mentor) || 0;
    const bSessions = Number(b.sessions_completed_as_mentor) || 0;
    if (bSessions !== aSessions) {
      return bSessions - aSessions;
    }

    // 6. name ASC
    return (a.name || '').localeCompare(b.name || '');
  });

  // Assign ranks and best_match flag
  let bestMatchId = null;
  const rankedPeers = sorted.map((p, idx) => {
    const rank = idx + 1;
    const isEligible = (p.level || 1) >= learnerLevel;
    const isBest = rank === 1 && p.match_score >= 50 && isEligible;
    if (isBest) {
      bestMatchId = p.id;
    }
    return {
      ...p,
      rank,
      is_best_match: isBest,
    };
  });

  return {
    rankedPeers,
    bestMatchId,
  };
}
