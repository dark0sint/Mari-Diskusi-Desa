const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'ganti-secret-ini-sebelum-produksi';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Wajib login (warga terverifikasi atau perangkat desa)
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.' });
  }
  req.user = payload;
  next();
}

// Login opsional: dipakai di endpoint publik yang perilakunya berubah
// sedikit jika yang mengakses adalah perangkat desa (misalnya melihat
// topik yang disembunyikan).
function optionalAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  req.user = token ? verifyToken(token) : null;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Aksi ini khusus untuk Perangkat Desa.' });
  }
  next();
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth, requireAdmin };
