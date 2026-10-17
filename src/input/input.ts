import { approach, clamp } from '../core/math';
import type { RiderInput } from '../physics/bike';

export interface FrameInput extends RiderInput {
  camera: boolean;
  pause: boolean;
  horn: boolean;
  mute: boolean;
  debug: boolean;
  /** Held: turn the head over the shoulder to look at the traffic behind. */
  lookBack: boolean;
}

const THROTTLE = ['ArrowUp', 'KeyW'];
const BRAKE = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const WHEELIE = ['Space'];
const SHIFT_UP = ['KeyE'];
const SHIFT_DOWN = ['KeyQ'];
const LOOK_BACK = ['KeyB'];

/**
 * Unifies keyboard, touch buttons, device tilt and gamepads into analog rider
 * inputs. Digital inputs are ramped so the bike reacts like a human hand on
 * the bars rather than a switch.
 */
export class InputManager {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private touch = { throttle: 0, brake: 0, left: 0, right: 0, wheelie: false, lookBack: false };
  private touchEdges = { camera: false, pause: false, horn: false, shiftUp: false, shiftDown: false };
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private tiltGamma: number | null = null;
  private tiltZero = 0;
  private padPrev: boolean[] = [];
  sensitivity = 1;
  tiltEnabled = false;
  /** Scripted input for automated tests (overrides everything when set). */
  override: Partial<FrameInput> | null = null;
  /**
   * True while a ride is live. Only then are the arrow keys and Space swallowed (so a focused HUD button is
   * not clicked by the wheelie key); in the menus they keep their browser meaning: Space presses the focused
   * button, the arrows scroll the page and move sliders and drop-downs.
   */
  gameplay = false;
  private disposers: (() => void)[] = [];

  constructor(target: Window = window) {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.gameplay && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.pressed.add(e.code);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this.disposers.push(() => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    });
    const orient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      // Landscape phones: use beta for steering; portrait: gamma.
      const landscape = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
      const sign = (screen.orientation?.angle ?? 0) === 270 ? -1 : 1;
      this.tiltGamma = landscape ? e.beta * sign : e.gamma;
    };
    target.addEventListener('deviceorientation', orient);
    this.disposers.push(() => target.removeEventListener('deviceorientation', orient));
  }

  /** Request iOS motion permission (must be called from a user gesture). */
  async enableTilt(): Promise<boolean> {
    const DOE = (globalThis as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (DOE?.requestPermission) {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch {
      return false;
    }
    this.tiltEnabled = true;
    this.calibrateTilt();
    return true;
  }

  calibrateTilt(): void {
    this.tiltZero = this.tiltGamma ?? 0;
  }

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private edge(code: string): boolean {
    return this.pressed.has(code);
  }

  /** On-screen control hooks */
  setTouch(part: 'throttle' | 'brake' | 'left' | 'right', v: number): void {
    this.touch[part] = clamp(v, 0, 1);
  }
  setTouchWheelie(on: boolean): void {
    this.touch.wheelie = on;
  }
  /** Hold-to-look-back button (touch / on-screen). */
  setTouchLookBack(on: boolean): void {
    this.touch.lookBack = on;
  }
  touchEdge(kind: 'camera' | 'pause' | 'horn' | 'shiftUp' | 'shiftDown'): void {
    this.touchEdges[kind] = true;
  }

  get hasTouchSteer(): boolean {
    return this.touch.left > 0 || this.touch.right > 0;
  }

  reset(): void {
    this.steer = this.throttle = this.brake = 0;
    this.keys.clear();
    this.pressed.clear();
    this.touch = { throttle: 0, brake: 0, left: 0, right: 0, wheelie: false, lookBack: false };
  }

  update(dt: number): FrameInput {
    // Keyboard targets
    let steerT = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    let thrT = this.any(THROTTLE) ? 1 : 0;
    let brkT = this.any(BRAKE) ? 1 : 0;
    let wheelie = this.any(WHEELIE);
    let lookBack = this.any(LOOK_BACK);
    let shiftUp = SHIFT_UP.some((c) => this.edge(c));
    let shiftDown = SHIFT_DOWN.some((c) => this.edge(c));
    let camera = this.edge('KeyC');
    let pause = this.edge('Escape') || this.edge('KeyP');
    let horn = this.edge('KeyH');
    const mute = this.edge('KeyM');
    const debug = this.edge('Backquote');

    // Touch
    steerT += this.touch.right - this.touch.left;
    thrT = Math.max(thrT, this.touch.throttle);
    brkT = Math.max(brkT, this.touch.brake);
    wheelie ||= this.touch.wheelie;
    lookBack ||= this.touch.lookBack;
    camera ||= this.touchEdges.camera;
    pause ||= this.touchEdges.pause;
    horn ||= this.touchEdges.horn;
    shiftUp ||= this.touchEdges.shiftUp;
    shiftDown ||= this.touchEdges.shiftDown;

    // Gamepad (standard mapping)
    let analogSteer: number | null = null;
    let analogThr: number | null = null;
    let analogBrk: number | null = null;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) analogSteer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88);
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      if (rt > 0.02) analogThr = rt;
      if (lt > 0.02) analogBrk = lt;
      const b = (i: number) => p.buttons[i]?.pressed ?? false;
      const was = (i: number) => this.padPrev[i] ?? false;
      wheelie ||= b(0);
      lookBack ||= b(10) || b(11);
      if (b(5) && !was(5)) shiftUp = true;
      if (b(4) && !was(4)) shiftDown = true;
      if (b(3) && !was(3)) camera = true;
      if (b(9) && !was(9)) pause = true;
      if (b(1) && !was(1)) horn = true;
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }

    // Tilt steering
    if (this.tiltEnabled && this.tiltGamma !== null && !this.hasTouchSteer) {
      const t = (this.tiltGamma - this.tiltZero) / 22;
      analogSteer = clamp(Math.abs(t) < 0.06 ? 0 : t, -1, 1);
    }

    steerT = clamp(steerT, -1, 1);
    if (analogSteer !== null) {
      this.steer = analogSteer;
    } else {
      // Human-like ramp: quick in, quicker out.
      const rate = steerT === 0 ? 7 : Math.sign(steerT) !== Math.sign(this.steer) && this.steer !== 0 ? 9 : 4.2;
      this.steer = approach(this.steer, steerT, rate * dt);
    }
    this.throttle = analogThr !== null ? analogThr : approach(this.throttle, thrT, (thrT > this.throttle ? 6 : 10) * dt);
    this.brake = analogBrk !== null ? analogBrk : approach(this.brake, brkT, (brkT > this.brake ? 7 : 12) * dt);

    this.pressed.clear();
    this.touchEdges = { camera: false, pause: false, horn: false, shiftUp: false, shiftDown: false };

    const out: FrameInput = {
      throttle: this.throttle,
      brake: this.brake,
      steer: clamp(this.steer * this.sensitivity, -1, 1),
      wheelie,
      shiftUp,
      shiftDown,
      camera,
      pause,
      horn,
      mute,
      debug,
      lookBack,
    };
    if (this.override) Object.assign(out, this.override);
    return out;
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
