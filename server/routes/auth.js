const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();
const NIK_RE = /^\d{16}$/;

function publicUser(u) {
  return { nik: u.nik, nama: u.nama, dusun: u.dusun, role: u.role, verified: u.verified };
}

// Pendaftaran warga baru -> verifikasi berbasis NIK + nomor KK.
// Catatan produksi: untuk verifikasi yang benar-benar terhubung ke
// data kependudukan resmi, endpoint ini bisa diperluas untuk memanggil
// API Dukcapil / Data Desa alih-alih hanya menyimpan input warga.
router.post('/register', async (req, res) => {
  const { nik, kk, nama, dusun } = req.body || {};
  if (!NIK_RE.test(nik || '')) return res.status(400).json({ error: 'NIK harus berupa 16 digit angka.' });
  if (!NIK_RE.test(kk || '')) return res.status(400).json({ error: 'Nomor KK harus berupa 16 digit angka.' });
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
  if (!dusun || !dusun.trim()) return res.status(400).json({ error: 'Dusun/RT-RW wajib diisi.' });
  if (db.getUser(nik)) return res.status(409).json({ error: 'NIK ini sudah terdaftar. Silakan masuk.' });

  const user = {
    nik,
    kk,
    nama: nama.trim(),
    dusun: dusun.trim(),
    role: 'warga',
    verified: true,
    createdAt: Date.now(),
  };
  await db.saveUser(user);
  const token = signToken({ nik: user.nik, nama: user.nama, role: user.role });
  res.status(201).json({ token, user: publicUser(user) });
});

// Login warga: cukup NIK, karena identitas sudah diverifikasi saat registrasi.
router.post('/login', async (req, res) => {
  const { nik } = req.body || {};
  if (!NIK_RE.test(nik || '')) return res.status(400).json({ error: 'NIK harus berupa 16 digit angka.' });
  const user = db.getUser(nik);
  if (!user) return res.status(404).json({ error: 'NIK belum terdaftar sebagai warga terverifikasi.' });
  const token = signToken({ nik: user.nik, nama: user.nama, role: user.role });
  res.json({ token, user: publicUser(user) });
});

// Login Perangkat Desa menggunakan kode akses (diset lewat ADMIN_CODE di .env).
router.post('/admin-login', async (req, res) => {
  const { code } = req.body || {};
  const config = db.getConfig();
  let hash = config.adminCodeHash;
  if (!hash) {
    const defaultCode = process.env.ADMIN_CODE || 'PERANGKAT2026';
    hash = bcrypt.hashSync(defaultCode, 10);
    await db.saveConfig({ adminCodeHash: hash });
  }
  if (!code || !bcrypt.compareSync(code, hash)) {
    return res.status(401).json({ error: 'Kode akses Perangkat Desa salah.' });
  }
  const adminUser = { nik: 'ADMIN', nama: 'Perangkat Desa', role: 'admin' };
  const token = signToken(adminUser);
  res.json({ token, user: adminUser });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
