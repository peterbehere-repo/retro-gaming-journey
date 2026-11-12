// Retro Gaming Journey — dashboard, library, achievements, on-demand sync.
"use strict";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

// Progress is per account, so the storage key follows the session (IDENT.stateKey()).
// There is no guest view: signed out means no dashboard at all (see locked() / applyGate()).
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

/* Before caches were per account, this browser kept one shared copy of "what is earned".
   The first account to sign in here after that change inherits it (a copy — the originals
   stay on disk, never merged back), and a marker records who inherited it so a later
   account on the same browser cannot pick up the same data a second time. */
const LEGACY_CLAIM = "rgj-legacy-claim-v1";
function adoptLegacyCaches(who) {
  const u = String(who).toLowerCase();
  let claimed = null;
  try { claimed = localStorage.getItem(LEGACY_CLAIM); } catch (e) { return []; }
  if (claimed && claimed !== u) return [];
  const copied = [];
  for (const base of ["rgj-state-v1", "rgj-ach-earned-v1", "rgj-ach-fetched-v1"]) {
    const target = `${base}:u:${u}`;
    if (localStorage.getItem(target)) continue;             // already has its own history
    const legacy = localStorage.getItem(base);
    if (!legacy) continue;
    localStorage.setItem(target, legacy);                    // copy, never move
    copied.push(base);
  }
  if (!claimed) localStorage.setItem(LEGACY_CLAIM, u);
  return copied;
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
  renderAuth();
  applyGate();
  if (locked()) return;           // nothing to draw: the gate is the whole page
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
  if (locked()) return;          // signed out: the gate is the whole page
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
  if (locked()) return;          // signed out: the gate is the whole page
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
  if (locked()) return;          // signed out: the gate is the whole page
  const host = $("#ach-groups");
  if (!host) return;
  const status = $("#ach-status");
  const all = achGroups().flatMap(([, t]) => t);
  const s = ACH.summary("nes", all);

  // Any Action title with a diorama gets a way in from its card as well as the wing.
  const diBtn = t => (window.DIORAMA && DIORAMA.has(t))
    ? `<button type="button" class="ach-di" data-di="${esc(t)}" title="Open the ${esc(t)} diorama">&#9672; diorama</button>`
    : "";

  host.innerHTML = achGroups().map(([genre, titles]) => `
    <section class="ach-genre">
      <h3>${esc(genre)} · ${titles.length} NES titles</h3>
      <div class="ach-grid">
        ${titles.map(title => {
          const g = ACH.get("nes", title);
          if (!g) return `
            <div class="ach-game">
              <div class="gname"><span>${esc(title)}</span>${diBtn(title)}</div>
              <div class="ach-missing">Not loaded. Press “Load from RetroAchievements”.</div>
            </div>`;
          if (!g.raId) return `
            <div class="ach-game">
              <div class="gname"><span>${esc(title)}</span>${diBtn(title)}</div>
              <div class="ach-missing">No match on RetroAchievements for this title.</div>
            </div>`;
          const have = g.picks.length ? ACH.earnedOf("nes", title) : {};
          return `
            <div class="ach-game">
              <div class="gname"><span>${esc(title)}</span>${diBtn(title)}</div>
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

  host.querySelectorAll(".ach-di").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    if (window.DIORAMA) DIORAMA.open(DIORAMA.GAMES.indexOf(b.dataset.di));
  }));

  // The wing reads the same three picks; remount once, then tell it the stars may have moved.
  if (window.DIORAMA) {
    DIORAMA.mount($("#diorama-wing"));
    DIORAMA.refresh();
  }

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
  if (locked()) return;          // signed out: the gate is the whole page
  $("#sync-last").textContent = state.lastSync ? new Date(state.lastSync).toLocaleString() : "never";
  $("#sync-queued").textContent = state.queued.length;
  // The linked volume owns the identity; the config value is only a fallback for the
  // cloud-push label when no card is linked (sdcard.js overwrites this once a marker loads).
  $("#sync-device").textContent = linkedDeviceId() || "none linked yet";
  renderAuth();
  renderRA();
}

