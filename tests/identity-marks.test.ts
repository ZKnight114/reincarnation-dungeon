import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { availableItems } from '../src/backpack';
import { professionIcon } from '../src/art';
import { itemBadge } from '../src/item-badge';
import { equipmentFamily } from '../src/categories';
import { CATEGORY_MARKS, PROFESSION_MARKS } from '../src/identity-marks';
import type { Profession } from '../src/types';

test('every equipment identity has readable text, with no category added to neutral items', () => {
  const g = new Game();
  const seen = new Set<string>();
  for (const profession of Object.keys(PROFESSION_MARKS) as Profession[]) {
    const mark = PROFESSION_MARKS[profession];
    assert.ok(professionIcon(profession).includes(`aria-label="${mark.name}"`));
    assert.ok(professionIcon(profession).includes(`>${mark.letter}</b>`));
    for (const def of availableItems(profession)) {
      const item = g.makeItem(def.id);
      const badge = itemBadge(item);
      assert.ok(badge.includes(`>${mark.letter}</text>`));
      assert.doesNotMatch(badge, /undefined|<image/);
      if (item.branch === 'neutral') {
        assert.doesNotMatch(badge, /data-category/);
      } else {
        const family = equipmentFamily(item);
        seen.add(family);
        assert.ok(badge.includes(`data-category="${family}"`));
        assert.ok(badge.includes('transform="translate(0 34)"'));
        assert.ok(badge.includes(`>${CATEGORY_MARKS[family]}</text>`));
      }
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(CATEGORY_MARKS).sort());
});
