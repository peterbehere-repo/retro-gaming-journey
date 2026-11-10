# Save files and save states — the archive design

*Built 2026-11-09. Code: `js/savesync.js`. Card: Sync tab → “Save files & states”.
Branch: `saves` on `peterbehere-repo/retro-gaming-journey`.*

## The problem in one line

A save is a blob of bytes with no internal structure we can merge, produced by six devices that
disagree about folder layout, filename extensions, clock accuracy and what a “slot” is. Any sync
that pretends otherwise eventually eats a save.

So this design optimises for one thing above all: **no pull can ever destroy a save, on either
side.** Convenience comes second, and it turns out not to cost much.

## Direction: pull first

“Pull” here means **device → archive**: read the card (or the MTP storage, or the LAN server),
hash what is there, and copy anything the archive does not already hold. That is the default
button, and it is safe to press with no thought at all.

“Push” is the restore path: archive → device. It is the one that can lose data, so it is a
separate, deliberate action on a single game, and it always copies the file it is about to
replace to `<name>.before-<timestamp>` first.

## Layout: game first, device second

```
saves/<user>/games/<system>/<rom>/<stamp>_<device>_<sha12>__<original name>
saves/<user>/pulls/<device>/<stamp>.json     what one pull took + clock-skew flags
saves/<user>/archive.json                    every game, newest first — one read for the view
```

Example, three handhelds each holding a Contra save:

```
saves/peter/games/nes/contra-usa/2026-11-08T14-02-11Z_a30-hw01_4f2a9b1c77de__Contra (USA).srm
saves/peter/games/nes/contra-usa/2026-11-09T18-22-04Z_rgb30-hw01_9b31e0aa5219__Contra (USA).srm
saves/peter/games/nes/contra-usa/2026-11-09T20-41-57Z_rgb10x-hw01_c02f4e71a3b8__Contra (USA).srm
```

`peter/` is the user folder; a second person on the same repo gets `saves/<their-name>/` and never
sees the first person's writes. `a30-hw01` is the `device_id` from the card marker
(`rgj-device.json`) when there is one, otherwise the volume name.

Why the name carries three things:

* **stamp** — `pulled_at`, UTC, colon-free. Sorts as plain text, so "most recent" is a string
  comparison and the newest file sits at the top of its game folder. Never the device clock:
  two of this fleet's handhelds have been hours off.
* **device** — provenance. You can see at a glance which handheld a save came from, and a state
  is never mistaken for one that will load on different hardware.
* **sha12** — the content hash, so a duplicate can be recognised without downloading anything.

A file is **never rewritten**. A changed save is a new file, and the old one stays. That is what
makes "most recent" meaningful — there is always a version to point at.

Why not one canonical file per game: a save is a binary blob with no mergeable structure, and
picking a winner at pull time is where save syncs eat data. Keeping every version costs one tree
entry per pull-touched file; identical bytes from several devices resolve to one git blob.

Save states (`.state`, `.state1`, `.state.auto`) are tied to a core build — an RGB30 state will not
load on SpruceOS even for the same game. `latest.states` is therefore per device;
`latest.save` (the `.srm`/`.sav` family) is the portable one.

System names are normalised. Onion/Spruce cards name the save folder after the **core**
(`fceumm`), ArkOS after the **system** (`nes`). The same game pulled from both would otherwise
land under two "systems" and never be recognised as one game — so a known core maps to its system.

## The diff costs nothing## The diff costs nothing

A git blob id is `sha1("blob <len>\0" + bytes)`, which is computable in the browser. So the page
hashes a local save and compares it with the `sha` already in the branch's tree:

```
GET /git/ref/heads/saves          → head commit
GET /git/commits/<head>           → tree
GET /git/trees/<tree>?recursive=1 → every path with sha + size
```

Three calls describe the whole archive. No index file to keep in step, no bookkeeping to corrupt,
and a save whose bytes are already archived is never uploaded again.

## What a pull does, in order

1. Find save folders on the volume. Every layout in the fleet is probed explicitly —
   `Saves/CurrentProfile/{saves,states}` (Onion, Spruce), `RetroArch/{saves,states}`,
   `.retroarch/…`, `EASYROMS/{saves,states}`, `roms{,2}/{saves,states}` — plus a two-level sweep
   for a `saves`/`states` folder somewhere unexpected.
2. Classify filenames into `kind`/`slot`: `.srm .sav .sra .eep .fla .mpk .mcr .dsv .rtc` are
   battery saves; `.state`, `.state1…9`, `.state.auto`, `.state.undo` are states. Screenshots,
   `.opt`, `.cfg`, zero-byte files and RetroArch's own `.bak` files are ignored.
3. Key each file as `(system, rom, original name)`, where the system is the first folder that is
   not a save-root name (`FCEUmm`, `nes`, `mgba`) and the rom is a slug of the filename with the
   extension and state suffix removed (`Contra (USA).state1` → `contra-usa`).
