# On-device half — `rgj-sync`

The dashboard's Sync tab now pulls rows off a card and writes an ack back. This document
covers the other half: the small script that sits on the handheld, keeps the queue tidy, and
acts on that ack.

One file, `sync/device/rgj-sync`, runs on all five Linux handhelds — ArkOS (RGB30, RGB10X,
G350), Spruce (Miyoo A30) and Onion (Miyoo Mini Plus). It is POSIX `sh` and touches nothing
but `awk`, `sort`, `sed`, `grep`, `mv`, `mkdir`, `tr` and `wc`, all of which those firmwares
already ship. No Python, no `jq`, no network, nothing to install.

## The contract

Everything on the card lives under one directory so it is easy to find and easy to copy:

```
<card root>/
  rgj-device.json        identity marker — model, OS, schema, queue/ack paths
  rgj/
    rgj-queue.jsonl      rows waiting to be pulled      (NDJSON, written by rgj-sync add)
    rgj-ack.json         ack written by the dashboard   (JSON, read for humans)
    rgj-ack.keys         same ack as flat hash|aid|ts    (written by the dashboard)
    rgj-pruned.jsonl     rows handed back — appended, never deleted
    capture.spool.jsonl  raw output of the RetroArch capture layer
```

The dashboard reads `rgj-queue.jsonl`, imports what it has not seen, then writes
`rgj-ack.json` **and** `rgj-ack.keys`. The key file exists because a shell script cannot parse
JSON; one `hash|achievement|timestamp` line per acked row is all `prune` needs.

A row is identified by `game_hash` + `achievement_id` + `timestamp`. That triple survives
re-runs, duplicate spool appends, and a page reload mid-pull.

## Commands

| Command | What it does |
|---|---|
| `rgj-sync status` | Queue size, acked keys, spool rows not yet queued, oldest/newest hit, distinct games |
| `rgj-sync add [FILE]` | Appends spool rows to the queue, dropping duplicates and malformed lines (default file: `rgj/capture.spool.jsonl`) |
| `rgj-sync prune` | Moves acked rows out of the queue into `rgj-pruned.jsonl` |
| `rgj-sync tick` | `add` then `prune` — the one to put on a launcher |
| `rgj-sync init --id ID --model MODEL [--os OS]` | Writes the identity marker; never overwrites an existing one |
| `rgj-sync doctor` | Reports root, writability, and which tools are missing |

Root is auto-detected (`/roms`, `/storage/roms`, `~/roms`, `/media/sdcard`, the current
directory, and so on). Override with `RGJ_ROOT=/path` if a build mounts somewhere unusual.

Writes are guarded by a lock directory with stale-pid recovery, so a launcher press during a
boot hook cannot corrupt the queue. Every write is a temp file plus `mv` — the queue is never
left half-written.

## Install

Copy `rgj-sync` to the card root (or to a tools directory), make it executable, then run
`init` once so the dashboard can identify the volume:

```sh
cp rgj-sync /path/to/card/
chmod +x /path/to/card/rgj-sync
/path/to/card/rgj-sync init --id rgb30_hw01 --model "PowKiddy RGB30" --os "ArkOS 2.0"
/path/to/card/rgj-sync doctor
```

Then link the card in the dashboard's Sync tab. The page reads the marker and shows the model
and ID, which is the proof that both halves agree on the same volume.

Where the launcher goes differs per firmware — the script itself does not care:

- **ArkOS builds (RGB30, RGB10X, G350)** — a `*.sh` in `/roms/tools/` shows up under
  Options → Tools. That is the natural home for `rgj-sync tick`.
- **Spruce (Miyoo A30)** — an app folder with a `launch.sh` under `/mnt/SDCARD/App/`, so
  `tick` is one tap from the home screen.
- **Onion (Miyoo Mini Plus)** — same shape: an `App/` folder with a `launch.sh`.

For a boot hook, add the `tick` call to a startup script under the firmware's init directory
(`/etc/init.d/` on ArkOS). Run `rgj-sync doctor` after adding it — read-only mounts and
missing `mktemp` are the two failure modes worth catching early.

## What the loop looks like in practice

1. Play. The capture layer appends to `capture.spool.jsonl`; nothing else happens, and the
   device stays offline.
2. Quit the emulator, tap `rgj-sync tick`. Hits move into the queue, and any rows acked on a
   previous visit are handed back to `rgj-pruned.jsonl`.
3. Plug the card into the PC, open the Sync tab, press **Pull from card**. Rows are imported,
   the ack and key file are written.
4. Next tap of `tick` prunes those rows. The queue only ever holds what still needs carrying.

Nothing is deleted at any step. Pruned rows accumulate in `rgj-pruned.jsonl`, so a bad import
can always be reconstructed from the card.
