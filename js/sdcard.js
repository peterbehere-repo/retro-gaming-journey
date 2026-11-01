// SD-card / handheld-volume adapter (File System Access API).
// Covers the mass-storage fleet: PowKiddy RGB30, RGB10X, Batlexp G350 (ArkOS),
// Miyoo A30 (Spruce), Miyoo Mini Plus (Onion, when used wired), and any card reader.
//
// MULTI-VOLUME: a handheld can keep saves on a second SD card, and a volume can be a
// card *reader* rather than a device. One browser handle = one volume, and the browser
// will never enumerate drives for us, so every volume is linked by hand once and then
// remembered. Sync walks all of them.
//
// Contract per volume: root holds rgj-device.json; queue rows at rgj/rgj-queue.jsonl;
// this page writes rgj/rgj-ack.json + rgj/rgj-ack.keys after a successful pull.
"use strict";

const FSA = {
  volumes: [],      // [{ key, handle, device, queuePath, ackPath, ackKeysPath }]
  markerPath: "rgj-device.json",
  defaults: {
    queuePath: "rgj/rgj-queue.jsonl",
    ackPath: "rgj/rgj-ack.json",
    ackKeysPath: "rgj/rgj-ack.keys"
  }
};

const FSA_DB = "rgj-fsa-v1";
const FSA_STORE = "handles";
const FSA_KEY = "volumes";

// Where a second card's queue might live if the device script is run against a
// different mount point. Tried in order; first hit wins.
const FSA_QUEUE_CANDIDATES = [
  "rgj/rgj-queue.jsonl",
  "rgj-queue.jsonl",
  "rgj/rgj-queue.JSONL",
  "saves/rgj/rgj-queue.jsonl",
  "roms/rgj/rgj-queue.jsonl"
];

/* ---------- tiny IndexedDB wrapper: persist handles ---------- */
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

function fsaRenderVolumes() {
  const list = document.querySelector("#fsa-volumes");
  if (!list) return;
  list.innerHTML = "";
  for (const v of FSA.volumes) {
    const li = document.createElement("li");
    const label = v.device
      ? `${v.device.model || "unnamed"} · ${v.device.device_id || "no id"}`
      : `${v.handle.name} · no marker`;
    const where = v.queuePath && v.queuePath !== FSA.defaults.queuePath ? ` (${v.queuePath})` : "";
    li.textContent = `${label} — ${v.handle.name}${where}`;
    if (v.readonly) li.textContent += " — read-only";
    list.appendChild(li);
  }
  // legacy single-value fields describe the whole set now
  fsaSet("#fsa-volume", FSA.volumes.length
    ? FSA.volumes.map(v => v.handle.name).join(", ")
    : "—");
  fsaSet("#fsa-device", FSA.volumes.length
    ? FSA.volumes.map(v => v.device?.model || "unidentified").join(" + ")
    : "—");
  fsaSet("#fsa-os", FSA.volumes.length
    ? [...new Set(FSA.volumes.map(v => v.device?.os).filter(Boolean))].join(", ") || "—"
    : "—");
  fsaSet("#fsa-queue", FSA.volumes.filter(v => v.hasQueue).map(v => v.queuePath).join(", ")
    || (FSA.volumes.length ? "no queue on any volume" : "—"));
}

/* ---------- per-volume file helpers ---------- */
async function fsaReadAt(vol, path) {
  const parts = path.split("/");
  const name = parts.pop();
  let dir = vol.handle;
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).text();
}
async function fsaWriteAt(vol, path, text) {
  const parts = path.split("/");
  const name = parts.pop();
  let dir = vol.handle;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  // MTP sizes an object before the first byte flows, so declare the length.
  // File System Access ignores the extra option.
  const bytes = new TextEncoder().encode(text);
  const w = await fh.createWritable({ size: bytes.length });
  await w.write(bytes);
  await w.close();
}
async function fsaExistsAt(vol, path) {
  try {
    const parts = path.split("/");
    const name = parts.pop();
    let dir = vol.handle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    await dir.getFileHandle(name);
    return true;
  } catch (e) { return false; }
}

/* ---------- read the marker and show identity ---------- */
async function fsaLoadMarker(vol) {
  vol.device = null;
  vol.queuePath = FSA.defaults.queuePath;
  vol.ackPath = FSA.defaults.ackPath;
  vol.ackKeysPath = FSA.defaults.ackKeysPath;
  vol.hasQueue = false;

  if (await fsaExistsAt(vol, FSA.markerPath)) {
    try {
      const dev = JSON.parse(await fsaReadAt(vol, FSA.markerPath));
      vol.device = dev;
      if (dev.queue) vol.queuePath = dev.queue;
      if (dev.ack) vol.ackPath = dev.ack;
    } catch (e) {
      logSync(`${vol.handle.name}: rgj-device.json is not valid JSON — treated as unidentified.`, "err");
    }
  }
  // a second card often has the queue elsewhere; probe the usual spots
  for (const cand of [vol.queuePath, ...FSA_QUEUE_CANDIDATES]) {
    if (await fsaExistsAt(vol, cand)) { vol.queuePath = cand; vol.hasQueue = true; break; }
  }
  fsaRenderVolumes();
}

