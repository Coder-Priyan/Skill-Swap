// Comprehensive Test Suite for Slice 3: Bookings & Credit Reservations
// Covers all test cases against a temporary database via DB_PATH

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure isolated temp DB path BEFORE importing db modules
const tempDbFile = path.resolve(__dirname, `temp_test_bookings_${Date.now()}.db`);
process.env.DB_PATH = tempDbFile;

// Dynamic import to pick up the env var
const { createDatabase } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const {
  createBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  getBookingById,
  getBookings,
  getBookingsSummary,
} = await import('../src/bookings.js');

let testDb = null;
let passedCount = 0;
let totalCount = 0;

function it(description, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(err);
    throw err;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Slice 3 Bookings & Reservations Test Suite');
  console.log(`📁 Test Database: ${tempDbFile}`);
  console.log('====================================================\n');

  testDb = await createDatabase(tempDbFile);
  runSeed(testDb);

  const getLedgerSum = () => {
    const row = testDb.prepare('SELECT SUM(delta) AS sum FROM ledger_entries').get();
    return Number(row.sum);
  };

  const initialLedgerSum = getLedgerSum();
  assert.strictEqual(initialLedgerSum, 140, 'Initial sum of ledger deltas must equal 140');

  // Seed users
  const tanvi = testDb.prepare('SELECT id, name FROM users WHERE id = ?').get('usr_terminaltinkerer');
  const priya = testDb.prepare('SELECT id, name FROM users WHERE id = ?').get('usr_pixelpriya');
  const arjun = testDb.prepare('SELECT id, name FROM users WHERE id = ?').get('usr_bytebender');
  const aman = testDb.prepare('SELECT id, name FROM users WHERE id = ?').get('usr_stackstar');

  assert.ok(tanvi && priya && arjun && aman, 'Required seed users must exist');

  // Slots
  const priyaSlot = testDb.prepare('SELECT id, day_of_week, start_hour, end_hour FROM availability_slots WHERE user_id = ?').get(priya.id);
  const arjunSlot = testDb.prepare('SELECT id, day_of_week, start_hour, end_hour FROM availability_slots WHERE user_id = ?').get(arjun.id);
  const amanSlot = testDb.prepare('SELECT id, day_of_week, start_hour, end_hour FROM availability_slots WHERE user_id = ?').get(aman.id);

  console.log('Test Cases:');

  // 1. Valid booking request transitions to 'requested'
  let booking1 = null;
  it('1. Valid booking request transitions to requested', () => {
    booking1 = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Need help optimizing re-render loops in our component tree',
      slotId: priyaSlot.id,
    }, testDb);

    assert.ok(booking1, 'Booking should be created');
    assert.strictEqual(booking1.status, 'requested');
    assert.strictEqual(booking1.learner_id, tanvi.id);
    assert.strictEqual(booking1.mentor_id, priya.id);
    assert.strictEqual(booking1.cost, 5);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 2. Self-booking blocked (400)
  it('2. Self-booking blocked (400)', () => {
    let error = null;
    try {
      createBooking({
        learnerId: priya.id,
        mentorId: priya.id,
        topic: 'React',
        problemNote: 'Trying to mentor myself on React internals',
        slotId: priyaSlot.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /yourself/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 3. Topic not in mentor's skills blocked (400)
  it("3. Topic not in mentor's skills blocked (400)", () => {
    let error = null;
    try {
      createBooking({
        learnerId: tanvi.id,
        mentorId: priya.id,
        topic: 'Flutter', // Priya has React, CSS/UI, TypeScript, System Design (not Flutter)
        problemNote: 'Want to build a cross-platform mobile application',
        slotId: priyaSlot.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /offer mentorship/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 4. Problem note < 10 chars blocked (400)
  it('4. Problem note < 10 chars blocked (400)', () => {
    let error = null;
    try {
      createBooking({
        learnerId: tanvi.id,
        mentorId: priya.id,
        topic: 'React',
        problemNote: 'help bug', // 8 chars
        slotId: priyaSlot.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /between 10 and 500 characters/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 5. Slot does not belong to mentor blocked (400)
  it('5. Slot does not belong to mentor blocked (400)', () => {
    let error = null;
    try {
      createBooking({
        learnerId: tanvi.id,
        mentorId: priya.id,
        topic: 'React',
        problemNote: 'Let us pair during an afternoon slot',
        slotId: arjunSlot.id, // Arjun slot passed for Priya
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /does not belong to this mentor/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 6. Learner with < 5 available credits blocked (402)
  it('6. Learner with < 5 available credits blocked (402)', () => {
    let error = null;
    try {
      createBooking({
        learnerId: 'usr_bughunter', // balance = 0 cr in seed
        mentorId: priya.id,
        topic: 'React',
        problemNote: 'Would love help diagnosing this React error',
        slotId: priyaSlot.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 402);
    assert.match(error.message, /credits/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 7. Level rule: mentor.level < learner.level blocked (400)
  it('7. Level rule: mentor.level < learner.level blocked (400)', () => {
    // Priya is Level 3 (11 mentor sessions)
    // Aman (StackStar) is Level 1 (0 mentor sessions)
    let error = null;
    try {
      createBooking({
        learnerId: priya.id, // Level 3
        mentorId: aman.id,   // Level 1
        topic: 'Java',
        problemNote: 'Reviewing Spring Boot concurrency models',
        slotId: amanSlot.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /mentor level .* must be greater than or equal to learner level/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 8. Duplicate request: a learner cannot have two open (requested or accepted) bookings with the same mentor (409)
  it('8. Duplicate request: another open request with same mentor blocked (409)', () => {
    // Try to book Priya on a different slot
    const priyaSlot2 = testDb.prepare('SELECT id FROM availability_slots WHERE user_id = ? LIMIT 1 OFFSET 1').get(priya.id);
    let error = null;
    try {
      createBooking({
        learnerId: tanvi.id,
        mentorId: priya.id,
        topic: 'React',
        problemNote: 'Another booking request with Priya on another slot',
        slotId: priyaSlot2.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error');
    assert.strictEqual(error.status, 409);
    assert.match(error.message, /already exists for this mentor/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 9. Accept transitions to 'accepted'; learner's available credits drop by 5; balances unchanged
  let acceptedBooking = null;
  it("9. Accept transitions to 'accepted'; learner available credits drop by 5; balances unchanged", () => {
    const tanviBalBefore = testDb.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger_entries WHERE user_id = ?').get(tanvi.id).b;
    const priyaBalBefore = testDb.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger_entries WHERE user_id = ?').get(priya.id).b;
    assert.strictEqual(tanviBalBefore, 5, 'Tanvi starting balance is 5');

    acceptedBooking = acceptBooking({
      bookingId: booking1.id,
      mentorId: priya.id,
    }, testDb);

    assert.strictEqual(acceptedBooking.status, 'accepted');
    assert.ok(acceptedBooking.accepted_at, 'accepted_at should be recorded');
    assert.ok(acceptedBooking.room_id, 'room_id should be allocated');

    // Check balances
    const tanviBalAfter = testDb.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger_entries WHERE user_id = ?').get(tanvi.id).b;
    const priyaBalAfter = testDb.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger_entries WHERE user_id = ?').get(priya.id).b;
    assert.strictEqual(tanviBalAfter, 5, 'Tanvi balance MUST remain unchanged');
    assert.strictEqual(priyaBalAfter, priyaBalBefore, 'Priya balance MUST remain unchanged');

    // Check reserved and available credits for Tanvi
    const tanviReserved = testDb.prepare("SELECT COALESCE(SUM(cost), 0) AS r FROM bookings WHERE learner_id = ? AND status IN ('accepted', 'in_progress')").get(tanvi.id).r;
    assert.strictEqual(tanviReserved, 5, 'Tanvi should have 5 credits reserved');
    assert.strictEqual(tanviBalAfter - tanviReserved, 0, 'Tanvi available credits should drop from 5 to 0');

    assert.strictEqual(getLedgerSum(), 140, 'Ledger delta sum must remain 140');
  });

  // 10. Second accept on a different mentor fails if learner now has < 5 available credits (402)
  it('10. Second accept on different mentor fails if learner now has < 5 available credits (402)', () => {
    // Setup a user who starts with 5 credits and has 2 requested bookings
    testDb.prepare(`
      INSERT INTO users (id, name, handle, avatar_color, bio, experience, languages, is_online, created_at)
      VALUES ('usr_test_tworeqs', 'Two Reqs User', 'TwoReqs', '#123456', 'Test user', 'student', 'English', 1, datetime('now'))
    `).run();
    testDb.prepare(`
      INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
      VALUES ('led_test_tworeqs_grant', 'usr_test_tworeqs', 5, 'grant', 'Test grant', NULL, datetime('now'))
    `).run();

    const priyaSlot2 = testDb.prepare('SELECT id FROM availability_slots WHERE user_id = ? LIMIT 1 OFFSET 1').get(priya.id);
    const bReq1 = createBooking({
      learnerId: 'usr_test_tworeqs',
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'First booking request from user with 5 credits',
      slotId: priyaSlot2.id,
    }, testDb);

    const bReq2 = createBooking({
      learnerId: 'usr_test_tworeqs',
      mentorId: arjun.id,
      topic: 'Node.js',
      problemNote: 'Second booking request from user with 5 credits',
      slotId: arjunSlot.id,
    }, testDb);

    assert.strictEqual(bReq1.status, 'requested');
    assert.strictEqual(bReq2.status, 'requested');

    // First accept succeeds (by Priya)
    const acc1 = acceptBooking({ bookingId: bReq1.id, mentorId: priya.id }, testDb);
    assert.strictEqual(acc1.status, 'accepted');

    // Second accept fails with 402 because available credits are now 0 < 5
    let error = null;
    try {
      acceptBooking({ bookingId: bReq2.id, mentorId: arjun.id }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Second accept should fail');
    assert.strictEqual(error.status, 402);
    assert.match(error.message, /credits/i);

    // Clean up temporary test user's data
    testDb.prepare("DELETE FROM bookings WHERE learner_id = 'usr_test_tworeqs'").run();
    testDb.prepare("DELETE FROM ledger_entries WHERE user_id = 'usr_test_tworeqs'").run();
    testDb.prepare("DELETE FROM users WHERE id = 'usr_test_tworeqs'").run();

    assert.strictEqual(getLedgerSum(), 140);
  });

  // 11. Cancel from 'accepted' by learner transitions to 'cancelled', frees reserved credits, records cancelled_by='learner'
  it("11. Cancel from 'accepted' by learner transitions to 'cancelled', frees reserved credits, records cancelled_by='learner'", () => {
    const cancelled = cancelBooking({
      bookingId: booking1.id,
      userId: tanvi.id,
    }, testDb);

    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.cancelled_by, 'learner');

    // Verify reserved credits freed
    const tanviReserved = testDb.prepare("SELECT COALESCE(SUM(cost), 0) AS r FROM bookings WHERE learner_id = ? AND status IN ('accepted', 'in_progress')").get(tanvi.id).r;
    assert.strictEqual(tanviReserved, 0, 'Tanvi reserved credits should now be 0');

    const tanviAvailable = testDb.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger_entries WHERE user_id = ?').get(tanvi.id).b - tanviReserved;
    assert.strictEqual(tanviAvailable, 5, 'Tanvi available credits should be back to 5');
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 12. Decline transitions to 'declined', frees any reservation
  it("12. Decline transitions to 'declined', frees any reservation", () => {
    const bookingToDecline = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Request to be declined by mentor',
      slotId: priyaSlot.id,
    }, testDb);

    assert.strictEqual(bookingToDecline.status, 'requested');

    const declined = declineBooking({
      bookingId: bookingToDecline.id,
      mentorId: priya.id,
    }, testDb);

    assert.strictEqual(declined.status, 'declined');

    // Available credits for Tanvi should remain 5
    const tanviReserved = testDb.prepare("SELECT COALESCE(SUM(cost), 0) AS r FROM bookings WHERE learner_id = ? AND status IN ('accepted', 'in_progress')").get(tanvi.id).r;
    assert.strictEqual(tanviReserved, 0);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 13. Cancel from 'requested' (by learner) transitions to 'cancelled'
  it("13. Cancel from 'requested' (by learner) transitions to 'cancelled'", () => {
    const bookingToCancel = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Request to be cancelled by learner while requested',
      slotId: priyaSlot.id,
    }, testDb);

    assert.strictEqual(bookingToCancel.status, 'requested');

    const cancelled = cancelBooking({
      bookingId: bookingToCancel.id,
      userId: tanvi.id,
    }, testDb);

    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.cancelled_by, 'learner');
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 14. Mentor cancelling an accepted booking sets cancelled_by='mentor'
  it("14. Mentor cancelling an accepted booking sets cancelled_by='mentor'", () => {
    const bookingToAccept = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Session that mentor will subsequently cancel',
      slotId: priyaSlot.id,
    }, testDb);

    acceptBooking({ bookingId: bookingToAccept.id, mentorId: priya.id }, testDb);

    // Mentor cancels
    const mentorCancelled = cancelBooking({
      bookingId: bookingToAccept.id,
      userId: priya.id,
    }, testDb);

    assert.strictEqual(mentorCancelled.status, 'cancelled');
    assert.strictEqual(mentorCancelled.cancelled_by, 'mentor');

    // Credits freed
    const tanviReserved = testDb.prepare("SELECT COALESCE(SUM(cost), 0) AS r FROM bookings WHERE learner_id = ? AND status IN ('accepted', 'in_progress')").get(tanvi.id).r;
    assert.strictEqual(tanviReserved, 0);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 15. Wrong role gets 403 (learner tries to accept; mentor tries to cancel a requested booking)
  it('15. Wrong role gets 403: learner tries to accept; mentor tries to cancel a requested booking', () => {
    const freshReq = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Testing wrong role actions on requested booking',
      slotId: priyaSlot.id,
    }, testDb);

    // Learner tries to accept (mentor-only action)
    let learnerAcceptErr = null;
    try {
      acceptBooking({ bookingId: freshReq.id, mentorId: tanvi.id }, testDb);
    } catch (err) {
      learnerAcceptErr = err;
    }
    assert.ok(learnerAcceptErr, 'Learner accepting should throw error');
    assert.strictEqual(learnerAcceptErr.status, 403);
    assert.match(learnerAcceptErr.message, /assigned mentor/i);

    // Mentor tries to cancel a requested booking (learner-only; mentor must decline)
    let mentorCancelErr = null;
    try {
      cancelBooking({ bookingId: freshReq.id, userId: priya.id }, testDb);
    } catch (err) {
      mentorCancelErr = err;
    }
    assert.ok(mentorCancelErr, 'Mentor cancelling requested booking should throw error');
    assert.strictEqual(mentorCancelErr.status, 403);
    assert.match(mentorCancelErr.message, /decline instead/i);

    // Clean up
    cancelBooking({ bookingId: freshReq.id, userId: tanvi.id }, testDb);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 16. Non-participant cannot accept/decline/cancel (403)
  it('16. Non-participant cannot accept/decline/cancel (403)', () => {
    const freshBooking = createBooking({
      learnerId: tanvi.id,
      mentorId: priya.id,
      topic: 'React',
      problemNote: 'Checking authorization boundaries with a third party',
      slotId: priyaSlot.id,
    }, testDb);

    // Arjun (third party) tries to accept
    let acceptErr = null;
    try {
      acceptBooking({ bookingId: freshBooking.id, mentorId: arjun.id }, testDb);
    } catch (err) {
      acceptErr = err;
    }
    assert.ok(acceptErr, 'Third party accept should throw');
    assert.strictEqual(acceptErr.status, 403);

    // Arjun tries to decline
    let declineErr = null;
    try {
      declineBooking({ bookingId: freshBooking.id, mentorId: arjun.id }, testDb);
    } catch (err) {
      declineErr = err;
    }
    assert.ok(declineErr, 'Third party decline should throw');
    assert.strictEqual(declineErr.status, 403);

    // Arjun tries to cancel
    let cancelErr = null;
    try {
      cancelBooking({ bookingId: freshBooking.id, userId: arjun.id }, testDb);
    } catch (err) {
      cancelErr = err;
    }
    assert.ok(cancelErr, 'Third party cancel should throw');
    assert.strictEqual(cancelErr.status, 403);

    // Clean up freshBooking
    cancelBooking({ bookingId: freshBooking.id, userId: tanvi.id }, testDb);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 17. Illegal transitions return 409 (e.g. accept already declined or cancelled)
  it('17. Illegal transitions return 409 (e.g. accept already declined or cancelled)', () => {
    // booking1 is currently 'cancelled'
    let error = null;
    try {
      acceptBooking({
        bookingId: booking1.id,
        mentorId: priya.id,
      }, testDb);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'Should throw error on illegal transition');
    assert.strictEqual(error.status, 409);
    assert.match(error.message, /Cannot accept booking in status 'cancelled'/i);
    assert.strictEqual(getLedgerSum(), 140);
  });

  // 18. SUM of all ledger deltas before and after every test stays = 140 (no ledger entries written in this slice)
  it('18. SUM of all ledger deltas before and after stays = 140', () => {
    const finalSum = getLedgerSum();
    assert.strictEqual(finalSum, 140, 'No ledger mutations allowed in Slice 3');
  });

  console.log('\n====================================================');
  console.log(`🎉 All ${passedCount}/${totalCount} tests passed successfully!`);
  console.log('====================================================');

  // Clean up temp DB files
  try {
    if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
    if (fs.existsSync(`${tempDbFile}-wal`)) fs.unlinkSync(`${tempDbFile}-wal`);
    if (fs.existsSync(`${tempDbFile}-shm`)) fs.unlinkSync(`${tempDbFile}-shm`);
  } catch {
    // Ignore cleanup errors on Windows file locks
  }
}

runTests().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
