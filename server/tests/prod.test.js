import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import assert from 'assert';
import { io as ClientIO } from 'socket.io-client';
import WebSocket from 'ws';

// Honors FORCE_FAIL=1 for failsafe verification
if (process.env.FORCE_FAIL === '1') {
  console.log('FORCE_FAIL=1 is set: intentional test failure triggered in prod.test.js.');
  process.exit(1);
}

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

// 1. Ensure client/dist exists; build if missing
const clientDistDir = path.resolve(process.cwd(), 'client', 'dist');
const indexHtmlPath = path.join(clientDistDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.log('⚠️  client/dist is missing; running npm run build...');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('📦 client/dist already present.');
}

// 2. Setup temp DB
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-prod-test-'));
const tempDbPath = path.join(tempDir, 'prod.db');
process.env.DB_PATH = tempDbPath;

const { db, closeDb, initSchemaForDb } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');

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
  console.log('🧪 Starting Slice 8 Production Mode Integration Test');
  console.log(`📁 Test Database: ${tempDbPath}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  try {
    // Seed DB
    runSeed(db);

    // Insert an accepted booking for Yjs testing
    const testBookingId = 'bok_prod_accepted';
    const testRoomId = 'room_bok_prod_accepted';
    db.prepare(`
      INSERT INTO bookings (id, learner_id, mentor_id, topic, problem_note, slot_label, status, cost, room_id, requested_at, accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookingId,
      'usr_terminaltinkerer',
      'usr_pixelpriya',
      'React',
      'Production test session',
      'Mon 14:00-15:00',
      'accepted',
      5,
      testRoomId,
      new Date().toISOString(),
      new Date().toISOString()
    );

    if (typeof db.close === 'function') {
      db.close();
    }

    // Spawn production server
    console.log('🚀 Spawning production server (NODE_ENV=production)...');
    serverProcess = spawn(
      process.execPath,
      ['server/src/index.js'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(PORT),
          DB_PATH: tempDbPath,
        },
        stdio: 'pipe',
      }
    );

    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (process.env.DEBUG) process.stdout.write(msg);
    });
    serverProcess.stderr.on('data', (d) => {
      process.stderr.write(d.toString());
    });

    await waitForServer(BASE_URL);
    console.log('✅ Server online at', BASE_URL, '\n');

    // 1. GET / returns HTML with the app root
    const rootRes = await fetch(`${BASE_URL}/`);
    const rootText = await rootRes.text();
    const rootOk = rootRes.status === 200 && rootText.includes('id="root"');
    record(1, 'GET / returns 200 HTML with the app root', rootOk, `status=${rootRes.status}`);

    // 2. GET /room/abc and GET /profile return the same index.html (SPA fallback)
    const roomRes = await fetch(`${BASE_URL}/room/abc`);
    const roomText = await roomRes.text();
    const profileRes = await fetch(`${BASE_URL}/profile`);
    const profileText = await profileRes.text();
    const spaOk =
      roomRes.status === 200 &&
      roomText.includes('id="root"') &&
      profileRes.status === 200 &&
      profileText.includes('id="root"');
    record(2, 'GET /room/abc and GET /profile return index.html (SPA fallback)', spaOk);

    // 3. GET /api/health is JSON
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    const healthOk = healthRes.status === 200 && healthJson.status === 'ok';
    record(3, 'GET /api/health returns 200 JSON', healthOk);

    // 4. GET /api/nope returns a JSON 404
    const nopeRes = await fetch(`${BASE_URL}/api/nope`);
    const nopeJson = await nopeRes.json().catch(() => null);
    const nopeOk = nopeRes.status === 404 && nopeJson && Boolean(nopeJson.error);
    record(4, 'GET /api/nope returns JSON 404 { error }', nopeOk, `status=${nopeRes.status}`);

    // 5. An asset URL parsed from index.html returns 200 with a JavaScript content type
    // Parse <script ... src="(/assets/...js)" from rootText
    const scriptMatch = rootText.match(/src="(\/assets\/[^"]+\.js)"/);
    if (!scriptMatch) {
      record(5, 'Asset URL parsed from index.html returns 200 with JavaScript content type', false, 'No script src found');
    } else {
      const assetUrl = `${BASE_URL}${scriptMatch[1]}`;
      const assetRes = await fetch(assetUrl);
      const ct = assetRes.headers.get('content-type') || '';
      const assetOk = assetRes.status === 200 && (ct.includes('javascript') || ct.includes('text/javascript'));
      record(5, `Asset URL (${scriptMatch[1]}) returns 200 with JavaScript content-type`, assetOk, `status=${assetRes.status}, ct=${ct}`);
    }

    // 6. Socket.io client connects with auth
    const socket = ClientIO(BASE_URL, {
      auth: { userId: 'usr_terminaltinkerer' },
      transports: ['websocket', 'polling'],
      reconnection: false,
    });

    const socketConnected = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.on('connect_error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    record(6, 'Socket.io client connects successfully with auth', socketConnected);
    socket.disconnect();

    // 7. Yjs WebSocket upgrade to /yjs/{roomId} for real accepted booking succeeds
    const realWsUrl = `ws://localhost:${PORT}/yjs/${testRoomId}?userId=usr_terminaltinkerer`;
    const realWs = new WebSocket(realWsUrl);
    const realWsOk = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        realWs.close();
        resolve(false);
      }, 5000);
      realWs.on('open', () => {
        clearTimeout(timer);
        realWs.close();
        resolve(true);
      });
      realWs.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    record(7, `Yjs WebSocket upgrade to /yjs/${testRoomId} succeeds for accepted booking`, realWsOk);

    // 8. Bogus room rejected on WebSocket upgrade
    const bogusWsUrl = `ws://localhost:${PORT}/yjs/bogus_room_9999?userId=usr_terminaltinkerer`;
    const bogusWs = new WebSocket(bogusWsUrl);
    const bogusWsRejected = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        bogusWs.close();
        resolve(false); // If it stays open for 3 seconds, that's a failure
      }, 3000);
      bogusWs.on('close', () => {
        clearTimeout(timer);
        resolve(true);
      });
      bogusWs.on('error', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    record(8, 'Yjs WebSocket upgrade to bogus room is rejected', bogusWsRejected);

  } catch (err) {
    console.error('💥 Test execution error:', err);
    failed++;
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
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
