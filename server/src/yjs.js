import { WebSocketServer } from 'ws';
import { setupWSConnection, docs } from 'y-websocket/bin/utils';
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

/**
 * Snapshots the final code and language from a room's in-memory Yjs doc into session_notes,
 * closes all connected WebSocket clients, and removes the document from memory.
 * 
 * @param {string} roomId 
 * @param {string} bookingId 
 * @param {object} [targetDb=db] 
 * @returns {{ final_code: string, language: string }}
 */
export function snapshotAndCloseRoom(roomId, bookingId, targetDb = db) {
  let finalCode = '';
  let language = 'javascript';

  try {
    if (roomId && docs.has(roomId)) {
      const doc = docs.get(roomId);
      try {
        finalCode = doc.getText('code').toString();
      } catch (e) {
        console.error(`Error reading doc text for room ${roomId}:`, e);
      }
      try {
        language = doc.getMap('meta').get('language') || 'javascript';
      } catch (e) {
        console.error(`Error reading doc meta for room ${roomId}:`, e);
      }

      // Close all connected WebSockets for this room
      if (doc.conns) {
        for (const conn of doc.conns.keys()) {
          try {
            conn.close();
          } catch (_) {}
        }
      }

      // Destroy doc and remove from memory
      try {
        doc.destroy();
      } catch (_) {}
      docs.delete(roomId);
    }

    // Persist into session_notes table
    const noteId = `not_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const savedAt = new Date().toISOString();

    targetDb.prepare(`
      INSERT INTO session_notes (id, booking_id, summary, final_code, language, saved_at)
      VALUES (?, ?, NULL, ?, ?, ?)
    `).run(noteId, bookingId, finalCode, language, savedAt);
  } catch (err) {
    console.error(`Failed to snapshot/close room ${roomId} for booking ${bookingId}:`, err);
  }

  return { final_code: finalCode, language };
}

/**
 * Returns whether a room document currently exists in server memory.
 * @param {string} roomId 
 * @returns {boolean}
 */
export function hasRoomDoc(roomId) {
  return Boolean(roomId && docs.has(roomId));
}

/**
 * Returns total count of active Yjs documents in memory.
 * @returns {number}
 */
export function getOpenRoomCount() {
  return docs.size;
}
