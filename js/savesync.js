// Save files and save states -> a GitHub archive, one folder per user, one subtree per device.
//
// WHY THIS SHAPE
//   * A save is a binary blob with no mergeable structure. Nothing here tries to merge. Ever.
//   * Each device writes only under its OWN subtree, so two devices can never fight over a path.
//     A pull is therefore always safe: it can add and replace, but it can only replace blobs that
//     came from the same device_id.
//   * Save states are core- and build-specific. They are archived per device, not shared. A state
//     pulled off the RGB30 stays under rgb30; you only ever send it back to hardware running the
//     same core. Battery saves (.srm/.sav) are portable and can be restored to any device.
//   * Nothing is deleted. A device that comes back with an empty saves folder only means "no new
//     files", never "delete the archive".
//
// LAYOUT ON THE BRANCH (browsable on github.com)
//   saves/<user>/devices/<device_id>/device.json
//   saves/<user>/devices/<device_id>/<system>/<rom>/<original file name>
//
// HOW THE DIFF WORKS WITHOUT DOWNLOADING ANYTHING
//   A git blob's id is sha1("blob <len>\0" + bytes). That is computable in the browser, so the
//   page hashes a local save, compares it to the sha in the branch's tree, and knows whether the
//   archive already has those exact bytes. One tree call = the whole remote state; no index file
//   to maintain, no bookkeeping to get out of step, no extra round trips.
"use strict";

