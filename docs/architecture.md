# Architecture — spec mapping

Source: *Rool Agent Build Pack* (on-demand emulation sync, PowKiddy RGB10X).
Original architecture map: [`architecture-map.svg`](architecture-map.svg).

## Component responsibilities

| Spec component | Repo implementation |
|---|---|
| Local Cache — JSON queue on the card | `sync/device/rgj-sync` — `rgj/rgj-queue.jsonl`, deduped by `hash\|achievement\|timestamp`; pruned rows go to `rgj-pruned.jsonl`, never deleted |
| Capture Layer — RetroArch event integration | `sync/retroarch/capture_achievements.lua` — RAM watch loop, `emu.wait` pacing, JSONL spool, no network |
| Transport — MTP / card reader | `js/mtp.js` (WebUSB + libmtp-wasm) and `js/sdcard.js` (File System Access), one volume adapter behind both |
| Frontend App — static GitHub Pages | repo root: `index.html` + `js/` + `css/` (vanilla JS, zero build step) |
| BaaS Layer — Supabase/Firebase | Supabase chosen: `supabase/schema.sql` (profiles, achievement_queue, game_progress, RLS) |

## API contract (spec 3.2)

The dashboard pushes the same payload shape the engine posts:

```json
{
  "user_id": "usr_8829f0x21",
  "device_id": "rgb10x_hw01",
  "payload": [
    { "game_hash": "a4f3b1901c...", "achievement_id": "id_10204",
      "timestamp": 1792962241, "hardcore": true }
  ]
}
```

## Functional constraints honoured

1. **No real-time requirement** — device telemetry is fully isolated during gameplay; the
   device itself never touches a network. The dashboard pushes to Supabase, not the device.
2. **Hardware constraint** — sync needs a cable (MTP) or the card in a reader. Wi-Fi was
   evaluated and dropped: FileBrowser sends no CORS headers, so a page cannot read it, and
   serving the page from the card breaks on `Content-Disposition: attachment`.
   ArkOS has no USB device mode, so an ArkOS unit has no cable-based option either.
3. **Data integrity rule** — rows dedupe on `game_hash|achievement_id|timestamp` end to end,
   both in `rgj-sync add` and in `importRows()`. The signed-row scheme (HMAC + timestamp
   nonce) lived in the retired Python engine; see `archive/` if it is ever wanted back.

## Asset ingestion pipeline

`tools/build_library.py` (enhancement spec): structures 1,800 badge asset routes
(600 games × beginner/intermediate/advanced) into `Retro_Achievements_Asset_Library.zip`,
with `master_library_index.json` as the runtime route map. Slugs are deterministic
(`title.lower(), spaces→underscores, filesystem-unsafe chars stripped`) so device and
dashboard resolve identical asset paths. Tier → validation mapping:

| Tier | SQLite validation target rules |
|---|---|
| Beginner | Softcore validation states; standard memory hooks |
| Intermediate | Frame timing envelope check parameters active |
| Advanced | Strict Hardcore environment tracking required |

The dashboard loads the index lazily on first Sync-tab open; the zip payload stays external.

## Game library

600 titles: 5 genres (Action, Adventure, RPG, Puzzle, Visual Novels/Point & Click)
× 6 systems (NES, TG16, Genesis, SNES, GBA, NDS) × exactly 20 titles each, transcribed
verbatim from the build pack's System Directory Data Grid. Stable per-game ids are
deterministic slugs (`gameId()` in `js/data.js`) so the cloud `game_hash`/`game_id` keys
stay consistent across device and dashboard.
