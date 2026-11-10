// Exercises the panel's three calls against the real branch: view -> download -> upload.
import SavesSync from "../js/savesync.js";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const token = execSync("git remote get-url origin").toString().trim()
  .replace(/^.*:\/\/([^:]*):([^@]*)@.*$/, "$2");
const cfg = { token, owner: "peterbehere-repo", repo: "retro-gaming-journey", branch: "saves", user: "selftest" };

const v = await SavesSync.view(cfg);
console.log("games:", v.counts.games, "versions:", v.counts.versions, "saves:", v.counts.saves, "states:", v.counts.states, "legacy:", v.counts.legacy);
for (const g of v.games.slice(0, 4)) {
  console.log(" ", g.key, "|", g.title, "| save:", g.latestSave ? SavesSync.fmtWhen(g.latestSave.at) + " " + g.latestSave.device : "-",
    "| states:", g.states.length, "| versions:", g.versions.length);
}
const sorted = v.games.every((g, i, a) => i === 0 || (a[i-1].newest?.at || "") >= (g.newest?.at || ""));
console.log("newest-first ordering:", sorted);

// download the newest save of the top game and check the bytes hash to the name's sha
const g = v.games.find((x) => x.latestSave);
const dl = await SavesSync.download({ ...cfg, path: g.latestSave.path, name: g.latestSave.name });
const sha = crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${dl.bytes.length}\0`), Buffer.from(dl.bytes)])).digest("hex").slice(0, 12);
console.log("download:", dl.name, dl.bytes.length, "bytes · sha12", sha, "matches name:", g.latestSave.path.includes(sha));

// upload it back unchanged -> must be reported as a duplicate, not a new version
const dup = await SavesSync.upload({ ...cfg, system: g.system, rom: g.rom, name: g.latestSave.name, bytes: dl.bytes, device: "viewtest", onLog: (m) => console.log("  log:", m) });
console.log("duplicate detected:", !!dup.duplicate);

// upload with one byte changed -> must become a new version on top
const changed = new Uint8Array(dl.bytes); changed[changed.length - 1] ^= 0xff;
const up = await SavesSync.upload({ ...cfg, system: g.system, rom: g.rom, name: g.latestSave.name, bytes: changed, device: "viewtest", onLog: (m) => console.log("  log:", m) });
console.log("new version:", up.path, "commit:", up.commit?.slice(0, 7), "kind:", up.kind);

const v2 = await SavesSync.view(cfg);
const g2 = v2.games.find((x) => x.key === g.key);
console.log("after upload — versions:", g2.versions.length, "| top is the new one:", g2.versions[0].path === up.path, "| latestSave is the new one:", g2.latestSave.path === up.path);
