# Bike blueprints — how the procedural motorcycles are built

Every motorcycle in the game is generated at runtime by the **bike kit** in
`src/render/bike/`. There are no downloaded manufacturer models (we have none,
and could not ship them): each bike is a faithful procedural recreation built
from real spec-sheet dimensions, photos, and a library of high-detail part
generators. This document is the authoring guide for adding or improving a bike.

```
BikeSpec (src/data/bikes.ts)            ← catalogue: physics, engine, voice, liveries
   │
   ▼
BikeBlueprint (src/render/bike/blueprints/*.ts)
   │   real hardpoints: wheelbase, rake, trail, tyres, fork, frame, swingarm,
   │   engine, exhaust, cockpit, lights, seat, rider; plus body() and livery()
   ▼
computeHardpoints()  (hardpoints.ts)    ← steering axis, fork offset, axles, pivot…
   ▼
KitContext (context.ts)                 ← sinks per animated group, decals, anchors
   ▼
kit generators (kit/*.ts)  wheels · tyres · brakes · forks · cockpit · frame ·
                           engine · exhaust · rear (swingarm, shock, chain…)
bp.body(ctx)               bodywork: lofted panels, screen, tank, seat, tail, lights
bp.livery(canvas, …)       paint atlas drawn in 5 orthographic views
   ▼
assembleBike() / acquireBike()  (assemble.ts) ← merged per group × material slot,
                                                cached per bike + livery + detail + LOD
   ▼
BikeModel (src/render/bikeModel.ts)     ← facade used by GameView / Showroom / crash /
                                          rider: root, riderMount, steer, update(),
                                          updateDash(), mirrors, lights, dispose()
```

## Conventions

* **Units:** metres, kilograms, seconds; blueprint angles in **degrees**
  (`rakeDeg`, `tiltDeg`, `dashTiltDeg`, `angleDeg`), runtime angles in radians.
* **Bike space:** `+Y` up, `−Z` forward, `+X` = rider's **right**. Ground at
  `y = 0`, **rear axle at `z = 0`**, so the front axle sits at `z = −wheelbase`.
  Everything is authored at rest (static sag included), steering straight.
* **Right side first:** side-view outlines are drawn for the right side
  (`[z, y]` pairs). Symmetric bodywork is mirrored automatically; plan-view
  regions use `|x|`.
* **Groups:** geometry goes into one of the animated groups — `chassis`,
  `steer` (bars, clamps, dash if bar-mounted), `forkLower`, `frontWheel`,
  `frontSpokes`, `rearWheel`, `rearSpokes`, `swingarm`. Use `ctx.add(group, mesh,
  finish, matrix?)` with **bike-space** coordinates; the sink converts to the
  group's local frame. `ctx.addSteer()` takes steering-local coordinates (Y along
  the steering axis).
* **Material slots** (`sink.ts`): almost everything mechanical goes into the
  vertex-coloured `hard` slot with a `Finish` (colour, metalness, roughness,
  clear-coat, micro-surface: brushed/cast/grain/knurl/anodised). Special slots:
  `paint` (livery atlas), `carbon`, `seat`, `tyre`, `screen`, `lens`, `radiator`,
  `decal`, `plate`, emitters (`head`, `drl`, `tail`, `indicator`), `dash`,
  `mirrorL`/`mirrorR` (own meshes for future render-to-texture), `blur`.
  Keep new parts in existing slots — a bike must stay **under 60 draw calls**
  (currently ~28).
* **Quality:** query `ctx.seg(base, min)` for tessellation and `ctx.micro` for
  bolts / stitching / chain links / lettering. Never hard-code segment counts
  for anything big. LOD1 (`kitQuality(detail, 1)`) is ~25 % of LOD0.

## Blueprint checklist

Authoring order matters — **proportions first, character second, detail last**.

1. **Spec sheet → numbers** (`blueprints/<bike>.ts`):
   * `wheelbase`, `rakeDeg`, `trail` (exactly as published; the steering axis
     and fork offset are derived so the measured trail matches — a unit test
     checks this), `seat.height`, `overall` (L × W × H), `groundClearance`.
   * Tyres as printed on the sidewall: `'120/70ZR17'`, `'190/55ZR17'`,
     `'90/90-21'`, `'130/70-12'`… plus rim width in inches. Radii and profiles
     come from `tyre.ts` — do not hand-enter radii.
   * `forkLength` (axle → top of the fork tubes along the axis, sagged): pick it
     so the top clamp lands at the right height (`hp.head[1]`; sport bikes
     ≈ 0.92–0.97 m).
   * Swingarm `length` + rest `angleDeg` place the pivot; check it against a side
     photo (the pivot is usually just behind the footpeg hanger).
