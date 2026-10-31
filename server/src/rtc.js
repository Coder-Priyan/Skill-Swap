import { db } from './db.js';
import {
  RTC_ENABLED,
  RTC_SIGNAL_MAX_BYTES,
  RTC_RATE_LIMIT,
  RTC_STUN_URLS,
  RTC_TURN_URL,
  RTC_TURN_USERNAME,
  RTC_TURN_CREDENTIAL,
} from './config.js';

// In-memory voice state: roomId -> Map<userId, socketId>
const voiceState = new Map();

// Rate limiting: socketId -> { count: number, windowStart: number }
const socketRateLimits = new Map();

/**
 * Returns count of rooms with at least one active voice participant.
 * Used for /api/health and test verification.
 * 
 * @returns {number}
 */
export function getVoiceRoomCount() {
  return voiceState.size;
}

/**
 * Builds ICE configuration object from environment config.
 * TURN credentials only included if all three TURN variables are configured.
 * 
 * @returns {{ enabled: boolean, iceServers: Array<object> }}
 */
export function getRtcConfig() {
  if (!RTC_ENABLED) {
    return { enabled: false, iceServers: [] };
  }

  const iceServers = [{ urls: RTC_STUN_URLS }];

  if (RTC_TURN_URL && RTC_TURN_USERNAME && RTC_TURN_CREDENTIAL) {
    iceServers.push({
      urls: RTC_TURN_URL,
      username: RTC_TURN_USERNAME,
      credential: RTC_TURN_CREDENTIAL,
    });
  }

  return { enabled: true, iceServers };
}

/**
 * Express handler for GET /api/rtc/config.
 * Validates X-User-Id header before returning ICE config.
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
export function getRtcConfigHandler(req, res) {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(currentUserId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid X-User-Id: user does not exist' });
    }

    res.json(getRtcConfig());
  } catch (err) {
    console.error('Error in GET /api/rtc/config:', err);
    res.status(500).json({ error: 'Failed to retrieve RTC config' });
  }
}

/**
 * Validates that the user is an authorized participant of the booking and session is active.
 * 
 * @param {string} roomId 
 * @param {string} userId 
 * @param {object} [targetDb=db] 
 * @returns {{ ok: boolean, error?: string, booking?: object, isLearner?: boolean }}
 */
export function validateRoomAccess(roomId, userId, targetDb = db) {
  if (!roomId || typeof roomId !== 'string') {
    return { ok: false, error: 'roomId is required' };
  }

  const booking = targetDb.prepare('SELECT * FROM bookings WHERE room_id = ?').get(roomId);
  if (!booking) {
    return { ok: false, error: 'Room not found' };
  }

  if (booking.learner_id !== userId && booking.mentor_id !== userId) {
    return { ok: false, error: 'Forbidden: you are not a participant in this room' };
  }

  if (booking.status !== 'accepted' && booking.status !== 'in_progress') {
    return { ok: false, error: `Cannot access voice for session in status '${booking.status}'` };
  }

  return { ok: true, booking, isLearner: booking.learner_id === userId };
}

/**
 * Removes a user from the room's voice state and notifies the other participant.
 * Cleans up empty room entries to prevent memory leaks.
 * 
 * @param {object} socket 
 * @param {string} roomId 
 * @param {object} io 
 */
function removeUserFromVoice(socket, roomId, io) {
  if (!voiceState.has(roomId)) return;
  const roomVoice = voiceState.get(roomId);

  if (roomVoice.get(socket.userId) === socket.id) {
    roomVoice.delete(socket.userId);

    // Notify other participant that this user left voice
    for (const [otherUserId, otherSocketId] of roomVoice.entries()) {
      if (io) {
        io.to(otherSocketId).emit('rtc:peer-left', { userId: socket.userId });
      }
    }

    if (roomVoice.size === 0) {
      voiceState.delete(roomId);
    }
  }

  if (socket.voiceRooms) {
    socket.voiceRooms.delete(roomId);
  }
}

