#!/usr/bin/env python3
"""Build data/ra-achievements.json from the RetroAchievements Web API.

Replaces the browser-scraping harvester. The API gives authoritative titles,
ids and per-achievement rarity (TrueRatio), so title matching against this
page's library is exact instead of fuzzy, and no key of the visitor's is
needed to ship the bundle.

    RA_KEY=xxxx python3 tools/harvest-ra-api.py [--platform nes ...]

Raw responses are cached under .harvest/api/ (gitignored) so re-runs only
re-request what changed. Every game in the library gets a record; games RA has
no achievements for are recorded as unmatched rather than silently dropped.
"""
import json, os, re, subprocess, sys, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".harvest" / "api"
CONSOLES = {"nes": 7, "snes": 3, "genesis": 1, "tg16": 8, "gba": 5, "nds": 18}
KEY = os.environ.get("RA_KEY", "")
UA = "Mozilla/5.0 (retro-gaming-journey bundle builder)"
RELAX_UNLICENSED = False
JUNK = re.compile(r"^~|\[subset|~hack~|~prototype~|~unsolved~|~demo~|~bootleg~|translat|\(hack\)", re.I)


def api(path):
    """One API call. Retries on 5xx / rate-limit, never on a clean 404."""
    for attempt in range(4):
        p = subprocess.run(
            ["curl", "-s", "-m", "40", "-A", UA,
             f"https://retroachievements.org/API/{path}{'&' if '?' in path else '?'}y={KEY}"],
            capture_output=True, text=True)
        body = p.stdout.strip()
        if body.startswith("{") or body.startswith("["):
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                pass
        time.sleep(1.5 * (attempt + 1))
    return None


def norm_title(s):
    """Identical to RA.normTitle() in js/retroachievements.js — the bundle's keys and
    the page's lookups have to agree byte for byte, so this is deliberately duplicated
    rather than approximated."""
    s = str(s or "").lower()
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b(the|a|an)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def deacc(s):
    """Strip accents for *matching* only. The page's normTitle() keeps them, so keys
    stay in the page's form ("d j vu") while comparisons still find "Déjà Vu"."""
    import unicodedata
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()


def sq(s):
    return re.sub(r"[^a-z0-9]+", "", norm_title(deacc(s)))


def toks(s):
    return [t for t in norm_title(deacc(s)).split(" ") if t]


def score(query, cand):
    """How well a candidate RA title matches a library title (0-100).

    RA titles carry subtitles and regional pairs: "Landstalker: The Treasures of
    King Nole", "Warsong | Langrisser: The Descendants of Light". Scoring is
    containment + token overlap rather than edit distance, and a clean base set
    beats a hack at the same score (see match_title's second pass).
    """
    if JUNK.search(cand) and not RELAX_UNLICENSED:
        return 0
    a, b = sq(query), sq(cand)
    if not a or not b:
        return 0
    if a == b:
        return 100
    if b.startswith(a) or a.startswith(b) or a in b:
        base = 40
    else:
        base = 0
    ta, tb = set(toks(query)), set(toks(cand))
    overlap = len(ta & tb) / max(1, len(ta | tb))
    return max(base, int(overlap * 60)) + (6 if overlap > 0.2 else 0)


def match_title(title, games, unlicensed_ok=False):
    """Best RA game for a library title. Two passes: clean base sets first, then
    ~Unlicensed~/~Hack~ entries penalised by 6 — a hack should never win while a clean
    set exists, but Linus Spacehead's Cosmic Crusade only exists as unlicensed."""
    global RELAX_UNLICENSED
    RELAX_UNLICENSED = unlicensed_ok
    best, best_score = None, 22
    for g in games:
        s = score(title, g.get("Title", "")) - (6 if unlicensed_ok else 0)
        if s > best_score:
            best, best_score = g, s
    RELAX_UNLICENSED = False
    return best, best_score


