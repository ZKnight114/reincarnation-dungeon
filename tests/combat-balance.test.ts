import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { itemSkills, resonanceSkills, tomeSkills } from '../src/skills';
import { applyTalentSources } from '../src/talents';
import { parseSave } from '../src/save';
import { start, positionEvent, setPlayer } from './helpers';
import { generateEnemy } from '../src/enemies';
import { tomePreviewText } from '../src/guild-ui';
import { itemProposal } from '../src/item-rules';
import { statusRows } from '../src/battle-status';
import type { Source } from '../src/skill-types';

const item = (actions: Source['skills'][number]['actions']): Source => ({
  id: 'item-1',
  name: '物品',
  kind: 'item',
  profession: 'warrior',
  family: 'sword',
  skills: [{ cooldown: 1, actions }],
});
const resonance = (id: string, profession: Source['profession'] = 'warrior'): Source => ({
  id: 'resonance:' + id,
  name: id,
  kind: 'resonance',
  profession,
  skills: resonanceSkills(id, 1),
});
const model = (sources: Source[]) =>
  battleRuntime(
    fighter({ hp: 1000, attack: 100, defense: 0, speed: 15 }, 'warrior', 500),
    fighter({ hp: 10000, attack: 120, defense: 0, speed: 10 }, 'warrior'),
    sources,
    'reference',
  );
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('periodic shields shrink without reducing attacks, opening shields or emergency rescue', () => {
  const r = model([
    item([
      { kind: 'damage', a: 1 },
      { kind: 'shield', h: 0.1 },
    ]),
    resonance('warrior_shield_1'),
    resonance('warrior_shield_3'),
  ]);
  const e = new BattleEngine(r, 1);
  e.opening();
  near(r.hero.shield, 20);
  e.heroTurn();
  near(r.hero.shield, 85);
  near(r.enemy.hp, 9900);
  e.enemyTurn();
  near(r.hero.hp, 465);
  near(r.hero.shield, 40);
});

test('native and passive shield reserves both cap at 30%, while enemy shield generation stays unchanged', () => {
  const r = model([item([{ kind: 'shield', h: 1 }])]);
  new BattleEngine(r, 1).heroTurn();
  near(r.hero.shield, 300);
  const p = model([resonance('warrior_guard_1'), resonance('warrior_shield_1')]);
  p.hero.shield = 295;
  new BattleEngine(p, 1).opening();
  near(p.hero.shield, 300);
  const slime = model([]);
  slime.enemyId = 'slime';
  slime.enemyActions = 2;
  new BattleEngine(slime, 1).enemyTurn();
  near(slime.enemy.shield, 400);
});

test('enemy attacks can exhaust a periodic shield and begin actual life attrition', () => {
  const r = model([item([{ kind: 'shield', h: 0.1 }])]);
  const e = new BattleEngine(r, 1);
  for (let n = 1; n <= 4; n++) {
    e.round = n;
    e.heroTurn();
    e.enemyTurn();
  }
  near(r.hero.shield, 0);
  near(r.hero.hp, 280);
});

test('profession damage reaches passive followups and DOT exactly once, mastery stays native-only', () => {
  const r = model(
    applyTalentSources(
      [item([{ kind: 'damage', a: 1 }]), resonance('warrior_sword_1')],
      ['warrior_soul:blue', 'sword_mastery:gold'],
    ),
  );
  new BattleEngine(r, 1, () => {}, true).heroTurn();
  near(10000 - r.enemy.hp, 120 + 5.25);
  const burn = model(
    applyTalentSources(
      [
        {
          ...item([
            { kind: 'damage', a: 1, type: 'magic' },
            { kind: 'status', status: 'burn', a: 0.1, duration: 2 },
          ]),
          profession: 'mage',
        },
      ],
      ['mage_soul:gold'],
    ),
  );
  const e = new BattleEngine(burn, 1, () => {}, true);
  e.heroTurn();
  e.enemyTurn();
  near(10000 - burn.enemy.hp, 112 + 11.2);
});

