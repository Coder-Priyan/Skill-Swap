// Socket.io client manager (SPEC.md Section 8 & 13 Slice 3)
import { io } from 'socket.io-client';
import { getCurrentUserId } from './api.js';

let socket = null;
const eventListeners = new Map(); // event -> Set of callbacks

/**
 * Initializes or reconnects the socket with the current user ID
 * @param {string} [userId] 
 * @returns {import('socket.io-client').Socket | null}
 */
export function connectSocket(userId) {
  const currentUserId = userId || getCurrentUserId();

  if (!currentUserId) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  // If already connected with the same userId, reuse
  if (socket && socket.connected && socket.auth?.userId === currentUserId) {
    return socket;
  }

  // If connected with a different userId, disconnect first
  if (socket) {
    socket.disconnect();
  }

  // Connect to server (Vite proxies or direct host:port)
  // Socket.io default port matches window.location if proxied, or we can connect to root
  socket = io('/', {
    auth: { userId: currentUserId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    // Reattach registered event listeners
    for (const [event, callbacks] of eventListeners.entries()) {
      callbacks.forEach((cb) => {
        socket.off(event, cb);
        socket.on(event, cb);
      });
    }
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

/**
 * Disconnects the socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Returns the active socket instance
 */
export function getSocket() {
  if (!socket) {
    return connectSocket();
  }
  return socket;
}

/**
 * Subscribe to a socket event across reconnection cycles
 * @param {string} event 
 * @param {(data: any) => void} callback 
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToSocketEvent(event, callback) {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event).add(callback);

  if (socket) {
    socket.on(event, callback);
  }

  return () => {
    if (eventListeners.has(event)) {
      eventListeners.get(event).delete(callback);
    }
    if (socket) {
      socket.off(event, callback);
    }
  };
}

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  subscribeToSocketEvent,
};
