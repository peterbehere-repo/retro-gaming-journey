// Build data/ra-achievements.json from data/ra-games.json + data/ra-raw/*.json.
//
// Runs the page's own picker (js/achievements.js) inside a stub window so the
// bundled file can never disagree with what the live page would compute.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const store = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  // The picker only needs normTitle; no network is permitted here on purpose.
  RA: { normTitle: (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() },
  fetch: () => { throw new Error("no network during build"); },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/achievements.js"), "utf8"), ctx);

const games = read("data/ra-games.json");
const out = {};
let filled = 0, empty = 0;
for (const [title, g] of Object.entries(games)) {
  const raw = read(`data/ra-raw/${g.id}.json`);
  const picks = ctx.ACH.pickThree(raw.Achievements || {});
  out[`nes|${ctx.RA.normTitle(title)}`] = {
    raId: g.id,
    raTitle: raw.Title || g.title,
    picks,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
  picks.length ? filled++ : empty++;
}
const dest = path.join(ROOT, "data/ra-achievements.json");
fs.writeFileSync(dest, JSON.stringify({ version: 1, games: out }, null, 1) + "\n");
console.log(`${filled} games with three picks, ${empty} without, -> data/ra-achievements.json`);
