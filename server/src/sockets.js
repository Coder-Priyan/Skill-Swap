import { Server } from 'socket.io';
import { db } from './db.js';

let io = null;

/**
 * Initialize Socket.io on the HTTP server.
 * Attaches authentication middleware to validate user identity.
 * 
 * @param {import('http').Server} httpServer 
 * @returns {Server}
 */
export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  // Authentication middleware
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) {
      return next(new Error('Authentication failed: userId required in socket auth'));
    }

    try {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
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
    // console.log(`⚡ Socket connected: ${socket.id} joined ${userRoom}`);

    socket.on('disconnect', () => {
      // console.log(`🔌 Socket disconnected: ${socket.id}`);
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

export function getIO() {
  return io;
}
