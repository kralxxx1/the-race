// Offline audio lab: runs the pure-TypeScript DSP core under Vite's SSR loader.
//   node tools/audio-lab.mjs render <outDir> <bikeId[,bikeId...]|all|reps> [quality] [seconds]
//   node tools/audio-lab.mjs bench [bikeId,...] [quality]
//   node tools/audio-lab.mjs calibrate           (prints/writes src/audio/voiceCalib.ts)
//   node tools/audio-lab.mjs features            (distinctness report)
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const [, , cmd = 'help', ...args] = process.argv;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
const load = (p) => vite.ssrLoadModule(p);

function wavBuffer(l, r, sr) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}
const heat = (v) => {
  // black → purple → red → yellow → white
  const x = Math.max(0, Math.min(1, v));
  const stops = [[0, 0, 0], [40, 0, 80], [180, 20, 80], [250, 150, 20], [255, 255, 200]];
  const f = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  return stops[i].map((c, j) => c + (stops[i + 1][j] - c) * k);
};

try {
  if (cmd === 'render') {
    const [outDir, which = 'reps', quality = 'high', secs = '9', fMaxArg = '12000', linArg = ''] = args;
    mkdirSync(outDir, { recursive: true });
    const { BIKES } = await load('/src/data/bikes.ts');
    const { voiceParams } = await load('/src/audio/voices.ts');
    const { renderOffline } = await load('/src/audio/dsp/synthFactory.ts');
    const { spectrogram } = await load('/src/audio/dsp/analysis.ts');
    const reps = ['honda-cbr1000rr-r', 'yamaha-r1', 'ducati-panigale-v4s', 'harley-fat-boy', 'triumph-street-triple', 'kawasaki-h2r', 'livewire-one', 'bmw-r1250gs', 'ktm-1290-superduke-r', 're-classic-350', 'yamaha-tmax', 'honda-gold-wing'];
    let ids = which === 'all' ? BIKES.map((b) => b.id) : which === 'reps' ? reps : which.split(',');
    const sr = 48000;
    for (const id of ids) {
      const spec = BIKES.find((b) => b.id === id);
      if (!spec) { console.log('unknown bike', id); continue; }
      const e = spec.engine;
      const params = voiceParams(spec);
      const T = Number(secs);
      // idle 1.5 s, rev sweep to limiter, hold, lift off (overrun), idle
      const idle = e.idle, top = e.redline * 0.98;
      const rpmAt = (t) => (t < 1.5 ? idle : t < 1.5 + T * 0.55 ? idle + (top - idle) * ((t - 1.5) / (T * 0.55)) ** 1.1 : t < T ? top * (1 - 0.7 * Math.min(1, (t - 1.5 - T * 0.55) / (T * 0.45 - 1.5))) : idle);
      const thrAt = (t) => (t < 1.5 ? 0 : t < 1.5 + T * 0.55 ? 1 : t < T - 1 ? 0 : 0);
      const plan = { seconds: T + 1, rpm: e.layout === 'ELECTRIC' ? (t) => rpmAt(t) * (t < 1.5 ? 0 : 1) : rpmAt, throttle: thrAt, load: (t) => thrAt(t), speed: (t) => Math.max(0, (rpmAt(t) - idle) / (top - idle)) * 60 };
      const { left, right } = renderOffline(params, plan, sr, quality);
      let peak = 0;
      for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      writeFileSync(join(outDir, `${id}.wav`), wavBuffer(left, right, sr));
      const mono = new Float32Array(left.length);
      for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
      const sg = spectrogram(mono, sr, linArg ? 4096 : 2048, 512, linArg ? 20 : 160, Number(fMaxArg), !!linArg);
      const w = sg.frames, h = sg.bins;
      const rgb = Buffer.alloc(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = sg.data[x * h + (h - 1 - y)];
        const c = heat((v + 90) / 80);
        const o = (y * w + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
      writePng(join(outDir, `${id}.png`), w, h, rgb);
      console.log(id.padEnd(30), 'peak', peak.toFixed(2), `${w}x${h}`);
    }
  } else if (cmd === 'bench') {
    const { BIKES } = await load('/src/data/bikes.ts');
    const { voiceParams } = await load('/src/audio/voices.ts');
    const { createSynth } = await load('/src/audio/dsp/synthFactory.ts');
    const ids = args[0] && args[0] !== 'all' ? args[0].split(',') : ['honda-cbr1000rr-r', 'yamaha-r1', 'harley-fat-boy', 'honda-gold-wing', 'kawasaki-h2r', 'livewire-one'];
    const qualities = args[1] ? args[1].split(',') : ['low', 'medium', 'high', 'ultra', 'extreme'];
    const sr = 48000;
    for (const id of ids) {
      const spec = BIKES.find((b) => b.id === id);
      for (const q of qualities) {
        const params = voiceParams(spec);
        const s = createSynth(params, sr, q);
        const L = new Float32Array(128), R = new Float32Array(128);
        const rpm = spec.engine.redline * 0.7;
        s.setControls({ rpm, throttle: 0.9, load: 0.9, speed: 30 });
        s.snapControls();
        for (let i = 0; i < 400; i++) s.process(L, R, 0, 128);
        const n = 4000;
        const times = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const t0 = process.hrtime.bigint();
          s.process(L, R, 0, 128);
          times[i] = Number(process.hrtime.bigint() - t0) / 1e6;
        }
        times.sort();
        const mean = times.reduce((a, c) => a + c, 0) / n;
        console.log(`${id.padEnd(28)} ${q.padEnd(8)} mean ${mean.toFixed(3)} ms  p50 ${times[n >> 1].toFixed(3)}  p99 ${times[Math.floor(n * 0.99)].toFixed(3)}  max ${times[n - 1].toFixed(3)}`);
      }
    }
  } else if (cmd === 'calibrate') {
    const { BIKES } = await load('/src/data/bikes.ts');
    const { voiceParams } = await load('/src/audio/voices.ts');
    const { measureLoudness, CALIB_TARGET_A_DB, CALIB_RMS_CAP_DB } = await load('/src/audio/dsp/calibrate.ts');
    const rows = [];
    for (const spec of BIKES) {
      const m = measureLoudness(voiceParams(spec, { calib: false }), spec.engine);
      const gA = CALIB_TARGET_A_DB - m.aDb;
      const gR = CALIB_RMS_CAP_DB - m.rmsPeakDb;
      const g = Math.min(gA, gR);
      rows.push([spec.id, Math.pow(10, g / 20)]);
      console.log(spec.id.padEnd(28), 'A', m.aDb.toFixed(1), 'rmsTop', m.rmsPeakDb.toFixed(1), '→ gain', g.toFixed(1), 'dB', gR < gA ? '(rms-capped)' : '');
    }
    const body = rows.map(([id, g]) => `  '${id}': ${g.toFixed(4)},`).join('\n');
    writeFileSync('src/audio/voiceCalib.ts', `// Generated by \`node tools/audio-lab.mjs calibrate\` — do not edit by hand.\n// Linear gain that brings every bike to the same A-weighted loudness (see src/audio/dsp/calibrate.ts).\nexport const VOICE_CALIB: Readonly<Record<string, number>> = {\n${body}\n};\n`);
    console.log('wrote src/audio/voiceCalib.ts');
  } else if (cmd === 'features') {
    const { BIKES } = await load('/src/data/bikes.ts');
    const { voiceParams } = await load('/src/audio/voices.ts');
    const { bikeFeatures, bikeDistance } = await load('/src/audio/dsp/features.ts');
    const t0 = Date.now();
    const feats = BIKES.map((b) => bikeFeatures(voiceParams(b), b.engine));
    console.log('features in', ((Date.now() - t0) / 1000).toFixed(1), 's');
    const pairs = [];
    for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) pairs.push([bikeDistance(feats[i], feats[j]), feats[i].id, feats[j].id]);
    pairs.sort((a, b) => a[0] - b[0]);
    const n = Number(args[0] ?? 30);
    for (const [d, a, b] of pairs.slice(0, n)) console.log(d.toFixed(2), a, '~', b);
    const ds = pairs.map((p) => p[0]);
    console.log('min', ds[0].toFixed(2), 'p10', ds[Math.floor(ds.length * 0.1)].toFixed(2), 'median', ds[ds.length >> 1].toFixed(2));
    // nearest neighbour per bike
    const nn = feats.map((f, i) => { let best = [1e9, '']; feats.forEach((g, j) => { if (i !== j) { const d = bikeDistance(f, g); if (d < best[0]) best = [d, g.id]; } }); return [best[0], f.id, best[1]]; }).sort((a, b) => a[0] - b[0]);
    console.log('--- nearest neighbour per bike (lowest first)');
    for (const [d, a, b] of nn.slice(0, 20)) console.log(d.toFixed(2), a, '→', b);
  } else if (cmd === 'pair') {
    const { BIKES } = await load('/src/data/bikes.ts');
    const { voiceParams } = await load('/src/audio/voices.ts');
    const { bikeFeatures, bikeDistance } = await load('/src/audio/dsp/features.ts');
    const get = (id) => { const b = BIKES.find((x) => x.id === id); return bikeFeatures(voiceParams(b), b.engine); };
    const a = get(args[0]);
    const b = get(args[1]);
    console.log('distance', bikeDistance(a, b).toFixed(2));
    for (const k of ['idle', 'mid', 'high', 'overrun']) {
      const x = a[k], y = b[k];
      let shape = 0; for (let i = 0; i < x.shape.length; i++) shape += ((x.shape[i] - y.shape[i]) / 6) ** 2;
      let rh = 0; for (let i = 0; i < x.rhythm.length; i++) rh += (x.rhythm[i] - y.rhythm[i]) ** 2;
      console.log(k.padEnd(8), 'shape', (Math.sqrt(shape / x.shape.length) * 2.2).toFixed(2), 'level', (Math.abs(x.level - y.level) / 6).toFixed(2), 'centroid', (Math.abs(x.centroid - y.centroid) * 1.4).toFixed(2), 'rhythm', (Math.sqrt(rh / 24) * 2.4).toFixed(2), 'tonal', (Math.abs(x.tonality - y.tonality) / 9).toFixed(2), '| lvl', x.level.toFixed(1), y.level.toFixed(1));
    }
  } else {
    console.log('usage: see header');
  }
} finally {
  await vite.close();
}