async function fsaLoadAll() {
  for (const vol of FSA.volumes) await fsaLoadMarker(vol);
  const ready = FSA.volumes.filter(v => v.hasQueue && v.permitted);
  fsaPullEnabled(ready.length > 0);
  if (!FSA.volumes.length) { fsaPill("not linked"); fsaHint(""); return; }

  const missing = FSA.volumes.filter(v => !v.device);
  fsaPill(ready.length ? `${FSA.volumes.length} volume(s) linked` : "linked", ready.length ? "live" : "warn");
  const bits = [];
  if (ready.length) bits.push(`Pull reads ${ready.length} queue${ready.length > 1 ? "s" : ""} and writes an ack to each volume it takes rows from.`);
  if (missing.length) bits.push(`${missing.length} volume(s) have no <code>${FSA.markerPath}</code> — run <code>rgj-sync init</code> on the device, or press <em>Prepare card</em>. A card holding only saves is fine to leave unidentified.`);
  const reconfirm = FSA.volumes.filter(v => !v.permitted);
  if (reconfirm.length) bits.push(`${reconfirm.length} volume(s) need a one-time permission click — press <em>Pull from card</em> and allow when the browser asks.`);
  fsaHint(bits.join(" "));
  window.dispatchEvent(new CustomEvent("rgj:volumes"));
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
    const dup = FSA.volumes.find(v => v.handle.name === handle.name);
    if (dup) {
      dup.handle = handle;
      logSync(`Volume ${handle.name} re-linked (replaced the remembered handle).`, "ok");
    } else {
      FSA.volumes.push({ key: handle.name, handle, permitted: true, device: null, hasQueue: false });
      logSync(`Volume linked: ${handle.name}.`, "ok");
    }
    await fsaLoadMarker(FSA.volumes.find(v => v.handle.name === handle.name));
    await fsaPersist();
    await fsaLoadAll();
  } catch (e) {
    if (e.name === "AbortError") return;
    logSync(`Folder link failed: ${e.message}`, "err");
  }
}

async function fsaForget() {
  FSA.volumes = [];
  await fsaIdbDel(FSA_KEY);
  await fsaIdbDel("volume"); // older single-volume key
  fsaPill("not linked");
  fsaSet("#fsa-device", "—"); fsaSet("#fsa-os", "—"); fsaSet("#fsa-volume", "—");
  fsaSet("#fsa-queue", "—"); fsaSet("#fsa-last-ack", "—");
  fsaRenderVolumes();
  fsaPullEnabled(false);
  window.dispatchEvent(new CustomEvent("rgj:volumes"));
  fsaHint("Volumes forgotten by this browser. Nothing on any card was touched.");
  logSync("All volumes unlinked from this browser (no files changed).");
}

async function fsaPersist() {
  // handle objects are structured-cloneable and survive in IndexedDB — but MTP handles
  // are backed by a live USB session and are not, so those are skipped and rebuilt on load.
  await fsaIdbSet(FSA_KEY, FSA.volumes.filter(v => !v.mtp).map(v => v.handle));
}

/* ---------- prepare a volume: marker + queue scaffold ---------- */
async function fsaPrepare() {
  let vol = FSA.volumes[FSA.volumes.length - 1];
  if (!vol) { await fsaLink(); vol = FSA.volumes[0]; if (!vol) return; }
  if (!(await fsaEnsurePermission(vol))) return;
  const name = vol.handle.name;
  const guess = /rgb30/i.test(name) ? { model: "PowKiddy RGB30", os: "ArkOS" }
    : /rgb10/i.test(name) ? { model: "PowKiddy RGB10X", os: "ArkOS" }
    : /a30/i.test(name) ? { model: "Miyoo A30", os: "Spruce OS" }
    : /g350/i.test(name) ? { model: "Batlexp G350", os: "ArkOS" }
    : /miyoo|mini/i.test(name) ? { model: "Miyoo Mini Plus", os: "Onion OS" }
    : { model: name, os: "unknown" };
  const slug = guess.model.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const dev = {
    device_id: `${slug}_hw01`, model: guess.model, os: guess.os, schema: 1,
    queue: FSA.defaults.queuePath, ack: FSA.defaults.ackPath, prepared_at: new Date().toISOString()
  };
  if (await fsaExistsAt(vol, FSA.markerPath)) {
    logSync(`${FSA.markerPath} already exists on ${name} — left untouched.`, "err");
  } else {
    await fsaWriteAt(vol, FSA.markerPath, JSON.stringify(dev, null, 2) + "\n");
    logSync(`Wrote ${FSA.markerPath} on ${name} (${dev.device_id}).`, "ok");
  }
  if (!(await fsaExistsAt(vol, FSA.defaults.queuePath))) {
    await fsaWriteAt(vol, FSA.defaults.queuePath, "");
    logSync(`Created empty queue at ${FSA.defaults.queuePath} on ${name}.`, "ok");
  }
  await fsaLoadMarker(vol);
  await fsaLoadAll();
}

