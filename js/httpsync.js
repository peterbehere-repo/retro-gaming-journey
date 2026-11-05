// Retro Gaming Journey — LAN HTTP adapter (2026-11-02, multi-device 2026-11-02)
//
// Third transport beside MTP and card pull: a handheld that serves its own card over
// HTTP. Two server flavors are in the wild, both auto-detected:
//
//   SFTPGo 2.6.x  — SpruceOS on the Miyoo A30 (port 8080)
//     GET  /api/v2/user/token                     basic auth -> 20-minute JWT
//     GET  /api/v2/user/dirs?path=/               JSON listing
//     GET  /api/v2/user/files?path=<f>            raw file bytes
//     POST /api/v2/user/files/upload?path=<f>&mkdir_parents=true   raw body -> file
//
//   File Browser 2.x — ArkOS on the Batlexp G350, PowKiddy RGB30, RG35XX family
//     POST /api/login                             {username,password} -> JWT (also a cookie)
//     GET  /api/resources/<path>                  JSON listing ({ items: [...] })
//     GET  /api/raw/<path>                        raw file bytes
//     POST /api/resources/<path>?override=true    raw body -> file (create or replace)
//     POST /api/resources/<path>?override=true    {"action":"mkdir"} -> folder
//     X-Auth: <JWT> on every call, except /api/login
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

  const CFG_KEY = "rgj-lan-v2";
  const OLD_KEY = "rgj-lan-v1";
  const RELAY_WAIT_MS = 4000;
  const ACK_PATH = "rgj/rgj-ack.json";
  const KEYS_PATH = "rgj/rgj-ack.keys";

  // Passwords are stored in localStorage only, never in the repo.
  const DEFAULTS = {
    devices: [
      {
        id: "a30_hw01", label: "Miyoo A30 · SpruceOS",
        base: "http://192.168.1.68:8080", user: "spruce", pass: "",
        backend: "auto", queue: "rgj/rgj-queue.jsonl", marker: "rgj-device.json"
      },
      {
        id: "g350_hw01", label: "Batlexp G350 · ArkOS",
        base: "http://192.168.1.169", user: "ark", pass: "ark",
        backend: "auto", queue: "rgj/rgj-queue.jsonl", marker: "rgj-device.json"
      }
    ]
  };

  function load() {
    try {
      const cur = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
      if (cur && Array.isArray(cur.devices)) return cur;
      // v1 held exactly one device under `devices[0]` plus no backend field.
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
      if (old && Array.isArray(old.devices) && old.devices.length) {
        const seeded = structuredClone(DEFAULTS);
        seeded.devices[0] = { ...seeded.devices[0], ...old.devices[0], backend: "sftpgo" };
        return seeded;
      }
    } catch { /* corrupt -> fresh */ }
    return structuredClone(DEFAULTS);
  }
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
    // A page served over https can never reach a plain-http LAN host by itself: the browser
    // blocks it as mixed content and (Chrome) never settles the promise. Fail here instead.
    if (location.protocol === "https:") {
      return { ok: false, status: 0, noRelay: true, text: "no relay — this page is https, a direct LAN request would be blocked" };
    }
    return viaDirectFetch(req);
  }

  /* ---------------------------------------------------------------- backends */

  const enc = p => String(p).split("/").map(encodeURIComponent).join("/");
  const badRoute = res => `no route to the device${res.noRelay ? " and no extension relay" : ""}`;

  /* SFTPGo — SpruceOS */
  const sftpgo = {
    name: "SFTPGo",
    async auth(dev) {
      const hit = tokens.get(dev.id);
      if (hit && hit.exp > Date.now() + 30000) return hit.token;
      const basic = "Basic " + btoa(`${dev.user}:${dev.pass}`);
      const res = await send({ method: "GET", url: `${dev.base}/api/v2/user/token`, headers: { Authorization: basic } });
      if (!res.ok) throw new Error(res.status === 401 ? "wrong username or password"
        : res.status ? `token request failed (HTTP ${res.status})` : badRoute(res));
      const body = JSON.parse(res.text);
      const exp = Date.parse(body.expires_at || "") || Date.now() + 600000;
      tokens.set(dev.id, { token: body.access_token, exp });
      return body.access_token;
    },
    async call(dev, path, opts = {}) {
      const t = await sftpgo.auth(dev);
      const res = await send({
        method: opts.method || "GET",
        url: `${dev.base}/api/v2/user${path}`,
        headers: { Authorization: "Bearer " + t, ...(opts.headers || {}) },
        body: opts.body
      });
      if (res.status === 401) { tokens.delete(dev.id); throw new Error("token rejected — probing again next pull"); }
      return res;
    },
    listDir: (dev, dir) => sftpgo.call(dev, `/dirs?path=${encodeURIComponent(dir)}`),
    read: (dev, file) => sftpgo.call(dev, `/files?path=${encodeURIComponent(file)}`),
    write: (dev, file, text) => sftpgo.call(dev, `/files/upload?path=${encodeURIComponent(file)}&mkdir_parents=true`,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: text }),
    mkdir: (dev, dir) => sftpgo.call(dev, `/dirs?path=${encodeURIComponent(dir)}`, { method: "POST" })
  };

  /* File Browser — ArkOS and friends */
  const filebrowser = {
    name: "File Browser",
    async auth(dev) {
      const hit = tokens.get(dev.id);
      if (hit && hit.exp > Date.now() + 60000) return hit.token;
      const res = await send({
        method: "POST", url: `${dev.base}/api/login`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: dev.user, password: dev.pass })
      });
      if (!res.ok) throw new Error(res.status === 403 || res.status === 401 ? "wrong username or password"
        : res.status ? `login failed (HTTP ${res.status})` : badRoute(res));
      const t = String(res.text || "").replace(/^"|"$/g, "").trim();
      if (t.split(".").length !== 3) throw new Error("login did not return a token");
      // File Browser's JWT carries its own exp; trust a flat hour and re-auth on 401 anyway.
      tokens.set(dev.id, { token: t, exp: Date.now() + 3600000 });
      return t;
    },
    async call(dev, path, opts = {}) {
      const t = await filebrowser.auth(dev);
      const res = await send({
        method: opts.method || "GET",
        url: `${dev.base}${path}`,
        headers: { "X-Auth": t, ...(opts.headers || {}) },
        body: opts.body
      });
      if (res.status === 401 || res.status === 403) { tokens.delete(dev.id); throw new Error("token rejected — probing again next pull"); }
      return res;
    },
    listDir: (dev, dir) => filebrowser.call(dev, `/api/resources/${enc(dir)}?override=true`),
    read: (dev, file) => filebrowser.call(dev, `/api/raw/${enc(file)}`),
    // PUT only updates an existing file (404 otherwise); POST creates or replaces.
    write: (dev, file, text) => filebrowser.call(dev, `/api/resources/${enc(file)}?override=true`,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: text }),
    mkdir: (dev, dir) => filebrowser.call(dev, `/api/resources/${enc(dir)}?override=true`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mkdir" }) })
  };

  const tokens = new Map();   // device id -> { token, exp }
  const BACKENDS = { sftpgo, filebrowser };

  // One probe decides the flavor: File Browser answers /api/login, SFTPGo does not.
  async function backendFor(dev) {
    if (dev.backend && dev.backend !== "auto" && BACKENDS[dev.backend]) return BACKENDS[dev.backend];
    if (dev._backend && BACKENDS[dev._backend]) return BACKENDS[dev._backend];
    const res = await send({
      method: "POST", url: `${dev.base}/api/login`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: dev.user, password: dev.pass })
    });
    if (res.ok && String(res.text || "").split(".").length === 3) { dev._backend = "filebrowser"; return filebrowser; }
    if (!res.status && res.noRelay) throw new Error(badRoute(res));
    // Not File Browser — assume SFTPGo and let its own error messages surface.
    dev._backend = "sftpgo";
    return sftpgo;
  }

  /* ---------------------------------------------------------------- operations */

  async function probe(dev) {
    const be = await backendFor(dev);
    await be.auth(dev);
    const dir = await be.listDir(dev, "rgj");
    const marker = await be.read(dev, dev.marker);
    let meta = null;
    if (marker.ok) { try { meta = JSON.parse(marker.text); } catch { /* unreadable marker */ } }
    return {
      reachable: true,
      backend: be.name,
      folder: dir.ok,
      marker: meta,
      label: meta && meta.model ? `${meta.model} · ${meta.os || ""}`.trim() : dev.label
    };
  }

  async function pull(dev) {
    const be = await backendFor(dev);
    const res = await be.read(dev, dev.queue);
    if (res.status === 404) return { text: "", rows: 0, missing: true, backend: be.name };
    if (!res.ok) throw new Error(`could not read ${dev.queue} (HTTP ${res.status})`);
    return { text: res.text, missing: false, backend: be.name };
  }

  async function ack(dev, rows) {
    const be = await backendFor(dev);
    const taken = rows.map(r => ({ game_hash: r.game_hash, achievement_id: r.achievement_id, timestamp: r.timestamp }));
    const body = JSON.stringify({
      schema: 1, device_id: dev.id, acked_at: new Date().toISOString(), count: taken.length, rows: taken
    }, null, 1);
    const keys = taken.map(r => `${r.game_hash}|${r.achievement_id}|${r.timestamp}`).join("\n") + "\n";
    const a = await be.write(dev, ACK_PATH, body);
    if (!a.ok) throw new Error(`ack write failed (HTTP ${a.status})`);
    const k = await be.write(dev, KEYS_PATH, keys);
    if (!k.ok) throw new Error(`ack keys write failed (HTTP ${k.status})`);
    return taken.length;
  }

  // Queue file + a device marker, for a device that has never seen the site.
  async function initialise(dev) {
    const be = await backendFor(dev);
    await be.auth(dev);
    const mk = await be.mkdir(dev, "rgj");
    if (!mk.ok && mk.status !== 409 && mk.status !== 500) throw new Error(`could not create rgj/ (HTTP ${mk.status})`);
    let marker = null;
    try { marker = JSON.parse((await be.read(dev, dev.marker)).text); } catch { /* absent */ }
    if (!marker) {
      const body = JSON.stringify({
        schema: 1, device_id: dev.id, model: dev.label, os: dev.label.split("·").pop().trim(),
        backend: be.name, queue: dev.queue, written_at: new Date().toISOString()
      }, null, 1);
      const w = await be.write(dev, dev.marker, body);
      if (!w.ok) throw new Error(`could not write ${dev.marker} (HTTP ${w.status})`);
    }
    return { backend: be.name, wrote: !marker };
  }

  // Hardware bring-up helper (console only, no UI): append one row to the device queue,
  // so the whole read/ack path can be exercised before anything on the device emits
  // rows itself. RGJLan.testRow({ device: "g350_hw01", game: "Contra" })
  async function testRow({ device = null, game = "Contra", platform = "nes", genre = "Action", achievementId = null, hardcore = true } = {}) {
    const dev = pick(device);
    const be = await backendFor(dev);
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
    const cur = await be.read(dev, dev.queue);
    const base = cur.ok ? cur.text : "";
    const body = (base && !base.endsWith("\n") ? base + "\n" : base) + JSON.stringify(row) + "\n";
    const put = await be.write(dev, dev.queue, body);
    if (!put.ok) throw new Error(`row write failed (HTTP ${put.status})`);
    return row;
  }

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
    // Earned marks are per account (see identity.js): a device row only ever lands in
    // the profile that is signed in when the card is read.
    if (typeof IDENT === "undefined" || !IDENT.signedIn())
      return { marked: 0, unknownGame: 0, notAPick: 0, signedOut: true };
    const KEY = (typeof ACH !== "undefined" && ACH.EARNED_BASE)
      ? IDENT.scopedKey(ACH.EARNED_BASE) : IDENT.scopedKey("rgj-ach-earned-v1");
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

  const pick = id => cfg.devices.find(d => d.id === id) || cfg.devices[0];

  /* ---------------------------------------------------------------- UI */

  function card(dev, index) {
    const el = document.createElement("div");
    el.className = "sync-card";
    el.dataset.device = dev.id;
    el.innerHTML = `
      <h3>${dev.label} <span class="usb-pill lan-pill">not probed</span></h3>
      <p class="sync-note">
        Reads its own card over the LAN: no cable, no card reader. SFTPGo (SpruceOS on the
        A30) and File Browser (ArkOS on the G350, RGB30) are both understood — the backend
        is detected from the address.
      </p>
      <div class="ra-form">
        <label>Address <input class="lan-base" type="text" value="${dev.base}" spellcheck="false"></label>
        <label>User <input class="lan-user" type="text" value="${dev.user}" spellcheck="false"></label>
        <label>Password <input class="lan-pass" type="password" value="${dev.pass || ""}" autocomplete="off"></label>
      </div>
      <div class="usb-actions">
        <button class="btn btn-small lan-remember">Save</button>
        <button class="btn btn-ghost btn-small lan-probe">Probe</button>
        <button class="btn btn-ghost btn-small lan-init">Prepare card</button>
        <button class="btn btn-ghost btn-small lan-pull">Pull rows</button>
        <button class="btn btn-ghost btn-small lan-forget">Forget</button>
      </div>
      <p class="usb-hint lan-hint"></p>`;
    return el;
  }

  function mount() {
    const grid = document.querySelector("#panel-sync .sync-grid");
    if (!grid) return;
    const anchor = grid.querySelector("#ra-card") || null;

    const paint = () => {
      grid.querySelectorAll(".sync-card[data-device]").forEach(n => n.remove());
      cfg.devices.forEach((dev, i) => {
        const el = card(dev, i);
        grid.insertBefore(el, anchor);
        wire(el, dev);
      });
    };

    const wire = (el, dev) => {
      const pill = (txt, cls) => {
        const p = el.querySelector(".lan-pill");
        p.textContent = txt;
        p.className = "usb-pill lan-pill" + (cls ? " " + cls : "");
      };
      const hint = (txt, cls) => {
        const h = el.querySelector(".lan-hint");
        h.textContent = txt || "";
        h.className = "usb-hint lan-hint" + (cls ? " " + cls : "");
      };
      const read = () => {
        dev.base = el.querySelector(".lan-base").value.trim().replace(/\/+$/, "");
        dev.user = el.querySelector(".lan-user").value.trim();
        dev.pass = el.querySelector(".lan-pass").value;
        dev._backend = null; tokens.delete(dev.id);
        return dev;
      };
      const guard = async (busy, fn) => {
        pill(busy);
        try { await fn(); } catch (e) { pill("failed", "err"); hint(e.message, "err"); }
      };

      el.querySelector(".lan-remember").addEventListener("click", () => {
        read(); save(); hint("Address and password kept in this browser only.", "ok");
      });

      el.querySelector(".lan-probe").addEventListener("click", () => guard("probing…", async () => {
        read();
        const p = await probe(dev);
        pill(p.folder ? "queue ready" : "no rgj folder", p.folder ? "ok" : "");
        hint(`${p.label} · ${p.backend} reachable. ${p.folder ? "rgj/ present." : "Press Prepare card to create rgj/."}` +
             (relaySeen ? " Relay: extension." : " Relay: none — direct fetch."), "ok");
      }));

      el.querySelector(".lan-init").addEventListener("click", () => guard("preparing…", async () => {
        read();
        const r = await initialise(dev);
        pill("card ready", "ok");
        hint(`${r.backend}: rgj/ present, ${r.wrote ? "device marker written" : "device marker already there"}.`, "ok");
      }));

      el.querySelector(".lan-pull").addEventListener("click", () => guard("pulling…", async () => {
        read();
        const { text, missing, backend } = await pull(dev);
        if (missing) { pill("no queue file", ""); hint(`${backend}: no ${dev.queue} on the card yet — play a session, or press Prepare card.`, ""); return; }
        const before = state.queued.length;
        const added = typeof importRows === "function" ? importRows(text, `${dev.label} over LAN`) : 0;
        const fresh = state.queued.slice(before);
        let acked = 0;
        if (fresh.length) {
          markEarned(fresh);
          try { acked = await ack(dev, fresh); } catch (e) { logSync?.(`Ack not written: ${e.message}`, "err"); }
        }
        pill(`${added} new row${added === 1 ? "" : "s"}`, added ? "ok" : "");
        hint(`${backend}: ${added} row(s) imported${acked ? `, ${acked} acked back to the device` : ""}.`, added ? "ok" : "");
      }));

      el.querySelector(".lan-forget").addEventListener("click", () => {
        const i = cfg.devices.findIndex(d => d.id === dev.id);
        cfg.devices.splice(i, 1);
        tokens.delete(dev.id);
        save();
        if (!cfg.devices.length) { cfg = structuredClone(DEFAULTS); save(); }
        paint();
      });
    };

    paint();

    // A second ArkOS handheld is one button away: same shape, empty credentials.
    const add = document.createElement("button");
    add.className = "btn btn-ghost btn-small";
    add.textContent = "+ Add LAN device";
    add.style.margin = "8px 0 16px";
    add.addEventListener("click", () => {
      const n = cfg.devices.length + 1;
      cfg.devices.push({
        id: `lan${n}_hw`, label: `LAN device ${n}`, base: "", user: "", pass: "",
        backend: "auto", queue: "rgj/rgj-queue.jsonl", marker: "rgj-device.json"
      });
      save(); paint();
    });
    grid.insertBefore(add, anchor);
  }

  window.RGJLan = {
    probe, pull, ack, initialise, testRow, markEarned, hashGame,
    devices: () => cfg.devices, _send: send, _backend: backendFor
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
