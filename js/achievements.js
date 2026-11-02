// Retro Gaming Journey — three curated achievements per game.
//
// Replaces the old hand-rolled "Badges" tab. Every NES title in the library gets
// three RA achievements — easy / intermediate / advanced — and those same three
// are the three stars on the Journey map's path-point modals.
//
// Difficulty is RA's own retro ratio (TrueRatio: points weighted by how rare the
// achievement is). Lowest ratio in the set = easy, highest = advanced, the one
// nearest the middle of the range in log terms = intermediate. That gives a real spread
// rather than three arbitrary picks, and it moves when the community moves.
//
// Two rules learned the hard way (2026-11-02, Contra):
//   • Achievements worth 0 points are meta entries — Konami codes, "thanks for playing",
//     unpromoted stubs. They sit at ratio 0 and would win "easy" every time, so they are
//     excluded from the three.
//   • The ratio range is long-tailed (Contra runs 1 → 385), so an arithmetic midpoint
//     lands deep in the tail. The geometric midpoint keeps easy/intermediate/advanced an
//     even distance apart in real difficulty.
"use strict";

const ACH = (() => {
  const STORE   = "rgj-ach-v1";         // { "<platform>|<normTitle>": { raId, raTitle, picks[] } }
  const EARNED  = "rgj-ach-earned-v1";  // { "<raId>": { "<achId>": "2026-10-01 12:00:00" } }
  const TIERS   = ["easy", "intermediate", "advanced"];
  const THROTTLE_MS = 180;              // be polite to the API

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { return {}; }
  }
  function save(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }

  const cache  = () => load(STORE);
  const earned = () => load(EARNED);

  const keyOf = (platform, title) => `${platform}|${RA.normTitle(title)}`;

  /* ---------------- picking three ---------------- */

  // Turn one game's achievement map into exactly three tiers, strongest signal first.
  // Achievements with no ratio (unpublished/legacy) are skipped rather than guessed at.
  function pickThree(achievements) {
    const rows = Object.values(achievements || {})
      .filter(a => a && a.ID && a.Title)
      .map(a => ({
        id: a.ID,
        title: a.Title,
        desc: a.Description || "",
        points: Number(a.Points) || 0,
        ratio: Number(a.TrueRatio) || Number(a.Points) || 0,
        type: a.type || "",
        awarded: Number(a.NumAwarded) || 0
      }))
      .filter(r => r.points > 0);      // 0-point meta achievements never count as a tier

    if (!rows.length) return [];
    rows.sort((a, b) => a.ratio - b.ratio || a.points - b.points || a.id - b.id);
    if (rows.length <= 3) return rows.map((r, i) => ({ ...r, tier: TIERS[rows.length === 1 ? 0 : i] }));

    const easy = rows[0];
    const hard = rows[rows.length - 1];
    // Intermediate: closest to the geometric midpoint (difficulty multiplies, it doesn't add).
    const mid = Math.sqrt(Math.max(easy.ratio, 1) * Math.max(hard.ratio, 1));
    const dist = r => Math.abs(Math.log(Math.max(r.ratio, 1)) - Math.log(mid));
    let midRow = rows[1];
    for (const r of rows.slice(1, -1)) {
      if (dist(r) < dist(midRow)) midRow = r;
    }
    return [
      { ...easy, tier: "easy" },
      { ...midRow, tier: "intermediate" },
      { ...hard, tier: "advanced" }
    ];
  }

  /* ---------------- fetching ---------------- */

  // API_GetGameExtended keys the game as `i` (not `g` — that is a different endpoint).
  async function fetchPicks(raId) {
    const data = await RA.call("API_GetGameExtended.php", { i: raId });
    if (!data || !data.Achievements) return null;
    return { raId, raTitle: data.Title || "", picks: pickThree(data.Achievements) };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Ensure every title in `titles` has its three picks cached.
  // Calls back with (done, total) so the UI can show progress instead of hanging.
  async function ensure(platform, titles, { force = false, onProgress } = {}) {
    if (!RA.configured()) throw new Error("Add your RetroAchievements username and web API key first.");
    const store = cache();
    const missing = [];
    for (const t of titles) {
      const k = keyOf(platform, t);
      if (force || !store[k]) missing.push(t);
    }
    if (!missing.length) { onProgress?.(0, 0); return { fetched: 0, missing: missing.length }; }

    const index = await RA.ensureTitleIndex(platform);
    let done = 0, fetched = 0, unresolved = 0;
    for (const t of missing) {
      const hit = RA.lookup(index, t);
      const k = keyOf(platform, t);
      if (!hit) { store[k] = { raId: null, raTitle: null, picks: [], unmatched: true }; unresolved++; }
      else {
        const res = await fetchPicks(hit.id);
        store[k] = res
          ? { ...res, unmatched: false }
          : { raId: hit.id, raTitle: hit.title, picks: [], unmatched: false, empty: true };
        fetched++;
        await sleep(THROTTLE_MS);
      }
      done++;
      onProgress?.(done, missing.length);
    }
    save(STORE, store);
    return { fetched, unresolved, missing: missing.length };
  }

  /* ---------------- reading ---------------- */

  function get(platform, title) {
    return cache()[keyOf(platform, title)] || null;
  }

  // Which of a game's three picks the player has actually earned. Pulled from
  // API_GetGameInfoAndUserProgress (that endpoint keys the game as `g`), cached per game.
  async function ensureEarned(platform, title) {
    const g = get(platform, title);
    if (!g || !g.raId || !RA.configured()) return {};
    const e = earned();
    const det = await RA.gameDetail(g.raId);
    const out = {};
    for (const a of Object.values((det && det.Achievements) || {})) {
      if (a && a.DateEarned) out[a.ID] = a.DateEarned;
    }
    // Merge, never replace: an unlock imported from a device is written here before RA
    // has ever been asked, and a later RA pull must not wipe it (local wins on collision).
    e[g.raId] = { ...out, ...(e[g.raId] || {}) };
    save(EARNED, e);
    return e[g.raId];
  }

  // Synchronous read of what is already cached, for rendering without a request.
  function earnedOf(platform, title) {
    const g = get(platform, title);
    if (!g || !g.raId) return {};
    return earned()[g.raId] || {};
  }

  // Stars for the Journey map: how many of the three have been earned.
  async function starCount(platform, title) {
    const g = get(platform, title);
    if (!g || !g.picks.length) return { earned: 0, picks: [] };
    const e = await ensureEarned(platform, title);
    const picks = g.picks.map(p => ({ ...p, earned: !!e[p.id] }));
    return { earned: picks.filter(p => p.earned).length, picks };
  }

  /* ---------------- persistence ---------------- */

  // The cache is portable so a fully-fetched one can be committed as data/ra-achievements.json
  // and shipped in the repo — new visitors then see all three picks with no API key at all.
  function dump() { return { schema: "rgj-achievements-v1", generatedAt: new Date().toISOString(), games: cache() }; }
  async function hydrate(bundled) {
    if (!bundled || !bundled.games) return 0;
    const store = cache();
    let added = 0;
    for (const [k, v] of Object.entries(bundled.games)) {
      if (!store[k] || !store[k].picks || !store[k].picks.length) { store[k] = v; added++; }
    }
    if (added) save(STORE, store);
    return added;
  }

  function summary(platform, titles) {
    let filled = 0, unmatched = 0;
    for (const t of titles) {
      const g = get(platform, t);
      if (g && g.picks && g.picks.length === 3) filled++;
      else if (g && g.unmatched) unmatched++;
    }
    return { filled, unmatched, total: titles.length };
  }

  return { TIERS, pickThree, ensure, ensureEarned, earnedOf, starCount, get, summary, dump, hydrate, cache, _keyOf: keyOf };
})();
window.ACH = ACH;