(function (global) {
  const D = {
    owner: "peterbehere-repo",
    repo: "retro-gaming-journey",
    branch: "saves",
    base: "main",
    user: "peter",
    device: "unknown",
    prefix: "saves",
    maxFileBytes: 50 * 1024 * 1024, // GitHub warns at 50 MiB, blocks at 100 MiB
    concurrency: 4
  };

  /* ---------------- bytes ---------------- */
  const enc = (s) => new TextEncoder().encode(s);
  const hex = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0");
    return s;
  };
  async function dig(alg, bytes) {
    return new Uint8Array(await global.crypto.subtle.digest(alg, bytes));
  }
  const sha256Hex = async (b) => hex(await dig("SHA-256", b));
  async function gitBlobSha(bytes) {
    const h = enc("blob " + bytes.length + "\u0000");
    const all = new Uint8Array(h.length + bytes.length);
    all.set(h, 0);
    all.set(bytes, h.length);
    return hex(await dig("SHA-1", all));
  }
  function toB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return global.btoa(s);
  }
  function fromB64(s) {
    const raw = global.atob(String(s).replace(/\s+/g, ""));
    const u = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
    return u;
  }
  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(n, items.length || 1)).fill(0).map(async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    });
    await Promise.all(workers);
    return out;
  }

  /* ---------------- names ---------------- */
  // Battery saves and states, the two families worth archiving. Anything else on a card
  // (box art, .opt, screenshots, RetroArch's own .bak files) is left where it is.
  const SRAM_EXT = {
    ".srm": "sram", ".sav": "sram", ".sra": "sram", ".eep": "eeprom",
    ".fla": "flash", ".mpk": "memcard", ".mcr": "memcard", ".dsv": "dsv", ".rtc": "rtc"
  };

  function parseSaveName(name) {
    const lower = name.toLowerCase();
    if (/\.(png|jpg|jpeg|gif|txt|tmp|part|opt|cfg|log|xml|db)$/.test(lower)) return null;
    if (lower.endsWith(".bak")) return null;   // RetroArch keeps its own; do not duplicate
    const si = lower.indexOf(".state");
    if (si > 0) {
      const rest = lower.slice(si + 6);
      let slot;
      if (rest === "") slot = "0";
      else if (/^\d{1,2}$/.test(rest)) slot = rest;
      else if (/^\.auto\d*$/.test(rest)) slot = "auto";
      else if (/^\.undo\d*$/.test(rest)) slot = "undo";
      else return null;
      return { kind: "state", slot, base: name.slice(0, si) };
    }
    const dot = name.lastIndexOf(".");
    if (dot > 0) {
      const ext = name.slice(dot).toLowerCase();
      if (SRAM_EXT[ext]) return { kind: SRAM_EXT[ext], slot: "0", base: name.slice(0, dot) };
    }
    return null;
  }

  const slug = (s) =>
    String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed";

  // git accepts most names, but Windows-created cards can carry characters that break a path
  const fsSafe = (s) =>
    String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim() || "_";

  const ROOT_NAMES = new Set([
    "saves", "states", "save", "state", "currentprofile", "retroarch", ".retroarch",
    "rgj", "sd", "mnt", "roms", "easyroms"
  ]);

  function systemOf(relDir) {
    const parts = relDir.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!ROOT_NAMES.has(parts[i].toLowerCase())) return slug(parts[i]);
    }
    return "unsorted";
  }

  /* ---------------- where saves hide ---------------- */
  // Every layout the fleet is known to use, plus a shallow sweep for anything else.
  const ROOTS = [
    "Saves/CurrentProfile/saves", "Saves/CurrentProfile/states",   // Onion (Miyoo Mini Plus), Spruce (A30)
    "Saves/saves", "Saves/states",
    "RetroArch/saves", "RetroArch/states",                          // GammaOS / Android
    "RetroArch/.retroarch/saves", "RetroArch/.retroarch/states",
    "retroarch/saves", "retroarch/states",
    ".retroarch/saves", ".retroarch/states",
    "EASYROMS/saves", "EASYROMS/states",                            // ArkOS
    "roms/saves", "roms/states", "roms2/saves", "roms2/states",
    "saves", "states"
  ];
  const SWEEP_NAMES = new Set(["saves", "states"]);

  async function exists(reader, rel) {
    if (!rel) return true;
    try {
      await reader.entries(rel);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function walk(reader, root, depth, out, seen) {
    let list;
    try {
      list = await reader.entries(root);
    } catch (_) {
      return;
    }
    for (const e of list) {
      const rel = root ? root + "/" + e.name : e.name;
      if (e.dir) {
        if (depth > 0) await walk(reader, rel, depth - 1, out, seen);
      } else if (!seen.has(rel)) {
        seen.add(rel);
        out.push({ rel, name: e.name, size: e.size, lastModified: e.lastModified || 0 });
      }
    }
  }

  async function findRoots(reader) {
    const roots = [];
    for (const r of ROOTS) if (await exists(reader, r)) roots.push(r);
    // sweep two levels deep for a saves/states folder in an unexpected place
    for (const top of ["", "Saves", "RetroArch", ".retroarch", "roms", "roms2", "EASYROMS"]) {
      let list;
      try {
        list = await reader.entries(top);
      } catch (_) {
        continue;
      }
      for (const e of list) {
        if (e.dir && SWEEP_NAMES.has(e.name.toLowerCase())) {
          const r = top ? top + "/" + e.name : e.name;
          if (!roots.includes(r)) roots.push(r);
        }
      }
    }
    return roots;
  }

  // reader contract:
  //   entries(relPath) -> [{ name, dir, size, lastModified }]
  //   read(relPath)    -> Uint8Array
  //   write(relPath, bytes)
  //   mkdirp(relPath)  (optional)
  async function scan(reader, log) {
    const roots = await findRoots(reader);
    if (!roots.length) return { roots, files: [], skipped: [] };
    const raw = [];
    const seen = new Set();
    for (const r of roots) await walk(reader, r, 4, raw, seen);
    const files = [];
    const skipped = [];
    for (const f of raw) {
      const p = parseSaveName(f.name);
      if (!p) continue;
      if (f.size > D.maxFileBytes) {
        skipped.push({ rel: f.rel, reason: `too large (${Math.round(f.size / 1048576)} MB)` });
        continue;
      }
      if (f.size === 0) {
        skipped.push({ rel: f.rel, reason: "empty file" });
        continue;
      }
      const dir = f.rel.length > f.name.length ? f.rel.slice(0, f.rel.length - f.name.length - 1) : "";
      files.push({
        ...f, dir, kind: p.kind, slot: p.slot,
        system: systemOf(dir), rom: slug(p.base), base: p.base
      });
    }
    if (log) log(`Scanned ${roots.length} save folder${roots.length === 1 ? "" : "s"}, found ${files.length} file${files.length === 1 ? "" : "s"} worth archiving.`);
    return { roots, files, skipped };
  }

  /* ---------------- github layer ---------------- */
  // Shown at the root of the archive branch, so the folder explains itself on github.com.
  const readme = (cfg) => `# Save archive

Battery saves and save states pulled off the handhelds by the Retro Gaming Journey page.

    ${cfg.prefix || D.prefix}/<user>/devices/<device_id>/<system>/<rom>/<file>

* one subtree per device — a device only ever writes to its own folder, so two devices cannot
  overwrite each other;
* save states stay with the device that made them (a state is tied to a core build);
* nothing is deleted here. A missing file locally means "not pulled yet", never "removed";
* every pull is one commit, and a file whose bytes are already in the branch is not re-uploaded.

Restoring is done from the Sync tab of the page, which copies the file it is about to replace
to \`<name>.before-<timestamp>\` first.
`;
  class Gh {
    constructor(cfg) {
      this.cfg = cfg;
      this.api = "https://api.github.com";
      this.headers = {
        Authorization: "Bearer " + cfg.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      };
    }
    base() {
      return `/repos/${this.cfg.owner}/${this.cfg.repo}`;
    }
    async req(method, url, body) {
      const res = await fetch(url.startsWith("http") ? url : this.api + url, {
        method,
        headers: body ? { ...this.headers, "Content-Type": "application/json" } : this.headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON body */ }
      if (!res.ok) {
        const err = new Error(`${method} ${url} → ${res.status} ${(data && data.message) || text.slice(0, 160)}`);
        err.status = res.status;
        throw err;
      }
      return data;
    }
    async ref() {
      try {
        return await this.req("GET", `${this.base()}/git/ref/heads/${this.cfg.branch}`);
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    }
    async ensureBranch() {
      let r = await this.ref();
      if (r) return r;
      const d = await this.req("GET", `${this.base()}/git/ref/heads/${this.cfg.base || "main"}`);
      await this.req("POST", `${this.base()}/git/refs`, {
        ref: `refs/heads/${this.cfg.branch}`,
        sha: d.object.sha
      });
      return await this.ref();
    }
    // whole remote state in two calls: ref -> commit -> recursive tree
    async map() {
      const r = await this.ref();
      if (!r) return new Map();
      const c = await this.req("GET", `${this.base()}/git/commits/${r.object.sha}`);
      const t = await this.req("GET", `${this.base()}/git/trees/${c.tree.sha}?recursive=1`);
      const m = new Map();
      for (const e of t.tree || []) if (e.type === "blob") m.set(e.path, { sha: e.sha, size: e.size });
      return m;
    }
    async blob(sha) {
      const d = await this.req("GET", `${this.base()}/git/blobs/${sha}`);
      return fromB64(d.content);
    }
    // one commit for many files: blobs -> tree -> commit -> create or move the ref.
    // The first commit on the archive branch is an ORPHAN: it carries no site history, so the
    // branch stays a few hundred KB and a clone of it is nothing but saves.
    async commit(files, message, extra) {
      const r = await this.ref();
      const head = r ? r.object.sha : null;
      if (!head && this.cfg.readme !== false) {
        files = files.concat([{ path: "README.md", bytes: enc(readme(this.cfg)) }]);
      }
      const baseTree = head ? (await this.req("GET", `${this.base()}/git/commits/${head}`)).tree.sha : null;
      const entries = await pool(files, D.concurrency, async (f) => {
        const b = await this.req("POST", `${this.base()}/git/blobs`, {
          content: toB64(f.bytes),
          encoding: "base64"
        });
        return { path: f.path, mode: "100644", type: "blob", sha: b.sha };
      });
      const tree = await this.req("POST", `${this.base()}/git/trees`,
        baseTree ? { base_tree: baseTree, tree: entries } : { tree: entries });
      const body = { message, tree: tree.sha };
      if (head) body.parents = [head];
      const commit = await this.req("POST", `${this.base()}/git/commits`, body);
      if (head) {
        await this.req("PATCH", `${this.base()}/git/refs/heads/${this.cfg.branch}`, { sha: commit.sha, force: false });
      } else {
        await this.req("POST", `${this.base()}/git/refs`, { ref: `refs/heads/${this.cfg.branch}`, sha: commit.sha });
      }
      return commit.sha;
    }
  }

  /* ---------------- sync bookkeeping (what this device last pushed) ---------------- */
  const DB_NAME = "rgj-saves-v1";
  const DB_STORE = "state";
  let memStore = null;

  function idb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return resolve(null);
      const req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function storeGet(key) {
    if (!global.indexedDB) return (memStore = memStore || {})[key] || {};
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      tx.onsuccess = () => resolve(tx.result || {});
      tx.onerror = () => reject(tx.error);
    });
  }
  async function storeSet(key, val) {
    if (!global.indexedDB) { (memStore = memStore || {})[key] = val; return true; }
    const db = await idb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(val, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  const pathFor = (cfg, f) =>
    `${cfg.prefix || D.prefix}/${slug(cfg.user)}/devices/${slug(cfg.device)}/${f.system}/${f.rom}/${fsSafe(f.name)}`;

  /* ---------------- PULL: device -> archive ---------------- */
  // Reads every linked volume, hashes, uploads only what the branch does not already hold.
  // Never writes a game file to the device. Never deletes anything from the archive.
  async function pull(opts) {
    const log = opts.onLog || (() => {});
    const cfg = { ...D, ...opts };
    if (!cfg.token) throw new Error("No GitHub token — open Save archive settings and paste one.");
    const readers = cfg.readers || (cfg.reader ? [cfg.reader] : []);
    if (!readers.length) throw new Error("No volume linked.");

    const gh = new Gh(cfg);
    log("Reading the branch tree…");
    const remote = await gh.map();
    const store = await storeGet(cfg.device);
    const queued = new Map();
    const report = { scanned: 0, unchanged: 0, added: [], changed: [], skipped: [], bytes: 0, volumes: [] };

    for (const reader of readers) {
      const res = await scan(reader, log);
      report.volumes.push({ id: reader.id || reader.label || "volume", roots: res.roots, files: res.files.length });
      report.skipped.push(...res.skipped.map((s) => ({ ...s, volume: reader.id || reader.label })));
      for (const f of res.files) {
        const bytes = await reader.read(f.rel);
        const sha = await gitBlobSha(bytes);
        const path = pathFor(cfg, f);
        const known = remote.get(path);
        if (known && known.sha === sha) {
          report.unchanged++;
          store[path] = sha;
          continue;
        }
        const prior = queued.get(path);
        if (prior && prior.sha !== sha) {
          // two cards on the same device holding different bytes for one file
          const newer = (f.lastModified || 0) >= (prior.meta.lastModified || 0) ? f : prior.meta;
          log(`Two versions of ${f.name} on this device — keeping the newer (${newer.rel}).`);
        }
        if (prior && prior.sha === sha) continue;
        queued.set(path, {
          path, bytes, sha, size: bytes.length,
          meta: { ...f, volume: reader.id || reader.label }
        });
      }
      report.scanned += res.files.length;
    }

    const files = [...queued.values()];
    for (const f of files) {
      (store[f.path] ? report.changed : report.added).push({ path: f.path, size: f.size, kind: f.meta.kind, rom: f.meta.base });
    }

    if (files.length) {
      // keep a per-device note so the branch is readable on github.com without opening files
      const manifest = {
        device: cfg.device,
        user: cfg.user,
        model: cfg.model || null,
        os: cfg.os || null,
        updated: new Date().toISOString(),
        folders: [...new Set(files.map((f) => f.path.split("/")[4]))].length,
        counts: { added: report.added.length, changed: report.changed.length, unchanged: report.unchanged },
        note: "Written by the Retro Gaming Journey page. Archive only — nothing here is deleted."
      };
      files.push({
        path: `${cfg.prefix}/${slug(cfg.user)}/devices/${slug(cfg.device)}/device.json`,
        bytes: enc(JSON.stringify(manifest, null, 2) + "\n")
      });
      const msg = `saves: ${cfg.device} +${report.added.length} new, ~${report.changed.length} updated`;
      log(`Uploading ${files.length} file${files.length === 1 ? "" : "s"} in one commit…`);
      try {
        report.commit = await gh.commit(files, msg);
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          log("Branch moved while uploading — retrying once.");
          report.commit = await gh.commit(files, msg);
        } else throw e;
      }
      log(`Committed ${report.commit.slice(0, 7)} to ${cfg.branch}.`);
    } else {
      log("Archive already has these exact bytes — nothing to commit.");
    }

    for (const f of files) if (f.sha) store[f.path] = f.sha;
    store["_last"] = { at: new Date().toISOString(), device: cfg.device, files: report.added.length + report.changed.length };
    await storeSet(cfg.device, store);
    report.total = report.added.length + report.changed.length;
    return report;
  }

  /* ---------------- RESTORE: archive -> device ---------------- */
  // Only writes a file back to hardware that produced it, and copies the file being replaced
  // first. Nothing is overwritten without a .before-<stamp> twin next to it.
  async function restore(opts) {
    const log = opts.onLog || (() => {});
    const cfg = { ...D, ...opts };
    const gh = new Gh(cfg);
    const remote = await gh.map();
    const entry = remote.get(opts.path);
    if (!entry) throw new Error("That file is not in the archive on branch " + cfg.branch + ".");
    const bytes = await gh.blob(entry.sha);
    const sha = await gitBlobSha(bytes);
    const target = opts.relPath;
    if (!target) throw new Error("No target path on the device.");

    let existing = null;
    try {
      existing = await opts.reader.read(target);
    } catch (_) { existing = null; }

    if (existing) {
      const cur = await gitBlobSha(existing);
      if (cur === sha) {
        log("Device already holds this exact file — nothing written.");
        return { written: false, same: true, bytes: bytes.length };
      }
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
      const backup = target.replace(/(\.[^./]+)$/, `.before-${stamp}$1`);
      await opts.reader.write(backup, existing);
      log(`Kept the current file as ${backup.split("/").pop()}.`);
    }
    await opts.reader.write(target, bytes);
    log(`Wrote ${target} (${Math.round(bytes.length / 1024)} KB).`);
    return { written: true, bytes: bytes.length, backup: !!existing };
  }

  /* ---------------- archive listing for the UI ---------------- */
  async function listing(opts) {
    const cfg = { ...D, ...opts };
    const gh = new Gh(cfg);
    const remote = await gh.map();
    const root = `${cfg.prefix}/${slug(cfg.user)}/`;
    const out = [];
    for (const [path, meta] of remote) {
      if (!path.startsWith(root) || !path.includes("/devices/")) continue;
      const rest = path.slice(root.length).split("/"); // devices, <dev>, <system>, <rom>, <file>
      if (rest.length < 5) continue;
      const p = parseSaveName(rest[rest.length - 1]);
      out.push({
        path, sha: meta.sha, size: meta.size,
        device: rest[1], system: rest[2], rom: rest[3],
        file: rest[rest.length - 1],
        kind: p ? p.kind : "meta", slot: p ? p.slot : null
      });
    }
    return out;
  }

  /* ---------------- File System Access reader ---------------- */
  function fsaReader(handle, label) {
    const dirs = new Map([["", handle]]);
    async function dirAt(rel) {
      if (dirs.has(rel)) return dirs.get(rel);
      const parts = rel.split("/").filter(Boolean);
      let h = handle;
      for (const p of parts) h = await h.getDirectoryHandle(p);
      dirs.set(rel, h);
      return h;
    }
    async function dirMk(rel) {
      if (!rel) return handle;
      if (dirs.has(rel)) return dirs.get(rel);
      const parts = rel.split("/").filter(Boolean);
      let h = handle;
      for (const p of parts) h = await h.getDirectoryHandle(p, { create: true });
      dirs.set(rel, h);
      return h;
    }
    return {
      id: label || handle.name,
      label: label || handle.name,
      handle,
      async entries(rel) {
        const d = await dirAt(rel);
        const out = [];
        for await (const [name, h] of d.entries()) {
          if (h.kind === "file") {
            let size = null, lastModified = 0;
            try { const f = await h.getFile(); size = f.size; lastModified = f.lastModified; } catch (_) {}
            out.push({ name, dir: false, size, lastModified });
          } else out.push({ name, dir: true });
        }
        return out;
      },
      async read(rel) {
        const parts = rel.split("/").filter(Boolean);
        const name = parts.pop();
        const d = await dirAt(parts.join("/"));
        const fh = await d.getFileHandle(name);
        const file = await fh.getFile();
        return new Uint8Array(await file.arrayBuffer());
      },
      async write(rel, bytes) {
        const parts = rel.split("/").filter(Boolean);
        const name = parts.pop();
        const d = await dirMk(parts.join("/"));
        const fh = await d.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
      },
      async mkdirp(rel) { await dirMk(rel); }
    };
  }


  /* ---------------- UI (Sync tab card) ---------------- */
  const SETTINGS_KEY = "rgj-saves-settings-v1";
  const uiLog = (m, cls) => {
    if (typeof global.logSync === "function") global.logSync(m, cls || "");
    else console.log("[saves]", m);
  };
  const $ = (sel) => (typeof document !== "undefined" ? document.querySelector(sel) : null);

  function settingsLoad() {
    try { return JSON.parse(global.localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { return {}; }
  }
  function settingsSave(o) {
    try { global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (_) {}
  }
  function settingsFromForm() {
    const repo = ($("#saves-repo")?.value || "").trim();
    const [owner, name] = repo.includes("/") ? repo.split("/") : [D.owner, repo || D.repo];
    return {
      owner: owner || D.owner,
      repo: name || D.repo,
      branch: ($("#saves-branch")?.value || D.branch).trim() || D.branch,
      user: ($("#saves-user")?.value || "").trim() || "peter",
      device: ($("#saves-device")?.value || "").trim(),
      token: ($("#saves-token")?.value || "").trim()
    };
  }
  function settingsToForm(s) {
    const set = (id, v) => { const el = $(id); if (el && v != null) el.value = v; };
    set("#saves-repo", s.owner && s.repo ? `${s.owner}/${s.repo}` : `${D.owner}/${D.repo}`);
    set("#saves-branch", s.branch || D.branch);
    set("#saves-user", s.user || D.user);
    set("#saves-device", s.device || "");
    set("#saves-token", s.token || "");
    const sum = $("#saves-summary");
    if (sum) {
      const who = (s.owner && s.repo) ? `${s.owner}/${s.repo}@${s.branch || D.branch}` : `not set — ${D.owner}/${D.repo}@${D.branch}`;
      sum.textContent = `${who} · ${s.user || D.user}`;
    }
    const pill = $("#saves-pill");
    if (pill) {
      const on = !!(s.token && s.user);
      pill.textContent = on ? "ready" : "needs a token";
      pill.className = `usb-pill ${on ? "live" : "warn"}`.trim();
    }
  }

  // Every linked volume is readable the same way: a card, or a storage an MTP device exposes.
  function linkedReaders() {
    const vols = (global.FSA && Array.isArray(global.FSA.volumes)) ? global.FSA.volumes : [];
    return vols.filter((v) => v && v.handle).map((v) => {
      const r = fsaReader(v.handle, v.handle.name);
      r.deviceMarker = v.device || null;
      r.mtp = !!v.mtp;
      return r;
    });
  }
  function deviceFromReaders(readers, fallback) {
    for (const r of readers) {
      const id = r.deviceMarker && r.deviceMarker.device_id;
      if (id) return id;
    }
    const first = readers[0];
    return fallback || (first ? slug(first.label || "device") : "");
  }

  async function chooseReader() {
    if (typeof global.showDirectoryPicker !== "function") {
      uiLog("This browser has no folder picker — link a volume first (Link another volume).", "err");
      return null;
    }
    try {
      const handle = await global.showDirectoryPicker({ id: "rgj-saves", mode: "read" });
      return fsaReader(handle, handle.name);
    } catch (_) {
      return null;
    }
  }

  function openOutput() {
    const d = $("#saves-output");
    if (d && "open" in d) d.open = true;
  }

  function renderPreview(res, cfg) {
    openOutput();
    const ul = $("#saves-list");
    if (!ul) return;
    ul.innerHTML = "";
    ul.style.maxHeight = "22rem";
    ul.style.overflow = "auto";
    const head = document.createElement("li");
    head.textContent = `${res.files.length} save file(s) · ${res.roots.length} save folder(s) · ${Math.round(
      res.files.reduce((n, f) => n + (f.size || 0), 0) / 1024
    )} KB`;
    ul.appendChild(head);
    for (const f of res.files) {
      const li = document.createElement("li");
      li.textContent = `${f.system}/${f.rom} · ${f.name} · ${f.kind}${f.slot !== "0" ? " " + f.slot : ""} · ${Math.round((f.size || 0) / 1024)} KB`;
      ul.appendChild(li);
    }
    for (const s of res.skipped) {
      const li = document.createElement("li");
      li.textContent = `skipped ${s.rel} — ${s.reason}`;
      ul.appendChild(li);
    }
  }

  async function uiPreview() {
    const cfg = settingsFromForm();
    let readers = linkedReaders();
    let picker = null;
    if (!readers.length) {
      picker = await chooseReader();
      if (!picker) { uiLog("No volume to read. Link a card or pick its folder.", "err"); return; }
      readers = [picker];
    }
    try {
      for (const r of readers) {
        const res = await scan(r, (m) => uiLog(m));
        renderPreview(res, cfg);
        uiLog(`${r.label}: ${res.files.length} file(s) in ${res.roots.length} folder(s).`);
      }
    } catch (e) {
      uiLog(`Preview failed: ${e.message}`, "err");
    }
  }

  async function uiPull() {
    const cfg = settingsFromForm();
    if (!cfg.token) { uiLog("Paste a GitHub token (contents: read & write) first.", "err"); return; }
    settingsSave(cfg);
    let readers = linkedReaders();
    let picker = null;
    if (!readers.length) {
      picker = await chooseReader();
      if (!picker) { uiLog("No volume to read.", "err"); return; }
      readers = [picker];
    }
    cfg.device = deviceFromReaders(readers, cfg.device);
    const devEl = $("#saves-device");
    if (devEl && !devEl.value) devEl.value = cfg.device;
    const btn = $("#btn-saves-pull");
    if (btn) { btn.disabled = true; btn.textContent = "Pulling…"; }
    try {
      const report = await pull({ ...cfg, readers, onLog: (m) => uiLog(m) });
      const msg = `${report.total} file(s) archived (${report.added.length} new, ${report.changed.length} updated), ` +
        `${report.unchanged} already in the archive.`;
      uiLog(msg, "ok");
      const hint = $("#saves-hint");
      if (hint) {
        hint.innerHTML = report.commit
          ? `Branch <strong>${cfg.branch}</strong> · commit <code>${report.commit.slice(0, 7)}</code> · ` +
            `<a href="https://github.com/${cfg.owner}/${cfg.repo}/tree/${cfg.branch}/saves/${slug(cfg.user)}" target="_blank" rel="noopener">browse the archive</a>`
          : `Nothing to commit — the archive already holds these exact bytes.`;
      }
    } catch (e) {
      uiLog(`Pull failed: ${e.message}`, "err");
      const hint = $("#saves-hint");
      if (hint) hint.textContent = `${e.message}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Pull saves from device"; }
    }
  }

  async function uiList() {
    const cfg = settingsFromForm();
    if (!cfg.token) { uiLog("Paste a GitHub token first.", "err"); return; }
    settingsSave(cfg);
    try {
      const rows = await listing(cfg);
      openOutput();
      const ul = $("#saves-list");
      if (ul) {
        ul.innerHTML = "";
        ul.style.maxHeight = "22rem";
        ul.style.overflow = "auto";
        if (!rows.length) ul.innerHTML = "<li>The archive branch has no saves yet.</li>";
        for (const r of rows) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `https://github.com/${cfg.owner}/${cfg.repo}/blob/${cfg.branch}/${r.path}`;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = `${r.device} · ${r.system}/${r.rom} · ${r.file}`;
          li.appendChild(a);
          li.append(` · ${Math.round((r.size || 0) / 1024)} KB`);
          const b = document.createElement("button");
          b.className = "btn btn-ghost btn-small";
          b.textContent = "Restore";
          b.style.marginLeft = ".5rem";
          b.addEventListener("click", () => uiRestore(r));
          li.appendChild(b);
          ul.appendChild(li);
        }
      }
      uiLog(`Archive holds ${rows.length} save file(s).`);
    } catch (e) {
      uiLog(`Archive read failed: ${e.message}`, "err");
    }
  }

  // Put one archived file back on the hardware, next to the file it replaces.
  async function uiRestore(entry) {
    const cfg = settingsFromForm();
    const readers = linkedReaders();
    if (!readers.length) { uiLog("Link the device's volume first, then restore.", "err"); return; }
    const reader = readers[0];
    try {
      const res = await scan(reader);
      const same = res.files.filter((f) => f.system === entry.system && f.rom === entry.rom);
      const exact = same.find((f) => f.name.toLowerCase() === entry.file.toLowerCase());
      const root = res.roots[0] || "saves";
      const target = exact ? exact.rel : `${root}/${entry.system}/${entry.file}`;
      const out = await restore({ ...cfg, reader, path: entry.path, relPath: target, onLog: (m) => uiLog(m) });
      uiLog(out.same ? "Device already matches the archive." : `Restored ${entry.file} to ${reader.label}.`, "ok");
    } catch (e) {
      uiLog(`Restore failed: ${e.message}`, "err");
    }
  }

  function initUI() {
    if (typeof document === "undefined") return;
    const s = settingsLoad();
    settingsToForm(s);
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
    on("#btn-saves-save", () => {
      const cfg = settingsFromForm();
      settingsSave(cfg);
      settingsToForm(cfg);
      uiLog(`Save archive set to ${cfg.owner}/${cfg.repo} @ ${cfg.branch} · user ${cfg.user}.`, "ok");
    });
    on("#btn-saves-pull", uiPull);
    on("#btn-saves-preview", uiPreview);
    on("#btn-saves-list", uiList);
    if (s.token) settingsToForm(s);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
    else initUI();
  }

  const api = {
    DEFAULTS: D, scan, pull, restore, listing, Gh, fsaReader,
    parseSaveName, gitBlobSha, sha256Hex, pathFor,
    ui: { init: initUI, pull: uiPull, preview: uiPreview, list: uiList, restore: uiRestore }
  };
  global.SavesSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
