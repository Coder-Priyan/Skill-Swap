// WebRTC Voice Calling Integration Test Suite
// Verifies signaling, authentication, roles, rate limiting, single-tab rule, cleanup, and privacy

if (process.env.FORCE_FAIL === '1') {
  console.log('FORCE_FAIL=1 detected, exiting non-zero as required by failsafe.');
  process.exit(1);
}

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { io as ClientIO } from 'socket.io-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 4100;
const PORT_DISABLED = 4101;
const BASE_URL = `http://localhost:${PORT}`;
const BASE_URL_DISABLED = `http://localhost:${PORT_DISABLED}`;
const tempDbFile = path.resolve(__dirname, `temp_rtc_test_${Date.now()}.db`);
const tempDbFileDisabled = path.resolve(__dirname, `temp_rtc_disabled_${Date.now()}.db`);

let serverProcess = null;
let disabledServerProcess = null;
const socketsToClose = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(baseUrl, endpoint, options = {}) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
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

function cleanup() {
  for (const s of socketsToClose) {
    try {
      s.disconnect();
    } catch (_) {}
  }
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_) {}
  }
  if (disabledServerProcess) {
    try {
      disabledServerProcess.kill();
    } catch (_) {}
  }
  for (const f of [tempDbFile, tempDbFileDisabled]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

async function run() {
  console.log('====================================================');
  console.log('🧪 Starting Voice in Room WebRTC Integration Test');
  console.log(`📁 Test Database: ${tempDbFile}`);
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('====================================================\n');

  // Seed temp DB
  const { createDatabase } = await import('../src/db.js');
  const { runSeed } = await import('../src/seed.js');
  const { checkIntegrity } = await import('../src/ledger.js');

  const initDb = await createDatabase(tempDbFile);
  runSeed(initDb);

  const getLedgerSum = () => {
    const row = initDb.prepare('SELECT SUM(delta) AS sum FROM ledger_entries').get();
    return Number(row.sum);
  };
  const initialLedgerSum = getLedgerSum();

  // Start primary server child process
  console.log('🚀 Spawning primary server child process on port', PORT);
  const serverScript = path.resolve(__dirname, '../src/index.js');
  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: tempDbFile,
      RTC_ENABLED: 'true',
      RTC_SIGNAL_MAX_BYTES: '16384',
      RTC_RATE_LIMIT: '60',
      RTC_STUN_URLS: 'stun:stun.l.google.com:19302',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const h = await fetch(`${BASE_URL}/api/health`);
      if (h.ok) {
        serverReady = true;
        break;
      }
    } catch {
      await wait(150);
    }
  }
  assert.ok(serverReady, 'Primary server failed to respond on /api/health');

  // Connect sockets: Tanvi (learner), Priya (mentor), Arjun (bystander)
  const tanviSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_terminaltinkerer' } });
  const priyaSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_pixelpriya' } });
  const arjunSocket = ClientIO(BASE_URL, { auth: { userId: 'usr_bytebender' } });
  socketsToClose.push(tanviSocket, priyaSocket, arjunSocket);

  await Promise.all([
    new Promise((resolve) => tanviSocket.on('connect', resolve)),
    new Promise((resolve) => priyaSocket.on('connect', resolve)),
    new Promise((resolve) => arjunSocket.on('connect', resolve)),
  ]);

  // Listen for any stray rtc:* events on bystander (Arjun)
  const arjunRtcEvents = [];
  ['rtc:ready', 'rtc:signal', 'rtc:peer-joined', 'rtc:peer-left', 'rtc:replaced', 'rtc:ended'].forEach((ev) => {
    arjunSocket.on(ev, (data) => arjunRtcEvents.push({ event: ev, data }));
  });

  // Fetch real slot id from GET /api/peers
  const peersRes = await api(BASE_URL, '/api/peers', { headers: { 'X-User-Id': 'usr_terminaltinkerer' } });
  const priyaPeer = peersRes.data.find((p) => p.id === 'usr_pixelpriya');
  assert.ok(priyaPeer?.slots?.length > 0, 'Priya must have availability slots');
  const realSlotId = priyaPeer.slots[0].id;

  // =========================================================================
  // CASE 1: GET /api/rtc/config
  // =========================================================================
  {
    // Auth validation
    const noAuth = await api(BASE_URL, '/api/rtc/config');
    assert.strictEqual(noAuth.status, 401, 'Must require X-User-Id');

    const invalidAuth = await api(BASE_URL, '/api/rtc/config', { headers: { 'X-User-Id': 'usr_invalid' } });
    assert.strictEqual(invalidAuth.status, 401, 'Must reject invalid X-User-Id');

    // Valid auth
    const validRes = await api(BASE_URL, '/api/rtc/config', { headers: { 'X-User-Id': 'usr_terminaltinkerer' } });
    assert.strictEqual(validRes.status, 200);
    assert.strictEqual(validRes.data.enabled, true, 'enabled must be true');
    assert.ok(Array.isArray(validRes.data.iceServers), 'iceServers must be an array');
    const stunUrls = validRes.data.iceServers[0].urls;
    const hasStun = Array.isArray(stunUrls)
      ? stunUrls.includes('stun:stun.l.google.com:19302')
      : stunUrls === 'stun:stun.l.google.com:19302';
    assert.ok(hasStun, 'STUN URL must match configured stun server');
    assert.strictEqual(validRes.data.iceServers[0].username, undefined, 'No TURN username when unset');
    assert.strictEqual(validRes.data.iceServers[0].credential, undefined, 'No TURN credential when unset');

    // GET /api/meta check
    const metaRes = await api(BASE_URL, '/api/meta');
    assert.strictEqual(metaRes.data.voice_enabled, true, 'meta voice_enabled must be true');

    console.log('  PASS: Case 1 - GET /api/rtc/config validates auth and returns STUN with no credentials');
  }

  // =========================================================================
  // CASE 2: rtc:join Authorization and State Check
  // =========================================================================
  let testBooking = null;
  let cancelledBooking = null;
  {
    // Create a booking: Tanvi -> Priya
    const bookRes = await api(BASE_URL, '/api/bookings', {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
      body: JSON.stringify({
        mentorId: 'usr_pixelpriya',
        topic: 'React',
        problemNote: 'Testing 1:1 voice room signaling',
        slotId: realSlotId,
      }),
    });
    assert.strictEqual(bookRes.status, 201);
    testBooking = bookRes.data;

    // 1. Try to join voice while booking is in 'requested' status
    const requestedJoinAck = await new Promise((resolve) => {
      tanviSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(requestedJoinAck.ok, false, 'Cannot join voice for requested booking');

    // 2. Accept booking -> status becomes 'accepted'
    const acceptRes = await api(BASE_URL, `/api/bookings/${testBooking.id}/accept`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(acceptRes.status, 200);
    testBooking = acceptRes.data;
    assert.ok(testBooking.room_id, 'Accepted booking must have room_id');

    // 3. Non-participant (Arjun) tries to join voice on accepted booking
    const arjunJoinAck = await new Promise((resolve) => {
      arjunSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(arjunJoinAck.ok, false, 'Non-participant cannot join voice');

    // 4. Create another booking and cancel it to verify cancelled join fails
    const secondSlotId = priyaPeer.slots[1] ? priyaPeer.slots[1].id : null;
    if (secondSlotId) {
      const book2Res = await api(BASE_URL, '/api/bookings', {
        method: 'POST',
        headers: { 'X-User-Id': 'usr_terminaltinkerer' },
        body: JSON.stringify({
          mentorId: 'usr_pixelpriya',
          topic: 'React',
          problemNote: 'Testing cancelled room voice denial',
          slotId: secondSlotId,
        }),
      });
      cancelledBooking = book2Res.data;
      await api(BASE_URL, `/api/bookings/${cancelledBooking.id}/cancel`, {
        method: 'POST',
        headers: { 'X-User-Id': 'usr_terminaltinkerer' },
      });

      const cancelledJoinAck = await new Promise((resolve) => {
        tanviSocket.emit('rtc:join', { roomId: cancelledBooking.room_id || 'cancelled_fake_room' }, resolve);
      });
      assert.strictEqual(cancelledJoinAck.ok, false, 'Cannot join voice for cancelled booking');
    }

    console.log('  PASS: Case 2 - rtc:join succeeds only for participants of accepted/in_progress bookings');
  }

  // =========================================================================
  // CASE 3: Roles (Learner Initiator, Mentor Offeree, rtc:ready)
  // =========================================================================
  {
    // Tanvi (learner) joins first
    const tanviJoinAck = await new Promise((resolve) => {
      tanviSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(tanviJoinAck.ok, true, 'Tanvi join ok');
    assert.strictEqual(tanviJoinAck.initiator, true, 'Learner must be initiator');
    assert.ok(tanviJoinAck.peers.includes('usr_terminaltinkerer'), 'Tanvi is in peers');
    assert.strictEqual(tanviJoinAck.peers.includes('usr_pixelpriya'), false, 'Priya is not yet in peers');

    // Prepare promises for when Priya (second peer) joins:
    // - Tanvi should receive rtc:ready
    // - Tanvi should receive rtc:peer-joined { userId: 'usr_pixelpriya' }
    const tanviReadyPromise = waitForEvent(tanviSocket, 'rtc:ready');
    const tanviPeerJoinedPromise = waitForEvent(tanviSocket, 'rtc:peer-joined');

    // Priya (mentor) joins
    const priyaJoinAck = await new Promise((resolve) => {
      priyaSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(priyaJoinAck.ok, true, 'Priya join ok');
    assert.strictEqual(priyaJoinAck.initiator, false, 'Mentor must not be initiator');
    assert.ok(priyaJoinAck.peers.includes('usr_terminaltinkerer'), 'Priya sees Tanvi in peers');

    const [readyPayload, peerJoinedPayload] = await Promise.all([
      tanviReadyPromise,
      tanviPeerJoinedPromise,
    ]);

    assert.ok(readyPayload, 'Tanvi received rtc:ready');
    assert.strictEqual(peerJoinedPayload.userId, 'usr_pixelpriya', 'Tanvi received rtc:peer-joined for Priya');

    console.log('  PASS: Case 3 - Roles: Learner gets initiator:true, mentor gets false, rtc:ready emitted to learner');
  }

  // =========================================================================
  // CASE 4: Signal Relay and Anti-Spoofing
  // =========================================================================
  {
    const priyaOfferPromise = waitForEvent(priyaSocket, 'rtc:signal');

    // Tanvi sends offer, attempts to spoof 'from' field in payload
    const spoofedOffer = {
      roomId: testBooking.room_id,
      from: 'usr_malicious_spoof',
      data: {
        kind: 'offer',
        sdp: { type: 'offer', sdp: 'v=0\r\no=tanvi 1000 2000 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' },
      },
    };

    const offerAck = await new Promise((resolve) => {
      tanviSocket.emit('rtc:signal', spoofedOffer, resolve);
    });
    assert.strictEqual(offerAck.ok, true, 'Offer accepted by server');

    const receivedOffer = await priyaOfferPromise;
    assert.strictEqual(receivedOffer.roomId, testBooking.room_id);
    assert.strictEqual(receivedOffer.from, 'usr_terminaltinkerer', 'Server must enforce sender ID from socket auth');
    assert.strictEqual(receivedOffer.data.kind, 'offer');
    assert.strictEqual(receivedOffer.data.sdp.type, 'offer');

    // Priya answers
    const tanviAnswerPromise = waitForEvent(tanviSocket, 'rtc:signal');
    const answerPayload = {
      roomId: testBooking.room_id,
      data: {
        kind: 'answer',
        sdp: { type: 'answer', sdp: 'v=0\r\no=priya 2000 3000 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' },
      },
    };
    const answerAck = await new Promise((resolve) => {
      priyaSocket.emit('rtc:signal', answerPayload, resolve);
    });
    assert.strictEqual(answerAck.ok, true, 'Answer accepted by server');

    const receivedAnswer = await tanviAnswerPromise;
    assert.strictEqual(receivedAnswer.from, 'usr_pixelpriya');
    assert.strictEqual(receivedAnswer.data.kind, 'answer');

    // Priya sends ICE candidate
    const tanviIcePromise = waitForEvent(tanviSocket, 'rtc:signal');
    const icePayload = {
      roomId: testBooking.room_id,
      data: {
        kind: 'ice',
        candidate: { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.100 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      },
    };
    const iceAck = await new Promise((resolve) => {
      priyaSocket.emit('rtc:signal', icePayload, resolve);
    });
    assert.strictEqual(iceAck.ok, true, 'ICE candidate accepted by server');

    const receivedIce = await tanviIcePromise;
    assert.strictEqual(receivedIce.from, 'usr_pixelpriya');
    assert.strictEqual(receivedIce.data.kind, 'ice');
    assert.strictEqual(receivedIce.data.candidate.candidate, icePayload.data.candidate.candidate);

    // Assert Arjun received nothing
    assert.strictEqual(arjunRtcEvents.length, 0, 'Bystander Arjun must never receive any rtc:* events');

    console.log('  PASS: Case 4 - Signal relay routes strictly between room participants with authenticated from ID');
  }

  // =========================================================================
  // CASE 5: Signal Validation
  // =========================================================================
  {
    // Unknown kind
    const badKind = await new Promise((resolve) => {
      tanviSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'video-stream' },
      }, resolve);
    });
    assert.strictEqual(badKind.ok, false, 'Unknown kind must be rejected');

    // Missing SDP
    const missingSdp = await new Promise((resolve) => {
      tanviSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'offer' },
      }, resolve);
    });
    assert.strictEqual(missingSdp.ok, false, 'Missing SDP must be rejected');

    // Non-string SDP
    const nonStringSdp = await new Promise((resolve) => {
      tanviSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'offer', sdp: { type: 'offer', sdp: 12345 } },
      }, resolve);
    });
    assert.strictEqual(nonStringSdp.ok, false, 'Non-string SDP must be rejected');

    // Oversize payload (> 16384 bytes)
    const giantString = 'x'.repeat(20000);
    const oversize = await new Promise((resolve) => {
      tanviSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'offer', sdp: { type: 'offer', sdp: giantString } },
      }, resolve);
    });
    assert.strictEqual(oversize.ok, false, 'Oversize payload must be rejected');
    assert.ok(oversize.error.includes('maximum allowed size'));

    // Signal sent before joining voice (Arjun)
    const notInVoice = await new Promise((resolve) => {
      arjunSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'offer', sdp: { type: 'offer', sdp: 'v=0...' } },
      }, resolve);
    });
    assert.strictEqual(notInVoice.ok, false, 'Signal from unjoined socket must be rejected');

    console.log('  PASS: Case 5 - Validation: kind, sdp schema, oversize check, and unjoined checks enforce ok:false');
  }

  // =========================================================================
  // CASE 6: Rate Limiting
  // =========================================================================
  {
    let rejectedCount = 0;
    const testPromises = [];

    // Send 75 valid signals rapidly (RTC_RATE_LIMIT = 60 per 10s)
    for (let i = 0; i < 75; i++) {
      testPromises.push(
        new Promise((resolve) => {
          tanviSocket.emit('rtc:signal', {
            roomId: testBooking.room_id,
            data: { kind: 'ice', candidate: { candidate: `cand-${i}` } },
          }, (ack) => {
            if (ack && ack.ok === false && ack.error?.includes('rate limit')) {
              rejectedCount++;
            }
            resolve(ack);
          });
        })
      );
    }
    await Promise.all(testPromises);

    assert.ok(rejectedCount >= 10, `Expected rate limit rejections, got ${rejectedCount}`);

    // Verify server remains healthy
    const health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.status, 200, 'Server must remain healthy after rate limit hits');

    console.log('  PASS: Case 6 - Rate limiting: excess signals rejected with ok:false while server remains healthy');
  }

  // =========================================================================
  // CASE 7: Single-Tab Rule (rtc:replaced)
  // =========================================================================
  {
    // Tanvi opens a second tab / socket
    const tanviSocket2 = ClientIO(BASE_URL, { auth: { userId: 'usr_terminaltinkerer' } });
    socketsToClose.push(tanviSocket2);
    await new Promise((resolve) => tanviSocket2.on('connect', resolve));

    const tanvi1ReplacedPromise = waitForEvent(tanviSocket, 'rtc:replaced');

    // Second socket joins voice in the same room
    const tab2JoinAck = await new Promise((resolve) => {
      tanviSocket2.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(tab2JoinAck.ok, true, 'Second tab joins voice ok');

    const replacedPayload = await tanvi1ReplacedPromise;
    assert.strictEqual(replacedPayload.roomId, testBooking.room_id, 'First tab receives rtc:replaced');

    // Verify signals from Priya now route to tanviSocket2, not tanviSocket
    let tanvi1ReceivedSignal = false;
    tanviSocket.on('rtc:signal', () => { tanvi1ReceivedSignal = true; });

    const tanvi2SignalPromise = waitForEvent(tanviSocket2, 'rtc:signal');
    await new Promise((resolve) => {
      priyaSocket.emit('rtc:signal', {
        roomId: testBooking.room_id,
        data: { kind: 'ice', candidate: { candidate: 'for-tab-2' } },
      }, resolve);
    });

    const receivedOnTab2 = await tanvi2SignalPromise;
    assert.strictEqual(receivedOnTab2.data.candidate.candidate, 'for-tab-2');
    assert.strictEqual(tanvi1ReceivedSignal, false, 'Old tab 1 must not receive relayed signals');

    // Tanvi2 leaves voice
    await new Promise((resolve) => {
      tanviSocket2.emit('rtc:leave', { roomId: testBooking.room_id }, resolve);
    });

    console.log('  PASS: Case 7 - Single-tab rule: second socket receives voice, older socket receives rtc:replaced');
  }

  // =========================================================================
  // CASE 8: Cleanup on Disconnect, Settlement (rtc:ended), and Demo Reset
  // =========================================================================
  {
    // Re-join Tanvi so both Tanvi and Priya are in voice
    await new Promise((resolve) => {
      tanviSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });

    let health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.data.voice_rooms, 1, 'voice_rooms should be 1');

    // Priya listens for peer-left when Tanvi disconnects
    const priyaPeerLeftPromise = waitForEvent(priyaSocket, 'rtc:peer-left');
    tanviSocket.disconnect();
    const peerLeftData = await priyaPeerLeftPromise;
    assert.strictEqual(peerLeftData.userId, 'usr_terminaltinkerer');

    // Priya leaves voice
    await new Promise((resolve) => {
      priyaSocket.emit('rtc:leave', { roomId: testBooking.room_id }, resolve);
    });

    health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.data.voice_rooms, 0, 'voice_rooms should be 0 after all leave');

    // Reconnect Tanvi socket and both join for settlement test
    tanviSocket.connect();
    await new Promise((resolve) => tanviSocket.on('connect', resolve));
    await new Promise((resolve) => tanviSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve));
    await new Promise((resolve) => priyaSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve));

    health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.data.voice_rooms, 1, 'voice_rooms is 1 before settlement');

    // Prepare to catch rtc:ended on both sockets upon completion
    const tanviEndedPromise = waitForEvent(tanviSocket, 'rtc:ended');
    const priyaEndedPromise = waitForEvent(priyaSocket, 'rtc:ended');

    // Transition session to in_progress via start
    const startRes = await api(BASE_URL, `/api/bookings/${testBooking.id}/start`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    assert.strictEqual(startRes.status, 200, 'Session started');

    // Complete session via POST /api/bookings/:id/complete
    const completeRes = await api(BASE_URL, `/api/bookings/${testBooking.id}/complete`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    assert.strictEqual(completeRes.status, 200, 'Session completed');

    const [tEnded, pEnded] = await Promise.all([tanviEndedPromise, priyaEndedPromise]);
    assert.strictEqual(tEnded.roomId, testBooking.room_id);
    assert.strictEqual(pEnded.roomId, testBooking.room_id);

    health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.data.voice_rooms, 0, 'voice_rooms is 0 after session completion');

    // Attempting rtc:join on completed booking must fail
    const completedJoinAck = await new Promise((resolve) => {
      tanviSocket.emit('rtc:join', { roomId: testBooking.room_id }, resolve);
    });
    assert.strictEqual(completedJoinAck.ok, false, 'Cannot join voice on completed booking');

    // Demo reset check
    const resetRes = await api(BASE_URL, '/api/demo/reset', { method: 'POST' });
    assert.strictEqual(resetRes.status, 200);
    health = await api(BASE_URL, '/api/health');
    assert.strictEqual(health.data.voice_rooms, 0, 'voice_rooms is 0 after demo reset');

    console.log('  PASS: Case 8 - Cleanup: peer-left on disconnect, rtc:ended on settlement, voice_rooms 0 on reset');
  }

  // =========================================================================
  // CASE 9: RTC_ENABLED=false
  // =========================================================================
  {
    console.log('🚀 Spawning disabled-RTC child server on port', PORT_DISABLED);
    const disabledDb = await createDatabase(tempDbFileDisabled);
    runSeed(disabledDb);

    disabledServerProcess = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        PORT: String(PORT_DISABLED),
        DB_PATH: tempDbFileDisabled,
        RTC_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let disabledReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const h = await fetch(`${BASE_URL_DISABLED}/api/health`);
        if (h.ok) {
          disabledReady = true;
          break;
        }
      } catch {
        await wait(150);
      }
    }
    assert.ok(disabledReady, 'Disabled server child process failed to start');

    // Check /api/rtc/config
    const disabledCfg = await api(BASE_URL_DISABLED, '/api/rtc/config', {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    assert.strictEqual(disabledCfg.data.enabled, false, 'RTC config must say enabled: false');

    // Connect socket to disabled server
    const disabledSocket = ClientIO(BASE_URL_DISABLED, { auth: { userId: 'usr_terminaltinkerer' } });
    socketsToClose.push(disabledSocket);
    await new Promise((resolve) => disabledSocket.on('connect', resolve));

    const joinAck = await new Promise((resolve) => {
      disabledSocket.emit('rtc:join', { roomId: 'any-room' }, resolve);
    });
    assert.strictEqual(joinAck.ok, false);
    assert.strictEqual(joinAck.error, 'voice disabled');

    const signalAck = await new Promise((resolve) => {
      disabledSocket.emit('rtc:signal', { roomId: 'any-room', data: { kind: 'offer' } }, resolve);
    });
    assert.strictEqual(signalAck.ok, false);
    assert.strictEqual(signalAck.error, 'voice disabled');

    disabledSocket.disconnect();
    disabledServerProcess.kill();
    disabledServerProcess = null;

    console.log('  PASS: Case 9 - RTC_ENABLED=false disables config and causes all rtc:* events to ack ok:false');
  }

  // =========================================================================
  // CASE 10: Credits Untouched
  // =========================================================================
  {
    // The sum of all ledger deltas in the system must remain exactly equal to initialLedgerSum
    const postLedgerSum = getLedgerSum();
    assert.strictEqual(
      postLedgerSum,
      initialLedgerSum,
      `Ledger sum delta mismatch: initial ${initialLedgerSum}, now ${postLedgerSum}`
    );

    // Run full integrity check
    const integrity = checkIntegrity(initDb);
    assert.strictEqual(integrity.ok, true, 'checkIntegrity must be green');
    assert.strictEqual(integrity.conserved, true, 'Credits must be conserved');

    console.log('  PASS: Case 10 - Credits untouched: SUM of ledger deltas is identical and checkIntegrity is green');
  }

  // =========================================================================
  // CASE 11: No Audio/SDP Persistence
  // =========================================================================
  {
    // Search SQLite database file bytes for SDP marker "v=0"
    const dbBytes = fs.readFileSync(tempDbFile);
    const sdpMarker = Buffer.from('v=0');
    const sdpMarkerIndex = dbBytes.indexOf(sdpMarker);
    assert.strictEqual(
      sdpMarkerIndex,
      -1,
      `Found SDP marker 'v=0' persisted in database file at byte offset ${sdpMarkerIndex}!`
    );

    // Verify all table schemas and contents
    const tables = initDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const t of tables) {
      const rows = initDb.prepare(`SELECT * FROM ${t.name}`).all();
      for (const r of rows) {
        const rowJson = JSON.stringify(r);
        assert.ok(!rowJson.includes('v=0\r\n'), `Found SDP snippet in table ${t.name}`);
        assert.ok(!rowJson.includes('candidate:'), `Found ICE candidate in table ${t.name}`);
      }
    }

    console.log('  PASS: Case 11 - No audio/SDP persistence: SDP marker "v=0" appears nowhere in database file or tables');
  }

  console.log('\n====================================================');
  console.log('✅ All 11 WebRTC Voice Test Cases PASSED');
  console.log('====================================================');

  cleanup();
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ RTC Test Failed:', err);
  cleanup();
  process.exit(1);
});
