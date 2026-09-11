# Mari Diskusi Desa

Aplikasi web diskusi & pengaduan warga desa. Backend Node.js/Express dengan
API sungguhan, penyimpanan data persisten di server, autentikasi berbasis
token, dan notifikasi real-time lewat WebSocket (Socket.IO).

## Fitur

- **Kategori topik terstruktur**: Pembangunan Infrastruktur, Kegiatan Sosial, Pengaduan, Saran.
- **Verifikasi warga**: pendaftaran wajib mengisi NIK (16 digit) + Nomor KK (16 digit); login berikutnya cukup NIK yang dicocokkan ke data terdaftar.
- **Balasan bersarang (threaded reply)** tak terbatas kedalaman.
- **Status transparansi pengaduan**: Menunggu → Diproses → Selesai, hanya bisa diubah oleh Perangkat Desa.
- **Moderasi konten**: Perangkat Desa bisa menyembunyikan topik/balasan yang melanggar etika.
- **Notifikasi real-time** lewat WebSocket — begitu ada balasan baru, warga yang terlibat langsung menerima notifikasi tanpa refresh halaman.

## Arsitektur singkat

```
mari-diskusi-desa/
├── server/            Backend Express + Socket.IO
│   ├── index.js        Entry point
│   ├── db.js           Penyimpanan data (file JSON di /data)
│   ├── auth.js         Middleware & helper JWT
│   ├── socket.js        Setup notifikasi real-time
│   └── routes/          Endpoint API (auth, topics, replies)
├── public/             Frontend statis (HTML/CSS/JS biasa, tanpa build step)
├── data/               Tempat data tersimpan (dibuat otomatis, wajib di-backup)
├── .env.example
└── package.json
```

Data disimpan di `data/db.json`. Untuk skala satu desa ini cukup dan sangat
mudah di-backup (tinggal salin satu file). Jika suatu saat jumlah warga/topik
sudah sangat besar, `server/db.js` bisa diganti ke database sungguhan
(PostgreSQL/MySQL) tanpa perlu mengubah kode di `server/routes/`, karena semua
akses data lewat fungsi-fungsi di file itu.

## Menjalankan di komputer lokal (development)