2. **Mechanical character:** wheel design (type, spoke count/shape, colours),
   fork type/colours/labels, brakes (disc size, caliper type/colour/text), frame
   type, swingarm type and side, shock layout, drive, engine layout/tilt/crank
   position/colours, exhaust route + silencer shape/finish, cockpit (bars, grip
   point, dash type/pose, mirrors), lights, footrests, plate mount.
3. **Bodywork** in `body(ctx)` (see below).
4. **Livery** in `livery(canvas, livery, env)` — one branch per catalogue livery
   (`env.index`).
5. Register it in `blueprints/index.ts` (`AUTHORED.set(id, factory)`).
6. Run `npx vitest run tests/unit/bikeKit.test.ts` and do the screenshot pass.

Bikes without an authored blueprint get `autoBlueprint(spec)` (`blueprints/auto.ts`),
derived from the catalogue `look` params, with the generic parametric body.
They must keep building — the tests build all bikes.

## Bodywork toolkit

`kit/shape.ts`, `surface.ts`, `kit/body.ts`:

* **`OutlineBody`** — a body drawn the way a designer draws it: side-view
  `top(z)` / `bottom(z)` lines, a plan-view `half(z)` width line (all built with
  `curve([[z, v], …])`), and **section templates** (`sections`), each a list of
  normalised points from the top centre `[0, 1]` down the right side to the
  bottom edge (`[x / half, height fraction]`). Templates are blended along `z`;
  every template point becomes a longitudinal character line. All templates of
  one body need the same point count.
* **`outlineLoft(ob, { su, sv, creases, capFront, capBack })`** — the smooth
  surface. `creases: [2]` keeps character line 2 sharp (shoulder crease).
  Use `bodyQ(ctx, k)` for `su/sv`.
* **Regions** (signed fields, ≥ 0 inside): `sideRegion([[z, y]…])`,
  `planRegion([[z, |x|]…])`, `frontRegion([[|x|, y]…])`, combined with
  `fAnd / fOr / fNot`, and plain lambdas (e.g. a wheel arch
  `(_x, y, z) => r − hypot(z − az, y − ay)`).
* **`cut(mesh, field)`** — keeps `field ≥ 0` with exact iso-line splitting
  (smooth cut edges). Use it for openings: cockpit/tank opening, wheel arch,
  intakes, the region under the screen.
* **`addPanel(ctx, group, surface, region, finish, gap, depth)`** — cuts one
  panel out of a shared master surface and folds its edges inward
  (`flange`): this is what produces real **panel gaps and pressed edges**
  between nose cowl / side panel / belly pan. Cut one master surface into
  several panels instead of modelling separate blobs.
* Helpers: `buildTank` (optionally with authored `topLine / bottomLine /
  halfLine`), `buildSeat` (stitched), `screen`, `frontFender`, `hugger`,
  `plateHanger`, `lamp` (housing + reflector + emitters + lens from a 2D
  outline), `ledStrip` (DRL / tail light guides along a 3D path),
  `sideAt(ob, z, y, side)` / `surfaceAt(ob, z, x)` to place things on surfaces.

Typical fairing recipe (see `blueprints/r1.ts`, `blueprints/panigaleV4.ts`):

```ts
const ob = fairing();                                  // nose → behind the knees
const master = outlineLoft(ob, { ...bodyQ(ctx, 1.7), creases: [2], capFront: true });
const open = sideRegion([[-1.16, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
const arch = (_x, y, z) => 0.36 - Math.hypot(z - A[2], y - A[1]);
const body = cut(master, fAnd(fNot(open), fNot(arch), fNot(intake)));
addPanel(ctx, 'chassis', body, cowl, PAINT);           // nose cowl
addPanel(ctx, 'chassis', body, fAnd(fNot(cowl), fNot(belly), fNot(vent)), PAINT);
addPanel(ctx, 'chassis', body, belly, PAINT);          // belly pan
```

