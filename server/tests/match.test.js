import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import assert from 'assert';

// Honor FORCE_FAIL=1 for test runner failsafe verification
if (process.env.FORCE_FAIL === '1') {
  console.log('FORCE_FAIL=1 is set: intentional test failure triggered in match.test.js.');
  process.exit(1);
}

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

// Setup temporary test database
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-match-test-'));
const tempDbPath = path.join(tempDir, 'match.db');
process.env.DB_PATH = tempDbPath;

const { db, initSchemaForDb } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const { checkIntegrity } = await import('../src/ledger.js');
const { MATCH_WEIGHTS, MATCH_KEYWORDS } = await import('../src/config.js');
const {
  detectTopics,
  detectLanguages,
  scoreMentor,
  rankMatchResults,
  slotMatchesAvailability,
} = await import('../src/match.js');

let serverProcess;
let passedCount = 0;
let failedCount = 0;

function record(caseNum, desc, ok, details = '') {
  if (ok) {
    console.log(`PASS Case ${caseNum}: ${desc}`);
    passedCount++;
  } else {
    console.error(`FAIL Case ${caseNum}: ${desc} ${details}`);
    failedCount++;
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function hasForbiddenKeys(obj, forbiddenKeys) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    return obj.some((item) => hasForbiddenKeys(item, forbiddenKeys));
  }
  for (const [k, v] of Object.entries(obj)) {
    if (forbiddenKeys.includes(k)) return true;
    if (typeof v === 'object' && hasForbiddenKeys(v, forbiddenKeys)) return true;
  }
  return false;
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 Starting Smart Match Deterministic Engine Test');
  console.log(`📁 Test Database: ${tempDbPath}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  try {
    // 0. Initialize & seed DB
    initSchemaForDb(db);
    runSeed(db);

    // Available topics from seed DB
    const allTopics = db
      .prepare('SELECT DISTINCT topic FROM user_skills ORDER BY topic ASC')
      .all()
      .map((r) => r.topic);

    // -------------------------------------------------------------------------
    // CASE 1: detectTopics
    // -------------------------------------------------------------------------
    const t1 = detectTopics('My React component re-renders too much', allTopics);
    const hasReact = t1.includes('React');

    const t2 = detectTopics('docker compose pipeline fails', allTopics);
    const hasDevOps = t2.includes('DevOps/Docker');

    const t3 = detectTopics('merge conflict after rebase', allTopics);
    const hasGit = t3.includes('Git');

    const t4 = detectTopics('I fixed a digit bug', allTopics);
    const digitNoGit = !t4.includes('Git');

    const t5 = detectTopics('javascript closure', allTopics);
    const jsNoJava = !t5.includes('Java');

    const t6 = detectTopics('gibberish xqwk zzp lololol', allTopics);
    const gibberishEmpty = t6.length === 0;

    // Multi-topic with ordering by keyword hits
    const t7 = detectTopics(
      'React component jsx hooks usestate re-render docker pipeline',
      allTopics
    );
    const multiOk =
      t7.length >= 2 &&
      t7[0] === 'React' &&
      t7.includes('DevOps/Docker');

    const case1Ok =
      hasReact && hasDevOps && hasGit && digitNoGit && jsNoJava && gibberishEmpty && multiOk;
    record(1, 'detectTopics keyword dictionary & word boundary matching', case1Ok);

    // -------------------------------------------------------------------------
    // CASE 2: MATCH_WEIGHTS & pure scoreMentor determinism
    // -------------------------------------------------------------------------
    const weightSum =
      MATCH_WEIGHTS.topic +
      MATCH_WEIGHTS.language +
      MATCH_WEIGHTS.availability +
      MATCH_WEIGHTS.online +
      MATCH_WEIGHTS.level +
      MATCH_WEIGHTS.rating;

    const weights100 = weightSum === 100;

    // Test scoring on synthetic mentor
    const mockMentor = {
      id: 'm1',
      name: 'Mentor One',
      level: 2,
      is_online: true,
      rating_avg: 4.8,
      rating_count: 5,
      skills: ['React', 'TypeScript'],
      languages: ['English', 'Hindi'],
      slots: [{ id: 's1', day_of_week: 1, start_hour: 18, end_hour: 20 }],
    };

    const mockLearner = {
      id: 'l1',
      name: 'Learner One',
      level: 1,
      languages: ['Hindi'],
    };

    const scoreInput = {
      mentor: mockMentor,
      learner: mockLearner,
      usedTopics: ['React'],
      languages: ['Hindi'],
      day: 1,
      daypart: 'evening',
      onlineNow: true,
    };

    const scoreA = scoreMentor(scoreInput);
    const scoreB = scoreMentor(scoreInput);

    const isIntA = Number.isInteger(scoreA.score) && scoreA.score >= 0 && scoreA.score <= 100;
    const byteIdentical = JSON.stringify(scoreA) === JSON.stringify(scoreB);

    const case2Ok = weights100 && isIntA && byteIdentical;
    record(
      2,
      'MATCH_WEIGHTS sum to 100, scores in 0..100, deterministic byte-identical output',
      case2Ok,
      `weightsSum=${weightSum}, score=${scoreA.score}`
    );

    // -------------------------------------------------------------------------
    // Spawn server for HTTP tests
    // -------------------------------------------------------------------------
    const serverEnv = { ...process.env, PORT: String(PORT), DB_PATH: tempDbPath, DEMO_MODE: 'true' };
    delete serverEnv.NODE_ENV;

    serverProcess = spawn(process.execPath, ['server/src/index.js'], {
      cwd: path.resolve(''),
      env: serverEnv,
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (d) => {
      if (process.env.DEBUG) process.stdout.write(d.toString());
    });
    serverProcess.stderr.on('data', (d) => {
      if (process.env.DEBUG) process.stderr.write(d.toString());
    });

    await waitForServer(BASE_URL);

    // -------------------------------------------------------------------------
    // CASE 3: Validation & query params
    // -------------------------------------------------------------------------
    // Missing X-User-Id -> 401
    const resNoAuth = await fetch(`${BASE_URL}/api/match?problem=react`);
    const statusNoAuth = resNoAuth.status === 401;

    // Invalid X-User-Id -> 401
    const resBadAuth = await fetch(`${BASE_URL}/api/match?problem=react`, {
      headers: { 'X-User-Id': 'usr_nonexistent_999' },
    });
    const statusBadAuth = resBadAuth.status === 401;

    // Unknown topic -> 400
    const resBadTopic = await fetch(`${BASE_URL}/api/match?topic=CobolEnterprise`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const statusBadTopic = resBadTopic.status === 400;

    // Problem > 500 chars -> 400
    const longProblem = 'A'.repeat(501);
    const resLongProb = await fetch(`${BASE_URL}/api/match?problem=${longProblem}`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const statusLongProb = resLongProb.status === 400;

    // Bad day (7) -> 400
    const resBadDay = await fetch(`${BASE_URL}/api/match?day=7`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const statusBadDay = resBadDay.status === 400;

    // Bad daypart -> 400
    const resBadDaypart = await fetch(`${BASE_URL}/api/match?daypart=midnight`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const statusBadDaypart = resBadDaypart.status === 400;

    // Bad language -> 400
    const resBadLang = await fetch(`${BASE_URL}/api/match?language=Klingon`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const statusBadLang = resBadLang.status === 400;

    // Topic overrides detection
    const resOverride = await fetch(
      `${BASE_URL}/api/match?problem=My%20React%20component&topic=TypeScript`,
      { headers: { 'X-User-Id': 'usr_terminaltinkerer' } }
    );
    const jsonOverride = await resOverride.json();
    const overrideOk =
      jsonOverride.query?.used_topics?.includes('TypeScript') &&
      !jsonOverride.query?.used_topics?.includes('React');

    const case3Ok =
      statusNoAuth &&
      statusBadAuth &&
      statusBadTopic &&
      statusLongProb &&
      statusBadDay &&
      statusBadDaypart &&
      statusBadLang &&
      overrideOk;
    record(3, 'Query validation (400 for bad params, 401 for auth, topic override)', case3Ok);

    // -------------------------------------------------------------------------
    // CASE 4: As Tanvi with demo sentence
    // -------------------------------------------------------------------------
    const demoProblem =
      'My React component re-renders too much, need help in Hindi this evening';
    const resDemo = await fetch(
      `${BASE_URL}/api/match?problem=${encodeURIComponent(demoProblem)}`,
      { headers: { 'X-User-Id': 'usr_terminaltinkerer' } }
    );
    const jsonDemo = await resDemo.json();

    // Tanvi is Level 1.
    // Check: every returned mentor having React ranks above every level-eligible mentor lacking React
    const results = jsonDemo.results || [];
    let sawEligibleNonReact = false;
    let reactRankCheck = true;

    for (const r of results) {
      const isEligible = r.level >= 1;
      const hasReactSkill = r.skills?.includes('React');
      if (isEligible && !hasReactSkill) {
        sawEligibleNonReact = true;
      }
      if (isEligible && hasReactSkill && sawEligibleNonReact) {
        reactRankCheck = false;
        break;
      }
    }

    const bestResult = results[0];
    const topScore = bestResult ? bestResult.match_score : 0;
    const bestMatchIdEqualsTop =
      topScore >= 50 ? jsonDemo.best_match_id === bestResult.id : jsonDemo.best_match_id === null;

    const case4Ok = reactRankCheck && bestMatchIdEqualsTop && topScore >= 50;
    record(
      4,
      'Tanvi demo sentence: React mentors rank above eligible non-React, best_match_id matches top result',
      case4Ok,
      `bestMatch=${bestResult?.name} (${bestResult?.id}), score=${topScore}`
    );

    // -------------------------------------------------------------------------
    // CASE 5: Language matching reasons
    // -------------------------------------------------------------------------
    const resLang = await fetch(`${BASE_URL}/api/match?language=Hindi`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const jsonLang = await resLang.json();

    let langReasonsOk = true;
    for (const peer of jsonLang.results || []) {
      const peerHasHindi = peer.languages?.includes('Hindi');
      const langReason = peer.reasons?.find((r) => r.key === 'language');
      if (!langReason) {
        langReasonsOk = false;
        break;
      }
      if (peerHasHindi && !langReason.ok) {
        langReasonsOk = false;
        break;
      }
      if (!peerHasHindi && langReason.ok) {
        langReasonsOk = false;
        break;
      }
    }
    record(5, 'Language matching reasons: Hindi mentors have ok:true, others ok:false', langReasonsOk);

    // -------------------------------------------------------------------------
    // CASE 6: Availability matching & suggested_slot_id
    // -------------------------------------------------------------------------
    const resAvail = await fetch(`${BASE_URL}/api/match?daypart=evening`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const jsonAvail = await resAvail.json();

    let availOk = true;
    for (const peer of jsonAvail.results || []) {
      const availReason = peer.reasons?.find((r) => r.key === 'availability');
      const hasEveSlot = peer.slots?.some((s) => s.end_hour > 17);
      if (hasEveSlot) {
        if (!availReason || !availReason.ok) {
          console.log(`[DEBUG avail 1] peer=${peer.name}, availReason=`, availReason);
          availOk = false;
        }
        if (!peer.suggested_slot_id) {
          console.log(`[DEBUG avail 2] peer=${peer.name}, suggested_slot_id missing`);
          availOk = false;
        }
        const matchingSlot = peer.slots.find((s) => s.id === peer.suggested_slot_id);
        if (!matchingSlot || matchingSlot.end_hour <= 17) {
          console.log(`[DEBUG avail 3] peer=${peer.name}, slot not evening`, matchingSlot);
          availOk = false;
        }
      } else {
        if (availReason && availReason.ok) {
          console.log(`[DEBUG avail 4] peer=${peer.name}, unexpected availReason ok:true`);
          availOk = false;
        }
        if (peer.suggested_slot_id) {
          console.log(`[DEBUG avail 5] peer=${peer.name}, unexpected suggested_slot_id`);
          availOk = false;
        }
      }
    }

    // Without day/daypart the availability component is not signaled (signaled:false) and absent from max_possible
    const resNoAvail = await fetch(`${BASE_URL}/api/match?problem=React`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const jsonNoAvail = await resNoAvail.json();
    const firstNoAvail = jsonNoAvail.results[0];
    const availComp = firstNoAvail.breakdown.find((b) => b.key === 'availability');
    const noAvailUnsignaled = availComp.signaled === false && firstNoAvail.max_possible === 85;

    const case6Ok = availOk && noAvailUnsignaled;
    record(
      6,
      'Availability: evening daypart suggests valid evening slot; unconstrained query leaves availability unsignaled',
      case6Ok
    );

    // -------------------------------------------------------------------------
    // CASE 7: Level rule ranking as Priya (Level 3)
    // -------------------------------------------------------------------------
    const resPriya = await fetch(`${BASE_URL}/api/match?problem=React`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const jsonPriya = await resPriya.json();

    let levelCheckOk = true;
    let sawIneligible = false;
    for (const p of jsonPriya.results || []) {
      const isEligible = p.level >= 3;
      if (!isEligible) {
        sawIneligible = true;
        if (p.can_book !== false) levelCheckOk = false;
      }
      if (isEligible && sawIneligible) {
        // An eligible peer showed up after an ineligible one!
        levelCheckOk = false;
        break;
      }
    }
    record(
      7,
      'Level rule: as Priya (L3) all L1/L2 mentors are ranked after eligible mentors and have can_book:false',
      levelCheckOk
    );

    // -------------------------------------------------------------------------
    // CASE 8: Privacy & self-exclusion
    // -------------------------------------------------------------------------
    const forbiddenKeys = ['balance', 'reserved_credits', 'available_credits'];
    const privacyViolated = hasForbiddenKeys(jsonDemo, forbiddenKeys);
    const selfExcluded = !jsonDemo.results.some((p) => p.id === 'usr_terminaltinkerer');

    const case8Ok = !privacyViolated && selfExcluded;
    record(8, 'Privacy: deep scan finds no balance/credit fields, results exclude current user', case8Ok);

    // -------------------------------------------------------------------------
    // CASE 9: Regression on GET /api/peers
    // -------------------------------------------------------------------------
    const resPeers = await fetch(`${BASE_URL}/api/peers`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const peersList = await resPeers.json();
    const peersCount13 = peersList.length === 13;

    const expectedKeys = [
      'id',
      'name',
      'handle',
      'avatar_color',
      'bio',
      'experience',
      'languages',
      'is_online',
      'level',
      'badge',
      'skills',
      'slots',
      'rating_avg',
      'rating_count',
      'sessions_completed_as_mentor',
      'next_slot_label',
      'can_book',
      'block_reason',
      'level_relation',
    ].sort();

    let keysMatch = true;
    for (const p of peersList) {
      const pKeys = Object.keys(p).sort();
      if (JSON.stringify(pKeys) !== JSON.stringify(expectedKeys)) {
        keysMatch = false;
        break;
      }
    }

    const case9Ok = peersCount13 && keysMatch;
    record(
      9,
      'Regression: GET /api/peers returns exactly 13 peers with identical expected keys',
      case9Ok,
      `count=${peersList.length}`
    );

    // -------------------------------------------------------------------------
    // CASE 10: Credits untouched across 20 calls
    // -------------------------------------------------------------------------
    const sumBefore = db.prepare('SELECT SUM(delta) as total FROM ledger_entries').get().total;

    for (let i = 0; i < 20; i++) {
      await fetch(
        `${BASE_URL}/api/match?problem=query${i}&language=English&onlineNow=${i % 2 === 0}`,
        { headers: { 'X-User-Id': 'usr_terminaltinkerer' } }
      );
    }

    const sumAfter = db.prepare('SELECT SUM(delta) as total FROM ledger_entries').get().total;
    const sumsIdentical = sumBefore === sumAfter;
    const integrityCheck = checkIntegrity(db);
    const integrityOk = integrityCheck.ok === true;

    const case10Ok = sumsIdentical && integrityOk;
    record(
      10,
      'Credits untouched: sum of ledger deltas before & after 20 match calls is identical, checkIntegrity passes',
      case10Ok,
      `before=${sumBefore}, after=${sumAfter}`
    );

    // -------------------------------------------------------------------------
    // CASE 11: Tie-break determinism with synthetic mentors
    // -------------------------------------------------------------------------
    // Rules:
    // (1) level eligible first
    // (2) match_score desc
    // (3) online first
    // (4) rating_avg desc (nulls last)
    // (5) sessions_completed_as_mentor desc
    // (6) name asc
    const syntheticPeers = [
      {
        id: 'p1',
        name: 'Bob',
        level: 2,
        match_score: 80,
        is_online: false,
        rating_avg: 4.5,
        sessions_completed_as_mentor: 5,
      },
      {
        id: 'p2',
        name: 'Alice',
        level: 2,
        match_score: 80,
        is_online: true, // online beats offline
        rating_avg: 4.5,
        sessions_completed_as_mentor: 5,
      },
      {
        id: 'p3',
        name: 'Charlie',
        level: 2,
        match_score: 80,
        is_online: false,
        rating_avg: 4.9, // rating 4.9 beats 4.5
        sessions_completed_as_mentor: 5,
      },
      {
        id: 'p4',
        name: 'David',
        level: 2,
        match_score: 80,
        is_online: false,
        rating_avg: 4.5,
        sessions_completed_as_mentor: 10, // sessions 10 beats 5
      },
      {
        id: 'p5',
        name: 'Aaron',
        level: 2,
        match_score: 80,
        is_online: false,
        rating_avg: 4.5,
        sessions_completed_as_mentor: 5, // name Aaron beats Bob
      },
      {
        id: 'p6',
        name: 'Zack Ineligible',
        level: 1, // Learner level 2, so level 1 is ineligible, goes LAST
        match_score: 95,
        is_online: true,
        rating_avg: 5.0,
        sessions_completed_as_mentor: 20,
      },
    ];

    const { rankedPeers } = rankMatchResults(syntheticPeers, 2);
    const orderIds = rankedPeers.map((p) => p.id);
    // Expected order:
    // 1. p2 (online:true, score 80)
    // 2. p3 (rating 4.9)
    // 3. p4 (sessions 10)
    // 4. p5 (name Aaron)
    // 5. p1 (name Bob)
    // 6. p6 (ineligible level 1, regardless of 95 score)
    const expectedOrder = ['p2', 'p3', 'p4', 'p5', 'p1', 'p6'];
    const tieBreakOk = JSON.stringify(orderIds) === JSON.stringify(expectedOrder);

    record(
      11,
      'Tie-break determinism: verified multi-attribute sort order on equal scores',
      tieBreakOk,
      `order=${orderIds.join(',')}`
    );

    // -------------------------------------------------------------------------
    // CASE 12: Consistency test (Match vs Peers non-match keys)
    // -------------------------------------------------------------------------
    const peersRes = await fetch(`${BASE_URL}/api/peers`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const peersData = await peersRes.json();
    const peersListCase12 = Array.isArray(peersData) ? peersData : peersData.peers || [];
    const peersMap = new Map(peersListCase12.map((p) => [p.id, p]));

    const matchResCase12 = await fetch(
      `${BASE_URL}/api/match?problem=React&daypart=evening`,
      { headers: { 'X-User-Id': 'usr_terminaltinkerer' } }
    );
    const matchDataCase12 = await matchResCase12.json();
    const nonMatchKeys = [
      'id',
      'name',
      'handle',
      'avatar_color',
      'bio',
      'experience',
      'languages',
      'is_online',
      'level',
      'badge',
      'skills',
      'slots',
      'rating_avg',
      'rating_count',
      'sessions_completed_as_mentor',
      'next_slot_label',
      'can_book',
      'block_reason',
      'level_relation',
    ];

    let case12Ok = true;
    let case12Error = '';

    for (const matchPeer of matchDataCase12.results || []) {
      const peer = peersMap.get(matchPeer.id);
      if (!peer) {
        case12Ok = false;
        case12Error = `Peer ${matchPeer.id} not found in /api/peers`;
        break;
      }

      for (const key of nonMatchKeys) {
        try {
          assert.deepStrictEqual(matchPeer[key], peer[key]);
        } catch (e) {
          case12Ok = false;
          case12Error = `Mismatch on key "${key}" for peer ${matchPeer.id}: ${e.message}`;
          break;
        }
      }
      if (!case12Ok) break;

      // Also assert suggested_slot_id belongs to that mentor's slots
      if (matchPeer.suggested_slot_id !== null && matchPeer.suggested_slot_id !== undefined) {
        const slotExists = peer.slots.some((s) => s.id === matchPeer.suggested_slot_id);
        if (!slotExists) {
          case12Ok = false;
          case12Error = `suggested_slot_id ${matchPeer.suggested_slot_id} not in slots of peer ${matchPeer.id}`;
          break;
        }
      }
    }

    record(12, 'Consistency: all non-match keys match GET /api/peers and suggested_slot_id in slots', case12Ok, case12Error);

    // -------------------------------------------------------------------------
    // CASE 13: detectLanguages pure unit test
    // -------------------------------------------------------------------------
    const dbKnownLanguages = db
      .prepare("SELECT languages FROM users WHERE languages IS NOT NULL AND languages != ''")
      .all()
      .flatMap((r) => r.languages.split(',').map((s) => s.trim()).filter(Boolean));
    const uniqueKnownLangs = Array.from(new Set(dbKnownLanguages));

    const det1 = detectLanguages('help in Hindi', uniqueKnownLangs);
    const det2 = detectLanguages('In hindsight, this was avoidable', uniqueKnownLangs);
    const det3 = detectLanguages('Just building a web application with components', uniqueKnownLangs);

    const case13Ok =
      JSON.stringify(det1) === JSON.stringify(['Hindi']) &&
      JSON.stringify(det2) === JSON.stringify([]) &&
      JSON.stringify(det3) === JSON.stringify([]);

    record(
      13,
      'detectLanguages: "help in Hindi" -> [Hindi], "hindsight" -> [], no language -> []',
      case13Ok,
      `det1=${JSON.stringify(det1)}, det2=${JSON.stringify(det2)}, det3=${JSON.stringify(det3)}`
    );

    // -------------------------------------------------------------------------
    // CASE 14: As Tanvi with demo sentence & detected Hindi language
    // -------------------------------------------------------------------------
    const demoSentence14 = 'My React component re-renders too much, need help in Hindi this evening';
    const res14 = await fetch(
      `${BASE_URL}/api/match?problem=${encodeURIComponent(demoSentence14)}&daypart=evening`,
      { headers: { 'X-User-Id': 'usr_terminaltinkerer' } }
    );
    const json14 = await res14.json();

    const hasDetectedHindi =
      Array.isArray(json14.query?.detected_languages) &&
      json14.query.detected_languages.includes('Hindi');

    const priyaResult = (json14.results || []).find((r) => r.id === 'usr_pixelpriya');
    const priyaLangReason = priyaResult?.reasons?.find((r) => r.key === 'language');
    const priyaLangOk = priyaLangReason?.label === 'Hindi' && priyaLangReason?.ok === true;

    // A non-Hindi mentor: e.g. usr_algoace (Kavita Iyer speaks English, Tamil)
    const nonHindiMentor = (json14.results || []).find((r) => r.id === 'usr_algoace');
    const nonHindiLangReason = nonHindiMentor?.reasons?.find((r) => r.key === 'language');
    const nonHindiLangOk = nonHindiLangReason?.ok === false;

    const case14Ok = hasDetectedHindi && priyaLangOk && nonHindiLangOk;
    record(
      14,
      'Tanvi demo sentence: detected_languages ["Hindi"], Priya language reason "Hindi" ok:true, non-Hindi mentor ok:false',
      case14Ok,
      `detected=${JSON.stringify(json14.query?.detected_languages)}, priyaLang=${JSON.stringify(priyaLangReason)}, nonHindiLang=${JSON.stringify(nonHindiLangReason)}`
    );

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Unhandled test execution error:', err);
    process.exit(1);
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runAllTests();
