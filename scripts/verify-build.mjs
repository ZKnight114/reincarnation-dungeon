import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
const source = await readFile(new URL('../轮回地牢.html', import.meta.url), 'utf8');
// The footprint catalogue is data-only; read the exact approved geometry without a TS runtime.
const catalogueSource = await readFile(new URL('../src/catalogue.ts', import.meta.url), 'utf8');
const catalogue = new Function(
  catalogueSource.replace('export const CATALOGUE =', 'return').replace('} as const;', '};'),
)();
assert.doesNotMatch(source, /@font-face|data:font\/|data:application\/font/i);

// Check both delivery formats: the web bundle references separate PNGs,
// while the single-file edition contains their exact embedded bytes.
const webHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const webScript = webHtml.match(/<script[^>]*src="([^"]+)"/)?.[1];
assert.ok(webScript);
const webScriptFile = new URL('../dist/' + webScript.replace(/^\.\//, ''), import.meta.url);
const webCode = await readFile(webScriptFile, 'utf8');
const manifest = JSON.parse(
  await readFile(new URL('../dist/asset-manifest.json', import.meta.url), 'utf8'),
);
assert.ok(manifest.assets.length >= 30);
for (const asset of manifest.assets) {
  const bytes = await readFile(
    new URL('../dist/' + asset.url.replace(/^\.\//, ''), import.meta.url),
  );
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash, asset.url);
  assert.equal(bytes.length, asset.size, asset.url);
}
const packaged = [];
for (const pack of manifest.packs ?? []) {
  const bytes = await readFile(new URL('../dist/' + pack.url.slice(2), import.meta.url));
  assert.equal(bytes.length, pack.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pack.hash);
  for (const entry of pack.assets) {
    const part = bytes.subarray(entry.offset, entry.offset + entry.size);
    assert.equal(createHash('sha256').update(part).digest('hex'), entry.hash);
    packaged.push(entry.url);
  }
}
assert.deepEqual(
  packaged.sort(),
  manifest.assets.map((asset) => asset.url).sort(),
  'Cold packages must contain the complete runtime media catalogue',
);
const worker = await readFile(new URL('../dist/asset-worker.js', import.meta.url), 'utf8');
assert.ok(worker.includes(manifest.revision));
assert.ok(!worker.includes('__ASSET_MANIFEST__'));
assert.doesNotMatch(webCode, /data:image\/png;base64/);
const spriteReferences = [
  ...webCode.matchAll(/new URL\("([^"\s]+\.png)",import\.meta\.url\)\.href/g),
];
assert.ok(spriteReferences.length >= 30, 'Web build must include the complete sprite catalogue');
for (const [, name] of spriteReferences) {
  const bytes = await readFile(new URL(name, webScriptFile));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
  assert.ok(source.includes('data:image/png;base64,' + bytes.toString('base64')), name);
}
const audioReferences = [
  ...webCode.matchAll(/new URL\("([^"\s]+\.(?:mp3|wav))",import\.meta\.url\)\.href/g),
];
assert.equal(audioReferences.length, 25, 'All exploration audio must ship in both formats');
for (const [, name] of audioReferences) {
  const bytes = await readFile(new URL(name, webScriptFile));
  const mime = name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
  assert.ok(source.includes('data:' + mime + ';base64,' + bytes.toString('base64')), name);
  assert.ok(
    manifest.assets.some((asset) => asset.url.endsWith(name.slice(2))),
    name,
  );
}
assert.doesNotMatch(source, /new URL\([^)]*,import\.meta\.url\)\.href/);

const win = new Window({ url: 'http://localhost/' }),
  realNow = Date.now;
let now = realNow(),
  frameCallback = null,
  frameTime = performance.now();
Date.now = () => now;
try {
  win.localStorage.setItem('recursion-dungeon-save-v8', 'old');
  win.localStorage.setItem('recursion-dungeon-save-v7', 'old');
  win.localStorage.setItem('recursion-dungeon-save-v1-recovery', 'old');
  win.localStorage.setItem('other-game', 'keep');
  win.document.body.innerHTML = source;
  for (const element of win.document.querySelectorAll('script[src],link[href],img[src]')) {
    const url = element.getAttribute('src') ?? element.getAttribute('href');
    assert.ok(url?.startsWith('data:'), `Unexpected external resource: ${url}`);
  }
  for (const style of win.document.querySelectorAll('style'))
    for (const [, url] of style.textContent.matchAll(/url\(['"]?([^)'"\s]+)/g))
      assert.ok(url.startsWith('data:'), 'Offline CSS must embed ' + url);
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    requestAnimationFrame: (callback) => {
      frameCallback = callback;
      return 1;
    },
    getComputedStyle: win.getComputedStyle.bind(win),
    // happy-dom does not decode raster assets; the real-browser check covers decoding.
    Image: class {
      naturalWidth = 128;
      naturalHeight = 192;
      set src(_url) {
        queueMicrotask(() => this.onload?.());
      }
      decode() {
        return Promise.resolve();
      }
    },
  });
  const inline = win.document.querySelector('script[type="module"]:not([src])');
  assert.ok(inline);
  new Function(inline.textContent)();
  for (let n = 0; n < 100 && win.document.getElementById('startup-loading'); n++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    win.document.getElementById('startup-loading'),
    null,
    'Offline Loading must complete before game controls appear',
  );
  const saveKey = (await readFile(new URL('../src/save.ts', import.meta.url), 'utf8')).match(
    /export const SAVE_KEY = '([^']+)'/,
  )[1];
  const save = () => JSON.parse(win.localStorage.getItem(saveKey));
  const click = (q) => {
    now += 500;
    const el = win.document.querySelector(q);
    assert.ok(el, q);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };
  const playbackUntil = (phase) => {
    for (let n = 0; n < 100 && save().phase !== phase; n++) {
      now += 100;
      frameTime += 100;
      frameCallback(frameTime);
      const manual = win.document.querySelector('[data-action="continue-resonance"]');
      if (manual && !manual.disabled) click('[data-action="continue-resonance"]');
    }
    assert.equal(save().phase, phase);
  };
  assert.equal(save().version, 15);
  assert.equal(save().phase, 'home');
  assert.ok(win.document.querySelector('.guild-art'));
  assert.equal(save().meta.energy.value, 60);
  assert.equal(save().meta.heroes.length, 0);
  assert.equal(win.localStorage.getItem('recursion-dungeon-save-v8'), null);
  assert.equal(win.localStorage.getItem('recursion-dungeon-save-v7'), null);
  assert.equal(win.localStorage.getItem('recursion-dungeon-save-v1-recovery'), null);
  assert.equal(win.localStorage.getItem('other-game'), 'keep');
  click('[data-action="chapters"]');
  assert.equal(save().phase, 'chapter');
  assert.equal(win.document.querySelectorAll('.dungeon-carousel').length, 1);
  assert.equal(win.document.querySelector('.chapter-grid'), null);
  click('[data-recruit-mode="targeted"]');
  assert.equal(win.document.querySelectorAll('.profession-targets button').length, 3);
  click('.profession-targets [data-profession="warrior"]');
  click('[data-action="recruit"]');
  assert.equal(save().meta.energy.value, 40);
  assert.equal(save().phase, 'configure');
  assert.equal(
    win.getComputedStyle(win.document.querySelector('.admission-file')).display,
    'flex',
    'Bundled configuration must use the final content-row layout',
  );
  assert.equal(win.document.querySelectorAll('.talent-badge').length, 4);
  assert.equal(win.document.querySelectorAll('.attribute-row').length, 4);
  click('[data-action="balance-allocation"]');
  assert.equal(save().run.trainee.allocation.speed, 3);
  click('[data-action="confirm-allocation"]');
  assert.equal(save().phase, 'tome');
  click('[data-tome="warrior_sword_tome"]');
  click('[data-action="start"]');
  assert.equal(save().phase, 'journey');
  assert.equal(save().run.prologue, 'departure');
  playbackUntil('opening');
  assert.equal(save().phase, 'opening');
  const gridStyle = win.getComputedStyle(win.document.getElementById('pack-grid'));
  assert.equal(gridStyle.width, '327px');
  assert.equal(gridStyle.height, '280px');
  assert.equal(gridStyle.gap, '2px');
  assert.equal(win.document.querySelectorAll('.pack-cell.open').length, 15);
  assert.equal(win.document.querySelector('#field-items button'), null);
  const plan = save().run.starterPlan;
  assert.equal(plan.flat().length, 6);
  click('[data-action="claim-starters"]');
  assert.deepEqual(
    save().run.starterOffers.map((i) => i.templateId),
    plan[1],
  );
  click('[data-action="claim-starters"]');
  assert.equal(save().inventory.length, 6);
  const items = save().inventory.sort(
    (a, b) =>
      Number(b.slot === 'weapon' && catalogue[b.templateId].cells.length === 2) -
      Number(a.slot === 'weapon' && catalogue[a.templateId].cells.length === 2),
  );
  for (const item of items) {
    const occupied = new Set(
      save().draft.flatMap((p) =>
        catalogue[save().inventory.find((i) => i.id === p.id).templateId].cells.map(
          ([x, y]) => `${x + p.x},${y + p.y}`,
        ),
      ),
    );
    const points = catalogue[item.templateId].cells;
    let at;
    const open = new Set(
      [...win.document.querySelectorAll('.pack-cell.open')].map((el) => el.dataset.packCell),
    );
    for (let y = 0; y < 6 && !at; y++)
      for (let x = 0; x < 7; x++)
        if (
          points.every(
            ([dx, dy]) => open.has(`${x + dx},${y + dy}`) && !occupied.has(`${x + dx},${y + dy}`),
          )
        ) {
          at = [x, y];
          break;
        }
    if (!at) continue; // Keeping only the equipment that fits is a legal player decision.
    now += 500;
    win.document.getElementById('pack-grid').getBoundingClientRect = () => ({
      left: 0,
      top: 100,
      right: 327,
      bottom: 380,
      width: 327,
      height: 280,
    });
    const [x, y] = at,
      root = win.document.getElementById('adventure-screen'),
      target = win.document.querySelector(`[data-pack-item="${item.id}"]`);
    target.dispatchEvent(
      new win.PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        button: 0,
        clientX: 30,
        clientY: 30,
      }),
    );
    for (const type of ['pointermove', 'pointerup'])
      root.dispatchEvent(
        new win.PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          clientX: x * 47 + 22.5,
          clientY: 100 + y * 47 + 22.5,
        }),
      );
  }
  assert.ok(save().draft.length > 0 && save().draft.length <= 6);
  assert.equal(win.document.querySelectorAll('.pack-piece').length, save().draft.length);
  assert.equal(win.document.querySelectorAll('.pack-cell').length, 42);
  click('[data-action="finish-opening"]');
  // A legal starter layout can leave equipment unplaced. Allow its reclaim
  // animation and point settlement to finish before the resonance step.
  playbackUntil('initial');
  for (let n = 0; n < 100 && !win.document.querySelector('[data-resonance]'); n++) {
    now += 100;
    frameTime += 100;
    frameCallback(frameTime);
  }
  assert.equal(win.document.querySelectorAll('[data-resonance]').length, 3);
  click('[data-resonance]');
  assert.equal(save().run.prologue, 'ready');
  playbackUntil('journey');
  assert.equal(save().run.resonances.length, 1);
  for (let n = 0; n < 100 && save().run.prologue === 'ready'; n++) {
    now += 100;
    frameTime += 100;
    frameCallback(frameTime);
    const next = win.document.querySelector('[data-action="continue-resonance"]');
    if (next && !next.disabled) click('[data-action="continue-resonance"]');
  }
  assert.equal(save().phase, 'journey');
  assert.equal(save().run.prologue, undefined);
  assert.equal(win.document.getElementById('view-pack').hidden, true);
  assert.equal(win.document.querySelector('#decision-sheet').open, false);
  assert.ok(win.document.getElementById('journey-history').textContent.trim());
  assert.equal(win.document.querySelector('[data-action="continue-story"]').disabled, true);
  for (let n = 0; n < 80 && !win.document.querySelector('[data-action="skip-combat"]'); n++) {
    now += 100;
    frameTime += 100;
    frameCallback(frameTime);
  }
  assert.ok(
    win.document.querySelector('[data-action="skip-combat"]'),
    'Playback must automatically enter combat',
  );
  // Explicit UI actions persist the live state; return the speed to 1x after checking it.
  for (let n = 0; n < 3; n++) click('[data-action="cycle-speed"]');
  assert.equal(save().phase, 'combat');
  assert.ok(win.document.querySelector('.battle-scene'));
  assert.equal(win.document.querySelectorAll('.resonance-slot').length, 4);
  assert.equal(win.document.querySelector('#stash-items'), null);
  assert.equal(win.document.querySelector('[data-action="combat-tools"]'), null);
  assert.equal(win.document.querySelector('[data-action="pause"]'), null);
  click('[data-action="skip-combat"]');
  assert.equal(save().combat.skip, true);
  assert.equal(save().skipCombat, false);
  assert.ok(win.document.querySelector('#turn-order').textContent.includes('回合'));
  click('[data-action="cycle-speed"]');
  assert.equal(save().speed, 2);
  assert.equal(save().isRunning, true);
  console.log(
    `Standalone v16 combat3 guild → chapter carousel → targeted recruitment → four talents and allocation → six shape gifts with touch drags → initial resonance → discrete combat passed (${Math.round(Buffer.byteLength(source) / 1024)} KB).`,
  );
} finally {
  Date.now = realNow;
  await win.happyDOM.close();
}
