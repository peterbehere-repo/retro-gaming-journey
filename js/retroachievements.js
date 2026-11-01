// Retro Gaming Journey — RetroAchievements progress layer.
//
// Reads the player's public RA progress and folds it into this page's own state.
// Credentials live in localStorage only: they are never committed, never sent
// anywhere but retroachievements.org, and the API key is the user's own.
//
// Why this is possible at all: RA answers every request with
// `access-control-allow-origin: *`, so the page can call it directly from any
// origin. (FileBrowser, by contrast, sends no CORS header at all — that path
// needed a local proxy and was retired.)
"use strict";

const RA = (() => {
  // Overridable so the test harness can point at a local mock.
  const BASE = window.RA_API_BASE || "https://retroachievements.org/API";
  const STORE = "rgj-ra-v1";
  const MAP_STORE = "rgj-ra-map-v1";

  // RA console IDs, keyed by this page's platform slugs.
  const CONSOLE = { nes: 7, snes: 3, genesis: 1, tg16: 8, gba: 5, nds: 18 };

  const DEFAULTS = { user: "", key: "", lastPull: null, games: {}, unmatched: [] };
  let cfg = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
    } catch (e) { /* corrupt -> fresh */ }
    return structuredClone(DEFAULTS);
  }
  function save() { localStorage.setItem(STORE, JSON.stringify(cfg)); }

  function configured() { return !!(cfg.user && cfg.key); }
  function configure(user, key) {
    cfg.user = String(user || "").trim();
    cfg.key = String(key || "").trim();
    cfg.games = {};          // progress is per-account; a different user invalidates it
    cfg.lastPull = null;
    cfg.unmatched = [];
    save();
  }
  function forget() {
    cfg = structuredClone(DEFAULTS); save();
    localStorage.removeItem(MAP_STORE);
  }

  function url(path, params) {
    if (!configured()) throw new Error("No RetroAchievements account configured.");
    const q = new URLSearchParams({ y: cfg.key, ...params });
    return `${BASE}/${path}?${q}`;
  }

  async function call(path, params) {
    const r = await fetch(url(path, params), { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status} ${r.statusText}`);
    const text = await r.text();
    if (!text.trim()) return null;
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`${path} returned non-JSON (check the username and API key).`); }
  }

  /* ---------------- title → RA game id ---------------- */

  // "Super Mario Bros. 3" vs "Super Mario Bros. 3 (USA)" vs "super mario bros 3"
  function normTitle(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")     // strip (USA), [!], etc.
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(the|a|an)\b/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function mapCache() {
    try { return JSON.parse(localStorage.getItem(MAP_STORE) || "{}"); }
    catch (e) { return {}; }
  }
  function saveMap(m) { localStorage.setItem(MAP_STORE, JSON.stringify(m)); }

  // Build/refresh the per-console title index. One request per console; cached forever
  // (titles are stable, and the list is large enough that re-fetching is wasteful).
  async function ensureTitleIndex(platform, { force = false } = {}) {
    const id = CONSOLE[platform];
    if (!id) return {};
    const cache = mapCache();
    if (!force && cache[platform]) return cache[platform];
    const list = await call("API_GetGameList.php", { i: id, f: 1 });
    const index = {};
    for (const g of (list || [])) {
      const key = normTitle(g.Title);
      // Prefer a base set (no subset) if two titles normalise identically.
      if (!index[key] || (g.Title.length < index[key].title.length))
        index[key] = { id: g.ID, title: g.Title };
    }
    cache[platform] = index;
    saveMap(cache);
    return index;
  }

  // Exact normalised match first, then a guarded prefix match. Real libraries rarely
  // agree on punctuation and subtitles: this page says "Castlevania III", RA says
  // "Castlevania III: Dracula's Curse". A prefix hit is only accepted when exactly one
  // candidate fits, so "Contra" cannot silently bind to "Contra Hard Corps".
  function lookup(index, title) {
    const want = normTitle(title);
    if (!want) return null;
    if (index[want]) return index[want];
    const hits = [];
    for (const key of Object.keys(index)) {
      if (key.startsWith(want + " ") || want.startsWith(key + " ")) hits.push(index[key]);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  // Resolve one of this page's games to an RA id, using the cached index.
  async function resolve(game) {
    const index = await ensureTitleIndex(game.platform);
    const hit = lookup(index, game.title);
    return hit ? hit.id : null;
  }

  // Resolve every game in the active library. Returns { matched, unmatched }.
  async function buildMapping(games) {
    const byPlatform = {};
    for (const g of games) (byPlatform[g.platform] ||= []).push(g);

    const matched = {};
    const unmatched = [];
    for (const platform of Object.keys(byPlatform)) {
      if (!CONSOLE[platform]) { unmatched.push(...byPlatform[platform].map(g => g.title)); continue; }
      const index = await ensureTitleIndex(platform);
      for (const g of byPlatform[platform]) {
        const hit = lookup(index, g.title);
        if (hit) matched[g.id] = hit.id; else unmatched.push(g.title);
      }
    }
    cfg.unmatched = unmatched;
    save();
    return { matched, unmatched };
  }

  /* ---------------- progress ---------------- */

  // Sweep all of the user's RA progress, one page at a time.
  async function fetchCompletionProgress(onPage) {
    const out = [];
    let offset = 0;
    for (let guard = 0; guard < 40; guard++) {
      const page = await call("API_GetUserCompletionProgress.php",
        { u: cfg.user, c: 500, o: offset });
      const results = (page && page.Results) || [];
      out.push(...results);
      if (onPage) onPage(out.length, page && page.Total);
      if (!results.length || out.length >= ((page && page.Total) || 0)) break;
      offset += results.length;
    }
    return out;
  }

  // Fold RA progress into app state. Only games this page knows about are written,
  // and nothing local is ever downgraded or erased.
  async function pullIntoState(games, state) {
    const { matched } = await buildMapping(games);
    const byRaId = {};
    for (const [gameId, raId] of Object.entries(matched)) byRaId[raId] = gameId;

    const rows = await fetchCompletionProgress();
    let applied = 0;
    state.ra = state.ra || {};
    state.ra.games = state.ra.games || {};

    for (const row of rows) {
      const gameId = byRaId[row.GameID];
      if (!gameId) continue;
      const achieved = row.NumAwardedToUser || 0;
      const possible = row.MaxPossible || 0;
      state.ra.games[gameId] = {
        raId: row.GameID,
        achieved, possible,
        hardcore: row.NumAwardedToUserHardcore || 0,
        lastPlayed: row.LastPlayed ? Date.parse(row.LastPlayed) : null,
        pct: possible ? achieved / possible : 0
      };
      if (achieved > 0) {
        const prev = state.unlocks[gameId] || { count: 0, last: 0 };
        // RA counts achievements, not "times unlocked" — take the max, don't accumulate
        // (otherwise every pull would inflate the total).
        const localAhead = (prev.count || 0) > achieved;
        state.unlocks[gameId] = {
          count: Math.max(prev.count || 0, achieved),
          last: Math.max(prev.last || 0, Date.parse(row.LastPlayed) || 0) || prev.last || 0,
          hardcore: localAhead ? !!prev.hardcore : (row.NumAwardedToUserHardcore || 0) > 0,
          source: localAhead ? (prev.source || "local") : "ra"
        };
      }
      if (possible && achieved >= possible) state.statuses[gameId] = "completed";
      else if (achieved > 0 && !state.statuses[gameId]) state.statuses[gameId] = "playing";
      applied++;
    }
    cfg.games = state.ra.games;
    cfg.lastPull = new Date().toISOString();
    cfg.unmatched = cfg.unmatched || [];
    save();
    return { applied, scanned: rows.length, matched: Object.keys(matched).length, unmatched: cfg.unmatched };
  }

  /* ---------------- per-game detail ---------------- */

  async function gameDetail(raId) {
    return call("API_GetGameInfoAndUserProgress.php", { u: cfg.user, g: raId });
  }

  function summary() {
    return {
      user: cfg.user,
      configured: configured(),
      lastPull: cfg.lastPull,
      tracked: Object.keys(cfg.games || {}).length,
      unmatched: (cfg.unmatched || []).length
    };
  }

  return {
    CONSOLE, normTitle, lookup, configured, configure, forget,
    ensureTitleIndex, buildMapping, resolve,
    fetchCompletionProgress, pullIntoState, gameDetail, summary,
    _state: () => cfg
  };
})();
window.RA = RA;