/* Header identity. There are two kinds of session — a RetroAchievements account
   (the real one, which knows the player) and a Supabase account (optional backend) —
   and the header should say which, and whose progress is on screen.
   Signed out there is no identity and no "guest": the status chip is hidden and the
   button offers a plain "Sign in". */
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
    img.hidden = !id.pic();          // no avatar on the account: show no broken image
    $("#auth-status").hidden = false;
    $("#auth-status").textContent = id.name();
    $("#auth-status").className = "auth-status online";
    $("#auth-status").title = "RetroAchievements account — progress on this page is this account's";
    $("#btn-signin").textContent = "Sign out";
  } else {
    if (img) img.hidden = true;
    const chip = $("#auth-status");
    chip.textContent = "";
    chip.hidden = true;                       // no guest chip: signed out shows nothing
    $("#btn-signin").textContent = "Sign in";
  }
}

/* ------------------------------------------------------------------ */
/* The gate: signed out means no progress on screen at all             */
/* ------------------------------------------------------------------ */

// True when there is no verified RetroAchievements session. A Supabase session alone
// is not an identity — it cannot read RA progress, so it does not unlock the page.
function locked() {
  return !(typeof IDENT !== "undefined" && IDENT.signedIn());
}

// Locking hides the tabs and panels and raises the sign-in card. It also drops the
// Journey map's document, so a signed-out page holds no progress anywhere — not in the
// DOM, not in a cached iframe.
let gated = false;
function applyGate() {
  const lock = locked();
  document.body.classList.toggle("locked", lock);
  const gate = $("#auth-gate");
  if (gate) gate.hidden = !lock;
  if (!lock) { gated = false; return; }
  paintAccounts();
  if (gated) return;            // already blanked; nothing to do on re-render
  gated = true;

  // Wipe what a previous session left on screen. Belt and braces: the panels are hidden
  // by CSS as well, so this is not what keeps progress private — it keeps it out of the
  // page source too.
  const f = $("#journey-frame");
  if (f) {
    if (f.dataset.loaded) { f.dataset.loaded = ""; f.removeAttribute("src"); }
    setMapLoading(false);
  }
  const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  set("#stat-overall", "—"); set("#stat-completed", "—");
  set("#stat-playing", "—"); set("#stat-unlocks", "—");
  const clear = (sel) => { const el = $(sel); if (el) el.innerHTML = ""; };
  clear("#genre-bars"); clear("#platform-bars"); clear("#recent-unlocks");
  clear("#game-grid"); clear("#ach-groups"); clear("#sync-log");
  set("#library-count", "Sign in to see the library.");
  set("#who-line", "");
  const who = $("#who-line"); if (who) who.hidden = true;
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
    marker: "Retro Gaming Journey",
    sea: "#059299",
    blurb: "The NES action route as one continuous trail — twenty path points from the Contra " +
           "jungle to the final fortress, each with its own artwork and three achievement tiers.",
  },
  {
    id: "nes-adventure",
    label: "NES · Adventure",
    platform: "NES",
    genre: "Adventure",
    file: "journey-map-adventure.html",
    marker: "Journey Map 4",
    sea: "#2ea7af",
    blurb: "The NES adventure route — Zelda to Kid Icarus across one continuous overworld, every " +
           "point standing on its own themed corner of the island, in a single clean serpentine.",
  },
  {
    id: "nes-rpg",
    label: "NES · RPG",
    platform: "NES",
    genre: "RPG",
    file: "journey-map-rpg.html",
    marker: "Journey Map 5",
    sea: "#388f99",
    blurb: "The NES role-playing route — Final Fantasy to Tombs & Treasure over a fantasy overworld " +
           "of castles, dragon keeps, desert palaces and dungeon mazes, one region per game.",
  },
  {
    id: "nes-puzzle",
    label: "NES · Puzzle",
    platform: "NES",
    genre: "Puzzle",
    file: "journey-map-puzzle.html",
    marker: "Journey Map 6",
    sea: "#299ba5",
    blurb: "The NES puzzle route — Tetris to Bomberman II through a world of block towers, capsule " +
           "labs, cookie factories and bomb yards, each puzzle palace its own region.",
  },
  {
    id: "nes-vn",
    label: "NES · Adventure Games",
    platform: "NES",
    genre: "Visual Novels / Point & Click",
    file: "journey-map-vn.html",
    marker: "Journey Map 7",
    sea: "#179baa",
    blurb: "The NES point-and-click route — Shadowgate to Home Alone across a mystery island of " +
           "haunted mansions, neon crime cities, jungle temples and time-travel clock towers.",
  },
];
const JOURNEY_MAP_VERSION = "iter25";
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
  setMapLoading(true);
  f.dataset.loaded = map.id;
  f.dataset.retried = "";
  f.src = `${map.file}?v=${JOURNEY_MAP_VERSION}`;
  f.title = `Journey map — ${map.platform} ${map.genre}`;
  // Never leave the spinner up forever if a load event never lands.
  clearTimeout(loadJourney.timer);
  loadJourney.timer = setTimeout(() => {
    if (f.dataset.loaded === map.id) setMapLoading(false);
  }, 30000);
  const wrap = f.parentElement;
  if (wrap && map.sea) wrap.style.setProperty("--sea", map.sea);
  journeyLoaded = true;
}

