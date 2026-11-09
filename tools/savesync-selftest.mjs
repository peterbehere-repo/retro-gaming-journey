// Headless exercise of js/savesync.js against a synthetic SD card and the real branch.
// Not a browser test — it proves the hashing, the layout and the single-commit upload path.
//   node tools/savesync-selftest.mjs [--push]
// Without --push it stops after the diff and prints what it would upload.
import SavesSync from "../js/savesync.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = "/tmp/rgj-savecard";
const push = process.argv.includes("--push");

function fsReader(root) {
  const abs = (rel) => path.join(root, rel);
  return {
    id: "selftest_vol", label: "selftest_vol", root,
    async entries(rel) {
      return fs.readdirSync(abs(rel), { withFileTypes: true }).map((d) => {
        if (d.isDirectory()) return { name: d.name, dir: true };
        const st = fs.statSync(abs(path.join(rel, d.name)));
        return { name: d.name, dir: false, size: st.size, lastModified: st.mtimeMs };
      });
    },
    async read(rel) { return new Uint8Array(fs.readFileSync(abs(rel))); },
    async write(rel, bytes) {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), Buffer.from(bytes));
    },
    async mkdirp(rel) { fs.mkdirSync(abs(rel), { recursive: true }); }
  };
}

function buildCard() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const put = (rel, bytes) => {
    fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, rel), bytes);
  };
  const rand = (n) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff));
  // Onion / Spruce layout
  put("Saves/CurrentProfile/saves/FCEUmm/Contra (USA).srm", rand(8192));
  put("Saves/CurrentProfile/states/FCEUmm/Contra (USA).state", rand(262144));
  put("Saves/CurrentProfile/states/FCEUmm/Contra (USA).state1", rand(262144));
  put("Saves/CurrentProfile/states/FCEUmm/Contra (USA).state.auto", rand(262144));
  put("Saves/CurrentProfile/states/FCEUmm/Contra (USA).state.png", rand(2048));   // must be ignored
  put("Saves/CurrentProfile/saves/FCEUmm/Contra (USA).srm.bak", rand(8192));      // must be ignored
  // ArkOS layout
  put("roms/saves/nes/Super Mario Bros. 3 (USA).srm", rand(8192));
  put("roms/states/nes/Super Mario Bros. 3 (USA).state2", rand(196608));
  // Android / GammaOS layout
  put("RetroArch/saves/mgba/Pokemon Emerald (USA).sav", rand(131072));
  put("RetroArch/states/mgba/Pokemon Emerald (USA).state", rand(1048576));
  put("RetroArch/.retroarch/cores/whatever.so", rand(4096));                       // out of scope
}

buildCard();
const reader = fsReader(ROOT);

const token = execSync("git -C " + JSON.stringify(path.resolve(".")) + " remote get-url origin")
  .toString().trim().replace(/^.*:\/\/([^:]*):([^@]*)@.*$/, "$2");

const cfg = {
  owner: "peterbehere-repo", repo: "retro-gaming-journey", branch: "saves",
  base: "main", user: "selftest", device: "selftest_vol", token,
  model: "self-test card", os: "mixed layout",
  onLog: (m) => console.log("  ·", m)
};

// 1. scan only
const res = await SavesSync.scan(reader, cfg.onLog);
console.log("\nroots:", res.roots);
for (const f of res.files) {
  const p = SavesSync.pathFor(cfg, f);
  console.log(`  ${p}   (${Math.round(f.size / 1024)} KB, ${f.kind}/${f.slot})`);
}
console.log("skipped:", res.skipped);

// 2. blob sha must match git's own object id
const sample = fs.readFileSync(path.join(ROOT, "Saves/CurrentProfile/saves/FCEUmm/Contra (USA).srm"));
const mine = await SavesSync.gitBlobSha(new Uint8Array(sample));
const theirs = execSync(`git hash-object ${JSON.stringify(path.join(ROOT, "Saves/CurrentProfile/saves/FCEUmm/Contra (USA).srm"))}`).toString().trim();
console.log("\nblob sha  mine:", mine, "\n          git :", theirs, mine === theirs ? "✔ match" : "✘ MISMATCH");

if (!push) {
  console.log("\n(dry run — pass --push to upload)");
  process.exit(0);
}

// 3. first pull
console.log("\n— pull 1 —");
let r = await SavesSync.pull({ ...cfg, readers: [reader] });
console.log(`added ${r.added.length}, changed ${r.changed.length}, unchanged ${r.unchanged}, commit ${r.commit?.slice(0, 7)}`);

// 4. second pull must be a no-op
console.log("\n— pull 2 (idempotent?) —");
r = await SavesSync.pull({ ...cfg, readers: [reader] });
console.log(`added ${r.added.length}, changed ${r.changed.length}, unchanged ${r.unchanged}, commit ${r.commit || "none"}`);

// 5. change one save, pull again
console.log("\n— pull 3 (one file changed) —");
fs.writeFileSync(path.join(ROOT, "roms/saves/nes/Super Mario Bros. 3 (USA).srm"), Buffer.alloc(8192, 0x5a));
r = await SavesSync.pull({ ...cfg, readers: [reader] });
console.log(`added ${r.added.length}, changed ${r.changed.length}, unchanged ${r.unchanged}, commit ${r.commit?.slice(0, 7)}`);
console.log("  changed:", r.changed.map((c) => c.path));

// 6. archive listing
const list = await SavesSync.listing(cfg);
console.log("\narchive holds", list.length, "save files");
for (const e of list.slice(0, 12)) console.log(`  ${e.system}/${e.rom}/${e.file}  ${Math.round(e.size / 1024)} KB`);
