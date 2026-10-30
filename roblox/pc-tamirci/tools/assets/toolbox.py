"""Finds ready-made models in Roblox's Creator Store (the Toolbox) and shows what they look like.

  python3 tools/assets/toolbox.py search "gaming pc case" [pages]    -> id, triangles, mesh parts, name
  python3 tools/assets/toolbox.py sheet out.png <id> <id> ...         -> a contact sheet of thumbnails
  python3 tools/assets/toolbox.py get <id> [<id> ...]                 -> build/toolbox/<id>.rbxm

Only free models are listed. Models are downloaded as they are; tools/assets/curate.luau strips every
script and sound before anything goes into the game.
"""
import gzip
import io
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
UA = {'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    return data if binary else json.loads(data)


def details(ids):
    out = {}
    for i in range(0, len(ids), 30):
        chunk = ids[i:i + 30]
        try:
            r = get('https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=' + ','.join(map(str, chunk)))
        except Exception as e:  # noqa: BLE001
            print('details failed', e)
            continue
        for d in r.get('data', []):
            out[d['asset']['id']] = d
    return out


def search(keyword, pages=1, sort=''):
    ids, cursor = [], ''
    for _ in range(pages):
        url = 'https://apis.roblox.com/toolbox-service/v1/marketplace/10?num=30&keyword=' + urllib.parse.quote(keyword)
        if sort:
            url += '&sortType=' + sort
        if cursor:
            url += '&cursor=' + urllib.parse.quote(cursor)
        r = get(url)
        ids += [d['id'] for d in r.get('data', [])]
        cursor = r.get('nextPageCursor') or ''
        if not cursor:
            break
    det = details(ids)
    rows = []
    for i in ids:
        d = det.get(i)
        if not d:
            continue
        a = d['asset']
        if not d.get('fiatProduct', {}).get('isFree', True):
            continue
        t = a.get('modelTechnicalDetails', {})
        tris = t.get('objectMeshSummary', {}).get('triangles', 0)
        mp = t.get('instanceCounts', {}).get('meshPart', 0)
        v = d.get('voting', {})
        rows.append((i, tris, mp, a.get('scriptCount', 0), d['creator']['name'], a['name'], v.get('upVotes', 0), v.get('downVotes', 0)))
    return rows


def sheet(path, ids):
    from PIL import Image, ImageDraw
    urls = {}
    for i in range(0, len(ids), 30):
        chunk = ids[i:i + 30]
        r = get('https://thumbnails.roblox.com/v1/assets?size=250x250&format=Png&assetIds=' + ','.join(map(str, chunk)))
        for d in r.get('data', []):
            urls[d['targetId']] = d.get('imageUrl')
    det = details(ids)
    cols = min(6, len(ids))
    rows = (len(ids) + cols - 1) // cols
    img = Image.new('RGB', (cols * 250, rows * 290), (40, 44, 52))
    dr = ImageDraw.Draw(img)
    for n, i in enumerate(ids):
        x, y = (n % cols) * 250, (n // cols) * 290
        u = urls.get(i)
        if u:
            try:
                im = Image.open(io.BytesIO(get(u, True))).convert('RGB').resize((250, 250))
                img.paste(im, (x, y))
            except Exception:  # noqa: BLE001
                pass
        name = det.get(i, {}).get('asset', {}).get('name', '?')[:34]
        tri = det.get(i, {}).get('asset', {}).get('modelTechnicalDetails', {}).get('objectMeshSummary', {}).get('triangles', 0)
        dr.text((x + 4, y + 252), f'{i}', fill=(255, 220, 90))
        dr.text((x + 4, y + 267), f'{name} {tri // 1000}k', fill=(230, 230, 230))
    img.save(path)
    print('saved', path)


def fetch(i):
    path = os.path.join(ROOT, 'build', 'toolbox', f'{i}.rbxm')
    if os.path.exists(path):
        return 'cached'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    meta = get(f'https://assetdelivery.roblox.com/v2/asset/?id={i}')
    data = get(meta['locations'][0]['location'], True)
    with open(path, 'wb') as f:
        f.write(data)
    return 'ok'


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'search':
        for r in search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1, sys.argv[4] if len(sys.argv) > 4 else ''):
            print(f'{r[0]:>16} {r[1]:>7} tris {r[2]:>3} mesh {r[3]:>2} scr  +{r[6]:<5}-{r[7]:<4} {r[4][:16]:<16} {r[5][:46]}')
    elif cmd == 'sheet':
        sheet(sys.argv[2], [int(x) for x in sys.argv[3:]])
    elif cmd == 'get':
        for x in sys.argv[2:]:
            print(x, fetch(int(x)))
