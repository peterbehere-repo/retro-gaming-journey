/* Retro Gaming Journey — LAN adapter (FileBrowser on ArkOS / Onion / Spruce)
 *
 * ArkOS ships FileBrowser ("ArkOS Browser") which serves the EASYROMS tree with a real
 * HTTP API:  POST /api/login -> JWT,  GET /api/raw/<path>,  PUT|POST /api/resources/<path>.
 * A volume reached this way implements read/write/exists, so the card adapter's marker
 * discovery and pull/ack logic runs unchanged — the transport is the only difference.
 *
 * FileBrowser sends no CORS headers, so a page served from another origin cannot read it
 * directly. Transport therefore degrades: direct fetch first, then the Rool Web Bridge
 * extension (host permissions bypass CORS), then a clear error telling the user which.
 */
window.LAN = (function () {
  const state = { configs: [], busy: false };
  const CFG_KEY = "rgj.lan.config.v2";

  function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
  function hint(html, kind) {
    const el = document.querySelector("#lan-hint");
    if (!el) return;
    el.innerHTML = html || "";
    el.style.color = kind === "err" ? "#ff8080" : kind === "ok" ? "#9ff5d4" : "";
  }
  function log(msg) {
    if (typeof logSync === "function") logSync(msg, "");
    else console.log("[lan]", msg);
  }

  /* ---------- transport ---------- */

  // `FSA` is declared with `const` in sdcard.js: a global lexical binding, not a window
  // property, and this file loads before that one parses. Reference it by bare name at
  // call time (not at load time) and it resolves fine.
  function fsa() { try { return typeof FSA === "undefined" ? null : FSA; } catch (e) { return null; } }
  function fsaReady() { return !!fsa(); }

  function bridgeAvailable() {
    return typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function";
  }

  async function http(url, opts) {
    const o = opts || {};
    let res;
    try {
      res = await fetch(url, {
        method: o.method || "GET",
        headers: o.headers || {},
        body: o.body,
        // no credentials: FileBrowser auth is the X-Auth token, and omitting credentials
        // keeps the request a plain CORS fetch rather than a credentialed one.
        credentials: "omit",
        cache: "no-store"
      });
    } catch (e) {
      // TypeError from fetch == network or CORS refusal, and the two are indistinguishable
      // here. Try the bridge before blaming the network.
      if (o.allowBridge !== false && window.RGJ_BRIDGE && typeof window.RGJ_BRIDGE.fetch === "function") {
        return window.RGJ_BRIDGE.fetch(url, o);
      }
      throw new Error(
        "could not reach " + new URL(url).host + " — either the device is off the network, or the " +
        "browser blocked the cross-origin read (FileBrowser sends no CORS headers). " +
        "See the note under this card."
      );
    }
    const text = await res.text();
    return { status: res.status, ok: res.ok, text: text };
  }

  function baseOf(host) {
    let h = String(host || "").trim().replace(/\s+/g, "");
    if (!h) throw new Error("device host is empty");
    if (!/^https?:\/\//i.test(h)) h = "http://" + h;
    h = h.replace(/\/+$/, "");
    h = h.replace(/\/api$/i, "");
    return h;
  }

  function encodePath(p) {
    return String(p).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  async function login(host, user, pass) {
    const base = baseOf(host);
    const r = await http(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });
    if (r.status === 403) throw new Error("username or password refused (403)");
    if (!r.ok) throw new Error("login failed: HTTP " + r.status);
    const token = r.text.trim();
    if (!token || token.length < 20) throw new Error("login returned no token");
    return { base: base, token: token, user: user };
  }

  /* ---------- volume primitives (mirror of fsaReadAt/fsaWriteAt/fsaExistsAt) ---------- */

  async function read(vol, path) {
    const r = await http(vol.lan.base + "/api/raw/" + encodePath(path), {
      headers: { "X-Auth": vol.lan.token }
    });
    if (r.status === 401) throw new Error("token expired — reconnect");
    if (!r.ok) throw new Error("HTTP " + r.status + " reading " + path);
    return r.text;
  }

  async function write(vol, path, text) {
    const r = await http(vol.lan.base + "/api/resources/" + encodePath(path) + "?override=true", {
      method: "PUT",
      headers: { "X-Auth": vol.lan.token, "Content-Type": "text/plain; charset=utf-8" },
      body: text
    });
    if (r.ok) return true;
    // older builds only create via POST
    const r2 = await http(vol.lan.base + "/api/resources/" + encodePath(path) + "?override=true", {
      method: "POST",
      headers: { "X-Auth": vol.lan.token, "Content-Type": "text/plain; charset=utf-8" },
      body: text
    });
    if (!r2.ok) throw new Error("HTTP " + r.status + " writing " + path);
    return true;
  }

  async function exists(vol, path) {
    const r = await http(vol.lan.base + "/api/resources/" + encodePath(path), {
      headers: { "X-Auth": vol.lan.token }
    });
    return r.ok;
  }

  async function listDir(vol, path) {
    const r = await http(vol.lan.base + "/api/resources/" + (path ? encodePath(path) + "/" : ""), {
      headers: { "X-Auth": vol.lan.token }
    });
    if (!r.ok) return [];
    try {
      const j = JSON.parse(r.text);
      return (j.items || []).filter(i => i.isDir).map(i => i.name);
    } catch (e) { return []; }
  }

  /* ---------- discovery ---------- */

  async function discover(conn) {
    // Candidate roots for the marker: the server root, ArkOS's first and second card
    // mounts (/roms, /roms2), then every top-level directory that exists.
    const probe = { kind: "lan", lan: conn, handle: { name: conn.base.replace(/^https?:\/\//, "") } };
    const roots = ["", "roms", "roms2"];
    for (const d of await listDir(probe, "")) if (!roots.includes(d)) roots.push(d);

    const found = [];
    for (const root of roots) {
      const v = {
        kind: "lan",
        lan: conn,
        root: root,
        handle: { name: root ? root + " @ " + conn.base.replace(/^https?:\/\//, "") : conn.base.replace(/^https?:\/\//, "") },
        readonly: false
      };
      if (!(await existsRel(v, "rgj-device.json"))) continue;
      found.push(v);
    }
    return { volumes: found, reached: roots.length > 0 };
  }

  function prefix(vol, path) { return vol.root ? vol.root + "/" + path : path; }

  // Rewrite the shared helpers' paths to sit under the volume root.
  async function readRel(vol, path) { return read(vol, prefix(vol, path)); }
  async function writeRel(vol, path, text) { return write(vol, prefix(vol, path), text); }
  async function existsRel(vol, path) { return exists(vol, prefix(vol, path)); }

  /* ---------- public API ---------- */

  async function connect(host, user, pass) {
    hint("connecting to " + host + " …");
    const conn = await login(host, user, pass);
    const res = await discover(conn);
    if (!res.volumes.length) {
      hint("Signed in, but no <code>rgj-device.json</code> found. Put the card in the device, or run " +
           "<code>./rgj-sync init</code> on it first.", "err");
      return { volumes: [] };
    }
    persist(conn);
    hint("Connected: " + res.volumes.length + " volume(s) with a sync marker.", "ok");
    return { volumes: res.volumes };
  }

  function persist(conn) {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!arr.some(c => c.base === conn.base)) arr.push({ base: conn.base, user: conn.user });
      localStorage.setItem(CFG_KEY, JSON.stringify(arr));
    } catch (e) { /* localStorage may be unavailable; reconnecting is cheap */ }
  }

  function knownHosts() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "[]"); } catch (e) { return []; }
  }

  /* ---------- UI ---------- */

  async function uiConnect() {
    const hostEl = document.querySelector("#lan-host");
    const userEl = document.querySelector("#lan-user");
    const passEl = document.querySelector("#lan-pass");
    const btn = document.querySelector("#btn-lan-connect");
    if (state.busy) return;
    state.busy = true;
    if (btn) btn.disabled = true;
    try {
      const out = await connect(hostEl.value, userEl.value, passEl.value);
      const store = fsa();
      if (out.volumes.length && store) {
        for (const v of out.volumes) {
          v.permitted = true;           // no browser permission step on this transport
          const dupe = store.volumes.find(x => x.kind === "lan" && x.lan.base === v.lan.base && x.root === v.root);
          if (dupe) { Object.assign(dupe, v); continue; }
          store.volumes.push(v);
        }
        if (typeof fsaLoadAll === "function") await fsaLoadAll();
        render();
      }
      passEl.value = "";
    } catch (e) {
      hint(e.message, "err");
    } finally {
      state.busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function render() {
    const list = document.querySelector("#lan-volumes");
    if (!list) return;
    list.innerHTML = "";
    const store = fsa();
    const vols = (store ? store.volumes : []).filter(v => v.kind === "lan");
    if (!vols.length) { list.innerHTML = "<li>No Wi-Fi volume linked</li>"; return; }
    for (const v of vols) {
      const li = document.createElement("li");
      li.innerHTML = "<strong>" + (v.device?.model || "unnamed") + "</strong> " +
        "<span class='vol-meta'>" + v.handle.name + " · " + (v.device?.device_id || "no id") +
        " · " + (v.hasQueue ? v.queuePath : "no queue") + "</span>";
      list.appendChild(li);
    }
  }

  function init() {
    const btn = document.querySelector("#btn-lan-connect");
    if (btn) btn.addEventListener("click", uiConnect);
    const forget = document.querySelector("#btn-lan-forget");
    if (forget) forget.addEventListener("click", async function () {
      const store = fsa();
      if (!store) return;
      store.volumes = store.volumes.filter(v => v.kind !== "lan");
      if (typeof fsaLoadAll === "function") await fsaLoadAll();
      render();
      hint("Wi-Fi volumes dropped from this session. Nothing on the device was touched.");
    });
    const hosts = knownHosts();
    const hostEl = document.querySelector("#lan-host");
    if (hostEl && hosts.length) hostEl.value = hosts[hosts.length - 1].base;
    const userEl = document.querySelector("#lan-user");
    if (userEl && !userEl.value) userEl.value = "ark";
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { connect: connect, read: readRel, write: writeRel, exists: existsRel, render: render, state: state };
})();
