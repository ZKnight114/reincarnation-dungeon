import { advanceCamp } from './helpers';
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, ENERGY_INTERVAL } from '../src/game';
import { UI } from '../src/ui';
import { loadSave } from '../src/save';
import { cells } from '../src/backpack';
import { positionEvent, start, add } from './helpers';
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
  game = start();
  ui = new UI(game, (s) => {
    game = new Game(s);
    ui.replace(game);
  });
});
afterEach(() => win.happyDOM.close());
const el = (q: string) => {
  const e = win.document.querySelector(q);
  assert.ok(e, q);
  return e;
};
const click = (q: string) => el(q).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
test('stage elite gifts all drops inline and opens mandatory resonance; four slots persist and highlight matched equipment', () => {
  positionEvent(game, 'elite');
  const gold = game.state.meta.gold,
    hp = game.state.player.hp,
    count = game.state.inventory.length;
  game.state.enemy!.hp = 0;
  game.update(0.05);
  game.finishAwakening();
  ui.render();
  assert.equal(win.document.querySelectorAll('#field-items .offer').length, 3);
  assert.equal(game.state.inventory.length, count + 3);
  assert.equal(win.document.querySelector('[data-action="skip-reward"]'), null);
  assert.equal((el('#decision-sheet') as any).open, true);
  const key = game.state.run.rewards[0].resonances[0];
  click(`[data-resonance="${key}"]`);
  assert.equal(game.state.run.resonances.length, 2);
  assert.equal(game.state.meta.gold, gold);
  assert.ok(game.state.player.hp >= hp);
  assert.deepEqual(loadSave()!.run.resonances, game.state.run.resonances);
  assert.equal(win.document.querySelectorAll('.resonance-slot').length, 4);
  assert.equal(win.document.querySelectorAll('.resonance-slot.empty').length, 2);
  click(`[data-inspect-resonance="${key}"]`);
  assert.ok(win.document.querySelector('.pack-piece.resonant'));
});
test('all four merge grades change tint, equipment artwork remains one piece and footprint remains fixed', () => {
  const item = game.state.inventory.find((i) => i.templateId === 'warrior_guard_2')!,
    styles = new Set<string>(),
    paints = new Set<string>(),
    shape = cells(item);
  for (let level = 1; level <= 4; level++) {
    ui.render();
    styles.add(el(`.pack-piece[data-pack-item="${item.id}"]`).getAttribute('style')!);
    paints.add(el(`.pack-piece[data-pack-item="${item.id}"] .item-painting`).innerHTML);
    if (level < 4) {
      const donor = add(game, item.templateId, level);
      assert.equal(game.mergeItems(donor.id, item.id), null);
    }
    assert.deepEqual(cells(item), shape);
  }
  assert.equal(styles.size, 4);
  assert.equal(paints.size, 1);
  assert.equal(item.quality, 'purple');
});
test('jobs have distinct art and descriptions, neutral gem contributes profession points', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const) {
    game = start(p);
    ui.replace(game);
    assert.equal(el('.pack-piece .item-painting').getAttribute('data-profession'), p);
    const gem = game.state.inventory.find((i) => i.branch === 'neutral')!;
    click(`[data-pack-item="${gem.id}"]`);
    assert.match(el('#equipment-detail').textContent, /贡献标签/);
    assert.match(el('#equipment-detail').textContent, /贡献标签.*1 点/);
    click('#equipment-detail [data-pack-action="close"]');
  }
});
test('guild roster displays fixed hero power and details after a failed run', () => {
  const trainee = game.state.run.trainee!;
  game.retreat();
  ui.render();
  assert.match(el('#summary-screen').textContent, /成长仍会留下|战力/);
  assert.equal(game.state.meta.heroes.length, 1);
  click('[data-action="selection"]');
  assert.equal(game.state.phase, 'home');
  assert.match(el('#guild-roster').textContent, new RegExp(trainee.name));
  click(`[data-hero="${trainee.id}"]`);
  assert.match(el('#modal-body').textContent, /战力来源|已经定型/);
  assert.equal(loadSave()!.meta.heroes.length, 1);
});
test('random recruitment becomes a fixed-profession dossier and energy recovery updates the same screen', () => {
  game = new Game();
  game.state.meta.energy.value = 4;
  game.enterChapters();
  ui.replace(game);
  assert.equal((el('[data-action="recruit"]') as any).disabled, true);
  game.state.meta.energy.updatedAt = Date.now() - ENERGY_INTERVAL;
  ui.render();
  assert.equal((el('[data-action="recruit"]') as any).disabled, false);
  click('[data-action="recruit"]');
  assert.equal(game.state.phase, 'configure');
  assert.equal(game.state.meta.energy.value, 0);
  const profession = game.state.run.profession;
  assert.equal(win.document.querySelectorAll('.talent-badge').length, 4);
  assert.equal(win.document.querySelectorAll('.attribute-row').length, 4);
  assert.equal((el('[data-action="confirm-allocation"]') as any).disabled, true);
  click('[data-action="balance-allocation"]');
  click('[data-action="confirm-allocation"]');
  if (!game.state.run.trainee?.tomeId) {
    game.confirmAllocation();
    game.selectTome(
      (
        {
          warrior: 'warrior_sword_tome',
          mage: 'mage_flame_tome',
          rogue: 'rogue_poison_tome',
        } as const
      )[game.state.run.profession],
    );
    ui.render();
  }
  click('[data-action="start"]');
  assert.equal(game.state.run.profession, profession);
  assert.equal(game.state.meta.energy.value, 0);
  assert.equal(game.state.meta.gold, 100);
});
test('recruit countdown frames retain the same button so a held touch is not interrupted', () => {
  game = new Game();
  game.state.meta.energy.value = 4;
  game.enterChapters();
  game.chooseChapter(1);
  ui.replace(game);
  const button = el('[data-action="recruit"]');
  ui.render();
  assert.equal(el('[data-action="recruit"]'), button);
  game.state.meta.energy.updatedAt = Date.now() - ENERGY_INTERVAL;
  ui.render();
  assert.equal(el('[data-action="recruit"]'), button);
  assert.equal((button as any).disabled, false);
});
test('normal fight has three already-owned inline drops, no choice sheet and no automatic conversion', () => {
  advanceCamp(game);
  const count = game.state.inventory.length;
  game.state.enemy!.hp = 0;
  game.update(0.05);
  game.finishAwakening();
  ui.render();
  assert.equal(game.state.phase, 'camp');
  assert.equal(game.state.inventory.length, count + 3);
  assert.equal(game.state.run.points, 0);
  assert.equal(win.document.querySelectorAll('#field-items .offer').length, 3);
  assert.equal((el('#decision-sheet') as any).open, false);
  assert.equal(win.document.querySelector('[data-action="skip-reward"]'), null);
  assert.equal(win.document.querySelector('[data-reward]'), null);
  assert.deepEqual(loadSave()?.inventory ?? [], []);
  ui.persist();
  assert.equal(loadSave()!.inventory.length, count + 3);
});
