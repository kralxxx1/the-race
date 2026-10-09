import './styles.css';
import { Game } from './game/game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;
if (!webglAvailable()) {
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = 'Bu oyun WebGL gerektirir. Lütfen donanım hızlandırmayı açın veya güncel bir tarayıcı kullanın.';
  app.append(msg);
} else {
  const game = new Game(app);
  game.start();
  // Exposed for automated end-to-end tests and debugging from the console.
  (window as unknown as { __THE_RACE__: unknown }).__THE_RACE__ = game.debugApi();
}
