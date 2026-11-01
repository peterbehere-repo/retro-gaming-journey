// SD-card / handheld-volume adapter (File System Access API).
// Covers the mass-storage fleet: PowKiddy RGB30, RGB10X, Batlexp G350 (ArkOS),
// Miyoo A30 (Spruce), Miyoo Mini Plus (Onion, when used wired), and any card reader.
// Contract: volume root holds rgj-device.json; queue rows live at rgj/rgj-queue.jsonl;
// this page writes rgj/rgj-ack.json after a successful pull so the device can prune.
"use strict";

const FSA = {
  handle: null,     // FileSystemDirectoryHandle for the volume root
  device: null,     // parsed rgj-device.json
  queuePath: "rgj/rgj-queue.jsonl",
  ackPath: "rgj/rgj-ack.json",
  markerPath: "rgj-device.json"
};

const FSA_DB = "rgj-fsa-v1";
const FSA_STORE = "handles";

/* ---------- tiny IndexedDB wrapper: persist the directory handle ---------- */
function fsaDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FSA_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FSA_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function fsaIdbGet(key) {
  const db = await fsaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FSA_STORE, "readonly").objectStore(FSA_STORE).get(key);
    tx.onsuccess = () => resolve(tx.result || null);
    tx.onerror = () => reject(tx.error);
  });
}
async function fsaIdbSet(key, val) {
  const db = await fsaDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FSA_STORE, "readwrite").objectStore(FSA_STORE).put(val, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function fsaIdbDel(key) {
  const db = await fsaDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FSA_STORE, "readwrite").objectStore(FSA_STORE).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- UI helpers ---------- */
function fsaPill(text, cls = "") {
  const el = document.querySelector("#fsa-pill");
  if (el) { el.textContent = text; el.className = `usb-pill ${cls}`.trim(); }
}
function fsaSet(id, val) { const el = document.querySelector(id); if (el) el.textContent = val; }
function fsaHint(html) { const el = document.querySelector("#fsa-hint"); if (el) el.innerHTML = html; }
function fsaPullEnabled(on) {
  const b = document.querySelector("#btn-fsa-pull");
  if (b) b.disabled = !on;
}

async function fsaWrite(path, text) {
  const parts = path.split("/");
  const name = parts.pop();
  let dir = FSA.handle;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function fsaRead(path) {
  const parts = path.split("/");
  const name = parts.pop();
  let dir = FSA.handle;
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).text();
}

async function fsaExists(path) {
  try {
    const parts = path.split("/");
    const name = parts.pop();
    let dir = FSA.handle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    await dir.getFileHandle(name);
    return true;
  } catch (e) { return false; }
}

/* ---------- read the marker and show identity ---------- */
async function fsaLoadMarker() {
  if (!FSA.handle) return;
  fsaSet("#fsa-volume", FSA.handle.name);
  if (!(await fsaExists(FSA.markerPath))) {
    FSA.device = null;
    fsaPill("no marker", "warn");
    fsaSet("#fsa-device", "unidentified volume");
    fsaSet("#fsa-os", "—");
    fsaSet("#fsa-queue", "missing");
    fsaHint("This volume has no <code>rgj-device.json</code>. Press <em>Prepare card</em> to write one, " +
      "or check you picked the card root and not a sub-folder.");
    return;
  }
  try {
    const dev = JSON.parse(await fsaRead(FSA.markerPath));
    FSA.device = dev;
    if (dev.queue) FSA.queuePath = dev.queue;
    if (dev.ack) FSA.ackPath = dev.ack;
    fsaSet("#fsa-device", `${dev.model || "unnamed"} · ${dev.device_id || "no id"}`);
    fsaSet("#fsa-os", [dev.os, dev.schema ? `schema v${dev.schema}` : ""].filter(Boolean).join(" · ") || "—");
    const hasQueue = await fsaExists(FSA.queuePath);
    fsaSet("#fsa-queue", hasQueue ? FSA.queuePath : `${FSA.queuePath} (not yet created)`);
    fsaPill("card linked", "live");
    fsaPullEnabled(hasQueue);
    const ackOk = await fsaExists(FSA.ackPath);
    if (ackOk) {
      try {
        const ack = JSON.parse(await fsaRead(FSA.ackPath));
        fsaSet("#fsa-last-ack", `${new Date(ack.acked_at).toLocaleString()} · ${ack.rows_acked} row(s)`);
      } catch (e) { fsaSet("#fsa-last-ack", "unreadable ack"); }
    } else {
      fsaSet("#fsa-last-ack", "none yet");
    }
    fsaHint(`Linked to <strong>${dev.model || "device"}</strong>. Pull reads <code>${FSA.queuePath}</code> and writes an ack back so the device can prune what was taken.`);
  } catch (e) {
    fsaPill("bad marker", "warn");
    fsaHint(`Could not parse <code>rgj-device.json</code>: ${e.message}`);
  }
}

/* ---------- link / forget ---------- */
async function fsaLink() {
  if (!("showDirectoryPicker" in window)) {
    fsaPill("unsupported", "warn");
    fsaHint("<strong>This browser cannot open folders.</strong> Use Chrome or Edge on desktop over HTTPS.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ id: "rgj-handheld", mode: "readwrite", startIn: "desktop" });
    FSA.handle = handle;
    await fsaIdbSet("volume", handle);
    logSync(`Card linked: ${handle.name}.`, "ok");
    await fsaLoadMarker();
  } catch (e) {
    if (e.name === "AbortError") return;
    logSync(`Folder link failed: ${e.message}`, "err");
  }
}

async function fsaForget() {
  FSA.handle = null; FSA.device = null;
  await fsaIdbDel("volume");
  fsaPill("not linked");
  fsaSet("#fsa-device", "—"); fsaSet("#fsa-os", "—"); fsaSet("#fsa-volume", "—");
  fsaSet("#fsa-queue", "—"); fsaSet("#fsa-last-ack", "—");
  fsaPullEnabled(false);
  fsaHint("Link the volume again with <em>Link handheld folder</em>. Nothing on the card was touched.");
  logSync("Card unlinked from this browser (no files changed).");
}

/* ---------- prepare a card: marker + queue scaffold ---------- */
async function fsaPrepare() {
  if (!FSA.handle) { await fsaLink(); if (!FSA.handle) return; }
  if (!(await fsaEnsurePermission())) return;
  const name = FSA.handle.name;
  const guess = /rgb30/i.test(name) ? { model: "PowKiddy RGB30", os: "ArkOS" }
    : /rgb10/i.test(name) ? { model: "PowKiddy RGB10X", os: "ArkOS" }
    : /a30/i.test(name) ? { model: "Miyoo A30", os: "Spruce OS" }
    : /g350/i.test(name) ? { model: "Batlexp G350", os: "ArkOS" }
    : /miyoo|mini/i.test(name) ? { model: "Miyoo Mini Plus", os: "Onion OS" }
    : { model: name, os: "unknown" };
  const slug = guess.model.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const dev = {
    device_id: `${slug}_hw01`, model: guess.model, os: guess.os, schema: 1,
    queue: FSA.queuePath, ack: FSA.ackPath, prepared_at: new Date().toISOString()
  };
  if (await fsaExists(FSA.markerPath)) {
    const existing = await fsaRead(FSA.markerPath);
    logSync(`${FSA.markerPath} already exists — left untouched.`, "err");
    FSA.device = JSON.parse(existing);
  } else {
    await fsaWrite(FSA.markerPath, JSON.stringify(dev, null, 2) + "\n");
    logSync(`Wrote ${FSA.markerPath} (${dev.device_id}).`, "ok");
  }
  if (!(await fsaExists(FSA.queuePath))) {
    await fsaWrite(FSA.queuePath, "");
    logSync(`Created empty queue at ${FSA.queuePath}.`, "ok");
  }
  await fsaLoadMarker();
}

/* ---------- permission + pull + ack ---------- */
async function fsaEnsurePermission() {
  if (!FSA.handle) return false;
  const opts = { mode: "readwrite" };
  if ((await FSA.handle.queryPermission(opts)) === "granted") return true;
  if ((await FSA.handle.requestPermission(opts)) === "granted") return true;
  logSync("Folder permission denied — the card stays read-blocked until you allow it.", "err");
  fsaPill("permission", "warn");
  return false;
}

async function fsaPull() {
  if (!FSA.handle) { logSync("No card linked — press “Link handheld folder” first.", "err"); return; }
  if (!(await fsaEnsurePermission())) return;
  let raw = "";
  try {
    if (await fsaExists(FSA.queuePath)) raw = await fsaRead(FSA.queuePath);
    else if (await fsaExists("rgj-queue.jsonl")) raw = await fsaRead("rgj-queue.jsonl");
    else if (await fsaExists("rgj/rgj-queue.JSONL")) raw = await fsaRead("rgj/rgj-queue.JSONL");
  } catch (e) {
    logSync(`Queue read failed: ${e.message}`, "err"); return;
  }
  if (!raw.trim()) { logSync(`Queue file is empty on ${FSA.handle.name} — nothing to pull.`); return; }

  const before = state.queued.length;
  const added = importRows(raw, `${FSA.handle.name}/${FSA.queuePath}`);
  if (added) {
    const rows = state.queued.slice(before);
    const ack = {
      device_id: FSA.device?.device_id || FSA.handle.name,
      acked_by: "web-dashboard",
      acked_at: new Date().toISOString(),
      rows_acked: added,
      max_timestamp: Math.max(...rows.map(r => r.timestamp || 0)),
      rows: rows.map(r => ({ game_hash: r.game_hash, achievement_id: r.achievement_id, timestamp: r.timestamp }))
    };
    try {
      await fsaWrite(FSA.ackPath, JSON.stringify(ack, null, 2) + "\n");
      logSync(`Ack written to ${FSA.ackPath} (${added} row(s)) — the device may now prune them.`, "ok");
    } catch (e) {
      logSync(`Ack write failed: ${e.message}. Rows are still queued here, so nothing is lost.`, "err");
    }
  }
  await fsaLoadMarker();
}

/* ---------- boot ---------- */
async function fsaInit() {
  const supported = "showDirectoryPicker" in window;
  document.querySelector("#btn-fsa-link").addEventListener("click", fsaLink);
  document.querySelector("#btn-fsa-prepare").addEventListener("click", fsaPrepare);
  document.querySelector("#btn-fsa-forget").addEventListener("click", fsaForget);
  document.querySelector("#btn-fsa-pull").addEventListener("click", fsaPull);

  if (!supported) {
    fsaPill("unsupported", "warn");
    fsaHint("<strong>This browser cannot open folders.</strong> Chrome or Edge on desktop, over HTTPS.");
    return;
  }
  if (!window.isSecureContext) {
    fsaPill("needs HTTPS", "warn");
    fsaHint("<strong>Folder access needs a secure page.</strong> Serve over HTTPS or localhost.");
    return;
  }
  const saved = await fsaIdbGet("volume");
  if (saved) {
    FSA.handle = saved;
    const perm = await saved.queryPermission({ mode: "readwrite" });
    fsaSet("#fsa-volume", saved.name);
    if (perm === "granted") { await fsaLoadMarker(); }
    else {
      fsaPill("reconfirm", "warn");
      fsaSet("#fsa-device", "remembered volume");
      fsaHint(`<strong>${saved.name}</strong> is remembered. Press <em>Pull from card</em> (or <em>Link</em>) once and allow access — this is the browser asking, not us.`);
      fsaPullEnabled(true);
    }
  }
}

fsaInit();
