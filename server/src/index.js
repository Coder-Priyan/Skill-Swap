import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { db } from './db.js';
import { runSeed } from './seed.js';
import usersRoutes from './routes/users.js';
import peersRoutes, { getMetaHandler, getMetaMatchHandler } from './routes/peers.js';
import bookingsRoutes from './routes/bookings.js';
import ledgerRoutes from './routes/ledger.js';
import auditRoutes from './routes/audit.js';
import leaderboardRoutes from './routes/leaderboard.js';
import matchRoutes from './routes/match.js';
import { initSockets, clearAllRoomState, emitToAll } from './sockets.js';
import { initYjs, getOpenRoomCount, closeAllRooms } from './yjs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

// Process error handlers (never exit silently)
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);

// Initialize Socket.io on the HTTP server
initSockets(server);

// Initialize Yjs WebSocket server on the HTTP server (Slice 5)
initYjs(server);

const PORT = process.env.PORT || 4000;

// Body parsing with 100kb limit & CORS
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'SkillSwap Backend',
    open_rooms: getOpenRoomCount(),
  });
});

// Demo mode configuration
export const isDemoMode = () => {
  if (process.env.DEMO_MODE !== undefined) {
    return process.env.DEMO_MODE === 'true';
  }
  return process.env.NODE_ENV !== 'production';
};

// POST /api/demo/reset: In-memory & DB reset for seamless demos
app.post('/api/demo/reset', (req, res) => {
  if (!isDemoMode()) {
    return res.status(404).json({ error: 'Demo reset disabled in production mode' });
  }

  try {
    // 1. Re-seed database inside one transaction
    runSeed(db);

    // 2. Close all active Yjs room documents and WebSockets
    closeAllRooms();

    // 3. Clear in-memory room presence and chat histories
    clearAllRoomState();

    // 4. Broadcast demo:reset event to all connected clients
    emitToAll('demo:reset', {
      timestamp: new Date().toISOString(),
      message: 'Demo data has been reset to initial state',
    });

    res.json({
      status: 'ok',
      message: 'Demo database and room states reset successfully',
    });
  } catch (err) {
    console.error('Error during demo:reset:', err);
    res.status(500).json({ error: 'Failed to reset demo data' });
  }
});

// Mount user routes
app.use('/api/users', usersRoutes);

// Mount directory metadata and peers routes (Slice 2)
app.get('/api/meta', getMetaHandler);
app.get('/api/meta/match', getMetaMatchHandler);
app.use('/api/peers', peersRoutes);

// Mount match engine route (Smart Match)
app.use('/api/match', matchRoutes);

// Mount bookings routes (Slice 3)
app.use('/api/bookings', bookingsRoutes);

// Mount ledger routes (Slice 4)
app.use('/api/ledger', ledgerRoutes);

// Mount audit routes (Slice 7)
app.use('/api/audit', auditRoutes);

// Mount leaderboard routes (Slice 7)
app.use('/api/leaderboard', leaderboardRoutes);

// 404 handler for unknown API routes (JSON, never HTML)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Production Static File Serving & SPA Fallback
if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Fallback to index.html for non-API client routes (SPA routing)
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/socket.io') ||
      req.path.startsWith('/yjs')
    ) {
      return next();
    }
    const indexHtmlPath = path.join(CLIENT_DIST, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexHtmlPath);
    }
    next();
  });
}

// Global Express Error Middleware (JSON 500, no stack trace in production)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProd ? 'Internal Server Error' : err.message || 'Internal Server Error',
  });
});

// Helper to gather local IPv4 LAN URLs
export function getLanUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

// Graceful shutdown
const handleShutdown = () => {
  console.log('\nGracefully shutting down SkillSwap server...');
  server.close(() => {
    process.exit(0);
  });
};
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Start listening if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SkillSwap Server running at:`);
    console.log(`   Local:        http://localhost:${PORT}`);
    const lanUrls = getLanUrls(PORT);
    lanUrls.forEach((url) => {
      console.log(`   On your wifi: ${url}`);
    });
    console.log(`   Health:       http://localhost:${PORT}/api/health`);
    console.log(`   Users:        http://localhost:${PORT}/api/users`);
  });
}

export { app, server };
