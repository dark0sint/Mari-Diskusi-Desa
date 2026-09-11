/* ============== KONFIGURASI ============== */
const KATEGORI = {
  infrastruktur: { label: "Pembangunan Infrastruktur", color: "#2C4A3B" },
  sosial: { label: "Kegiatan Sosial", color: "#C9A227" },
  pengaduan: { label: "Pengaduan", color: "#A64B3C" },
  saran: { label: "Saran", color: "#3A6B7A" },
};
const TOKEN_KEY = "mdd_token";
const USER_KEY = "mdd_user";

/* ============== STATE ============== */
let state = {
  session: null,
  view: "loading",
  filterKategori: "semua",
  search: "",
  currentTopicId: null,
  notifOpen: false,
  notifItems: [],
  toast: null,
  authTab: "login",
  loginError: "",
  registerError: "",
  adminError: "",
  connected: false,
};
let socket = null;

/* ============== API HELPER ============== */
async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("/api" + path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* respons kosong */ }
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan pada server.");
  return data;
}

/* ============== UTIL ============== */
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "baru saja";
  if (diff < 3600) return Math.floor(diff / 60) + " menit lalu";
  if (diff < 86400) return Math.floor(diff / 3600) + " jam lalu";
  return Math.floor(diff / 86400) + " hari lalu";
}
function catColor(k) { return (KATEGORI[k] || {}).color || "#2C4A3B"; }
function catLabel(k) { return (KATEGORI[k] || {}).label || k; }
function statusLabel(s) { return { menunggu: "Menunggu", diproses: "Diproses", selesai: "Selesai" }[s] || s; }
function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => { state.toast = null; render(); }, 3200);
}
function showError(msg) { showToast(msg); }

/* ============== SOCKET.IO (notifikasi real-time) ============== */
function connectSocket() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  if (socket) socket.disconnect();
  socket = io();
  socket.on("connect", () => {
    socket.emit("authenticate", token);
    state.connected = true;
  });
  socket.on("disconnect", () => { state.connected = false; });
  socket.on("newReply", (payload) => {
    state.notifItems = [payload, ...state.notifItems].slice(0, 30);
    showToast(escapeHtml(payload.nama) + ' membalas pada "' + escapeHtml(payload.topicTitle) + '"');
  });
}

/* ============== AUTH ============== */
async function handleLogin(nik) {
  state.loginError = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: { nik } });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    state.session = data.user;
    state.view = "home";
    render();
    connectSocket();
  } catch (e) {
    state.loginError = e.message;
    render();
  }
}

async function handleRegister(payload) {
  state.registerError = "";
  try {
    const data = await api("/auth/register", { method: "POST", body: payload });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    state.session = data.user;
    state.view = "home";
    render();
    connectSocket();
    showToast("Verifikasi berhasil. Selamat datang, " + data.user.nama + "!");
  } catch (e) {
    state.registerError = e.message;
    render();
  }
}

async function handleAdminLogin(code) {
  state.adminError = "";
  try {
    const data = await api("/auth/admin-login", { method: "POST", body: { code } });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    state.session = data.user;
    state.view = "home";
    render();
    connectSocket();
  } catch (e) {
    state.adminError = e.message;
    render();
  }
}

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (socket) socket.disconnect();
  state.session = null;
  state.view = "login";
  state.notifItems = [];
  state.notifOpen = false;
  render();
}

/* ============== TOPIK & BALASAN ============== */
async function handleCreateTopic(payload) {
  try {
    const data = await api("/topics", { method: "POST", body: payload });
    state.view = "detail";
    state.currentTopicId = data.topic.id;
    render();
    showToast("Diskusi berhasil dipublikasikan.");
  } catch (e) {
    showError(e.message);
  }
}
async function handleAddReply(topicId, parentId, isi) {
  if (!isi.trim()) return;
  try {
    await api(`/topics/${topicId}/replies`, { method: "POST", body: { isi, parentId } });
    await loadDetail();
  } catch (e) {
    showError(e.message);
  }
}
async function handleChangeStatus(topicId, status) {
  try {
    await api(`/topics/${topicId}/status`, { method: "PATCH", body: { status } });
    showToast("Status pengaduan diperbarui: " + statusLabel(status));
    await loadDetail();
  } catch (e) { showError(e.message); }
}
async function handleHideTopic(topicId) {
  try { await api(`/topics/${topicId}/hide`, { method: "PATCH" }); await loadDetail(); }
  catch (e) { showError(e.message); }
}
async function handleHideReply(replyId) {
  try { await api(`/replies/${replyId}/hide`, { method: "PATCH" }); await loadDetail(); }
  catch (e) { showError(e.message); }
}

