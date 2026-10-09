import * as THREE from 'three';
import { carbonTexture } from './textures';

/** Shared PBR material library. Materials are cached and reused by key. */
export class Materials {
  private cache = new Map<string, THREE.Material>();
  envMap: THREE.Texture | null = null;

  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  /** Automotive paint: metallic flake base under a glossy clear coat. */
  paint(color: string, metallic = 0.45): THREE.MeshPhysicalMaterial {
    return this.get(`paint:${color}:${metallic}`, () => {
      const m = new THREE.MeshPhysicalMaterial({
        color,
        metalness: metallic,
        roughness: 0.38,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.1,
      });
      return m;
    });
  }

  /** Mirror-like dark chrome (Kawasaki H2 style). */
  mirrorPaint(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`mirror:${color}`, () =>
      new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }),
    );
  }

  matte(color: string, roughness = 0.75): THREE.MeshStandardMaterial {
    return this.get(`matte:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 }));
  }

  plastic(color = '#121316'): THREE.MeshStandardMaterial {
    return this.get(`plastic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 }));
  }

  metal(color = '#b9bec5', roughness = 0.32): THREE.MeshStandardMaterial {
    return this.get(`metal:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 }));
  }

  chrome(): THREE.MeshStandardMaterial {
    return this.get('chrome', () => new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.06, metalness: 1, envMapIntensity: 1.4 }));
  }

  titanium(): THREE.MeshStandardMaterial {
    return this.get('titanium', () => new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.28, metalness: 1 }));
  }

  gold(): THREE.MeshStandardMaterial {
    return this.get('gold', () => new THREE.MeshStandardMaterial({ color: '#c9962b', roughness: 0.25, metalness: 1 }));
  }

  carbon(): THREE.MeshPhysicalMaterial {
    return this.get('carbon', () =>
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: carbonTexture(), roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
  }

  rubber(): THREE.MeshStandardMaterial {
    return this.get('rubber', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, metalness: 0 }));
  }

  leather(color: string): THREE.MeshStandardMaterial {
    return this.get(`leather:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 }));
  }

  /** Rider leathers: slightly glossy. */
  suit(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`suit:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.05, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }));
  }

  helmet(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`helmet:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }));
  }

  visor(): THREE.MeshPhysicalMaterial {
    return this.get('visor', () =>
      new THREE.MeshPhysicalMaterial({ color: '#0b0d12', roughness: 0.04, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.8, iridescence: 0.6, iridescenceIOR: 1.6 }),
    );
  }

  glass(tint = '#1c2430', opacity = 0.55): THREE.MeshPhysicalMaterial {
    return this.get(`glass:${tint}:${opacity}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: 0.03,
        metalness: 0.1,
        transparent: true,
        opacity,
        envMapIntensity: 1.6,
        depthWrite: false,
      }),
    );
  }

  /** Light-emitting lens; intensity can be animated per instance by cloning. */
  light(color: string, intensity: number): THREE.MeshStandardMaterial {
    return this.get(`light:${color}:${intensity}`, () => this.makeLight(color, intensity));
  }

  makeLight(color: string, intensity: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: '#111111',
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.2,
      metalness: 0,
    });
  }

  tyreTread(): THREE.MeshStandardMaterial {
    return this.rubber();
  }
}
