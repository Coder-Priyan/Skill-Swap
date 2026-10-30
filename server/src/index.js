import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import usersRoutes from './routes/users.js';
import peersRoutes, { getMetaHandler } from './routes/peers.js';
import bookingsRoutes from './routes/bookings.js';
import ledgerRoutes from './routes/ledger.js';
import { initSockets } from './sockets.js';
import { initYjs, getOpenRoomCount } from './yjs.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io on the HTTP server
initSockets(server);

// Initialize Yjs WebSocket server on the HTTP server (Slice 5)
initYjs(server);

const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Mount user routes
app.use('/api/users', usersRoutes);

// Mount directory metadata and peers routes (Slice 2)
app.get('/api/meta', getMetaHandler);
app.use('/api/peers', peersRoutes);

// Mount bookings routes (Slice 3)
app.use('/api/bookings', bookingsRoutes);

// Mount ledger routes (Slice 4)
app.use('/api/ledger', ledgerRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Start listening if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 SkillSwap Server running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Users:  http://localhost:${PORT}/api/users`);
  });
}

export { app, server };
