import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import assert from 'assert';
import { io as ClientIO } from 'socket.io-client';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

// Setup temp DB
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-room-test-'));
const tempDbPath = path.join(tempDir, 'room.db');
process.env.DB_PATH = tempDbPath;

// Dynamic import for seed
const { db, closeDb } = await import('../src/db.js');
const { runSeed } = await import('../src/seed.js');

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

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
  console.log('🧪 Starting Slice 5 Room, Socket & Yjs Integration Test');
  console.log(`📁 Test Database: ${tempDbPath}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  let socketTanvi, socketPriya, socketArjun, socketTanvi2;
  let providerTanvi, providerPriya, providerArjun;

  try {
    // 1. Seed temp DB
    runSeed(db);

    // 2. Spawn real server child process on port 4100
    console.log(`🚀 Spawning server child process on port ${PORT}...`);
    serverProcess = spawn('node', ['server/src/index.js'], {
      env: { ...process.env, PORT: String(PORT), DB_PATH: tempDbPath },
      stdio: 'pipe',
    });

    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (!msg.includes('ExperimentalWarning')) {
        console.error(`[Server stderr] ${msg}`);
      }
    });

    await waitForServer(BASE_URL);
    console.log('✓ Server responded to /api/health\n');

    // Fetch peers as Tanvi to get real slotId
    const peersRes = await fetch(`${BASE_URL}/api/peers`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const peers = await peersRes.json();
    const priyaPeer = peers.find((p) => p.id === 'usr_pixelpriya');
    const realSlotId = priyaPeer.slots[0].id;

    // Connect real Socket.io clients
    socketTanvi = ClientIO(BASE_URL, {
      path: '/socket.io',
      auth: { userId: 'usr_terminaltinkerer' },
      transports: ['websocket'],
    });
    socketPriya = ClientIO(BASE_URL, {
      path: '/socket.io',
      auth: { userId: 'usr_pixelpriya' },
      transports: ['websocket'],
    });
    socketArjun = ClientIO(BASE_URL, {
      path: '/socket.io',
      auth: { userId: 'usr_bytebender' },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((res) => socketTanvi.on('connect', res)),
      new Promise((res) => socketPriya.on('connect', res)),
      new Promise((res) => socketArjun.on('connect', res)),
    ]);
    console.log('🔌 Connected Socket.io clients for Tanvi, Priya, and Arjun\n');

    // Create a fresh booking: Tanvi books Priya on React
    const createRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr_terminaltinkerer',
      },
      body: JSON.stringify({
        mentorId: 'usr_pixelpriya',
        topic: 'React',
        problemNote: 'Debugging custom hook re-renders and memoization',
        slotId: realSlotId,
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const booking = await createRes.json();
    const bookingId = booking.id;

    // --- ASSERTION 1: start is idempotent and wrong user gets 403; start on requested gets 409 ---
    // Start on requested booking -> 409
    const startReqRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const startReqOk = startReqRes.status === 409;

    // Priya accepts booking -> accepted
    const acceptRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(acceptRes.status, 200);
    const acceptData = await acceptRes.json();
    const roomId = acceptData.room_id;

    // Non-participant (Arjun) tries to start -> 403
    const startWrongRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_bytebender' },
    });
    const wrongUserOk = startWrongRes.status === 403;

    // Setup listener on Priya's socket for Assertion 2
    let startedEventsPriya = [];
    socketPriya.on('booking:started', (evt) => {
      startedEventsPriya.push(evt);
    });

    // Tanvi calls start (first participant) -> transitions to in_progress
    const start1Res = await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const start1Data = await start1Res.json();
    const start1Ok = start1Res.status === 200 && start1Data.status === 'in_progress' && Boolean(start1Data.started_at);

    // Tanvi calls start again (idempotent)
    const start2Res = await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    const start2Data = await start2Res.json();
    const start2Ok = start2Res.status === 200 &&
      start2Data.status === 'in_progress' &&
      start2Data.started_at === start1Data.started_at;

    record(1, 'start is idempotent and participant-only (wrong user 403, requested 409)', startReqOk && wrongUserOk && start1Ok && start2Ok);

    // --- ASSERTION 2: other participant receives booking:started only on first transition ---
    await new Promise((r) => setTimeout(r, 600));
    const evtCountOk = startedEventsPriya.length === 1;
    const evtDataOk = startedEventsPriya[0]?.bookingId === bookingId &&
      typeof startedEventsPriya[0]?.message === 'string';
    record(2, 'other participant receives booking:started only on the first transition', evtCountOk && evtDataOk, `count=${startedEventsPriya.length}`);

    // --- ASSERTION 3: two Yjs clients connected to same room, concurrent edits converge ---
    const docTanvi = new Y.Doc();
    const docPriya = new Y.Doc();

    providerTanvi = new WebsocketProvider(`ws://localhost:${PORT}/yjs`, roomId, docTanvi, {
      WebSocketPolyfill: WebSocket,
      params: { userId: 'usr_terminaltinkerer' },
    });
    providerPriya = new WebsocketProvider(`ws://localhost:${PORT}/yjs`, roomId, docPriya, {
      WebSocketPolyfill: WebSocket,
      params: { userId: 'usr_pixelpriya' },
    });

    // Wait for sync
    const waitSync = (p) =>
      new Promise((res) => {
        if (p.synced) return res();
        const handler = (state) => {
          if (state) {
            p.off('synced', handler);
            res();
          }
        };
        p.on('synced', handler);
      });

    await Promise.all([waitSync(providerTanvi), waitSync(providerPriya)]);

    const ytextTanvi = docTanvi.getText('code');
    const ytextPriya = docPriya.getText('code');

    // Tanvi types code
    ytextTanvi.insert(0, "function calculateTotal() { return 42; }");

    // Wait for sync to Priya (within 2s)
    let sync1Ok = false;
    for (let i = 0; i < 20; i++) {
      if (ytextPriya.toString() === "function calculateTotal() { return 42; }") {
        sync1Ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Concurrent edits at different positions
    docTanvi.transact(() => {
      ytextTanvi.insert(0, "// Tanvi Header\n");
    });
    docPriya.transact(() => {
      ytextPriya.insert(ytextPriya.length, "\n// Priya Footer");
    });

    let convergeOk = false;
    for (let i = 0; i < 20; i++) {
      if (ytextTanvi.toString() === ytextPriya.toString() &&
          ytextTanvi.toString().includes('Tanvi Header') &&
          ytextTanvi.toString().includes('Priya Footer')) {
        convergeOk = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    record(3, 'two Yjs clients sync typed text within 2s and concurrent edits converge', sync1Ok && convergeOk);

    // --- ASSERTION 4: non-participant rejected, cancelled/completed room rejected ---
    let nonParticipantRejected = false;
    const docArjun = new Y.Doc();
    providerArjun = new WebsocketProvider(`ws://localhost:${PORT}/yjs`, roomId, docArjun, {
      WebSocketPolyfill: WebSocket,
      params: { userId: 'usr_bytebender' },
    });

    await new Promise((resolve) => {
      providerArjun.on('connection-error', () => {
        nonParticipantRejected = true;
        resolve();
      });
      providerArjun.on('status', ({ status }) => {
        if (status === 'disconnected') {
          nonParticipantRejected = true;
          resolve();
        }
      });
      setTimeout(() => {
        if (!providerArjun.wsconnected) nonParticipantRejected = true;
        resolve();
      }, 1000);
    });

    // Try connecting to completed booking room_bok_01 (seeded completed booking)
    let completedRoomRejected = false;
    const docCompleted = new Y.Doc();
    const providerCompleted = new WebsocketProvider(`ws://localhost:${PORT}/yjs`, 'room_bok_01', docCompleted, {
      WebSocketPolyfill: WebSocket,
      params: { userId: 'usr_pixelpriya' },
    });

    await new Promise((resolve) => {
      providerCompleted.on('connection-error', () => {
        completedRoomRejected = true;
        resolve();
      });
      providerCompleted.on('status', ({ status }) => {
        if (status === 'disconnected') {
          completedRoomRejected = true;
          resolve();
        }
      });
      setTimeout(() => {
        if (!providerCompleted.wsconnected) completedRoomRejected = true;
        resolve();
      }, 1000);
    });

    record(4, 'non-participant and completed/cancelled booking Yjs connections are rejected', nonParticipantRejected && completedRoomRejected);

    // --- ASSERTION 5: socket presence, deduplication, and departure ---
    let presenceEvents = [];
    socketTanvi.on('room:presence', (data) => {
      if (data.roomId === roomId) {
        presenceEvents.push(data);
      }
    });

    // Both join
    const join1 = await new Promise((r) => socketTanvi.emit('room:join', { roomId }, r));
    assert.strictEqual(join1.ok, true);

    const join2 = await new Promise((r) => socketPriya.emit('room:join', { roomId }, r));
    assert.strictEqual(join2.ok, true);

    await new Promise((r) => setTimeout(r, 400));
    const latestPres1 = presenceEvents[presenceEvents.length - 1];
    const twoUsersOk = latestPres1 && latestPres1.users.length === 2;

    // Second socket of same user (Tanvi tab 2)
    socketTanvi2 = ClientIO(BASE_URL, {
      path: '/socket.io',
      auth: { userId: 'usr_terminaltinkerer' },
      transports: ['websocket'],
    });
    await new Promise((res) => socketTanvi2.on('connect', res));
    await new Promise((r) => socketTanvi2.emit('room:join', { roomId }, r));

    await new Promise((r) => setTimeout(r, 400));
    const latestPres2 = presenceEvents[presenceEvents.length - 1];
    const dedupOk = latestPres2 && latestPres2.users.length === 2;

    // Disconnect Tanvi's second socket -> still 2 users
    socketTanvi2.disconnect();
    await new Promise((r) => setTimeout(r, 400));
    const latestPres3 = presenceEvents[presenceEvents.length - 1];
    const stillTwoOk = latestPres3 && latestPres3.users.length === 2;

    // Priya leaves room -> presence becomes 1 user
    socketPriya.emit('room:leave', { roomId });
    await new Promise((r) => setTimeout(r, 400));
    const latestPres4 = presenceEvents[presenceEvents.length - 1];
    const oneUserOk = latestPres4 && latestPres4.users.length === 1 && latestPres4.users[0].id === 'usr_terminaltinkerer';

    record(5, 'socket presence is accurate, deduped by user ID, and updates on departure', twoUsersOk && dedupOk && stillTwoOk && oneUserOk);

    // --- ASSERTION 6: chat message delivery, length validation, non-participant rejection, history ---
    let priyaMessages = [];
    socketPriya.on('room:message', (msg) => priyaMessages.push(msg));
    // Priya re-joins room
    await new Promise((r) => socketPriya.emit('room:join', { roomId }, r));
    await new Promise((r) => setTimeout(r, 200));

    // Tanvi sends message
    socketTanvi.emit('room:message', { roomId, text: 'Hello Priya, ready for React debugging!' });
    await new Promise((r) => setTimeout(r, 400));

    const msgReceivedOk = priyaMessages.length === 1 &&
      priyaMessages[0].userId === 'usr_terminaltinkerer' &&
      priyaMessages[0].name === 'Tanvi Deshmukh' &&
      priyaMessages[0].text === 'Hello Priya, ready for React debugging!';

    // Validate rejected messages: empty string and 501 chars
    const msgCountBefore = priyaMessages.length;
    socketTanvi.emit('room:message', { roomId, text: '    ' });
    socketTanvi.emit('room:message', { roomId, text: 'a'.repeat(501) });
    await new Promise((r) => setTimeout(r, 300));
    const invalidRejectedOk = priyaMessages.length === msgCountBefore;

    // Non-participant (Arjun) room:join fails
    const nonPartJoin = await new Promise((r) => socketArjun.emit('room:join', { roomId }, r));
    const nonPartOk = nonPartJoin.ok === false;

    // History delivered to late joiner: socket connects and receives history
    socketPriya.emit('room:leave', { roomId });
    await new Promise((r) => setTimeout(r, 200));
    const lateJoinAck = await new Promise((r) => socketPriya.emit('room:join', { roomId }, r));
    const historyOk = lateJoinAck.ok === true &&
      Array.isArray(lateJoinAck.history) &&
      lateJoinAck.history.some((m) => m.text === 'Hello Priya, ready for React debugging!');

    record(6, 'chat delivers authenticated messages, validates length, rejects non-participants, delivers history', msgReceivedOk && invalidRejectedOk && nonPartOk && historyOk);

    // --- ASSERTION 7: language change in Y.Map meta syncs to other client ---
    const metaTanvi = docTanvi.getMap('meta');
    const metaPriya = docPriya.getMap('meta');

    metaTanvi.set('language', 'python');

    let metaSynced = false;
    for (let i = 0; i < 20; i++) {
      if (metaPriya.get('language') === 'python') {
        metaSynced = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    record(7, 'language change in Y.Map meta syncs across peers', metaSynced);

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    // Teardown
    if (providerTanvi) providerTanvi.destroy();
    if (providerPriya) providerPriya.destroy();
    if (providerArjun) providerArjun.destroy();

    if (socketTanvi) socketTanvi.disconnect();
    if (socketPriya) socketPriya.disconnect();
    if (socketArjun) socketArjun.disconnect();
    if (socketTanvi2) socketTanvi2.disconnect();

    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    if (db && typeof db.close === 'function') {
      try { db.close(); } catch (_) {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\n========================================`);
  console.log(`Room Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
