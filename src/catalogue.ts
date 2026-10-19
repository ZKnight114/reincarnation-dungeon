// Approved v9 art; fixed cells are shared by rendering and placement.
export const CATALOGUE = {
  warrior_gem: {
    name: '勇气徽章',
    cells: [[0, 0]],
    sprite: 'W-0',
  },
  warrior_blade_2: {
    name: '单手剑',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'W-A2',
  },
  warrior_blade_3: {
    name: '骑士剑',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    sprite: 'W-A3',
  },
  warrior_blade_4: {
    name: '重剑',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    sprite: 'W-A4',
  },
  warrior_pole_2: {
    name: '短枪',
    cells: [
      [0, 0],
      [1, 0],
    ],
    sprite: 'W-B2',
  },
  warrior_pole_3: {
    name: '钩镰枪',
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'W-B3',
  },
  warrior_pole_4: {
    name: '战枪',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    sprite: 'W-B4',
  },
  warrior_guard_2: {
    name: '铁护臂',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'W-F2',
  },
  warrior_guard_3: {
    name: '荆棘肩甲',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    sprite: 'W-F3',
  },
  warrior_guard_4: {
    name: '守卫塔盾',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'W-F4',
  },
  mage_gem: {
    name: '奥术水晶',
    cells: [[0, 0]],
    sprite: 'M-0',
  },
  mage_flame_2: {
    name: '短法杖',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'M-A2',
  },
  mage_flame_3: {
    name: '镶晶法杖',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    sprite: 'M-A3',
  },
  mage_flame_4: {
    name: '烈焰长杖',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    sprite: 'M-A4',
  },
  mage_ice_2: {
    name: '霜晶法球',
    cells: [
      [0, 0],
      [1, 0],
    ],
    sprite: 'M-B2',
  },
  mage_ice_3: {
    name: '环轨法球',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    sprite: 'M-B3',
  },
  mage_ice_4: {
    name: '寒星法球',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    sprite: 'M-B4',
  },
  mage_ward_2: {
    name: '咒文书',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'M-F2',
  },
  mage_ward_3: {
    name: '封印魔法书',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'M-F3',
  },
  mage_ward_4: {
    name: '仪式魔法书',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'M-F4',
  },
  rogue_gem: {
    name: '暗影宝石',
    cells: [[0, 0]],
    sprite: 'R-0',
  },
  rogue_assassin_2: {
    name: '潜行短剑',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'R-A2',
  },
  rogue_assassin_3: {
    name: '轻型双剑',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    sprite: 'R-A3',
  },
  rogue_assassin_4: {
    name: '影袭双剑',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    sprite: 'R-A4',
  },
  rogue_archer_2: {
    name: '轻型手弩',
    cells: [
      [0, 0],
      [1, 0],
    ],
    sprite: 'R-B2',
  },
  rogue_archer_3: {
    name: '连发手弩',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    sprite: 'R-B3',
  },
  rogue_archer_4: {
    name: '重型手弩',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    sprite: 'R-B4',
  },
  rogue_leather_2: {
    name: '烟雾瓶',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'R-F2',
  },
  rogue_leather_3: {
    name: '烟雾弹组',
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'R-F3',
  },
  rogue_leather_4: {
    name: '烟幕匣',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'R-F4',
  },
} as const;
