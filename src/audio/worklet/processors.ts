/**
 * AudioWorklet entry: registers the three DSP processors of the game. The DSP itself lives in
 * `../dsp/*` (pure TypeScript shared with the ScriptProcessor fallback and the offline tests); this
 * file only adapts it to the worklet API. Bundled by Vite as a standalone worker-format file
 * (`?worker&url`), so the same code path works in dev and in the production build.
 */
import { EngineHost, type EngineHostOptions, type EngineMsg } from '../dsp/engineHost';
import { TrafficHost, type TrafficMsg } from '../dsp/trafficHost';
import { WorldDSP, type WorldControls } from '../dsp/worldDsp';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}
declare function registerProcessor(name: string, ctor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor): void;

type Control = { t: 'kill' };

class EngineProcessor extends AudioWorkletProcessor {
  private readonly host: EngineHost;
  private alive = true;
  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    const o = options.processorOptions as Omit<EngineHostOptions, 'sampleRate'>;
    this.host = new EngineHost({ ...o, sampleRate });
    this.port.onmessage = (e: MessageEvent<EngineMsg | Control>) => {
      const m = e.data;
      if (m.t === 'kill') this.alive = false;
      else this.host.handle(m);
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return this.alive;
    const l = out[0];
    const r = out[1] ?? out[0];
    this.host.render(l, r, 0, l.length);
    return this.alive;
  }
}

class WorldProcessor extends AudioWorkletProcessor {
  private readonly dsp = new WorldDSP(sampleRate);
  private alive = true;
  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = (e: MessageEvent<{ t: 'ctl'; c: Partial<WorldControls> } | { t: 'snap' } | Control>) => {
      const m = e.data;
      if (m.t === 'kill') this.alive = false;
      else if (m.t === 'snap') this.dsp.snap();
      else this.dsp.setControls(m.c);
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return this.alive;
    this.dsp.process(out[0], out[1] ?? out[0], 0, out[0].length);
    return this.alive;
  }
}

class TrafficProcessor extends AudioWorkletProcessor {
  private readonly host: TrafficHost;
  private readonly bufs: Float32Array[] = [];
  private alive = true;
  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    const slots = (options.processorOptions as { slots: number }).slots;
    this.host = new TrafficHost(slots, sampleRate);
    this.port.onmessage = (e: MessageEvent<TrafficMsg | Control>) => {
      const m = e.data;
      if (m.t === 'kill') this.alive = false;
      else this.host.handle(m);
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const outs = this.bufs;
    outs.length = 0;
    for (const o of outputs) outs.push(o[0]);
    this.host.render(outs, outputs[0]?.[0]?.length ?? 128);
    return this.alive;
  }
}

registerProcessor('race-engine', EngineProcessor);
registerProcessor('race-world', WorldProcessor);
registerProcessor('race-traffic', TrafficProcessor);