def library():
    """The page's own title list, read out of js/data.js so the two never drift."""
    node = """
    const fs = require('fs');
    const src = fs.readFileSync(process.argv[1], 'utf8').split('// Stable id for a game')[0];
    const { GENRES, GAME_LIBRARY } = new Function(src + '; return { GENRES, GAME_LIBRARY };')();
    const out = {};
    for (const g of GENRES) for (const p of Object.keys(GAME_LIBRARY[g])) (out[p] ||= []).push(...GAME_LIBRARY[g][p]);
    console.log(JSON.stringify(out));
    """
    r = subprocess.run(["node", "-e", node, str(ROOT / "js" / "data.js")], capture_output=True, text=True)
    return json.loads(r.stdout)


def tier(rows):
    """easy / intermediate / advanced, chosen by rarity.

    Meta achievements (Konami codes, "thanks for playing") carry 0 points and
    TrueRatio 0; they sit at the bottom of every ratio sort and would win "easy"
    in every game, so they are excluded. Ratios are long-tailed — Contra runs
    1 -> 385 — so intermediate is the geometric midpoint, not the arithmetic one.
    """
    rows = [r for r in rows if r["points"] > 0 and r["ratio"] > 0]
    rows.sort(key=lambda r: (r["ratio"], r["points"], r["id"]))
    if not rows:
        return []
    if len(rows) <= 3:
        return [dict(r, tier=t) for r, t in zip(rows, ["easy", "intermediate", "advanced"])]
    easy, hard = rows[0], rows[-1]
    mid = (max(easy["ratio"], 1) * max(hard["ratio"], 1)) ** 0.5
    inner = rows[1:-1]
    middle = min(inner, key=lambda r: abs(__import__("math").log(max(r["ratio"], 1)) - __import__("math").log(mid)))
    return [dict(easy, tier="easy"), dict(middle, tier="intermediate"), dict(hard, tier="advanced")]


def main(argv):
    only = None
    if "--platform" in argv:
        only = argv[argv.index("--platform") + 1].split(",")
    CACHE.mkdir(parents=True, exist_ok=True)
    lib = library()
    out = {"schema": "rgj-achievements-v1", "source": "retroachievements.org Web API", "games": {}}
    existing = ROOT / "data" / "ra-achievements.json"
    if only and existing.exists():
        # partial run: keep the platforms we are not rebuilding
        prev = json.loads(existing.read_text()).get("games", {})
        out["games"] = {k: v for k, v in prev.items() if k.split("|")[0] not in only}
    for platform, titles in lib.items():
        if only and platform not in only:
            continue
        console = CONSOLES.get(platform)
        if not console:
            continue
        cache_file = CACHE / f"gamelist-{platform}.json"
        if cache_file.exists():
            games = json.loads(cache_file.read_text())
        else:
            games = api(f"API_GetGameList.php?i={console}&f=1") or []
            cache_file.write_text(json.dumps(games))
            time.sleep(0.3)

        done = miss = 0
        for title in titles:
            best, best_score = None, 22
            for unlicensed_ok in (False, True):
                best, best_score = match_title(title, games, unlicensed_ok)
                if best:
                    break
            if not best:
                out["games"][f"{platform}|{norm_title(title)}"] = {"unmatched": True}
                miss += 1
                continue
            gfile = CACHE / f"game-{best['ID']}.json"
            if gfile.exists():
                ext = json.loads(gfile.read_text())
            else:
                ext = api(f"API_GetGameExtended.php?i={best['ID']}") or {}
                gfile.write_text(json.dumps(ext))
                time.sleep(0.25)
            rows = []
            for a in (ext.get("Achievements") or {}).values():
                rows.append({"id": a["ID"], "title": a["Title"], "desc": a.get("Description", ""),
                             "points": int(a.get("Points") or 0), "ratio": int(a.get("TrueRatio") or 0),
                             "type": a.get("type") or ""})
            picks = tier(rows)
            out["games"][f"{platform}|{norm_title(title)}"] = {
                "raId": best["ID"], "raTitle": best["Title"], "raConsole": best.get("ConsoleName"),
                "matchScore": best_score, "picks": picks, "unmatched": False}
            done += 1
        print(f"{platform}: {done} matched, {miss} unmatched, {len(titles)} titles", flush=True)
    (ROOT / "data" / "ra-achievements.json").write_text(json.dumps(out, indent=1))
    print("wrote data/ra-achievements.json", len(out["games"]), "games")


if __name__ == "__main__":
    main(sys.argv[1:])
