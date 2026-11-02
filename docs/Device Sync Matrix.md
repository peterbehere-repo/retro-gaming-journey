# Device Sync Matrix — six handhelds, one queue format

The dashboard must pull one thing from every device: **queue rows**
(`game_hash`, `achievement_id`, `timestamp`, `hardcore`) in NDJSON.
Everything else — OS, USB personality, network — is transport detail.

Design consequence: **one adapter interface, several transports**, selected per device.
Nothing in the dashboard may assume ArkOS or a specific cable.

## Fleet

| # | Device | OS | Wi-Fi | USB personality | Best channel | Effort | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Anbernic RG405M | GammaOS (Android 12, rooted) | Yes (2.4/5 GHz) | MTP + **ADB** + charging | **ADB over WebUSB** — read `/sdcard` in-browser | M | Wi-Fi HTTP |
| 2 | Miyoo A30 | Spruce OS (Linux) | No | Mass storage (SD exposed as drive) | **File System Access** directory handle | S | SD card in PC reader |
| 3 | PowKiddy RGB30 | ArkOS | No | Mass storage (+ OTG host) | **File System Access** | S | same |
| 4 | PowKiddy RGB10X | ArkOS | No | Mass storage (+ OTG host) | **File System Access** | S | same |
| 5 | Miyoo Mini Plus | Onion OS | Yes (internal) | Mass storage | **LAN HTTP** (device-side push / page pull) | M | File System Access |
| 6 | Batlexp G350 | ArkOS | No | Mass storage | **File System Access** | S | same |

Legend: S ≈ half a day, M ≈ 1–2 days.

## Why these choices

**File System Access (devices 2, 3, 4, 6).** All four mount as a plain USB drive. Browsers
deliberately cannot enumerate drives, but `showDirectoryPicker()` lets the user grant the
volume root **once**; the handle is stored in IndexedDB and reused next session with a single
confirmation click. Then the page reads `rgj/rgj-queue.jsonl` like any file and writes back an
ack. Same adapter covers a card reader — the "shuttle the microSD" path costs nothing extra.

**ADB over WebUSB (device 1).** GammaOS is Android with USB debugging. Chrome can talk ADB
over WebUSB (`@yume-chan/adb`), so the page reads `/sdcard/RetroArch` and the capture spool
directly — no file picker, no mount, works offline. Authorised once per browser.

**LAN HTTP (device 5, and device 1 when convenient).** Onion OS ships Wi-Fi tooling (TinyFTP
class apps). Browsers cannot speak FTP, so the device writes one small HTTP POST or serves
one JSON file; the page either pulls it or receives the push. Verify which app Onion currently
ships before building — that detail changes the device-side script, not the adapter.

## Adapter layer

```
SyncSource {
  id, label, capabilities: {watch, read, writeAck, zeroTouch}
  probe()  -> device identity (from marker file or VID/PID)
  pull()   -> rows[]
  ack(n)   -> so the device can prune
}
```

Registry keyed by VID:PID **and** by a marker file at the volume root:

```json
{ "device_id": "rgb30_hw01", "model": "PowKiddy RGB30", "os": "ArkOS 2.0",
  "schema": 1, "queue": "rgj/rgj-queue.jsonl", "ack": "rgj/rgj-ack.json" }
```

The marker is what makes detection honest: the page knows it is looking at *your* RGB30 and not
a random USB stick, and each device gets its own `device_id` in the payload.

## Plug-in detection is transport-independent

`navigator.usb` `connect` / `disconnect` events fire for **any** attached USB device, mass
storage included. So "a device was plugged in" and "this is a PowKiddy" can be answered for all
six without file access; only *reading* needs the per-device channel. Windows note: mass-storage
devices are claimed by the OS driver, so WebUSB can enumerate but not open them — fine, since we
never need to open them.

## Phasing

1. **FSA adapter + marker + ack** — unlocks 2, 3, 4, 6 at once. Biggest coverage per effort.
2. **ADB-over-WebUSB adapter** — RG405M, zero-touch.
3. **LAN HTTP adapter** — Mini Plus; also gives RG405M a network path.
4. *(optional)* serial gadget on the ArkOS trio — true push, needs a device-side daemon and a
   kernel gadget module. High effort, modest gain over FSA.
