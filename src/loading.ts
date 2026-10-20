import { startupAssets, spriteUrl } from './assets';
import { ResourceLoader, type ResourcePriority } from './resource-loader';
const resources = new ResourceLoader<HTMLImageElement>(
  (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const finish = (error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        img.onload = img.onerror = null;
        if (error) reject(new Error(error));
        else resolve(img);
      };
      const timeout = window.setTimeout(() => finish('图片加载超时，请重试'), 20_000);
      img.onerror = () => finish('图片加载失败，请重试');
      img.onload = () => {
        const decode = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
        decode.then(
          () => finish(),
          () => finish('图片解码失败，请重试'),
        );
      };
      img.src = url;
    }),
);
export const decodedAsset = (url: string) => resources.get(url);
export const missingAssets = (urls: string[]) => urls.filter((url) => !resources.has(url));
const el = (id: string) => document.getElementById(id)!;
export function loadingProgress(done: number, total: number, label: string) {
  const percent = Math.floor((done * 100) / Math.max(1, total));
  el('loading-fill').style.width = percent + '%';
  el('loading-percent').textContent = percent + '%';
  el('loading-status').textContent = label;
  el('loading-progress').setAttribute('aria-valuenow', String(percent));
}
export async function preloadAssets(
  onProgress: (done: number, total: number) => void = () => {},
  urls = startupAssets(),
  priority: ResourcePriority = 'foreground',
) {
  await resources.batch(urls, onProgress, priority);
}
export function loadingBackground() {
  const panel = document.getElementById('startup-loading');
  if (panel)
    panel.style.backgroundImage = `linear-gradient(#10191155,#101911cc),url("${spriteUrl('guild-home')}")`;
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