Things that make a fairing read as the real bike: the **side-view silhouette**
(nose height, screen top, tank top, tail tip), the **trapezoid section**
(narrow creased shoulders, widest low around the radiator), the **face**
(intakes / headlight shapes in front view) and the **rear edge line** of the
side panel.

## Liveries

Liveries are painted with canvas 2D into an atlas of five orthographic views
(`right`, `left`, `top`, `front`, `rear`) and projected back onto the paint
slot in bike space (triplanar, normal-weighted), so stripes and lettering follow
the surfaces without UV unwrapping. A second atlas stores the finish
(gloss / metallic / pearl / matte / satin / chrome / flat) per pixel.

* Coordinates per view: `right`/`left` → `(z, y)`; `top` → `(z, x)`;
  `front`/`rear` → `(x, y)`.
* `Pen` API: `fill`, `rect`, `poly`, `line`, `gradientPoly`, `text`
  (size in metres, italic, weight, stretch, stroke, letter spacing).
* Lettering for model names ("R1", "V4 S", "Panigale V4 S"…) goes into the
  livery, not geometry. Brand-free generic text is used for tyres
  (`tyreLabel`).

## Screenshot workflow

Start the dev server (`npx vite --port <port> --strictPort`) and open
`dev/preview.html`:

| query | meaning |
| --- | --- |
| `bike=<id>` | catalogue id (`yamaha-r1`, `ducati-panigale-v4s`, …) |
| `view=` | `front34`, `side`, `left`, `rear34`, `front`, `rear`, `top`, `cockpit`, `detail-engine`, `detail-wheel`, `detail-cockpit`, `detail-rear` |
| `ortho=1` | orthographic `side`/`left`/`front`/`rear`/`top` with a **0.1 m grid** (yellow every 0.5 m); `ppm` = pixels per metre, `cz`/`cy` = view centre |
| `lod=0\|1`, `detail=low…extreme`, `livery=<index>` | build options |
| `lean`, `steer` (rad), `brake`, `lights=0`, `rpm`, `gear`, `speed` | pose / dash state |
| `skip=body,frame,engine,…` | leave generator stages out to isolate parts (`_` for spaces: `front_wheel`) |
| `rider=1`, `look=<rad>` | show the rider; extra downward glance in the cockpit view (default 0.45) |
| `yaw`, `h`, `dist`, `fov`, `tx/ty/tz` | free camera tweaks |

Stats (triangles, draw calls, build ms) go into the page title and the console.

```bash
node tools/shot.mjs <outDir> 1280 720 \
  "http://localhost:<port>/dev/preview.html?bike=yamaha-r1&ortho=1&view=side::r1-side" \
  "http://localhost:<port>/dev/preview.html?bike=yamaha-r1&view=front34::r1-front34"
```

Software WebGL is slow (~10–15 s per shot): batch 2–4 shots. **Look at every
image** and compare with photos of the real bike: proportions on the ortho grid
first (axles, seat, tank top, screen top, tail tip, nose), then characteristic
features, then fine detail. Check for gaps, z-fighting, inside-out normals,
floating parts and wrong scale.

## Performance budget

| detail | LOD0 triangles (showcase) | notes |
| --- | --- | --- |
| low | ~80 k | no micro details, 512×1024 livery |
| medium | ~170 k | |
| high | ~285 k | chain links, bolts, stitching |
| ultra | ~440 k | metallic flake |
| extreme | ~770 k | 2K textures |

LOD1 is ~25 % of LOD0. Draw calls ~28 per bike. Builds are cached per
bike + livery + detail + LOD (`acquireBike` / `releaseBike`; a small idle pool
keeps recently used builds for garage browsing). Build time is dominated by
bodywork cutting/flanging; showcase bikes take ~0.4–0.6 s at `high` in Node on
the dev container (`kitDebug.timings` reports per-stage times).

## Tests

`tests/unit/bikeKit.test.ts` validates every catalogue bike's blueprint
(real-world ranges, parseable tyre sizes, trail consistency), builds every bike
at LOD1 (no warnings, no NaN, bounded vertices, unit normals), checks the LOD0
budget and draw calls of the showcase bikes, determinism, cache/dispose
behaviour and the `BikeModel` lifecycle. Add your bike's spec-sheet numbers to
the "showcase bikes match their spec sheets" test when you author it.