test('profession shield bonus reaches a passive but talent reflection is never damage-amplified', () => {
  const r = model(
    applyTalentSources(
      [
        { ...item([{ kind: 'damage', a: 1, type: 'magic' }]), profession: 'mage' },
        resonance('mage_book_1', 'mage'),
      ],
      ['mage_soul:gold'],
    ),
  );
  new BattleEngine(r, 1, () => {}, true).heroTurn();
  near(r.hero.shield, 6.48);
  const reflect = model(applyTalentSources([item([])], ['warrior_soul:gold']));
  new BattleEngine(reflect, 1, () => {}, true).enemyTurn();
  near(10000 - reflect.enemy.hp, 9.6);
});

test('DOT talent bonuses stay inside the shared strength cap without changing saved status values', () => {
  const r = model([
    { ...item([]), talentDamage: 0.12 },
    { ...resonance('rogue_poison_1', 'rogue'), talentDamage: 0.12 },
  ]);
  r.enemy.statuses = [
    { kind: 'poison', source: 'item-1', value: 30, remaining: 2 },
    { kind: 'poison', source: 'resonance:rogue_poison_1', value: 30, remaining: 2 },
  ];
  const g = start();
  g.state.combat.runtime = r;
  const row = statusRows(g.state, 'enemy').find((x) => x.kind === 'poison')!;
  assert.match(row.value, /40／次行动/);
  assert.match(row.detail!, /33.6 点强度/);
  new BattleEngine(r, 1, () => {}, true).enemyTurn();
  // The passive's separate 2%A followup is outside DOT, but also receives its profession bonus.
  near(10000 - r.enemy.hp, 40 + 2.24);
  assert.deepEqual(
    r.enemy.statuses.map((s) => s.value),
    [30, 30],
  );
  const low = model([{ ...resonance('passive-dot'), talentDamage: 0.12 }]);
  low.enemy.statuses = [{ kind: 'burn', source: 'resonance:passive-dot', value: 10, remaining: 2 }];
  new BattleEngine(low, 1, () => {}, true).enemyTurn();
  near(10000 - low.enemy.hp, 11.2);
});

test('current combat3 saves lower an existing shield reserve without losing progress or accepting forged shields', () => {
  const g = start();
  positionEvent(g, 'battle');
  setPlayer(g, { shield: g.state.player.maxHp * 0.45 });
  const raw = JSON.stringify(g.state),
    restored = parseSave(raw);
  near(restored.player.shield, restored.player.maxHp * 0.3);
  near(restored.combat.runtime!.hero.shield, restored.player.shield);
  assert.equal(restored.run.index, g.state.run.index);
  assert.deepEqual(restored.combat.runtime!.sources, g.state.combat.runtime!.sources);
  setPlayer(g, { shield: g.state.player.maxHp * 0.6 });
  assert.throws(() => parseSave(JSON.stringify(g.state)));
});

test('fixed encounters ignore player growth, current life and guild purchases', () => {
  const g = start();
  g.state.run.chapter = 1;
  positionEvent(g, 'battle');
  const low = generateEnemy(g.state, () => 0.5);
  g.state.run.growth.hp += 300;
  const high = generateEnemy(g.state, () => 0.5);
  assert.deepEqual(high, low);
  g.state.player.hp = 1;
  g.state.meta.guildLevel = 20;
  g.state.meta.guildPurchased = 10;
  assert.deepEqual(
    generateEnemy(g.state, () => 0.5),
    high,
  );
});

test('visible shield coefficients agree with executed skill output and preserve rescue descriptions', () => {
  const tower: Source = {
    id: 'tower',
    name: '守卫塔盾',
    kind: 'item',
    skills: itemSkills('warrior_guard_4', 4),
  };
  const r = model([tower]);
  r.hero.defense = 10;
  new BattleEngine(r, 1).heroTurn();
  near(r.hero.shield, 101.4);
  assert.match(itemProposal('warrior_guard_4').stageEffects[3], /9\.1%H＋104%D/);
  assert.match(itemProposal('warrior_guard_4').stageEffects[3], /额外获得6%H护盾/);
  assert.match(tomePreviewText('rogue_shadow_tome', 1), /3\.25%生命护盾/);
  const book: Source = {
    id: 'tome:rogue_shadow_tome',
    name: '夜行秘卷',
    kind: 'tome',
    skills: tomeSkills('rogue_shadow_tome', 1),
  };
  const b = model([book]);
  new BattleEngine(b, 1).heroTurn();
  near(b.hero.shield, 32.5);
});
