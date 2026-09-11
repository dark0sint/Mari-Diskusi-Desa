require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const topicsRoutes = require('./routes/topics');
const repliesRoutes = require('./routes/replies');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '200kb' }));

// Batasi laju permintaan ke API agar tidak dibanjiri spam/bot.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api', repliesRoutes(io));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Sajikan frontend statis.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

setupSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mari Diskusi Desa berjalan di http://localhost:${PORT}`);
});
