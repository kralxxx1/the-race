# Audio system

All sound in the game is **synthesised in real time** from physical models. There are no recordings: real
engine recordings are not available to us (copyright), and even if they were, loops cross-faded by rpm cannot
reproduce a motorcycle's behaviour (continuous rpm changes, load, overrun, limiter, every firing order). The
synthesis is "physically informed" — it models the mechanisms that make bikes sound the way they do — but it is
an approximation, not a measurement of any manufacturer's machine.

## Why the old engine sounded the same on every bike

The previous implementation pre-rendered a handful of looped firing-order buffers per bike and cross-faded them
by rpm, then pushed everything through the same filter chain (one low-pass, one peaking EQ, one shaper). Firing
*rhythm* differed a little, but everything that gives a bike its character was shared or missing: exhaust length
and routing, silencer type, airbox/induction sound, valve-train and gear noise, load-dependent timbre, per-cylinder
irregularity. Loops also cannot follow fast rpm changes without pitch-shifted artefacts.

## Overview

```
game.ts ──► GameAudio (per run)                       ──► AudioEngine (context, buses, master chain)
              ├─ EngineSound ──► [AudioWorklet 'race-engine' | ScriptProcessor fallback] ─► engine bus
              ├─ world DSP    ──► [AudioWorklet 'race-world'  | fallback]  wind, tyres, rain, slides ─► world bus
              ├─ traffic DSP  ──► [AudioWorklet 'race-traffic'| fallback]  N mono outputs ─► PannerNode each ─► traffic bus
              ├─ SfxBank      ──► procedural one-shots (crash layers, horns, whoosh, thunder) ─► sfx / ambience bus
              └─ ReverbSystem ──► two ConvolverNodes cross-fading procedural impulse responses
```

All DSP lives in `src/audio/dsp/*` as **pure TypeScript with no Web Audio types**. The same objects run in the
AudioWorklet (`worklet/processors.ts`), in the ScriptProcessor fallback (`dspNodes.ts`) and offline in unit tests
and the lab tool, so what the tests measure is exactly what the player hears.

| File | What it is |
|------|------------|
| `dsp/engineDsp.ts` | Crank-angle combustion engine synthesiser (`EngineDSP`) |
| `dsp/waveguide.ts` | Exhaust as a network of digital waveguides with scattering junctions |
| `dsp/electricDsp.ts` | Electric drivetrain (LiveWire) |
| `dsp/engineHost.ts` | Message handler and gain stage around one engine voice |
| `dsp/worldDsp.ts` | Wind, tyres by surface, expansion joints, rain, slides |
| `dsp/vehicleDsp.ts`, `trafficHost.ts` | Cheap traffic engines (car / van / diesel / bus / moto / sport) |
| `dsp/sfxDsp.ts` | Offline renderers for impacts, horns, whooshes, thunder |
| `dsp/impulse.ts` | Procedural reverb impulse responses (open, street, canyon, forest, tunnel, industrial) |
| `dsp/params.ts` | Plain-data voice description handed to the synthesisers (structured-cloneable) |
| `dsp/analysis.ts`, `features.ts`, `calibrate.ts` | FFT, spectrograms, feature vector, loudness calibration (tests + tools only) |
| `voiceKit.ts` | Authoring kit: exhaust topologies, silencer archetypes, intake presets |
| `voices.ts` | **One entry per bike** in `src/data/bikes.ts` |
| `voiceCalib.ts` | Generated loudness table (see *Calibration*) |
| `engineSound.ts`, `gameAudio.ts`, `audioEngine.ts`, `reverb.ts`, `sfxBank.ts`, `dspNodes.ts` | Main-thread glue |
| `audioSettings.ts`, `audioConfig.ts` | Settings definitions and the typed config read from them |

## The engine model