// The Action map is 13 MB of inlined artwork and the rest are ~2 MB, so a switch can take a while.
// Show the loader the instant the pill is clicked, and only clear it once the frame really holds the
// chosen world — comparing the document's own title catches a frame that still shows the old map.
function setMapLoading(on) {
  const wrap = document.querySelector("#panel-journey .journey-frame-wrap");
  if (wrap) wrap.classList.toggle("is-loading", !!on);
}

function journeyFrameLoaded() {
  const f = document.getElementById("journey-frame");
  if (!f) return;
  const want = JOURNEY_MAPS.find(m => m.id === f.dataset.loaded);
  if (!want) { setMapLoading(false); return; }
  // While the frame is navigating it fires load events for the old document, whose title is still
  // the previous world's. Only judge it once the frame actually sits on the requested file.
  let path = "";
  let title = "";
  try {
    path = (f.contentWindow && f.contentWindow.location.pathname) || "";
    title = (f.contentDocument && f.contentDocument.title) || "";
  } catch (e) { return; }
  if (path.indexOf(want.file) === -1) return;
  if (title && want.marker && title.indexOf(want.marker) === -1) {
    // Right world chosen, wrong document in the frame — force one cache-busted reload, then accept.
    if (f.dataset.retried !== want.id) {
      f.dataset.retried = want.id;
      setMapLoading(true);
      f.src = `${want.file}?v=${JOURNEY_MAP_VERSION}&r=${Date.now()}`;
      return;
    }
  }
  f.dataset.retried = "";
  setMapLoading(false);
  prefetchOtherMaps(f.dataset.loaded);
}

