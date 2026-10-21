import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ResourceLoader,
  ResourceBatchError,
  resourceLabel,
  type ResourceActivity,
} from '../src/resource-loader';
import { resourceDeadline } from '../src/resource-deadline';
import { screenAssetNames, initialHomeView } from '../src/resource-plan';
import { Game } from '../src/game';
import { recruitAppearance, appearanceLayers } from '../src/character-parts';
import { start } from './helpers';
import { spriteName } from '../src/backpack';
import { foeSprite } from '../src/pixel';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test('transient failure retries only its resource and reports download/decode/retry stages', async () => {
  const attempts: string[] = [],
    events: ResourceActivity[] = [];
  const loader = new ResourceLoader(
    async (key, stage) => {
      attempts.push(key);
      if (key === 'slow.png' && attempts.filter((value) => value === key).length === 1)
        throw new Error('temporary network loss');
      stage('decoding');
      return key;
    },
    2,
    1,
    { retries: 1, delayMs: 0 },
  );
  const stop = loader.observe((event) => events.push(event));
  await loader.batch(['good.png', 'slow.png']);
  stop();
  assert.deepEqual(attempts, ['good.png', 'slow.png', 'slow.png']);
  assert.deepEqual(
    events.filter((e) => e.key === 'slow.png').map((e) => e.stage),
    ['loading', 'retrying', 'loading', 'decoding', 'ready'],
  );
  const progress: number[] = [];
  await loader.batch(['good.png', 'slow.png'], (done) => progress.push(done));
  assert.deepEqual(progress, [2], 'ready assets count immediately on subsequent attempts');
  assert.equal(attempts.length, 3);
});
test('persistent failures name all failed assets and a later retry keeps successes', async () => {
  let offline = true;
  const attempts: string[] = [];
  const loader = new ResourceLoader(
    async (key) => {
      attempts.push(key);
      if (offline && key !== 'good.png') throw new Error('network unavailable');
      return key;
    },
    2,
    1,
    { retries: 1, delayMs: 0 },
  );
  await assert.rejects(loader.batch(['good.png', 'bad.png', 'bad2.png']), (error) => {
    assert.ok(error instanceof ResourceBatchError);
    assert.equal(error.failures.length, 2);
    assert.match(error.message, /2项资源未完成：bad.png/);
    return true;
  });
  offline = false;
  await loader.batch(['good.png', 'bad.png', 'bad2.png']);
  assert.equal(attempts.filter((key) => key === 'good.png').length, 1);
  assert.equal(attempts.filter((key) => key === 'bad.png').length, 3);
  assert.equal(resourceLabel('data:image/png;base64,secret-large-bytes'), '内嵌图片');
});
test('stalled operations time out even if cancellation is ignored; successful work cancels watchdog', async () => {
  let cancelled = 0;
  await assert.rejects(
    resourceDeadline(
      () => new Promise<string>(() => {}),
      10,
      'download timeout',
      () => cancelled++,
    ),
    /download timeout/,
  );
  assert.equal(cancelled, 1);
  assert.equal(
    await resourceDeadline(
      async () => 'decoded',
      10,
      'decode timeout',
      () => cancelled++,
    ),
    'decoded',
  );
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(cancelled, 1, 'successful decode does not trigger a late cancellation');
});
test('background uses two slots; foreground jumps ahead and promotes queued work', async () => {
  const started: string[] = [],
    finish = new Map<string, (value: string) => void>();
  const loader = new ResourceLoader<string>(
    (key) =>
      new Promise((resolve) => {
        started.push(key);
        finish.set(key, resolve);
      }),
    3,
    2,
  );
  const background = ['b1', 'b2', 'b3', 'b4'].map((key) => loader.request(key, 'background'));
  await tick();
  assert.deepEqual(started, ['b1', 'b2']);
  const urgent = loader.request('b4');
  await tick();
  assert.deepEqual(started, ['b1', 'b2', 'b4']);
  assert.equal(urgent, background[3], 'same image shares one in-flight task');
  finish.get('b1')!('b1');
  await tick();
  assert.equal(started.at(-1), 'b3');
  for (const key of ['b2', 'b3', 'b4']) finish.get(key)!(key);
  await Promise.all(background);
  await loader.request('b4');
  assert.equal(started.filter((key) => key === 'b4').length, 1);
});
test('failed loads retry without repeating decoded successes; progress counts unique images', async () => {
  const attempts: string[] = [];
  let fail = true;
  const loader = new ResourceLoader(async (key) => {
    attempts.push(key);
    if (key === 'bad' && fail) throw new Error('network');
    return key;
  });
  const progress: number[][] = [];
  await assert.rejects(
    loader.batch(['good', 'good', 'bad'], (done, total) => progress.push([done, total])),
  );
  assert.deepEqual(progress, [
    [0, 2],
    [1, 2],
  ]);
  assert.equal(loader.has('bad'), false);
  fail = false;
  await loader.batch(['good', 'bad']);
  assert.deepEqual(attempts, ['good', 'bad', 'bad']);
});
test('home excludes character, equipment, tomes, expedition and combat scene', () => {
  const s = new Game().state;
  const names = screenAssetNames(s, 'guild', [
    'characters/hair/1',
    'ui/status/poison',
    'W-0',
    'tomes/test',
    'expedition/chapter-1-map',
  ]);
  assert.ok(names.includes('guild-home'));
  assert.ok(names.includes('ui/skins/primary-pressed'));
  assert.ok(names.includes('ui/buttons/light-disabled'));
  assert.ok(!names.some((name) => /^(characters|W-|tomes|expedition|enemy-)/.test(name)));
  assert.ok(!names.includes('ruins-ui'));
});
test('saved run plans its real character layers, offers, items and enemy before rendering', () => {
  const game = start();
  const s = game.state;
  s.run.trainee!.appearance = recruitAppearance('cache-test');
  s.phase = 'combat';
  const names = screenAssetNames(s, 'guild', []);
  for (const key of appearanceLayers(s.run.profession, s.run.trainee!.appearance))
    assert.ok(names.includes(key));
  for (const item of s.inventory) assert.ok(names.includes(spriteName(item)!));
  if (s.enemy) assert.ok(names.includes(foeSprite(s.enemy.species)));
  assert.ok(names.includes('ruins-ui'));
  assert.equal(initialHomeView(s), 'guild');
});
