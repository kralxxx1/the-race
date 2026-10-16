#!/usr/bin/env python3
"""
Roadside-scenery PBR textures (roofs, plaster, brick, planks, containers, cliffs, beach, tunnel tiles).

Reuses the download/re-encode helpers of tools/build-assets.py and writes the same layout
(public/assets/textures/<key>/{albedo,normal,arm}_1k.webp). Offline tool, not needed to run the game.

Usage:  python3 -I tools/build-world-textures.py <download-cache-dir> <public/assets dir>
Prints the TEXTURE_SETS entries to paste into src/render/assets.ts.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build_assets', os.path.join(HERE, 'build-assets.py'))
ba = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ba)

# key -> (poly haven id, real-world tile size in metres, resolutions)
WORLD_TEXTURES = {
    'roof_tiles': ('clay_roof_tiles_02', 2.5, ['1k']),
    'plaster': ('beige_wall_001', 3.0, ['1k']),
    'brick': ('red_brick', 1.4, ['1k']),
    'planks': ('raw_plank_wall', 1.9, ['1k']),
    'container': ('container_side', 1.9, ['1k']),
    'cliff': ('cliff_side', 1.8, ['1k']),
    'beach': ('coast_sand_03', 3.0, ['1k']),
    'tile_white': ('long_white_tiles', 1.3, ['1k']),
    'dry_ground': ('dry_mud_field_001', 3.0, ['1k']),
}


def main() -> None:
    cache, out = sys.argv[1:3]
    for key, (pid, size_m, resolutions) in WORLD_TEXTURES.items():
        largest = resolutions[-1]
        files = ba.polyhaven_sources(cache, pid, largest)
        imgs = {k: ba.Image.open(v).convert('RGB') for k, v in files.items()}
        for res in resolutions:
            px = ba.RES_PX[res]
            for kind, img in imgs.items():
                ba.save_webp(ba.resized(img, px), os.path.join(out, 'textures', key, f'{kind}_{res}.webp'), ba.QUALITY[res][kind])
        print(f"  {key}: {{ source: PH, id: '{pid}', authors: '?', sizeM: {size_m}, res: {resolutions} }},")


if __name__ == '__main__':
    main()
