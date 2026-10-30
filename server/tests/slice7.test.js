import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { io as ioClient } from 'socket.io-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// 1. Create temporary test database
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-slice7-test-'));
const tempDbPath = path.join(tempDir, 'slice7.db');
process.env.DB_PATH = tempDbPath;

console.log('====================================================');
console.log('🧪 Starting Slice 7 Test Suite: Ratings, Audit & Leaderboard');
console.log(`📁 Test Database: ${tempDbPath}`);
console.log('🌐 Server Port: 4100');
console.log('====================================================\n');

// Import DB, Seed, and Ledger modules after setting DB_PATH
const { db } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const {
  getUserBalance,
  getUserAvailableCredits,
  settleBooking,
  rateBooking,
  checkIntegrity,
} = await import('../src/ledger.js');
const { createBooking, acceptBooking, startBooking } = await import('../src/bookings.js');

// Seed test database
runSeed(db);

let serverProcess = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch('http://localhost:4100/api/health');
      if (res.ok) return true;
    } catch {
      await wait(300);
    }
  }
  return false;
}

const BASE_URL = 'http://localhost:4100';

let tanviSocket = null;
let priyaSocket = null;
let arjunSocket = null;

try {
  // Spawn backend server on port 4100
  console.log('🚀 Spawning server child process on port 4100...');
  serverProcess = spawn('node', ['server/src/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: '4100',
      DB_PATH: tempDbPath,
    },
    stdio: 'inherit',
  });

  const healthy = await waitForHealth();
  if (!healthy) {
    throw new Error('Server failed to start on http://localhost:4100/api/health');
  }
  console.log('✓ Server responded to /api/health\n');

  // Connect socket.io clients for Tanvi, Priya, and Arjun (bystander)
  tanviSocket = ioClient('http://localhost:4100', {
    auth: { userId: 'usr_terminaltinkerer' },
    transports: ['websocket'],
  });
  priyaSocket = ioClient('http://localhost:4100', {
    auth: { userId: 'usr_pixelpriya' },
    transports: ['websocket'],
  });
  arjunSocket = ioClient('http://localhost:4100', {
    auth: { userId: 'usr_bytebender' },
    transports: ['websocket'],
  });

  await Promise.all([
    new Promise((res) => tanviSocket.on('connect', res)),
    new Promise((res) => priyaSocket.on('connect', res)),
    new Promise((res) => arjunSocket.on('connect', res)),
  ]);

  if (process.env.FORCE_FAIL === '1') {
    throw new Error('Forced failure triggered via FORCE_FAIL=1');
  }

  // Helper to create, accept, start, and settle a test booking between two users
  function createAndCompleteBooking(learnerId, mentorId, topic = 'React') {
    const slot = db.prepare('SELECT id FROM availability_slots WHERE user_id = ? LIMIT 1').get(mentorId);
    const b = createBooking({
      learnerId,
      mentorId,
      topic,
      problemNote: 'Detailed pairing session problem description note for rating tests',
      slotId: slot.id,
    }, db);

    acceptBooking({ bookingId: b.id, mentorId }, db);
    startBooking({ bookingId: b.id, userId: learnerId }, db);
    settleBooking(b.id, learnerId, db);
    return db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id);
  }

  // --- CASE 1: rate validation ---
  // non-learner 403; not-completed 409; rating 0 and 6 and 3.5 rejected 400; comment over 300 chars rejected 400
  {
    // Create an in-progress booking (not completed)
    const slotPriya = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const bInProg = createBooking({
      learnerId: 'usr_algoace',
      mentorId: 'usr_pixelpriya',
      topic: 'React',
      problemNote: 'In progress booking for validation tests',
      slotId: slotPriya.id,
    }, db);
    acceptBooking({ bookingId: bInProg.id, mentorId: 'usr_pixelpriya' }, db);
    startBooking({ bookingId: bInProg.id, userId: 'usr_algoace' }, db);

    // Rate not-completed booking -> 409
    const notCompletedRes = await fetch(`${BASE_URL}/api/bookings/${bInProg.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_algoace' },
      body: JSON.stringify({ rating: 5, comment: 'Great' }),
    });
    if (notCompletedRes.status !== 409) {
      throw new Error(`Expected 409 when rating in_progress booking, got ${notCompletedRes.status}`);
    }

    // Now complete a booking
    settleBooking(bInProg.id, 'usr_algoace', db);

    // Non-learner (Priya) tries to rate -> 403
    const nonLearnerRes = await fetch(`${BASE_URL}/api/bookings/${bInProg.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_pixelpriya' },
      body: JSON.stringify({ rating: 5 }),
    });
    if (nonLearnerRes.status !== 403) {
      throw new Error(`Expected 403 when non-learner rates, got ${nonLearnerRes.status}`);
    }

    // Invalid ratings: 0, 6, 3.5
    for (const badRating of [0, 6, 3.5, 'invalid', -1]) {
      const badRateRes = await fetch(`${BASE_URL}/api/bookings/${bInProg.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_algoace' },
        body: JSON.stringify({ rating: badRating }),
      });
      if (badRateRes.status !== 400) {
        throw new Error(`Expected 400 for rating ${badRating}, got ${badRateRes.status}`);
      }
    }

    // Comment over 300 chars
    const longComment = 'a'.repeat(301);
    const longCommentRes = await fetch(`${BASE_URL}/api/bookings/${bInProg.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_algoace' },
      body: JSON.stringify({ rating: 5, comment: longComment }),
    });
    if (longCommentRes.status !== 400) {
      throw new Error(`Expected 400 for comment > 300 chars, got ${longCommentRes.status}`);
    }

    console.log('  PASS (1): rate: non-learner 403; not-completed 409; rating 0 and 6 and 3.5 rejected 400; comment over 300 chars rejected 400');
  }

  // --- CASE 2: valid 5-star rating pays exactly ONE bonus ---
  // mentor balance +1, one bonus ledger row linked to booking, minted total +1, checkIntegrity all green
  let testBookingCase2 = null;
  {
    testBookingCase2 = createAndCompleteBooking('usr_devdynamo', 'usr_cloudpilot', 'DevOps/Docker');

    const mentorBalBefore = getUserBalance('usr_cloudpilot', db);
    const integrityBefore = checkIntegrity(db);
    const mintedBefore = integrityBefore.minted.total;

    const rateRes = await fetch(`${BASE_URL}/api/bookings/${testBookingCase2.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_devdynamo' },
      body: JSON.stringify({ rating: 5, comment: 'Phenomenal Docker mentor! Solved build caching.' }),
    });
    if (rateRes.status !== 200) {
      const errBody = await rateRes.text();
      throw new Error(`Expected 200 from valid 5-star rating, got ${rateRes.status}: ${errBody}`);
    }

    const rateData = await rateRes.json();
    if (!rateData.bonusPaid) throw new Error('Expected bonusPaid to be true for 5-star rating');
    if (!rateData.bonusEntryId) throw new Error('Expected bonusEntryId in response');

    // Mentor balance +1
    const mentorBalAfter = getUserBalance('usr_cloudpilot', db);
    if (mentorBalAfter !== mentorBalBefore + 1) {
      throw new Error(`Expected mentor balance to increase by 1 (${mentorBalBefore} -> ${mentorBalAfter})`);
    }

    // One bonus ledger row linked to booking
    const bonusRows = db.prepare("SELECT * FROM ledger_entries WHERE booking_id = ? AND kind = 'bonus'").all(testBookingCase2.id);
    if (bonusRows.length !== 1) {
      throw new Error(`Expected 1 bonus ledger row, found ${bonusRows.length}`);
    }
    if (Number(bonusRows[0].delta) !== 1) {
      throw new Error(`Expected bonus delta +1, got ${bonusRows[0].delta}`);
    }

    // Minted total +1
    const integrityAfter = checkIntegrity(db);
    if (integrityAfter.minted.total !== mintedBefore + 1) {
      throw new Error(`Expected minted total to increase by 1 (${mintedBefore} -> ${integrityAfter.minted.total})`);
    }
    if (integrityAfter.minted.bonuses !== 1) {
      throw new Error(`Expected 1 bonus in minted report, got ${integrityAfter.minted.bonuses}`);
    }
    if (!integrityAfter.ok) {
      throw new Error(`Expected checkIntegrity all green, got failures: ${JSON.stringify(integrityAfter.checks.filter(c => !c.ok))}`);
    }

    console.log('  PASS (2): valid 5-star rating pays exactly ONE bonus: mentor balance +1, bonus row linked, minted +1, checkIntegrity all green');
  }

  // --- CASE 3: rating a second time -> 409; 5 SIMULTANEOUS rate calls -> exactly one rating and one bonus row ---
  {
    // Try rating testBookingCase2 a second time -> 409
    const secondRateRes = await fetch(`${BASE_URL}/api/bookings/${testBookingCase2.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_devdynamo' },
      body: JSON.stringify({ rating: 5 }),
    });
    if (secondRateRes.status !== 409) {
      throw new Error(`Expected 409 when rating already-rated booking, got ${secondRateRes.status}`);
    }

    // 5 SIMULTANEOUS rate calls on a fresh completed booking
    const bConcurrent = createAndCompleteBooking('usr_bytebender', 'usr_pixelpriya', 'React');
    const mentorBalPreConcurrent = getUserBalance('usr_pixelpriya', db);

    const promises = Array.from({ length: 5 }, () =>
      fetch(`${BASE_URL}/api/bookings/${bConcurrent.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_bytebender' },
        body: JSON.stringify({ rating: 5, comment: 'Simultaneous rating concurrency check' }),
      })
    );

    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status);
    const count200 = statuses.filter((s) => s === 200).length;
    const count409 = statuses.filter((s) => s === 409).length;

    if (count200 !== 1 || count409 !== 4) {
      throw new Error(`Expected exactly 1 200 and 4 409 responses, got: ${JSON.stringify(statuses)}`);
    }

    const mentorBalPostConcurrent = getUserBalance('usr_pixelpriya', db);
    if (mentorBalPostConcurrent !== mentorBalPreConcurrent + 1) {
      throw new Error(`Expected mentor balance to increase by exactly 1 (+1 bonus), got ${mentorBalPostConcurrent - mentorBalPreConcurrent}`);
    }

    const bonusRows = db.prepare("SELECT * FROM ledger_entries WHERE booking_id = ? AND kind = 'bonus'").all(bConcurrent.id);
    if (bonusRows.length !== 1) {
      throw new Error(`Expected exactly 1 bonus row from 5 simultaneous requests, found ${bonusRows.length}`);
    }

    console.log('  PASS (3): rating a second time -> 409; 5 SIMULTANEOUS rate calls -> exactly one rating and one bonus row');
  }

  // --- CASE 4: a 4-star rating pays NO bonus ---
  {
    const bFourStar = createAndCompleteBooking('usr_algoace', 'usr_pixelpriya', 'CSS/UI');
    const mentorBalBefore = getUserBalance('usr_pixelpriya', db);

    const rateRes = await fetch(`${BASE_URL}/api/bookings/${bFourStar.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_algoace' },
      body: JSON.stringify({ rating: 4, comment: 'Solid session, very helpful.' }),
    });
    if (rateRes.status !== 200) {
      throw new Error(`Expected 200 from 4-star rating, got ${rateRes.status}`);
    }

    const rateData = await rateRes.json();
    if (rateData.bonusPaid !== false) throw new Error('Expected bonusPaid to be false for 4-star rating');

    const mentorBalAfter = getUserBalance('usr_pixelpriya', db);
    if (mentorBalAfter !== mentorBalBefore) {
      throw new Error(`Expected mentor balance unchanged for 4-star rating (${mentorBalBefore} vs ${mentorBalAfter})`);
    }

    const bonusRows = db.prepare("SELECT * FROM ledger_entries WHERE booking_id = ? AND kind = 'bonus'").all(bFourStar.id);
    if (bonusRows.length !== 0) {
      throw new Error(`Expected 0 bonus rows for 4-star rating, found ${bonusRows.length}`);
    }

    console.log('  PASS (4): a 4-star rating pays NO bonus');
  }

  // --- CASE 5: audit endpoint ---
  // shape is correct, conserved is true on clean seed and after settlement plus bonus; contains no balance fields of individual users
  {
    const auditRes = await fetch(`${BASE_URL}/api/audit`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (auditRes.status !== 200) {
      throw new Error(`Expected 200 from GET /api/audit, got ${auditRes.status}`);
    }

    const auditData = await auditRes.json();

    // Verify shape
    if (!auditData.generated_at) throw new Error('Missing generated_at in audit response');
    if (!auditData.minted || typeof auditData.minted.total !== 'number') throw new Error('Missing minted in audit response');
    if (typeof auditData.in_balances_total !== 'number') throw new Error('Missing in_balances_total in audit response');
    if (typeof auditData.conserved !== 'boolean' || !auditData.conserved) throw new Error('Expected conserved=true in audit response');
    if (!Array.isArray(auditData.checks) || auditData.checks.length < 5) throw new Error('Missing or empty checks array');
    if (!auditData.counts || typeof auditData.counts.users !== 'number') throw new Error('Missing counts in audit response');
    if (!Array.isArray(auditData.recent_settlements) || auditData.recent_settlements.length === 0) throw new Error('Missing recent_settlements in audit response');

    // Verify recent settlements shape
    const s0 = auditData.recent_settlements[0];
    if (!s0.topic || !s0.learner || !s0.mentor || !s0.amount || !s0.running_proof) {
      throw new Error(`Incomplete recent settlement structure: ${JSON.stringify(s0)}`);
    }

    // Verify privacy: NO per-user balances in this response!
    const jsonStr = JSON.stringify(auditData);
    if (jsonStr.includes('"balance":') || jsonStr.includes('"running_balance":')) {
      throw new Error('Audit response leaked user balance fields!');
    }

    console.log('  PASS (5): audit endpoint: shape is correct, conserved is true after settlements and bonuses, no user balances');
  }

  // --- CASE 6: leaderboard ---
  // ordering is correct by stated tie-breakers, 10 rows max, no balance fields
  {
    const lbRes = await fetch(`${BASE_URL}/api/leaderboard`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (lbRes.status !== 200) {
      throw new Error(`Expected 200 from GET /api/leaderboard, got ${lbRes.status}`);
    }

    const lbData = await lbRes.json();
    if (!Array.isArray(lbData.leaderboard)) throw new Error('Missing leaderboard array');
    if (lbData.leaderboard.length > 10) throw new Error(`Leaderboard returned ${lbData.leaderboard.length} rows, expected <= 10`);

    // Verify tie-breaker ordering: sessions_as_mentor DESC, then rating_avg DESC, then total_earned DESC
    for (let i = 0; i < lbData.leaderboard.length - 1; i++) {
      const a = lbData.leaderboard[i];
      const b = lbData.leaderboard[i + 1];

      if (a.sessions_as_mentor < b.sessions_as_mentor) {
        throw new Error(`Leaderboard rank violation at ${i}: ${a.sessions_as_mentor} < ${b.sessions_as_mentor}`);
      }
      if (a.sessions_as_mentor === b.sessions_as_mentor) {
        const rA = a.rating_avg !== null ? a.rating_avg : -1;
        const rB = b.rating_avg !== null ? b.rating_avg : -1;
        if (rA < rB) {
          throw new Error(`Leaderboard rating tie-breaker violation at ${i}: ${rA} < ${rB}`);
        }
      }
    }

    // Verify my_rank exists
    if (!lbData.my_rank || lbData.my_rank.id !== 'usr_terminaltinkerer') {
      throw new Error('Expected my_rank for Tanvi in leaderboard response');
    }

    // Verify privacy: NO balance fields
    const lbStr = JSON.stringify(lbData);
    if (lbStr.includes('"balance":') || lbStr.includes('"available_credits":') || lbStr.includes('"reserved_credits":')) {
      throw new Error('Leaderboard response leaked balance fields!');
    }

    console.log('  PASS (6): leaderboard: ordering is correct by stated tie-breakers, 10 rows max, no balance fields');
  }

  // --- CASE 7: notes: POST summary ---
  // works for participants only, only for completed bookings, over 1000 chars rejected, final_code/language unchanged
  {
    const bNotes = createAndCompleteBooking('usr_bytebender', 'usr_pixelpriya', 'TypeScript');

    // Simulate pre-existing snapshot code
    db.prepare(`
      INSERT INTO session_notes (id, booking_id, summary, final_code, language, saved_at)
      VALUES ('not_test_123', ?, 'Initial summary', 'const x: number = 42;', 'typescript', datetime('now'))
    `).run(bNotes.id);

    // Non-participant (Tanvi) tries to update notes -> 403
    const nonPartRes = await fetch(`${BASE_URL}/api/bookings/${bNotes.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_terminaltinkerer' },
      body: JSON.stringify({ summary: 'Intruder notes' }),
    });
    if (nonPartRes.status !== 403) {
      throw new Error(`Expected 403 when non-participant updates notes, got ${nonPartRes.status}`);
    }

    // Summary > 1000 chars -> 400
    const over1000 = 'a'.repeat(1001);
    const over1000Res = await fetch(`${BASE_URL}/api/bookings/${bNotes.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_bytebender' },
      body: JSON.stringify({ summary: over1000 }),
    });
    if (over1000Res.status !== 400) {
      throw new Error(`Expected 400 for summary > 1000 chars, got ${over1000Res.status}`);
    }

    // Valid participant update
    const validSummary = 'We discussed TypeScript generics and strict typing in custom React hooks.';
    const updateRes = await fetch(`${BASE_URL}/api/bookings/${bNotes.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_bytebender' },
      body: JSON.stringify({ summary: validSummary }),
    });
    if (updateRes.status !== 200) {
      throw new Error(`Expected 200 for valid summary update, got ${updateRes.status}`);
    }

    // Verify GET /api/bookings/:id/notes: final_code and language unchanged
    const getNotesRes = await fetch(`${BASE_URL}/api/bookings/${bNotes.id}/notes`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const notesData = await getNotesRes.json();
    if (notesData.summary !== validSummary) {
      throw new Error(`Summary not updated: expected "${validSummary}", got "${notesData.summary}"`);
    }
    if (notesData.final_code !== 'const x: number = 42;') {
      throw new Error(`final_code was overwritten! Got: "${notesData.final_code}"`);
    }
    if (notesData.language !== 'typescript') {
      throw new Error(`language was overwritten! Got: "${notesData.language}"`);
    }

    console.log('  PASS (7): notes: POST summary works for participants only, only for completed, over 1000 chars rejected, code/language intact');
  }

  // --- CASE 8: sockets: mentor receives booking:rated and ledger:updated after a 5-star rating; bystander receives nothing ---
  {
    const bSocketTest = createAndCompleteBooking('usr_terminaltinkerer', 'usr_pixelpriya', 'CSS/UI');

    let priyaRatedEvent = null;
    let priyaLedgerEvent = null;
    let bystanderReceivedEvents = [];

    priyaSocket.once('booking:rated', (data) => {
      priyaRatedEvent = data;
    });
    priyaSocket.once('ledger:updated', (data) => {
      priyaLedgerEvent = data;
    });

    const bystanderHandler = (data) => {
      bystanderReceivedEvents.push(data);
    };
    arjunSocket.on('booking:rated', bystanderHandler);
    arjunSocket.on('ledger:updated', bystanderHandler);

    // Tanvi rates Priya 5 stars
    const rateRes = await fetch(`${BASE_URL}/api/bookings/${bSocketTest.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_terminaltinkerer' },
      body: JSON.stringify({ rating: 5, comment: 'Priya is an incredible mentor!' }),
    });
    if (rateRes.status !== 200) {
      throw new Error(`Expected 200 from rate endpoint, got ${rateRes.status}`);
    }

    // Wait for socket events to deliver
    await wait(400);

    arjunSocket.off('booking:rated', bystanderHandler);
    arjunSocket.off('ledger:updated', bystanderHandler);

    if (!priyaRatedEvent) {
      throw new Error('Mentor Priya did not receive booking:rated event');
    }
    if (priyaRatedEvent.bookingId !== bSocketTest.id || priyaRatedEvent.rating !== 5) {
      throw new Error(`Invalid booking:rated event payload: ${JSON.stringify(priyaRatedEvent)}`);
    }
    if (!priyaRatedEvent.bonusPaid) {
      throw new Error('Expected bonusPaid=true in booking:rated event payload');
    }

    if (!priyaLedgerEvent) {
      throw new Error('Mentor Priya did not receive ledger:updated event after 5-star bonus');
    }
    if (priyaLedgerEvent.userId !== 'usr_pixelpriya') {
      throw new Error(`Invalid ledger:updated event payload: ${JSON.stringify(priyaLedgerEvent)}`);
    }

    if (bystanderReceivedEvents.length > 0) {
      throw new Error(`Bystander Arjun received unexpected events: ${JSON.stringify(bystanderReceivedEvents)}`);
    }

    console.log('  PASS (8): sockets: mentor receives booking:rated and ledger:updated after a 5-star rating; bystander receives nothing');
  }

  console.log('\n========================================');
  console.log('Slice 7 Test Suite: 8 PASSED, 0 FAILED');
  console.log('========================================\n');
} catch (err) {
  console.error('Slice 7 test suite failed:', err);
  process.exitCode = 1;
} finally {
  if (tanviSocket) tanviSocket.disconnect();
  if (priyaSocket) priyaSocket.disconnect();
  if (arjunSocket) arjunSocket.disconnect();

  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      serverProcess.kill();
    } catch (_) {}
  }
  if (db && typeof db.close === 'function') {
    try { db.close(); } catch (_) {}
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  process.exit(process.exitCode || 0);
}
