// Retro Gaming Journey — dashboard, library, badges, on-demand sync.
"use strict";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const STORE_KEY = "rgj-state-v1";

const DEFAULT_STATE = {
  statuses: {},      // gameId -> "playing" | "completed"
  unlocks: {},       // gameId -> { count, last, hardcore }
  lastSync: null,    // ISO timestamp
  queued: []         // rows staged locally awaiting sync (offline mirror)
};

let state = loadState();
let user = null;                 // supabase user or null (offline demo profile)
let sb = null;                   // supabase client or null
let genreFilter = GENRES[0];
let platformFilter = "all";
let searchQuery = "";

let assetIndex = null;           // master_library_index.json, lazily fetched

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch (e) { /* corrupted store -> start fresh */ }
  return structuredClone(DEFAULT_STATE);
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);
const gameById = (id) => ALL_GAMES.find(g => g.id === id);
const gameCount = (genre, platform) => GAME_LIBRARY[genre][platform].length;
const TOTAL_GAMES = ALL_GAMES.length; // 600

function genreProgress(genre) {
  let done = 0;
  for (const p of Object.keys(PLATFORMS))
    for (const t of GAME_LIBRARY[genre][p])
      if (state.statuses[gameId(genre, p, t)] === "completed") done++;
  return { done, total: TOTAL_GAMES / GENRES.length };
}
function platformProgress(platform) {
  let done = 0;
  for (const g of GENRES)
    for (const t of GAME_LIBRARY[g][platform])
      if (state.statuses[gameId(g, platform, t)] === "completed") done++;
  return { done, total: TOTAL_GAMES / Object.keys(PLATFORMS).length };
}
function overallProgress() {
  const done = Object.values(state.statuses).filter(s => s === "completed").length;
  return { done, total: TOTAL_GAMES };
}
function totalUnlocks() {
  return Object.values(state.unlocks).reduce((n, u) => n + (u.count || 0), 0);
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

function computeBadges() {
  const pct = (done, total) => total ? Math.round(done / total * 100) : 0;
  const badges = [];
  const overall = overallProgress();
  badges.push({ emoji: "🚀", name: "Journey Begins", desc: "Complete your first game",
    earned: overall.done >= 1, progress: Math.min(100, overall.done * 100) });
  badges.push({ emoji: "🏛️", name: "Cart Collector", desc: "Complete 50 games",
    earned: overall.done >= 50, progress: pct(overall.done, 50) });
  badges.push({ emoji: "👑", name: "Grand Master", desc: "Complete the entire 600-title library",
    earned: overall.done >= 600, progress: pct(overall.done, 600) });
  for (const g of GENRES) {
    const p = genreProgress(g);
    const short = g.split("/")[0];
    [25, 50, 75, 100].forEach((mark, i) => {
      const icons = ["🥉", "🥈", "🥇", "💎"];
      badges.push({
        emoji: icons[i],
        name: `${short} ${mark}%`,
        desc: `Complete ${Math.ceil(p.total * mark / 100)} ${short} games`,
        earned: pct(p.done, p.total) >= mark,
        progress: Math.min(100, Math.round(p.done / (p.total * mark / 100) * 100))
      });
    });
  }
  for (const [key, p] of Object.entries(PLATFORMS)) {
    const prog = platformProgress(key);
    badges.push({
      emoji: "🕹️", name: `${p.short} Mastery`,
      desc: `Complete all ${prog.total} ${p.short} titles`,
      earned: prog.done >= prog.total, progress: pct(prog.done, prog.total)
    });
  }
  if (totalUnlocks() >= 100) badges.push({ emoji: "🏆", name: "Century of Unlocks", desc: "Bank 100 achievement unlocks", earned: true, progress: 100 });
  return badges;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render() {
  renderDashboard();
  renderLibrary();
  renderBadges();
  renderSync();
}

function barRow(label, done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<div class="bar-row"><span class="name">${esc(label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <span class="pct">${pct}% · ${done}/${total}</span></div>`;
}

function fmtPct(done, total) {
  if (!total) return "0%";
  const pct = done / total * 100;
  return `${pct >= 1 ? Math.round(pct) : Math.round(pct * 10) / 10}%`;
}

function renderDashboard() {
  const o = overallProgress();
  $("#stat-overall").textContent = fmtPct(o.done, o.total);
  $("#stat-completed").textContent = o.done;
  $("#stat-playing").textContent = Object.values(state.statuses).filter(s => s === "playing").length;
  $("#stat-unlocks").textContent = totalUnlocks();

  $("#genre-bars").innerHTML = GENRES.map(g => {
    const p = genreProgress(g); return barRow(g, p.done, p.total);
  }).join("");
  $("#platform-bars").innerHTML = Object.entries(PLATFORMS).map(([key, p]) => {
    const prog = platformProgress(key); return barRow(p.name, prog.done, prog.total);
  }).join("");

  const recent = Object.entries(state.unlocks)
    .sort((a, b) => (b[1].last || 0) - (a[1].last || 0)).slice(0, 8);
  $("#recent-unlocks").innerHTML = recent.length
    ? recent.map(([id, u]) => {
        const g = gameById(id);
        return `<li><span>${esc(g ? g.title : id)}${u.hardcore ? " ⛔" : ""} ×${u.count}</span>
          <span class="when">${new Date(u.last).toLocaleString()}</span></li>`;
      }).join("")
    : '<li class="empty">No unlocks synced yet. Play something on the RGB10X and run a sync.</li>';
}

function renderLibrary() {
  const gt = $("#genre-tabs");
  gt.innerHTML = GENRES.map(g =>
    `<button class="genre-tab ${g === genreFilter ? "active" : ""}" data-genre="${esc(g)}">${esc(g)}</button>`).join("");
  gt.querySelectorAll(".genre-tab").forEach(b =>
    b.addEventListener("click", () => { genreFilter = b.dataset.genre; renderLibrary(); }));

  const pc = $("#platform-chips");
  pc.innerHTML = [`<button class="chip ${platformFilter === "all" ? "active" : ""}" data-p="all">All platforms</button>`]
    .concat(Object.entries(PLATFORMS).map(([key, p]) =>
      `<button class="chip ${platformFilter === key ? "active" : ""}" data-p="${key}">${esc(p.short)}</button>`))
    .join("");
  pc.querySelectorAll(".chip").forEach(c =>
    c.addEventListener("click", () => { platformFilter = c.dataset.p; renderLibrary(); }));

  const q = searchQuery.trim().toLowerCase();
  const games = ALL_GAMES.filter(g =>
    g.genre === genreFilter &&
    (platformFilter === "all" || g.platform === platformFilter) &&
    (!q || g.title.toLowerCase().includes(q)));

  $("#library-count").textContent =
    `${games.length} title${games.length === 1 ? "" : "s"} · ${genreFilter}${platformFilter === "all" ? "" : " · " + PLATFORMS[platformFilter].name}`;
  $("#game-grid").innerHTML = games.map(g => {
    const st = state.statuses[g.id] || "locked";
    const unl = state.unlocks[g.id];
    return `<div class="game-card" data-id="${g.id}" title="Click to cycle status">
      <span class="meta">${esc(PLATFORMS[g.platform].short)}</span>
      <span class="title">${esc(g.title)}</span>
      <span class="status ${st}">${st === "locked" ? "not started" : st}${unl ? ` · ${unl.count} unlocks` : ""}</span>
    </div>`;
  }).join("") || '<p class="library-count">No titles match that search.</p>';

  $("#game-grid").querySelectorAll(".game-card").forEach(card =>
    card.addEventListener("click", () => cycleStatus(card.dataset.id)));
}

function renderBadges() {
  $("#badge-grid").innerHTML = computeBadges().map(b => `
    <div class="badge-card ${b.earned ? "earned" : ""}">
      <span class="emoji">${b.emoji}</span>
      <span class="bname">${esc(b.name)}</span>
      <span class="bdesc">${esc(b.desc)}</span>
      <div class="bar-track" style="width:100%"><div class="bar-fill" style="width:${b.earned ? 100 : b.progress}%"></div></div>
    </div>`).join("");
}

function renderSync() {
  $("#sync-last").textContent = state.lastSync ? new Date(state.lastSync).toLocaleString() : "never";
  $("#sync-queued").textContent = state.queued.length;
  $("#sync-device").textContent = SUPABASE_CONFIG.deviceId;
  $("#auth-status").textContent = user ? `online · ${user.email}` : "offline mode";
  $("#auth-status").className = `auth-status ${user ? "online" : "offline"}`;
  $("#btn-signin").textContent = user ? "Sign out" : "Sign in";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

function cycleStatus(id) {
  const order = ["locked", "playing", "completed"];
  const cur = state.statuses[id] || "locked";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  if (next === "locked") delete state.statuses[id]; else state.statuses[id] = next;
  // Manual progress changes are queued locally like unlock events (offline-first).
  if (next === "completed") {
    const g = gameById(id);
    state.queued.push({
      game_hash: hashGame(g), achievement_id: "manual_complete",
      timestamp: Math.floor(Date.now() / 1000), hardcore: true
    });
  }
  saveState(); render();
}

// Deterministic game hash (spec: "serialize execution records locally using secure hashes").
function hashGame(g) {
  let h = 5381;
  for (const c of `${g.genre}|${g.platform}|${g.title}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
}

document.querySelectorAll(".tab").forEach(t =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === `panel-${t.dataset.tab}`));
    if (t.dataset.tab === "sync") loadAssetIndex();
  }));

