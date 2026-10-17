import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Loft, Mesher, chamferBox, endRound, loftPatch, ribbon } from '../../src/render/vehicle/kit';
import { superLoft } from '../../src/render/geom';

describe('vehicle kit', () => {
  it('chamferBox is a closed convex solid with outward winding', () => {
    const g = chamferBox(2, 1, 3, 0.2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    expect(p.count / 3).toBe(44);
    let vol = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < p.count; t += 3) {
      a.fromBufferAttribute(p, t);
      b.fromBufferAttribute(p, t + 1);
      c.fromBufferAttribute(p, t + 2);
      vol += a.dot(b.clone().cross(c)) / 6;
      const cen = a.clone().add(b).add(c).divideScalar(3);
      const nn = new THREE.Vector3().fromBufferAttribute(n, t);
      expect(cen.dot(nn)).toBeGreaterThan(0);
    }
    expect(vol).toBeGreaterThan(5);
    expect(vol).toBeLessThan(6);
  });

  it('endRound rounds a body end from the tip width to full width', () => {
    expect(endRound(0, 0.5, 0.7)).toBeCloseTo(0.7);
    expect(endRound(0.5, 0.5, 0.7)).toBeCloseTo(1);
    expect(endRound(0.1, 0.5, 0.7)).toBeGreaterThan(0.7);
    expect(endRound(0.1, 0.5, 0.7)).toBeLessThan(1);
  });

  it('Loft samples the same surface the superLoft mesh builds', () => {
    const st = [
      { z: -2, w: 1.4, yb: 0.2, yt: 0.7, n: 3 },
      { z: -0.5, w: 1.8, yb: 0.17, yt: 0.95, n: 3.3 },
      { z: 1, w: 1.8, yb: 0.17, yt: 0.97, n: 3.3 },
      { z: 2.2, w: 1.5, yb: 0.25, yt: 0.8, n: 3 },
    ];
    const loft = new Loft(st);
    const geo = superLoft(st, 40, 4);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    let maxErr = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i);
      if (Math.abs(v.x) < 1e-6 && v.z > -2 + 1e-4 && v.z < 2.2 - 1e-4) continue;
      // Each mesh vertex lies on the analytic surface: sideX(z, y) at its height equals |x| (flank half).
      const x = loft.sideX(v.z, v.y);
      if (x === null || v.y > 0.85) continue;
      maxErr = Math.max(maxErr, Math.abs(Math.abs(v.x) - x));
    }
    expect(maxErr).toBeLessThan(0.02);
  });

  it('Loft.normal points away from the body', () => {
    const loft = new Loft([
      { z: -2, w: 1.8, yb: 0.2, yt: 1, n: 3 },
      { z: 2, w: 1.8, yb: 0.2, yt: 1, n: 3 },
    ]);
    const side = loft.normal(0, 0);
    expect(side.x).toBeGreaterThan(0.9);
    const top = loft.normal(0, Math.PI / 2);
    expect(top.y).toBeGreaterThan(0.9);
    const p = loft.point(0, Math.PI / 2);
    expect(p.y).toBeCloseTo(1, 3);
  });

  it('loftPatch and ribbon produce outward-facing triangles', () => {
    const loft = new Loft([
      { z: -2, w: 1.8, yb: 0.2, yt: 1, n: 3 },
      { z: 2, w: 1.8, yb: 0.2, yt: 1, n: 3 },
    ]);
    const patch = loftPatch(loft, -1, 1, 1.2, 1.9, 4, 4, 0.01);
    const p = patch.attributes.position as THREE.BufferAttribute;
    const idx = patch.index!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(p, idx.getX(t));
      b.fromBufferAttribute(p, idx.getX(t + 1));
      c.fromBufferAttribute(p, idx.getX(t + 2));
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.y).toBeGreaterThan(0);
    }
    const pts = [new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 1)];
    const nr = pts.map(() => new THREE.Vector3(0, 1, 0));
    const r = ribbon(pts, nr, 0.1, 0);
    const rp = r.attributes.position as THREE.BufferAttribute;
    const ri = r.index!;
    for (let t = 0; t < ri.count; t += 3) {
      a.fromBufferAttribute(rp, ri.getX(t));
      b.fromBufferAttribute(rp, ri.getX(t + 1));
      c.fromBufferAttribute(rp, ri.getX(t + 2));
      expect(b.clone().sub(a).cross(c.clone().sub(a)).y).toBeGreaterThan(0);
    }
  });

  it('Mesher merges geometry with per-vertex attributes', () => {
    const m = new Mesher({ color: true, pbr: true, ch: true });
    m.add(new THREE.BoxGeometry(1, 1, 1), new THREE.Matrix4().makeTranslation(1, 0, 0), { color: '#ff0000', metal: 1, rough: 0.2, ch: 3 });
    m.add(chamferBox(1, 1, 1, 0.1), undefined, { ch: 1 });
    const g = m.build()!;
    expect(g.attributes.position.count).toBe(36 + 132);
    expect(g.attributes.pbr.count).toBe(g.attributes.position.count);
    expect(g.attributes.lampCh.getX(0)).toBe(3);
    expect(g.attributes.lampCh.getX(40)).toBe(1);
    expect(m.tris).toBe(12 + 44);
  });
});
