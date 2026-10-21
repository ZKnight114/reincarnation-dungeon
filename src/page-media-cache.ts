import { resourceDeadline } from './resource-deadline';

export interface MediaManifest {
  assets: { url: string; hash: string; size: number }[];
  packs?: {
    url: string;
    hash: string;
    size: number;
    assets: { url: string; hash: string; offset: number; size: number }[];
  }[];
}
export interface MediaStore {
  read(hash: string): Promise<Response | undefined>;
  write(hash: string, response: Response): Promise<void>;
}
interface Environment {
  fetch: typeof fetch;
  digest: (bytes: ArrayBuffer) => Promise<string>;
  objectUrl: (blob: Blob) => string;
}
export class PageMediaCache {
  private hashes = new Map<string, string>();
  private urls = new Map<string, string>();
  private originals = new Map<string, string>();
  private tasks = new Map<string, Promise<Response>>();
  private scope = '';
  private packs = new Map<string, NonNullable<MediaManifest['packs']>[number]>();
  private packTasks = new Map<string, Promise<Map<string, Blob>>>();
  private cold = false;
  private received = new Map<string, number>();
  transferTotal = 0;
  onTransfer: (() => void) | undefined;
  private store: MediaStore | null = null;
  private writable = true;
  private marked = false;
  hits = 0;
  downloads = 0;
  constructor(private env: Environment) {}
  configure(scope: string, manifest: MediaManifest, store: MediaStore, cold = false) {
    this.scope = scope;
    this.store = store;
    this.writable = true;
    this.marked = false;
    this.hashes = new Map(
      manifest.assets.map((entry) => [new URL(entry.url, scope).href, entry.hash]),
    );
    this.cold = cold;
    this.packs.clear();
    this.transferTotal = cold
      ? (manifest.packs ?? []).reduce((sum, pack) => sum + pack.size, 0)
      : 0;
    for (const pack of manifest.packs ?? [])
      for (const asset of pack.assets) this.packs.set(asset.hash, pack);
  }
  get transferDone() {
    return [...this.received.values()].reduce((sum, value) => sum + value, 0);
  }
  releaseTransfers() {
    this.packTasks.clear();
    this.onTransfer = undefined;
  }
  get active() {
    return !!this.store;
  }
  resolved(url: string) {
    return (
      this.urls.get(url) ??
      (this.scope ? this.urls.get(new URL(url, this.scope).href) : undefined) ??
      url
    );
  }
  original(url: string) {
    return this.originals.get(url) ?? url;
  }
  private hash(url: string) {
    if (!this.store || !/^https?:/.test(this.scope) || /^(data|blob):/.test(url)) return;
    return this.hashes.get(new URL(url, this.scope).href);
  }
  async response(url: string, init?: RequestInit): Promise<Response> {
    const hash = this.hash(url);
    if (!hash) return this.env.fetch(url, init);
    let task = this.tasks.get(hash);
    if (!task) {
      task = this.load(url, hash, init).finally(() => this.tasks.delete(hash));
      this.tasks.set(hash, task);
    }
    return (await task).clone();
  }
  private async load(url: string, hash: string, init?: RequestInit) {
    const store = this.store!;
    try {
      const cached = await resourceDeadline(() => store.read(hash), 1500, '缓存读取超时');
      if (cached) {
        this.hits++;
        return cached;
      }
    } catch {
      // Do not pay the same storage timeout for every file in a restricted browser.
      if (this.store === store) this.store = null;
    }
    const pack = this.cold ? this.packs.get(hash) : undefined;
    if (pack) {
      let task = this.packTasks.get(pack.url);
      if (!task) {
        task = this.loadPack(pack).catch((error) => {
          this.packTasks.delete(pack.url);
          throw error;
        });
        this.packTasks.set(pack.url, task);
      }
      try {
        const blob = (await task).get(hash);
        if (blob) return new Response(blob, { headers: { 'Content-Type': blob.type } });
      } catch {
        // A failed package never prevents a single-file retry.
        this.cold = false;
        this.transferTotal = 0;
      }
    }
    const response = await this.env.fetch(url, init);
    if (!response.ok) return response;
    const bytes = await response.arrayBuffer();
    const actual = await resourceDeadline(() => this.env.digest(bytes), 15_000, '素材校验超时');
    if (actual !== hash) throw new Error('素材与更新清单不一致，请重试');
    const verified = new Response(bytes, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    });
    this.downloads++;
    try {
      if (this.store === store && this.writable) {
        await resourceDeadline(() => store.write(hash, verified.clone()), 1500, '缓存保存超时');
        await this.markPrepared(store);
      }
    } catch {
      this.writable = false;
      /* Serve verified bytes even when storage is full. */
    }
    return verified;
  }
  private async markPrepared(store: MediaStore) {
    if (this.marked) return;
    this.marked = true;
    await resourceDeadline(
      () => store.write('__prepared__', new Response('1')),
      1500,
      '缓存保存超时',
    );
  }
  private async loadPack(pack: NonNullable<MediaManifest['packs']>[number]) {
    const abort = new AbortController();
    const bytes = await resourceDeadline(
      async () => {
        const response = await this.env.fetch(new URL(pack.url, this.scope), {
          signal: abort.signal,
        });
        if (!response.ok) throw new Error('素材包下载失败');
        if (!response.body) return response.arrayBuffer();
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let total = 0,
          last = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.length;
          if (total > pack.size) {
            await reader.cancel();
            throw new Error('素材包长度异常');
          }
          this.received.set(pack.url, total);
          if (Date.now() - last >= 100) {
            last = Date.now();
            this.onTransfer?.();
          }
        }
        const buffer = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
        return buffer.buffer;
      },
      60_000,
      '素材包下载超时',
      () => abort.abort(),
    );
    if (bytes.byteLength !== pack.size || (await this.env.digest(bytes)) !== pack.hash)
      throw new Error('素材包校验失败');
    this.received.set(pack.url, pack.size);
    this.onTransfer?.();
    const blobs = new Map<string, Blob>(),
      whole = new Blob([bytes]);
    for (const asset of pack.assets) {
      const type = asset.url.endsWith('.png')
        ? 'image/png'
        : asset.url.endsWith('.mp3')
          ? 'audio/mpeg'
          : 'audio/wav';
      const blob = whole.slice(asset.offset, asset.offset + asset.size, type);
      if (
        blob.size !== asset.size ||
        (await this.env.digest(await blob.arrayBuffer())) !== asset.hash
      )
        throw new Error('素材包内容校验失败');
      blobs.set(asset.hash, blob);
      if (this.store && this.writable) {
        try {
          const store = this.store;
          await resourceDeadline(
            () =>
              store.write(asset.hash, new Response(blob, { headers: { 'Content-Type': type } })),
            1500,
            '缓存保存超时',
          );
          await this.markPrepared(store);
        } catch {
          this.writable = false;
        }
      }
    }
    this.downloads += pack.assets.length;
    return blobs;
  }
  async imageUrl(url: string) {
    if (!this.hash(url)) return url;
    const prepared = this.resolved(url);
    if (prepared !== url) return prepared;
    const response = await this.response(url);
    if (!response.ok) throw new Error('图片下载失败');
    const local = this.env.objectUrl(await response.blob());
    this.urls.set(url, local);
    this.urls.set(new URL(url, this.scope).href, local);
    this.originals.set(local, url);
    return local;
  }
  bindStyles(doc: Document) {
    if (!this.active) return;
    const visit = (rules: CSSRuleList, base: string) => {
      for (const rule of rules) {
        if ('style' in rule) {
          const style = (rule as CSSStyleRule).style;
          for (let n = 0; n < style.length; n++) {
            const property = style.item(n),
              value = style.getPropertyValue(property);
            const replaced = value.replace(
              /url\(\s*(['"]?)(.*?)\1\s*\)/g,
              (original, _quote: string, url: string) => {
                if (/^(data|blob):/.test(url)) return original;
                const resolved = this.resolved(new URL(url, base).href);
                return resolved.startsWith('blob:') ? `url("${resolved}")` : original;
              },
            );
            if (replaced !== value)
              style.setProperty(property, replaced, style.getPropertyPriority(property));
          }
        }
        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, base);
      }
    };
    for (const sheet of doc.styleSheets) {
      try {
        visit(sheet.cssRules, sheet.href ?? doc.baseURI);
      } catch {}
    }
  }
}

export const pageMediaCache = new PageMediaCache({
  fetch: (...args) => globalThis.fetch(...args),
  digest: async (bytes) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join(''),
  objectUrl: (blob) => URL.createObjectURL(blob),
});

async function indexedStore(scope: string): Promise<MediaStore> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('guild-media-hashes-v1:' + new URL(scope).pathname, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('media');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('素材缓存被占用'));
  });
  database.onversionchange = () => database.close();
  return {
    read: (hash) =>
      new Promise((resolve, reject) => {
        const request = database.transaction('media').objectStore('media').get(hash);
        request.onsuccess = () =>
          resolve(
            request.result instanceof Blob
              ? new Response(request.result, { headers: { 'Content-Type': request.result.type } })
              : undefined,
          );
        request.onerror = () => reject(request.error);
      }),
    write: async (hash, response) => {
      const blob = await response.blob();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('media', 'readwrite');
        transaction.objectStore('media').put(blob, hash);
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}
export async function initializePageMediaCache(scope: string) {
  try {
    if (!globalThis.crypto?.subtle) return;
    let store: MediaStore | undefined;
    try {
      if (globalThis.caches) {
        const cache = await resourceDeadline(
          () => caches.open('guild-image-hashes-v1:' + new URL(scope).pathname),
          1500,
          '缓存初始化超时',
        );
        const key = (hash: string) => new URL('__asset_cache__/' + hash, scope).href;
        store = {
          read: (hash) => cache.match(key(hash)),
          write: (hash, response) => cache.put(key(hash), response),
        };
      }
    } catch {}
    if (!store && globalThis.indexedDB)
      store = await resourceDeadline(() => indexedStore(scope), 1500, '缓存初始化超时');
    if (!store) return;
    const manifest = await resourceDeadline(
      async () => {
        const response = await fetch(new URL('asset-manifest.json', scope), { cache: 'no-store' });
        if (!response.ok) throw new Error('更新清单读取失败');
        const value = (await response.json()) as MediaManifest;
        if (
          !Array.isArray(value.assets) ||
          value.assets.some(
            (asset) =>
              typeof asset.url !== 'string' ||
              !/^[0-9a-f]{64}$/.test(asset.hash) ||
              new URL(asset.url, scope).origin !== new URL(scope).origin,
          )
        )
          throw new Error('更新清单无效');
        if (
          value.packs &&
          (!Array.isArray(value.packs) ||
            value.packs.some(
              (pack) =>
                !/^[0-9a-f]{64}$/.test(pack.hash) ||
                !Number.isInteger(pack.size) ||
                pack.size < 1 ||
                pack.size > 8 * 1024 * 1024 ||
                new URL(pack.url, scope).origin !== new URL(scope).origin ||
                !Array.isArray(pack.assets) ||
                pack.assets.some(
                  (entry) =>
                    !Number.isInteger(entry.offset) ||
                    entry.offset < 0 ||
                    entry.offset + entry.size > pack.size ||
                    !value.assets.some(
                      (asset) =>
                        asset.url === entry.url &&
                        asset.hash === entry.hash &&
                        asset.size === entry.size,
                    ),
                ),
            ))
        )
          throw new Error('素材包清单无效');
        return value;
      },
      6000,
      '更新清单读取超时',
    );
    const warm = (
      await resourceDeadline(
        () =>
          Promise.all([
            store!.read('__prepared__'),
            ...manifest.assets.slice(0, 4).map((asset) => store!.read(asset.hash)),
          ]),
        1500,
        '缓存读取超时',
      )
    ).some(Boolean);
    pageMediaCache.configure(scope, manifest, store, !warm);
  } catch {
    /* Ordinary HTTP loading remains available when persistence is unavailable. */
  }
}
