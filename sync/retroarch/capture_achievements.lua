-- Retro Gaming Journey — RetroArch capture layer (spec 2.1)
--
-- Monitors emulated core RAM for achievement trigger states and appends each
-- hit to a JSONL spool file WITHOUT blocking the frame loop. The ArkOS sync
-- engine (sync/arkos/sync_engine.py) later ingests the spool into the offline
-- SQLite queue. No networking happens here — the handheld stays fully offline
-- during gameplay.
--
-- Install: copy into RetroArch's /auto/ retroarch dir or load via
--   RetroArch -> Load Content -> (run game) -> Quick Menu -> Tools -> Lua Browser
-- Configure ACHIEVEMENTS below per game (RAM address + expected value).

local SPOOL = "/storage/.config/rgj/capture.spool.jsonl"

-- Per-game trigger table. Example entries show the pattern:
--   hash  = ROM identifier (first 16 hex chars is fine; keep in sync with sync engine)
--   addr  = core memory address to watch (use RetroArch -> Tools -> Memory mapping)
--   value = trigger value
--   aid   = stable achievement id string
local ACHIEVEMENTS = {
  -- {
  --   hash = "a4f3b1901c0dfe12", addr = 0x0E4F, value = 0x63, size = "u8",
  --   aid  = "id_10204", name = "Beat the game"
  -- },
}

local function write_event(ev)
  local f = io.open(SPOOL, "a")
  if f then
    f:write(string.format('{"game_hash":"%s","achievement_id":"%s","timestamp":%d,"hardcore":%s}\n',
      ev.hash, ev.aid, os.time(), tostring(ev.hardcore ~= false)))
    f:close()
  end
end

local function read_mem(addr, size)
  if size == "u16" then return memory.read_u16_le(addr) end
  return memory.read_u8(addr)
end

local fired = {}  -- dedupe: achievement fires once per session

local function check_all()
  for _, a in ipairs(ACHIEVEMENTS) do
    local key = a.hash .. ":" .. a.aid
    if not fired[key] then
      local ok, val = pcall(read_mem, a.addr, a.size or "u8")
      if ok and val == a.value then
        fired[key] = true
        write_event({ hash = a.hash, aid = a.aid, hardcore = true })
      end
    end
  end
end

-- Poll between frames; pcall keeps a bad address from killing emulation.
while true do
  pcall(check_all)
  emu.wait(1)  -- ~1 frame; negligible overhead, no stutter
end
