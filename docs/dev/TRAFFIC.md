# Traffic

Traffic is split in three layers: the **catalogue** (`src/data/vehicles.ts`), the **simulation**
(`src/world/traffic.ts`, render-independent, part of the fixed 120 Hz session) and the **view**
(`src/render/trafficView.ts` + `src/render/vehicle/*`).

## Vehicle models (`src/render/vehicle`)

All 14 kinds are procedural and unbranded (Turkish road mix): sedan, hatch, crossover (`suv`), `pickup`,
panel `van`, `minibus` (dolmuş), box `truck`, tractor + curtain trailer (`semi`), `tanker`, city `bus`,
intercity `coach`, yellow `taxi`, `police` (blue / white livery, light bar) and `ambulance`.

* `kit.ts` – `Mesher` (merges parts into one buffer with per-vertex colour / PBR / lamp channel), `Loft`
  (analytic sampler for `superLoft` surfaces: put lamps, pillars, windows exactly on a curved panel),
  `loftPatch`, `ribbon`, `cutArches` (real wheel-arch openings), `chamferBox`.
* `cars.ts` – the passenger-car family is one builder parametrised by a `CarSpec` (side profile curves, plan
  taper, greenhouse stations). Variants (taxi sign, police livery, pickup bed) are small `extras` hooks.
* `vans.ts` – van / minibus / ambulance reuse the car builder with a tall solid box.
* `heavy.ts` – cab, chassis, trailers, tank, bus bodies from rounded blocks.
* `models.ts` – `vehicleGeometry(kind)`: builds (once) LOD0 + LOD1 geometry and the anchors the renderer needs
  (wheels, plates, head / tail / indicator / beacon glow points).
* `fleet.ts` – one instanced mesh per model, LOD and material slot (paint, detail, glass, lamp). Instance
  attributes: matrix, paint colour, `aStyle` (metallic share, dirt), `aLampA/B` (eight lamp channels).
  Wheels and licence plates (Turkish plate atlas) are one draw call each for the whole fleet.
* `materials.ts` – clear-coat paint, vertex-coloured detail, tinted glass, emissive lamps. Lamps are driven per
  car by the intensities in `LampState`: head, tail/brake, indicator L/R, reverse, beacon A/B, aux (DRL, markers).

`dev/vehicles.html?kind=sedan&view=sheet|rear34|front34|side|eye&lamps=brake,ind,beacon&night=1` renders any model
through the same fleet (`kinds=a,b,c` for a lineup). Triangle budgets are asserted in `tests/unit/trafficModels.test.ts`
(LOD0 < 26k, LOD1 < 4.2k per vehicle).

## View (`TrafficView`)

Per frame it writes one matrix per car (road pitch, nose dive under braking, roll in lane changes), picks LOD0
inside 80 m and LOD1 beyond, spins wheels (steered pair follows the lane change), draws plates inside 55 m and
pushes glow points for lit lamps (bloom sources). At night, lit cars project soft **light pools** on the road
(headlights ahead of the car, red wash behind a braking car; additive, one instanced draw). Roadworks cones are
instanced too. Crashes hand a car over to `CrashSim` through `detachForCrash` (an object with `obj.group` and
one node per wheel that the crash simulation drives); `crashVehicleLights` keeps brake / hazard lights alive.

## Simulation (`TrafficSystem`)

* IDM car following (heavy vehicles accelerate / brake gently with a longer headway), lane discipline per
  direction, spawn beyond the fog line, density from base density × `densityScale` (map, time of day, weather –
  `trafficContext(env)`), vehicle mix per map (`MAP_TRAFFIC_MIX`).
* Lane changes: a driver signals for 1.7–3.1 s, re-checks neighbours **and the rider** (time-to-contact
  must exceed the manoeuvre time plus a margin, never within `length/2 + 10` m alongside) and only then
  moves; the indicator stays on during the move. Reasons: blocked by a slower leader (overtake), keep right
  afterwards, slowdown zones, now and then no reason at all. Trucks and buses stay mostly in the slow lane.
* Rider reactions: a driver who is closing on a rider that cut in brakes hard, flashes and honks; close
  overtakes sometimes get a horn; oncoming drivers flash and honk at a rider in their lane (and at night some
  flash for courtesy).
* Incidents (`triggerIncident`): cars behind stop with hazard lights, further back slow down, oncoming traffic
  eases off; cars already past drive on.
* Zones: a parked police car with beacons on the shoulder (drivers slow to 70 km/h, some move over) or a closed
  lane with a work van and cones (traffic merges early, 50 km/h). Zones are set up beyond the fog and appear
  every couple of minutes; they never overlap other vehicles.
* Everything is deterministic for a seed.

## Tests

`tests/unit/trafficBehaviour.test.ts` (long headless simulations: overlaps, blinker lead time, rider safety,
lane keeping, brake lights, incidents, determinism, zones), `trafficModels.test.ts` (geometry, budgets,
fleet instancing / dispose), `trafficView.test.ts` (view with a stub world), `trafficKit.test.ts`.
