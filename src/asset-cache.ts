import { startupAssets } from './assets';

/** Optional web-only cache. Offline HTML and Vite development never register a worker. */
export async function initializeAssetCache() {
  if (
    !import.meta.env.PROD ||
    !/^https?:$/.test(window.location.protocol) ||
    !('serviceWorker' in window.navigator) ||
    !startupAssets().some((url) => !url.startsWith('data:'))
  )
    return;
  try {
    const workerURL = new URL('asset-worker.js', document.baseURI);
    const scope = new URL('./', workerURL).href;
    await Promise.race([
      (async () => {
        const registration = await navigator.serviceWorker.register(workerURL, {
          scope,
          updateViaCache: 'none',
        });
        // register() may return the existing active worker before its update job finishes.
        // Explicitly finish that check so this reload uses the new image manifest immediately.
        if (registration.active) await registration.update();
        const worker = registration.installing ?? registration.waiting ?? registration.active;
        if (!worker) return;
        if (worker.state !== 'activated')
          await new Promise<void>((resolve) => {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated' || worker.state === 'redundant') resolve();
            });
          });
        if (navigator.serviceWorker.controller === worker) return;
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
      })(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4000)),
    ]);
  } catch {
    // Private mode, unsupported caching, or registration failure uses ordinary image loading.
  }
}
