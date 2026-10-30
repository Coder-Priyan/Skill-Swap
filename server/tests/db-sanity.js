import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createDatabase, initSchemaForDb } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSanityTests() {
  console.log('🧪 Starting DB Sanity & Transaction Verification...\n');

  const tempDbPath = path.join(__dirname, `sanity_test_${Date.now()}.db`);
  let testDb;
  let allPassed = true;

  try {
    testDb = await createDatabase(tempDbPath);
    initSchemaForDb(testDb);

    // ------------------------------------------------------------------------
    // (a) A transaction that succeeds commits both writes
    // ------------------------------------------------------------------------
    try {
      const txSuccess = testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_test_1', 'Test One', 'TestOne', '#ffffff', new Date().toISOString());

        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_test_2', 'Test Two', 'TestTwo', '#ffffff', new Date().toISOString());
      });

      txSuccess();

      const countA = testDb.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE id IN ('usr_test_1', 'usr_test_2')
      `).get().count;

      if (countA === 2) {
        console.log('PASS (a): a transaction that succeeds commits both writes');
      } else {
        console.error(`FAIL (a): expected 2 committed writes, found ${countA}`);
        allPassed = false;
      }
    } catch (err) {
      console.error('FAIL (a) with unexpected error:', err.message);
      allPassed = false;
    }

    // ------------------------------------------------------------------------
    // (b) A transaction that throws rolls back ALL its writes
    // ------------------------------------------------------------------------
    try {
      const txFail = testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_test_3', 'Test Three', 'TestThree', '#ffffff', new Date().toISOString());

        throw new Error('Intentional transaction abort');
      });

      let threw = false;
      try {
        txFail();
      } catch {
        threw = true;
      }

      const countB = testDb.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE id = 'usr_test_3'
      `).get().count;

      if (threw && countB === 0) {
        console.log('PASS (b): a transaction that throws rolls back ALL its writes');
      } else {
        console.error(`FAIL (b): expected 0 rows (rolled back), found ${countB}, threw: ${threw}`);
        allPassed = false;
      }
    } catch (err) {
      console.error('FAIL (b) with unexpected error:', err.message);
      allPassed = false;
    }

    // ------------------------------------------------------------------------
    // (c) Violating the UNIQUE(booking_id, kind) index inside a transaction
    //     rolls back the whole transaction
    // ------------------------------------------------------------------------
    try {
      // Seed a parent booking
      testDb.prepare(`
        INSERT INTO bookings (id, learner_id, mentor_id, topic, status, cost, requested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('bok_test_1', 'usr_test_1', 'usr_test_2', 'React', 'completed', 5, new Date().toISOString());

      const txUniqueViolate = testDb.transaction(() => {
        // First entry: valid
        testDb.prepare(`
          INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('led_test_1', 'usr_test_1', -5, 'session_spend', 'Test write 1', 'bok_test_1', new Date().toISOString());

        // Second entry: duplicate (booking_id, kind) violates partial unique index
        testDb.prepare(`
          INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('led_test_2', 'usr_test_1', -5, 'session_spend', 'Duplicate entry', 'bok_test_1', new Date().toISOString());
      });

      let threwConstraint = false;
      try {
        txUniqueViolate();
      } catch (err) {
        threwConstraint = true;
      }

      const countC = testDb.prepare(`
        SELECT COUNT(*) AS count FROM ledger_entries WHERE booking_id = 'bok_test_1'
      `).get().count;

      if (threwConstraint && countC === 0) {
        console.log('PASS (c): violating the UNIQUE(booking_id, kind) index inside a transaction rolls back the whole transaction');
      } else {
        console.error(`FAIL (c): expected 0 ledger entries after UNIQUE violation rollback, found ${countC}, threw: ${threwConstraint}`);
        allPassed = false;
      }
    } catch (err) {
      console.error('FAIL (c) with unexpected error:', err.message);
      allPassed = false;
    }

    // ------------------------------------------------------------------------
    // (d) Calling a transaction function from inside another does not corrupt
    //     state (either supported or throws a clear error)
    // ------------------------------------------------------------------------
    try {
      const innerTx = testDb.transaction((id, handle) => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, handle, handle, '#ffffff', new Date().toISOString());
      });

      const outerTx = testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_outer_1', 'Outer One', 'OuterOne', '#ffffff', new Date().toISOString());

        innerTx('usr_inner_1', 'InnerOne');
      });

      outerTx();

      const countD1 = testDb.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE id IN ('usr_outer_1', 'usr_inner_1')
      `).get().count;

      // Verify nested rollback isolation
      const innerFailTx = testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_nested_fail', 'Nested Fail', 'NestedFail', '#ffffff', new Date().toISOString());
        throw new Error('Nested transaction failure');
      });

      let innerCaught = false;
      const outerCatchTx = testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO users (id, name, handle, avatar_color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('usr_outer_survive', 'Outer Survive', 'OuterSurvive', '#ffffff', new Date().toISOString());

        try {
          innerFailTx();
        } catch {
          innerCaught = true;
        }
      });

      outerCatchTx();

      const countFail = testDb.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE id = 'usr_nested_fail'
      `).get().count;

      const countSurvive = testDb.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE id = 'usr_outer_survive'
      `).get().count;

      if (countD1 === 2 && innerCaught && countFail === 0 && countSurvive === 1) {
        console.log('PASS (d): calling a transaction function from inside another does not corrupt state (nested savepoints supported)');
      } else {
        console.error(`FAIL (d): nesting corrupted state or failed isolation (countD1=${countD1}, countFail=${countFail}, countSurvive=${countSurvive})`);
        allPassed = false;
      }
    } catch (err) {
      console.error('FAIL (d) with unexpected error:', err.message);
      allPassed = false;
    }

  } finally {
    // Cleanup temporary database files
    if (testDb && typeof testDb.close === 'function') {
      try {
        testDb.close();
      } catch {
        // ignore close error
      }
    }

    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(`${tempDbPath}-wal`)) fs.unlinkSync(`${tempDbPath}-wal`);
      if (fs.existsSync(`${tempDbPath}-shm`)) fs.unlinkSync(`${tempDbPath}-shm`);
    } catch {
      // ignore unlink error
    }
  }

  console.log('\n----------------------------------------');
  if (allPassed) {
    console.log('🎉 ALL DB SANITY CHECKS PASSED');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED');
    process.exit(1);
  }
}

runSanityTests();
