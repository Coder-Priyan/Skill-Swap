import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { db } from './db.js';

let wss = null;

/**
 * Initializes Yjs WebSocketServer attached to the provided HTTP server.
 * Handles HTTP upgrade only for paths starting with /yjs/
 * Connection URL: /yjs/{roomId}?userId={id}
 * 
 * @param {import('http').Server} httpServer 
 * @param {object} [targetDb=db] 
 * @returns {WebSocketServer}
 */
export function initYjs(httpServer, targetDb = db) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/yjs/')) {
        // Not a Yjs connection; allow other upgrade handlers (like Socket.io) to process it
        return;
      }

      // Extract roomId and userId
      const rawRoom = url.pathname.slice(5).split('/')[0];
      const roomId = decodeURIComponent(rawRoom);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      if (!roomId) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Validate booking in DB
      const booking = targetDb.prepare('SELECT * FROM bookings WHERE room_id = ?').get(roomId);
      if (!booking) {
        socket.write('HTTP/1.1 404 Room Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Participant only
      if (booking.learner_id !== userId && booking.mentor_id !== userId) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Status must be accepted or in_progress
      if (booking.status !== 'accepted' && booking.status !== 'in_progress') {
        socket.write('HTTP/1.1 403 Session Inactive\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
        setupWSConnection(ws, req, { docName: roomId, gc: true });
      });
    } catch (err) {
      console.error('Yjs upgrade handler error:', err);
      try {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      } catch (_) {}
    }
  });

  return wss;
}

export function getWss() {
  return wss;
}