5. *(optional)* local agent on the PC (native messaging or a 127.0.0.1 watcher) — makes every
   wired device zero-click. One install per computer, biggest UX win if the clicking annoys.

## Open questions to verify on hardware

- Does the Miyoo A30 (Spruce) expose mass storage by default, or behind a menu toggle?
- Which Wi-Fi file app ships in current Onion OS, and does it support HTTP or only FTP?
- GammaOS build: is USB debugging on by default, and does the ADB interface survive while MTP is active?

## Two SD cards on the MTP devices (answered 2026-11-01)

The first cut linked **one** folder, so a save on the secondary card was invisible. Corrected:
the page keeps a **list of volumes**, each one a remembered directory handle. Sync walks all of
them; ack files are written back per volume so the device-side script can prune each queue
independently.

Why it had to work this way: the browser cannot enumerate drives. `showDirectoryPicker()` returns
exactly the folder the user clicks. There is no API for "list mounted volumes", and no way to move
from one volume to its sibling. So detection is by *identity*, not by scanning the port:

1. User links each card once ("Link another volume"). Handles persist in IndexedDB, so a card
   already granted shows up straight away on the next session — no re-click.
2. Each volume is probed for `rgj-device.json`. If present we know model, OS and the queue path;
   if absent the volume is a **save-only card** and is accepted as such (a second card usually
   holds just `saves/` and `roms/`).
3. If the marker's queue path is missing, the adapter also probes `rgj-queue.jsonl`,
   `saves/rgj/`, `roms/rgj/` — a second card formatted by a different ArkOS build still works.
4. Pull reads every linked volume, dedupes rows across volumes (same `hash|aid|timestamp` seen
   twice collapses), and writes `rgj/rgj-ack.json` + `rgj/rgj-ack.keys` to each volume it took
   rows from.

Keep the card labels distinct. Both cards of one device may mount with the same filesystem
label; rename one (`RGB30-slot2`) or the handle list will look ambiguous. Volume identity in the
UI is `<label> · <device_id|no marker>`.

Windows caveat: the SD reader often mounts both cards and the device's own internal partition
at the same time. Linking a *device that is itself an MTP device* is not needed for saves —
pull the cards, or use the ADB path for the RG405M's internal storage.

## MTP over WebUSB — the route that actually reaches the device (2026-11-01)

Correction to the earlier "USB cannot work" note. WebUSB blocks the **mass-storage** class, which
is why a card mounted as a USB drive is unreachable. MTP is not that class: it speaks PTP over a
still-image (class 6) or vendor-specific interface, and WebUSB may claim it. So an MTP device is
reachable from the page with no install, no driver swap, no card reader.

Implementation: `libmtp-web` (libmtp compiled to WebAssembly, LGPL-2.1, Chrome ≥137 for WASM JSPI),
vendored at `js/vendor/libmtp-web/`. It exposes an MTP device as **File System Access handles**, so
`js/mtp.js` adopts each storage root as a volume and the existing sdcard.js pull/ack code runs
unchanged. Marker and queue discovery are the same code path as a card.

Why this also answers the two-SD-card question: MTP lists storages, not partitions. A device with
both cards inserted enumerates as `Internal Storage` and `SD Card`, and both become volumes in one
connection — no second link click, no label ambiguity.

Known limits:

- Handles are backed by a live USB session and cannot be structured-cloned into IndexedDB. Card
  volumes persist; MTP volumes are rebuilt on each load from `navigator.usb.getDevices()`.
- Windows: the MTP interface is usually owned by Microsoft's WPD driver, which is exactly why the
  WinUSB-based tools (and stephenkingston/WebMTP) tell you to replace the driver with Zadig. Whether
  Chrome can open it without that swap is device- and driver-dependent — untested on this fleet.
  If it refuses, the fallbacks are the card reader, or a localhost WPD agent.
- Only one MTP session per device works at a time. An open Explorer window on the device will make
  the open fail; close those first.
- Reading works today for any storage; writing the ack back needs the device to accept SendObject,
  which most Android builds do.

## ArkOS has no USB device mode — checked, 2026-11-01

Went through the ArkOS wiki and the RGB30 changelog rather than guessing. ArkOS offers two
USB features, and neither presents the handheld to a host PC:

- **USB Drive Mount / Unmount** (Options menu) — the handheld is the *host*; it mounts a USB stick
  into `/mnt/usbdrive`.
- **USB DAC support** — audio out.

