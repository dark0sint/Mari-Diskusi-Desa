const { verifyToken } = require('./auth');

// Setiap client yang login akan "join" ke room bernama user:<NIK>.
// Saat ada balasan baru, server cukup mengirim event ke room warga
// yang terlibat di topik tersebut — inilah yang membuat notifikasi
// benar-benar real-time tanpa perlu polling dari browser.
module.exports = function setupSocket(io) {
  io.on('connection', (socket) => {
    socket.on('authenticate', (token) => {
      const payload = token && verifyToken(token);
      if (payload && payload.nik) {
        socket.join('user:' + payload.nik);
      }
    });
  });
};
