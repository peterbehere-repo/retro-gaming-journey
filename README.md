# 🎮 Retro Gaming Journey

An **offline-first, on-demand progress sync system** for Linux handhelds — Anbernic,
PowKiddy, Miyoo, Batlexp — with a browser dashboard hosted on **GitHub Pages** and a free
**Supabase** backend.

The handheld plays fully offline. Achievement triggers are captured by a RetroArch Lua
script and queued as rows on the card. Nothing touches a network during play. When the
player wants to sync, they either **plug the device in as MTP** or **put the card in a
reader**; the dashboard reads the queue, and writes an ack back so the device prunes what
was taken. No dongle, no background service, no daemon.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Handheld (offline)                                                  │
│   capture_achievements.lua  ──▶  capture.spool.jsonl                │
│            (RetroArch RAM watch, zero network)                      │
│                                   │  rgj-sync add                  │
│                                   ▼                                 │
│   rgj/rgj-queue.jsonl  (NDJSON rows, deduped, never deleted)        │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │  MTP cable  ·or·  card in a reader
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard (static page, File System Access / WebUSB)                │
│   reads rgj-queue.jsonl  → writes rgj-ack.json + rgj-ack.keys       │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │  manual push, signed in
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Supabase (BaaS)                                                     │
│   auth.users ▸ profiles ▸ achievement_queue ▸ game_progress (RLS)   │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Technical target | Responsibility |
|---|---|---|
| Capture layer | RetroArch event script (`sync/retroarch/`) | Watches emulated core RAM, appends triggers to a spool file without frame stutter |
| Device tool | `sync/device/rgj-sync`, POSIX `sh` | Owns the queue on the card: `init`, `add`, `prune`, `status`, `doctor`. No Python, no `jq`, no network |
| Transport | MTP over WebUSB (`js/mtp.js`), card via File System Access (`js/sdcard.js`) | The only two channels that read a device from a browser. Each storage a device exposes becomes its own volume |
| Frontend app | Static site on GitHub Pages | Player dashboard, library, badges, sync console |
| BaaS layer | Supabase (`supabase/schema.sql`) | Auth profiles, synced structural tables, RLS |

### Transports, and what each costs

| Channel | Devices | Setup |
|---|---|---|
| **MTP over USB** | Any Android-based unit (RG405M on GammaOS), Linux builds with a PTP gadget | Cable, one permission prompt |
| **Card in a reader** | Every device in the fleet | Card out, folder granted once |
| ~~Wi-Fi (FileBrowser)~~ | ArkOS ships it, but it is not usable from a page | Dropped — see `docs/Device Sync Matrix.md` |

ArkOS has **no USB device mode at all** — no MTP, no PTP, no mass-storage gadget, no ADB.
Its only USB features are *host* side (USB drive mount, USB DAC). So an ArkOS unit syncs by
pulling the card, and that is not a limitation of this dashboard.

## Iteration plan

The full 600-title directory ships from day one, but the **site reveals one console per
iteration**. Visibility and all stats (completion %, bars, badges, asset counts) are
gated by a single switch in [`js/data.js`](js/data.js):

```js
const ACTIVE_PLATFORMS = ["nes"];   // iteration 1 — add "tg16", "genesis", "snes", "gba", "nds" later
```

| Iteration | Console | Active library |
|---|---|---|
| 1 (live) | NES | 5 × 20 = 100 titles |
| 2+ | TG16, Genesis, SNES, GBA, NDS | +100 each, up to the full 600 |

## The 600-title library

`js/data.js` ships the full **System Directory Data Grid**: 5 genres × 6 platforms
(NES, TurboGrafx-16, SEGA Genesis, SNES, GBA, NDS) × exactly 20 curated titles = **600 games**.

| Genre | NES | TG16 | Genesis | SNES | GBA | NDS |
|---|---|---|---|---|---|---|
| Action | 20 | 20 | 20 | 20 | 20 | 20 |
| Adventure | 20 | 20 | 20 | 20 | 20 | 20 |
| RPG | 20 | 20 | 20 | 20 | 20 | 20 |
| Puzzle | 20 | 20 | 20 | 20 | 20 | 20 |
| Visual Novels / Point & Click | 20 | 20 | 20 | 20 | 20 | 20 |

