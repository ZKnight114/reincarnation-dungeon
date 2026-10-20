/* Generated with a content manifest by Vite. Only image responses enter this cache. */
const manifest = __ASSET_MANIFEST__;
const scope = self.registration.scope;
const cacheName = 'guild-image-hashes-v1:' + new URL(scope).pathname;
const metadataKey = new URL('__asset_cache__/manifests', scope).href;
const current = manifest.assets.map((asset) => ({ ...asset, url: new URL(asset.url, scope).href }));
const known = new Map(current.map((asset) => [asset.url, asset.hash]));
const inflight = new Map();
let cachePromise;
const cache = () => (cachePromise ??= caches.open(cacheName).catch(() => null));
const key = (hash) => new URL('__asset_cache__/' + hash, scope).href;
// Keep the previous URL catalogue for tabs that still run the preceding build.
const initialized = (async () => {
  const store = await cache();
  if (!store) return;
  try {
    const saved = await store.match(metadataKey);
    const previous = saved ? await saved.json() : null;
    if (previous?.revision === manifest.revision) {
      for (const asset of previous.previous ?? [])
        if (!known.has(asset.url)) known.set(asset.url, asset.hash);
    } else {
      for (const asset of previous?.current ?? [])
        if (!known.has(asset.url)) known.set(asset.url, asset.hash);
      await store.put(
        metadataKey,
        new Response(
          JSON.stringify({
            revision: manifest.revision,
            current,
            previous: previous?.current ?? [],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
  } catch {
    /* Cache metadata failure must not prevent play. */
  }
})();
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) =>
  event.waitUntil(initialized.then(() => self.clients.claim())),
);
async function load(request, hash) {
  const store = await cache();
  if (store) {
    try {
      const hit = await store.match(key(hash));
      if (hit) return hit;
    } catch {
      /* Network fallback when browser storage is unavailable. */
    }
  }
  const response = await fetch(request);
  if (!response.ok || response.type === 'opaque') return response;
  const bytes = await response.clone().arrayBuffer();
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (actual !== hash) throw new Error('Image content does not match its manifest');
  if (store) {
    try {
      await store.put(key(hash), response.clone());
    } catch {
      /* Quota: serve network bytes. */
    }
  }
  return response;
}
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    !url.pathname.startsWith(new URL(scope).pathname) ||
    url.origin !== new URL(scope).origin ||
    !url.pathname.endsWith('.png')
  )
    return;
  event.respondWith(
    (async () => {
      await initialized;
      const hash = known.get(url.href);
      if (!hash) return fetch(event.request);
      let task = inflight.get(hash);
      if (!task) {
        task = load(event.request, hash).finally(() => inflight.delete(hash));
        inflight.set(hash, task);
      }
      return (await task).clone();
    })(),
  );
});
