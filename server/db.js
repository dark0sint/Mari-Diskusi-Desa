// Lapisan penyimpanan data sederhana berbasis file JSON.
// Cukup untuk skala satu desa. Jika data warga sudah sangat besar,
// modul ini bisa diganti dengan database sungguhan (Postgres/MySQL)
// tanpa mengubah banyak kode di routes/, karena semua akses data
// lewat fungsi-fungsi di bawah ini.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { users: {}, topics: [], replies: {}, config: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}
ensureDataFile();

let cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// Semua penulisan diantre secara berurutan agar tidak saling
// menimpa saat banyak permintaan datang bersamaan.
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

module.exports = {
  getUsers() {
    return cache.users;
  },
  getUser(nik) {
    return cache.users[nik];
  },
  async saveUser(user) {
    cache.users[user.nik] = user;
    await persist();
  },
  getTopics() {
    return cache.topics;
  },
  async saveTopics(topics) {
    cache.topics = topics;
    await persist();
  },
  getReplies(topicId) {
    return cache.replies[topicId] || [];
  },
  async saveReplies(topicId, replies) {
    cache.replies[topicId] = replies;
    await persist();
  },
  getConfig() {
    return cache.config;
  },
  async saveConfig(patch) {
    cache.config = { ...cache.config, ...patch };
    await persist();
  },
};
