import { describe, expect, it } from 'vitest';
import { BIKES } from '../../src/data/bikes';
import { firingIntervals, layerRpms, layerWeights, renderEngineLoop } from '../../src/audio/engineSynth';

describe('firing orders', () => {
  it('every layout sums to one 720° cycle', () => {
    for (const b of BIKES) {
      if (b.engine.layout === 'ELECTRIC') continue;
      const iv = firingIntervals(b.engine.layout);
      expect(iv.reduce((a, c) => a + c, 0)).toBe(720);
    }
  });
  it('captures the characteristic rhythms', () => {
    expect(firingIntervals('I4')).toEqual([180, 180, 180, 180]);
    expect(firingIntervals('I4CP')).toEqual([270, 180, 90, 180]);
    expect(firingIntervals('V2_45')).toEqual([315, 405]);
    expect(firingIntervals('L2')).toEqual([270, 450]);
    expect(firingIntervals('V4')).toEqual([90, 200, 90, 340]);
    expect(firingIntervals('I3')).toEqual([240, 240, 240]);
  });
});

describe('engine loop synthesis', () => {
  it('renders a seamless, normalised loop with whole cycles', () => {
    const loop = renderEngineLoop({
      sampleRate: 44100,
      baseRpm: 3000,
      layout: 'V2_45',
      voice: { resonance: 95, brightness: 0.25, roughness: 0.45, crackle: 0.2, loudness: 2 },
      ccPerCylinder: 960,
    });
    expect(loop.data.length).toBe(Math.round(loop.samplesPerCycle * loop.cycles));
    let peak = 0;
    let finite = true;
    for (const v of loop.data) {
      peak = Math.max(peak, Math.abs(v));
      if (!Number.isFinite(v)) finite = false;
    }
    expect(finite).toBe(true);
    expect(peak).toBeCloseTo(0.9, 5);
    // Seam continuity: last and first samples should be close relative to the signal.
    const jump = Math.abs(loop.data[0] - loop.data[loop.data.length - 1]);
    expect(jump).toBeLessThan(0.35);
  });

  it('energy follows the firing pattern (inline-4 fires 4x per cycle)', () => {
    const sr = 44100;
    const loop = renderEngineLoop({
      sampleRate: sr,
      baseRpm: 1200,
      layout: 'I4',
      voice: { resonance: 500, brightness: 0.8, roughness: 0, crackle: 0, loudness: 0 },
      ccPerCylinder: 250,
    });
    // Energy envelope in 16 bins per cycle: peaks should appear every 4 bins.
    const bins = new Array(16).fill(0);
    const spc = loop.samplesPerCycle;
    for (let i = 0; i < loop.data.length; i++) {
      const phase = (i % spc) / spc;
      bins[Math.floor(phase * 16) % 16] += loop.data[i] ** 2;
    }
    const firingBins = [0, 4, 8, 12].map((b) => bins[b]);
    const quietBins = [2, 6, 10, 14].map((b) => bins[b]);
    expect(Math.min(...firingBins)).toBeGreaterThan(Math.max(...quietBins));
  });

  it('electric layout yields silence (handled by the motor synth)', () => {
    const loop = renderEngineLoop({
      sampleRate: 8000,
      baseRpm: 3000,
      layout: 'ELECTRIC',
      voice: { resonance: 0, brightness: 0, roughness: 0, crackle: 0, loudness: 0 },
      ccPerCylinder: 0,
    });
    expect(loop.data.every((v) => v === 0)).toBe(true);
  });
});

describe('layer crossfade', () => {
  const layers = layerRpms(1200, 14000);
  it('layers are ascending', () => {
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThan(layers[i - 1]);
  });
  it('weights are equal-power and cover the range', () => {
    for (let rpm = 500; rpm < 16000; rpm += 137) {
      const w = layerWeights(rpm, layers);
      const p = w.reduce((a, c) => a + c * c, 0);
      expect(p).toBeCloseTo(1, 6);
      expect(w.every((x) => x >= 0)).toBe(true);
    }
  });
});

describe('engine character', () => {
  const voice = { resonance: 300, brightness: 0.5, roughness: 0, crackle: 0, loudness: 0 };
  /** Normalised autocorrelation of the loop's energy envelope at a lag in samples. */
  function envelopeCorrelation(layout: Parameters<typeof renderEngineLoop>[0]['layout'], fracOfCycle: number): number {
    const loop = renderEngineLoop({ sampleRate: 22050, baseRpm: 2400, layout, voice, ccPerCylinder: 300, seconds: 1.2 });
    const n = loop.data.length;
    const env = new Float32Array(n);
    const win = Math.max(1, Math.round(loop.samplesPerCycle / 64));
    let acc = 0;
    for (let i = 0; i < n + win; i++) {
      acc += loop.data[i % n] ** 2;
      if (i >= win) acc -= loop.data[(i - win) % n] ** 2;
      if (i >= win) env[(i - Math.floor(win / 2)) % n] = acc / win;
    }
    let mean = 0;
    for (const v of env) mean += v;
    mean /= n;
    const lag = Math.round(loop.samplesPerCycle * fracOfCycle);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const a = env[i] - mean;
      num += a * (env[(i + lag) % n] - mean);
      den += a * a;
    }
    return num / den;
  }

  it('even-firing engines repeat every firing interval', () => {
    expect(envelopeCorrelation('I4', 1 / 4)).toBeGreaterThan(0.85);
    expect(envelopeCorrelation('I3', 1 / 3)).toBeGreaterThan(0.85);
    expect(envelopeCorrelation('BOXER', 1 / 2)).toBeGreaterThan(0.85);
  });

  it('uneven-firing engines only repeat every full 720° cycle (their signature lope)', () => {
    for (const [layout, n] of [['V2_45', 2], ['L2', 2], ['I4CP', 4], ['V4', 4]] as const) {
      const atInterval = envelopeCorrelation(layout, 1 / n);
      const atCycle = envelopeCorrelation(layout, 1);
      expect(atCycle).toBeGreaterThan(0.85);
      expect(atInterval).toBeLessThan(atCycle - 0.25);
    }
  });
});
