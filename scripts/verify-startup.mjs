// Exercise startup failure paths against the actual offline delivery bundle.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const source = await readFile(new URL('../轮回地牢.html', import.meta.url), 'utf8');
const key = (await readFile(new URL('../src/save.ts', import.meta.url), 'utf8')).match(
  /export const SAVE_KEY = '([^']+)'/,
)[1];
// Hold two equipment images: the full catalogue must be ready before admission.
const manifest = JSON.parse(
  await readFile(new URL('../dist/asset-manifest.json', import.meta.url), 'utf8'),
);
// This harness stubs images and deliberately has no WebAudio implementation.
manifest.assets = manifest.assets.filter((asset) => asset.url.endsWith('.png'));
const heldURLs = new Set(
  await Promise.all(
    ['M-0-', 'M-A2-'].map(async (prefix) => {
      const asset = manifest.assets.find((a) => a.url.split('/').at(-1).startsWith(prefix));
      return (
        'data:image/png;base64,' +
        (await readFile(new URL('../dist/' + asset.url.slice(2), import.meta.url))).toString(
          'base64',
        )
      );
    }),
  ),
);
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
async function boot(entries = [], failedAttempts = 0, holdImages = false) {
  const win = new Window({ url: 'http://localhost/' });
  for (const [k, v] of entries) win.localStorage.setItem(k, v);
  win.document.body.innerHTML = source;
  const loads = new Map();
  const pending = [];
  let remainingFailures = failedAttempts,
    failingURL;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    requestAnimationFrame: () => 0,
    getComputedStyle: win.getComputedStyle.bind(win),
    Image: class {
      naturalWidth = 128;
      naturalHeight = 192;
      set src(url) {
        if (holdImages && heldURLs.has(url)) {
          pending.push(() => {
            loads.set(url, 1);
            this.onload?.();
          });
          return;
        }
        queueMicrotask(() => {
          if (!failingURL && remainingFailures > 0) failingURL = url;
          if (url === failingURL && remainingFailures > 0) {
            remainingFailures--;
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
  if (holdImages) {
    for (let n = 0; n < 150; n++) {
      if (pending.length + loads.size === manifest.assets.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } else await settle(win);
  return { win, loads, pending };
}

const staged = await boot([], false, true);
try {
  assert.equal(!!staged.win.document.getElementById('startup-loading'), true);
  assert.equal(staged.win.document.getElementById('app').hidden, true);
  assert.equal(
    staged.win.localStorage.getItem(key),
    null,
    'no admission/save before all images are ready',
  );
  assert.equal(staged.pending.length, heldURLs.size);
  assert.equal(staged.loads.size, manifest.assets.length - heldURLs.size);
  assert.ok(
    Number(staged.win.document.getElementById('loading-percent').textContent.replace('%', '')) <
      100,
  );
  staged.pending.forEach((done) => done());
  await settle(staged.win);
  assert.equal(!!staged.win.document.getElementById('startup-loading'), false);
  assert.equal(staged.loads.size, manifest.assets.length);
  staged.win.document.querySelector('[data-action="library"]').click();
  assert.match(staged.win.document.getElementById('guild-feature-screen').textContent, /公会典籍/);
  assert.equal(
    !!staged.win.document.getElementById('resource-wait')?.open,
    false,
    'page switching does not reopen loading',
  );
} finally {
  await staged.win.happyDOM.close();
}

const transient = await boot([], 1);
try {
  assert.equal(
    transient.win.document.getElementById('startup-loading'),
    null,
    'a single network interruption recovers without a manual retry',
  );
  assert.equal(transient.loads.size, manifest.assets.length);
} finally {
  await transient.win.happyDOM.close();
}

const retry = await boot([], 2);
let valid;
try {
  const { win, loads } = retry;
  assert.match(win.document.getElementById('loading-status').textContent, /启动失败/);
  assert.match(win.document.getElementById('loading-status').textContent, /1项资源未完成/);
  assert.match(win.document.getElementById('loading-detail').textContent, /未完成1项/);
  assert.equal(win.localStorage.getItem(key), null, 'resource failure must not create a save');
  assert.equal(win.document.getElementById('app').hidden, true);
  assert.ok(
    Number(win.document.getElementById('loading-percent').textContent.replace('%', '')) < 100,
  );
  win.document.getElementById('loading-retry').click();
  await settle(win);
  assert.equal(win.document.getElementById('startup-loading'), null);
  assert.ok(win.document.querySelector('.guild-art'));
  assert.equal(loads.size, manifest.assets.length, 'retry prepares the full resource list');
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
  'Offline startup verified: full catalogue before admission, immediate page switching, failure/retry/cache, corrupt-save preservation and backup recovery.',
);
