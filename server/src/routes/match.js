import express from 'express';
import { db } from '../db.js';
import { MATCH_WEIGHTS } from '../config.js';
import { calculateLevel } from '../config.js';
import { detectTopics, scoreMentor, rankMatchResults } from '../match.js';
import { fetchHydratedPeers } from './peers.js';

const router = express.Router();

/**
 * GET /api/match
 * Explainable mentor-matching engine per SPEC Part B.
 * Requires valid X-User-Id header.
 */
router.get('/', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    const learnerUser = db.prepare('SELECT * FROM users WHERE id = ?').get(currentUserId);
    if (!learnerUser) {
      return res.status(401).json({ error: 'Invalid X-User-Id: user does not exist' });
    }

    // 1. Validate problem text
    const rawProblem = req.query.problem;
    const problem = rawProblem !== undefined ? String(rawProblem).trim() : '';
    if (problem.length > 500) {
      return res.status(400).json({ error: 'Problem description must not exceed 500 characters' });
    }

    // Available topics in database
    const topicsRows = db.prepare('SELECT DISTINCT topic FROM user_skills ORDER BY topic ASC').all();
    const allAvailableTopics = topicsRows.map((r) => r.topic);

    // 2. Validate topic param (overrides detection if provided)
    let used_topics = [];
    const rawTopic = req.query.topic;
    if (rawTopic !== undefined && rawTopic !== null && rawTopic !== '') {
      const topicTokens = Array.isArray(rawTopic)
        ? rawTopic.flatMap((t) => String(t).split(','))
        : String(rawTopic).split(',');
      const requestedTopics = topicTokens.map((t) => t.trim()).filter(Boolean);

      for (const t of requestedTopics) {
        const found = allAvailableTopics.find((at) => at.toLowerCase() === t.toLowerCase());
        if (!found) {
          return res.status(400).json({ error: `Unknown topic: ${t}` });
        }
      }

      used_topics = requestedTopics.map((t) => {
        return allAvailableTopics.find((at) => at.toLowerCase() === t.toLowerCase()) || t;
      });
    }

    // Detect topics from problem text
    const detected_topics = detectTopics(problem, allAvailableTopics);
    if (used_topics.length === 0) {
      used_topics = detected_topics;
    }

    // 3. Known languages from database
    const langRows = db.prepare("SELECT languages FROM users WHERE languages IS NOT NULL AND languages != ''").all();
    const knownLangMap = new Map();
    for (const row of langRows) {
      row.languages.split(',').forEach((l) => {
        const trimmed = l.trim();
        if (trimmed) knownLangMap.set(trimmed.toLowerCase(), trimmed);
      });
    }

    const learnerDefaultLangs = learnerUser.languages
      ? learnerUser.languages.split(',').map((s) => s.trim())
      : ['English'];

    let targetLanguages = learnerDefaultLangs;
    const rawLang = req.query.language;
    if (rawLang !== undefined && rawLang !== null && rawLang !== '') {
      const langTokens = Array.isArray(rawLang)
        ? rawLang.flatMap((l) => String(l).split(','))
        : String(rawLang).split(',');
      const requestedLangs = langTokens.map((l) => l.trim()).filter(Boolean);

      for (const l of requestedLangs) {
        if (!knownLangMap.has(l.toLowerCase())) {
          return res.status(400).json({ error: `Unknown language: ${l}` });
        }
      }

      targetLanguages = requestedLangs.map((l) => knownLangMap.get(l.toLowerCase()) || l);
    }

    // 4. Validate day
    let day = undefined;
    if (req.query.day !== undefined && req.query.day !== null && req.query.day !== '') {
      const parsedDay = Number(req.query.day);
      if (!Number.isInteger(parsedDay) || parsedDay < 0 || parsedDay > 6) {
        return res.status(400).json({ error: 'Day must be an integer between 0 and 6' });
      }
      day = parsedDay;
    }

    // 5. Validate daypart
    let daypart = undefined;
    if (req.query.daypart !== undefined && req.query.daypart !== null && req.query.daypart !== '') {
      const dp = String(req.query.daypart).trim().toLowerCase();
      if (dp !== 'morning' && dp !== 'afternoon' && dp !== 'evening') {
        return res.status(400).json({ error: 'Daypart must be morning, afternoon, or evening' });
      }
      daypart = dp;
    }

    // 6. Online preference
    const onlineNow = req.query.onlineNow === 'true' || req.query.onlineNow === '1' || req.query.onlineNow === true;

    // Learner metadata
    const learnerMentorSessions = db.prepare(`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE mentor_id = ? AND status = 'completed'
    `).get(currentUserId).count;
    const learnerLevel = calculateLevel(learnerMentorSessions);

    const learner = {
      ...learnerUser,
      level: learnerLevel,
      languages: targetLanguages,
    };

    // 7. Fetch all peers (reusing shared query)
    const peers = fetchHydratedPeers(currentUserId, db);

    // 8. Score mentors using pure scoring function
    const scoredPeers = peers.map((peer) => {
      const scoring = scoreMentor({
        mentor: peer,
        learner,
        usedTopics: used_topics,
        languages: targetLanguages,
        day,
        daypart,
        onlineNow,
      });

      return {
        ...peer,
        match_score: scoring.score,
        max_possible: scoring.max_possible,
        breakdown: scoring.breakdown,
        reasons: scoring.reasons,
        suggested_slot_id: scoring.suggested_slot_id,
      };
    });

    // 9. Rank peers deterministically
    const { rankedPeers, bestMatchId } = rankMatchResults(scoredPeers, learner.level);

    // 10. Privacy check: Ensure no credit balance fields exist in results
    const sanitizedResults = rankedPeers.map((p) => {
      const copy = { ...p };
      delete copy.balance;
      delete copy.reserved_credits;
      delete copy.available_credits;
      return copy;
    });

    res.json({
      query: {
        problem,
        detected_topics,
        used_topics,
        languages: targetLanguages,
        day: day !== undefined ? day : null,
        daypart: daypart || null,
        onlineNow,
      },
      weights: MATCH_WEIGHTS,
      results: sanitizedResults,
      best_match_id: bestMatchId,
    });
  } catch (err) {
    console.error('Error in GET /api/match:', err);
    res.status(500).json({ error: 'Failed to process match query' });
  }
});

export default router;
