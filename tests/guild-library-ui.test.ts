import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { GUILD_LAYOUT } from '../src/guild-ui';
import { GUILD_NODES } from '../src/guild';
import { TOMES } from '../src/progression';
import { loadSave } from '../src/save';

let win: Window, game: Game, ui: UI;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
  game = new Game(undefined, () => 0.25);
  ui = new UI(game, () => {});
});
afterEach(() => win.happyDOM.close());
const el = (selector: string) => {
  const node = win.document.querySelector(selector);
  assert.ok(node, selector);
  return node;
};
const click = (selector: string) =>
  el(selector).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

test('book shelf is a full page; filtered secondary details preserve the shelf and collection', () => {
  click('.guild-progress-controls [data-action="library"]');
  assert.equal((el('#home-screen') as any).hidden, true);
  assert.equal((el('#guild-nav') as any).hidden, true);
  assert.equal(win.document.querySelectorAll('.library-book').length, 9);
  click('[data-library-filter="mage"]');
  assert.equal(win.document.querySelectorAll('.library-book').length, 3);
  const shelf = el('#guild-feature-screen'),
    book = el('[data-inspect-tome="mage_flame_tome"]');
  click('[data-inspect-tome="mage_flame_tome"]');
  assert.equal((el('#modal') as any).open, true);
  assert.equal(el('#guild-feature-screen'), shelf);
  assert.equal(
    el('[data-inspect-tome="mage_flame_tome"]'),
    book,
    'details retain the original shelf controls, including their live feedback',
  );
  click('[data-tome-rank="3"]');
  assert.match(el('.tome-detail-body').textContent, /3阶效果/);
  assert.doesNotMatch(el('.tome-detail').textContent, /构筑配合/);
  click('.detail-close');
  assert.equal((el('#modal') as any).open, false);
  assert.equal(win.document.querySelectorAll('.library-book').length, 3);
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 0);
});

test('upgrade updates real currency, current rank and visible shelf without opening a replacement list', () => {
  game.state.meta.tomes.mage_flame_tome = { level: 1, pages: 3 };
  game.state.meta.gold = 860;
  game.state.revision++;
  ui.render();
  click('.guild-progress-controls [data-action="library"]');
  click('[data-inspect-tome="mage_flame_tome"]');
  click('[data-tome-rank="3"]');
  click('[data-upgrade-tome="mage_flame_tome"]');
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 2);
  assert.equal(game.state.meta.tomes.mage_flame_tome.pages, 0);
  assert.equal(game.state.meta.gold, 660);
  assert.match(el('.tome-detail-body').textContent, /2阶效果/);
  assert.match(
    el('.library-book[data-inspect-tome="mage_flame_tome"]').textContent,
    /2阶 · 残页 0/,
  );
  assert.equal((el('[data-upgrade-tome="mage_flame_tome"]') as any).disabled, true);
  assert.equal(loadSave()!.meta.tomes.mage_flame_tome.level, 2);
});

test('sequential guild purchases retain scroll, reject locked nodes and preserve position across total dialog', () => {
  game.state.meta.guildLevel = 5;
  game.state.meta.medals = 84;
  game.state.meta.guildPurchased = 13;
  game.state.revision++;
  ui.render();
  click('.guild-progress-controls [data-action="guild-tree"]');
  assert.equal(win.document.querySelectorAll('.guild-route-node').length, 94);
  const scroll = el('.guild-route-scroll');
  scroll.scrollTop = 2400;
  click('[data-action="guild-node-14"]');
  assert.equal((el('[data-action="guild-buy-14"]') as any).disabled, true);
  assert.equal(game.state.meta.guildPurchased, 13);
  click('[data-action="guild-node-13"]');
  click('[data-action="guild-buy-13"]');
  assert.equal(game.state.meta.guildPurchased, 14);
  assert.equal(game.state.meta.medals, 72);
  assert.equal(el('.guild-route-scroll').scrollTop, 2400);
  assert.equal(win.document.querySelector('.guild-route-footer strong'), null);
  click('[data-action="guild-total"]');
  click('#modal [data-action="guild-tree"]');
  assert.equal(el('.guild-route-scroll').scrollTop, 2400);
  assert.equal((el('#modal') as any).open, false);
});

test('rank preview during recruitment cannot spend currency or consume the free unlock', () => {
  game.enterChapters();
  game.recruit('warrior');
  game.balanceAllocation();
  game.confirmAllocation();
  game.selectTome('mage_flame_tome');
  ui.render();
  click('.tome-equipped');
  click('[data-tome-rank="3"]');
  assert.equal(win.document.querySelector('[data-upgrade-tome]'), null);
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 0);
  assert.equal(game.state.run.trainee!.tomeLevel, 1);
  assert.deepEqual(game.state.meta.tomeGifts, []);
  click('.detail-close');
  click('[data-action="start"]');
  assert.deepEqual(game.state.run.boundTome, { id: 'mage_flame_tome', level: 1 });
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 1);
});

test('route artwork maps every sequential node to a unique position and all formal tome assets exist', () => {
  assert.equal(GUILD_LAYOUT.positions.length, GUILD_NODES.length);
  assert.equal(new Set(GUILD_LAYOUT.positions.map((p) => `${p.x}:${p.y}`)).size, 94);
  for (let i = 1; i < 94; i++)
    assert.ok(GUILD_LAYOUT.positions[i].y <= GUILD_LAYOUT.positions[i - 1].y);
  const manifest = JSON.parse(
    readFileSync(new URL('../src/assets/library.json', import.meta.url), 'utf8'),
  );
  for (const entry of manifest.entries)
    assert.ok(existsSync(new URL('../' + entry.path, import.meta.url)), entry.path);
  for (const book of TOMES)
    assert.ok(manifest.entries.find((asset: { id: string }) => asset.id === 'tomes/' + book.id));
});
