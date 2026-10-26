#!/usr/bin/env python3
"""Retro Gaming Journey — Lightweight Asset Ingestion Pipeline (build pack enhancement).

Structures the 1,800 badge asset locations (600 games x 3 difficulty tiers) without
bloating the repo: the dashboard never loads the payload — assets are fetched/unpacked
externally at runtime (serverless frontend mapping via master_library_index.json).

Sources (pick one):
  default        derive the master matrix from js/data.js already in this repo
  --url URL      fetch the master game matrix JSON ({genre: {system: [titles]}}) directly
                 (e.g. the gist referenced in the Rool build pack; its printed URL was
                 truncated, so pass the full URL when you have it)

Outputs:
  Retro_Achievements_Asset_Library.zip   assets/{genre}/{system}/{slug}_{tier}.png x1800
  master_library_index.json              600 route records for frontend mapping

Usage:
  python3 tools/build_library.py            # from repo data
  python3 tools/build_library.py --url https://gist.githubusercontent.com/.../raw
  python3 tools/build_library.py --unzip out_dir   # also explode the tree locally
"""
import argparse, json, subprocess, sys, urllib.request, zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ZIP_NAME = "Retro_Achievements_Asset_Library.zip"
INDEX_NAME = "master_library_index.json"
TIERS = ["beginner", "intermediate", "advanced"]

# Canonical 1x1 fully transparent RGBA PNG (placeholder tile; swap for real badge art
# later by re-running with --art-dir).
TRANSPARENT_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000b49444154789c6360000200000500017a5eab3f0000000049454e44ae426082")

# Difficulty tier -> SQLite validation target rules (build pack section 3).
TIER_RULES = {
    "beginner":     "Softcore validation states; standard memory hooks.",
    "intermediate": "Frame timing envelope check parameters active.",
    "advanced":     "Strict Hardcore environment tracking required.",
}


def slugify(title: str) -> str:
    """Build-pack slug: spaces -> underscores, then strip anything a filesystem/zip
    route shouldn't carry. Deterministic, so device and dashboard agree on routes."""
    s = title.lower().replace(" ", "_")
    return "".join(c for c in s if c.isalnum() or c == "_") or "untitled"


def load_matrix_from_repo() -> dict:
    """Evaluate js/data.js in node and export GAME_LIBRARY (no duplication of the grid)."""
    src = (REPO / "js" / "data.js").read_text()
    js = src + "\nreturn GAME_LIBRARY;"
    out = subprocess.run(["node", "-e", f"console.log(JSON.stringify((new Function({json.dumps(js)}))()))"],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def load_matrix(url: str) -> dict:
    print(f"Fetching master game matrix payload from {url} ...")
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build(matrix: dict, art_dir: Path | None, unzip_to: Path | None) -> dict:
    routes, total = [], 0
    with zipfile.ZipFile(REPO / ZIP_NAME, "w", zipfile.ZIP_DEFLATED) as zipf:
        for genre, system_data in matrix.items():
            for system, games in system_data.items():
                for title in games:
                    s = slugify(title)
                    base = f"assets/{genre}/{system}/{s}"
                    assets = [f"{base}_{tier}.png" for tier in TIERS]
                    routes.append({
                        "game": title, "genre": genre, "system": system, "slug": s,
                        "asset_base": base, "assets": assets,
                    })
                    for i, route in enumerate(assets):
                        payload = (art_dir / route.split("/", 1)[1]).read_bytes() if art_dir else TRANSPARENT_PNG
                        zipf.writestr(route, payload)
                        total += 1
        if unzip_to:
            zipf.extractall(unzip_to)

    index = {
        "schema": "rgj-asset-index-v1",
        "total_games": len(routes),
        "total_assets": total,
        "tiers": TIERS,
        "tier_rules": TIER_RULES,
        "zip": ZIP_NAME,
        "games": routes,
    }
    (REPO / INDEX_NAME).write_text(json.dumps(index, indent=1))
    print(f"Success! {total} asset locations structured in {ZIP_NAME}; route map in {INDEX_NAME}.")
    return index


def main():
    ap = argparse.ArgumentParser(description="RGJ asset ingestion pipeline")
    ap.add_argument("--url", help="master game matrix JSON URL (default: repo js/data.js)")
    ap.add_argument("--art-dir", type=Path, help="override placeholder tiles with real PNGs under this dir")
    ap.add_argument("--unzip", type=Path, help="also extract the asset tree to this directory")
    args = ap.parse_args()

    matrix = load_matrix(args.url) if args.url else load_matrix_from_repo()
    games = sum(len(g) for sd in matrix.values() for g in sd.values())
    if games != 600:
        sys.exit(f"master matrix holds {games} titles — expected exactly 600; aborting")
    build(matrix, args.art_dir, args.unzip)


if __name__ == "__main__":
    main()
