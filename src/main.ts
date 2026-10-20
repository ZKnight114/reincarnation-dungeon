import { Game, createState } from './game';
import { loadSave, parseSave, SAVE_KEY } from './save';
import { UI } from './ui';
import {
  finishLoading,
  loadingError,
  loadingProgress,
  preloadAssets,
  loadingBackground,
} from './loading';
import { startupAssets } from './assets';
import { registerCharacterParts } from './character-parts';
import { initializeAssetCache } from './asset-cache';
import { initialHomeView, visibleAssets } from './resource-plan';
import type { GameState } from './types';

// Styles intentionally build on earlier layers; preserve this cascade order.
import './style.css';
import './pack.css';
import './v9.css';
import './journey.css';
import './v10.css';
import './v11.css';
import './v14.css';
import './guild-pixel.css';
import './v15.css';
import './v15-update.css';
import './guild-tree.css';
import './ui-library.css';
import './motion.css';
import './playtest.css';
import './six-updates.css';
import './pending-updates.css';
import './adventure-v16.css';
import './recycle.css';
import './dialogs.css';
import './expedition.css';
import './battle-portraits.css';
import './combat-layout.css';
import './viewport.css';
import './identity-marks.css';
import './resource-loading.css';

let started = false,
  busy = false;
clearTimeout((window as unknown as { guildBootTimeout: number }).guildBootTimeout);
function launch(state: GameState | null) {
  if (started) return;
  let game = new Game(state ?? undefined);
  const ui = new UI(game, (state) => {
    game = new Game(state);
    ui.replace(game);
  });
  ui.persist();
  started = true;
  loadingProgress(1, 1, '准备进入');
  finishLoading();
  // Background failures are retried only when their page is opened, never block play.
  void preloadAssets(() => {}, startupAssets(), 'background')
    .then(registerCharacterParts)
    .catch(() => {});
  let previous = performance.now(),
    uiTime = 0;
  function frame(now: number) {
    const delta = Math.min(0.25, Math.max(0, (now - previous) / 1000));
    previous = now;
    if (!document.hidden) {
      const revision = game.state.revision;
      const phase = game.state.phase;
      const wasCombat = game.state.phase === 'combat';
      // Never burst several visible sources into one frame after a slow render.
      if (!ui.holdingJourney && !ui.holdingCombat)
        game.update(delta * game.state.speed, game.skippingCombat() ? Infinity : 1);
      // Persist automatic reveals before presenting them, including rolled supplies and victory recovery.
      if (game.state.run.routeRevision === 16 && phase !== game.state.phase) ui.persist();
      uiTime += delta;
      if (
        (wasCombat && revision !== game.state.revision) ||
        uiTime >= (game.state.phase === 'combat' ? 0.05 : 0.1)
      ) {
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
}
function recovery(error: unknown) {
  const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('recursion-dungeon-save-v14');
  if (raw)
    try {
      localStorage.setItem(SAVE_KEY + '-recovery-' + Date.now(), raw);
    } catch {}
  const panel = document.getElementById('loading-recovery')!;
  panel.hidden = false;
  panel.replaceChildren();
  const detail = document.createElement('p');
  detail.textContent =
    '进度无法读取，原始存档已保留。' + (error instanceof Error ? error.message : '数据无效');
  panel.append(detail);
  const add = (label: string, click: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = click;
    panel.append(b);
  };
  if (raw)
    add('导出原始存档', () => {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = '公会-原始存档.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const backups = Array.from({ length: localStorage.length }, (_, n) => localStorage.key(n)!)
    .filter((k) => k.startsWith(SAVE_KEY + '-'))
    .sort((a, b) => {
      // Rolling backup 1 is newest. Prefer current snapshots over pre-update archives.
      const priority = (key: string) => {
        const match = key.match(/-backup-([1-3])$/);
        return match ? Number(match[1]) : key.includes('-before-') ? 4 : 5;
      };
      return priority(a) - priority(b) || b.localeCompare(a);
    });
  for (const key of backups) {
    try {
      const s = parseSave(localStorage.getItem(key)!);
      add(`恢复备份 · ${s.run.chapter}关 · ${s.meta.heroes.length}名勇者`, () => launch(s));
      break;
    } catch {}
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.setAttribute('aria-label', '导入存档恢复');
  input.onchange = async () => {
    try {
      const file = input.files?.[0];
      if (file) launch(parseSave(await file.text()));
    } catch (e) {
      detail.textContent = '导入失败：' + (e instanceof Error ? e.message : String(e));
    }
  };
  panel.append(input);
  add('开启新公会（保留旧存档备份）', () => launch(null));
  loadingError('存档读取失败，请恢复进度', () => {
    panel.hidden = true;
    void boot();
  });
}
async function boot() {
  if (busy || started) return;
  busy = true;
  try {
    const cssMissing = [
      ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    ].some((link) => !link.sheet);
    if (cssMissing) {
      loadingError('界面样式加载失败，请重试', () => location.reload());
      return;
    }
    loadingProgress(0, 1, '读取进度');
    let state: GameState;
    let saveError: unknown;
    try {
      state = loadSave() ?? createState();
    } catch (e) {
      saveError = e;
      state = createState();
    }
    await initializeAssetCache();
    const critical = visibleAssets(state, initialHomeView(state));
    const count = critical.length;
    await preloadAssets(
      (done, total) => loadingProgress(done, total + 1, `准备当前页面 ${done}/${total}`),
      critical,
    );
    loadingBackground();
    registerCharacterParts();
    if (saveError) {
      recovery(saveError);
      return;
    }
    loadingProgress(count, count + 1, '准备进入');
    launch(state);
  } catch (e) {
    loadingError('启动失败：' + (e instanceof Error ? e.message : String(e)), () => void boot());
  } finally {
    busy = false;
  }
}
void boot();