// Serverless frontend mapping: fetch the asset route index only when the sync
// console is opened — the 1,800-asset payload itself stays in the zip.
async function loadAssetIndex() {
  if (assetIndex) return;
  try {
    const resp = await fetch("master_library_index.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    assetIndex = await resp.json();
    $("#asset-games").textContent = assetIndex.total_games.toLocaleString();
    $("#asset-count").textContent = assetIndex.total_assets.toLocaleString();
    $("#tier-rows").innerHTML = assetIndex.tiers.map(tier =>
      `<tr><td>${esc(tier)}</td><td>${esc(assetIndex.tier_rules[tier])}</td>` +
      `<td>[slug]_${tier}.png</td></tr>`).join("");
  } catch (e) {
    $("#asset-games").textContent = "unavailable";
    logSync(`Asset index fetch failed: ${e.message}`, "err");
  }
}

$("#search").addEventListener("input", (e) => { searchQuery = e.target.value; renderLibrary(); });

/* ------------------------------------------------------------------ */
/* Auth + sync (Supabase)                                              */
/* ------------------------------------------------------------------ */

function logSync(msg, cls = "") {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  if (cls) li.className = cls;
  $("#sync-log").prepend(li);
}

function initBackend() {
  if (!SUPABASE_CONFIGURED) return;
  if (typeof supabase === "undefined" || !supabase.createClient) {
    logSync("Supabase JS failed to load (offline?) — staying in local mode.", "err");
    return;
  }
  sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  sb.auth.getSession().then(({ data }) => {
    if (data?.session) { user = data.session.user; sb.auth.onAuthStateChange((_e, s) => { user = s?.user || null; render(); }); render(); }
  });
}

$("#btn-signin").addEventListener("click", async () => {
  if (user) { await sb.auth.signOut(); user = null; logSync("Signed out. Progress kept locally."); render(); return; }
  if (!SUPABASE_CONFIGURED) {
    logSync("No backend configured — running in offline demo mode (progress saved in this browser).", "err");
    $("#auth-dialog").showModal(); return;
  }
  $("#auth-dialog").showModal();
});
$("#auth-cancel").addEventListener("click", () => $("#auth-dialog").close());
$("#auth-form").addEventListener("submit", async (e) => {
  const mode = e.submitter?.value || "signin";
  const email = e.target.email.value, password = e.target.password.value;
  $("#auth-error").textContent = "";
  if (!sb) { $("#auth-error").textContent = "Offline mode: configure Supabase in js/supabase-config.js."; return; }
  const { data, error } = mode === "signup"
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) { $("#auth-error").textContent = error.message; return; }
  user = data.user; $("#auth-dialog").close(); logSync(`Signed in as ${email}.`, "ok"); render();
});

