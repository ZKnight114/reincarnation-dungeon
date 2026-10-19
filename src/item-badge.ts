import { cells } from './backpack';
import { equipmentFamily } from './categories';
import type { Equipment } from './types';
import { spriteUrl } from './assets';

const symbols: Record<string, string> = {
  sword: 'M15 3 21 3 21 9 9 21 3 15ZM6 13l5 5M3 21l4-4',
  spear: 'M4 21 18 7M14 7l7-5-2 8-5-3ZM5 15l4 4',
  shield: 'M12 3 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6ZM12 5v14',
  staff: 'M4 22 16 10M16 2l5 5-5 5-5-5ZM4 16l4 4',
  focus: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5 7l14 10M5 17 19 7',
  ranged: 'M12 3v18M4 8h16M5 4 3 12l9-4 9 4-2-8M8 20h8',
  support: 'M3 5c4-2 7-1 9 1 2-2 5-3 9-1v16c-4-2-7-1-9 1-2-2-5-3-9-1ZM12 6v16',
};
export function itemBadge(item: Equipment) {
  const [x, y] = cells(item)[0],
    family = item.branch === 'neutral' ? null : equipmentFamily(item),
    label = { warrior: '战士', mage: '法师', rogue: '盗贼' }[item.profession];
  return `<g class="item-category-badge item-grade-badge" transform="translate(${x * 100 + 6} ${y * 100 + 6})" aria-label="${label}${family ? ' · ' + family : ''}"><rect width="${family ? 53 : 28}" height="28" rx="4"/><image href="${spriteUrl('ui/status/' + item.profession)}" x="2" y="2" width="24" height="24"/>${family ? `<svg x="29" y="3" width="22" height="22" viewBox="0 0 24 24"><path d="${symbols[family]}"/></svg>` : ''}</g>`;
}
