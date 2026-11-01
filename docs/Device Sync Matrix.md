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