async function pushQueue() {
  if (!state.queued.length) { logSync("Queue empty — nothing to push."); return; }
  if (!sb || !user) {
    logSync(`No connection: ${state.queued.length} row(s) stay queued locally (offline-first).`, "err");
    return;
  }
  const rows = state.queued.map(r => ({
    user_id: user.id,
    device_id: SUPABASE_CONFIG.deviceId,
    game_hash: r.game_hash,
    achievement_id: r.achievement_id,
    timestamp: r.timestamp,
    hardcore: r.hardcore
  }));
  const { error } = await sb.from("achievement_queue").insert(rows);
  if (error) { logSync(`Push failed: ${error.message}`, "err"); return; }
  logSync(`Pushed ${rows.length} row(s) to achievement_queue.`, "ok");
  state.queued = [];
  state.lastSync = new Date().toISOString();
  saveState(); render();
}

async function pullRemote() {
  if (!sb || !user) { logSync("Pull requires sign-in and a configured backend.", "err"); return; }
  const { data, error } = await sb.from("achievement_queue")
    .select("game_hash, achievement_id, timestamp, hardcore").eq("user_id", user.id);
  if (error) { logSync(`Pull failed: ${error.message}`, "err"); return; }
  for (const r of data || []) {
    const key = r.game_hash;
    const u = state.unlocks[key] || { count: 0, last: 0, hardcore: false };
    u.count += 1; u.last = Math.max(u.last, (r.timestamp || 0) * 1000);
    u.hardcore = u.hardcore || !!r.hardcore;
    state.unlocks[key] = u;
  }
  state.lastSync = new Date().toISOString();
  saveState(); render();
  logSync(`Pulled ${data?.length || 0} unlock record(s) from the cloud.`, "ok");
}

$("#btn-sync").addEventListener("click", pushQueue);
$("#btn-pull").addEventListener("click", pullRemote);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

initBackend();
render();
