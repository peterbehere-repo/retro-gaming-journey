#!/usr/bin/env python3
"""Pull NES achievement data from RetroAchievements into data/ra-raw/.

Uses data/ra-games.json (title -> RA game id) written by --index, so the
100 titles in the page's library are resolved against RA's own NES list once
rather than by guessing game ids.

  python3 tools/fetch-ra.py --index        # needs RGJ_RA_KEY, writes data/ra-games.json
  python3 tools/fetch-ra.py                # fetches achievements for every mapped id
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "ra-raw"
API = "https://retroachievements.org/API/"
NES = 7
KEY = os.environ.get("RGJ_RA_KEY", "").strip()


def call(endpoint, **params):
    params["y"] = KEY
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "rgj-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def norm(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def library_titles():
    """Every NES title the page lists, read straight out of js/data.js."""
    src = (ROOT / "js" / "data.js").read_text()
    titles = []
    for blob in re.findall(r'nes:\s*\[(.*?)\]', src, re.S):
        titles += re.findall(r'"([^"]+)"', blob) + re.findall(r"'([^']+)'", blob)
    return titles


def main():
    if not KEY and "--offline" not in sys.argv:
        sys.exit("set RGJ_RA_KEY to your RetroAchievements web API key")

    if "--index" in sys.argv:
        games = call("API_GetGameList.php", i=NES, f=1)
        by_norm = {}
        for g in games:
            by_norm.setdefault(norm(g["Title"]), g)
        out, missing = {}, []
        for t in library_titles():
            hit = by_norm.get(norm(t))
            if not hit:                      # unique prefix match, e.g. "Castlevania III"
                cands = [g for g in games if norm(g["Title"]).startswith(norm(t))]
                hit = cands[0] if len(cands) == 1 else None
            if hit:
                out[t] = {"id": hit["ID"], "title": hit["Title"]}
            else:
                missing.append(t)
        (ROOT / "data" / "ra-games.json").write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
        print(f"{len(out)} mapped, {len(missing)} unmatched")
        for m in missing:
            print("  unmatched:", m)
        return

    RAW.mkdir(parents=True, exist_ok=True)
    games = json.loads((ROOT / "data" / "ra-games.json").read_text())
    for i, (title, g) in enumerate(sorted(games.items()), 1):
        dest = RAW / f"{g['id']}.json"
        if dest.exists():
            print(f"[{i}/{len(games)}] {title}: cached"); continue
        data = call("API_GetGameExtended.php", i=g["id"])
        dest.write_text(json.dumps(data, indent=1))
        n = len(data.get("Achievements") or {})
        print(f"[{i}/{len(games)}] {title}: {n} achievements")
        time.sleep(0.2)


if __name__ == "__main__":
    main()
