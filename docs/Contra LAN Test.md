# Contra over the LAN — bring-up test

Target: prove one row travels **device → browser → a filled star**, with no cable, and that the
ack travels back. Contra (NES, Action) is the test title because it is already on the A30's card
(`/roms/FC/Contra (USA).nes`).

## What is already on the A30

Verified by write-and-read-back on 2026-11-02:

| Path on the card | Contents |
|---|---|
| `/rgj-device.json` | `{ device_id: "a30_hw01", model: "Miyoo A30", os: "SpruceOS", transport: "sftpgo-http" }` |
| `/rgj/rgj-queue.jsonl` | one placeholder row (`achievement_id: "ra:contra-test-1"` — deliberately not a real pick, so it proves transport without faking a star) |
| `/rgj-sync` | device-side queue keeper v0.2 |

## Steps

1. **Extension.** Load `Rool Web Bridge 1.5.2` unpacked (`chrome://extensions` → Developer mode →
   Load unpacked). It replaces nothing — 1.5.1 can stay installed, but two bridges polling the same
   queue branch will duplicate work, so disable 1.5.1 while testing. This version adds the LAN relay.
2. **Page.** Open <https://peterbehere-repo.github.io/retro-gaming-journey/> → **Sync console**.
   The new card is *LAN device (HTTP)*.
3. **Address.** `http://192.168.1.68:8080`, user `spruce`, password (A30's SFTPGo password). Press
   **Save**, then **Probe**. Expect pill `queue ready` and a hint ending `Relay: extension.`
   If it says `Relay: none`, the page ran a direct fetch — that only succeeds with CORS on, so
   treat it as a failed relay and check the extension.
4. **RA picks.** In *RetroAchievements* card: enter the RA username and Web API key → **Save
   account** → **Pull progress**. This fills `rgj-ach-v1` with each game's three picks, Contra
   included — the star mapping needs those ids.
5. **Print Contra's picks.** Console:

   ```js
   const g = ALL_GAMES.find(x => x.title === "Contra" && x.platform === "nes");
   console.log(g.id, RA.get("nes", "Contra"));
   ```

6. **Write a real row on the device.** Console — appends one row for the easy pick:

   ```js
   await RGJLan.testRow({ game: "Contra" });
   ```

   or name the id yourself: `await RGJLan.testRow({ game: "Contra", achievementId: 12345 });`
7. **Pull it.** Press **Pull rows** on the LAN card. Expect `2 new rows` (the placeholder plus the
   real one) the first time — the placeholder is skipped by the star mapper, the real one is not.
   Check **Journey map**: Contra's path point should now show one filled star.
8. **Confirm the ack.** Console:

   ```js
   await RGJLan._send({ method: "GET", url: RGJLan.devices()[0].base +
     "/api/v2/user/files?path=" + encodeURIComponent("rgj/rgj-ack.json") });
   ```

   The reply should list both rows. On the device, `sh /rgj-sync status` now reports them acked,
   and `sh /rgj-sync prune` retires them into `rgj-pruned.jsonl` (never deleted).

## Expected failures, and what they mean

| Symptom | Cause |
|---|---|
| `wrong username or password` | SFTPGo uses a different account than the web login page suggests |
| `unreachable` + `Relay: none` | 1.5.2 not loaded, or the page is open in a profile without it |
| `pull failed — could not read rgj/rgj-queue.jsonl` | row never written; re-run step 6 and watch for its error |
| rows import but no star | RA picks not cached (step 4 skipped), or `achievement_id` is not one of the three picks |
| ack write 403 | the SFTPGo user is read-only on `/` — needs write scope on the card root |

## Not yet solved

Nothing on the device writes rows by itself: `sync/retroarch/capture_achievements.lua` is still a
stub with an empty `ACHIEVEMENTS` table. So the "device pushes its own unlocks" half of the story is
untested on hardware — this test stands in for it with `testRow`. Until that Lua script has real
memory addresses for a title, every row this system sees will be hand-made.
