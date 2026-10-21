import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';
import { PageMediaCache, type MediaStore } from '../src/page-media-cache';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture(store?: MediaStore) {
  const responses = new Map<string, Response>();
  const saved = store ?? {
    read: async (key: string) => responses.get(key)?.clone(),
    write: async (key: string, response: Response) => {
      responses.set(key, response.clone());
    },
  };
  const requests: string[] = [];
  let bytes = 'A',
    status = 200;
  const create = () =>
    new PageMediaCache({
      fetch: async (url) => {
        requests.push(String(url));
        return new Response(bytes, { status, headers: { 'Content-Type': 'image/png' } });
      },
      digest: async (buffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),
      objectUrl: () => 'blob:' + requests.length,
    });
  const configure = (cache: PageMediaCache, url = './assets/A.png', content = 'A') =>
    cache.configure(
      'https://example.test/game/',
      { assets: [{ url, hash: hash(content), size: content.length }] },
      saved,
    );
  return {
    create,
    configure,
    requests,
    responses,
    change: (value: string, code = 200) => {
      bytes = value;
      status = code;
    },
  };
}
test('page cache works without a worker, survives reload, and shares hashes across renamed images', async () => {
  const f = fixture(),
    first = f.create();
  f.configure(first);
  const local = await first.imageUrl('./assets/A.png');
  assert.equal(first.resolved('./assets/A.png'), local);
  assert.equal(first.original(local), './assets/A.png');
  assert.equal(await first.imageUrl('./assets/A.png'), local);
  const reload = f.create();
  f.configure(reload, './assets/renamed.png');
  assert.equal(await (await reload.response('./assets/renamed.png')).text(), 'A');
  assert.equal(reload.hits, 1);
  assert.equal(f.requests.length, 1);
});
test('content changes fetch only the changed hash and retain completed old content', async () => {
  const f = fixture(),
    first = f.create();
  f.configure(first);
  await first.response('./assets/A.png');
  const updated = f.create();
  f.change('B');
  f.configure(updated, './assets/A.png', 'B');
  assert.equal(await (await updated.response('./assets/A.png')).text(), 'B');
  assert.equal([...f.responses.keys()].filter((key) => /^[0-9a-f]{64}$/.test(key)).length, 2);
  assert.equal(f.requests.length, 2);
});
test('failed downloads and hash mismatches do not poison page persistence', async () => {
  const f = fixture(),
    cache = f.create();
  f.configure(cache);
  f.change('bad', 503);
  assert.equal((await cache.response('./assets/A.png')).status, 503);
  f.change('wrong');
  await assert.rejects(cache.response('./assets/A.png'), /清单不一致/);
  assert.equal(f.responses.size, 0);
  f.change('A');
  await Promise.all([cache.response('./assets/A.png'), cache.response('./assets/A.png')]);
  assert.equal(f.requests.length, 3);
  assert.equal([...f.responses.keys()].filter((key) => /^[0-9a-f]{64}$/.test(key)).length, 1);
});
test('denied storage falls back once, without charging a storage failure for every resource', async () => {
  let reads = 0;
  const f = fixture({
    read: async () => {
      reads++;
      throw new Error('denied');
    },
    write: async () => {
      throw new Error('denied');
    },
  });
  const cache = f.create();
  f.configure(cache);
  assert.equal(await (await cache.response('./assets/A.png')).text(), 'A');
  assert.equal(cache.active, false);
  await cache.response('./assets/A.png');
  assert.equal(reads, 1);
});
test('cold packages share one transfer; warm reloads and changed single assets never fetch packages', async () => {
  const saved = new Map<string, Response>(),
    requests: string[] = [];
  const store: MediaStore = {
    read: async (key) => saved.get(key)?.clone(),
    write: async (key, response) => {
      saved.set(key, response.clone());
    },
  };
  const entries = [
    { url: './A.png', hash: hash('AA'), size: 2 },
    { url: './B.mp3', hash: hash('BB'), size: 2 },
  ];
  const manifest = {
    assets: entries,
    packs: [
      {
        url: './pack.bin',
        hash: hash('AABB'),
        size: 4,
        assets: entries.map((entry, index) => ({ ...entry, offset: index * 2 })),
      },
    ],
  };
  const create = () =>
    new PageMediaCache({
      fetch: async (input) => {
        const url = String(input);
        requests.push(url);
        return new Response(url.endsWith('.bin') ? 'AABB' : 'CC');
      },
      digest: async (buffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),
      objectUrl: () => 'blob:test',
    });
  const first = create();
  first.configure('https://test.example/game/', manifest, store, true);
  const contents = await Promise.all(
    entries.map(async (entry) => (await first.response(entry.url)).text()),
  );
  assert.deepEqual(contents, ['AA', 'BB']);
  assert.equal(requests.length, 1);
  assert.equal(first.transferDone, 4);
  assert.ok(saved.has('__prepared__'));
  const warm = create();
  warm.configure('https://test.example/game/', manifest, store, false);
  await Promise.all(entries.map((entry) => warm.response(entry.url)));
  assert.equal(requests.length, 1);
  const next = create();
  next.configure(
    'https://test.example/game/',
    { ...manifest, assets: [{ ...entries[0], hash: hash('CC') }, entries[1]] },
    store,
    false,
  );
  assert.equal(await (await next.response('./A.png')).text(), 'CC');
  assert.equal(await (await next.response('./B.mp3')).text(), 'BB');
  assert.equal(requests.length, 2);
  assert.equal(requests[1], './A.png');
});
test('CSS backgrounds use the same prepared blob URLs as sprites without another network request', async () => {
  const f = fixture(),
    cache = f.create();
  f.configure(cache);
  const url = await cache.imageUrl('./assets/A.png');
  const win = new Window({ url: 'https://example.test/game/' });
  try {
    win.document.head.innerHTML =
      '<style>.button{background-image:url("./assets/A.png")!important}</style>';
    cache.bindStyles(win.document as unknown as Document);
    const rule = win.document.styleSheets[0].cssRules[0] as unknown as CSSStyleRule;
    assert.ok(rule.style.backgroundImage.includes(url));
    assert.equal(rule.style.getPropertyPriority('background-image'), 'important');
    assert.equal(f.requests.length, 1);
  } finally {
    await win.happyDOM.close();
  }
});