4. Hash, compare with the tree, queue the rest.
5. Upload as **one commit**: blobs → tree (with `base_tree`) → commit → move the ref. One pull is
   one entry in the branch history, not two hundred.
6. Write `device.json` describing what that device last contributed, so the folder is readable on
   github.com without opening filenames.

Two safeguards that are not negotiable:

* **Nothing is deleted.** A card that comes back blank means “no new files”. A file that vanished
  locally is not removed from the archive.
* **Nothing on the card is written during a pull** except the (optional) receipt file. A pull is a
  read.

## Edge cases the design answers

| Case | Answer |
|---|---|
| Handheld clock is wrong (no RTC, no Wi-Fi) | mtimes are only a tie-break, never the decision. Content hashes decide what is new. |
| Same game, two cards on one device | both are scanned; identical bytes collapse, different bytes keep the newer mtime and the collision is logged. |
| Region variants (`Contra (USA)` vs `(Japan)`) | different rom slugs, so they coexist under the same system. |
| Save state from another device | sits under its own device folder and is never offered as a restore source for a different device unless chosen by hand. |
| File over 50 MB (PS1/PS2/Dolphin states can be) | skipped with a reason in the log — GitHub warns at 50 MiB and blocks at 100 MiB. |
| Second user on the same machine | separate `saves/<user>/` subtree, same branch. |

## Auth

A **fine-grained token, `Contents: read and write`, scoped to the one repository**, pasted into
the page and kept in that browser's `localStorage` — never in the page source, never in the repo.
Each browser/device pastes its own once.

Public or private repository both work; the API is identical. A public repo means your `.srm`
files are browsable by anyone, so if that matters, point the card at a private repo and nothing
else changes: the fields are `owner/repo`, branch, user folder.

The first commit on the archive branch is an **orphan** — it carries no site history, so the
branch is a few hundred KB of saves rather than a copy of a 290 MB working repo.

## Verified

Headless run (`tools/savesync-selftest.mjs --push`) against a synthetic card using every layout,
against the real branch:

* browser-side blob hash equals `git hash-object` — `ebcdc3d501c4…` both sides;
* pull 1: 7 files already archived from the older per-device layout (matched by hash, not path),
  1 changed file added as a new version;
* pull 2 (nothing touched): **0 added, 8 unchanged, no commit** — the watermark is this device's
  own newest archived version per game/kind/slot;
* pull 3 (one `.srm` rewritten): exactly 1 new version, the rest unchanged;
* filenames sort newest-first; `archive.json` `latest.save` points at the same file as
  `versions[0]`; legacy `devices/` entries parse, normalise to their system, and sort last
  (undated) so a new version always wins.

## The browser panel (pass 2)

The Save archive card in the Sync tab is the archive's only UI. One row per game, newest activity
first, with the newest portable save and the newest state of each device resolved already — so the
question "what is my most recent Contra save" is answered on the row, without opening anything.

| Control | Does |
|---|---|
| Pull from device | the pass-1 pull: read linked volumes, archive only new bytes |
| Refresh archive | re-reads the branch (ref → commit → tree, 3 calls, never the CDN) |
| Filter box / All·Saves·States | narrows by title, system, rom or device |
| Download (row) | the newest save of that game, by blob sha, straight to the download folder |
| ▸ N | expands the history: one line per distinct version per device, `×N` when the same bytes were pulled more than once, capped at 8 with a count of the rest |
| New game… | files a first save for a game the archive doesn't know yet |

All uploads are explicit and additive. A file dropped in becomes `<stamp>_<device>_<sha12>__<name>`
under the game's folder and a new commit; bytes already in the archive (same content hash, from any
device) return "already archived" instead of a duplicate. The panel refuses a save in the state
picker and vice versa, so a `.state` can't be filed as a `.srm`.

Verified against the real branch (`tools/savesync-view-test.mjs`): view → download → hash-check →
upload-same-bytes (reported duplicate) → upload-one-byte-changed (new version, commit `d258289`,
lands on top and becomes `latest.save`). Rendered in a headless browser at 1360px and 420px with
live data, no console errors.

## Still open

* **A token for the browser.** The page cannot mint one; paste it once per browser.
* **Device IDs.** The card marker gives `a30_hw01`; the ArkOS trio and the RG405M need a
  `rgj-device.json` written once (the “Prepare card” button already seeds one).
* **Restore path for MTP.** Reading over MTP works today; writing back does not, so restore is
  wired to a linked volume (card in a reader, or a card-path volume).
* **States on the LAN card** (Miyoo A30 via SFTPGo) — the LAN reader is `httpsync.js`; wiring it
  into the same `reader` interface is a small adapter, not new logic.
* **Pruning.** The branch keeps every version forever by design. If it ever gets heavy, the fix is
  a second branch per year, not deletion.
