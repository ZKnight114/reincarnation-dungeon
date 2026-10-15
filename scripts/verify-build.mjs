import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
const source = await readFile(new URL('../轮回地牢.html', import.meta.url), 'utf8');
assert.doesNotMatch(source, /@font-face|data:font\/|data:application\/font/i);

// Check both delivery formats: the web bundle references separate PNGs,
// while the single-file edition contains their exact embedded bytes.
const webHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const webScript = webHtml.match(/<script[^>]*src="([^"]+)"/)?.[1];
assert.ok(webScript);
const webScriptFile = new URL('../dist/' + webScript.replace(/^\.\//, ''), import.meta.url);
const webCode = await readFile(webScriptFile, 'utf8');
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
assert.doesNotMatch(source, /new URL\([^)]*,import\.meta\.url\)\.href/);

const win = new Window({ url: 'http://localhost/' }),
  realNow = Date.now;
let now = realNow();
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
    assert.doesNotMatch(style.textContent, /url\(\s*["']?(?!data:)/i);
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    requestAnimationFrame: () => 0,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  const inline = win.document.querySelector('script:not([src])');
  assert.ok(inline);
  new Function(inline.textContent)();
  const save = () => JSON.parse(win.localStorage.getItem('recursion-dungeon-save-v14'));
  const click = (q) => {
    now += 500;
    const el = win.document.querySelector(q);
    assert.ok(el, q);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };
  assert.equal(save().version, 14);
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
  assert.equal(win.document.querySelectorAll('.talent-badge').length, 4);
  assert.equal(win.document.querySelectorAll('.attribute-row').length, 4);
  click('[data-action="balance-allocation"]');
  assert.equal(save().run.trainee.allocation.speed, 3);
  click('[data-action="start"]');
  assert.equal(save().phase, 'opening');
  assert.equal(win.document.querySelector('#field-items button'), null);
  const positions = [
    [1, 1],
    [2, 1],
    [4, 1],
    [5, 1],
    [2, 2],
    [3, 2],
  ];
  for (let n = 0; n < 2; n++) {
    click('[data-action="claim-starters"]');
    const loose = save().inventory.filter((i) => !save().draft.some((p) => p.id === i.id));
    assert.equal(loose.length, 3);
    for (const item of loose) {
      now += 500;
      win.document.getElementById('pack-grid').getBoundingClientRect = () => ({
        left: 0,
        top: 100,
        right: 420,
        bottom: 460,
        width: 420,
        height: 360,
      });
      const [x, y] = positions[Number(item.id.slice(5)) - 1],
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
            clientX: x * 60 + 30,
            clientY: 100 + y * 60 + 30,
          }),
        );
    }
  }
  assert.equal(save().inventory.length, 6);
  assert.equal(win.document.querySelectorAll('.pack-piece').length, 6);
  assert.equal(win.document.querySelectorAll('.item-outline').length, 6);
  assert.equal(win.document.querySelectorAll('.pack-cell').length, 42);
  click('[data-action="finish-opening"]');
  assert.equal(save().phase, 'initial');
  assert.equal(win.document.querySelectorAll('[data-resonance]').length, 3);
  click('[data-resonance]');
  assert.equal(save().phase, 'camp');
  assert.equal(save().run.resonances.length, 1);
  click('[data-action="continue"]');
  assert.equal(save().phase, 'journey');
  assert.equal(win.document.getElementById('view-pack').hidden, true);
  assert.equal(win.document.querySelector('#decision-sheet').open, false);
  assert.ok(win.document.getElementById('journey-history').textContent.trim());
  click('[data-action="continue-story"]');
  assert.equal(save().phase, 'combat');
  assert.ok(win.document.querySelector('.battle-scene'));
  assert.equal(win.document.querySelectorAll('.resonance-slot').length, 4);
  assert.equal(win.document.querySelector('#stash-items'), null);
  click('[data-action="combat-tools"]');
  click('[data-action="pause"]');
  assert.equal(save().isRunning, false);
  assert.ok(win.document.querySelector('#turn-order').textContent.includes('回合'));
  click('[data-action="step-turn"]');
  assert.equal(save().combat.actionIndex, 1);
  assert.equal(save().combat.lastActor, 'hero');
  assert.equal(save().combat.round, 1);
  assert.equal(save().isRunning, false);
  console.log(
    `Standalone v14 guild → chapter carousel → targeted recruitment → four talents and allocation → six shape gifts with touch drags → initial resonance → discrete combat passed (${Math.round(Buffer.byteLength(source) / 1024)} KB).`,
  );
} finally {
  Date.now = realNow;
  await win.happyDOM.close();
}
