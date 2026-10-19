import { startupAssets, spriteUrl } from './assets';
const ready = new Map<string, HTMLImageElement>();
export const decodedAsset = (url: string) => ready.get(url);
const el = (id: string) => document.getElementById(id)!;
export function loadingProgress(done: number, total: number, label: string) {
  const percent = Math.floor((done * 100) / Math.max(1, total));
  el('loading-fill').style.width = percent + '%';
  el('loading-percent').textContent = percent + '%';
  el('loading-status').textContent = label;
  el('loading-progress').setAttribute('aria-valuenow', String(percent));
}
export async function preloadAssets(onProgress: (done: number, total: number) => void) {
  const urls = startupAssets();
  let next = 0,
    done = 0;
  const load = async (url: string) => {
    if (ready.has(url)) return;
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const timeout = window.setTimeout(() => {
        img.onload = img.onerror = null;
        reject(new Error('图片加载超时'));
      }, 20_000);
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('图片加载失败：' + url.split('/').at(-1)));
      };
      img.onload = () => {
        const decode = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
        decode.then(
          () => {
            clearTimeout(timeout);
            ready.set(url, img);
            resolve();
          },
          () => {
            clearTimeout(timeout);
            reject(new Error('图片解码失败'));
          },
        );
      };
      img.src = url;
    });
  };
  const tasks = await Promise.allSettled(
    Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        await load(url);
        done++;
        onProgress(done, urls.length);
      }
    }),
  );
  const failed = tasks.find((t): t is PromiseRejectedResult => t.status === 'rejected');
  if (failed) throw failed.reason;
  el('startup-loading').style.backgroundImage =
    `linear-gradient(#10191155,#101911cc),url("${spriteUrl('guild-home')}")`;
}
export function loadingError(message: string, retry: () => void) {
  el('loading-status').textContent = message;
  const button = el('loading-retry') as HTMLButtonElement;
  button.hidden = false;
  button.onclick = () => {
    button.hidden = true;
    retry();
  };
}
export function finishLoading() {
  el('app').hidden = false;
  el('startup-loading').remove();
}