// Pull the other worlds into the HTTP cache in idle time so the next switch is instant rather than
// a second wait. Skipped on save-data connections, where bandwidth matters more than snappiness.
let prefetched = false;
function prefetchOtherMaps(activeId) {
  if (prefetched) return;
  prefetched = true;
  const conn = navigator.connection;
  if (conn && conn.saveData) return;
  const queue = JOURNEY_MAPS.filter(m => m.id !== activeId).map(m => m.file);
  const next = () => {
    const file = queue.shift();
    if (!file) return;
    fetch(`${file}?v=${JOURNEY_MAP_VERSION}`, { cache: "force-cache", priority: "low" })
      .catch(() => {})
      .finally(() => setTimeout(next, 1500));
  };
  setTimeout(next, 2500);
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
  // Fit the window rather than overflow it: take whatever height is left under the header and
  // hand it to the frame. On a desktop screen that works out at 16:9; on a phone a 16:9 strip
  // would be barely 200px tall, so portrait gets the whole height at full width instead — the
  // map pans and pinch-zooms, and a tall frame is what makes it readable.
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const avail = Math.max(320, window.innerHeight - top - 10);
  const narrow = window.innerWidth <= 820;
  const h = narrow ? avail : Math.min(avail, window.innerWidth * 9 / 16);
  wrap.style.height = Math.round(h) + "px";
  wrap.style.width = Math.round(narrow
    ? window.innerWidth - 16
    : Math.min(h * 16 / 9, window.innerWidth)) + "px";
}

window.addEventListener("resize", sizeJourneyFrame);
window.addEventListener("orientationchange", () => setTimeout(sizeJourneyFrame, 200));

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

document.getElementById("journey-frame")
  .addEventListener("load", journeyFrameLoaded);

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
/* Bind the page to an account's stored caches: first claim the pre-account history if
   that is still unowned, then read the profile's own state. Used by both the live
   (verified) and offline (unverified) boot paths, so a laptop with no network still
   shows the right player's progress — and never somebody else's. */
function bindProfile(who) {
  const adopted = adoptLegacyCaches(who);
  state = loadState();
  render();
  const active = document.querySelector(".tab.active");
  if (active && active.dataset.tab === "journey") { loadJourney(); }
  if (adopted.length) logSync("Progress this browser held before accounts were separated was copied " +
    `into this profile (${adopted.length} cache${adopted.length === 1 ? "" : "s"}).`, "ok");
  return adopted;
}

async function enterProfile(quiet, opts) {
  const id = IDENT.current();
  if (!id) return;
  const o = opts || {};
  bindProfile(id.user);
  RA.configure(id.user, id.key);
  render();
  if (!quiet) logSync(`Signed in as ${id.user}. Showing this account's progress.`, "ok");
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
    await markEarnedForPlayed({ force: !!o.force });
    logSync(`RetroAchievements: ${res.applied} game${res.applied === 1 ? "" : "s"} updated ` +
      `(${res.matched} of ${ACTIVE_GAMES.length} titles found on RA).`,
      res.applied ? "ok" : undefined);
    return res;
  } catch (err) {
    logSync(`Could not read RetroAchievements: ${err.message}`, "err");
    return null;
  }
}