Prasyarat: [Node.js](https://nodejs.org) versi 18 ke atas.

```bash
npm install
cp .env.example .env
# buka .env, ganti JWT_SECRET dan ADMIN_CODE dengan nilai Anda sendiri
npm start
```

Buka `http://localhost:3000` di browser. Untuk mencoba sebagai Perangkat
Desa, gunakan kode akses yang Anda set di `ADMIN_CODE` pada file `.env`.

## Memasang di server (production)

### Opsi A — VPS biasa (Ubuntu/Debian) dengan PM2 + Nginx

1. **Salin proyek ke server**, misalnya lewat `git clone` atau `scp`.
2. **Install Node.js 18+** di server (lewat [NodeSource](https://github.com/nodesource/distributions) atau `nvm`).
3. **Install dependency & siapkan environment**:
   ```bash
   cd mari-diskusi-desa
   npm install --production
   cp .env.example .env
   nano .env   # isi JWT_SECRET (string acak panjang) dan ADMIN_CODE (kode rahasia Perangkat Desa)
   ```
4. **Jalankan dengan PM2** supaya otomatis restart jika crash atau server reboot:
   ```bash
   npm install -g pm2
   pm2 start server/index.js --name mari-diskusi-desa
   pm2 save
   pm2 startup   # ikuti instruksi yang muncul agar PM2 jalan otomatis saat boot
   ```
5. **Pasang Nginx sebagai reverse proxy** (agar bisa pakai domain + HTTPS). Contoh konfigurasi di `/etc/nginx/sites-available/mari-diskusi-desa`:
   ```nginx
   server {
       listen 80;
       server_name diskusi.namadesa-anda.id;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";   # wajib, agar Socket.IO/WebSocket berjalan
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
   Aktifkan lalu reload:
   ```bash
   sudo ln -s /etc/nginx/sites-available/mari-diskusi-desa /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. **Pasang HTTPS gratis** dengan Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d diskusi.namadesa-anda.id
   ```
7. Set `CORS_ORIGIN` di `.env` ke domain resmi (contoh `https://diskusi.namadesa-anda.id`), lalu `pm2 restart mari-diskusi-desa`.

### Opsi B — Docker

```bash
docker build -t mari-diskusi-desa .
docker run -d \
  --name mari-diskusi-desa \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  mari-diskusi-desa
```
Volume `-v $(pwd)/data:/app/data` penting agar data tidak hilang saat container di-restart atau diganti image barunya.

### Opsi C — Layanan hosting Node.js terkelola

Aplikasi ini juga bisa langsung dipasang ke layanan seperti Railway, Render,
atau Fly.io: hubungkan repo, set environment variable (`JWT_SECRET`,
`ADMIN_CODE`, `CORS_ORIGIN`), lalu deploy. Pastikan layanan tersebut
menyediakan **persistent volume/disk** untuk folder `data/`, karena tanpa itu
data akan hilang setiap kali aplikasi di-redeploy.

## Variabel environment

| Variabel      | Wajib | Keterangan                                                                 |
|---------------|-------|------------------------------------------------------------------------------|
| `PORT`        | Tidak | Port server, default `3000`.                                                |
| `JWT_SECRET`  | **Ya**| Kunci rahasia untuk menandatangani sesi login. Wajib diganti sebelum go-live.|
| `ADMIN_CODE`  | **Ya**| Kode akses awal untuk masuk sebagai Perangkat Desa. Wajib diganti.           |
| `CORS_ORIGIN` | Tidak | Domain yang diizinkan mengakses API. Gunakan domain resmi saat production.   |

## Ringkasan API

| Method | Endpoint                          | Akses           | Keterangan                              |
|--------|-------------------------------------|-----------------|-------------------------------------------|
| POST   | `/api/auth/register`                | Publik          | Daftar warga baru (NIK + KK)              |
| POST   | `/api/auth/login`                   | Publik          | Masuk dengan NIK                          |
| POST   | `/api/auth/admin-login`             | Publik          | Masuk sebagai Perangkat Desa              |
| GET    | `/api/auth/me`                      | Login           | Info sesi saat ini                        |
| GET    | `/api/topics`                       | Publik          | Daftar topik (filter `kategori`, `search`)|
| GET    | `/api/topics/counts`                | Publik          | Jumlah topik per kategori                 |
| GET    | `/api/topics/:id`                   | Publik          | Detail topik + balasan                    |
| POST   | `/api/topics`                       | Login           | Buat topik baru                           |
| PATCH  | `/api/topics/:id/status`            | Admin           | Ubah status pengaduan                     |
| PATCH  | `/api/topics/:id/hide`              | Admin           | Sembunyikan/tampilkan topik               |
| POST   | `/api/topics/:id/replies`           | Login           | Kirim balasan (bisa bersarang lewat `parentId`) |
| PATCH  | `/api/replies/:id/hide`             | Admin           | Sembunyikan/tampilkan balasan              |

## Catatan keamanan sebelum go-live

- **Wajib ganti** `JWT_SECRET` dan `ADMIN_CODE` di `.env` — jangan gunakan nilai contoh.
- Selalu jalankan di belakang HTTPS (lihat langkah Certbot di atas) agar NIK/KK warga tidak dikirim dalam bentuk polos di jaringan publik.
- Verifikasi NIK/KK di aplikasi ini bersifat self-registration (warga mengisi sendiri). Untuk kebutuhan resmi, pertimbangkan menghubungkan endpoint `/api/auth/register` ke sumber data kependudukan desa (Data Desa/Dukcapil) agar benar-benar tervalidasi silang.
- Backup rutin file `data/db.json`, misalnya dengan cron job harian yang menyalinnya ke penyimpanan lain.
