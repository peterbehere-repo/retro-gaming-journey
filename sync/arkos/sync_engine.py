#!/usr/bin/env python3
"""Retro Gaming Journey — on-demand sync engine for ArkOS (PowKiddy RGB10X).

Runs from the ArkOS Options menu (or a .sh launcher). The handheld has no
internal Wi-Fi, so networking goes through a USB-C OTG dongle. Everything is
batched and pushed once, on demand — no background telemetry.

Usage:
    python3 sync_engine.py --status            show queue summary
    python3 sync_engine.py --dry-run           validate + print batch, push nothing
    python3 sync_engine.py --push              verify integrity and push queued rows
    python3 sync_engine.py --ingest spool.jsonl
                                               ingest RetroArch capture spool into the DB

Environment / config (sync_engine.ini next to this file or env vars):
    RGJ_API_URL   e.g. https://your-project.supabase.co  (endpoint: /rest/v1/achievement_queue)
    RGJ_API_KEY   anon key or service JWT (Bearer)
    RGJ_DEVICE_ID rgb10x_hw01
"""
import argparse, hashlib, hmac, ipaddress, json, os, sqlite3, socket, sys, time, urllib.request, urllib.error
from pathlib import Path

DB_PATH = Path(os.environ.get("RGJ_DB", Path.home() / ".config/rgj/queue.db"))
SECRET_FILE = Path(os.environ.get("RGJ_SECRET", Path.home() / ".config/rgj/device.secret"))
BATCH_SIZE = 200

SCHEMA = """
CREATE TABLE IF NOT EXISTS achievement_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_hash TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'PENDING',
    hardcore_mode INTEGER DEFAULT 1,
    security_nonce TEXT NOT NULL
);
"""

def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn

def device_secret() -> bytes:
    """Per-device HMAC key. Generated once; the integrity anchor for the queue."""
    if SECRET_FILE.exists():
        return SECRET_FILE.read_bytes()
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    secret = os.urandom(32)
    SECRET_FILE.write_bytes(secret)
    os.chmod(SECRET_FILE, 0o600)
    return secret

def row_mac(game_hash, achievement_id, unlocked_at, hardcore):
    """HMAC-SHA256 over the row contents — detects filesystem tampering (spec 2.2)."""
    msg = f"{game_hash}|{achievement_id}|{unlocked_at}|{hardcore}".encode()
    return hmac.new(device_secret(), msg, hashlib.sha256).hexdigest()

def nonce_ok(nonce: str, unlocked_at: str) -> bool:
    """Nonce must be sha256(unlock timestamp + secret) — replay-resistant."""
    want = hashlib.sha256(unlocked_at.encode() + device_secret()).hexdigest()[:16]
    return hmac.compare_digest(nonce, want)

def ingest(spool_path: str):
    """Turn RetroArch capture spool (JSONL) into queued, MAC-signed rows."""
    conn = db()
    n = 0
    for line in Path(spool_path).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        ev = json.loads(line)
        ts = ev.get("unlocked_at") or time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(ev["timestamp"]))
        hardcore = 1 if ev.get("hardcore", True) else 0
        conn.execute(
            "INSERT INTO achievement_queue (game_hash, achievement_id, unlocked_at, sync_status, hardcore_mode, security_nonce) "
            "VALUES (?, ?, ?, 'PENDING', ?, ?)",
            (ev["game_hash"], ev["achievement_id"], ts, hardcore, row_mac(ev["game_hash"], ev["achievement_id"], ts, hardcore)),
        )
        n += 1
    conn.commit()
    print(f"ingested {n} event(s) into {DB_PATH}")

def status():
    conn = db()
    for row in conn.execute("SELECT sync_status, COUNT(*) FROM achievement_queue GROUP BY sync_status"):
        print(f"{row[0]:10} {row[1]}")
    print(f"db: {DB_PATH}")

def wait_for_network(interface: str, timeout: int = 60) -> bool:
    """Bring up / wait for the OTG Wi-Fi dongle before pushing."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if interface and f"/sys/class/net/{interface}" not in "".join(os.listdir("/sys/class/net")):
                time.sleep(2); continue
            s = socket.create_connection(("8.8.8.8", 53), timeout=3)
            s.close()
            return True
        except OSError:
            time.sleep(2)
    return False

def push(api_url: str, api_key: str, device_id: str, interface: str, dry_run: bool):
    conn = db()
    rows = conn.execute(
        "SELECT id, game_hash, achievement_id, unlocked_at, hardcore_mode, security_nonce "
        "FROM achievement_queue WHERE sync_status='PENDING' ORDER BY id LIMIT ?", (BATCH_SIZE,)
    ).fetchall()
    if not rows:
        print("queue empty — nothing to push")
        return

    good, bad = [], []
    for rid, gh, aid, ts, hc, nonce in rows:
        if not nonce_ok(nonce, ts) or not hmac.compare_digest(row_mac(gh, aid, ts, hc), nonce):
            bad.append(rid)
        else:
            good.append({
                "user_id": os.environ.get("RGJ_USER_ID", ""),
                "device_id": device_id,
                "game_hash": gh,
                "achievement_id": aid,
                "timestamp": int(time.mktime(time.strptime(ts, "%Y-%m-%d %H:%M:%S"))) if ts else 0,
                "hardcore": bool(hc),
            })
    if bad:
        conn.executemany("UPDATE achievement_queue SET sync_status='REJECTED' WHERE id=?", [(r,) for r in bad])
        conn.commit()
        print(f"integrity check: {len(good)} valid, {len(bad)} REJECTED (tamper suspected)")

    if dry_run:
        print(json.dumps({"device_id": device_id, "batch": good}, indent=2))
        return
    if not wait_for_network(interface):
        print("no network over OTG dongle — queue untouched, try again later")
        return

    url = api_url.rstrip("/") + "/rest/v1/achievement_queue"
    req = urllib.request.Request(
        url, data=json.dumps(good).encode(),
        headers={"Authorization": f"Bearer {api_key}", "apikey": api_key,
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if 200 <= resp.status < 300:
                conn.executemany("UPDATE achievement_queue SET sync_status='SYNCED' WHERE id=?",
                                 [(r[0],) for r in rows if r[0] not in bad])
                conn.commit()
                print(f"pushed {len(good)} row(s) — SYNCED")
            else:
                print(f"push failed: HTTP {resp.status}")
    except urllib.error.URLError as e:
        print(f"push failed: {e} — queue untouched")

def main():
    ap = argparse.ArgumentParser(description="RGJ on-demand sync engine")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--ingest", metavar="SPOOL")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--interface", default=os.environ.get("RGJ_IFACE", "wlan0"),
                    help="OTG dongle interface (default wlan0)")
    args = ap.parse_args()

    api_url = os.environ.get("RGJ_API_URL", "")
    api_key = os.environ.get("RGJ_API_KEY", "")
    device_id = os.environ.get("RGJ_DEVICE_ID", "rgb10x_hw01")

    if args.status:
        status()
    elif args.ingest:
        ingest(args.ingest)
    elif args.push or args.dry_run:
        if not (args.dry_run or (api_url and api_key)):
            ap.error("RGJ_API_URL and RGJ_API_KEY must be set (or use --dry-run)")
        push(api_url, api_key, device_id, args.interface, args.dry_run)
    else:
        ap.print_help()

if __name__ == "__main__":
    main()
