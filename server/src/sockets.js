import { Server } from 'socket.io';
import { db } from './db.js';
import { setupRtcSockets, handleRtcDisconnect } from './rtc.js';

let io = null;

// In-memory room state
// roomId -> Map<userId, Set<socketId>>
const roomPresence = new Map();
// roomId -> Array<{ id, userId, name, text, at }> (last 100)
const roomHistory = new Map();

/**
 * Broadcasts current deduped presence list to room:{roomId}
 * 
 * @param {string} roomId 
 * @param {object} [targetDb=db]
 */
function broadcastPresence(roomId, targetDb = db) {
  if (!io) return;
  const userMap = roomPresence.get(roomId);
  const users = [];

  if (userMap) {
    for (const [userId, socketIds] of userMap.entries()) {
      if (socketIds.size > 0) {
        const u = targetDb.prepare('SELECT id, name, handle, avatar_color FROM users WHERE id = ?').get(userId);
        if (u) {
          users.push({
            id: u.id,
            name: u.name,
            handle: u.handle,
            avatar_color: u.avatar_color,
          });
        }
      }
    }
  }

  io.to(`room:${roomId}`).emit('room:presence', {
    roomId,
    users,
  });
}

/**
 * Initialize Socket.io on the HTTP server.
 * Attaches authentication middleware to validate user identity.
 * 
 * @param {import('http').Server} httpServer 
 * @param {object} [targetDb=db]
 * @returns {Server}
 */
export function initSockets(httpServer, targetDb = db) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
    destroyUpgrade: false, // Do not destroy non-socket.io upgrades (Yjs /yjs/ upgrades)
  });

  // Authentication middleware
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) {
      return next(new Error('Authentication failed: userId required in socket auth'));
    }

    try {
      const user = targetDb.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) {
        return next(new Error('Authentication failed: user does not exist'));
      }
      socket.userId = userId;
      next();
    } catch (err) {
      console.error('Socket authentication error:', err);
      return next(new Error('Internal server error during socket authentication'));
    }
  });

  io.on('connection', (socket) => {
    const userRoom = `user:${socket.userId}`;
    socket.join(userRoom);
    socket.joinedRooms = new Set();

    // Attach WebRTC audio calling signaling handlers (Voice in the room)
    setupRtcSockets(socket, io, targetDb);

    // room:join { roomId } with ack callback ({ ok, error?, history? })
    socket.on('room:join', ({ roomId }, ack) => {
      try {
        if (!roomId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'roomId is required' });
          return;
        }

        // Validate booking in DB
        const booking = targetDb.prepare('SELECT * FROM bookings WHERE room_id = ?').get(roomId);
        if (!booking) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Room not found' });
          return;
        }

        // Participant only
        if (booking.learner_id !== socket.userId && booking.mentor_id !== socket.userId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Forbidden: you are not a participant in this room' });
          return;
        }

        // Status must be accepted or in_progress
        if (booking.status !== 'accepted' && booking.status !== 'in_progress') {
          if (typeof ack === 'function') ack({ ok: false, error: `Cannot join room for session in status '${booking.status}'` });
          return;
        }

        socket.join(`room:${roomId}`);
        socket.joinedRooms.add(roomId);

        // Add to presence map (deduped by userId)
        if (!roomPresence.has(roomId)) {
          roomPresence.set(roomId, new Map());
        }
        const userMap = roomPresence.get(roomId);
        if (!userMap.has(socket.userId)) {
          userMap.set(socket.userId, new Set());
        }
        userMap.get(socket.userId).add(socket.id);

        // Broadcast presence update
        broadcastPresence(roomId, targetDb);

        // Return history (last 100 messages)
        const history = roomHistory.get(roomId) || [];
        if (typeof ack === 'function') {
          ack({ ok: true, history });
        }
      } catch (err) {
        console.error('Error handling room:join:', err);
        if (typeof ack === 'function') ack({ ok: false, error: 'Internal server error' });
      }
    });

    // room:leave { roomId }
    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(`room:${roomId}`);
      socket.joinedRooms.delete(roomId);

      const userMap = roomPresence.get(roomId);
      if (userMap && userMap.has(socket.userId)) {
        userMap.get(socket.userId).delete(socket.id);
        if (userMap.get(socket.userId).size === 0) {
          userMap.delete(socket.userId);
        }
      }
      broadcastPresence(roomId, targetDb);
    });

    // room:message { roomId, text }
    socket.on('room:message', ({ roomId, text }) => {
      try {
        if (!roomId || typeof text !== 'string') return;
        const trimmed = text.trim();
        if (trimmed.length < 1 || trimmed.length > 500) return;

        // Validate booking
        const booking = targetDb.prepare('SELECT * FROM bookings WHERE room_id = ?').get(roomId);
        if (!booking) return;

        // Participant check
        if (booking.learner_id !== socket.userId && booking.mentor_id !== socket.userId) return;

        // Status check
        if (booking.status !== 'accepted' && booking.status !== 'in_progress') return;

        // Sender info from socket authentication
        const sender = targetDb.prepare('SELECT name FROM users WHERE id = ?').get(socket.userId);
        const name = sender ? sender.name : 'Unknown';

        const message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userId: socket.userId,
          name,
          text: trimmed,
          at: new Date().toISOString(),
        };

        if (!roomHistory.has(roomId)) {
          roomHistory.set(roomId, []);
        }
        const history = roomHistory.get(roomId);
        history.push(message);
        if (history.length > 100) {
          history.shift();
        }

        io.to(`room:${roomId}`).emit('room:message', message);
      } catch (err) {
        console.error('Error handling room:message:', err);
      }
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      if (socket.joinedRooms) {
        for (const roomId of socket.joinedRooms) {
          const userMap = roomPresence.get(roomId);
          if (userMap && userMap.has(socket.userId)) {
            userMap.get(socket.userId).delete(socket.id);
            if (userMap.get(socket.userId).size === 0) {
              userMap.delete(socket.userId);
            }
          }
          broadcastPresence(roomId, targetDb);
        }
      }

      // WebRTC audio calling cleanup on disconnect
      handleRtcDisconnect(socket, io);
    });
  });

  return io;
}

/**
 * Emit an event to a specific user room.
 * Should be called AFTER database transaction has committed.
 * 
 * @param {string} userId 
 * @param {string} event 
 * @param {object} payload 
 */
export function emitToUser(userId, event, payload) {
  if (!io) {
    console.warn(`[Sockets] emitToUser called before socket server was initialized: ${event} -> ${userId}`);
    return;
  }
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit an event to a specific live room.
 * 
 * @param {string} roomId 
 * @param {string} event 
 * @param {object} payload 
 */
export function emitToRoom(roomId, event, payload) {
  if (!io) {
    console.warn(`[Sockets] emitToRoom called before socket server was initialized: ${event} -> ${roomId}`);
    return;
  }
  io.to(`room:${roomId}`).emit(event, payload);
}

export function getIO() {
  return io;
}

/**
 * Clears all in-memory room presence and room chat history.
 */
export function clearAllRoomState() {
  roomPresence.clear();
  roomHistory.clear();
}

/**
 * Emits an event to all connected sockets across the platform.
 * @param {string} event 
 * @param {object} payload 
 */
export function emitToAll(event, payload) {
  if (io) {
    io.emit(event, payload);
  }
}

