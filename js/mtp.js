// MTP adapter — a device on the end of a USB cable, no card reader, no driver swap.
//
// WebUSB blocks the mass-storage class, so a card mounted as a USB drive can never be
// read from a page. MTP is a different animal: it speaks PTP over a still-image /
// vendor-specific interface, which WebUSB is allowed to claim. libmtp-web compiles
// libmtp to WebAssembly and exposes it as File System Access handles, so an MTP device
// becomes a volume the existing sdcard.js adapter can read and write unchanged.
//
// Two consequences worth knowing:
//  - MTP lists each storage separately ("Internal Storage", "SD Card"), so a device
//    with saves on both cards gives us both volumes in one connection. This is the
//    part the card-reader path could never do without the user linking twice.
//  - Handles are backed by a live session and cannot be stored in IndexedDB, so MTP
//    volumes are re-established on each page load from navigator.usb.getDevices().
import { mtpDeviceFilters, requestMtpFileSystem } from "./vendor/libmtp-web/index.js";

const MTP_WASM = new URL("./vendor/libmtp-web/mtp.wasm", import.meta.url).href;
const MTP = { fs: null, connecting: false, device: null };

function mtpEl(id) { return document.querySelector(id); }
function mtpPill(text, cls = "") {
  const el = mtpEl("#mtp-pill");
  if (el) { el.textContent = text; el.className = `usb-pill ${cls}`.trim(); }
}
function mtpSet(id, val) { const el = mtpEl(id); if (el) el.textContent = val; }
function mtpHint(html) { const el = mtpEl("#mtp-hint"); if (el) el.innerHTML = html; }

function mtpSummary(fs) {
  const d = fs.device || {};
  return d.friendlyName || d.modelName || "MTP device";
}

/* Drop every MTP-backed volume from the shared list without touching card volumes. */
function mtpDropVolumes() {
  FSA.volumes = FSA.volumes.filter(v => !v.mtp);
  mtpRenderStorages();
}

function mtpRenderStorages() {
  const list = mtpEl("#mtp-storages");
  if (!list) return;
  const vols = FSA.volumes.filter(v => v.mtp);
  list.innerHTML = vols.map(v => {
    const mark = v.device ? `${v.device.model} · ${v.device.device_id}` : "no rgj-device.json";
    const q = v.hasQueue ? v.queuePath : "no queue";
    return `<li><strong>${v.handle.name}</strong><span class="vol-meta">${mark} — ${q}</span></li>`;
  }).join("");
  mtpSet("#mtp-storage", vols.length ? vols.map(v => v.handle.name).join(", ") : "—");
}

/* Open the device and adopt each storage as a volume. */
async function mtpAdopt(fs) {
  MTP.fs = fs;
  MTP.device = fs.device || {};
  mtpDropVolumes();

  const storages = [];
  for await (const [name, handle] of fs.root.entries()) {
    if (handle.kind === "directory") storages.push({ name, handle });
  }
  if (!storages.length) {
    logSync(`${mtpSummary(fs)}: connected, but no storage is visible. Unlock the handheld and pick “File transfer” on its USB prompt.`, "err");
    mtpPill("no storage", "warn");
    return 0;
  }

  let withQueue = 0;
  for (const s of storages) {
    const vol = { key: `mtp:${s.name}`, handle: s.handle, permitted: true, device: null, hasQueue: false, mtp: true };
    FSA.volumes.push(vol);
    await fsaLoadMarker(vol);          // marker + queue discovery, same code path as a card
    if (vol.hasQueue) withQueue++;
    logSync(`${mtpSummary(fs)}/${s.name}: ${vol.device ? `${vol.device.model} · ${vol.device.device_id}` : "unidentified"}` +
      `, ${vol.hasQueue ? `progress file at ${vol.queuePath}` : "no progress file found"}.`, vol.hasQueue ? "ok" : "");
  }

  mtpPill(storages.length === 1 ? "1 storage" : `${storages.length} storages`, "live");
  mtpSet("#mtp-device", mtpSummary(fs));
  mtpHint(storages.length === 1
    ? "One storage found. If saves live on a second SD card, the handheld may only show it while that card is in."
    : `${storages.length} storages found — reading covers all of them and leaves a receipt on each.`);
  mtpRenderStorages();
  await fsaLoadAll();
  return storages.length;
}

