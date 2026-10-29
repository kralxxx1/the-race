"""Downloads Roblox assets into build/: the official Roblox packs the game's realistic models come
from (build/packs/<id>.rbxm), and meshes/images for the previewer (build/meshcache, build/texcache).

  python3 tools/assets/fetch.py packs
  python3 tools/assets/fetch.py meshes <id> [<id> ...]
  python3 tools/assets/fetch.py images <id> [<id> ...]

Only public assets download without logging in; the rest are skipped (the previewer then draws a
box). The packs are all made and published by Roblox (creator id 1).
"""
import gzip
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))

PACKS = {
    6418239833: 'Sedan',
    6418234850: 'SUV',
    6418225759: 'Pickup Truck',
    6433316269: 'Van',
    6433323089: 'Sports Car',
    6418230807: 'Police Car',
    6418221666: 'Light Utility Vehicle',
    6370681139: 'City Props Pack',
    6418277837: 'City Building Pack',
    6432233485: 'City Road Pack',
    6432306802: 'Forest Pack',
    13168370735: 'Modular Building Kit - Modern City',
    13168345645: 'Modern City Materials Pack',
    10840661513: 'Landscaping Pack - Duvall Drive',
    10847897579: 'House Furniture Pack - Duvall Drive',
    10840642581: 'House Props Pack - Duvall Drive',
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    return data


def download(asset_id, path):
    if os.path.exists(path):
        return 'cached'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        meta = json.loads(get(f'https://assetdelivery.roblox.com/v2/asset/?id={asset_id}'))
        data = get(meta['locations'][0]['location'])
    except Exception as e:  # private or removed
        open(path + '.missing', 'w').write(str(e))
        return 'missing'
    with open(path, 'wb') as f:
        f.write(data)
    return 'ok'


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'packs'
    if what == 'packs':
        jobs = [(i, os.path.join(ROOT, 'build', 'packs', f'{i}.rbxm')) for i in PACKS]
    else:
        folder = 'meshcache' if what == 'meshes' else 'texcache'
        ext = 'mesh' if what == 'meshes' else 'img'
        jobs = [(int(i), os.path.join(ROOT, 'build', folder, f'{i}.{ext}')) for i in sys.argv[2:]]
        jobs = [j for j in jobs if not os.path.exists(j[1] + '.missing')]
    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(lambda j: (j[0], download(*j)), jobs))
    counts = {}
    for _, r in results:
        counts[r] = counts.get(r, 0) + 1
    print(what, counts)


if __name__ == '__main__':
    main()
