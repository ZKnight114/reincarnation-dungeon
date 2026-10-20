import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const template = readFileSync(new URL('../scripts/asset-worker.js', import.meta.url), 'utf8');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const entry = (url: string, bytes: string) => ({ url, hash: hash(bytes), size: bytes.length });
class Store {
  entries = new Map<string, Response>();
  quota = false;
  async match(key: string) {
    return this.entries.get(key)?.clone();
  }
  async put(key: string, value: Response) {
    if (this.quota) throw new Error('quota');
    this.entries.set(key, value.clone());
  }
}
function worker(
  assets: ReturnType<typeof entry>[],
  stores: Map<string, Store>,
  network: (url: string) => Promise<Response>,
  scope = 'https://example.test/reincarnation-dungeon/',
  unavailable = false,
) {
  const listeners = new Map<string, (event: any) => void>();
  const manifest = { assets, revision: hash(JSON.stringify(assets)) };
  runInNewContext(template.replace('__ASSET_MANIFEST__', JSON.stringify(manifest)), {
    URL,
    Response,
    Uint8Array,
    crypto: webcrypto,
    self: {
      registration: { scope },
      addEventListener: (key: string, fn: any) => listeners.set(key, fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (name: string) => {
        if (unavailable) throw new Error('denied');
        if (!stores.has(name)) stores.set(name, new Store());
        return stores.get(name)!;
      },
    },
    fetch: (request: Request) => network(request.url),
  });
  return async (url: string, method = 'GET') => {
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({
      request: new Request(new URL(url, scope), { method }),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    return response;
  };
}
test('cold cache downloads once; warm cache and renamed identical content download nothing', async () => {
  const stores = new Map<string, Store>(),
    requests: string[] = [];
  const network = async (url: string) => {
    requests.push(url);
    return new Response('image-A');
  };
  const original = entry('./assets/A.png', 'image-A');
  const first = worker([original], stores, network);
  const result = await Promise.all([first(original.url), first(original.url)]);
  assert.equal(await result[0]!.text(), 'image-A');
  assert.equal(await result[1]!.text(), 'image-A');
  assert.equal(requests.length, 1);
  const reload = worker([original], stores, network);
  await reload(original.url);
  const renamed = worker([entry('./assets/renamed.png', 'image-A')], stores, network);
  await renamed('./assets/renamed.png');
  await renamed(original.url); // old tab remains compatible with previous manifest
  assert.equal(requests.length, 1);
});
test('updating one image keeps the rest; current hash wins for reused URLs', async () => {
  const stores = new Map<string, Store>();
  let count = 0,
    b = 'B1';
  const network = async (url: string) => {
    count++;
    return new Response(url.endsWith('A.png') ? 'A' : b);
  };
  const a = entry('./assets/A.png', 'A');
  const v1 = worker([a, entry('./assets/B.png', b)], stores, network);
  await v1(a.url);
  await v1('./assets/B.png');
  b = 'B2';
  const v2 = worker([a, entry('./assets/B.png', b)], stores, network);
  await v2(a.url);
  assert.equal(await (await v2('./assets/B.png'))!.text(), b);
  assert.equal(count, 3, 'only modified image downloads');
});
test('404 and hash mismatches never poison cache; unavailable storage and quota fall back', async () => {
  const stores = new Map<string, Store>();
  const asset = entry('./assets/A.png', 'correct');
  let response = () => new Response('404', { status: 404 });
  const request = worker([asset], stores, async () => response());
  assert.equal((await request(asset.url))!.status, 404);
  response = () => new Response('wrong');
  await assert.rejects(request(asset.url), /manifest/);
  response = () => new Response('correct');
  assert.equal(await (await request(asset.url))!.text(), 'correct');
  const denied = worker([asset], new Map(), async () => response(), undefined, true);
  assert.equal(await (await denied(asset.url))!.text(), 'correct');
  const quotaStores = new Map<string, Store>();
  const quotaRequest = worker([asset], quotaStores, async () => response());
  for (const store of quotaStores.values()) store.quota = true;
  assert.equal(await (await quotaRequest(asset.url))!.text(), 'correct');
  assert.ok(
    [...quotaStores.values()].every(
      (store) => ![...store.entries.keys()].some((key) => key.endsWith(asset.hash)),
    ),
  );
});
test('only deployment images are intercepted; deployments have isolated cache namespaces', async () => {
  const stores = new Map<string, Store>();
  const a = entry('./assets/A.png', 'A');
  const network = async () => new Response('A');
  const first = worker([a], stores, network);
  assert.equal(await first('./index.html'), undefined);
  assert.equal(await first('./assets/app.js'), undefined);
  assert.equal(await first('https://example.test/other/A.png'), undefined);
  assert.equal(await first(a.url, 'POST'), undefined);
  await first(a.url);
  await worker([a], stores, network, 'https://example.test/other/')(a.url);
  assert.equal(stores.size, 2);
});