`EngineDSP` advances the **crank angle** sample by sample (`dθ = rpm·6/sr` degrees, with the in-cycle speed
ripple that follows from the cylinders' torque pulses). Every valve and firing event of every cylinder sits at
its true angle in the 720° cycle (`FIRING_ANGLES` / the voice's `firing` override), so the firing order *is* the
rhythm and rpm can change arbitrarily fast: no loops, no cross-fades, no clicks.

Per cylinder and cycle:

1. **Combustion** at the firing angle. Strength follows load (and has a floor so idle still runs); cycle-to-cycle
   amplitude and timing scatter scale with `roughness`; `idleLope` randomly drops weak cycles at idle (big twins,
   singles); `sizeScale ∝ √(cc per cylinder)` sets pulse size.
2. **Exhaust valve opening** injects a pressure pulse into that cylinder's header: a slow piston-driven hump plus
   a **blowdown spike** whose duration is fixed in *milliseconds* (bigger bores are slower), not crank degrees.
   That is why a low-rpm V-twin stays crisp ("potato" crack) while a high-rpm four gets a tight, ringing scream.
   Turbulent noise rides on the pulse in proportion to `rasp` and load.
3. **Intake valve opening** draws a suction pulse through the airbox Helmholtz resonator and a runner resonance,
   plus load-driven induction roar (noise gated by the suction pulses) and ram-air whoosh with road speed.
4. **Valve closing** triggers valve-train ticks; desmodromic engines add a second, lower-pitched clatter.

The **exhaust** is a `WaveguideNetwork`: bidirectional delay lines (length / gas sound speed) with wall-loss
low-passes, scattering junctions weighted by pipe cross-section, partially closed exhaust ports (reflecting
returning waves) and open tail pipes (negative, low-passed reflection). Radiated sound is the flow leaving
the open ends through a radiation high-pass (the derivative of volume velocity), then the silencer's absorptive
low-pass and its shell/side-branch resonances. Header lengths, the 4-2-1 / 4-1 / 2-1 / separate-pipe / organ
topology and the silencer archetype therefore set real resonances and comb structure.

Other voices of the engine: block/frame modes excited by combustion, primary-gear and cam-chain whine, final
drive (chain/belt/shaft/CVT) whine, dry-clutch rattle, starter motor, supercharger impeller whine and the
compressor-surge "chirp" on lift-off (Kawasaki H2/H2R), and slow rpm hunting.

**Load dependence:** closed throttle above idle cuts fuel (overrun): faint pulses plus **burble and pops** from
unburnt mixture lighting in the hot header (more on sport/aftermarket voices, never under power), with
occasional big backfires. The **limiter** and **quickshifter** cut ignition for tens of milliseconds, with
re-light pops on voices that crackle.

**Mixes:** `FIRST_PERSON_MIX` (rider on the bike: intake roar and mechanics in front/below, exhaust behind the
rider's head with a high-frequency shadow, helmet/ear-protection shelf EQ) and `EXTERNAL_MIX` (bystander, used
by the garage rev preview).

**Electric** (`electricDsp.ts`): no combustion at all — permanent-magnet torque-ripple orders, primary bevel gear
whine, inverter PWM carrier with sidebands, cooling air and belt drive.

**Quality presets** (`audio.quality`, tied to the graphics preset): `low` collapses the exhaust to one
header → silencer → tail pipe and drops ticks and whines; `medium` runs the full per-cylinder network;
`high`/`ultra` add valve-train ticks, more block modes and silencer resonators; `extreme` runs the whole
voice at 2× oversampling with a half-band decimator.

## World sound

* `WorldDSP`: helmet wind (rush band rising ≈ v², low-frequency buffeting driven by a random gust process,
  visor-seal whistle above ~70 km/h, a helmet-dependent roll-off), tyre hum and tread buzz, wet-road hiss, rumble
  strips (periodic at speed / 16 cm), gravel crunch, snow, tyre squeal under braking/wheelspin, concrete
  expansion-joint thumps, metal scrape and body slides after a crash, rain wash and drops on the helmet.
  Surface comes from the bike's lateral position (`surfaceAt` in `gameAudio.ts`).
* Traffic: up to 8 `VehicleDSP` voices (nearest cars win slots), each with a gearbox/rpm model, road noise,
  diesel clatter, turbo whistle, air-brake hiss and **Doppler** applied to every component. Each voice is
  spatialised by its own `PannerNode` (HRTF or equal-power). Heavy vehicles passing close add helmet turbulence.
* One-shots (`SfxBank`, rendered lazily from `dsp/sfxDsp.ts`): layered crash (metal crunch, plastic crack,
  glass shatter for hard car hits, body thud, tumble), light/heavy near-miss whoosh, per-vehicle horns (car,
  taxi, truck, bus, moto), thunder.
* Reverb: `ReverbSystem` cross-fades two convolvers; zone defaults from the map id embedded in `EnvDef.id`
  (`zoneForEnv`), overridable per frame (`AudioFrame.zone = 'tunnel'`) or from the console
  (`__THE_RACE__.setAudioZone('tunnel')`).

## Master chain and settings

`AudioEngine` builds: buses → mix → bass shelf → treble shelf → night-mode compressor → safety limiter → master
volume → mono fold → output. Every `audio.*` setting in `audioSettings.ts` is read into `AudioConfig`
(`audioConfig.ts`) and applied by `AudioEngine.applySettings` (levels, EQ, "gece modu" compression, mono,
reverb on/amount, quality) or by the component that uses it (`EngineSound`: intake/exhaust balance, helmet,
mechanical level, crackle, exhaust type, dry clutch, starter, quality — a change of exhaust/clutch/quality
rebuilds the voice with a cross-fade; `GameAudio`: Doppler strength, traffic voice count, spatial mode, near-miss
and horn sounds). A unit test flips every setting and asserts the typed config changes, so nothing is dead.

## Fallback

If `audioWorklet` is missing or `addModule` fails, the same hosts run inside a `ScriptProcessorNode`
(2048-frame buffers) with the synthesis quality capped at `medium`. `__THE_RACE__.audioBackend` reports
`worklet`, `script` or `none`. The worklet file is bundled by Vite as a self-contained script
(`?worker&url`) and resolved with `new URL(…, import.meta.url)`, so it works in dev, in `vite build` +
`vite preview` and from any sub-path.

## How to tune a voice

Every bike has an entry in `BIKE_VOICES` (`voices.ts`); a missing entry falls back to a generic voice and a unit
test fails. An entry looks like:

```ts
'yamaha-r1': {
  note: 'Crossplane: uneven 270-180-90-180 beat …',       // what the real bike sounds like
  topology: { t: '4-2-1', headers: [0.6, 0.64, 0.62, 0.6], pairs: I4_PAIRS, secondary: 0.3, collector: 0.36 },
  silencer: { kind: 'sportCan', extra: [{ hz: 175, q: 2.4, gain: 0.22 }], pan: [0.4] },
  intake: 'ramAirSport', intakeGain: 1.15,
  mech: chain({ tick: 0.22, tickHz: 4400, camWhine: 0.4, gearWhine: 0.3, clutchRattle: 0.12, driveWhine: 0.8 }),
  exhDuration: 258, blowdown: 0.88, roughness: 0.2, idleLope: 0.15, flywheel: 0.28, rasp: 0.6,
  gasC: 580, crackle: 0.6, backfire: 0.15, loudness: 0.8,
},
```

What each knob does to the sound:

| Knob | Effect |
|------|--------|
| `firing` (optional) | Firing angles when the real engine differs from the catalogue layout (e.g. Indian 49° V-twin). |
| `topology.headers` | Header length per cylinder in metres — sets header resonance (≈ c/4L) and, when unequal, extra rasp/beating. Short = higher, brighter. |
| `topology.t` | `merge` (4-1, 3-1, 2-1), `4-2-1`, `groups` (separate pipes / 6-2 / true duals, optional balance pipe), `organ` (collector then several short tips). |
| `silencer.kind` | Archetype: `stock`, `sportCan`, `titanium`, `underbelly`, `stubby`, `touring`, `fishtail`, `shotgun`, `peashooter`, `adventure`, `race`, `scooter`, `organ`. Sets expansion-chamber size (mid/low muffling), packing absorption (highs), tail radiation and shell resonances. |
| `silencer.len / muffle / bright / extra / pan` | Chamber length, expansion ratio, absorption corner, extra resonators, stereo position of each outlet. |
| `intake`, `intakeGain` | Airbox Helmholtz frequency/Q, runner resonance, roar and ram-air amount (`ramAirSport`, `naked`, `nakedAmplified`, `adventure`, `cruiser`, `classic`, `single`, `scooter`, `touring`). |
| `mech` | Valve tick level/pitch, desmo clatter, cam-chain and primary-gear whine (teeth count sets pitch), dry-clutch rattle, drive type and whine, starter pitch. |
| `exhDuration` | Exhaust valve open angle: longer = overlapping pulses, smoother. |
| `blowdown` | 0..1 sharpness of the blowdown spike: high = crisp, hard, tonal. |
| `roughness`, `idleLope` | Cycle-to-cycle scatter and random weak cycles at idle: lumpy big twins and singles. |
| `flywheel` | In-cycle crank speed ripple: light flywheels wobble, heavy ones are smooth. |
| `rasp` | Turbulent noise riding on each pulse (race pipes, rasp at the top end). |
| `gasC` | Exhaust gas sound speed (480 quiet … 620 race): scales every pipe resonance. |
| `crackle`, `backfire` | Overrun burble and big-pop tendency. |
| `loudness` | Trim in dB on top of the automatic calibration. |
| `charger` / `electric` | Supercharger (impeller ratio, blades, whine, blow-off) or electric motor orders. |

Workflow: edit the entry, then

```bash
node tools/audio-lab.mjs render <outDir> yamaha-r1,harley-fat-boy high 9 3000 lin   # WAV + spectrogram PNG per bike
node tools/audio-lab.mjs pair yamaha-r1 honda-cbr1000rr-r                           # distance breakdown for two bikes
node tools/audio-lab.mjs features 30                                                 # closest pairs of all 60 bikes
node tools/audio-lab.mjs calibrate                                                   # rewrites src/audio/voiceCalib.ts
npx vitest run tests/unit/audio*.test.ts
```

Look at the spectrogram: a good voice shows a clean fan of firing-order harmonics (its spacing is the rhythm),
a noise floor 15–25 dB below it, and character lines (gear/charger whine) at their own slopes. Listen to the WAV.

### Calibration

Different voices have very different raw levels. `tools/audio-lab.mjs calibrate` renders every bike at 65 % of
redline at full throttle, measures the **B-weighted** level (A-weighting would discard the bass that makes
twins and singles feel big) and writes the gain that brings it to `CALIB_TARGET_A_DB`, capped by an RMS limit at
the top of the rev range. Run it after any change to a voice or the DSP; a unit test fails when the table
drifts more than 0.6 dB.

### Distinctness

`dsp/features.ts` fingerprints each bike (third-octave spectrum shape, centroid, whine salience, loudness and
the rhythm of the envelope folded on the 720° cycle) at idle / mid / high rpm and off throttle.
`tests/unit/audioVoices.test.ts` requires every pair to be separated: ≥ 1.8 for different engines and
≥ 1.5 for documented siblings that share hardware (the sibling list is in the test with the reasons). The median
pair distance is ≈ 3.9. A distance of ~1 is "audible if you listen for it", ≥ 2 is obvious.

## Performance (Node 22, one core of a build server; 128-frame quanta at 48 kHz = 2.67 ms of budget)

| Component | Mean per quantum |
|-----------|------------------|
| Player engine, `high` (typical) | 0.24 – 0.36 ms |
| Player engine, `low` / `medium` | 0.15 – 0.20 / 0.23 – 0.34 ms |
| Player engine, `extreme` (2× oversampling) | 0.5 – 0.7 ms |
| Electric motor | 0.06 ms |
| World DSP (wind + tyres / everything active) | 0.09 / 0.27 ms |
| Traffic, 3 / 5 / 8 voices | 0.08 / 0.15 / 0.21 ms |

`node tools/audio-lab.mjs bench` and `benchworld` reproduce these.

## Tests and tools

* `tests/unit/audioDsp.test.ts` — firing events at the right crank angles (onset/rhythm correlation and
  periodicity per layout), continuity under fast rpm sweeps (bounded deltas, no block-boundary clicks,
  no NaN/denormals), pops only off-throttle, quickshifter cut, electric has no combustion periodicity,
  waveguide delay/passivity, host messaging.
* `tests/unit/audioVoices.test.ts` — one voice per bike, network integrity, families differ, exhaust mods,
  calibration sync, **distinctness of all 1 770 pairs**.
* `tests/unit/audioWorld.test.ts` — wind ∝ v², helmet, wet/rumble/gravel, Doppler, vehicle types, reverb
  decay times, SFX layers, settings coverage.
* `tools/audio-lab.mjs` — offline renders, spectrograms, benches, calibration, distinctness report.
* `tools/audio-probe.mjs` — boots the real game in a browser and samples `__THE_RACE__.audioLevel`
  (`NOWORKLET=1` tests the fallback, `SETTINGS`, `CRASH`, `GARAGE`, `ADVANCE`).

## Known limits

* Nothing here was tuned against recordings; levels, spectra and rhythm come from engine physics, published
  specifications and judgement, and were checked with spectrograms and numeric tests, not with a calibrated ear.
  Treat `voices.ts` as the place to adjust by ear.
* The exhaust network is 1-D (plane waves); it does not model 3-D silencer geometry beyond expansion
  chambers and side-branch resonators.
* The fallback path is lighter and capped at `medium` quality.
