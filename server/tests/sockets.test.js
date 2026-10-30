// Real-time Socket.io Integration Test Suite
// Verifies multi-user socket routing, auth rejection, and event propagation

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { io as ClientIO } from 'socket.io-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;
const tempDbFile = path.resolve(__dirname, `temp_sockets_test_${Date.now()}.db`);

let serverProcess = null;
const socketsToClose = [];

// Helper to wait
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for HTTP requests
async function api(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Helper to wait for a socket event with timeout
function waitForEvent(socket, eventName, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(data) {
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve(data);
    }

    socket.on(eventName, listener);
  });
}

async function run() {
  console.log('====================================================');
  console.log('🧪 Starting Real-Time Socket.io Integration Test');
  console.log(`📁 Test Database: ${tempDbFile}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  // 1. Seed temp DB
  const { createDatabase } = await import('../src/db.js');
  const { runSeed } = await import('../src/seed.js');
  const initDb = await createDatabase(tempDbFile);
  runSeed(initDb);

  // 2. Start server child process
  console.log('🚀 Spawning server child process on port', PORT);
  const serverScript = path.resolve(__dirname, '../src/index.js');
  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: tempDbFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stderr.on('data', (d) => {
    // console.error('[Server Err]:', d.toString());
  });

  // 3. Wait for /api/health
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const h = await fetch(`${BASE_URL}/api/health`);
      if (h.ok) {
        serverReady = true;
        break;
      }
    } catch {
      await wait(200);
    }
  }

  if (!serverReady) {
    throw new Error('Server child process failed to start and respond to /api/health');
  }
  console.log('✓ Server responded to /api/health\n');

  // 4. Connect real Socket.io clients
  console.log('🔌 Connecting Socket.io clients:');
  const tanviSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_terminaltinkerer' } });
  const priyaSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_pixelpriya' } });
  const arjunSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_bytebender' } }); // Bystander

  socketsToClose.push(tanviSocket, priyaSocket, arjunSocket);

  await Promise.all([
    new Promise((resolve) => tanviSocket.on('connect', resolve)),
    new Promise((resolve) => priyaSocket.on('connect', resolve)),
    new Promise((resolve) => arjunSocket.on('connect', resolve)),
  ]);
  console.log('  ✓ Connected: Tanvi (usr_terminaltinkerer)');
  console.log('  ✓ Connected: Priya (usr_pixelpriya)');
  console.log('  ✓ Connected: Arjun (usr_bytebender) [Bystander]\n');

  // Track bystander events (should receive none)
  const bystanderEvents = [];
  ['booking:requested', 'booking:accepted', 'booking:declined', 'booking:cancelled', 'ledger:updated'].forEach((ev) => {
    arjunSocket.on(ev, (data) => {
      bystanderEvents.push({ event: ev, data });
    });
  });

  // Get real slot id for Priya from GET /api/peers
  const peersRes = await api('/api/peers', { headers: { 'X-User-Id': 'usr_terminaltinkerer' } });
  const priyaPeer = peersRes.data.find((p) => p.id === 'usr_pixelpriya');
  assert.ok(priyaPeer && priyaPeer.slots && priyaPeer.slots.length > 0, 'Priya must have availability slots in /api/peers');
  const realSlotId = priyaPeer.slots[0].id;
  console.log(`✓ Retrieved real slot ID from GET /api/peers: ${realSlotId}\n`);

  console.log('Running Real-Time Assertions:');
  if (process.env.FORCE_FAIL === '1') {
    throw new Error('Forced failure triggered via FORCE_FAIL=1');
  }

  // 1. Tanvi books Priya -> Priya receives booking:requested within 2s
  let bookingId = null;
  try {
    const requestedPromise = waitForEvent(priyaSocket, 'booking:requested', 2000);

    const postRes = await api('/api/bookings', {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
      body: JSON.stringify({
        mentorId: 'usr_pixelpriya',
        topic: 'React',
        problemNote: 'Debugging component re-render loops with profiler hooks',
        slotId: realSlotId,
      }),
    });

    assert.strictEqual(postRes.status, 201, 'POST /api/bookings should return 201');
    bookingId = postRes.data.id;

    const eventData = await requestedPromise;
    assert.strictEqual(eventData.booking.id, bookingId);
    assert.strictEqual(eventData.booking.learner.id, 'usr_terminaltinkerer');
    console.log('  PASS (1): Tanvi books Priya -> Priya received booking:requested within 2s');
  } catch (err) {
    console.error('  FAIL (1): Tanvi books Priya -> booking:requested failed:', err.message);
    throw err;
  }

  // 2. Priya accepts -> Tanvi receives booking:accepted AND ledger:updated
  try {
    const acceptedPromise = waitForEvent(tanviSocket, 'booking:accepted', 2000);
    const ledgerPromise = waitForEvent(tanviSocket, 'ledger:updated', 2000);

    const acceptRes = await api(`/api/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(acceptRes.status, 200, 'Accept should return 200');

    const acceptedData = await acceptedPromise;
    const ledgerData = await ledgerPromise;

    assert.strictEqual(acceptedData.booking.id, bookingId);
    assert.strictEqual(acceptedData.booking.status, 'accepted');
    assert.strictEqual(ledgerData.userId, 'usr_terminaltinkerer');
    console.log('  PASS (2): Priya accepts -> Tanvi received booking:accepted AND ledger:updated');
  } catch (err) {
    console.error('  FAIL (2): Priya accepts failed:', err.message);
    throw err;
  }

  // 3. Tanvi cancels -> Priya receives booking:cancelled and Tanvi receives ledger:updated
  try {
    const cancelledPromise = waitForEvent(priyaSocket, 'booking:cancelled', 2000);
    const ledgerFreedPromise = waitForEvent(tanviSocket, 'ledger:updated', 2000);

    const cancelRes = await api(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    assert.strictEqual(cancelRes.status, 200, 'Cancel should return 200');

    const cancelledData = await cancelledPromise;
    const ledgerFreedData = await ledgerFreedPromise;

    assert.strictEqual(cancelledData.booking.id, bookingId);
    assert.strictEqual(cancelledData.booking.status, 'cancelled');
    assert.strictEqual(ledgerFreedData.userId, 'usr_terminaltinkerer');
    console.log('  PASS (3): Tanvi cancels -> Priya received booking:cancelled AND Tanvi received ledger:updated');
  } catch (err) {
    console.error('  FAIL (3): Tanvi cancels failed:', err.message);
    throw err;
  }

  // 4. Tanvi books Priya again, Priya declines -> Tanvi receives booking:declined
  try {
    const postRes2 = await api('/api/bookings', {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
      body: JSON.stringify({
        mentorId: 'usr_pixelpriya',
        topic: 'React',
        problemNote: 'Second session request to test decline event delivery',
        slotId: realSlotId,
      }),
    });
    assert.strictEqual(postRes2.status, 201);
    const secondBookingId = postRes2.data.id;

    const declinedPromise = waitForEvent(tanviSocket, 'booking:declined', 2000);

    const declineRes = await api(`/api/bookings/${secondBookingId}/decline`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(declineRes.status, 200);

    const declinedData = await declinedPromise;
    assert.strictEqual(declinedData.booking.id, secondBookingId);
    assert.strictEqual(declinedData.booking.status, 'declined');
    console.log('  PASS (4): Tanvi books Priya again, Priya declines -> Tanvi received booking:declined');
  } catch (err) {
    console.error('  FAIL (4): Priya declines failed:', err.message);
    throw err;
  }

  // 5. Bystander received NO booking events at all
  try {
    await wait(300);
    assert.strictEqual(bystanderEvents.length, 0, `Bystander received ${bystanderEvents.length} unexpected events`);
    console.log('  PASS (5): Bystander Arjun received NO booking events at all');
  } catch (err) {
    console.error('  FAIL (5): Bystander isolation failed:', err.message);
    throw err;
  }

  // 6. Socket connecting with a non-existent userId is rejected
  try {
    const invalidSocket = ClientIO(BASE_URL, {
      auth: { userId: 'usr_non_existent_fake_id' },
      reconnection: false,
      timeout: 2000,
    });
    socketsToClose.push(invalidSocket);

    const rejectionPromise = new Promise((resolve, reject) => {
      invalidSocket.on('connect_error', (err) => resolve(err));
      invalidSocket.on('connect', () => reject(new Error('Invalid socket should NOT have connected')));
    });

    const error = await rejectionPromise;
    assert.match(error.message, /authentication failed/i);
    console.log('  PASS (6): Socket connecting with non-existent userId was properly rejected');
  } catch (err) {
    console.error('  FAIL (6): Socket rejection check failed:', err.message);
    throw err;
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 6 REAL-TIME SOCKET ASSERTIONS PASSED!');
  console.log('====================================================\n');
}

async function cleanup() {
  // Disconnect sockets
  for (const s of socketsToClose) {
    try {
      s.disconnect();
    } catch {}
  }

  // Kill child server
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      serverProcess.kill('SIGKILL');
    } catch {}
  }

  await wait(500);

  // Delete temp DB
  try {
    if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
    if (fs.existsSync(`${tempDbFile}-wal`)) fs.unlinkSync(`${tempDbFile}-wal`);
    if (fs.existsSync(`${tempDbFile}-shm`)) fs.unlinkSync(`${tempDbFile}-shm`);
  } catch {}
}

run()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Test Suite Failed:', err);
    await cleanup();
    process.exit(1);
  });
