import * as THREE from 'three';
import { glowTexture } from '../textures';
import { lampGeometry, lampHeadMaterial, type LampStyle } from './props';
import type { ChunkBuild } from './scenery';

/**
 * Street-lamp family for a map: instanced poles, emissive heads, additive light pools on the road and
 * bloom glows for the GlowPoints system. Pools, heads and glows only cost anything at night
 * (`env.scenery.lightsOn`); by day the poles stand dark and cast no pools.
 */

export interface LampKitOptions {
  style: LampStyle;
  /** Max lamps per chunk. */
  max: number;
  /** Glow colour of the light (linear rgb) and size. */
  glow: [number, number, number, number];
  /** Pool tint (before additive blend). */
  pool: string;
}

export interface LampDefiner {
  prop: (key: string, g: THREE.BufferGeometry, m: THREE.Material, o: { max: number; shadow?: boolean; renderOrder?: number }) => void;
  adopt: <T extends THREE.Material>(m: T) => T;
}

export class LampKit {
  readonly poleKey: string;
  readonly headKey: string;
  readonly poolKey: string;
  private reach: number;
  private lightH: number;
  private on: boolean;

  /** `define` is the owning scenery's registration callbacks (its helpers are protected). */
  constructor(
    define: LampDefiner,
    private opts: LampKitOptions,
    plain: THREE.Material,
    lightsOn: boolean,
  ) {
    const parts = lampGeometry(opts.style);
    this.poleKey = `lamp:${opts.style}`;
    this.headKey = `lamphead:${opts.style}`;
    this.poolKey = `pool:${opts.style}`;
    this.reach = -parts.lightAt[0];
    this.lightH = parts.lightAt[1];
    this.on = lightsOn;
    define.prop(this.poleKey, parts.pole, plain, { max: opts.max, shadow: true });
    define.prop(this.headKey, parts.head, define.adopt(lampHeadMaterial(lightsOn)), { max: opts.max });
    if (lightsOn) {
      const g = new THREE.PlaneGeometry(parts.pool[0], parts.pool[1]);
      g.rotateX(-Math.PI / 2);
      const m = define.adopt(
        new THREE.MeshBasicMaterial({
          map: glowTexture(),
          color: new THREE.Color(opts.pool).multiplyScalar(0.55),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
      define.prop(this.poolKey, g, m, { max: opts.max, renderOrder: 2 });
    }
  }

  /** Place one lamp at road distance s on `side` (±1), `off` metres outside the paved edge. */
  place(ctx: ChunkBuild, s: number, side: 1 | -1, off: number): void {
    const d = side * (ctx.host.half + off);
    const yaw = side > 0 ? 0 : Math.PI;
    ctx.put(this.poleKey, s, d, { yaw }, true);
    ctx.put(this.headKey, s, d, { yaw }, true);
    if (!this.on) return;
    const lampD = d - side * this.reach;
    ctx.put(this.poolKey, s, lampD * 0.9, { y: ctx.host.road.height(s) + 0.06, yaw: 0 }, true);
    const [r, g, b, size] = this.opts.glow;
    ctx.glow(s, lampD, this.lightH + (ctx.groundY(s, d) - ctx.host.road.height(s)), r, g, b, size);
  }
}
