// Retro Gaming Journey — LAN HTTP adapter (2026-11-02)
//
// Third transport beside MTP and card pull: a handheld that serves its own card over
// HTTP. Verified on the Miyoo A30 running SpruceOS, which ships SFTPGo 2.6.2:
//
//   GET  /api/v2/user/token              basic auth -> 20-minute JWT
//   GET  /api/v2/user/dirs?path=/        JSON listing
//   GET  /api/v2/user/files?path=<f>     raw file bytes
//   POST /api/v2/user/files/upload?path=<f>&mkdir_parents=true   raw body -> file
//
// Nothing on the device changes: the queue format is the same rgj/rgj-queue.jsonl the
// card adapter reads, and the ack is the same rgj/rgj-ack.json / .keys pair.
//
// The page is served over https from GitHub Pages, so a plain fetch to http://<lan-ip>
// is blocked as mixed content. Two ways through, tried in order:
//   1. Relay — the Rool Web Bridge extension (host permissions bypass CORS and mixed
//      content). The page posts a request, the content script hands it to the service
//      worker, the reply comes back unsolicited. No install on the device.
//   2. Direct fetch — works when this page is itself served over plain http, e.g. from
//      a laptop on the LAN or from the device's own web server.
(function () {
  "use strict";

  const CFG_KEY = "rgj-lan-v1";
  const RELAY_WAIT_MS = 4000;
  const ACK_PATH = "rgj/rgj-ack.json";
  const KEYS_PATH = "rgj/rgj-ack.keys";

  // The A30's SFTPGo. Password is stored in localStorage only, never in the repo.
  const DEFAULTS = {
    devices: [{
      id: "a30_hw01", label: "Miyoo A30 · SpruceOS",
      base: "http://192.168.1.68:8080", user: "spruce", pass: "",
      queue: "rgj/rgj-queue.jsonl", marker: "rgj-device.json"
    }]
  };

  const load = () => {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || structuredClone(DEFAULTS); }
    catch { return structuredClone(DEFAULTS); }
  };
  let cfg = load();
  const save = () => localStorage.setItem(CFG_KEY, JSON.stringify(cfg));

  /* ---------------------------------------------------------------- transport */

  let relaySeen = false;

  function viaRelay(req) {
    return new Promise(resolve => {
      const id = "rgj" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const done = res => { window.removeEventListener("message", onMsg); clearTimeout(timer); resolve(res); };
      const onMsg = ev => {
        const d = ev.data;
        // Must carry a reply: our own outgoing message has the same id and no `res`.
        if (!d || d.__rgjLan !== 1 || d.id !== id || !d.res) return;
        relaySeen = true;
        done(d.res);
      };
      const timer = setTimeout(() => done(null), RELAY_WAIT_MS);
      window.addEventListener("message", onMsg);
      window.postMessage({ __rgjLan: 1, id, req }, location.origin);
    });
  }

  const DIRECT_TIMEOUT_MS = 8000;

  async function viaDirectFetch(req) {
    const init = { method: req.method || "GET", credentials: "omit", cache: "no-store", redirect: "follow" };
    if (req.headers) init.headers = req.headers;
    if (init.method !== "GET" && init.method !== "HEAD" && req.body != null) init.body = req.body;
    // Chrome does not reject a blocked mixed-content request to a LAN address, it leaves the
    // promise hanging — so this path needs its own abort, or the button spins forever.
    const ctrl = new AbortController();
    init.signal = ctrl.signal;
    const timer = setTimeout(() => ctrl.abort(), DIRECT_TIMEOUT_MS);
    try {
      const res = await fetch(req.url, init);
      return { ok: res.ok, status: res.status, text: await res.text() };
    } catch (e) {
      return { ok: false, status: 0, text: String(e && e.message || e) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(req) {
    const relayed = await viaRelay(req);
    if (relayed) return relayed;
    return viaDirectFetch(req);
  }

  /* ---------------------------------------------------------------- SFTPGo API */

  const tokens = new Map();   // device id -> { token, exp }

  async function token(dev) {
    const hit = tokens.get(dev.id);
    if (hit && hit.exp > Date.now() + 30000) return hit.token;
    const basic = "Basic " + btoa(`${dev.user}:${dev.pass}`);
    const res = await send({ method: "GET", url: `${dev.base}/api/v2/user/token`, headers: { Authorization: basic } });
    if (!res.ok) throw new Error(res.status === 401 ? "wrong username or password" : `token request failed (HTTP ${res.status || "no route"})`);
    const body = JSON.parse(res.text);
    const exp = Date.parse(body.expires_at || "") || Date.now() + 600000;
    tokens.set(dev.id, { token: body.access_token, exp });
    return body.access_token;
  }

  async function api(dev, path, opts = {}) {
    const t = await token(dev);
    const res = await send({
      method: opts.method || "GET",
      url: `${dev.base}/api/v2/user${path}`,
      headers: { Authorization: "Bearer " + t, ...(opts.headers || {}) },
      body: opts.body
    });
    if (res.status === 401) { tokens.delete(dev.id); throw new Error("token rejected — probing again next pull"); }
    return res;
  }

  const q = (p) => encodeURIComponent(p);

  async function probe(dev) {
    await token(dev);
    const dir = await api(dev, `/dirs?path=${q("/rgj")}`);
    const marker = await api(dev, `/files?path=${q(dev.marker)}`);
    let meta = null;
    if (marker.ok) { try { meta = JSON.parse(marker.text); } catch { /* unreadable marker */ } }
    return {
      reachable: true,
      folder: dir.ok,
      marker: meta,
      label: meta && meta.model ? `${meta.model} · ${meta.os || ""}`.trim() : dev.label
    };
  }

  async function pull(dev) {
    const res = await api(dev, `/files?path=${q(dev.queue)}`);
    if (res.status === 404) return { text: "", rows: 0, missing: true };
    if (!res.ok) throw new Error(`could not read ${dev.queue} (HTTP ${res.status})`);
    return { text: res.text, missing: false };
  }

  async function ack(dev, rows) {
    const taken = rows.map(r => ({ game_hash: r.game_hash, achievement_id: r.achievement_id, timestamp: r.timestamp }));
    const body = JSON.stringify({
      schema: 1, device_id: dev.id, acked_at: new Date().toISOString(), count: taken.length, rows: taken
    }, null, 1);
    const keys = taken.map(r => `${r.game_hash}|${r.achievement_id}|${r.timestamp}`).join("\n") + "\n";
    const put = (path, text) => api(dev, `/files/upload?path=${q(path)}&mkdir_parents=true`,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: text });
    const a = await put(ACK_PATH, body);
    if (!a.ok) throw new Error(`ack write failed (HTTP ${a.status})`);
    const k = await put(KEYS_PATH, keys);
    if (!k.ok) throw new Error(`ack keys write failed (HTTP ${k.status})`);
    return taken.length;
  }

  // Hardware bring-up helper (console only, no UI): append one row to the device queue,
  // so the whole read/ack path can be exercised before anything on the device emits
  // rows itself. RGJLan.testRow({ game: "Contra", achievementId: 12345 })
  async function testRow({ game = "Contra", platform = "nes", genre = "Action", achievementId = null, hardcore = true } = {}) {
    const dev = cfg.devices[0];
    const g = (typeof ALL_GAMES !== "undefined" ? ALL_GAMES : [])
      .find(x => x.title.toLowerCase() === String(game).toLowerCase() && x.platform === platform);
    if (!g) throw new Error(`no ${platform} entry titled "${game}" in the library`);
    let aid = achievementId;
    if (aid == null) {
      const card = typeof RA !== "undefined" && RA.get ? RA.get(g.platform, g.title) : null;
      aid = card && card.picks && card.picks[0] ? card.picks[0].id : null;
      if (aid == null) throw new Error("no cached RA picks for this game — pull RA progress first, or pass achievementId");
    }
    const row = { game_hash: hashGame(g), achievement_id: String(aid), timestamp: Math.floor(Date.now() / 1000), hardcore, source: "rgj-lan-test" };
    const cur = await api(dev, `/files?path=${q(dev.queue)}`);
    const base = cur.ok ? cur.text : "";
    const body = (base && !base.endsWith("\n") ? base + "\n" : base) + JSON.stringify(row) + "\n";
    const put = await api(dev, `/files/upload?path=${q(dev.queue)}&mkdir_parents=true`,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
    if (!put.ok) throw new Error(`row write failed (HTTP ${put.status})`);
    return row;
  }

  /* ---------------------------------------------------------------- rows -> stars */

  // Same deterministic hash app.js uses to key a game; rows carry it, not a ROM hash.
  function hashGame(g) {
    let h = 5381;
    for (const c of `${g.genre}|${g.platform}|${g.title}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
  }
  const byHash = new Map((typeof ALL_GAMES !== "undefined" ? ALL_GAMES : []).map(g => [hashGame(g), g]));

  // A device row names an achievement. When that id is a RetroAchievements id and it is
  // one of the game's three picks, the star for that pick fills in — from the device, not
  // from a later RA pull. Earliest date wins, so re-importing the same row is harmless.
  function markEarned(rows) {
    if (typeof RA === "undefined" || !RA.get) return { marked: 0, unknownGame: 0, notAPick: 0 };
    const KEY = "rgj-ach-earned-v1";
    let store = {};
    try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* fresh */ }
    let marked = 0, unknownGame = 0, notAPick = 0;
    for (const r of rows) {
      const g = byHash.get(String(r.game_hash || "").trim());
      if (!g) { unknownGame++; continue; }
      const card = RA.get(g.platform, g.title);
      if (!card || !card.raId) continue;                       // no RA mapping cached yet
      const aid = Number(r.achievement_id);
      if (!Number.isFinite(aid)) { notAPick++; continue; }     // e.g. "manual_complete"
      if (!(card.picks || []).some(p => Number(p.id) === aid)) { notAPick++; continue; }
      const when = new Date((Number(r.timestamp) || Date.now() / 1000) * 1000)
        .toISOString().slice(0, 19).replace("T", " ");
      const bucket = store[card.raId] = store[card.raId] || {};
      if (!bucket[aid] || bucket[aid] > when) bucket[aid] = when;
      marked++;
    }
    if (marked) {
      localStorage.setItem(KEY, JSON.stringify(store));
      const f = document.getElementById("journey-frame");
      if (f && f.contentWindow) f.contentWindow.postMessage({ type: "rgj-ach" }, "*");
    }
    return { marked, unknownGame, notAPick };
  }

  /* ---------------------------------------------------------------- UI */

  function card(dev) {
    const el = document.createElement("div");
    el.className = "sync-card";
    el.innerHTML = `
      <h3>LAN device (HTTP) <span class="usb-pill" id="lan-pill">not probed</span></h3>
      <p class="sync-note">
        A handheld running an HTTP file server reads its own card: no cable, no card reader.
        Verified on SpruceOS, which serves <strong>SFTPGo</strong> on port 8080 —
        <code>/api/v2/user/*</code> gives token, listing, read and write.
      </p>
      <div class="ra-form">
        <label>Address <input id="lan-base" type="text" value="${dev.base}" spellcheck="false"></label>
        <label>User <input id="lan-user" type="text" value="${dev.user}" spellcheck="false"></label>
        <label>Password <input id="lan-pass" type="password" value="${dev.pass || ""}" autocomplete="off"></label>
      </div>
      <div class="usb-actions">
        <button id="lan-remember" class="btn btn-small">Save</button>
        <button id="lan-probe" class="btn btn-ghost btn-small">Probe</button>
        <button id="lan-pull" class="btn btn-ghost btn-small">Pull rows</button>
        <button id="lan-forget" class="btn btn-ghost btn-small">Forget address</button>
      </div>
      <p class="usb-hint" id="lan-hint"></p>`;
    return el;
  }

  function mount() {
    const grid = document.querySelector("#panel-sync .sync-grid");
    if (!grid) return;
    const dev = cfg.devices[0];
    const el = card(dev);
    grid.insertBefore(el, grid.querySelector("#ra-card") || null);

    const pill = (txt, cls) => {
      const p = el.querySelector("#lan-pill");
      p.textContent = txt;
      p.className = "usb-pill" + (cls ? " " + cls : "");
    };
    const hint = (txt, cls) => {
      const h = el.querySelector("#lan-hint");
      h.textContent = txt || "";
      h.className = "usb-hint" + (cls ? " " + cls : "");
    };
    const read = () => {
      dev.base = el.querySelector("#lan-base").value.trim().replace(/\/+$/, "");
      dev.user = el.querySelector("#lan-user").value.trim();
      dev.pass = el.querySelector("#lan-pass").value;
      return dev;
    };

    el.querySelector("#lan-remember").addEventListener("click", () => {
      read(); save(); hint("Address and password kept in this browser only.", "ok");
    });

    el.querySelector("#lan-probe").addEventListener("click", async () => {
      read(); pill("probing…");
      try {
        const p = await probe(dev);
        pill(p.folder ? "queue ready" : "no rgj folder", p.folder ? "ok" : "");
        hint(`${p.label} reachable. ${p.folder ? "rgj/ present." : "Run rgj-sync init on the device to create rgj/."}` +
             (relaySeen ? " Relay: extension." : " Relay: none — direct fetch."), "ok");
      } catch (e) {
        pill("unreachable", "err");
        hint(`${e.message}. ${relaySeen ? "" : "No extension relay answered — is the Rool Web Bridge loaded, and is this page https?"}`, "err");
      }
    });

    el.querySelector("#lan-pull").addEventListener("click", async () => {
      read(); pill("pulling…");
      try {
        const { text, missing } = await pull(dev);
        if (missing) { pill("no queue file", ""); hint("No rgj/rgj-queue.jsonl on the card yet — play a session, or copy the spool in.", ""); return; }
        const before = state.queued.length;
        const added = typeof importRows === "function" ? importRows(text, `${dev.label} over LAN`) : 0;
        const fresh = state.queued.slice(before);
        let acked = 0;
        if (fresh.length) {
          markEarned(fresh);
          try { acked = await ack(dev, fresh); } catch (e) { logSync?.(`Ack not written: ${e.message}`, "err"); }
        }
        pill(`${added} new row${added === 1 ? "" : "s"}`, added ? "ok" : "");
        hint(`${added} row(s) imported${acked ? `, ${acked} acked back to the device` : ""}.`, added ? "ok" : "");
      } catch (e) {
        pill("pull failed", "err"); hint(e.message, "err");
      }
    });

    el.querySelector("#lan-forget").addEventListener("click", () => {
      cfg = structuredClone(DEFAULTS);
      save(); el.querySelector("#lan-base").value = cfg.devices[0].base;
      el.querySelector("#lan-user").value = cfg.devices[0].user;
      el.querySelector("#lan-pass").value = "";
      tokens.clear(); pill("forgotten", ""); hint("Address cleared from this browser.", "");
    });
  }

  window.RGJLan = { probe, pull, ack, testRow, markEarned, hashGame, devices: () => cfg.devices, _send: send };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
