#!/usr/bin/env python3
"""
Offline asset pipeline for public/assets (not needed to build or run the game).

Downloads the CC0 source files listed below from Poly Haven / ambientCG, then
re-encodes them into the compact web formats the game loads:

  textures/<key>/albedo_<res>.webp   sRGB base colour
  textures/<key>/normal_<res>.webp   OpenGL (+Y) tangent-space normal
  textures/<key>/arm_<res>.webp      R = ambient occlusion, G = roughness, B = metalness (linear)
  hdri/<key>_1k.hdr                  Radiance HDR for image-based lighting (PMREM)
  sky/<key>_<res>.jpg                upper hemisphere of the HDRI as a linearly
                                     scaled sRGB JPEG for the visible sky backdrop

Usage:  python3 -I tools/build-assets.py <download-cache-dir> <public/assets dir> [all|textures|hdri]
Requires Pillow + numpy and curl. Prints the per-HDRI metadata (sun direction,
exposure scale) that src/render/assets.ts embeds.
"""
import io
import json
import math
import os
import subprocess
import sys
import zipfile

import numpy as np
from PIL import Image

UA = 'the-race-asset-build/1.0'

# key -> (source, id, real-world tile size in metres, resolutions)
TEXTURES = {
    'asphalt_fresh': ('polyhaven', 'asphalt_pit_lane', 2.0, ['1k', '2k', '4k']),
    'asphalt_worn': ('polyhaven', 'asphalt_02', 3.0, ['1k', '2k']),
    'gravel': ('polyhaven', 'gravel_floor_02', 2.0, ['1k', '2k']),
    'concrete': ('polyhaven', 'concrete_wall_008', 2.71, ['1k', '2k']),
    'guardrail': ('ambientcg', 'Metal050C', 1.0, ['1k']),
    'grass': ('polyhaven', 'leafy_grass', 2.0, ['1k', '2k']),
    'sand': ('polyhaven', 'red_sand', 3.0, ['1k', '2k']),
    'rock': ('polyhaven', 'rock_face_03', 2.7, ['1k', '2k']),
    'snow': ('polyhaven', 'snow_02', 2.0, ['1k', '2k']),
    'forest': ('polyhaven', 'forest_leaves_04', 1.5, ['1k', '2k']),
    'pavement': ('polyhaven', 'concrete_pavement', 1.8, ['1k', '2k']),
    'facade_city': ('ambientcg', 'Facade020A', 12.0, ['1k', '2k']),
    'facade_industrial': ('polyhaven', 'corrugated_iron_02', 2.7, ['1k']),
    'bark': ('polyhaven', 'bark_brown_02', 1.0, ['1k']),
}

HDRIS = {
    'dawn': 'syferfontein_0d_clear_puresky',
    'day': 'kloofendal_43d_clear_puresky',
    'cloudy': 'kloofendal_48d_partly_cloudy_puresky',
    'overcast': 'kloofendal_overcast_puresky',
    'fog': 'kloofendal_misty_morning_puresky',
    'sunset': 'belfast_sunset_puresky',
    'night': 'kloppenheim_02_puresky',
    'city_night': 'shanghai_bund',
}
# Keys whose HDRI is used for lighting only (no visible sky backdrop).
IBL_ONLY = {'city_night'}

RES_PX = {'1k': 1024, '2k': 2048, '4k': 4096}
# WebP quality per resolution (albedo, normal, arm): larger maps tolerate lower settings.
QUALITY = {
    '1k': {'albedo': 84, 'normal': 88, 'arm': 84},
    '2k': {'albedo': 80, 'normal': 82, 'arm': 78},
    '4k': {'albedo': 74, 'normal': 76, 'arm': 72},
}


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    subprocess.run(['curl', '-sS', '-f', '-L', '-m', '600', '-A', UA, '-o', dest, url], check=True)
    return dest


def fetch_json(url, dest):
    fetch(url, dest)
    with open(dest) as f:
        return json.load(f)


def save_webp(img, path, quality):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)


def resized(img, px):
    return img if img.width == px else img.resize((px, px), Image.LANCZOS)


def polyhaven_sources(cache, pid, largest):
    meta = fetch_json(f'https://api.polyhaven.com/files/{pid}', os.path.join(cache, 'meta', pid + '.json'))
    out = {}
    for kind, field in (('albedo', 'Diffuse'), ('normal', 'nor_gl'), ('arm', 'arm')):
        url = meta[field][largest]['jpg']['url']
        out[kind] = fetch(url, os.path.join(cache, 'polyhaven', pid, f'{field}_{largest}.jpg'))
    return out


