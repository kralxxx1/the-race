import { EngineHost, type EngineHostOptions, type EngineMsg } from './dsp/engineHost';
import { TrafficHost, type TrafficMsg } from './dsp/trafficHost';
import { WorldDSP, type WorldControls } from './dsp/worldDsp';
import type { EngineQuality } from './dsp/params';

/**
 * A DSP voice living either in an AudioWorklet (preferred: runs off the main thread, glitch-free
 * while the game renders) or, when AudioWorklet is unavailable, in a ScriptProcessorNode running the
 * very same TypeScript objects on the main thread at a reduced quality.
 */
export interface DspNode<M> {
  readonly kind: 'worklet' | 'script';
  /** Connect output `index` (0 for single-output nodes) to `dest`. */
  connect(dest: AudioNode, index?: number): void;
  post(msg: M): void;
  dispose(): void;
}

export interface DspBackend {
  /** Present when `audioWorklet.addModule` succeeded. */
  workletReady: boolean;
}

/** The fallback never runs the heaviest synthesis profiles: it shares the UI thread. */
export function fallbackQuality(q: EngineQuality): EngineQuality {
  return q === 'low' || q === 'medium' ? q : 'medium';
}

const SCRIPT_BUFFER = 2048;

class WorkletDsp<M> implements DspNode<M> {
  readonly kind = 'worklet' as const;
  constructor(private readonly node: AudioWorkletNode) {}
  connect(dest: AudioNode, index = 0): void {
    this.node.connect(dest, index, 0);
  }
  post(msg: M): void {
    this.node.port.postMessage(msg);
  }
  dispose(): void {
    try {
      this.node.port.postMessage({ t: 'kill' });
    } catch {
      /* port already closed */
    }
    window.setTimeout(() => {
      try {
        this.node.disconnect();
        this.node.port.close();
      } catch {
        /* already gone */
      }
    }, 150);
  }
}

class ScriptDsp<M> implements DspNode<M> {
  readonly kind = 'script' as const;
  private readonly node: ScriptProcessorNode;
  private splitter: ChannelSplitterNode | null = null;
  private disposed = false;
  constructor(
    ctx: AudioContext,
    channels: number,
    private readonly render: (outs: Float32Array[], n: number) => void,
    private readonly handle: (m: M) => void,
  ) {
    this.node = ctx.createScriptProcessor(SCRIPT_BUFFER, 0, channels);
    const bufs: Float32Array[] = [];
    this.node.onaudioprocess = (e) => {
      if (this.disposed) return;
      bufs.length = 0;
      for (let c = 0; c < channels; c++) bufs.push(e.outputBuffer.getChannelData(c));
      this.render(bufs, e.outputBuffer.length);
    };
    if (channels > 2) this.splitter = ctx.createChannelSplitter(channels);
    if (this.splitter) this.node.connect(this.splitter);
  }
  connect(dest: AudioNode, index = 0): void {
    if (this.splitter) this.splitter.connect(dest, index, 0);
    else this.node.connect(dest);
  }
  post(msg: M): void {
    this.handle(msg);
  }
  dispose(): void {
    this.disposed = true;
    this.node.onaudioprocess = null;
    window.setTimeout(() => {
      try {
        this.node.disconnect();
        this.splitter?.disconnect();
      } catch {
        /* already gone */
      }
    }, 150);
  }
}

export type EngineNodeOptions = Omit<EngineHostOptions, 'sampleRate'>;

export function createEngineDsp(ctx: AudioContext, be: DspBackend, o: EngineNodeOptions): DspNode<EngineMsg> {
  if (be.workletReady) {
    const node = new AudioWorkletNode(ctx, 'race-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: o });
    return new WorkletDsp<EngineMsg>(node);
  }
  const host = new EngineHost({ ...o, quality: fallbackQuality(o.quality), sampleRate: ctx.sampleRate });
  return new ScriptDsp<EngineMsg>(ctx, 2, (outs, n) => host.render(outs[0], outs[1], 0, n), (m) => host.handle(m));
}

export type WorldMsg = { t: 'ctl'; c: Partial<WorldControls> } | { t: 'snap' };

export function createWorldDsp(ctx: AudioContext, be: DspBackend): DspNode<WorldMsg> {
  if (be.workletReady) {
    const node = new AudioWorkletNode(ctx, 'race-world', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    return new WorkletDsp<WorldMsg>(node);
  }
  const dsp = new WorldDSP(ctx.sampleRate);
  return new ScriptDsp<WorldMsg>(
    ctx,
    2,
    (outs, n) => dsp.process(outs[0], outs[1], 0, n),
    (m) => {
      if (m.t === 'snap') dsp.snap();
      else dsp.setControls(m.c);
    },
  );
}

export function createTrafficDsp(ctx: AudioContext, be: DspBackend, slots: number): DspNode<TrafficMsg> {
  if (be.workletReady) {
    const node = new AudioWorkletNode(ctx, 'race-traffic', {
      numberOfInputs: 0,
      numberOfOutputs: slots,
      outputChannelCount: new Array<number>(slots).fill(1),
      processorOptions: { slots },
    });
    return new WorkletDsp<TrafficMsg>(node);
  }
  const host = new TrafficHost(slots, ctx.sampleRate);
  return new ScriptDsp<TrafficMsg>(ctx, slots, (outs, n) => host.render(outs, n), (m) => host.handle(m));
}
