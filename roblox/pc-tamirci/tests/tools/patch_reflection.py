#!/usr/bin/env python3
"""Builds the reflection database the headless test engine runs with.

Lune refuses to read runtime-only properties (BasePart.Position, Humanoid.Health,
GuiObject.AbsoluteSize, ...) because they have no serialized default, and
roblox.implementProperty cannot override a property the database knows about.
This script copies the database embedded in the installed `lune` binary and drops
every property tests/lib/Engine.luau implements itself, so the engine's derived
versions take over. Lune picks the file up through the RBX_DATABASE variable.

    python3 tests/tools/patch_reflection.py [out_path]
"""
import os
import re
import shutil
import sys

import msgpack  # pip install msgpack

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "build", "reflection.msgpack")

lune = shutil.which("lune")
if not lune:
    sys.exit("lune is not on PATH")
blob = open(lune, "rb").read()


def find_database(data):
    # the database is a msgpack array [version[4], classes{}, enums{}]; locate it from a known class
    anchor = data.find(b"\xa8BasePart\x95\xa8BasePart")
    if anchor < 0:
        sys.exit("reflection database not found in the lune binary")
    pos = anchor
    while True:
        pos = data.rfind(b"\x93\x94", 0, pos)
        if pos < 0 or anchor - pos > 2_000_000:
            sys.exit("reflection database header not found")
        try:
            up = msgpack.Unpacker(raw=False, strict_map_key=False, max_buffer_size=0)
            up.feed(data[pos : pos + 16_000_000])
            obj = up.unpack()
            if isinstance(obj, list) and len(obj) == 3 and isinstance(obj[1], dict) and "BasePart" in obj[1]:
                return obj
        except Exception:
            pass


db = find_database(blob)
classes = db[1]

engine = open(os.path.join(root, "tests", "lib", "Engine.luau"), encoding="utf-8").read()
pairs = set(re.findall(r'(?:valueProp|implementProperty)\(\s*"(\w+)",\s*"(\w+)"', engine))

removed, skipped = [], []
for cls, prop in sorted(pairs):
    c = classes.get(cls)
    if c is None:
        skipped.append(f"{cls}.{prop} (unknown class)")
        continue
    if prop in c[3]:
        del c[3][prop]
        removed.append(f"{cls}.{prop}")
    else:
        # declared on a superclass: the shim would hide it for siblings too, so leave it
        owner = c[2]
        while owner and prop not in classes[owner][3]:
            owner = classes[owner][2]
        if owner:
            skipped.append(f"{cls}.{prop} (declared on {owner})")

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "wb") as f:
    f.write(msgpack.packb(db, use_bin_type=True))
print(f"wrote {out}: {len(removed)} properties handed to the engine")
for s in skipped:
    print("  kept", s)
