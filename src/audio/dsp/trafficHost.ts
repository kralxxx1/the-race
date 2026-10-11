import type { VehicleEngineType } from './params';
import { VEHICLE_VOICES, VehicleDSP } from './vehicleDsp';

export type TrafficMsg =
  /** (Re)assign voice slot `i` to a vehicle. `on: false` fades the slot out. */
  | { t: 'cfg'; i: number; type: VehicleEngineType; seed: number; on: boolean }
  | { t: 'ctl'; i: number; speed: number; load: number; doppler: number; dist: number; brake: number };

/**
 * Fixed pool of cheap traffic engine voices, one mono output per slot (each output feeds its own
 * PannerNode on the main thread). Pure TypeScript, shared by the worklet and the fallback.
 */
export class TrafficHost {
  private readonly voices: (VehicleDSP | null)[];
  private readonly types: (VehicleEngineType | null)[];

  constructor(
    readonly slots: number,
    private readonly sampleRate: number,
  ) {
    this.voices = new Array<VehicleDSP | null>(slots).fill(null);
    this.types = new Array<VehicleEngineType | null>(slots).fill(null);
  }

  handle(m: TrafficMsg): void {
    if (m.i < 0 || m.i >= this.slots) return;
    if (m.t === 'cfg') {
      if (!m.on) {
        this.voices[m.i]?.setActive(false);
        return;
      }
      const params = { ...VEHICLE_VOICES[m.type], seed: m.seed };
      let v = this.voices[m.i];
      if (!v) {
        v = new VehicleDSP(params, this.sampleRate);
        this.voices[m.i] = v;
      } else v.configure(params);
      this.types[m.i] = m.type;
    } else {
      this.voices[m.i]?.setControls(m.speed, m.load, m.doppler, m.dist, m.brake);
    }
  }

  /** Render every audible slot into `outs[slot]` (silence for idle slots). */
  render(outs: Float32Array[], n: number): void {
    for (let i = 0; i < this.slots; i++) {
      const out = outs[i];
      if (!out) continue;
      const v = this.voices[i];
      if (v && v.audible) v.process(out, 0, n);
      else out.fill(0, 0, n);
    }
  }
}
