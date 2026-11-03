# SUPERSEDED by tools/harvest-ra-api.py (2026-11-02). This merged scraped harvest
# files that only ever covered NES and landed on ~Hack~ sets; the API builder covers
# every platform and is authoritative. Kept for reference only — it overwrites
# data/ra-achievements.json, so it refuses to run without --force.
import sys as _sys
if "--force" not in _sys.argv:
    _sys.exit("build-achievement-bundle.py is superseded by harvest-ra-api.py; "
              "re-run with --force only if you really mean to overwrite the bundle.")

#!/usr/bin/env python3
"""Assemble data/ra-achievements.json from a harvest of RetroAchievements public pages.

Each raw harvest file is { "<library title>": { raId, raTitle, n, picks[], unmatched } },
where picks were chosen in the browser by the same rules js/achievements.js uses
(highest/lowest/geometric-middle retro ratio, 0-point meta achievements excluded).

Keys must match RA.normTitle so the shipped cache drops straight into the page's
rgj-ach-v1 store.
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def norm_title(s):
    s = str(s or "").lower()
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b(the|a|an)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()

JUNK = re.compile(r"^~|hack|subset|prototype|bootleg|translat", re.I)


def main(paths):
    """Merge harvest files. A later file only replaces an earlier one when its match is
    better: RA tags hacks and subsets with a leading ~ ("~Hack~ Nightmare Punch-Out!!"),
    and a loose title match will happily land on one, so those never displace a clean
    base-set match. `fixup` passes are also given priority over the bulk passes."""
    games, score = {}, {}
    ordered = sorted(paths, key=lambda p: ("fixup" in pathlib.Path(p).name, pathlib.Path(p).name))
    for p in ordered:
        raw = json.loads(pathlib.Path(p).read_text())
        for title, rec in raw.items():
            picks = rec.get("picks") or []
            if not picks:
                continue
            ra_title = rec.get("raTitle") or title
            s = -1 if JUNK.search(ra_title) else int(rec.get("matchScore") or 50)
            k = f"nes|{norm_title(title)}"
            if k in games and s <= score[k]:
                continue
            games[k] = {
                "raId": rec["raId"],
                "raTitle": ra_title,
                "picks": picks,
                "unmatched": False,
            }
            score[k] = s
    out = {
        "schema": "rgj-achievements-v1",
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                        .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "retroachievements.org public game pages",
        "games": dict(sorted(games.items())),
    }
    dest = ROOT / "data" / "ra-achievements.json"
    dest.write_text(json.dumps(out, indent=1) + "\n")
    print(f"{len(games)} games -> {dest} ({dest.stat().st_size} bytes)")

if __name__ == "__main__":
    main(sys.argv[1:] or ["/tmp/h0.json"])