def ambientcg_sources(cache, aid, largest):
    zres = largest.upper()
    zpath = fetch(f'https://ambientcg.com/get?file={aid}_{zres}-JPG.zip', os.path.join(cache, 'ambientcg', f'{aid}_{zres}.zip'))
    outdir = os.path.join(cache, 'ambientcg', f'{aid}_{zres}')
    os.makedirs(outdir, exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            # Only flat image files; never trust archive paths.
            base = os.path.basename(n)
            if base.lower().endswith('.jpg') and base == n:
                with z.open(n) as src, open(os.path.join(outdir, base), 'wb') as dst:
                    dst.write(src.read())
    files = os.listdir(outdir)

    def find(tag):
        for f in files:
            if f.endswith(f'_{tag}.jpg'):
                return os.path.join(outdir, f)
        return None

    color, normal, rough = find('Color'), find('NormalGL'), find('Roughness')
    metal, ao = find('Metalness'), find('AmbientOcclusion')
    size = Image.open(color).size
    r = np.asarray(Image.open(ao).convert('L').resize(size)) if ao else np.full(size[::-1], 255, np.uint8)
    g = np.asarray(Image.open(rough).convert('L').resize(size))
    b = np.asarray(Image.open(metal).convert('L').resize(size)) if metal else np.zeros(size[::-1], np.uint8)
    arm_path = os.path.join(outdir, 'arm.png')
    Image.fromarray(np.dstack([r, g, b]).astype(np.uint8), 'RGB').save(arm_path)
    return {'albedo': color, 'normal': normal, 'arm': arm_path}


def build_textures(cache, out):
    report = {}
    for key, (src, sid, size_m, resolutions) in TEXTURES.items():
        largest = resolutions[-1]
        files = polyhaven_sources(cache, sid, largest) if src == 'polyhaven' else ambientcg_sources(cache, sid, largest)
        imgs = {k: Image.open(v).convert('RGB') for k, v in files.items()}
        for res in resolutions:
            px = RES_PX[res]
            for kind, img in imgs.items():
                save_webp(resized(img, px), os.path.join(out, 'textures', key, f'{kind}_{res}.webp'), QUALITY[res][kind])
        report[key] = {'source': src, 'id': sid, 'size': size_m, 'res': resolutions}
        print('texture', key, 'ok')
    return report


def read_hdr(path):
    """Minimal Radiance RGBE reader (new-style RLE and flat scanlines) -> float32 HxWx3."""
    with open(path, 'rb') as f:
        data = f.read()
    pos = 0
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line.startswith(b'-Y') or line.startswith(b'+Y'):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    buf = np.frombuffer(data, np.uint8, offset=pos)
    img = np.zeros((h, w, 4), np.uint8)
    p = 0
    for y in range(h):
        if 8 <= w < 32768 and buf[p] == 2 and buf[p + 1] == 2 and (int(buf[p + 2]) << 8 | int(buf[p + 3])) == w:
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = int(buf[p])
                    p += 1
                    if n > 128:
                        n -= 128
                        img[y, x:x + n, c] = buf[p]
                        p += 1
                    else:
                        img[y, x:x + n, c] = buf[p:p + n]
                        p += n
                    x += n
        else:
            img[y] = buf[p:p + w * 4].reshape(w, 4)
            p += w * 4
    e = img[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return img[..., :3].astype(np.float32) * scale[..., None]


def lin_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def sun_direction(hdr):
    """Azimuth/elevation (degrees) of the brightest pixel in the upper half of an equirect HDRI.

    Azimuth uses the game's convention: 0 = ahead (-Z), positive towards +X.
    """
    h, w, _ = hdr.shape
    lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    upper = lum[: h // 2]
    idx = np.unravel_index(np.argmax(upper), upper.shape)
    v = (idx[0] + 0.5) / h
    u = (idx[1] + 0.5) / w
    elevation = 90 - v * 180
    # three.js equirectUv: u = atan2(dir.z, dir.x) / 2pi + 0.5 (u = 0.5 looks along +X).
    # Game azimuth: dir = (sin az, ., -cos az)  =>  atan2(z, x) = az - 90deg.
    azimuth = (u - 0.5) * 360 + 90
    azimuth = (azimuth + 180) % 360 - 180
    peak = float(upper[idx])
    return round(float(azimuth), 2), round(float(elevation), 2), peak


def build_hdris(cache, out):
    meta_out = {}
    for key, hid in HDRIS.items():
        meta = fetch_json(f'https://api.polyhaven.com/files/{hid}', os.path.join(cache, 'meta', hid + '.json'))
        h1 = fetch(meta['hdri']['1k']['hdr']['url'], os.path.join(cache, 'hdri', f'{hid}_1k.hdr'))
        dst = os.path.join(out, 'hdri', f'{key}_1k.hdr')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(h1, 'rb') as s, open(dst, 'wb') as d:
            d.write(s.read())
        small = read_hdr(h1)
        az, el, peak = sun_direction(small)
        entry = {'id': hid, 'sunAzimuth': az, 'sunElevation': el, 'peak': round(peak, 2)}
        if key not in IBL_ONLY:
            h4 = fetch(meta['hdri']['4k']['hdr']['url'], os.path.join(cache, 'hdri', f'{hid}_4k.hdr'))
            big = read_hdr(h4)
            hh = big.shape[0]
            # Keep the sky plus a little below the horizon (the world hides the rest).
            crop = big[: int(hh * 0.5625)]
            lum = crop @ np.array([0.2126, 0.7152, 0.0722], np.float32)
            # Linear scale so ~99.6% of sky pixels fit in [0,1]; the clipped sun/glare is
            # restored from the 1k HDR at runtime.
            scale = float(np.percentile(lum, 99.6)) * 1.15
            scale = max(scale, 1e-4)
            ldr = lin_to_srgb(crop / scale)
            img = Image.fromarray((ldr * 255 + 0.5).astype(np.uint8), 'RGB')
            for res, wpx in (('2k', 2048), ('4k', 4096)):
                hpx = int(round(wpx * 0.5625 / 2))
                path = os.path.join(out, 'sky', f'{key}_{res}.jpg')
                os.makedirs(os.path.dirname(path), exist_ok=True)
                img.resize((wpx, hpx), Image.LANCZOS).save(path, 'JPEG', quality=88, optimize=True, progressive=True)
            entry['scale'] = round(scale, 5)
        meta_out[key] = entry
        print('hdri', key, json.dumps(entry))
    return meta_out


def main():
    cache, out = sys.argv[1], sys.argv[2]
    only = sys.argv[3] if len(sys.argv) > 3 else 'all'
    tex = build_textures(cache, out) if only in ('all', 'textures') else {}
    hdr = build_hdris(cache, out) if only in ('all', 'hdri') else {}
    print(json.dumps({'textures': tex, 'hdris': hdr}, indent=1))


if __name__ == '__main__':
    main()
