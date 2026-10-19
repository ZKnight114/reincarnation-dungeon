import { spriteUrl } from './assets';
const kinds = new Set([
  'poison',
  'burn',
  'chill',
  'break',
  'mark',
  'smoke',
  'shield',
  'rage',
  'warning',
  'minions',
  'info',
  'tome',
]);
export function statusIcon(kind: string) {
  const key = kinds.has(kind) ? kind : 'info';
  return `<img class="status-symbol status-${key}" src="${spriteUrl('ui/status/' + key)}" alt="" aria-hidden="true">`;
}
/** Input must already be escaped. Keep names alongside icons in effect descriptions. */
export function decorateStatusText(escapedText: string) {
  const labels: Record<string, string> = {
    中毒: 'poison',
    毒伤: 'poison',
    灼烧: 'burn',
    减速: 'chill',
    破防: 'break',
    标记: 'mark',
    烟幕: 'smoke',
    护盾: 'shield',
    狂暴: 'rage',
  };
  return escapedText.replace(
    /中毒|毒伤|灼烧|减速|破防|标记|烟幕|护盾|狂暴/g,
    (name) => statusIcon(labels[name]) + name,
  );
}
