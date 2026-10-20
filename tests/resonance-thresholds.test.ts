import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import {
  RESONANCES,
  RESONANCE_KEYS,
  resonanceScore,
  contributionPoints,
  buildSources,
} from '../src/backpack';
import type { ResonanceKey } from '../src/types';

test('all resonance thresholds increase by rank and profession thresholds exceed item thresholds', () => {
  const profession = [
    [12, 48, 96],
    [20, 60, 120],
    [28, 80, 144],
  ];
  const item = [
    [4, 12, 24],
    [8, 20, 36],
    [12, 28, 48],
  ];
  for (const key of RESONANCE_KEYS) {
    const d = RESONANCES[key];
    assert.deepEqual(
      resonanceScore([], [], key).thresholds,
      (d.kind === 'item' ? item : profession)[d.rank - 1],
    );
  }
});

test('higher-rank resonance effects stay inactive until their own threshold, excluding loose items', () => {
  const g = new Game();
  const item = g.makeItem('warrior_blade_4', 2);
  assert.equal(contributionPoints(item), 8);
  const placement = [{ id: item.id, x: 0, y: 0, rotation: 0 }];
  const keys = [
    'warrior_sword_base',
    'warrior_sword_edge',
    'warrior_sword_master',
  ] as ResonanceKey[];
  assert.deepEqual(
    keys.map((k) => resonanceScore([item], placement, k).tier),
    [1, 1, 0],
  );
  assert.deepEqual(
    keys.map((k) => resonanceScore([item], [], k).tier),
    [0, 0, 0],
  );
  g.state.inventory = [item];
  g.state.placements = placement;
  g.state.run.resonances = keys;
  assert.equal(
    buildSources(g.state).some((s) => s.id === 'resonance:warrior_sword_master'),
    false,
  );
  item.level = 4;
  assert.deepEqual(
    keys.map((k) => resonanceScore([item], placement, k).tier),
    [3, 2, 2],
  );
  assert.equal(resonanceScore([item], placement, 'warrior_sword_master').next, 48);
  assert.equal(
    buildSources(g.state).some((s) => s.id === 'resonance:warrior_sword_master'),
    true,
  );
});