/* ---------- permission + pull + ack ---------- */
async function fsaEnsurePermission(vol) {
  const opts = { mode: "readwrite" };
  try {
    if ((await vol.handle.queryPermission(opts)) === "granted") { vol.permitted = true; return true; }
    if ((await vol.handle.requestPermission(opts)) === "granted") { vol.permitted = true; return true; }
  } catch (e) { /* fall through */ }
  vol.permitted = false;
  logSync(`${vol.handle.name}: permission denied — that volume stays read-blocked until you allow it.`, "err");
  return false;
}

async function fsaPullFromVolume(vol) {
  if (!vol.hasQueue) {
    logSync(`${vol.handle.name}: no queue file found — nothing to pull.`, "");
    return 0;
  }
  let raw = "";
  try {
    raw = await fsaReadAt(vol, vol.queuePath);
  } catch (e) {
    logSync(`${vol.handle.name}: queue read failed (${e.message}).`, "err");
    return 0;
  }
  if (!raw.trim()) { logSync(`${vol.handle.name}: queue is empty.`, ""); return 0; }

  const before = state.queued.length;
  const added = importRows(raw, `${vol.handle.name}/${vol.queuePath}`);
  if (!added) { logSync(`${vol.handle.name}: ${vol.queuePath} — no new rows.`, ""); return 0; }

  const rows = state.queued.slice(before);
  const ack = {
    device_id: vol.device?.device_id || vol.handle.name,
    volume: vol.handle.name,
    acked_by: "web-dashboard",
    acked_at: new Date().toISOString(),
    rows_acked: added,
    max_timestamp: Math.max(...rows.map(r => r.timestamp || 0)),
    rows: rows.map(r => ({ game_hash: r.game_hash, achievement_id: r.achievement_id, timestamp: r.timestamp }))
  };
  try {
    await fsaWriteAt(vol, vol.ackPath, JSON.stringify(ack, null, 2) + "\n");
    // flat key file: one "hash|aid|timestamp" per line, readable by the
    // device-side rgj-sync script without a JSON parser.
    const priorKeys = (await fsaExistsAt(vol, vol.ackKeysPath)) ? await fsaReadAt(vol, vol.ackKeysPath) : "";
    const fresh = new Set(priorKeys.split("\n").map(l => l.trim()).filter(Boolean));
    for (const r of ack.rows) fresh.add(`${r.game_hash}|${r.achievement_id}|${r.timestamp}`);
    await fsaWriteAt(vol, vol.ackKeysPath, [...fresh].join("\n") + "\n");
    logSync(`${vol.handle.name}: pulled ${added} row(s); ack + key file written so the device can prune.`, "ok");
    const el = document.querySelector("#fsa-last-ack");
    if (el) el.textContent = `${new Date(ack.acked_at).toLocaleString()} · ${added} row(s) from ${vol.handle.name}`;
  } catch (e) {
    logSync(`${vol.handle.name}: ack write failed (${e.message}). Rows are queued here, so nothing is lost.`, "err");
  }
  return added;
}

async function fsaPull() {
  if (!FSA.volumes.length) { logSync("No volume linked — press “Link another volume” first.", "err"); return; }
  let total = 0, scanned = 0, needsClick = 0;
  for (const vol of FSA.volumes) {
    if (!(await fsaEnsurePermission(vol))) { needsClick++; continue; }
    await fsaLoadMarker(vol);
    scanned++;
    total += await fsaPullFromVolume(vol);
  }
  logSync(scanned
    ? `Sync complete: ${total} new row(s) from ${scanned} volume(s).`
    : "No volume could be read.", scanned ? "ok" : "err");
  if (needsClick) logSync(`${needsClick} volume(s) still need permission — press Pull again and allow the browser prompt.`, "err");
  await fsaLoadAll();
}

/* ---------- boot ---------- */
async function fsaInit() {
  const supported = "showDirectoryPicker" in window;
  document.querySelector("#btn-fsa-link")?.addEventListener("click", fsaLink);
  document.querySelector("#btn-fsa-prepare")?.addEventListener("click", fsaPrepare);
  document.querySelector("#btn-fsa-forget")?.addEventListener("click", fsaForget);
  document.querySelector("#btn-fsa-pull")?.addEventListener("click", fsaPull);

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

  const saved = (await fsaIdbGet(FSA_KEY)) || [];
  const legacy = await fsaIdbGet("volume");
  const handles = Array.isArray(saved) && saved.length ? saved : (legacy ? [legacy] : []);

  for (const handle of handles) {
    let perm = "prompt";
    try { perm = await handle.queryPermission({ mode: "readwrite" }); } catch (e) { perm = "denied"; }
    FSA.volumes.push({
      key: handle.name, handle, permitted: perm === "granted",
      device: null, hasQueue: false
    });
  }
  if (!FSA.volumes.length) { fsaRenderVolumes(); return; }

  for (const vol of FSA.volumes.filter(v => v.permitted)) await fsaLoadMarker(vol);
  await fsaLoadAll();
  if (legacy && !saved.length) await fsaPersist();
}

fsaInit();
