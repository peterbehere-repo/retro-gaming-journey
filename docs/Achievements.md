# Three achievements per game

Every NES title in the library carries exactly three RetroAchievements picks, and those
same three are the stars on the matching Journey map path point. There is one source of
truth: [`js/achievements.js`](../js/achievements.js).

## Why RA rather than hand-written goals

RetroAchievements already publishes, per achievement, a `TrueRatio` — points weighted by
how rare the unlock is across all players. That is a ready-made difficulty ordering that
(1) never drifts out of date, (2) keeps the modal text identical to what the player sees on
retroachievements.org, and (3) needs no curation pass for 100 NES titles.

There was never a previous set of three picks to extend: the old site had a *badges* panel
(genre milestones at 25/50/75/100%, platform mastery) driven by locally invented names and
an asset pipeline with 1,800 placeholder routes. That panel and its ingestion tooling were
removed; achievements now come from RA.

## How the three are chosen

Candidates are the game's achievements with `Points > 0`, sorted by `TrueRatio`:

| Tier | Rule |
|---|---|
| **easy** | lowest `TrueRatio` |
| **advanced** | highest `TrueRatio` |
| **intermediate** | whichever remaining achievement sits closest to the midpoint of that game's own range |

Using the game's own range rather than a global threshold matters: an easy Contra
achievement is not the same ratio as an easy Tetris achievement. If a game has fewer than
three achievements, it keeps what RA lists; if it has none, the card says so plainly.

## Where it runs

`js/achievements.js` calls `RA.ensure(platform, title)` — the RA client in
`js/retroachievements.js`, which talks to `https://retroachievements.org/API/` directly.
That API sends `Access-Control-Allow-Origin: *`, so no proxy is involved (contrast the
retired FileBrowser/Wi-Fi channel, which had no CORS headers at all).

Credentials — RA username and web API key — live in `localStorage` only, never in the repo.
With no credentials the page still works: cards show "Not loaded", and the Journey map
falls back to the untitled star row.

## Cache shape

```json
{ "nes|contra": { "raId": 1446, "raTitle": "Contra", "picks": [
  { "id": 1, "title": "First Blood", "desc": "...", "points": 5, "ratio": 120, "tier": "easy" }
] } }
```

Earned state lives separately in `rgj-ach-earned-v1`, keyed `raId → achievementId → date`.
**Local wins**: an unlock imported from a card is never downgraded by a later RA pull, so
offline play is not lost. `summary()` reports `filled`/`total`/`unmatched` and the Sync tab
shows the unmatched titles so gaps in RA's own catalogue are visible rather than silent.

## Refreshing

Sync tab → **Pull progress** re-reads RA for the whole library and rewrites the cache. The
Journey map redraws its stars on the `rgj-ach` message the dashboard posts when that
finishes.
