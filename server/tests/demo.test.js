import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import assert from 'assert';
import { io as ClientIO } from 'socket.io-client';

// Honors FORCE_FAIL=1 for failsafe verification
if (process.env.FORCE_FAIL === '1') {
  console.log('FORCE_FAIL=1 is set: intentional test failure triggered in demo.test.js.');
  process.exit(1);
}

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

// Setup temp DB
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-demo-test-'));
const tempDbPath = path.join(tempDir, 'demo.db');
process.env.DB_PATH = tempDbPath;

const { db, initSchemaForDb } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');
const { checkIntegrity, getUserBalance } = await import('../src/ledger.js');

let serverProcess;
let passed = 0;
let failed = 0;

function record(assertionNum, desc, ok, details = '') {
  if (ok) {
    console.log(`  PASS (${assertionNum}): ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL (${assertionNum}): ${desc} ${details}`);
    failed++;
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

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Slice 8 In-Process Demo Reset Test');
  console.log(`📁 Test Database: ${tempDbPath}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  let socket;

  try {
    // 1. Seed temp DB
    runSeed(db);

    // 2. Spawn server with DEMO_MODE=true
    console.log('🚀 Spawning server with DEMO_MODE=true...');
    serverProcess = spawn(
      process.execPath,
      ['server/src/index.js'],
      {
        env: {
          ...process.env,
          DEMO_MODE: 'true',
          PORT: String(PORT),
          DB_PATH: tempDbPath,
        },
        stdio: 'pipe',
      }
    );

    serverProcess.stdout.on('data', (d) => {
      if (process.env.DEBUG) process.stdout.write(d.toString());
    });
    serverProcess.stderr.on('data', (d) => {
      if (process.env.DEBUG) process.stderr.write(d.toString());
    });

    await waitForServer(BASE_URL);
    console.log('✅ Server online at', BASE_URL, '\n');

    // 3. Connect Socket.io client to listen for demo:reset event
    socket = ClientIO(BASE_URL, {
      auth: { userId: 'usr_bytebender' },
      transports: ['websocket', 'polling'],
      reconnection: false,
    });

    let demoResetReceived = false;
    let demoResetPayload = null;
    socket.on('demo:reset', (data) => {
      demoResetReceived = true;
      demoResetPayload = data;
    });

    await new Promise((resolve) => {
      socket.on('connect', resolve);
      setTimeout(resolve, 3000);
    });

    // 4. Perform full settlement and rating flow: Tanvi books Priya, completes, rates 5 stars
    const priyaSlot = db.prepare("SELECT id FROM availability_slots WHERE user_id = 'usr_pixelpriya' LIMIT 1").get();
    assert(priyaSlot, 'Priya must have an availability slot');

    // Create booking
    const bookRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr_terminaltinkerer',
      },
      body: JSON.stringify({
        mentorId: 'usr_pixelpriya',
        topic: 'React',
        problemNote: 'Live demo test session',
        slotId: priyaSlot.id,
      }),
    });
    const bookJson = await bookRes.json();
    assert.strictEqual(bookRes.status, 201, `Booking creation failed: ${JSON.stringify(bookJson)}`);
    const bookingId = bookJson.id;

    // Accept booking
    const acceptRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(acceptRes.status, 200, 'Booking accept failed');

    // Start booking
    const startRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    assert.strictEqual(startRes.status, 200, 'Booking start failed');

    // Complete booking (settlement occurs here)
    const completeRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/complete`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(completeRes.status, 200, 'Booking complete failed');

    // Rate booking 5 stars (mints 1 bonus credit)
    const rateRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr_terminaltinkerer',
      },
      body: JSON.stringify({
        rating: 5,
        comment: 'Superb session in live demo!',
      }),
    });
    assert.strictEqual(rateRes.status, 200, 'Booking rate failed');

    // Verify state was altered:
    // Tanvi: 5 - 5 = 0 credits
    // Priya: 65 + 5 + 1 = 71 credits
    // Bookings count: 26
    const alteredBookingCount = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    assert.strictEqual(alteredBookingCount, 26, 'Should have 26 bookings before reset');

    console.log('✨ Session settled & 5-star rating submitted. Now calling POST /api/demo/reset...');

    // 5. Call POST /api/demo/reset
    const resetRes = await fetch(`${BASE_URL}/api/demo/reset`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const resetJson = await resetRes.json();
    const resetHttpOk = resetRes.status === 200 && resetJson.status === 'ok';
    record(1, 'POST /api/demo/reset returns 200 { status: "ok" }', resetHttpOk);

    // Wait a brief moment for socket event
    await new Promise((r) => setTimeout(r, 400));
    record(2, 'Connected socket received demo:reset broadcast event', demoResetReceived);

    // 6. Assert seed counts
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const bookingCount = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    const ledgerCount = db.prepare('SELECT COUNT(*) as c FROM ledger_entries').get().c;
    const deltaSum = db.prepare('SELECT SUM(delta) as s FROM ledger_entries').get().s;

    record(3, 'Seed counts: exactly 14 users, 25 bookings, 64 ledger rows, SUM 140',
      userCount === 14 && bookingCount === 25 && ledgerCount === 64 && deltaSum === 140,
      `users=${userCount}, bookings=${bookingCount}, ledger=${ledgerCount}, sum=${deltaSum}`
    );

    // 7. Assert balances: Tanvi 5, Priya 65
    const tanviBal = getUserBalance('usr_terminaltinkerer', db);
    const priyaBal = getUserBalance('usr_pixelpriya', db);
    record(4, 'Balances restored: Tanvi balance = 5, Priya balance = 65',
      tanviBal === 5 && priyaBal === 65,
      `tanvi=${tanviBal}, priya=${priyaBal}`
    );

    // 8. Assert /api/health open_rooms is 0
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    record(5, 'GET /api/health reports open_rooms === 0', healthJson.open_rooms === 0, `open_rooms=${healthJson.open_rooms}`);

    // 9. Assert checkIntegrity is green (via GET /api/audit)
    const auditRes = await fetch(`${BASE_URL}/api/audit`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const auditJson = await auditRes.json();
    const allChecksOk = auditJson.checks && auditJson.checks.every((c) => c.ok);
    record(6, 'checkIntegrity audit is completely green (conserved=true, all checks ok)',
      auditJson.conserved === true && allChecksOk
    );

    // 10. Clean up first server and socket
    socket.disconnect();
    serverProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 600));

    // 11. Test DEMO_MODE=false returns 404
    console.log('\n🔒 Spawning production server with DEMO_MODE=false...');
    serverProcess = spawn(
      process.execPath,
      ['server/src/index.js'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DEMO_MODE: 'false',
          PORT: String(PORT),
          DB_PATH: tempDbPath,
        },
        stdio: 'pipe',
      }
    );

    await waitForServer(BASE_URL);

    const disabledResetRes = await fetch(`${BASE_URL}/api/demo/reset`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    record(7, 'POST /api/demo/reset returns 404 when DEMO_MODE=false',
      disabledResetRes.status === 404,
      `status=${disabledResetRes.status}`
    );

  } catch (err) {
    console.error('💥 Test execution error:', err);
    failed++;
  } finally {
    if (socket) {
      try { socket.disconnect(); } catch (_) {}
    }
    if (serverProcess) {
      try { serverProcess.kill('SIGTERM'); } catch (_) {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n====================================================');
  console.log(`📊 Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
