// Developer tool: records every geometry the renderer draws and every dispose,
// so leaks can be traced to the object that owned them.
import * as THREE from 'three';
import '../src/styles.css';
import { Game } from '../src/game/game';

const seen = new Map<number, { type: string; path: string; disposed: boolean; run: number; shared: boolean; verts: number }>();
let run = 0;
(window as unknown as { __RUN__: (n: number) => void }).__RUN__ = (n) => (run = n);
const pathOf = (o: THREE.Object3D) => {
  const parts: string[] = [];
  let p: THREE.Object3D | null = o;
  while (p && parts.length < 5) {
    parts.push(p.name || p.type);
    p = p.parent;
  }
  return parts.join(' < ');
};
const hook = function (this: THREE.Object3D & { geometry: THREE.BufferGeometry }) {
  const g = this.geometry;
  if (g && !seen.has(g.id)) seen.set(g.id, { type: g.type, path: pathOf(this), disposed: false, run, shared: !!g.userData.shared, verts: g.attributes.position?.count ?? 0 });
};
THREE.Mesh.prototype.onBeforeRender = hook;
THREE.Points.prototype.onBeforeRender = hook;
THREE.LineSegments.prototype.onBeforeRender = hook;
const origDispose = THREE.BufferGeometry.prototype.dispose;
THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry) {
  const r = seen.get(this.id);
  if (r) r.disposed = true;
  return origDispose.call(this);
};
const game = new Game(document.getElementById('app')!);
game.start();
(window as unknown as { __THE_RACE__: unknown }).__THE_RACE__ = game.debugApi();
(window as unknown as { __LEAKS__: () => unknown }).__LEAKS__ = () => {
  const live = [...seen.entries()].filter(([, v]) => !v.disposed);
  const groups = new Map<string, number>();
  for (const [, v] of live) {
    const k = `run${v.run} ${v.shared ? 'SHARED' : 'own'} ${v.type}(${v.verts}) @ ${v.path}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  return { live: live.length, groups: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40) };
};
