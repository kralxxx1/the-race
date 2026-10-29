"""Converts Roblox meshes (and texture images) used by a dump into files the previewer can load.

  python3 tools/render/meshconv.py tools/render/out/<dump>.json

For every MeshPart in the dump ("mesh"/"tex" fields) the mesh is fetched into build/meshcache,
parsed (formats 2.00-5.00, and 6.00/7.00 without Draco) and written as
tools/render/out/meshes/<id>.json { p: [...], n: [...], uv: [...], i: [...], min, max } (LOD 0).
Textures are written as tools/render/out/tex/<id>.png.
"""
import io
import json
import math
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
CACHE = os.path.join(ROOT, 'build', 'meshcache')
TEXCACHE = os.path.join(ROOT, 'build', 'texcache')


def read_vertices(b, off, n, size):
    pos, nor, uv = [], [], []
    for k in range(n):
        o = off + k * size
        px, py, pz, nx, ny, nz, tu, tv = struct.unpack_from('<8f', b, o)
        pos += (px, py, pz)
        nor += (nx, ny, nz)
        uv += (tu, 1 - tv)
    return pos, nor, uv


def lod0(faces, lods):
    if len(lods) >= 2 and lods[1] > lods[0]:
        return faces[lods[0] * 3:lods[1] * 3]
    return faces


def parse(b):
    head = b[:13].split(b'\n')[0].decode('ascii', 'replace')
    ver = head.replace('version ', '').strip()
    off = len(head) + 1
    if ver.startswith('1.'):
        raise ValueError('text meshes are not supported')
    if ver.startswith('2.'):
        hs, vs, fs, nv, nf = struct.unpack_from('<HBBII', b, off)
        off += hs
        pos, nor, uv = read_vertices(b, off, nv, vs)
        off += nv * vs
        faces = list(struct.unpack_from(f'<{nf * 3}I', b, off))
        return pos, nor, uv, faces
    if ver.startswith('3.'):
        hs, vs, fs, ls, nl, nv, nf = struct.unpack_from('<HBBHHII', b, off)
        off += hs
        pos, nor, uv = read_vertices(b, off, nv, vs)
        off += nv * vs
        faces = list(struct.unpack_from(f'<{nf * 3}I', b, off))
        off += nf * fs
        lods = list(struct.unpack_from(f'<{nl}I', b, off)) if nl else []
        return pos, nor, uv, lod0(faces, lods)
    if ver.startswith('4.') or ver.startswith('5.'):
        hs, lodtype, nv, nf, nl, nb, bns, ns, hq, _ = struct.unpack_from('<HHIIHHIHBB', b, off)
        off += hs
        pos, nor, uv = read_vertices(b, off, nv, 40)
        off += nv * 40
        if nb > 0:
            off += nv * 8
        faces = list(struct.unpack_from(f'<{nf * 3}I', b, off))
        off += nf * 12
        lods = list(struct.unpack_from(f'<{nl}I', b, off)) if nl else []
        return pos, nor, uv, lod0(faces, lods)
    if ver.startswith('6.') or ver.startswith('7.'):
        pos = nor = uv = faces = None
        lods = []
        while off + 16 <= len(b):
            name = b[off:off + 8].decode('ascii', 'replace')
            cver, size = struct.unpack_from('<II', b, off + 8)
            data = off + 16
            if name == 'COREMESH':
                if cver != 1:
                    raise ValueError('compressed (Draco) mesh')
                nv = struct.unpack_from('<I', b, data)[0]
                pos, nor, uv = read_vertices(b, data + 4, nv, 40)
                p = data + 4 + nv * 40
                nf = struct.unpack_from('<I', b, p)[0]
                faces = list(struct.unpack_from(f'<{nf * 3}I', b, p + 4))
            elif name == 'LODS\x00\x00\x00\x00':
                _, _, n = struct.unpack_from('<HBI', b, data)
                lods = list(struct.unpack_from(f'<{n}I', b, data + 7))
            off = data + size
        if pos is None:
            raise ValueError('no COREMESH chunk')
        return pos, nor, uv, lod0(faces, lods)
    raise ValueError('unknown mesh version ' + ver)


def convert_mesh(mid):
    dst = os.path.join(OUT, 'meshes', f'{mid}.json')
    if os.path.exists(dst):
        return 'cached'
    src = os.path.join(CACHE, f'{mid}.mesh')
    if not os.path.exists(src):
        return 'missing'
    try:
        pos, nor, uv, faces = parse(open(src, 'rb').read())
    except Exception as e:
        open(dst + '.err', 'w').write(str(e))
        return 'error'
    # degenerate vertices can carry NaN normals or UVs, which JSON (and the browser) can't take
    def clean(vals, nd):
        return [round(v, nd) if math.isfinite(v) else 0.0 for v in vals]
    pos, nor, uv = clean(pos, 4), clean(nor, 3), clean(uv, 4)
    xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
    out = {
        'p': pos,
        'n': nor,
        'uv': uv,
        'i': faces,
        'min': [min(xs), min(ys), min(zs)],
        'max': [max(xs), max(ys), max(zs)],
    }
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    return 'ok'


def convert_texture(tid):
    dst = os.path.join(OUT, 'tex', f'{tid}.png')
    if os.path.exists(dst):
        return 'cached'
    src = os.path.join(TEXCACHE, f'{tid}.img')
    if not os.path.exists(src):
        return 'missing'
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(open(src, 'rb').read()))
        img.thumbnail((512, 512))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        img.save(dst)
        return 'ok'
    except Exception:
        return 'error'


def main():
    dump = json.load(open(sys.argv[1]))
    meshes, texs = set(), set()
    for p in dump.get('parts', []):
        if p.get('mesh'):
            meshes.add(p['mesh'])
        if p.get('tex'):
            texs.add(p['tex'])
    fetch = os.path.join(ROOT, 'tools', 'assets', 'fetch.py')
    todo = [m for m in meshes if not os.path.exists(os.path.join(OUT, 'meshes', f'{m}.json'))]
    if todo:
        subprocess.run([sys.executable, fetch, 'meshes'] + todo, check=False)
    todo = [t for t in texs if not os.path.exists(os.path.join(OUT, 'tex', f'{t}.png'))]
    if todo:
        subprocess.run([sys.executable, fetch, 'images'] + todo, check=False)
    stats = {}
    for m in meshes:
        r = convert_mesh(m)
        stats['mesh ' + r] = stats.get('mesh ' + r, 0) + 1
    for t in texs:
        r = convert_texture(t)
        stats['tex ' + r] = stats.get('tex ' + r, 0) + 1
    print(stats)


if __name__ == '__main__':
    main()
