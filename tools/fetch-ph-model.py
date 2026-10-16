#!/usr/bin/env python3
"""
Download pieces of a Poly Haven model (CC0) for the scenery asset pipeline.

Usage:
  python3 -I tools/fetch-ph-model.py <out-dir> <model-id> <res> tex:<map> [tex:<map> ...]
  python3 -I tools/fetch-ph-model.py <out-dir> <model-id> <res> gltf        (gltf + bin + all textures)

`<map>` is a key of the model's file list (e.g. twig_diff, twig_alpha, bark_arm). Textures
are saved as <out-dir>/<model-id>_<map>.jpg. Files already present are skipped.
"""
import json
import os
import sys
import urllib.request

UA = {'User-Agent': 'the-race-asset-build/1.0'}


def get(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600).read()


def main() -> None:
    out, mid, res, *what = sys.argv[1:]
    os.makedirs(out, exist_ok=True)
    files = json.loads(get(f'https://api.polyhaven.com/files/{mid}'))
    for w in what:
        if w.startswith('tex:'):
            key = w[4:]
            ent = files[key][res]
            fmt = 'jpg' if 'jpg' in ent else 'png'
            dst = os.path.join(out, f'{mid}_{key}.{fmt}')
            if not os.path.exists(dst):
                with open(dst, 'wb') as f:
                    f.write(get(ent[fmt]['url']))
            print(dst)
        elif w == 'gltf':
            g = files['gltf'][res]['gltf']
            base = os.path.join(out, mid)
            os.makedirs(base, exist_ok=True)
            targets = [(g['url'], os.path.join(base, os.path.basename(g['url'])))]
            for rel, inc in g['include'].items():
                targets.append((inc['url'], os.path.join(base, rel)))
            for url, dst in targets:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                if not os.path.exists(dst):
                    with open(dst, 'wb') as f:
                        f.write(get(url))
                print(dst)


if __name__ == '__main__':
    main()
