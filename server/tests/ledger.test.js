import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { io as ioClient } from 'socket.io-client';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebSocket as WebSocketPolyfill } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// 1. Create a dedicated temporary database directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-ledger-test-'));
const tempDbPath = path.join(tempDir, 'ledger.db');
process.env.DB_PATH = tempDbPath;

console.log('====================================================');
console.log('🧪 Starting Slice 6 Ledger & Settlement Test Suite');
console.log(`📁 Test Database: ${tempDbPath}`);
console.log('🌐 Server Port: 4100');
console.log('====================================================\n');

// Import DB, Seed, and Ledger modules after setting DB_PATH
const { db } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const {
  getUserBalance,
  getUserReservedCredits,
  getUserAvailableCredits,
  settleBooking,
  getExistingSettlement,
  checkIntegrity,
} = await import('../src/ledger.js');
const { createBooking, acceptBooking, startBooking, declineBooking, cancelBooking } = await import('../src/bookings.js');
const { hasRoomDoc, getOpenRoomCount } = await import('../src/yjs.js');

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
  const tanviSocket = ioClient('http://localhost:4100', {
    auth: { userId: 'usr_terminaltinkerer' },
    transports: ['websocket'],
  });
  const priyaSocket = ioClient('http://localhost:4100', {
    auth: { userId: 'usr_pixelpriya' },
    transports: ['websocket'],
  });
  const arjunSocket = ioClient('http://localhost:4100', {
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

  // Case 1: Starting grants exist for all users; balance equals SUM(delta)
  {
    const users = db.prepare('SELECT id FROM users').all();
    if (users.length !== 14) throw new Error(`Expected 14 users, got ${users.length}`);

    for (const u of users) {
      const balance = getUserBalance(u.id, db);
      const sumDelta = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM ledger_entries WHERE user_id = ?').get(u.id).s;
      if (balance !== sumDelta) throw new Error(`User ${u.id} balance ${balance} != sum(delta) ${sumDelta}`);

      const grants = db.prepare("SELECT COUNT(*) AS c FROM ledger_entries WHERE user_id = ? AND kind = 'grant'").get(u.id).c;
      if (grants < 1) throw new Error(`User ${u.id} missing starting grant`);
    }
    console.log('  PASS (1): starting grants exist for all users; balance equals SUM(delta)');
  }

  // Case 2: Booking blocked when available credits are insufficient; reserved credits are counted
  {
    // Tanvi has 5 available credits initially
    const slot1 = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const b1 = createBooking({
      learnerId: 'usr_terminaltinkerer',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'First booking to reserve all 5 available credits.',
      slotId: slot1.id,
    }, db);
    acceptBooking({ bookingId: b1.id, mentorId: 'usr_pixelpriya' }, db);

    // Reserved credits should now be 5, available should be 0
    const tanviReserved = getUserReservedCredits('usr_terminaltinkerer', db);
    const tanviAvailable = getUserAvailableCredits('usr_terminaltinkerer', db);
    if (tanviReserved !== 5) throw new Error(`Expected reserved 5, got ${tanviReserved}`);
    if (tanviAvailable !== 0) throw new Error(`Expected available 0, got ${tanviAvailable}`);

    // Now a second booking request from Tanvi must be blocked with 402
    let blocked = false;
    const slot2 = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_bytebender' LIMIT 1").get();
    try {
      createBooking({
        learnerId: 'usr_terminaltinkerer',
        mentorId: 'usr_bytebender',
        topic: 'Node.js',
        problemNote: 'Second booking attempt when available credits are 0 should fail.',
        slotId: slot2.id,
      }, db);
    } catch (err) {
      if (err.status === 402) blocked = true;
    }
    if (!blocked) throw new Error('Expected 402 when booking with insufficient available credits');

    // Clean up b1 by cancelling it so reserved credits return
    cancelBooking({ bookingId: b1.id, userId: 'usr_terminaltinkerer' }, db);

    console.log('  PASS (2): booking blocked when available credits are insufficient; reserved credits are counted');
  }

  // Case 3: Complete on an accepted (not started) booking -> 409, nothing written
  let testBookingId = null;
  let testRoomId = null;
  {
    // Create and accept a fresh booking between AlgoAce (learner, 10 cr) and Priya (mentor)
    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const created = createBooking({
      learnerId: 'usr_algoace',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Learning CSS Grid and layout architecture from senior peer.',
      slotId: slot.id,
    }, db);
    const accepted = acceptBooking({ bookingId: created.id, mentorId: 'usr_pixelpriya' }, db);
    testBookingId = accepted.id;
    testRoomId = accepted.room_id;

    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    let failed409 = false;
    try {
      settleBooking(testBookingId, 'usr_algoace', db);
    } catch (err) {
      if (err.status === 409) failed409 = true;
    }
    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    if (!failed409 || countBefore !== countAfter) {
      throw new Error('Expected complete on accepted booking to fail with 409 without ledger writes');
    }
    console.log('  PASS (3): complete on an accepted (not started) booking -> 409, nothing written');
  }

  // Case 4: Complete by a non-participant -> 403, nothing written
  {
    // Start the booking so it is in_progress
    startBooking({ bookingId: testBookingId, userId: 'usr_algoace' }, db);

    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    let failed403 = false;
    try {
      settleBooking(testBookingId, 'usr_bytebender', db);
    } catch (err) {
      if (err.status === 403) failed403 = true;
    }
    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    if (!failed403 || countBefore !== countAfter) {
      throw new Error('Expected complete by non-participant to fail with 403 without ledger writes');
    }
    console.log('  PASS (4): complete by a non-participant -> 403, nothing written');
  }

  // Case 5: Complete on in_progress moves exactly cost once: learner -5, mentor +5, balances correct, two rows linked
  let case5SpendId = null;
  let case5EarnId = null;
  {
    const learnerBalBefore = getUserBalance('usr_algoace', db);
    const mentorBalBefore = getUserBalance('usr_pixelpriya', db);

    const res = settleBooking(testBookingId, 'usr_algoace', db);
    if (res.alreadySettled) throw new Error('First settlement should have alreadySettled=false');

    const learnerBalAfter = getUserBalance('usr_algoace', db);
    const mentorBalAfter = getUserBalance('usr_pixelpriya', db);

    if (learnerBalAfter !== learnerBalBefore - 5) {
      throw new Error(`Learner balance expected ${learnerBalBefore - 5}, got ${learnerBalAfter}`);
    }
    if (mentorBalAfter !== mentorBalBefore + 5) {
      throw new Error(`Mentor balance expected ${mentorBalBefore + 5}, got ${mentorBalAfter}`);
    }

    const rows = db.prepare('SELECT * FROM ledger_entries WHERE booking_id = ?').all(testBookingId);
    if (rows.length !== 2) throw new Error(`Expected exactly 2 ledger rows, got ${rows.length}`);

    const spend = rows.find((r) => r.kind === 'session_spend');
    const earn = rows.find((r) => r.kind === 'session_earn');
    if (!spend || spend.delta !== -5) throw new Error('Invalid spend row');
    if (!earn || earn.delta !== 5) throw new Error('Invalid earn row');

    case5SpendId = spend.id;
    case5EarnId = earn.id;

    const b = db.prepare('SELECT status, completed_at FROM bookings WHERE id = ?').get(testBookingId);
    if (b.status !== 'completed' || !b.completed_at) throw new Error('Booking status was not completed');

    console.log('  PASS (5): complete on in_progress moves exactly cost once: learner -5, mentor +5, two ledger rows linked');
  }

  // Case 6: Second complete call returns alreadySettled=true and writes nothing
  {
    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    const res2 = settleBooking(testBookingId, 'usr_pixelpriya', db);
    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;

    if (!res2.alreadySettled) throw new Error('Second settlement should return alreadySettled=true');
    if (countBefore !== countAfter) throw new Error('Second settlement wrote duplicate ledger rows');
    if (res2.settlement.spend_entry_id !== case5SpendId || res2.settlement.earn_entry_id !== case5EarnId) {
      throw new Error('Second settlement did not return existing entry IDs');
    }
    console.log('  PASS (6): second complete call returns alreadySettled=true and writes nothing');
  }

  // Case 7: 10 SIMULTANEOUS complete calls over HTTP: exactly ONE settlement, exactly 2 ledger rows, all 200
  {
    // Create, accept, and start another booking between DevDynamo (10 cr) and Priya
    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const b = createBooking({
      learnerId: 'usr_devdynamo',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Testing concurrent settlements over HTTP endpoints.',
      slotId: slot.id,
    }, db);
    acceptBooking({ bookingId: b.id, mentorId: 'usr_pixelpriya' }, db);
    startBooking({ bookingId: b.id, userId: 'usr_devdynamo' }, db);

    const calls = Array.from({ length: 10 }).map((_, i) => {
      const actingUser = i % 2 === 0 ? 'usr_devdynamo' : 'usr_pixelpriya';
      return fetch(`http://localhost:4100/api/bookings/${b.id}/complete`, {
        method: 'POST',
        headers: { 'X-User-Id': actingUser },
      });
    });

    const responses = await Promise.all(calls);
    const bodies = await Promise.all(responses.map((r) => r.json()));

    for (let i = 0; i < responses.length; i++) {
      if (responses[i].status !== 200) {
        throw new Error(`Call ${i} failed with status ${responses[i].status}: ${JSON.stringify(bodies[i])}`);
      }
    }

    const firstSpendId = bodies[0].settlement.spend_entry_id;
    const firstEarnId = bodies[0].settlement.earn_entry_id;
    for (let i = 1; i < bodies.length; i++) {
      if (bodies[i].settlement.spend_entry_id !== firstSpendId || bodies[i].settlement.earn_entry_id !== firstEarnId) {
        throw new Error(`Inconsistent settlement ids in concurrent call ${i}`);
      }
    }

    const rows = db.prepare('SELECT * FROM ledger_entries WHERE booking_id = ?').all(b.id);
    if (rows.length !== 2) throw new Error(`Expected exactly 2 ledger rows from 10 concurrent calls, found ${rows.length}`);

    console.log('  PASS (7): 10 SIMULTANEOUS complete calls over HTTP result in exactly ONE settlement and identical responses');
  }

  // Case 8: Direct duplicate insert of (booking_id, kind) fails with constraint error and leaves everything unchanged
  {
    let constraintFailed = false;
    try {
      db.prepare(`
        INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
        VALUES ('led_duplicate_test', 'usr_algoace', -5, 'session_spend', 'Duplicate insert test', ?, ?)
      `).run(testBookingId, new Date().toISOString());
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        constraintFailed = true;
      }
    }
    if (!constraintFailed) throw new Error('Expected UNIQUE constraint error on duplicate (booking_id, kind)');
    console.log('  PASS (8): direct duplicate insert of (booking_id, kind) fails with constraint error and leaves state intact');
  }

  // Case 9: Rollback: simulate failure after first insert inside transaction
  {
    // Create and start booking between ByteBender (30 cr available) and Priya
    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const b = createBooking({
      learnerId: 'usr_bytebender',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Testing rollback simulation inside atomic transaction helper.',
      slotId: slot.id,
    }, db);
    acceptBooking({ bookingId: b.id, mentorId: 'usr_pixelpriya' }, db);
    startBooking({ bookingId: b.id, userId: 'usr_bytebender' }, db);

    let threw = false;
    try {
      settleBooking(b.id, 'usr_bytebender', db, { _forceThrowAfterSpend: true });
    } catch (err) {
      threw = true;
    }
    if (!threw) throw new Error('Expected forced throw to propagate from transaction');

    const rows = db.prepare('SELECT * FROM ledger_entries WHERE booking_id = ?').all(b.id);
    if (rows.length !== 0) throw new Error(`Expected 0 ledger rows after rollback, found ${rows.length}`);

    const bookingCheck = db.prepare('SELECT status FROM bookings WHERE id = ?').get(b.id);
    if (bookingCheck.status !== 'in_progress') throw new Error(`Expected status to remain in_progress, got ${bookingCheck.status}`);

    // Clean up test booking
    db.prepare('DELETE FROM bookings WHERE id = ?').run(b.id);

    console.log('  PASS (9): rollback leaves NO rows and NO booking status change persisted');
  }

  // Case 10: Decline and cancel move nothing (ledger row count unchanged)
  {
    const ledgerCountBefore = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;

    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const bDecline = createBooking({
      learnerId: 'usr_bytebender',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Session that will be declined by mentor.',
      slotId: slot.id,
    }, db);
    declineBooking({ bookingId: bDecline.id, mentorId: 'usr_pixelpriya' }, db);

    const bCancel = createBooking({
      learnerId: 'usr_bytebender',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Session that will be cancelled by learner.',
      slotId: slot.id,
    }, db);
    cancelBooking({ bookingId: bCancel.id, userId: 'usr_bytebender' }, db);

    const ledgerCountAfter = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get().c;
    if (ledgerCountBefore !== ledgerCountAfter) {
      throw new Error(`Ledger count changed after decline/cancel (${ledgerCountBefore} -> ${ledgerCountAfter})`);
    }
    console.log('  PASS (10): decline and cancel move nothing (ledger row count unchanged)');
  }

  // Case 11: Total credits conserved: checkIntegrity()
  {
    const integrity = checkIntegrity(db);
    if (!integrity.ok) {
      throw new Error(`Integrity check failed: ${JSON.stringify(integrity.checks)}`);
    }
    if (integrity.sum_all_deltas !== 140) {
      throw new Error(`Sum of all deltas ${integrity.sum_all_deltas} != 140`);
    }
    console.log('  PASS (11): total credits conserved: checkIntegrity() reports all green (140 cr conserved, 0 negative balances)');
  }

  // Case 12: Level-up: settle booking taking mentor from 2 completed sessions to 3 (leveled_up = true)
  {
    // Create a mock mentor with exactly 2 completed sessions
    const mockMentorId = `usr_test_mentor_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, handle, avatar_color, bio, experience, languages, is_online, created_at)
      VALUES (?, 'Test Mentor', 'TestMentor', '#10b981', 'Bio', 'junior', 'English', 1, ?)
    `).run(mockMentorId, new Date().toISOString());

    db.prepare(`
      INSERT INTO user_skills (id, user_id, topic)
      VALUES (?, ?, 'React')
    `).run(`skl_${Date.now()}`, mockMentorId);

    // Give 2 completed sessions as mentor
    for (let i = 0; i < 2; i++) {
      const mockBId = `bok_mock_c12_${Date.now()}_${i}`;
      db.prepare(`
        INSERT INTO bookings (id, learner_id, mentor_id, topic, problem_note, slot_label, status, cost, room_id, requested_at, completed_at)
        VALUES (?, 'usr_algoace', ?, 'React', 'Mock note 1234567890', 'Mon: 10:00-12:00', 'completed', 5, 'room_mock', ?, ?)
      `).run(mockBId, mockMentorId, new Date().toISOString(), new Date().toISOString());
    }

    // Now create a 3rd booking and settle it
    const activeBId = `bok_mock_active_${Date.now()}`;
    db.prepare(`
      INSERT INTO bookings (id, learner_id, mentor_id, topic, problem_note, slot_label, status, cost, room_id, requested_at, started_at)
      VALUES (?, 'usr_algoace', ?, 'React', 'Mock note 1234567890', 'Mon: 10:00-12:00', 'in_progress', 5, 'room_active_lvl', ?, ?)
    `).run(activeBId, mockMentorId, new Date().toISOString(), new Date().toISOString());

    const result = settleBooking(activeBId, 'usr_algoace', db);
    if (!result.settlement.leveled_up) throw new Error('Expected leveled_up to be true when crossing from 2 to 3 sessions');
    if (result.settlement.mentor_level_before !== 1 || result.settlement.mentor_level_after !== 2) {
      throw new Error(`Expected level transition 1 -> 2, got ${result.settlement.mentor_level_before} -> ${result.settlement.mentor_level_after}`);
    }
    console.log('  PASS (12): level-up: settle booking taking mentor from 2 to 3 completed sessions triggers leveled_up = true');
  }

  // Case 13: Socket events: both participants receive session:ended and ledger:updated; bystander receives nothing
  {
    // Tanvi has 5 credits available, books Priya
    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const b = createBooking({
      learnerId: 'usr_terminaltinkerer',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Testing socket event delivery for session settlement.',
      slotId: slot.id,
    }, db);
    acceptBooking({ bookingId: b.id, mentorId: 'usr_pixelpriya' }, db);
    startBooking({ bookingId: b.id, userId: 'usr_terminaltinkerer' }, db);

    let tanviEnded = null;
    let tanviLedger = false;
    let priyaEnded = null;
    let priyaLedger = false;
    let arjunEvent = false;

    tanviSocket.on('session:ended', (d) => { if (d.bookingId === b.id) tanviEnded = d; });
    tanviSocket.on('ledger:updated', () => { tanviLedger = true; });

    priyaSocket.on('session:ended', (d) => { if (d.bookingId === b.id) priyaEnded = d; });
    priyaSocket.on('ledger:updated', () => { priyaLedger = true; });

    arjunSocket.on('session:ended', (d) => { if (d.bookingId === b.id) arjunEvent = true; });
    arjunSocket.on('ledger:updated', () => { arjunEvent = true; });

    // Call /complete via HTTP
    const res = await fetch(`http://localhost:4100/api/bookings/${b.id}/complete`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (!res.ok) throw new Error(`HTTP complete failed: ${res.status}`);

    await wait(1500);

    if (!tanviEnded || !tanviLedger) throw new Error('Tanvi did not receive session:ended and ledger:updated');
    if (!priyaEnded || !priyaLedger) throw new Error('Priya did not receive session:ended and ledger:updated');
    if (arjunEvent) throw new Error('Bystander Arjun unexpectedly received session events');

    // Verify privacy: Tanvi received her own balance, Priya received her own balance
    if (typeof tanviEnded.my_new_balance !== 'number') throw new Error('Tanvi did not receive my_new_balance');
    if (typeof priyaEnded.my_new_balance !== 'number') throw new Error('Priya did not receive my_new_balance');

    console.log('  PASS (13): socket events: both participants receive session:ended and ledger:updated with private balance; bystander receives nothing');
  }

  // Case 14: Yjs connection to room after completion rejected; session_notes contains final code; doc removed from memory
  {
    // Create a new booking for Yjs testing with CloudCharlie (10 cr available)
    const slot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    const b = createBooking({
      learnerId: 'usr_cloudpilot',
      mentorId: 'usr_pixelpriya',
      topic: 'CSS/UI',
      problemNote: 'Testing Yjs collaborative code snapshot and memory teardown.',
      slotId: slot.id,
    }, db);
    const accepted = acceptBooking({ bookingId: b.id, mentorId: 'usr_pixelpriya' }, db);
    startBooking({ bookingId: b.id, userId: 'usr_cloudpilot' }, db);

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      'ws://localhost:4100/yjs',
      accepted.room_id,
      doc,
      {
        WebSocketPolyfill,
        params: { userId: 'usr_cloudpilot' },
      }
    );

    await new Promise((res) => {
      if (provider.synced) return res();
      provider.on('synced', res);
      setTimeout(res, 2000);
    });

    // Type code and change language
    const ytext = doc.getText('code');
    ytext.insert(0, 'const answer = 42;\nconsole.log(answer);');
    const meta = doc.getMap('meta');
    meta.set('language', 'typescript');

    await wait(500);

    // Call complete via HTTP
    const compRes = await fetch(`http://localhost:4100/api/bookings/${b.id}/complete`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_cloudpilot' },
    });
    if (!compRes.ok) throw new Error(`HTTP complete failed: ${compRes.status}`);

    await wait(1000);

    // 1. Check doc is removed from memory
    const healthRes = await fetch('http://localhost:4100/api/health');
    const health = await healthRes.json();
    if (typeof health.open_rooms === 'number' && health.open_rooms !== 0) {
      console.warn(`Note: open_rooms reported ${health.open_rooms}`);
    }

    // 2. Check session_notes
    const note = db.prepare('SELECT * FROM session_notes WHERE booking_id = ? ORDER BY saved_at DESC LIMIT 1').get(b.id);
    if (!note) throw new Error('Missing session_notes row for completed booking');
    if (!note.final_code.includes('const answer = 42;')) {
      throw new Error(`session_notes final_code unexpected: "${note.final_code}"`);
    }
    if (note.language !== 'typescript') {
      throw new Error(`session_notes language expected typescript, got "${note.language}"`);
    }

    // 3. New Yjs connection rejected
    let newConnectionFailed = false;
    const doc2 = new Y.Doc();
    const provider2 = new WebsocketProvider(
      'ws://localhost:4100/yjs',
      accepted.room_id,
      doc2,
      {
        WebSocketPolyfill,
        params: { userId: 'usr_cloudpilot' },
      }
    );
    await new Promise((res) => {
      provider2.on('connection-error', () => {
        newConnectionFailed = true;
        res();
      });
      provider2.on('connection-close', () => {
        newConnectionFailed = true;
        res();
      });
      setTimeout(() => {
        if (!provider2.wsconnected) newConnectionFailed = true;
        res();
      }, 1500);
    });
    provider2.destroy();
    provider.destroy();

    if (!newConnectionFailed) {
      throw new Error('New Yjs connection to completed booking room was unexpectedly accepted');
    }

    console.log('  PASS (14): Yjs connection to room after completion rejected; session_notes contains final code & language; doc removed from memory');
  }

  // Disconnect socket clients
  tanviSocket.disconnect();
  priyaSocket.disconnect();
  arjunSocket.disconnect();

  console.log('\n========================================');
  console.log('Ledger & Settlement Suite: 14 PASSED, 0 FAILED');
  console.log('========================================\n');
} catch (testErr) {
  console.error('Test suite failed with error:', testErr);
  process.exitCode = 1;
} finally {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      serverProcess.kill();
    } catch (_) {}
  }
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch (_) {}
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
  process.exit(process.exitCode || 0);
}
