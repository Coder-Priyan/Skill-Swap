import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import assert from 'assert';

// 1. Setup temp DB via DB_PATH
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-profile-test-'));
const tempDbPath = path.join(tempDir, 'profile.db');
process.env.DB_PATH = tempDbPath;
process.env.NODE_ENV = 'test';

// Dynamic imports after setting DB_PATH
const { db } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const { getLevelForSessions, getLevelProgress, getBadgeDetails } = await import('../src/config.js');
const { app } = await import('../src/index.js');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Profile & Ledger Test Suite (server/tests/profile.test.js)...');
  let passed = 0;
  let failed = 0;

  function record(desc, ok, details = '') {
    if (ok) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc} ${details}`);
      failed++;
    }
  }

  try {
    // Seed temp DB
    runSeed(db);

    // Start HTTP server on dynamic port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 1. Cover: getLevelForSessions at 0, 2, 3, 9, 10, 11
    console.log('\n--- 1. getLevelForSessions pure function tests ---');
    const cases = [
      { input: 0, expected: 1 },
      { input: 2, expected: 1 },
      { input: 3, expected: 2 },
      { input: 9, expected: 2 },
      { input: 10, expected: 3 },
      { input: 11, expected: 3 },
    ];
    let allLevelTestsOk = true;
    for (const c of cases) {
      const res = getLevelForSessions(c.input);
      if (res !== c.expected) {
        allLevelTestsOk = false;
        console.error(`Mismatch for getLevelForSessions(${c.input}): expected ${c.expected}, got ${res}`);
      }
    }
    record('getLevelForSessions correctly computes levels at 0, 2, 3, 9, 10, 11', allLevelTestsOk);

    // 2. Cover: level_progress values for a L1, L2 and L3 seeded user
    console.log('\n--- 2. level_progress values for L1, L2, L3 seeded users ---');
    // Seeded:
    // L1: usr_terminaltinkerer (0 mentor sessions)
    // L2: usr_bytebender (6 mentor sessions)
    // L3: usr_pixelpriya (11 mentor sessions)
    const resTanvi = await fetch(`${baseUrl}/api/users/usr_terminaltinkerer`);
    const tanviData = await resTanvi.json();
    const lp1 = tanviData.level_progress;
    const l1Ok = lp1.level === 1 && lp1.name === 'Newcomer' && lp1.next_level === 2 && lp1.next_name === 'Helper' && lp1.sessions_to_next === 3 && lp1.percent === 0;
    record('L1 user (Tanvi) level_progress is valid', l1Ok, JSON.stringify(lp1));

    const resArjun = await fetch(`${baseUrl}/api/users/usr_bytebender`);
    const arjunData = await resArjun.json();
    const lp2 = arjunData.level_progress;
    // 6 sessions: next is 3 (10 sessions), sessions_to_next is 4, percent is round((6-3)/7 * 100) = 43%
    const l2Ok = lp2.level === 2 && lp2.name === 'Helper' && lp2.next_level === 3 && lp2.next_name === 'Mentor' && lp2.sessions_to_next === 4 && lp2.percent === 43;
    record('L2 user (ByteBender) level_progress is valid', l2Ok, JSON.stringify(lp2));

    const resPriya = await fetch(`${baseUrl}/api/users/usr_pixelpriya`);
    const priyaData = await resPriya.json();
    const lp3 = priyaData.level_progress;
    const l3Ok = lp3.level === 3 && lp3.name === 'Mentor' && lp3.next_level === null && lp3.sessions_to_next === 0 && lp3.percent === 100;
    record('L3 user (PixelPriya) level_progress is valid', l3Ok, JSON.stringify(lp3));

    // 3. Cover: badge_details earned flags for Priya and Tanvi
    console.log('\n--- 3. badge_details earned flags for Priya and Tanvi ---');
    const priyaBadges = priyaData.badge_details;
    const tanviBadges = tanviData.badge_details;

    const priyaAllEarned = priyaBadges.every((b) => b.earned === true);
    record('Priya has all 6 badge_details earned (11 sessions, 11 accepted)', priyaAllEarned, JSON.stringify(priyaBadges.map((b) => ({ [b.key]: b.earned }))));

    const tanviOnlyNewcomer = tanviBadges.find((b) => b.key === 'newcomer')?.earned === true &&
      tanviBadges.filter((b) => b.key !== 'newcomer').every((b) => b.earned === false);
    record('Tanvi has only newcomer badge earned and rest locked', tanviOnlyNewcomer, JSON.stringify(tanviBadges.map((b) => ({ [b.key]: b.earned }))));

    // 4. Cover: the ledger endpoint's newest running_balance equals the balance for ALL 14 seeded users
    console.log('\n--- 4. ledger newest running_balance equals balance for ALL 14 seeded users ---');
    const usersRes = await fetch(`${baseUrl}/api/users`);
    const allUsers = await usersRes.json();

    let allLedgersMatch = true;
    for (const u of allUsers) {
      const ledgerRes = await fetch(`${baseUrl}/api/ledger/${u.id}`, {
        headers: { 'X-User-Id': u.id },
      });
      if (!ledgerRes.ok) {
        allLedgersMatch = false;
        console.error(`Failed to fetch ledger for ${u.id}: status ${ledgerRes.status}`);
        continue;
      }
      const data = await ledgerRes.json();
      const newestEntry = data.entries[0];
      if (newestEntry) {
        if (newestEntry.running_balance !== data.balance) {
          allLedgersMatch = false;
          console.error(`Mismatch for user ${u.id}: balance ${data.balance} !== running_balance ${newestEntry.running_balance}`);
        }
      } else {
        if (data.balance !== 0) {
          allLedgersMatch = false;
          console.error(`User ${u.id} has empty ledger but balance is ${data.balance}`);
        }
      }
    }
    record('Newest running_balance equals balance for all 14 seeded users', allLedgersMatch);

    // 5. Cover: kind filter and paging return correct slices
    console.log('\n--- 5. kind filter and paging return correct slices ---');
    // Priya has 1 grant + 11 session_earn entries = 12 total entries
    const priyaAllRes = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya?limit=5&offset=0`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const priyaPage1 = await priyaAllRes.json();
    const page1Ok = priyaPage1.entries.length === 5 && priyaPage1.count === 12;

    const priyaPage2Res = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya?limit=5&offset=5`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const priyaPage2 = await priyaPage2Res.json();
    const page2Ok = priyaPage2.entries.length === 5 && priyaPage2.count === 12 && priyaPage2.entries[0].id !== priyaPage1.entries[0].id;

    const priyaGrantRes = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya?kind=grant`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const priyaGrantData = await priyaGrantRes.json();
    const grantOk = priyaGrantData.entries.length === 1 && priyaGrantData.entries[0].kind === 'grant' && priyaGrantData.count === 1;

    record('Kind filter and limit/offset paging return correct slices', page1Ok && page2Ok && grantOk, `page1=${priyaPage1.entries.length}, page2=${priyaPage2.entries.length}, grants=${priyaGrantData.entries.length}`);

    // 6. Cover: ledger of another user returns 403
    console.log('\n--- 6. ledger of another user returns 403 ---');
    const unauthorizedRes = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    record('Accessing another user\'s ledger returns HTTP 403', unauthorizedRes.status === 403, `Status: ${unauthorizedRes.status}`);

    const noHeaderRes = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya`);
    record('Accessing ledger without X-User-Id returns HTTP 403', noHeaderRes.status === 403, `Status: ${noHeaderRes.status}`);

    // 7. Cover: CSV has the right header and row count
    console.log('\n--- 7. CSV has the right header and row count ---');
    const csvRes = await fetch(`${baseUrl}/api/ledger/usr_pixelpriya/export.csv`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const csvText = await csvRes.text();
    const lines = csvText.trim().split('\n');
    const expectedHeader = 'date,kind,reason,topic,counterpart,delta,running_balance';
    const headerOk = lines[0] === expectedHeader;
    // Priya has 12 entries + 1 header = 13 lines
    const rowCountOk = lines.length === 13;
    record('CSV export has exact header and expected row count (13 lines)', headerOk && rowCountOk, `Header: ${lines[0]}, Lines: ${lines.length}`);

    // 8. Cover: GET /api/users/:id still returns the old badge and badges fields
    console.log('\n--- 8. GET /api/users/:id backwards compatibility fields ---');
    const oldFieldsOk = typeof priyaData.badge === 'string' &&
      Array.isArray(priyaData.badges) &&
      priyaData.badge === 'Mentor' &&
      priyaData.badges.length > 0;
    record('GET /api/users/:id returns intact legacy badge and badges fields', oldFieldsOk, `badge: ${priyaData.badge}, badges: ${JSON.stringify(priyaData.badges)}`);

    // 9. Cover: GET /api/users/:id privacy for balance, credits, and spend/earn stats
    console.log('\n--- 9. GET /api/users/:id privacy rules ---');
    const selfRes = await fetch(`${baseUrl}/api/users/usr_pixelpriya`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    const selfData = await selfRes.json();
    const selfHasCredits = 'balance' in selfData &&
      'reserved_credits' in selfData &&
      'available_credits' in selfData &&
      'total_credits_earned' in selfData.stats &&
      'total_credits_spent' in selfData.stats;
    record('Self profile request (X-User-Id === :id) contains credit and balance fields', selfHasCredits);

    const otherRes = await fetch(`${baseUrl}/api/users/usr_pixelpriya`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const otherData = await otherRes.json();
    const otherOmitsCredits = !('balance' in otherData) &&
      !('reserved_credits' in otherData) &&
      !('available_credits' in otherData) &&
      !('total_credits_earned' in otherData.stats) &&
      !('total_credits_spent' in otherData.stats) &&
      'level' in otherData &&
      'badges' in otherData &&
      'skills' in otherData &&
      'slots' in otherData;
    record('Other user profile request (X-User-Id !== :id) omits balance & credit fields', otherOmitsCredits);

  } catch (err) {
    console.error('Unexpected test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    if (db && typeof db.close === 'function') {
      try { db.close(); } catch (_) {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\n========================================`);
  console.log(`Profile & Ledger Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
