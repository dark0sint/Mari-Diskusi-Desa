const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// Diekspor sebagai fungsi supaya instance socket.io (io) bisa dipakai
// untuk mengirim notifikasi real-time saat ada balasan baru.
module.exports = function repliesRouter(io) {
  const router = express.Router();

  // Kirim balasan baru (bisa membalas topik langsung atau membalas
  // balasan lain -> parentId mengaktifkan threaded reply).
  router.post('/topics/:topicId/replies', requireAuth, async (req, res) => {
    const { isi, parentId } = req.body || {};
    if (!isi || !isi.trim()) return res.status(400).json({ error: 'Balasan tidak boleh kosong.' });

    const topic = db.getTopics().find((t) => t.id === req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Diskusi tidak ditemukan.' });

    const replies = db.getReplies(topic.id);
    if (parentId && !replies.some((r) => r.id === parentId)) {
      return res.status(400).json({ error: 'Balasan induk tidak ditemukan.' });
    }

    const reply = {
      id: crypto.randomUUID(),
      topicId: topic.id,
      parentId: parentId || null,
      isi: isi.trim().slice(0, 3000),
      penulisNik: req.user.nik,
      penulisNama: req.user.nama,
      role: req.user.role,
      createdAt: Date.now(),
      hidden: false,
    };
    replies.push(reply);
    await db.saveReplies(topic.id, replies);

    // Notifikasi real-time ke penulis topik & warga lain yang sudah
    // ikut berkomentar di topik ini (kecuali si pengirim sendiri).
    const involved = new Set([topic.penulisNik, ...replies.map((r) => r.penulisNik)]);
    involved.delete(reply.penulisNik);
    involved.forEach((nik) => {
      io.to('user:' + nik).emit('newReply', {
        topicId: topic.id,
        topicTitle: topic.judul,
        nama: reply.penulisNama,
        isi: reply.isi,
        replyId: reply.id,
        createdAt: reply.createdAt,
      });
    });

    res.status(201).json({ reply });
  });

  // Sembunyikan/tampilkan balasan tertentu (moderasi, khusus Perangkat Desa).
  router.patch('/replies/:replyId/hide', requireAuth, requireAdmin, async (req, res) => {
    const topics = db.getTopics();
    for (const t of topics) {
      const replies = db.getReplies(t.id);
      const reply = replies.find((r) => r.id === req.params.replyId);
      if (reply) {
        reply.hidden = !reply.hidden;
        await db.saveReplies(t.id, replies);
        return res.json({ reply });
      }
    }
    res.status(404).json({ error: 'Balasan tidak ditemukan.' });
  });

  return router;
};
