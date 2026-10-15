export const CATALOGUE = {
  warrior_gem: { name: '勇气徽章', cells: [[0, 0]], sprite: 'W-0' },
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
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    sprite: 'W-B4',
  },
  warrior_guard_2: {
    name: '小盾',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'W-F2',
  },
  warrior_guard_3: {
    name: '鸢盾',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    sprite: 'W-F3',
  },
  warrior_guard_4: {
    name: '大盾',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'W-F4',
  },
  mage_gem: { name: '奥术水晶', cells: [[0, 0]], sprite: 'M-0' },
  mage_flame_2: {
    name: '短杖',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'M-A2',
  },
  mage_flame_3: {
    name: '曲杖',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    sprite: 'M-A3',
  },
  mage_flame_4: {
    name: '长杖',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    sprite: 'M-A4',
  },
  mage_ice_2: {
    name: '咒文书',
    cells: [
      [0, 0],
      [1, 0],
    ],
    sprite: 'M-B2',
  },
  mage_ice_3: {
    name: '三折魔典',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    sprite: 'M-B3',
  },
  mage_ice_4: {
    name: '链扣魔典',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    sprite: 'M-B4',
  },
  mage_ward_2: {
    name: '短法袍',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'M-F2',
  },
  mage_ward_3: {
    name: '旅行法袍',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'M-F3',
  },
  mage_ward_4: {
    name: '仪式法袍',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'M-F4',
  },
  rogue_gem: { name: '暗影宝石', cells: [[0, 0]], sprite: 'R-0' },
  rogue_assassin_2: {
    name: '短匕',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'R-A2',
  },
  rogue_assassin_3: {
    name: '曲刃双匕',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    sprite: 'R-A3',
  },
  rogue_assassin_4: {
    name: '刺杀双匕',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    sprite: 'R-A4',
  },
  rogue_archer_2: {
    name: '手弩',
    cells: [
      [0, 0],
      [1, 0],
    ],
    sprite: 'R-B2',
  },
  rogue_archer_3: {
    name: '短弓',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    sprite: 'R-B3',
  },
  rogue_archer_4: {
    name: '折臂长弩',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
    ],
    sprite: 'R-B4',
  },
  rogue_leather_2: {
    name: '轻皮甲',
    cells: [
      [0, 0],
      [0, 1],
    ],
    sprite: 'R-F2',
  },
  rogue_leather_3: {
    name: '猎手皮甲',
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'R-F3',
  },
  rogue_leather_4: {
    name: '夜行皮甲',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    sprite: 'R-F4',
  },
} as const;
