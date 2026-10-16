// Exercise startup failure paths against the actual offline delivery bundle.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const source = await readFile(new URL('../轮回地牢.html', import.meta.url), 'utf8');
const key = 'recursion-dungeon-save-v15';
async function settle(win) {
  for (let n = 0; n < 150; n++) {
    if (
      !win.document.getElementById('startup-loading') ||
      !win.document.getElementById('loading-retry').hidden
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Startup never reached a completed or recoverable state');
}
async function boot(entries = [], failFirst = false) {
  const win = new Window({ url: 'http://localhost/' });
  for (const [k, v] of entries) win.localStorage.setItem(k, v);
  win.document.body.innerHTML = source;
  const loads = new Map();
  let fail = failFirst;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    requestAnimationFrame: () => 0,
    getComputedStyle: win.getComputedStyle.bind(win),
    Image: class {
      set src(url) {
        queueMicrotask(() => {
          if (fail) {
            fail = false;
            this.onerror?.();
            return;
          }
          loads.set(url, (loads.get(url) ?? 0) + 1);
          this.onload?.();
        });
      }
      decode() {
        return Promise.resolve();
      }
    },
  });
  new Function(win.document.querySelector('script[type="module"]:not([src])').textContent)();
  await settle(win);
  return { win, loads };
}

const retry = await boot([], true);
let valid;
try {
  const { win, loads } = retry;
  assert.match(win.document.getElementById('loading-status').textContent, /启动失败/);
  assert.equal(win.localStorage.getItem(key), null, 'resource failure must not create a save');
  assert.equal(win.document.getElementById('app').hidden, true);
  assert.ok(
    Number(win.document.getElementById('loading-percent').textContent.replace('%', '')) < 100,
  );
  win.document.getElementById('loading-retry').click();
  await settle(win);
  assert.equal(win.document.getElementById('startup-loading'), null);
  assert.ok(win.document.querySelector('.guild-art'));
  assert.ok(loads.size >= 30, 'retry loads the real resource list');
  assert.ok(
    [...loads.values()].every((n) => n === 1),
    'retry reuses already decoded assets',
  );
  valid = win.localStorage.getItem(key);
} finally {
  await retry.win.happyDOM.close();
}

const broken = '{deliberately invalid save';
const older = JSON.parse(valid);
older.meta.gold = 999;
const recovery = await boot([
  [key, broken],
  [key + '-backup-1', valid],
  [key + '-backup-3', JSON.stringify(older)],
]);
try {
  const { win } = recovery;
  assert.equal(
    win.localStorage.getItem(key),
    broken,
    'failed reading must not overwrite the original',
  );
  assert.equal(win.document.getElementById('app').hidden, true);
  assert.equal(win.document.getElementById('loading-recovery').hidden, false);
  const buttons = [...win.document.querySelectorAll('#loading-recovery button')];
  assert.ok(buttons.some((b) => b.textContent === '导出原始存档'));
  assert.ok(buttons.some((b) => b.textContent.startsWith('开启新公会')));
  buttons.find((b) => b.textContent.startsWith('恢复备份')).click();
  assert.equal(win.document.getElementById('startup-loading'), null);
  assert.equal(JSON.parse(win.localStorage.getItem(key)).phase, 'home');
  assert.equal(
    JSON.parse(win.localStorage.getItem(key)).meta.gold,
    JSON.parse(valid).meta.gold,
    'restore the newest valid rolling backup',
  );
  assert.ok(
    Array.from({ length: win.localStorage.length }, (_, n) => win.localStorage.key(n)).some(
      (k) => k.startsWith(key + '-recovery-') && win.localStorage.getItem(k) === broken,
    ),
  );
} finally {
  await recovery.win.happyDOM.close();
}
console.log(
  'Offline startup verified: real resource progress, failure/retry/cache, corrupt-save preservation and backup recovery.',
);