/* ============== RENDER: SHELL ============== */
function render() {
  const app = document.getElementById("app");
  if (!state.session) {
    app.innerHTML = renderAuth();
    bindAuthEvents();
    return;
  }
  app.innerHTML = `
    ${renderTopbar()}
    <div class="main-wrap">
      ${renderSidebar()}
      <div class="content">${renderContent()}</div>
    </div>
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindShellEvents();
}

function renderTopbar() {
  const s = state.session;
  return `
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark">MD</div>
      <div>
        <div class="brand-text">Mari Diskusi Desa</div>
        <div class="brand-sub">Ruang bicara resmi warga &amp; perangkat desa</div>
      </div>
    </div>
    <div class="topbar-right" style="position:relative;">
      <button class="icon-btn" id="btnNotif" title="Notifikasi">
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        ${state.notifItems.length ? `<span class="badge-dot">${state.notifItems.length > 9 ? "9+" : state.notifItems.length}</span>` : ""}
      </button>
      ${state.notifOpen ? renderNotifPanel() : ""}
      <div class="user-chip">
        ${s.role === "admin" ? `<span class="role-tag">PERANGKAT DESA</span>` : `<span class="verified-check" title="Warga terverifikasi">&#10003;</span>`}
        <span>${escapeHtml(s.nama)}</span>
      </div>
      <button class="logout-link" id="btnLogout">Keluar</button>
    </div>
  </div>`;
}

function renderNotifPanel() {
  if (!state.notifItems.length) {
    return `<div class="notif-panel"><div class="notif-empty">Belum ada notifikasi baru.</div></div>`;
  }
  return `<div class="notif-panel">
    ${state.notifItems.map((n) => `
      <div class="notif-item" data-topic="${n.topicId}">
        <strong>${escapeHtml(n.nama)}</strong> membalas pada "<em>${escapeHtml(n.topicTitle)}</em>"<br>
        <span style="color:var(--ink-soft)">${escapeHtml((n.isi || "").slice(0, 70))}${(n.isi || "").length > 70 ? "…" : ""}</span>
      </div>`).join("")}
  </div>`;
}

function renderSidebar() {
  const cats = Object.entries(KATEGORI);
  return `
  <div class="sidebar">
    <button class="new-topic-btn" id="btnNewTopic">+ Buat Diskusi Baru</button>
    <div style="height:20px"></div>
    <h3>Kategori Topik</h3>
    <ul class="cat-list">
      <li><button class="cat-btn ${state.filterKategori === "semua" ? "active" : ""}" data-cat="semua">Semua Topik</button></li>
      ${cats.map(([k, v]) => `
        <li><button class="cat-btn ${state.filterKategori === k ? "active" : ""}" style="--cat-color:${v.color}" data-cat="${k}">
          <span><span class="cat-swatch"></span>${v.label}</span>
        </button></li>
      `).join("")}
    </ul>
    ${state.session.role === "admin" ? `
      <h3>Perangkat Desa</h3>
      <div style="font-size:13px;color:var(--ink-soft);line-height:1.6;">
        Anda masuk sebagai admin. Tombol moderasi akan muncul pada setiap topik &amp; balasan.
      </div>` : ""}
  </div>`;
}

function renderContent() {
  if (state.view === "new_topic") return renderNewTopicForm();
  if (state.view === "detail") return `<div id="detailHost">Memuat…</div>`;
  return `<div id="homeHost">Memuat…</div>`;
}

/* ============== RENDER: HOME ============== */
async function loadHome() {
  const host = document.getElementById("homeHost");
  if (!host) return;
  try {
    const params = new URLSearchParams();
    if (state.filterKategori !== "semua") params.set("kategori", state.filterKategori);
    if (state.search.trim()) params.set("search", state.search.trim());
    const [{ topics }] = await Promise.all([api("/topics?" + params.toString())]);

    host.innerHTML = `
      <div class="content-header">
        <h1>${state.filterKategori === "semua" ? "Semua Diskusi" : catLabel(state.filterKategori)}</h1>
      </div>
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Cari judul atau isi diskusi…" value="${escapeHtml(state.search)}">
      </div>
      ${topics.length === 0 ? `
        <div class="empty-state">
          <div class="display">Belum ada diskusi di sini</div>
          <div>Jadilah warga pertama yang membuka pembicaraan pada kategori ini.</div>
        </div>` :
        topics.map((t) => `
          <div class="topic-row" style="--cat-color:${catColor(t.kategori)}" data-topic="${t.id}">
            <div class="topic-main">
              <div class="topic-toprow">
                <span class="cat-label">${catLabel(t.kategori)}</span>
                ${t.status ? `<span class="stamp ${t.status}">${statusLabel(t.status)}</span>` : ""}
                ${t.hidden ? `<span class="hidden-note">(disembunyikan)</span>` : ""}
              </div>
              <div class="topic-title">${escapeHtml(t.judul)}</div>
              <div class="topic-excerpt">${escapeHtml(t.isi)}</div>
              <div class="topic-meta">
                <span>${escapeHtml(t.penulisNama)}</span><span>·</span>
                <span>${timeAgo(t.createdAt)}</span><span>·</span>
                <span>${t.replyCount} balasan</span>
              </div>
            </div>
          </div>
        `).join("")
      }
    `;
    document.getElementById("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      loadHome();
    });
    document.querySelectorAll(".topic-row").forEach((row) => {
      row.addEventListener("click", () => {
        state.currentTopicId = row.dataset.topic;
        state.view = "detail";
        render();
      });
    });
  } catch (e) {
    host.innerHTML = `<div class="empty-state">Gagal memuat diskusi: ${escapeHtml(e.message)}</div>`;
  }
}

/* ============== RENDER: NEW TOPIC ============== */
function renderNewTopicForm() {
  return `
  <button class="back-link" id="backHome">&larr; Kembali</button>
  <div class="form-card">
    <h2 style="margin-bottom:18px;">Buat Diskusi Baru</h2>
    <div class="field">
      <label>Kategori</label>
      <select id="ntKategori">
        ${Object.entries(KATEGORI).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}
      </select>
      <div class="field-hint">Pilih "Pengaduan" jika ini berupa laporan/keluhan yang perlu status penanganan.</div>
    </div>
    <div class="field">
      <label>Judul</label>
      <input type="text" id="ntJudul" placeholder="Contoh: Jalan rusak di RT 03">
    </div>
    <div class="field">
      <label>Isi Diskusi</label>
      <textarea id="ntIsi" placeholder="Jelaskan secara detail…"></textarea>
    </div>
    <button class="btn btn-primary" id="btnSubmitTopic">Publikasikan</button>
  </div>`;
}

/* ============== RENDER: DETAIL ============== */
function buildReplyTree(replies) {
  const map = {};
  replies.forEach((r) => (map[r.id] = { ...r, children: [] }));
  const roots = [];
  replies.forEach((r) => {
    if (r.parentId && map[r.parentId]) map[r.parentId].children.push(map[r.id]);
    else roots.push(map[r.id]);
  });
  return roots;
}

function renderReplyNode(node, depth, isAdmin) {
  return `
  <div class="reply-item" style="margin-left:${Math.min(depth, 4) * 18}px;">
    <div class="reply-body-box">
      <div class="reply-meta">
        <span class="name-tag">${escapeHtml(node.penulisNama)}</span>
        ${node.role === "admin" ? `<span class="role-tag">PERANGKAT DESA</span>` : ""}
        <span>${timeAgo(node.createdAt)}</span>
        ${node.hidden ? `<span class="hidden-note">(disembunyikan oleh moderator)</span>` : ""}
      </div>
      <div class="reply-text">${escapeHtml(node.isi)}</div>
      <div class="reply-actions">
        <button class="link-btn" data-reply-to="${node.id}">Balas</button>
        ${isAdmin ? `<button class="link-btn" style="color:var(--clay)" data-hide-reply="${node.id}">${node.hidden ? "Tampilkan" : "Sembunyikan"}</button>` : ""}
      </div>
      <div class="reply-form-slot" data-slot-for="${node.id}"></div>
    </div>
    <div class="reply-children">
      ${node.children.sort((a, b) => a.createdAt - b.createdAt).map((c) => renderReplyNode(c, depth + 1, isAdmin)).join("")}
    </div>
  </div>`;
}

async function loadDetail() {
  const host = document.getElementById("detailHost");
  if (!host) return;
  try {
    const { topic, replies } = await api(`/topics/${state.currentTopicId}`);
    const tree = buildReplyTree(replies).sort((a, b) => a.createdAt - b.createdAt);
    const isAdmin = state.session.role === "admin";

    host.innerHTML = `
      <button class="back-link" id="backHome">&larr; Kembali ke daftar diskusi</button>
      <div class="detail-card">
        <div class="topic-toprow">
          <span class="cat-label">${catLabel(topic.kategori)}</span>
          ${topic.hidden ? `<span class="hidden-note">(topik disembunyikan)</span>` : ""}
        </div>
        <div class="detail-title">${escapeHtml(topic.judul)}</div>
        <div class="topic-meta">
          <span class="name-tag">${escapeHtml(topic.penulisNama)}</span><span>·</span><span>${timeAgo(topic.createdAt)}</span>
        </div>
        <div class="detail-body">${escapeHtml(topic.isi)}</div>
        ${topic.kategori === "pengaduan" ? `
          <div class="status-row">
            <span class="stamp ${topic.status}">${statusLabel(topic.status)}</span>
            ${isAdmin ? `
              <select class="status-select" id="statusSelect">
                <option value="menunggu" ${topic.status === "menunggu" ? "selected" : ""}>Menunggu</option>
                <option value="diproses" ${topic.status === "diproses" ? "selected" : ""}>Diproses</option>
                <option value="selesai" ${topic.status === "selesai" ? "selected" : ""}>Selesai</option>
              </select>` : ""}
          </div>` : ""}
        ${isAdmin ? `<div style="margin-top:16px;"><button class="btn-danger" id="btnHideTopic">${topic.hidden ? "Tampilkan topik" : "Sembunyikan topik"}</button></div>` : ""}
      </div>

      <div class="replies-head">${replies.length} Balasan</div>
      ${tree.map((n) => renderReplyNode(n, 0, isAdmin)).join("") || `<div class="empty-state" style="padding:20px;">Belum ada balasan. Mulai percakapan.</div>`}

      <div class="reply-form" style="margin-top:20px;">
        <textarea id="rootReplyText" placeholder="Tulis balasan Anda…"></textarea>
        <button class="btn btn-primary btn-small" id="btnRootReply">Kirim Balasan</button>
      </div>
    `;

    document.getElementById("backHome").addEventListener("click", () => { state.view = "home"; render(); });
    if (isAdmin) {
      const sel = document.getElementById("statusSelect");
      if (sel) sel.addEventListener("change", (e) => handleChangeStatus(topic.id, e.target.value));
      const hideBtn = document.getElementById("btnHideTopic");
      if (hideBtn) hideBtn.addEventListener("click", () => handleHideTopic(topic.id));
      document.querySelectorAll("[data-hide-reply]").forEach((b) => {
        b.addEventListener("click", () => handleHideReply(b.dataset.hideReply));
      });
    }
    document.getElementById("btnRootReply").addEventListener("click", () => {
      const txt = document.getElementById("rootReplyText").value;
      handleAddReply(topic.id, null, txt);
    });
    document.querySelectorAll("[data-reply-to]").forEach((b) => {
      b.addEventListener("click", () => {
        const slot = document.querySelector(`[data-slot-for="${b.dataset.replyTo}"]`);
        if (slot.innerHTML) { slot.innerHTML = ""; return; }
        slot.innerHTML = `
          <div class="reply-form">
            <textarea placeholder="Balas komentar ini…"></textarea>
            <button class="btn btn-primary btn-small">Kirim</button>
          </div>`;
        const ta = slot.querySelector("textarea");
        const sendBtn = slot.querySelector("button");
        sendBtn.addEventListener("click", () => handleAddReply(topic.id, b.dataset.replyTo, ta.value));
      });
    });
  } catch (e) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

/* ============== RENDER: AUTH ============== */
function renderAuth() {
  const tab = state.authTab;
  return `
  <div class="topbar" style="justify-content:center;">
    <div class="brand">
      <div class="brand-mark">MD</div>
      <div>
        <div class="brand-text">Mari Diskusi Desa</div>
        <div class="brand-sub">Ruang bicara resmi warga &amp; perangkat desa</div>
      </div>
    </div>
  </div>
  <div class="auth-wrap">
    <div class="auth-box">
      <div class="tabs">
        <button class="tab ${tab === "login" ? "active" : ""}" data-tab="login">Masuk Warga</button>
        <button class="tab ${tab === "register" ? "active" : ""}" data-tab="register">Daftar Warga</button>
        <button class="tab ${tab === "admin" ? "active" : ""}" data-tab="admin">Perangkat Desa</button>
      </div>
      <div class="auth-card">
        ${tab === "login" ? renderLoginTab() : tab === "register" ? renderRegisterTab() : renderAdminTab()}
      </div>
    </div>
  </div>`;
}
function renderLoginTab() {
  return `
    <div class="field">
      <label>Nomor Induk Kependudukan (NIK)</label>
      <input type="text" id="loginNik" maxlength="16" placeholder="16 digit NIK KTP">
      <div class="field-hint">NIK dicocokkan dengan data warga yang sudah terverifikasi untuk mencegah akun spam.</div>
    </div>
    <button class="btn btn-primary" style="width:100%" id="btnLogin">Masuk</button>
    ${state.loginError ? `<div class="error-text">${escapeHtml(state.loginError)}</div>` : ""}
  `;
}
function renderRegisterTab() {
  return `
    <div class="field"><label>NIK (16 digit)</label><input type="text" id="regNik" maxlength="16" placeholder="Sesuai KTP"></div>
    <div class="field"><label>Nomor Kartu Keluarga / KK (16 digit)</label><input type="text" id="regKk" maxlength="16" placeholder="Sesuai KK"></div>
    <div class="field"><label>Nama Lengkap</label><input type="text" id="regNama" placeholder="Nama sesuai KTP"></div>
    <div class="field"><label>Dusun / RT-RW</label><input type="text" id="regDusun" placeholder="Contoh: Dusun Sukamaju RT02/RW01"></div>
    <button class="btn btn-primary" style="width:100%" id="btnRegister">Daftar &amp; Verifikasi</button>
    ${state.registerError ? `<div class="error-text">${escapeHtml(state.registerError)}</div>` : ""}
  `;
}
function renderAdminTab() {
  return `
    <div class="field">
      <label>Kode Akses Perangkat Desa</label>
      <input type="password" id="adminCode" placeholder="Masukkan kode akses">
    </div>
    <button class="btn btn-primary" style="width:100%" id="btnAdminLogin">Masuk sebagai Perangkat Desa</button>
    ${state.adminError ? `<div class="error-text">${escapeHtml(state.adminError)}</div>` : ""}
  `;
}
function bindAuthEvents() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      state.authTab = t.dataset.tab;
      state.loginError = ""; state.registerError = ""; state.adminError = "";
      render();
    });
  });
  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) btnLogin.addEventListener("click", () => handleLogin(document.getElementById("loginNik").value.trim()));
  const btnRegister = document.getElementById("btnRegister");
  if (btnRegister) btnRegister.addEventListener("click", () => {
    handleRegister({
      nik: document.getElementById("regNik").value.trim(),
      kk: document.getElementById("regKk").value.trim(),
      nama: document.getElementById("regNama").value,
      dusun: document.getElementById("regDusun").value,
    });
  });
  const btnAdmin = document.getElementById("btnAdminLogin");
  if (btnAdmin) btnAdmin.addEventListener("click", () => handleAdminLogin(document.getElementById("adminCode").value));
}

/* ============== BIND: SHELL EVENTS ============== */
function bindShellEvents() {
  document.getElementById("btnLogout").addEventListener("click", handleLogout);
  document.getElementById("btnNotif").addEventListener("click", () => { state.notifOpen = !state.notifOpen; render(); });
  document.querySelectorAll(".notif-item").forEach((it) => {
    it.addEventListener("click", () => {
      state.currentTopicId = it.dataset.topic;
      state.view = "detail";
      state.notifOpen = false;
      render();
    });
  });
  document.getElementById("btnNewTopic").addEventListener("click", () => { state.view = "new_topic"; render(); });
  document.querySelectorAll(".cat-btn").forEach((b) => {
    b.addEventListener("click", () => { state.filterKategori = b.dataset.cat; state.view = "home"; render(); });
  });

  if (state.view === "home") loadHome();
  if (state.view === "detail") loadDetail();
  if (state.view === "new_topic") {
    const back = document.getElementById("backHome");
    if (back) back.addEventListener("click", () => { state.view = "home"; render(); });
    const submitBtn = document.getElementById("btnSubmitTopic");
    if (submitBtn) submitBtn.addEventListener("click", () => {
      handleCreateTopic({
        kategori: document.getElementById("ntKategori").value,
        judul: document.getElementById("ntJudul").value,
        isi: document.getElementById("ntIsi").value,
      });
    });
  }
}

/* ============== INIT ============== */
async function init() {
  const token = localStorage.getItem(TOKEN_KEY);
  const cachedUser = localStorage.getItem(USER_KEY);
  if (token && cachedUser) {
    try {
      const { user } = await api("/auth/me");
      state.session = user;
      state.view = "home";
      render();
      connectSocket();
      return;
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }
  state.view = "login";
  render();
}
init();