async function mtpConnect(manual = true) {
  if (MTP.connecting) return;
  if (!("usb" in navigator)) {
    mtpPill("unsupported", "warn");
    mtpHint("<strong>This browser cannot read a handheld over its cable.</strong> Chrome or Edge on a computer can.");
    return;
  }
  MTP.connecting = true;
  try {
    if (manual) {
      const filters = await mtpDeviceFilters({ wasmUrl: MTP_WASM });
      await navigator.usb.requestDevice({ filters });   // must follow the click
      mtpPill("opening…", "warn");
    }
    const fs = await requestMtpFileSystem({ wasmUrl: MTP_WASM });
    await mtpAdopt(fs);
    if (manual) logSync(`Handheld connected: ${mtpSummary(fs)} (${fs.session?.storages?.length || 0} storage${(fs.session?.storages?.length || 0) === 1 ? "" : "s"}).`, "ok");
  } catch (e) {
    const name = e?.name || "";
    if (name === "NotFoundError" || name === "AbortError") { mtpPill("no device", ""); return; }
    if (name === "MtpDeviceNotFoundError") {
      mtpPill("not paired", "warn");
      mtpHint("<strong>No handheld paired with this browser yet.</strong> Press <em>Connect handheld</em> and pick it from the list.");
      return;
    }
    if (name === "MtpOpenError") {
      mtpPill("blocked", "err");
      mtpHint("<strong>The handheld refused to open.</strong> On Windows this usually means another program (File Explorer, a phone-sync app) is already holding the connection — close those windows and plug it in again. Some builds use a driver the browser cannot talk to.");
      logSync(`Could not open the handheld: ${e.message}. Close any Explorer windows pointed at it and plug it back in.`, "err");
      return;
    }
    logSync(`Connecting the handheld failed: ${e.message}`, "err");
    mtpPill("failed", "err");
  } finally {
    MTP.connecting = false;
  }
}

/* Reconnect after a reload — permission survives, the session does not. */
async function mtpRestore() {
  if (!("usb" in navigator)) { mtpPill("unsupported", "warn"); return; }
  let granted = [];
  try { granted = await navigator.usb.getDevices(); } catch (e) { return; }
  if (!granted.length) { mtpPill("no device"); return; }
  mtpPill("reconnecting…", "warn");
  try {
    const fs = await requestMtpFileSystem({ wasmUrl: MTP_WASM });
    await mtpAdopt(fs);
  } catch (e) {
    mtpPill("paired, not open", "warn");
    mtpHint("A handheld is paired but not open — plug it in, unlock it, and press <em>Connect handheld</em>.");
  }
}

async function mtpDetach() {
  try { await MTP.fs?.close(); } catch (e) { /* already gone */ }
  MTP.fs = null;
  mtpDropVolumes();
  mtpPill("no device");
  mtpSet("#mtp-device", "—"); mtpSet("#mtp-storage", "—");
  mtpHint("");
  await fsaLoadAll();
  logSync("Handheld disconnected.");
}

function mtpInit() {
  mtpEl("#btn-mtp-connect")?.addEventListener("click", () => mtpConnect(true));
  mtpEl("#btn-mtp-detach")?.addEventListener("click", mtpDetach);

  if (!("usb" in navigator)) {
    mtpPill("unsupported", "warn");
    mtpHint("<strong>This browser cannot read a handheld over its cable.</strong> Chrome or Edge on a computer can.");
    return;
  }
  navigator.usb.addEventListener("disconnect", e => {
    if (!MTP.fs) return;
    logSync(`Handheld unplugged (${e.device.productName || "device"}) — its storage left the list.`, "err");
    MTP.fs = null;
    mtpDropVolumes();
    mtpPill("unplugged", "warn");
    fsaLoadAll();
  });
  navigator.usb.addEventListener("connect", () => {
    if (!MTP.fs) { mtpPill("device present", "live"); mtpHint("Handheld seen. Press <em>Connect handheld</em> to open its storage."); }
  });
  mtpRestore();
}

window.__rgjMtpLoaded = true;
mtpInit();
