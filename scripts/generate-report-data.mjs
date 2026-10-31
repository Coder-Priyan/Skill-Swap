import { db } from '../server/src/db.js';
import { runSeed } from '../server/src/seed.js';
import { MATCH_WEIGHTS, MATCH_KEYWORDS, calculateLevel } from '../server/src/config.js';
import { detectTopics, scoreMentor, rankMatchResults } from '../server/src/match.js';
import { fetchHydratedPeers } from '../server/src/routes/peers.js';
import fs from 'fs';

// Ensure DB is seeded cleanly
runSeed(db);

// 1. GET /api/meta/match response sample
const metaMatchResponse = {
  weights: MATCH_WEIGHTS,
  keyword_topics: Object.keys(MATCH_KEYWORDS).sort(),
};
fs.writeFileSync('report_outputs/meta_match.json', JSON.stringify(metaMatchResponse, null, 2));

// 2. Real GET /api/match response as Tanvi for demo sentence
const currentUserId = 'usr_terminaltinkerer';
const learnerUser = db.prepare('SELECT * FROM users WHERE id = ?').get(currentUserId);
const problem = 'My React component re-renders too much, need help in Hindi this evening';

const allAvailableTopics = db
  .prepare('SELECT DISTINCT topic FROM user_skills ORDER BY topic ASC')
  .all()
  .map((r) => r.topic);

const detected_topics = detectTopics(problem, allAvailableTopics);
const targetLanguages = learnerUser.languages.split(',').map((s) => s.trim());
const learnerMentorSessions = db
  .prepare("SELECT COUNT(*) AS count FROM bookings WHERE mentor_id = ? AND status = 'completed'")
  .get(currentUserId).count;
const learnerLevel = calculateLevel(learnerMentorSessions);

const learner = {
  ...learnerUser,
  level: learnerLevel,
  languages: targetLanguages,
};

const peers = fetchHydratedPeers(currentUserId, db);
const scoredPeers = peers.map((peer) => {
  const scoring = scoreMentor({
    mentor: peer,
    learner,
    usedTopics: detected_topics,
    languages: targetLanguages,
    day: undefined,
    daypart: 'evening',
    onlineNow: false,
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

const { rankedPeers, bestMatchId } = rankMatchResults(scoredPeers, learner.level);

const sanitizedResults = rankedPeers.map((p) => {
  const copy = { ...p };
  delete copy.balance;
  delete copy.reserved_credits;
  delete copy.available_credits;
  return copy;
});

// Format first 3 fully and rest summarized
const first3 = sanitizedResults.slice(0, 3);
const restSummarized = sanitizedResults.slice(3).map((p) => ({
  id: p.id,
  name: p.name,
  match_score: p.match_score,
  rank: p.rank,
  can_book: p.can_book,
  block_reason: p.block_reason,
}));

const reportResponse = {
  query: {
    problem,
    detected_topics,
    used_topics: detected_topics,
    languages: targetLanguages,
    day: null,
    daypart: 'evening',
    onlineNow: false,
  },
  weights: MATCH_WEIGHTS,
  best_match_id: bestMatchId,
  results_count: sanitizedResults.length,
  top_3_results_full: first3,
  remaining_results_summarized: restSummarized,
};

fs.writeFileSync('report_outputs/tanvi_match.json', JSON.stringify(reportResponse, null, 2));
console.log('Report data successfully generated.');