There is no MTP, no PTP, no `g_mass_storage` gadget, no ADB. The wiki's only USB troubleshooting
entries are the mount above and DAC. So plugging an ArkOS unit into a PC does nothing at all, and
no amount of pressing buttons on the device will make it appear in Chrome's WebUSB picker.

Which leaves the MTP adapter useful on exactly one device in this fleet: **RG405M on GammaOS**, which
is Android 12 underneath and speaks MTP natively. Onion (Mini Plus), Spruce (A30) and the three ArkOS
units have no MTP stack.

Correction to an assumption in the matrix: the RGB30 does not present as mass storage to a PC either,
so "plug it in and link the drive letter" is not an option for it.

### What ArkOS does offer: FileBrowser on the LAN

ArkOS ships **ArkOS Browser**, which is FileBrowser (Go) serving the EASYROMS tree.
Options → *Enable Remote Services*, then `http://rgb30` (or the device IP), `ark` / `ark`.

That is a real machine-readable channel: FileBrowser exposes `/api/resources/<path>` and
`/api/raw/<path>`. It is the only route that reaches a running ArkOS unit without pulling the card,
and it covers RGB30, RGB10X and G350 with one adapter — three of the six devices.

Caveats to handle in that adapter: authentication (login + X-Auth token), no CORS headers on
FileBrowser by default (fetch from the page is blocked; the Rool Web Bridge extension with host
permissions bypasses it), and mixed content if the page is served over https.

---

## Decision (2026-11-01) — two channels, and only two

Scope was cut back to **MTP** and **card pull**. Everything below was removed from the site and
archived in `archive/`, not deleted.

**Why Wi-Fi went.** FileBrowser sends no `Access-Control-*` headers at all — confirmed against a
real instance (`v2.63.23`): `POST /api/login` returns `200` with no CORS headers, so a page from
any other origin cannot read the reply. The same-origin escape hatch fails too: serving the page
from the card returns `Content-Type: application/octet-stream` with
`Content-Disposition: attachment`, so it downloads rather than renders. The remaining options were
a proxy process or a browser extension. Peter's call, correctly: a server per machine is not a
feature. Retired.

**What each surviving channel actually reaches**

| Device | MTP | Card pull |
|---|---|---|
| Anbernic RG405M (GammaOS) | ✅ Android 12 | ✅ |
| Miyoo A30 (Spruce) | ❌ | ✅ |
| PowKiddy RGB30 (ArkOS) | ❌ no USB device mode | ✅ |
| PowKiddy RGB10X | ❌ | ✅ |
| Miyoo Mini Plus (Onion) | ❌ | ✅ |
| Batlexp G350 (ArkOS) | ❌ | ✅ |

So the card is the load-bearing channel and MTP is the one device that skips it. Worth knowing
before either gets more engineering.

**Removed**

- `js/lan.js`, the "Handheld over Wi-Fi" card, its CSS, and the four `kind === "lan"` branches in
  `js/sdcard.js`
- The generic "USB device link" card and its WebUSB/Web Serial code in `js/app.js`. It detected
  devices it could never read, and its own hint text admitted as much. `Import queue file…`
  survived — it moved into the card card as the fallback for browsers with no folder API.
- `tools/rgj-proxy.py`, and the `Retro Journey Sync Server.zip` release
- `sync/arkos/sync_engine.py` — the OTG-dongle Python engine, superseded by `sync/device/rgj-sync`

**Kept, deliberately**

- `js/mtp.js` + `js/vendor/libmtp-web/` — the only cable-based route, and it picks up both
  storages (Internal / SD Card) in one connection
- `js/sdcard.js` multi-volume — one handle per card, remembered in IndexedDB
- `sync/device/rgj-sync` and its ArkOS launcher
- `sync/retroarch/capture_achievements.lua` — nothing fills the queue without it

**Open question.** `capture_achievements.lua` writes `capture.spool.jsonl`; `rgj-sync add` is what
moves spool rows into the queue. Nobody has confirmed the Lua script is installed on a device or
that the spool format it emits matches what `add` parses. Until that is run once on hardware, every
queue in this system is legitimately empty.

---

## Reversal (2026-11-02) — the Wi-Fi question, answered on hardware

The 2026-11-01 cut reasoned from **FileBrowser**, and FileBrowser is not what Spruce ships. The
Miyoo A30 on SpruceOS answers SFTPGo:

```text
http://192.168.1.68:8080/                 302 -> /web/client/login    branding "SpruceOS"
http://192.168.1.68:8080/web/client/files 200  file browser, user "spruce"
GET  /api/v2/version                       200  {"version":"2.6.2",...}
GET  /api/v2/user/token                    Basic -> access_token, expires_at (+20 min)
GET  /api/v2/user/dirs?path=/roms/FC       200  JSON listing, 551 entries
GET  /api/v2/user/files?path=<f>           200  raw bytes
POST /api/v2/user/files/upload?path=<f>&mkdir_parents=true   201  raw body -> file
```

All six verified live against Peter's A30 (2026-11-02 04:35Z), including a write: `rgj-device.json`,
`rgj/rgj-queue.jsonl` and `rgj-sync` were uploaded to the card and read back byte-identical. The
queue file survives `mkdir_parents=true` on a path that did not exist.

**This reaches the card with no cable and no card reader, and it reads *and writes* the ack.** That
is everything the card channel does, minus the walk to the PC. The old objection still holds in
form — SFTPGo sends no CORS headers either, so a page on another origin cannot read its replies —
but the escape hatch named in the previous section now exists and is installed.

### The relay

`js/httpsync.js` calls the device through the Rool Web Bridge extension (v1.5.2). The page posts
`{__rgjLan:1,id,req}` to itself, `relay.js` (content script) hands it to the service worker, and the
service worker's `lanFetch` does the actual request: an extension fetch is not mixed-content blocked
and, with `<all_urls>` host access, not CORS bound either. The reply comes back as a second
`postMessage`. Nothing is installed on the handheld, and the phone/PC/laptop doing the browsing is
the only thing that has to be on the LAN.

Content-script scope is deliberately narrow (`*.github.io`, `localhost`, `127.0.0.1`, `file://`) and
`relay.js` refuses any URL that is not plain `http` to a private address. The page falls back to a
direct `fetch` when no relay answers — that path only works if the page is itself served over
`http` *and* CORS is enabled in `sftpgo.json` (`httpd.cors.enabled`), so treat it as a bonus.

### Channel table, revised

| Device | MTP | Card pull | LAN HTTP |
|---|---|---|---|
| Miyoo A30 (Spruce) | ❌ | ✅ | ✅ **verified, SFTPGo 2.6.2** |
| Anbernic RG405M (GammaOS) | ✅ | ✅ | untested (Android has its own servers) |
| PowKiddy RGB30 (ArkOS) | ❌ | ✅ | untested — needs an SFTPGo/FileBrowser package |
| PowKiddy RGB10X | ❌ | ✅ | untested |
| Miyoo Mini Plus (Onion) | ❌ | ✅ | untested (Onion ships a web server on some builds) |
| Batlexp G350 (ArkOS) | ❌ | ✅ | untested |

The queue contract is unchanged: `rgj/rgj-queue.jsonl` in, `rgj/rgj-ack.json` + `rgj/rgj-ack.keys`
out, same rows, same dedupe. Only the transport differs, so a card pulled by cable today is pulled
by Wi-Fi tomorrow with no migration.

### What the page does with a pulled row

1. `importRows()` — unchanged — dedupes into `state.queued` and logs the import.
2. `RGJLan.markEarned()` — new — maps `game_hash` back to a library game (same djb2 the page uses),
   finds the game's answer card, and if `achievement_id` is one of that game's three RA picks, writes
   the unlock into `rgj-ach-earned-v1`. That is what fills the star on the Journey map, and it fills
   it **from the device**, before RetroAchievements has been asked anything.
3. `RGJLan.ack()` writes the ack pair back so `rgj-sync prune` can retire the rows.

A later RA pull can no longer erase device-earned stars: `ensureEarned()` in `js/achievements.js`
now merges instead of replacing.

### The gap that remains

`markEarned` needs the game's RA id and its three picks in the local cache (`rgj-ach-v1`), which
only an **RA pull** populates — so the first run against a fresh browser needs the RA username and
Web API key. After that, rows stand alone. And `capture_achievements.lua` is still a stub with an
empty `ACHIEVEMENTS` table: nothing on the device emits a row yet, so for the Contra test the row is
written with `rgj-sync add` or uploaded directly. See `docs/Contra LAN Test.md`.