async function markEarnedForPlayed(opts) {
  if (typeof ACH === "undefined" || !RA.configured()) return 0;
  const o = opts || {};
  // Every title this account has played. Their earned marks come from RA's per-game detail;
  // the fresh window in ACH.ensureEarned (2 min) means a reload is enough to see a new unlock,
  // and the Sync tab's Pull button forces the read.
  const played = ACTIVE_GAMES.filter(g => ((state.unlocks || {})[g.id] || {}).count > 0);
  let marked = 0;
  for (const g of played) {
    try {
      const e = await ACH.ensureEarned(g.platform, g.title, { force: !!o.force });
      marked += Object.keys(e || {}).length;
    }
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
  state = loadState();          // no session: an empty shell, nothing to show
  render();                     // re-locks the page (see applyGate)
  logSync(who ? `Signed out ${who}. That account's progress stays saved on this device.`
              : "Signed out.", "ok");
  paintAccounts();
}

// Device profiles: anyone who has signed in here before, one click back.
// Rendered into the dialog and into the gate card — same list, one source.
function paintAccounts() {
  const hosts = document.querySelectorAll("#auth-accounts, #gate-accounts");
  if (!hosts.length) return;
  const list = (typeof IDENT !== "undefined" ? IDENT.accounts() : [])
    .filter(a => !IDENT.current() || a.user !== IDENT.current().user);
  for (const host of hosts) {
    if (!list.length) { host.innerHTML = ""; host.hidden = true; continue; }
    host.hidden = false;
    host.innerHTML = '<p class="modal-note">On this device before</p>' + list.map(a => `
      <button type="button" class="btn btn-ghost btn-small account-chip" data-account="${esc(a.user)}">
        ${a.pic && typeof IDENT !== "undefined" ? `<img src="${esc(IDENT.picFor(a.pic))}" alt="" onerror="this.remove()">` : ""}
        <span>${esc(a.user)}</span>
      </button>`).join("");
    host.querySelectorAll("[data-account]").forEach(b => b.addEventListener("click", async () => {
      const who = b.dataset.account;
      const acct = IDENT.accounts().find(a => a.user === who);
      if (!acct) return;
      await doSignIn(acct.user, acct.key);
    }));
  }
}

function openSignIn() {
  authError("");
  paintAccounts();
  const dlg = $("#auth-dialog");
  if (dlg && !dlg.open) dlg.showModal();
}

$("#btn-signin").addEventListener("click", async () => {
  if (IDENT.signedIn()) { doSignOut(); return; }
  openSignIn();
});

$("#gate-signin").addEventListener("click", openSignIn);

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
  if (!state.queued.length) { logSync("Nothing waiting to upload."); return; }
  if (!sb || !user) {
    logSync(`No online account: ${state.queued.length} achievement(s) stay saved in this browser.`, "err");
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
  logSync(`Uploaded ${rows.length} achievement(s).`, "ok");
  state.queued = [];
  state.lastSync = new Date().toISOString();
  saveState(); render();
}

async function pullRemote() {
  if (!sb || !user) { logSync("Downloading from the cloud needs an online account.", "err"); return; }
  const { data, error } = await sb.from("achievement_queue")
    .select("game_hash, achievement_id, timestamp, hardcore").eq("user_id", user.id);
  if (error) { logSync(`Download failed: ${error.message}`, "err"); return; }
  for (const r of data || []) {
    const key = r.game_hash;
    const u = state.unlocks[key] || { count: 0, last: 0, hardcore: false };
    u.count += 1; u.last = Math.max(u.last, (r.timestamp || 0) * 1000);
    u.hardcore = u.hardcore || !!r.hardcore;
    state.unlocks[key] = u;
  }
  state.lastSync = new Date().toISOString();
  saveState(); render();
  logSync(`Downloaded ${data?.length || 0} achievement(s) from the cloud.`, "ok");
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
    logSync(`${added} achievement${added === 1 ? "" : "s"} read from ${source}.`, "ok");
  } else {
    logSync(`No new achievements in ${source} (already read, or the file could not be read).`);
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
    raHint(`${scope} · ${s.tracked} game${s.tracked === 1 ? "" : "s"} tracked · refreshed ${when}`);
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
  if (!u) return raHint("Enter your RetroAchievements username.", "err");
  if (!k) return raHint("Enter your API key.", "err");
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
    if (!res) return raHint("Could not refresh — see the activity log.", "err");
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
    bindProfile(IDENT.name());
    logSync(`Offline — showing saved progress for ${who}. Achievements will refresh when the connection returns.`, "err");
    return;
  }
  await enterProfile(true);
})();

/* Coming back to the tab is the moment a player expects to see what they just earned on the
   handheld. Progress is fetched again on return (rate-limited, and ACH keeps its own 2-minute
   window), so the stars, the sprites and the achievement count catch up without a reload. */
let lastReturnPull = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (typeof IDENT === "undefined" || !IDENT.signedIn()) return;
  if (typeof RA === "undefined" || !RA.configured()) return;
  if (Date.now() - lastReturnPull < 60 * 1000) return;
  lastReturnPull = Date.now();
  pullProfile({ quiet: true });
});
