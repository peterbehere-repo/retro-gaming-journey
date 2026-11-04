// Retro Gaming Journey — dashboard, library, achievements, on-demand sync.
"use strict";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

// Progress is per account, so the storage key follows the session (IDENT.stateKey()).
// Guest progress keeps the original key so nothing earned before signing in is lost.
const STORE_KEY = "rgj-state-v1";
const stateStore = () => (typeof IDENT !== "undefined" ? IDENT.stateKey() : STORE_KEY);

const DEFAULT_STATE = {
  statuses: {},      // gameId -> "playing" | "completed"
  unlocks: {},       // gameId -> { count, last, hardcore }
  lastSync: null,    // ISO timestamp
  queued: []         // rows staged locally awaiting sync (offline mirror)
};

let state = loadState();
let user = null;                 // supabase user or null (offline demo profile)
let profile = null;              // verified RetroAchievements profile of the signed-in user
let sb = null;                   // supabase client or null
let genreFilter = GENRES[0];
let platformFilter = "all";
let searchQuery = "";


function loadState(key) {
  try {
    const raw = localStorage.getItem(key || stateStore());
    if (raw) return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch (e) { /* corrupted store -> start fresh */ }
  return structuredClone(DEFAULT_STATE);
}
function saveState() { localStorage.setItem(stateStore(), JSON.stringify(state)); }

/* Adopt guest progress into a profile on its first sign-in.
   Someone who used the page before signing in has real unlocks under the guest key;
   making them sign in and then showing an empty dashboard reads as data loss. The
   guest key is copied once, never merged back, and never deleted. */
function adoptGuestState(who) {
  const target = `${STORE_KEY}:u:${String(who).toLowerCase()}`;
  if (localStorage.getItem(target)) return false;
  const guest = localStorage.getItem(STORE_KEY);
  if (!guest) return false;
  try {
    const parsed = JSON.parse(guest);
    if (!parsed || (!Object.keys(parsed.statuses || {}).length && !Object.keys(parsed.unlocks || {}).length)) return false;
    localStorage.setItem(target, guest);
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);
const gameById = (id) => ALL_GAMES.find(g => g.id === id);
const gameCount = (genre, platform) => GAME_LIBRARY[genre][platform].length;
const TOTAL_GAMES = ACTIVE_GAMES.length; // active iteration scope (120 in iteration 1)

function genreProgress(genre) {
  let done = 0;
  for (const p of ACTIVE_PLATFORMS)
    for (const t of GAME_LIBRARY[genre][p])
      if (state.statuses[gameId(genre, p, t)] === "completed") done++;
  return { done, total: TOTAL_GAMES / GENRES.length };
}
function platformProgress(platform) {
  let done = 0;
  for (const g of GENRES)
    for (const t of GAME_LIBRARY[g][platform])
      if (state.statuses[gameId(g, platform, t)] === "completed") done++;
  return { done, total: TOTAL_GAMES }; // each active platform carries the full active library
}
function overallProgress() {
  const done = Object.values(state.statuses).filter(s => s === "completed").length;
  return { done, total: TOTAL_GAMES };
}
function totalUnlocks() {
  return Object.values(state.unlocks).reduce((n, u) => n + (u.count || 0), 0);
}


/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render() {
  renderWho();
  renderDashboard();
  renderLibrary();
  renderAchievements();
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

// A one-line statement of whose dashboard this is, so a shared browser never
// misleads anyone into thinking the numbers are theirs.
function renderWho() {
  const el = $("#who-line");
  if (!el) return;
  const id = (typeof IDENT !== "undefined") ? IDENT : null;
  if (!id || !id.signedIn()) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `Showing <strong>${esc(id.name())}</strong>'s journey` +
    outOfScopeNote() +
    ` <span class="who-note">· <a href="#" id="who-switch">switch account</a></span>`;
  const sw = $("#who-switch");
  if (sw) sw.addEventListener("click", (e) => {
    e.preventDefault();
    doSignOut();
    paintAccounts();
    $("#auth-dialog").showModal();
  });
}

// Platforms are revealed one iteration at a time, so an account can have plenty of
// progress that this page does not display yet. Say so; silence looks like a bug.
function outOfScopeNote() {
  const counts = (state.ra && state.ra.consoles) || {};
  const names = { nes: "NES", snes: "SNES", genesis: "Genesis", tg16: "TurboGrafx-16", gba: "GBA", nds: "DS" };
  const outside = Object.entries(counts)
    .filter(([k, n]) => n > 0 && !ACTIVE_PLATFORMS.includes(k))
    .sort((a, b) => b[1] - a[1]);
  if (!outside.length) return "";
  const total = outside.reduce((n, [, c]) => n + c, 0);
  const list = outside.slice(0, 3).map(([k, c]) => `${names[k] || k} ${c}`).join(" · ");
  return ` <span class="who-note">· ${total} game${total === 1 ? "" : "s"} on consoles this ` +
    `iteration does not show yet (${esc(list)})</span>`;
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
  $("#platform-bars").innerHTML = ACTIVE_PLATFORMS.map(key => {
    const p = PLATFORMS[key]; const prog = platformProgress(key); return barRow(p.name, prog.done, prog.total);
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
  $("#search").placeholder = `Search ${TOTAL_GAMES} active titles...`;
  const gt = $("#genre-tabs");
  gt.innerHTML = GENRES.map(g =>
    `<button class="genre-tab ${g === genreFilter ? "active" : ""}" data-genre="${esc(g)}">${esc(g)}</button>`).join("");
  gt.querySelectorAll(".genre-tab").forEach(b =>
    b.addEventListener("click", () => { genreFilter = b.dataset.genre; renderLibrary(); }));

  const pc = $("#platform-chips");
  pc.innerHTML = [`<button class="chip ${platformFilter === "all" ? "active" : ""}" data-p="all">All platforms</button>`]
    .concat(ACTIVE_PLATFORMS.map(key => {
      const p = PLATFORMS[key];
      return `<button class="chip ${platformFilter === key ? "active" : ""}" data-p="${key}">${esc(p.short)}</button>`;
    }))
    .join("");
  pc.querySelectorAll(".chip").forEach(c =>
    c.addEventListener("click", () => { platformFilter = c.dataset.p; renderLibrary(); }));

  const q = searchQuery.trim().toLowerCase();
  const games = ALL_GAMES.filter(g =>
    g.genre === genreFilter &&
    ACTIVE_PLATFORMS.includes(g.platform) &&
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

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

// NES titles grouped by genre — the same 20-per-genre library the Journey map draws.
function achGroups() {
  const out = [];
  for (const genre of GENRES) {
    const titles = (GAME_LIBRARY[genre] && GAME_LIBRARY[genre].nes) || [];
    if (titles.length) out.push([genre, titles]);
  }
  return out;
}

function renderAchievements() {
  const host = $("#ach-groups");
  if (!host) return;
  const status = $("#ach-status");
  const all = achGroups().flatMap(([, t]) => t);
  const s = ACH.summary("nes", all);

  host.innerHTML = achGroups().map(([genre, titles]) => `
    <section class="ach-genre">
      <h3>${esc(genre)} · ${titles.length} NES titles</h3>
      <div class="ach-grid">
        ${titles.map(title => {
          const g = ACH.get("nes", title);
          if (!g) return `
            <div class="ach-game">
              <div class="gname">${esc(title)}</div>
              <div class="ach-missing">Not loaded. Press “Load from RetroAchievements”.</div>
            </div>`;
          if (!g.raId) return `
            <div class="ach-game">
              <div class="gname">${esc(title)}</div>
              <div class="ach-missing">No match on RetroAchievements for this title.</div>
            </div>`;
          const have = g.picks.length ? ACH.earnedOf("nes", title) : {};
          return `
            <div class="ach-game">
              <div class="gname">${esc(title)}</div>
              <div class="gra">RA #${g.raId}${g.raTitle && RA.normTitle(g.raTitle) !== RA.normTitle(title) ? ` · ${esc(g.raTitle)}` : ""}</div>
              <div class="ach-tiers">
                ${g.picks.length ? g.picks.map(p => `
                  <div class="ach-tier ${p.tier} ${have[p.id] ? "earned" : ""}">
                    <span class="tag">${p.tier === "intermediate" ? "mid" : p.tier}</span>
                    <div>
                      <div class="atitle">${have[p.id] ? "★ " : ""}${esc(p.title)}</div>
                      <div class="adesc">${esc(p.desc)}</div>
                      <div class="apoints">${p.points} pts · ratio ${p.ratio}${p.type ? ` · ${esc(p.type)}` : ""}</div>
                    </div>
                  </div>`).join("") : '<div class="ach-missing">RA lists no achievements for this game.</div>'}
              </div>
            </div>`;
        }).join("")}
      </div>
    </section>`).join("") || '<p class="ach-missing">No NES titles in scope.</p>';

  if (status) {
    const parts = [`${s.filled} of ${s.total} games carry three picks`];
    if (s.unmatched) parts.push(`${s.unmatched} unmatched on RA`);
    if (!s.filled) parts.push("add your RA account in Sync, then load");
    status.textContent = parts.join(" · ");
    status.className = "ach-status" + (s.filled === s.total ? " ok" : "");
  }
  // Tell the Journey map its stars may have changed.
  const f = document.getElementById("journey-frame");
  if (f && f.contentWindow) f.contentWindow.postMessage({ type: "rgj-ach" }, "*");
}

function renderSync() {
  $("#sync-last").textContent = state.lastSync ? new Date(state.lastSync).toLocaleString() : "never";
  $("#sync-queued").textContent = state.queued.length;
  // The linked volume owns the identity; the config value is only a fallback for the
  // cloud-push label when no card is linked (sdcard.js overwrites this once a marker loads).
  $("#sync-device").textContent = linkedDeviceId() || "no card linked";
  renderAuth();
  renderRA();
}

/* Header identity. There are two kinds of session — a RetroAchievements account
   (the real one, which knows the player) and a Supabase account (optional backend) —
   and the header should say which, and whose progress is on screen. */
function renderAuth() {
  const box = $("#auth-box");
  if (!box) return;
  const id = (typeof IDENT !== "undefined") ? IDENT : null;
  const raOn = !!(id && id.signedIn());

  let img = $("#auth-pic");
  if (raOn) {
    if (!img) {
      img = document.createElement("img");
      img.id = "auth-pic";
      img.className = "auth-pic";
      img.alt = "";
      box.prepend(img);
    }
    img.src = id.pic();
    img.hidden = false;
    $("#auth-status").textContent = id.name();
    $("#auth-status").className = "auth-status online";
    $("#auth-status").title = "RetroAchievements account — progress on this page is this account's";
    $("#btn-signin").textContent = "Sign out";
  } else {
    if (img) img.hidden = true;
    $("#auth-status").textContent = user ? `online · ${user.email}` : "guest";
    $("#auth-status").className = `auth-status ${user ? "online" : "offline"}`;
    $("#auth-status").title = user ? "Supabase session" : "No account — progress is stored for this browser only";
    $("#btn-signin").textContent = "Sign in";
  }
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
    // The journey map is the one panel that wants the full width of the window.
    document.querySelector("main").classList.toggle("wide", t.dataset.tab === "journey");
    document.body.classList.toggle("journey-view", t.dataset.tab === "journey");
    if (t.dataset.tab === "journey") { loadJourney(); requestAnimationFrame(sizeJourneyFrame); requestAnimationFrame(settleJourneyMap); }
  }));

// Journey maps: one per genre per platform. Each is a self-contained document with the
// world map and every game's artwork inlined as data URIs (13 MB for Action, 2 MB for
// Adventure), so none of them join the page payload until the tab is used.
const JOURNEY_MAPS = [
  {
    id: "nes-action",
    label: "NES · Action",
    platform: "NES",
    genre: "Action",
    file: "journey-map.html",
    blurb: "The NES action route as one continuous trail — twenty path points from the Contra " +
           "jungle to the final fortress, each with its own artwork and three achievement tiers.",
  },
  {
    id: "nes-adventure",
    label: "NES · Adventure",
    platform: "NES",
    genre: "Adventure",
    file: "journey-map-adventure.html",
    blurb: "The NES adventure route — Zelda to Kid Icarus across one continuous overworld, every " +
           "point standing on its own themed corner of the island, in a single clean serpentine.",
  },
];
const JOURNEY_MAP_VERSION = "iter1";
const JOURNEY_MAP_KEY = "rgj.journeyMap";

function currentJourneyMap() {
  const saved = localStorage.getItem(JOURNEY_MAP_KEY);
  return JOURNEY_MAPS.find(m => m.id === saved) || JOURNEY_MAPS[0];
}

function renderMapPicker() {
  const box = document.getElementById("map-picker");
  if (!box) return;
  const active = currentJourneyMap();
  box.innerHTML = JOURNEY_MAPS.map(m =>
    `<button class="map-pill${m.id === active.id ? " active" : ""}" data-map="${m.id}"
             role="tab" aria-selected="${m.id === active.id}">${m.label}</button>`).join("");
  box.querySelectorAll(".map-pill").forEach(btn =>
    btn.addEventListener("click", () => selectJourneyMap(btn.dataset.map)));
  const blurb = document.getElementById("map-blurb");
  if (blurb) blurb.textContent = active.blurb;
}

// A map loads the first time the Journey tab is shown, then again whenever a different one is
// picked. Nothing downloads on page load.
let journeyLoaded = false;
function loadJourney(id) {
  const map = JOURNEY_MAPS.find(m => m.id === (id || currentJourneyMap().id)) || JOURNEY_MAPS[0];
  const f = document.getElementById("journey-frame");
  if (!f || f.dataset.loaded === map.id) return;
  f.src = `${map.file}?v=${JOURNEY_MAP_VERSION}`;
  f.dataset.loaded = map.id;
  f.title = `Journey map — ${map.platform} ${map.genre}`;
  journeyLoaded = true;
}

// The map wants all the width it can get, but never more than the height on offer — a 16:9 frame
// taller than the window would cut the bottom row of path points off.
// The map runs the full width of the window, which on a 16:9 screen makes it a shade taller than a
// 1080px window. Rather than shrink it back into side padding, let the page scroll just enough that
// the frame starts at the top of the window — then the whole map sits on screen with nothing wasted.
function settleJourneyMap() {
  // The frame now fits the window, so there is nothing to scroll into place.
}


function sizeJourneyFrame() {
  const wrap = document.querySelector("#panel-journey .journey-frame-wrap");
  if (!wrap || !wrap.offsetParent) return;
  // Fit the window rather than overflow it: take whatever height is left under the header, turn
  // that into a 16:9 frame, and centre it. The Action artwork has no ocean margin, so cropping is
  // not an option — scaling down is what keeps the whole map on screen without scrolling.
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const avail = window.innerHeight - top - 10;
  const h = Math.max(320, Math.min(avail, window.innerWidth * 9 / 16));
  wrap.style.height = Math.round(h) + "px";
  wrap.style.width = Math.round(Math.min(h * 16 / 9, window.innerWidth)) + "px";
}

window.addEventListener("resize", sizeJourneyFrame);

function selectJourneyMap(id) {
  const map = JOURNEY_MAPS.find(m => m.id === id);
  if (!map) return;
  localStorage.setItem(JOURNEY_MAP_KEY, id);
  renderMapPicker();
  const panel = document.getElementById("panel-journey");
  if (panel && panel.classList.contains("active")) {
    loadJourney(id);
    // Swapping the iframe's src pulls the page back to the top; settle it again on the new map.
    requestAnimationFrame(sizeJourneyFrame);
  }
}

renderMapPicker();

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

/* ------------------------------------------------------------------ */
/* Sign-in: the RetroAchievements account is the identity              */
/* ------------------------------------------------------------------ */

function authError(msg) {
  const el = $("#auth-error");
  if (el) el.textContent = msg || "";
}

// After any successful sign-in: load that profile's progress, point the RA layer at
// it, and pull. Everything downstream keys off the session, so this is the only place
// switching accounts has to be handled.
async function enterProfile(quiet, opts) {
  const id = IDENT.current();
  if (!id) return;
  const o = opts || {};
  const adopted = adoptGuestState(id.user);
  state = loadState();
  RA.configure(id.user, id.key);
  render();
  if (!quiet) logSync(`Signed in as ${id.user}. Showing this account's progress.`, "ok");
  if (adopted) logSync("Progress from before you signed in was copied into this profile.", "ok");
  if (o.pull === false) return;
  await pullProfile({ quiet: true });
}

// One pull path, used by sign-in, by page load, and by the button in the Sync tab.
async function pullProfile(opts) {
  const o = opts || {};
  if (!RA.configured()) {
    if (!o.quiet) logSync("No RetroAchievements account on this session.", "err");
    return null;
  }
  try {
    const res = await RA.pullIntoState(ACTIVE_GAMES, state);
    saveState();
    render();
    // Which of the three picks are earned can only come from RA's per-game detail, so
    // it is fetched here for the games this account has actually played (and cached).
    await markEarnedForPlayed();
    logSync(`RA pull: ${res.applied} game${res.applied === 1 ? "" : "s"} updated ` +
      `(${res.matched} matched of ${ACTIVE_GAMES.length} in scope, ${res.scanned} rows scanned).`,
      res.applied ? "ok" : undefined);
    return res;
  } catch (err) {
    logSync(`RA pull failed: ${err.message}`, "err");
    return null;
  }
}

async function markEarnedForPlayed() {
  if (typeof ACH === "undefined" || !RA.configured()) return 0;
  const played = ACTIVE_GAMES.filter(g => ((state.unlocks || {})[g.id] || {}).count > 0);
  let marked = 0;
  for (const g of played) {
    try { const e = await ACH.ensureEarned(g.platform, g.title); marked += Object.keys(e || {}).length; }
    catch (err) { /* one game's detail must not stop the pull */ }
  }
  if (played.length) renderAchievements();
  return marked;
}

let signingIn = false;

async function doSignIn(user, key, keep) {
  if (signingIn) return false;              // double-click must not fire two verifications
  signingIn = true;
  authError("Checking the account…");
  const btn = $("#auth-submit");
  if (btn) btn.disabled = true;
  try {
    const res = await IDENT.verify(user, key);
    if (!res.ok) { authError(res.error); return false; }
    IDENT.signIn(res.profile.User, String(key).trim(), res.profile.UserPic || "");
    profile = res.profile;
    const dlg = $("#auth-dialog");
    if (dlg && dlg.open) dlg.close();
    authError("");
    $("#auth-ra-key").value = "";
    logSync(`${res.profile.User} · member since ${String(res.profile.MemberSince).slice(0, 10)} · ` +
      `${res.profile.TotalSoftcorePoints || 0} softcore points.`, "ok");
    await enterProfile(false);
    return true;
  } catch (err) {
    authError(`Sign-in failed: ${err && err.message ? err.message : err}`);
    return false;
  } finally {
    signingIn = false;
    if (btn) btn.disabled = false;
  }
}

function doSignOut() {
  const who = IDENT.signedIn() ? IDENT.name() : "";
  IDENT.signOut();
  RA.forget();
  profile = null;
  state = loadState();          // falls back to the guest store
  render();
  logSync(who ? `Signed out ${who}. That account's progress stays saved on this device.`
              : "Signed out.", "ok");
  paintAccounts();
}

// Device profiles: anyone who has signed in here before, one click back.
function paintAccounts() {
  const host = $("#auth-accounts");
  if (!host) return;
  const list = (typeof IDENT !== "undefined" ? IDENT.accounts() : []).filter(a => !IDENT.current() || a.user !== IDENT.current().user);
  if (!list.length) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '<p class="modal-note">On this device before</p>' + list.map(a => `
    <button type="button" class="btn btn-ghost btn-small account-chip" data-account="${esc(a.user)}">
      ${a.pic ? `<img src="${esc(/^https?:/.test(a.pic) ? a.pic : "https://retroachievements.org" + a.pic)}" alt="" onerror="this.remove()">` : ""}
      <span>${esc(a.user)}</span>
    </button>`).join("");
  host.querySelectorAll("[data-account]").forEach(b => b.addEventListener("click", async () => {
    const who = b.dataset.account;
    const acct = IDENT.accounts().find(a => a.user === who);
    if (!acct) return;
    await doSignIn(acct.user, acct.key);
  }));
}

$("#btn-signin").addEventListener("click", async () => {
  if (IDENT.signedIn()) { doSignOut(); return; }
  if (user && sb) { await sb.auth.signOut(); user = null; logSync("Signed out. Progress kept locally."); render(); return; }
  authError("");
  paintAccounts();
  $("#auth-dialog").showModal();
});

$("#auth-cancel").addEventListener("click", () => $("#auth-dialog").close());

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ((e.submitter && e.submitter.value) === "email") {
    const email = e.target.email.value, password = e.target.password.value;
    authError("");
    if (!sb) { authError("Email sign-in needs a Supabase backend — none is configured, so use the RetroAchievements account above."); return; }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { authError(error.message); return; }
    user = data.user;
    $("#auth-dialog").close();
    logSync(`Signed in as ${email}.`, "ok");
    render();
    return;
  }
  await doSignIn(e.target.rauser.value, e.target.rakey.value);
});

async function pushQueue() {
  if (!state.queued.length) { logSync("Queue empty — nothing to push."); return; }
  if (!sb || !user) {
    logSync(`No connection: ${state.queued.length} row(s) stay queued locally (offline-first).`, "err");
    return;
  }
  const rows = state.queued.map(r => ({
    user_id: user.id,
    device_id: linkedDeviceId() || SUPABASE_CONFIG.deviceId,
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
/* Import                                                              */
/* ------------------------------------------------------------------ */

/* Parse queue rows from any device payload: JSONL, JSON array, or one typed envelope. */
function importRows(raw, source) {
  let rows = [];
  const text = String(raw).trim().replace(/^\uFEFF/, "");
  if (!text) return 0;
  if (text.startsWith("[") || (text.startsWith("{") && text.endsWith("}") && !text.includes("\n"))) {
    try {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed.rows) ? parsed.rows
        : [parsed];
    } catch (e) { /* fall through to JSONL */ }
  }
  if (!rows.length) {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      try {
        const ev = JSON.parse(t);
        if (Array.isArray(ev.rows)) rows.push(...ev.rows);
        else if (ev.type !== "sync-ready" && ev.type !== "hello") rows.push(ev);
      } catch (e) { /* skip malformed line */ }
    }
  }

  const seen = new Set(state.queued.map(r => `${r.game_hash}|${r.achievement_id}|${r.timestamp}`));
  let added = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const game_hash = String(r.game_hash ?? r.gameHash ?? "").trim();
    const achievement_id = String(r.achievement_id ?? r.achievementId ?? "").trim();
    if (!game_hash || !achievement_id) continue;
    let timestamp = Number(r.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      const parsed = Date.parse(r.unlocked_at || "");
      timestamp = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
    }
    const hardcore = r.hardcore !== undefined ? !!r.hardcore : r.hardcore_mode !== 0;
    const key = `${game_hash}|${achievement_id}|${timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    state.queued.push({ game_hash, achievement_id, timestamp, hardcore });
    added++;
  }
  if (added) {
    saveState(); render();
    logSync(`${added} queued row${added === 1 ? "" : "s"} imported from ${source}.`, "ok");
  } else {
    logSync(`No new rows in ${source} (already queued or unreadable).`);
  }
  return added;
}

/* --- Fallback: import a queue file by hand -----------------------------------
   The folder adapter is the normal route. This covers browsers without the File
   System Access API, and any card the user would rather not grant folder access to. */
$("#btn-import-queue").addEventListener("click", () => $("#usb-file-input").click());
$("#usb-file-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    importRows(await file.text(), file.name);
  } catch (err) {
    logSync(`Could not read ${file.name}: ${err.message}`, "err");
  }
  e.target.value = "";
});


function linkedDeviceId() {
  const vols = (typeof FSA !== "undefined" && FSA.volumes) ? FSA.volumes : [];
  const ids = [...new Set(vols.map(v => v.device && v.device.device_id).filter(Boolean))];
  return ids.join(", ");
}


/* ------------------------------------------------------------------ */
/* RetroAchievements progress                                          */
/* ------------------------------------------------------------------ */

function raHint(msg, cls) {
  const el = $("#ra-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "usb-hint" + (cls ? " " + cls : "");
}

function renderRA() {
  if (typeof RA === "undefined" || !$("#ra-card")) return;
  const s = RA.summary();
  const on = IDENT.signedIn();
  // When the session owns the account, these fields are not the source of truth —
  // say so by disabling them rather than letting an edit sit there doing nothing.
  $("#ra-user").disabled = on;
  $("#ra-key").disabled = on;
  $("#btn-ra-save").disabled = on;
  $("#btn-ra-forget").disabled = on;

  if (s.configured) {
    $("#ra-user").value = s.user;
    $("#ra-key").value = "";
    $("#ra-key").placeholder = on ? "managed by your session" : "saved — leave blank to keep";
    const when = s.lastPull ? new Date(s.lastPull).toLocaleString() : "never";
    const scope = on ? `${s.user} · signed in on this device` : `${s.user} · saved for this browser`;
    raHint(`${scope} · ${s.tracked} game${s.tracked === 1 ? "" : "s"} tracked · pulled ${when}`);
    const box = $("#ra-unmatched");
    const list = (RA._state().unmatched || []);
    box.innerHTML = list.length
      ? `<li class="warn">${list.length} library title${list.length === 1 ? "" : "s"} not found on RetroAchievements:</li>` +
        list.slice(0, 12).map(t => `<li>${esc(t)}</li>`).join("") +
        (list.length > 12 ? `<li>…and ${list.length - 12} more</li>` : "")
      : "";
  } else {
    $("#ra-key").placeholder = "32-character key";
    raHint("Not signed in. Progress stays in this browser until you sign in with your RetroAchievements account.");
    $("#ra-unmatched").innerHTML = "";
  }
}

$("#btn-ra-save").addEventListener("click", async () => {
  const u = $("#ra-user").value.trim();
  const saved = RA.summary().configured ? RA._state().key : "";
  const k = $("#ra-key").value.trim() || saved;
  if (!u) return raHint("Enter your RA username.", "err");
  if (!k) return raHint("Enter your web API key.", "err");
  // Saving manually is the same act as signing in: verify, then adopt the identity.
  const ok = await doSignIn(u, k);
  if (!ok) raHint($("#auth-error").textContent || "Could not sign in with that account.", "err");
});

$("#btn-ra-forget").addEventListener("click", () => {
  const who = IDENT.signedIn() ? IDENT.name() : RA.user();
  IDENT.forgetAccount(who);
  IDENT.signOut();
  RA.forget();
  $("#ra-user").value = "";
  $("#ra-key").value = "";
  state = loadState();
  render();
  logSync("RetroAchievements account removed from this device.", "ok");
});

$("#btn-ra-pull").addEventListener("click", async () => {
  if (typeof RA === "undefined") return;
  if (!RA.configured()) return raHint("Sign in with your RetroAchievements account first.", "err");
  const btn = $("#btn-ra-pull");
  btn.disabled = true;
  raHint("Contacting RetroAchievements…");
  try {
    const res = await pullProfile({ quiet: true });
    if (!res) return raHint("Pull failed — see the sync log.", "err");
    if (res.applied === 0 && res.matched === 0)
      raHint("Nothing matched. Check the username — that account may have no progress.", "warn");
    else renderRA();
  } finally {
    btn.disabled = false;
  }
});


/* ------------------------------------------------------------------ */
/* Achievements tab                                                    */
/* ------------------------------------------------------------------ */

function achHint(msg, cls) {
  const el = $("#ach-status");
  if (!el) return;
  el.textContent = msg;
  el.className = `ach-status ${cls || ""}`.trim();
}

$("#ach-load").addEventListener("click", async () => {
  if (!RA.configured()) return achHint("Sign in with your RetroAchievements account first — the button in the top right.", "err");
  const btn = $("#ach-load");
  btn.disabled = true;
  const groups = achGroups();
  try {
    for (const [genre, titles] of groups) {
      achHint(`Fetching ${genre}…`);
      await ACH.ensure("nes", titles, {
        onProgress: (done, total) => total && achHint(`${genre}: ${done}/${total}…`)
      });
      renderAchievements();
    }
    // Only games the player has actually touched can have earned picks; skip the rest.
    const played = [];
    for (const [genre, titles] of groups)
      for (const t of titles) {
        const id = gameId(genre, "nes", t);
        if (state.unlocks[id] && state.unlocks[id].count > 0) played.push(t);
      }
    if (played.length) {
      achHint(`Reading your earned achievements (${played.length} played title${played.length === 1 ? "" : "s"})…`);
      for (const t of played) { try { await ACH.ensureEarned("nes", t); } catch (e) { /* leave unmarked */ } }
    }
    renderAchievements();
    logSync(`Achievements loaded: ${ACH.summary("nes", groups.flatMap(([, t]) => t)).filled} NES titles now carry three picks.`, "ok");
  } catch (err) {
    achHint(`Load failed: ${err.message}`, "err");
  } finally {
    btn.disabled = false; renderAchievements();
  }
});

$("#ach-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(ACH.dump(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ra-achievements.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

// A fully-fetched cache can be committed as data/ra-achievements.json, so a first-time
// visitor sees all three picks with no API key and no requests.
(async function hydrateBundled() {
  try {
    const r = await fetch("data/ra-achievements.json", { cache: "no-cache" });
    if (r.ok) { const added = await ACH.hydrate(await r.json()); if (added) renderAchievements(); }
  } catch (e) { /* file:// or not committed yet — nothing to do */ }
})();

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

initBackend();
render();
renderRA();

/* Resume the session, if there is one. A stored key can be revoked, and a page that
   silently shows an empty dashboard is indistinguishable from lost progress — so the
   key is revalidated before it is trusted, and says so when it is not. */
(async function bootIdentity() {
  if (typeof IDENT === "undefined" || !IDENT.signedIn()) return;
  const who = IDENT.name();
  const status = await IDENT.revalidate();
  if (status === "invalid") {
    RA.forget();
    state = loadState();
    render();
    logSync(`The saved key for ${who} is no longer valid — sign in again.`, "err");
    return;
  }
  if (status === "offline") {
    RA.configure(IDENT.name(), IDENT.current().key);
    state = loadState();
    render();
    logSync(`Offline — showing saved progress for ${who}. Achievements will refresh when the connection returns.`, "err");
    return;
  }
  await enterProfile(true);
})();