/**
 * Attaches WebRTC signaling event listeners to an authenticated Socket.io socket.
 * 
 * @param {object} socket 
 * @param {object} io 
 * @param {object} [targetDb=db] 
 */
export function setupRtcSockets(socket, io, targetDb = db) {
  // rtc:join { roomId } -> ack { ok, peers, initiator }
  socket.on('rtc:join', (payload, ack) => {
    const cb = typeof ack === 'function' ? ack : () => {};

    if (!RTC_ENABLED) {
      return cb({ ok: false, error: 'voice disabled' });
    }

    const roomId = payload?.roomId;
    const auth = validateRoomAccess(roomId, socket.userId, targetDb);
    if (!auth.ok) {
      return cb({ ok: false, error: auth.error });
    }

    if (!voiceState.has(roomId)) {
      voiceState.set(roomId, new Map());
    }
    const roomVoice = voiceState.get(roomId);

    // One voice socket per user per room:
    // If user joins from a second tab/socket, send old socket rtc:replaced and drop from voice
    const existingSocketId = roomVoice.get(socket.userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      io.to(existingSocketId).emit('rtc:replaced', { roomId });
    }

    roomVoice.set(socket.userId, socket.id);
    if (!socket.voiceRooms) socket.voiceRooms = new Set();
    socket.voiceRooms.add(roomId);

    const initiator = auth.isLearner;
    const peers = Array.from(roomVoice.keys());

    cb({ ok: true, peers, initiator });

    // Broadcast rtc:peer-joined { userId } to the other participant
    for (const [otherUserId, otherSocketId] of roomVoice.entries()) {
      if (otherUserId !== socket.userId) {
        io.to(otherSocketId).emit('rtc:peer-joined', { userId: socket.userId });
      }
    }

    // Deterministic roles: learner is initiator (offerer).
    // When the second person joins voice, server tells offerer rtc:ready so it creates the offer.
    if (roomVoice.size === 2) {
      const learnerSocketId = roomVoice.get(auth.booking.learner_id);
      if (learnerSocketId) {
        io.to(learnerSocketId).emit('rtc:ready', { roomId });
      }
    }
  });

  // rtc:signal { roomId, data } -> ack { ok, error? }
  socket.on('rtc:signal', (payload, ack) => {
    const cb = typeof ack === 'function' ? ack : () => {};

    if (!RTC_ENABLED) {
      return cb({ ok: false, error: 'voice disabled' });
    }

    const roomId = payload?.roomId;
    const data = payload?.data;

    // Enforce RTC_SIGNAL_MAX_BYTES
    let payloadStr = '';
    try {
      payloadStr = JSON.stringify(data);
    } catch (_) {
      return cb({ ok: false, error: 'Malformed signal data' });
    }

    if (!payloadStr || Buffer.byteLength(payloadStr, 'utf8') > RTC_SIGNAL_MAX_BYTES) {
      return cb({ ok: false, error: 'Signal payload exceeds maximum allowed size' });
    }

    // Enforce per-socket rate limit (60 msgs per 10s per socket)
    const now = Date.now();
    let rl = socketRateLimits.get(socket.id);
    if (!rl || now - rl.windowStart > 10000) {
      rl = { count: 1, windowStart: now };
      socketRateLimits.set(socket.id, rl);
    } else {
      rl.count++;
      if (rl.count > RTC_RATE_LIMIT) {
        return cb({ ok: false, error: 'Signaling rate limit exceeded' });
      }
    }

    // Validate room access
    const auth = validateRoomAccess(roomId, socket.userId, targetDb);
    if (!auth.ok) {
      return cb({ ok: false, error: auth.error });
    }

    // User must be joined to voice in this room
    const roomVoice = voiceState.get(roomId);
    if (!roomVoice || roomVoice.get(socket.userId) !== socket.id) {
      return cb({ ok: false, error: 'Not currently joined to voice in this room' });
    }

    // Validate signal data structure
    if (!data || typeof data !== 'object') {
      return cb({ ok: false, error: 'Invalid signal data' });
    }

    if (data.kind === 'offer') {
      if (
        !data.sdp ||
        typeof data.sdp !== 'object' ||
        data.sdp.type !== 'offer' ||
        typeof data.sdp.sdp !== 'string' ||
        !data.sdp.sdp.trim()
      ) {
        return cb({ ok: false, error: 'Invalid offer SDP' });
      }
    } else if (data.kind === 'answer') {
      if (
        !data.sdp ||
        typeof data.sdp !== 'object' ||
        data.sdp.type !== 'answer' ||
        typeof data.sdp.sdp !== 'string' ||
        !data.sdp.sdp.trim()
      ) {
        return cb({ ok: false, error: 'Invalid answer SDP' });
      }
    } else if (data.kind === 'ice') {
      if (!('candidate' in data)) {
        return cb({ ok: false, error: 'Missing candidate in ICE signal' });
      }
      if (data.candidate !== null && typeof data.candidate !== 'object') {
        return cb({ ok: false, error: 'Invalid ICE candidate' });
      }
      if (typeof data.candidate === 'object' && data.candidate !== null) {
        if ('candidate' in data.candidate && data.candidate.candidate !== null && typeof data.candidate.candidate !== 'string') {
          return cb({ ok: false, error: 'Invalid ICE candidate string' });
        }
      }
    } else {
      return cb({ ok: false, error: `Invalid or unknown signal kind: ${data.kind}` });
    }

    // Relay ONLY to the other participant's voice socket in that room as rtc:signal { roomId, from: userId, data }
    let relayed = false;
    for (const [otherUserId, otherSocketId] of roomVoice.entries()) {
      if (otherUserId !== socket.userId) {
        io.to(otherSocketId).emit('rtc:signal', {
          roomId,
          from: socket.userId,
          data,
        });
        relayed = true;
      }
    }

    cb({ ok: true, relayed });
  });

  // rtc:leave { roomId } -> ack { ok }
  socket.on('rtc:leave', (payload, ack) => {
    const cb = typeof ack === 'function' ? ack : () => {};

    if (!RTC_ENABLED) {
      return cb({ ok: false, error: 'voice disabled' });
    }

    const roomId = payload?.roomId;
    if (!roomId) {
      return cb({ ok: false, error: 'roomId required' });
    }

    removeUserFromVoice(socket, roomId, io);
    cb({ ok: true });
  });
}

