#!/bin/sh
# ArkOS launcher: shows up under Options -> Tools when placed in /roms/tools/
# Runs "rgj-sync tick" from the card root.
HERE=$(dirname "$0")
for ROOT in /roms /storage/roms "$HERE/.." "$HERE"; do
  if [ -f "$ROOT/rgj-sync" ]; then
    exec sh "$ROOT/rgj-sync" tick
  fi
done
echo "rgj-sync: could not find rgj-sync on this card" >&2
sleep 3
exit 1
