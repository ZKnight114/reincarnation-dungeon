import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { PROFESSION_KEYS, validateLayout } from '../src/backpack';
import { parseSave } from '../src/save';
import { fitStarters, placeFree, recruitToConfigure } from './helpers';
test('two rounds gift all six items once; exact offers restore without rerolling or charging another recruit', () => {
  for (const profession of PROFESSION_KEYS) {
    let g = new Game();
    recruitToConfigure(g, 1, profession);
    g.startRun(profession);
    const gifted: string[] = [];
    for (let n = 0; n < 2; n++) {
      const offers = g.state.run.starterOffers.map((i) => i.id),
        energy = g.state.meta.energy.value;
      g = new Game(parseSave(JSON.stringify(g.state)));
      assert.deepEqual(
        g.state.run.starterOffers.map((i) => i.id),
        offers,
      );
      assert.equal(g.state.meta.energy.value, energy);
      assert.equal(g.claimStarterRound(), null);
      gifted.push(...offers);
      fitStarters(g);
    }
    assert.match(g.claimStarterRound()!, /已领取/);
    assert.equal(g.state.inventory.length, 6);
    assert.equal(new Set(gifted).size, 6);
    assert.equal(validateLayout(g.state.inventory, g.state.draft), null);
    assert.equal(g.finishOpening(), null);
    assert.equal(g.state.phase, 'initial');
    assert.equal(g.state.run.rewards[0].resonances.length, 3);
    assert.equal(g.state.run.resonances.length, 0);
    assert.equal(g.skipReward(), false);
    assert.ok(advanceCamp(g));
    const restored = new Game(parseSave(JSON.stringify(g.state)));
    assert.deepEqual(restored.state.run.rewards[0].resonances, g.state.run.rewards[0].resonances);
    const hp = restored.state.player.hp;
    assert.equal(restored.chooseResonance(restored.state.run.rewards[0].resonances[0]), null);
    assert.equal(restored.state.phase, 'camp');
    assert.equal(restored.state.run.resonances.length, 1);
    assert.equal(restored.state.player.hp, hp);
    assert.doesNotThrow(() => parseSave(JSON.stringify(restored.state)));
  }
});
test('setup and initial resonance cannot be bypassed, missing weapons block adventure', () => {
  const g = new Game();
  recruitToConfigure(g);
  g.startRun('warrior');
  assert.match(g.finishOpening()!, /两轮/);
  assert.ok(advanceCamp(g));
  assert.ok(g.chooseResonance('cleave'));
  g.claimStarterRound();
  const bad = structuredClone(g.state);
  bad.run.starterOffers[0].id = bad.inventory[0].id;
  assert.throws(() => parseSave(JSON.stringify(bad)));
  g.claimStarterRound();
  g.state.draft = [];
  assert.match(g.finishOpening()!, /武器/);
});
test('pending recruit survives returning to guild and resumes without losing its identity or paying again', () => {
  const g = new Game();
  recruitToConfigure(g);
  const trainee = structuredClone(g.state.run.trainee),
    energy = g.state.meta.energy.value;
  g.backHome();
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  restored.enterChapters();
  restored.chooseChapter(1);
  restored.resumeRecruit();
  assert.equal(restored.state.phase, 'configure');
  assert.deepEqual(restored.state.run.trainee, trainee);
  assert.equal(restored.state.meta.energy.value, energy);
  restored.confirmAllocation();
  assert.equal(restored.startRun(), null);
});
