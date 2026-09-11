const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin, optionalAuth } = require('../auth');

const router = express.Router();
const KATEGORI_VALID = ['infrastruktur', 'sosial', 'pengaduan', 'saran'];
const STATUS_VALID = ['menunggu', 'diproses', 'selesai'];

// Daftar topik (publik, boleh difilter kategori/pencarian).
// Perangkat desa juga melihat topik yang sudah disembunyikan moderasi.
router.get('/', optionalAuth, (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  let topics = db.getTopics();
  if (!isAdmin) topics = topics.filter((t) => !t.hidden);

  const { kategori, search } = req.query;
  if (kategori && kategori !== 'semua') topics = topics.filter((t) => t.kategori === kategori);
  if (search) {
    const q = String(search).toLowerCase();
    topics = topics.filter((t) => t.judul.toLowerCase().includes(q) || t.isi.toLowerCase().includes(q));
  }

  const withCounts = topics
    .map((t) => ({
      ...t,
      replyCount: db.getReplies(t.id).filter((r) => isAdmin || !r.hidden).length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({ topics: withCounts });
});

// Hitung jumlah topik per kategori, untuk badge di sidebar.
router.get('/counts', optionalAuth, (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const topics = db.getTopics().filter((t) => isAdmin || !t.hidden);
  const counts = {};
  KATEGORI_VALID.forEach((k) => (counts[k] = 0));
  topics.forEach((t) => {
    if (counts[t.kategori] !== undefined) counts[t.kategori] += 1;
  });
  res.json({ counts });
});

router.get('/:id', optionalAuth, (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const topic = db.getTopics().find((t) => t.id === req.params.id);
  if (!topic || (topic.hidden && !isAdmin)) {
    return res.status(404).json({ error: 'Diskusi tidak ditemukan.' });
  }
  const replies = db.getReplies(topic.id).filter((r) => isAdmin || !r.hidden);
  res.json({ topic, replies });
});

router.post('/', requireAuth, async (req, res) => {
  const { kategori, judul, isi } = req.body || {};
  if (!KATEGORI_VALID.includes(kategori)) return res.status(400).json({ error: 'Kategori tidak valid.' });
  if (!judul || !judul.trim()) return res.status(400).json({ error: 'Judul wajib diisi.' });
  if (!isi || !isi.trim()) return res.status(400).json({ error: 'Isi diskusi wajib diisi.' });

  const topic = {
    id: crypto.randomUUID(),
    kategori,
    judul: judul.trim().slice(0, 200),
    isi: isi.trim().slice(0, 5000),
    penulisNik: req.user.nik,
    penulisNama: req.user.nama,
    status: kategori === 'pengaduan' ? 'menunggu' : null,
    createdAt: Date.now(),
    hidden: false,
  };
  const topics = db.getTopics();
  topics.unshift(topic);
  await db.saveTopics(topics);
  res.status(201).json({ topic });
});

// Ubah status pengaduan (khusus Perangkat Desa) -> transparansi penanganan.
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_VALID.includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
  const topics = db.getTopics();
  const topic = topics.find((t) => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Diskusi tidak ditemukan.' });
  topic.status = status;
  await db.saveTopics(topics);
  res.json({ topic });
});

// Sembunyikan/tampilkan topik (moderasi konten, khusus Perangkat Desa).
router.patch('/:id/hide', requireAuth, requireAdmin, async (req, res) => {
  const topics = db.getTopics();
  const topic = topics.find((t) => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Diskusi tidak ditemukan.' });
  topic.hidden = !topic.hidden;
  await db.saveTopics(topics);
  res.json({ topic });
});

module.exports = router;
