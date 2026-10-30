import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import usersRoutes from './routes/users.js';
import peersRoutes, { getMetaHandler } from './routes/peers.js';
import bookingsRoutes from './routes/bookings.js';
import { initSockets } from './sockets.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io on the HTTP server
initSockets(server);

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
  });
});

// Mount user routes
app.use('/api/users', usersRoutes);

// Mount directory metadata and peers routes (Slice 2)
app.get('/api/meta', getMetaHandler);
app.use('/api/peers', peersRoutes);

// Mount bookings routes (Slice 3)
app.use('/api/bookings', bookingsRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Start listening
server.listen(PORT, () => {
  console.log(`🚀 SkillSwap Server running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Users:  http://localhost:${PORT}/api/users`);
});

export { app, server };
