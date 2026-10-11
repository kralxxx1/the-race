# First-person riding and crash realism

The helmet view is the only gameplay camera. This document describes how it is built and
where to tune it. All options live in `src/render/cameraSettings.ts` (`cam.*` keys, plus
`cam.motionComfort` in the accessibility tab) and every one of them is wired.

## Camera chain

```
BikeFrame.eye (blueprint helmet eye, chassis space)
   └─ HeadMotion (render/fpv/headMotion.ts)   springs + vibration, pure maths, fixed 240 Hz sub-step
        └─ CameraRig.placeHelmet (render/camera.ts)   neck pivot, chassis world matrix, base look-down
```

* **Head physics** (`HeadMotion.step`): horizon counter-tilt (`cam.horizonTilt`), look into the
  corner (`cam.lookIntoTurn`), tuck behind the screen above ~125 km/h on sport/hyper bikes
  (`cam.tuck`; naked 55 %, adventure 20 %, others none), inertial pitch/surge under braking
  and acceleration (`cam.headMotion`), engine vibration by rpm, road vibration by surface,
  rumble strips near the road edge, wind buffeting above ~120 km/h when not tucked,
  FOV by speed (`cam.fov`, `cam.speedFov`) and close-pass FOV punches. Everything periodic is a
  function of accumulated time, springs run on a fixed internal step, so the result does not
  depend on the frame rate (tests: `tests/unit/headMotion.test.ts`).
* **Look back**: hold `B` (gamepad R3, touch button "ARKAYA BAK"). The head turns ~150° about
  the neck pivot (`cam.lookBackSide` = auto / left / right shoulder).
* **Motion comfort** (`cam.motionComfort`): scales head motion, vibration, wind, FOV change and
  levels the horizon.

## Cockpit

* `RiderModel` hides torso/head/upper arms in first person; forearms and gloves (`fpv/hands.ts`)
  follow the grips and steering. The throttle hand twists, index+middle fingers squeeze the
  brake / clutch levers.
* The bike kit exports two extra groups, `leverBrake` and `leverClutch`, pivoting about the
  blueprint lever frames (`KitContext.leverFrame`, anchors `leverBrake:o|x|y`).
  `BikeModel.update({ brake, clutch })` rotates them. The clutch is pulled on gear shifts and
  while slipping.
* **Mirrors** (`fpv/mirrors.ts`): a small camera at each mirror glass renders the scene backwards
  into a render target (`HalfFloat`, 160–512 px, `cam.mirrors`), shown on the glass mesh through a
  per-bike clone of the glass geometry with generated UVs. One mirror per update, `cam.mirrorRate`
  Hz, shadow map frozen, rider and mirrors hidden during the pass, skipped while looking back.
  `off` on the *low* preset. `MirrorRig.dispose()` frees targets, materials and geometry clones.
* **Visor** (`fpv/visor.ts`, `fpv/visorDrops.ts`): a 2D canvas layer over the game canvas with rain
  beads that run up and outwards with speed, a procedural crack after a crash and an edge shading.

## Crash simulation (`src/physics/crash/`)

* `world.ts`: small-step XPBD rigid bodies (positional ball joints, swing cones, hinge ranges,
  sphere/box/plane contacts, Coulomb friction, restitution) with a fixed 1/120 s step and 6 sub-steps.
  Deterministic, allocation-free, no `Math.random`. Bodies fall asleep when everything rests.
* `scenario.ts`: builds the crash from the instant of impact: an 11-segment rider ragdoll (masses,
  joint limits, leather/helmet friction), the bike (compound spheres, mass from the spec), the
  hit vehicle (mass by kind, box shapes, wheel friction along/across, driver brakes after 0.45 s)
  and an optional guard-rail plane. The bike is backed out of any initial overlap so contact
  starts at touch. Impacts classify as `rearEnd | sideSwipe | glancing | headOn | barrier | fall`.
* `debris.ts`: ballistic plastic/glass/chrome shards (seeded).
* `render/crash.ts` drives the models from the solver and turns contacts into sparks, dust,
  tyre smoke, skid marks (`SkidMarks`), debris, impact sounds (`GameView.crashImpactCb`) and camera
  trauma. `restart()` replays the identical crash for the cinematic replay.
* `render/fpv/crashPlan.ts` directs the sequence: `cam.crashCamera` = `fpv` (helmet tumble) /
  `cinematic` (orbit camera) / `both` (helmet, then a replay with letterbox), `cam.crashSlowmo`
  scales the slow motion. Free-ride modes respawn the rider and only use the helmet phase.

## Lane feel

* `game/wake.ts`: deterministic wake of passing traffic (bow wave, flank pressure, lee suction,
  one sharp shove for oncoming vehicles). `GameSession` adds the lateral velocity to the bike and
  exposes `session.wake.turbulence` for the camera buffet.
* Close passes and near misses punch the FOV (`HeadMotion.punch`), lane splitting (traffic close on
  both sides) tightens the vignette and shakes the helmet, rumble strips buzz the camera.

## Debug

`window.__THE_RACE__.advance(seconds, true)` runs the full view (head motion, crash sequence) in
1/30 s frames; `setInput({ lookBack: true })` holds the look-back control; `view` exposes the live
`GameView` (mirrors, crash, camera) for tooling; `crash()` triggers a generic crash.
