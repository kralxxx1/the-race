#!/usr/bin/env python3
"""
Offline pipeline for the roadside foliage atlases (public/assets/world/foliage_*.webp).

Not needed to build or run the game: the atlases it produces are committed. It crops real
leaf/needle photographs (CC0 Poly Haven plant models, see public/assets/LICENSES.md) out of
their texture atlases, straightens them and composes game-ready foliage cards:

  fir      spruce/fir twig sprites (Karadeniz forest, snow pines)
  pine     long-needle pine tufts (Mediterranean/Turkish red pine, stone pine)
  olive    narrow grey-green olive-like leaf sprays
  broad    broadleaf (plane/linden) leaf sprays
  palm     pinnate palm fronds

Each atlas is a 4x2 grid of cells (1024x512 px at "hi", 512x256 at "lo"); cell (i) covers
u in [i%4/4, i%4/4+1/4], v in [1-(i//4+1)/2, 1-(i//4)/2]. Every sprite is stem-down, tip-up
and centred on the cell's bottom-centre so cards can pivot on their stem.

Usage:  python3 -I tools/build-foliage.py <raw-dir> <out-dir>
<raw-dir> must contain the files fetched with tools/fetch-ph-model.py:
  fir_tree_01_twig_{diff,alpha}.jpg  pine_tree_01_twig_{diff,alpha}.jpg
  shrub_02_{Diffuse,Alpha}.jpg  shrub_03_{Diffuse,Alpha}.jpg
  island_tree_01_leaves_{diff,alpha}.jpg  jacaranda_tree_leaves_{diff,alpha}.jpg
Requires Pillow + numpy. Deterministic (seeded).
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image

CELL_W, CELL_H = 256, 256  # hi: 4x2 cells -> 1024x512


def load(raw: str, name: str, diff: str, alpha: str):
    d = Image.open(os.path.join(raw, f'{name}_{diff}.jpg')).convert('RGB')
    a = Image.open(os.path.join(raw, f'{name}_{alpha}.jpg')).convert('L')
    rgba = d.copy()
    rgba.putalpha(a)
    return rgba


def components(img: Image.Image, min_area: int, scale: int = 8, dilate: int = 2):
    """Connected components of the alpha channel; returns bounding boxes in full-res pixels."""
    a = np.asarray(img.split()[3]).astype(np.uint8)
    h, w = a.shape
    small = a[: h - h % scale, : w - w % scale].reshape(h // scale, scale, w // scale, scale).max(axis=(1, 3)) > 128
    # dilate so thin gaps inside one twig do not split it
    m = small.copy()
    for _ in range(dilate):
        n = m.copy()
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    lab = np.zeros(m.shape, dtype=np.int32)
    boxes = []
    cur = 0
    for y in range(m.shape[0]):
        for x in range(m.shape[1]):
            if m[y, x] and lab[y, x] == 0:
                cur += 1
                stack = [(y, x)]
                lab[y, x] = cur
                x0 = x1 = x
                y0 = y1 = y
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cur
                            stack.append((ny, nx))
                boxes.append((x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale, cnt))
    return [b for b in boxes if b[4] >= min_area]


def crop_sprite(img: Image.Image, box, pad=4) -> Image.Image:
    x0, y0, x1, y1 = box[:4]
    c = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))
    return c


def fit_cell(sp: Image.Image, cw=CELL_W, ch=CELL_H, pivot_y=0.97) -> Image.Image:
    """Scale a sprite to fit a cell (keeping aspect), stem (bottom centre) at the cell's bottom centre."""
    s = min((cw - 4) / sp.width, (ch * pivot_y - 2) / sp.height)
    nw, nh = max(1, int(sp.width * s)), max(1, int(sp.height * s))
    sp = sp.resize((nw, nh), Image.LANCZOS)
    cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cell.alpha_composite(sp, ((cw - nw) // 2, int(ch * pivot_y) - nh))
    return cell


def bleed(img: Image.Image) -> Image.Image:
    """Fill transparent pixels with the average opaque colour so mip-mapping does not darken edges."""
    a = np.asarray(img).astype(np.float32)
    alpha = a[..., 3] > 8
    if alpha.any():
        mean = a[alpha][:, :3].mean(axis=0)
        a[~alpha, 0:3] = mean
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def save_atlas(cells, out: str, name: str) -> None:
    cols, rows = 4, 2
    atlas = Image.new('RGBA', (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    for i, c in enumerate(cells[: cols * rows]):
        atlas.alpha_composite(c, ((i % cols) * CELL_W, (i // cols) * CELL_H))
    atlas = bleed(atlas)
    atlas.save(os.path.join(out, f'foliage_{name}_hi.webp'), quality=82, method=6)
    lo = bleed(atlas.resize((atlas.width // 2, atlas.height // 2), Image.LANCZOS))
    lo.save(os.path.join(out, f'foliage_{name}_lo.webp'), quality=80, method=6)
    print(name, atlas.size, os.path.getsize(os.path.join(out, f'foliage_{name}_hi.webp')) // 1024, 'KB')


def straighten(sp: Image.Image, angle_deg: float) -> Image.Image:
    return sp.rotate(angle_deg, resample=Image.BICUBIC, expand=True)


def spray(rng, leaves, size, n, spread, stem_color, leaf_scale, tint=None):
    """Compose a leaf spray: a few curved twigs with leaves attached along them."""
    W, H = size
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base = (W // 2, int(H * 0.97))
    # main twigs radiate upward from the stem point
    twigs = []
    for t in range(4 + n // 14):
        ang = rng.uniform(-spread, spread) if t else 0.0
        length = rng.uniform(0.55, 0.92) * H * (1 if t == 0 else 0.8)
        twigs.append((ang, length))
    px = canvas.load()
    leaf_list = []
    for ang, length in twigs:
        # draw the twig as a line with slight curve; attach leaves
        steps = 28
        pts = []
        for k in range(steps + 1):
            f = k / steps
            a = math.radians(ang) + 0.25 * math.sin(f * 2.2) * (1 if ang >= 0 else -1)
            x = base[0] + math.sin(a) * length * f
            y = base[1] - math.cos(a) * length * f
            pts.append((x, y, a, f))
        for k in range(len(pts) - 1):
            (x0, y0, _, _), (x1, y1, _, _) = pts[k], pts[k + 1]
            for u in range(4):
                xx = x0 + (x1 - x0) * u / 4
                yy = y0 + (y1 - y0) * u / 4
                for dx in (0, 1):
                    xi, yi = int(xx) + dx, int(yy)
                    if 0 <= xi < W and 0 <= yi < H:
                        px[xi, yi] = stem_color + (255,)
        per = max(2, n // len(twigs))
        for j in range(per):
            f = 0.2 + 0.8 * (j + rng.random() * 0.6) / per
            k = min(len(pts) - 1, int(f * steps))
            x, y, a, _ = pts[k]
            side = 1 if j % 2 == 0 else -1
            leaf_list.append((x, y, a, side, f))
        # terminal leaf
        x, y, a, _ = pts[-1]
        leaf_list.append((x, y, a, 0, 1.0))
    # paint far leaves first (sorted by f) so tips overlap the stems
    leaf_list.sort(key=lambda t: t[4])
    for x, y, a, side, f in leaf_list:
        lf = leaves[rng.randrange(len(leaves))]
        s = leaf_scale * rng.uniform(0.8, 1.15) * (1.0 - 0.25 * f)
        w = max(2, int(lf.width * s))
        h = max(2, int(lf.height * s))
        img = lf.resize((w, h), Image.LANCZOS)
        # leaves point along the twig with an outward lean; the sprite's tip is up, so rotate by (-angle)
        lean = side * rng.uniform(25, 60) if side else 0
        rot = -math.degrees(a) - lean
        img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
        if tint:
            arr = np.asarray(img).astype(np.float32)
            arr[..., 0] *= tint[0] * rng.uniform(0.92, 1.08)
            arr[..., 1] *= tint[1] * rng.uniform(0.92, 1.08)
            arr[..., 2] *= tint[2] * rng.uniform(0.92, 1.08)
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        # leaf base sits on the twig: shift so the stem end (bottom centre of the unrotated sprite) is at (x, y)
        cx = x - img.width / 2 + math.sin(math.radians(-rot)) * h * 0.5
        cy = y - img.height / 2 - math.cos(math.radians(-rot)) * h * 0.5
        canvas.alpha_composite(img, (int(round(cx)), int(round(cy))))
    return canvas


def component_at(img: Image.Image, rect, scale=2, dilate=1, min_alpha=128):
    """Crop `rect` out of `img` and keep only its largest connected component (drops neighbouring UV islands)."""
    sub = img.crop(rect)
    a = np.asarray(sub).copy()
    boxes = components(sub, 20, scale=scale, dilate=dilate)
    if not boxes:
        return sub
    x0, y0, x1, y1, _ = max(boxes, key=lambda b: b[4])
    out = np.zeros_like(a)
    out[y0:y1, x0:x1] = a[y0:y1, x0:x1]
    # inside the winning box the other islands still exist when they overlap it; remove non-green pixels
    return Image.fromarray(out, 'RGBA').crop((x0, y0, x1, y1))


def only_green(im: Image.Image, slack: int = -4) -> Image.Image:
    a = np.asarray(im).copy().astype(np.int32)
    g = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    stem = (a[..., 0] > a[..., 1]) & (a[..., 3] > 128)
    a[..., 3] = np.where(((g > slack) | stem) & (a[..., 3] > 128), 255, 0)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def drop_bottom_islands(im: Image.Image) -> Image.Image:
    """Remove UV-island leftovers (bark/cone triangles) beside the stem at the bottom of a needle sprite."""
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    rows = a[int(h * 0.66): int(h * 0.76), :, 3] > 128
    xs = np.nonzero(rows.any(axis=0))[0]
    cx = float(xs.mean()) if len(xs) else w / 2
    y0 = int(h * 0.80)
    xx = np.arange(w)[None, :]
    a[y0:, :, 3] = np.where(np.abs(xx - cx) > 0.1 * w, 0, a[y0:, :, 3])
    return Image.fromarray(a, 'RGBA')


def tinted(im: Image.Image, t) -> Image.Image:
    arr = np.asarray(im).astype(np.float32)
    arr[..., 0] *= t[0]
    arr[..., 1] *= t[1]
    arr[..., 2] *= t[2]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def blob(rng, leaves, size, n, leaf_scale, stem_color, tint=None, aspect=0.46):
    """Dense leaf cluster: leaves scattered over an ellipse, angled outward from the stem point."""
    W, H = size
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    stem = (W / 2, H * 0.97)
    cx, cy = W / 2, H * 0.52
    rx, ry = W * aspect, H * 0.44
    pts = []
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        r = math.sqrt(rng.random())
        x = cx + math.cos(a) * rx * r
        y = cy + math.sin(a) * ry * r
        pts.append((x, y, r))
    # a few twigs from the stem towards the cluster so the sprite has structure
    px = canvas.load()
    for _ in range(6):
        tx = cx + rng.uniform(-rx, rx) * 0.8
        ty = cy + rng.uniform(-ry, ry) * 0.7
        for k in range(60):
            f = k / 60
            xx = int(stem[0] + (tx - stem[0]) * f + math.sin(f * 3.1) * 3)
            yy = int(stem[1] + (ty - stem[1]) * f)
            if 0 <= xx < W and 0 <= yy < H:
                px[xx, yy] = stem_color + (255,)
    pts.sort(key=lambda t: t[1])  # top first, lower leaves overlap the ones above
    for x, y, r in pts:
        lf = leaves[rng.randrange(len(leaves))]
        s = leaf_scale * rng.uniform(0.75, 1.25)
        w = max(2, int(lf.width * s))
        h = max(2, int(lf.height * s))
        img = lf.resize((w, h), Image.LANCZOS)
        if rng.random() < 0.5:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        # leaf tip points away from the stem
        ang = math.degrees(math.atan2(x - stem[0], stem[1] - y)) + rng.uniform(-35, 35)
        img = img.rotate(-ang, resample=Image.BICUBIC, expand=True)
        shade = 0.72 + 0.28 * r + rng.uniform(-0.06, 0.06)
        arr = np.asarray(img).astype(np.float32)
        t = tint or (1, 1, 1)
        arr[..., 0] *= shade * t[0]
        arr[..., 1] *= shade * t[1]
        arr[..., 2] *= shade * t[2]
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        canvas.alpha_composite(img, (int(round(x - img.width / 2)), int(round(y - img.height / 2))))
    return canvas


def main() -> None:
    raw, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    rng = random.Random(1234)

    # ---- fir: real spruce twigs cropped out of the Poly Haven fir_tree_01 atlas ----------------------------
    fir = load(raw, 'fir_tree_01', 'twig_diff', 'twig_alpha')
    rects = [(190, 40, 440, 325), (665, 35, 965, 385), (310, 405, 660, 800), (645, 460, 980, 855), (390, 290, 475, 395), (505, 260, 645, 415), (545, 95, 610, 240)]
    sprites = [component_at(fir, r) for r in rects]
    cells = [fit_cell(sprites[i % len(sprites)] if i < 4 else sprites[i % len(sprites)].transpose(Image.FLIP_LEFT_RIGHT)) for i in range(8)]
    save_atlas(cells, out, 'fir')

    # ---- pine: two long-needle sprites from pine_tree_01 ---------------------------------------------------
    pine = load(raw, 'pine_tree_01', 'twig_diff', 'twig_alpha')
    left = only_green(component_at(pine, (30, 40, 235, 445)))
    right = only_green(component_at(pine, (655, 340, 970, 535)).rotate(90, resample=Image.BICUBIC, expand=True))
    ra = np.asarray(right).copy()
    rh, rw = ra.shape[:2]
    yy, xx = np.mgrid[0:rh, 0:rw]
    ra[(yy > 0.7 * rh) & ((xx < 0.2 * rw) | (xx > 0.8 * rw)), 3] = 0
    sprites = [drop_bottom_islands(left), Image.fromarray(ra, 'RGBA')]
    cells = []
    for i in range(8):
        sp = sprites[i % 2]
        if i >= 2:
            sp = sp.rotate(rng.uniform(-10, 10), resample=Image.BICUBIC, expand=True)
            if i % 4 >= 2:
                sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
        cells.append(fit_cell(sp))
    save_atlas(cells, out, 'pine')

    # ---- olive: narrow grey-green leaves of shrub_02 composed into sprays ----------------------------------
    shrub2 = load(raw, 'shrub_02', 'Diffuse', 'Alpha')
    leaves = [component_at(shrub2, r) for r in [(520, 312, 708, 932), (828, 356, 976, 852), (672, 408, 824, 856)]]
    leaves = [tinted(l, (0.86, 0.98, 0.84)) for l in leaves]
    cells = [blob(rng, leaves, (CELL_W, CELL_H), 330, 0.07, (96, 84, 58), aspect=0.5) for _ in range(8)]
    save_atlas(cells, out, 'olive')

    # ---- broadleaf: shrub_03 heart-shaped leaves, deepened towards plane/linden green ----------------------
    shrub3 = load(raw, 'shrub_03', 'Diffuse', 'Alpha')
    rects3 = [(20, 305, 330, 675), (480, 605, 780, 965), (40, 30, 282, 315), (315, 115, 540, 370), (40, 678, 258, 935), (422, 378, 622, 618)]
    leaves = [tinted(component_at(shrub3, r), (0.62, 0.78, 0.55)) for r in rects3]
    cells = [blob(rng, leaves, (CELL_W, CELL_H), 150, 0.1, (84, 66, 44), aspect=0.48) for _ in range(8)]
    save_atlas(cells, out, 'broad')

    # ---- grass: tufts composed of Poly Haven grass_bermuda_01 blades --------------------------------------
    gr = load(raw, 'grass_bermuda_01', 'Diffuse', 'Alpha')
    gboxes = sorted(components(gr, 40, scale=4, dilate=1), key=lambda b: (b[1] // 100, b[0]))
    pool = [crop_sprite(gr, gboxes[i], 2) for i in (0, 1, 4, 5, 6, 7, 9, 11, 12) if i < len(gboxes)]
    grng = random.Random(77)
    cells = []
    for c in range(8):
        cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
        k = 3 + c % 4
        for j in range(k):
            sp = pool[grng.randrange(len(pool))]
            h = int(grng.uniform(0.5, 0.95) * CELL_H) if c >= 4 else int(grng.uniform(0.28, 0.6) * CELL_H)
            sc = h / sp.height
            sp = sp.resize((max(2, int(sp.width * sc)), h), Image.LANCZOS)
            if grng.random() < 0.5:
                sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
            x = int(CELL_W / 2 + grng.uniform(-0.28, 0.28) * CELL_W - sp.width / 2)
            cell.alpha_composite(sp, (max(0, min(CELL_W - sp.width, x)), int(CELL_H * 0.97) - sp.height))
        cells.append(cell)
    save_atlas(cells, out, 'grass')

    # ---- palm fronds: jacaranda bipinnate leaves -----------------------------------------------------------
    jac = load(raw, 'jacaranda_tree', 'leaves_diff', 'leaves_alpha')
    rects = [(150, 10, 1022, 495), (240, 595, 1024, 1024), (0, 320, 450, 722)]
    sprites = []
    for r in rects:
        sp = component_at(jac, r, scale=4, dilate=1)
        sp = sp.rotate(90, resample=Image.BICUBIC, expand=True) if sp.width > sp.height else sp
        sp = component_at(sp, (0, 0, sp.width, sp.height), scale=4, dilate=1)
        sprites.append(tinted(sp, (0.8, 0.95, 0.7)))
    cells = [fit_cell(sprites[i % 3] if i < 3 else sprites[i % 3].transpose(Image.FLIP_LEFT_RIGHT)) for i in range(8)]
    save_atlas(cells, out, 'palm')


if __name__ == '__main__':
    main()
