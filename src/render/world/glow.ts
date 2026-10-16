import * as THREE from 'three';
import { glowTexture } from '../textures';

let stub: THREE.Texture | null = null;

/** The shared soft glow sprite; a 1×1 white stand-in where there is no DOM (unit tests). */
export function softGlow(): THREE.Texture {
  if (typeof document !== 'undefined') return glowTexture();
  if (!stub) {
    stub = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    stub.needsUpdate = true;
  }
  return stub;
}
