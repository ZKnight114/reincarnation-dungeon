import { Game } from './game';
import { cleanLegacyData, loadSave, SAVE_KEY } from './save';
import { UI } from './ui';
import './style.css';
import './pack.css';
import './v9.css';
import './journey.css';
import './v10.css';
import './v11.css';
import './v14.css';
import './guild-pixel.css';

let game: Game,
  loadError = false;
try {
  cleanLegacyData();
  game = new Game(loadSave() ?? undefined);
} catch {
  game = new Game();
  loadError = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}
const ui = new UI(game, (state) => {
  game = new Game(state);
  ui.replace(game);
});
if (loadError) ui.toast('存档不可用，已开启新的旅程');
ui.persist();
let previous = performance.now(),
  uiTime = 0;
function frame(now: number) {
  const delta = Math.min(0.25, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (!document.hidden) {
    game.update(delta * game.state.speed);
    uiTime += delta;
    if (uiTime >= 0.1) {
      ui.render();
      uiTime = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.setInterval(() => {
  if (!document.hidden) ui.persist();
}, 10_000);
document.addEventListener('visibilitychange', () => {
  previous = performance.now();
  if (document.hidden) ui.persist();
  else ui.render();
});
window.addEventListener('pagehide', () => ui.persist());
