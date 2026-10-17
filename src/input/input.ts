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

export type MenuDir = 'up' | 'down' | 'left' | 'right';

/**
 * Menu navigation intents shared by keyboard and gamepad. `confirm` only comes from the pad:
 * Enter and Space already activate a focused button natively.
 */
export type MenuIntent =
  | { kind: 'move'; dir: MenuDir; source: 'key' | 'pad' }
  | { kind: 'confirm' }
  | { kind: 'back' }
  | { kind: 'tabPrev' }
  | { kind: 'tabNext' }
  | { kind: 'alt' }
  | { kind: 'alt2' }
  | { kind: 'start' };

/** True for elements that consume arrow keys / typing themselves. */
function ownsKeys(t: EventTarget | null, code: string): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLSelectElement) return code === 'ArrowUp' || code === 'ArrowDown' || code === 'Space' || code === 'Enter';
  if (t instanceof HTMLInputElement) {
    if (t.type === 'range') return code === 'ArrowLeft' || code === 'ArrowRight';
    if (t.type === 'color' || t.type === 'checkbox' || t.type === 'button') return false;
    return true;
  }
  return false;
}

const MENU_KEYS: Record<string, MenuIntent> = {
  ArrowUp: { kind: 'move', dir: 'up', source: 'key' },
  ArrowDown: { kind: 'move', dir: 'down', source: 'key' },
  ArrowLeft: { kind: 'move', dir: 'left', source: 'key' },
  ArrowRight: { kind: 'move', dir: 'right', source: 'key' },
  KeyW: { kind: 'move', dir: 'up', source: 'key' },
  KeyS: { kind: 'move', dir: 'down', source: 'key' },
  KeyA: { kind: 'move', dir: 'left', source: 'key' },
  KeyD: { kind: 'move', dir: 'right', source: 'key' },
  Escape: { kind: 'back' },
  Backspace: { kind: 'back' },
  KeyQ: { kind: 'tabPrev' },
  PageUp: { kind: 'tabPrev' },
  KeyE: { kind: 'tabNext' },
  PageDown: { kind: 'tabNext' },
};

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
  /** Menus are showing: arrow keys, Esc and the pad drive `pollMenu()` instead of the bike. */
  menuMode = false;
  /** Last device used in the menus ("keyboard" / "gamepad" show focus rings and button hints). */
  lastDevice: 'keyboard' | 'gamepad' | 'pointer' = 'pointer';
  private menuQueue: MenuIntent[] = [];
  private padMenuPrev: boolean[] = [];
  private stickDir: MenuDir | null = null;
  private stickTimer = 0;
  /** Scripted input for automated tests (overrides everything when set). */
  override: Partial<FrameInput> | null = null;
  private disposers: (() => void)[] = [];

  constructor(target: Window = window) {
    const down = (e: KeyboardEvent) => {
      if (this.menuMode) {
        this.menuKey(e);
        return;
      }
      if (e.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
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

  private menuKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.lastDevice = 'keyboard';
    const intent = MENU_KEYS[e.code];
    if (!intent || ownsKeys(e.target, e.code)) return;
    // Letters only navigate when no text field has focus (ownsKeys covers inputs); typing a search is unaffected.
    if (e.code === 'Backspace' && e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    this.menuQueue.push(intent);
  }

  /** Drain navigation intents from the keyboard and poll the gamepad (call once per frame while in menus). */
  pollMenu(dt: number): MenuIntent[] {
    const out = this.menuQueue;
    this.menuQueue = [];
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i: number) => p.buttons[i]?.pressed ?? false;
      const edge = (i: number) => b(i) && !(this.padMenuPrev[i] ?? false);
      let used = false;
      const dpad: [number, MenuDir][] = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']];
      for (const [i, dir] of dpad) {
        if (edge(i)) {
          out.push({ kind: 'move', dir, source: 'pad' });
          used = true;
        }
      }
      // Left stick with auto-repeat (long first delay, then quick steps).
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      let sd: MenuDir | null = null;
      if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.6) sd = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      if (sd !== this.stickDir) {
        this.stickDir = sd;
        this.stickTimer = 0.38;
        if (sd) {
          out.push({ kind: 'move', dir: sd, source: 'pad' });
          used = true;
        }
      } else if (sd) {
        this.stickTimer -= dt;
        if (this.stickTimer <= 0) {
          this.stickTimer = 0.11;
          out.push({ kind: 'move', dir: sd, source: 'pad' });
          used = true;
        }
      }
      if (edge(0)) out.push({ kind: 'confirm' }), (used = true);
      if (edge(1)) out.push({ kind: 'back' }), (used = true);
      if (edge(2)) out.push({ kind: 'alt' }), (used = true);
      if (edge(3)) out.push({ kind: 'alt2' }), (used = true);
      if (edge(4)) out.push({ kind: 'tabPrev' }), (used = true);
      if (edge(5)) out.push({ kind: 'tabNext' }), (used = true);
      if (edge(9)) out.push({ kind: 'start' }), (used = true);
      if (used) this.lastDevice = 'gamepad';
      this.padMenuPrev = p.buttons.map((x) => x.pressed);
      break;
    }
    return out;
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
