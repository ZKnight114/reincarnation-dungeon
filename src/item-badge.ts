import { cells } from './backpack';
import { CATEGORY_NAMES, equipmentFamily } from './categories';
import type { Equipment } from './types';
import { CATEGORY_MARKS, PROFESSION_MARKS } from './identity-marks';

export function itemBadge(item: Equipment) {
  const [x, y] = cells(item)[0],
    family = item.branch === 'neutral' ? null : equipmentFamily(item),
    { name, letter } = PROFESSION_MARKS[item.profession];
  return `<g class="item-category-badge item-grade-badge" transform="translate(${x * 100 + 6} ${y * 100 + 6})" aria-label="${name}${family ? ' · ' + CATEGORY_NAMES[family] : ''}"><g class="profession-letter-plate" data-profession="${item.profession}"><rect width="30" height="30"/><text x="15" y="16">${letter}</text></g>${family ? `<g class="category-letter-plate" data-category="${family}" transform="translate(0 34)"><rect width="30" height="30"/><text x="15" y="16">${CATEGORY_MARKS[family]}</text></g>` : ''}</g>`;
}