/**
 * Clean up all voice rooms on socket disconnect.
 * 
 * @param {object} socket 
 * @param {object} io 
 */
export function handleRtcDisconnect(socket, io) {
  socketRateLimits.delete(socket.id);
  if (socket.voiceRooms) {
    for (const roomId of socket.voiceRooms) {
      removeUserFromVoice(socket, roomId, io);
    }
    socket.voiceRooms.clear();
  }
}

/**
 * Closes voice for a specific room on session settlement or cancellation.
 * Emits rtc:ended to all voice participants in that room and cleans up map.
 * 
 * @param {string} roomId 
 * @param {object} [ioInstance] 
 */
export function endRoomVoice(roomId, ioInstance) {
  if (!roomId || !voiceState.has(roomId)) return;
  const roomVoice = voiceState.get(roomId);

  if (ioInstance) {
    for (const socketId of roomVoice.values()) {
      ioInstance.to(socketId).emit('rtc:ended', { roomId });
    }
  }

  voiceState.delete(roomId);
}

/**
 * Clears all active voice state across all rooms and resets rate limits.
 * Emits rtc:ended to all participants. Called by demo:reset.
 * 
 * @param {object} [ioInstance] 
 */
export function clearAllVoiceState(ioInstance) {
  for (const [roomId, roomVoice] of voiceState.entries()) {
    if (ioInstance) {
      for (const socketId of roomVoice.values()) {
        ioInstance.to(socketId).emit('rtc:ended', { roomId });
      }
    }
  }

  voiceState.clear();
  socketRateLimits.clear();
}
