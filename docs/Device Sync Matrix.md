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
