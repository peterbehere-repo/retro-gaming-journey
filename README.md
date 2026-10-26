# 🎮 Retro Gaming Journey

An **offline-first, on-demand progress sync system** for the **PowKiddy RGB10X** handheld
(ArkOS) with a browser dashboard hosted on **GitHub Pages** and a free **Supabase** backend.

The handheld plays fully offline. Achievement triggers are captured by a RetroArch Lua
script, queued in a tamper-evident local SQLite database, and pushed in one manual batch
whenever the player attaches a USB-C **OTG Wi-Fi dongle** and runs the sync engine from the
ArkOS Options menu. No real-time connectivity, no background telemetry, no SD-card removal.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ RGB10X / ArkOS (offline)                                            │
│   capture_achievements.lua  ──▶  capture.spool.jsonl                │
│            (RetroArch RAM watch, zero network)                      │
│                                   │  sync_engine.py --ingest        │
│                                   ▼                                 │
│   SQLite achievement_queue  (HMAC-signed rows, PENDING/SYNCED)      │
│                                   │  sync_engine.py --push          │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │  OTG Wi-Fi dongle, manual batch
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Supabase (BaaS)                                                     │
│   auth.users ▸ profiles ▸ achievement_queue ▸ game_progress (RLS)   │
└───────────────────────────────────┬─────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GitHub Pages dashboard (this repo: static HTML5 + vanilla JS)       │
│   dashboard · 600-title library · badges · sync console             │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Technical target | Responsibility |
|---|---|---|
| Local cache | SQLite DB in ArkOS filesystem | Stores achievement hashes + unlock records securely offline |
| Capture layer | RetroArch event integration script (`sync/retroarch/`) | Watches emulated core RAM, queues triggers without frame stutter |
| Sync engine | Python 3 script, ArkOS Options menu (`sync/arkos/`) | Brings up the OTG dongle network, pushes batched JSON rows |
| Frontend app | Static site on GitHub Pages (root of this repo) | Player dashboard, completion percentages, badge case |
| BaaS layer | Supabase (`supabase/schema.sql`) | Auth profiles, synced structural tables, RLS |

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
# on the RGB10X (ArkOS), after copying the sync/ folder to the SD card:
python3 sync/arkos/sync_engine.py --ingest /storage/.config/rgj/capture.spool.jsonl
python3 sync/arkos/sync_engine.py --status
python3 sync/arkos/sync_engine.py --dry-run      # validate integrity, print the batch
RGJ_API_URL=https://your-project.supabase.co \
RGJ_API_KEY=<anon-key> \
python3 sync/arkos/sync_engine.py --push         # waits for the OTG dongle, pushes one batch
```

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
sync/arkos/sync_engine.py  on-demand sync engine for ArkOS
sync/retroarch/...lua      capture layer (RAM watch → spool file)
docs/architecture.md       spec mapping + design notes
.github/workflows/...yml   Pages deployment
```

## Design notes

- **No real-time requirement** — nothing on the device touches the network during play.
- **Hardware constraint** — all transactions go through the physical USB-C OTG Wi-Fi
  receiver during manual sync cycles only.
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
