import { startupAssets, spriteUrl } from './assets';
import { pageMediaCache } from './page-media-cache';
import { resourceDeadline } from './resource-deadline';
import {
  ResourceLoader,
  resourceLabel,
  type ResourceActivity,
  type ResourcePriority,
} from './resource-loader';
const resources = new ResourceLoader<HTMLImageElement>(
  async (url, stage) => {
    const source = await resourceDeadline(
      () => pageMediaCache.imageUrl(url),
      45_000,
      '图片下载超时',
    );
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const finish = (error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        img.onload = img.onerror = null;
        if (error) {
          img.removeAttribute?.('src');
          reject(new Error(error));
        } else resolve(img);
      };
      let timeout = window.setTimeout(() => finish('图片下载超时'), 45_000);
      img.onerror = () => finish('图片下载失败');
      img.onload = () => {
        if (settled) return;
        clearTimeout(timeout);
        stage('decoding');
        timeout = window.setTimeout(() => finish('图片解码超时'), 15_000);
        const decode = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
        decode.then(
          () => finish(),
          () => finish('图片解码失败'),
        );
      };
      img.src = source;
    });
  },
  4,
  2,
  { retries: 1 },
);
export const decodedAsset = (url: string) => resources.get(pageMediaCache.original(url));
export const missingAssets = (urls: string[]) => urls.filter((url) => !resources.has(url));
const el = (id: string) => document.getElementById(id)!;
const activity = new Map<string, ResourceActivity>();
export function resetLoadingActivity() {
  activity.clear();
  const detail = document.getElementById('loading-detail');
  if (detail) detail.textContent = '';
}
export function loadingActivity(update: ResourceActivity) {
  const panel = document.getElementById('startup-loading');
  if (!panel) return;
  if (update.stage === 'ready') activity.delete(update.key);
  else activity.set(update.key, update);
  let detail = document.getElementById('loading-detail');
  if (!detail) {
    detail = document.createElement('p');
    detail.id = 'loading-detail';
    detail.setAttribute('aria-live', 'polite');
    el('loading-status').after(detail);
  }
  const all = [...activity.values()];
  const failures = all.filter((item) => item.stage === 'failed');
  const pending = all.filter((item) => item.stage !== 'failed');
  const describe = (item: ResourceActivity) =>
    `${item.stage === 'retrying' ? '自动重试' : item.stage === 'decoding' ? '正在解码' : '正在读取'}：${resourceLabel(item.key)}` +
    (item.attempt > 1 || item.stage === 'retrying'
      ? `（${item.stage === 'retrying' ? item.attempt + 1 : item.attempt}/${item.attempts}）`
      : '');
  detail.textContent = [
    ...pending
      .sort((a, b) => Number(b.stage === 'retrying') - Number(a.stage === 'retrying'))
      .slice(0, 2)
      .map(describe),
    ...(failures.length
      ? [
          `未完成${failures.length}项：${failures
            .slice(0, 3)
            .map((item) => resourceLabel(item.key))
            .join('、')}`,
        ]
      : []),
  ].join('\n');
}
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
  onActivity?: (activity: ResourceActivity) => void,
) {
  const stop = onActivity ? resources.observe(onActivity) : () => {};
  try {
    await resources.batch(urls, onProgress, priority);
  } finally {
    stop();
  }
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