The dashboard uses the grid as the progression canvas: cycle any card between
*not started → playing → completed*, watch genre/platform completion fill in, and earn
badges (genre milestones at 25/50/75/100%, platform mastery, library-wide honours).

## Quick start — dashboard

1. **Deploy**: push to GitHub and enable Pages (Settings → Pages → Source: GitHub
   Actions — the included workflow deploys the repo root automatically), or serve locally:
   `python3 -m http.server 8080`.
2. **Offline demo mode works with zero config** — progress is stored in `localStorage`.
3. **Optional Supabase**: create a free project, run [`supabase/schema.sql`](supabase/schema.sql)
   in the SQL editor, then paste your project URL + anon key into
   [`js/supabase-config.js`](js/supabase-config.js). Sign in from the app to sync
   progress across browsers.

## Quick start — handheld side

```bash
# copy sync/device/rgj-sync to the card root, then:
cd /media/$USER/EASYROMS            # Windows: /g, or wherever the card mounts
sh rgj-sync init --id rgb30_hw01 --model "PowKiddy RGB30" --os "ArkOS"
sh rgj-sync doctor                  # tools, marker, writability
sh rgj-sync status                  # queue, acked keys, spool depth
```

Full walkthrough: [`docs/Sync Device Install.md`](docs/Sync%20Device%20Install.md).

### Data integrity (spec 2.2)

Rows are signed at capture time with `HMAC-SHA256(game_hash | achievement_id | unlocked_at |
hardcore)` under a per-device secret generated once at `~/.config/rgj/device.secret`. The
nonce must equal `sha256(unlocked_at | secret)`, which blocks replaying captured rows. On
push, every row is re-verified; failures are marked `REJECTED` and never leave the device.

### Local queue schema (spec 3.1)

```sql
CREATE TABLE achievement_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_hash TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'PENDING',
    hardcore_mode INTEGER DEFAULT 1,
    security_nonce TEXT NOT NULL
);
```

## Repo layout

```
index.html                 dashboard app (GitHub Pages root)
css/styles.css             CRT-flavoured retro theme
js/data.js                 600-title System Directory Data Grid
js/app.js                  dashboard / library / badges / sync console
js/supabase-config.js      backend config (empty = offline demo mode)
supabase/schema.sql        BaaS tables + row level security
tools/build_library.py     asset ingestion pipeline (1,800 badge routes + index)
sync/device/rgj-sync      on-card queue tool (POSIX sh, five firmwares)
sync/retroarch/...lua      capture layer (RAM watch → spool file)
docs/architecture.md       spec mapping + design notes
.github/workflows/...yml   Pages deployment
```

## Design notes

- **No real-time requirement** — nothing on the device touches the network during play.
- **Hardware constraint** — sync needs a cable (MTP) or a card reader. Never Wi-Fi alone.
- **Decoupled auth** — GitHub Pages is static; session state and the data layer live in
  Supabase Auth + Postgres, reachable from any browser after a sync.

## Asset ingestion pipeline (tools/build_library.py)

The enhancement spec offloads badge art to an external fetch at runtime instead of
inlining payloads. `tools/build_library.py` structures **1,800 asset locations**
(600 games × 3 difficulty tiers) into `Retro_Achievements_Asset_Library.zip` and emits
`master_library_index.json` for serverless frontend mapping:

| Tier | Validation target | Asset |
|---|---|---|
| Beginner | Softcore validation states; standard memory hooks | `[slug]_beginner.png` |
| Intermediate | Frame timing envelope check parameters active | `[slug]_intermediate.png` |
| Advanced | Strict Hardcore environment tracking required | `[slug]_advanced.png` |

```bash
python3 tools/build_library.py                    # builds from js/data.js (default source)
python3 tools/build_library.py --url <master-matrix-json-url>   # fetch the master matrix instead
python3 tools/build_library.py --unzip assets/    # also explode the tree locally
```

The dashboard fetches `master_library_index.json` lazily — only when the Sync console
is opened — so the 1,800-tile payload never touches the page load. Tiles ship as
transparent 1×1 placeholders; drop real badge PNGs in via `--art-dir`.

---

Built from the Rool Agent Build Pack (on-demand emulation sync spec + asset ingestion enhancement).
