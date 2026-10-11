import type { Renderer } from './renderer';

/**
 * Performance overlay (setting `gfx.perfOverlay`): FPS, frame-time graph, draw
 * calls, triangles, GPU name and the resolution scale. DOM only; it samples the
 * renderer's own frame statistics, so it costs nothing while hidden.
 */
export class PerfOverlay {
  private root: HTMLDivElement;
  private text: HTMLPreElement;
  private graph: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private shown: 'off' | 'fps' | 'full' = 'off';
  private nextText = 0;
  private samples: number[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'perf-overlay');
    this.root.style.cssText = 'position:fixed;top:8px;left:8px;z-index:50;pointer-events:none;display:none;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d8f5d0;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;min-width:150px;text-shadow:0 1px 1px #000';
    this.text = document.createElement('pre');
    this.text.style.cssText = 'margin:0;white-space:pre';
    this.graph = document.createElement('canvas');
    this.graph.width = 150;
    this.graph.height = 36;
    this.graph.style.cssText = 'display:block;margin-top:4px;width:150px;height:36px';
    this.g = this.graph.getContext('2d');
    this.root.append(this.text, this.graph);
    parent.append(this.root);
  }

  update(r: Renderer, mode: 'off' | 'fps' | 'full', now: number): void {
    if (mode !== this.shown) {
      this.shown = mode;
      this.root.style.display = mode === 'off' ? 'none' : 'block';
      this.graph.style.display = mode === 'full' ? 'block' : 'none';
    }
    if (mode === 'off') return;
    if (mode === 'full') this.drawGraph(r);
    if (now < this.nextText) return;
    this.nextText = now + 250;
    const s = r.stats;
    const fps = s.fps.toFixed(0).padStart(3);
    if (mode === 'fps') {
      this.text.textContent = `${fps} FPS`;
      return;
    }
    const i = r.info();
    const p = r.postActive ? r.pipeline.plan : null;
    const res = p ? `${p.width}×${p.height}` : `${r.canvas.width}×${r.canvas.height}`;
    this.text.textContent = [
      `${fps} FPS   ${s.frameMs.toFixed(1)} ms (en kötü ${s.worstMs.toFixed(0)})`,
      `çizim ${i.calls}   üçgen ${(i.triangles / 1000).toFixed(0)}k`,
      `geometri ${i.geometries}  doku ${i.textures}`,
      `çözünürlük ${res} (%${Math.round(r.resolutionScale * 100)})`,
      p ? `hat: ${r.pipeline.lastPasses.join(' › ')}` : 'hat: doğrudan çizim',
      `GPU ${r.gpuName.slice(0, 44)}`,
    ].join('\n');
  }

  private drawGraph(r: Renderer): void {
    const g = this.g;
    if (!g) return;
    const w = this.graph.width;
    const h = this.graph.height;
    g.clearRect(0, 0, w, h);
    const s = this.samples;
    r.stats.ordered(s);
    const budget = 1000 / (r.profile.targetFps || 60);
    const max = budget * 3;
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(0, h - (budget / max) * h, w, 1);
    const n = s.length;
    for (let k = 0; k < n; k++) {
      const v = Math.min(s[k], max);
      const bh = (v / max) * h;
      g.fillStyle = s[k] > budget * 1.5 ? '#ff6b5e' : s[k] > budget * 1.05 ? '#ffd166' : '#7be07b';
      g.fillRect(w - (n - k) * (w / 120), h - bh, Math.max(1, w / 120 - 0.5), bh);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
