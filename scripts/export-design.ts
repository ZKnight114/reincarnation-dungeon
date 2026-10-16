// Regenerate reviewable design tables from the same catalogues used by the game.
import { writeFile } from 'node:fs/promises';
import { Game } from '../src/game';
import { CATALOGUE } from '../src/catalogue';
import items from '../src/item-catalogue.json';
import { adjacencyDescription, readableEffect } from '../src/item-rules';
import { RESONANCES, RESONANCE_KEYS } from '../src/resonances';
import { TOMES } from '../src/progression';
import { TALENTS } from '../src/talents';
import { itemSkills } from '../src/skills';
import talents from '../src/talent-catalogue.json';

const date = '2026-10-16';
const qualities = ['blue', 'purple', 'gold'] as const;
const rankNames = { 1: '低阶（蓝）', 2: '进阶（紫）', 3: '高阶（金）' };
const professions = { warrior: '战士', mage: '法师', rogue: '盗贼' };
const g = new Game();
const escapeCell = (s: string) => s.replaceAll('|', '／').replaceAll('\n', '<br>');
const stats = (s: Record<string, number>) =>
  Object.entries(s)
    .filter(([, n]) => n)
    .map(
      ([k, n]) =>
        `${({ attack: '攻击', hp: '生命', defense: '防御', speed: '速度', attackPercent: '攻击', hpPercent: '生命', defensePercent: '防御' } as Record<string, string>)[k]} +${n}${k.endsWith('Percent') ? '%' : ''}`,
    )
    .join(' · ') || '无';
function diagram(cells: readonly (readonly number[])[]) {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) =>
      cells.some((c) => c[0] === x && c[1] === y) ? '■' : '·',
    ).join(' '),
  ).join('\n');
}
async function save(name: string, body: string) {
  await writeFile(new URL('../design/' + name, import.meta.url), body);
  console.log(name);
}
let text = `# 三职业30件物品属性表 v2\n\n${date} · v15.2 已实施。由 scripts/export-design.ts 从正式数据导出。以代码和本表为当前规则，v1保留作历史。\n\n人物属性直接加入勇者；回合技能读取人物最终属性。装备没有体力／魔法消耗。最高4阶：基础白绿／蓝／紫／金，升阶不改变插画和固定占格，不旋转。5格保留但不投放。\n\n每件物品同时贡献所属职业与公共类别，1格仅贡献职业；贡献＝占格×1／2／4／8。公共类别为剑、枪、防御、法杖、法球、弩、辅助。职业路线都读取同职业总贡献。装备自身技能独立，共鸣不改写装备技能。\n\n相邻必须边接触，角接触不算；同一件接触多格只计一次。单格增伤只给同职业目标，最多接受2件；接受联动最多计算3件。\n\n`;
for (const i of items.items) {
  const cells = CATALOGUE[i.id as keyof typeof CATALOGUE].cells;
  text += `## ${i.name} · ${i.profession}／${i.series} · ${i.size}格\n\n标识：\`${i.id}\`。贡献标签：${i.contributionTags.join('＋')}。\n\n\`\`\`text\n${diagram(cells)}\n\`\`\`\n\n| 阶位 | 人物属性 | 原生效果 | 每个贡献标签点数 |\n| --- | --- | --- | --- |\n`;
  for (let n = 0; n < 4; n++)
    text += `| ${n + 1}阶 · ${['白绿', '蓝', '紫', '金'][n]} | ${stats(i.attributes[n])} | ${escapeCell(readableEffect(i.stageEffects[n]))} | ${i.contribution[n]} |\n`;
  const first = itemSkills(i.id, 1).find((s) => s.cooldown);
  if (first) text += `\n首次第${first.initialDelay ?? 1}回合发动，之后按各阶回合冷却执行。\n`;
  text += `\n联动方向：${i.adjacency.direction}。\n\n1–3阶：${adjacencyDescription(g.makeItem(i.id))}\n\n4阶：${adjacencyDescription(g.makeItem(i.id, 4))}\n\n`;
}
text +=
  '## 烟幕边界\n\n烟雾瓶／烟雾弹组／烟幕匣只有减免原生直接伤害一个主要技能。持续按敌方行动消耗，不影响毒、灼烧和反击。同类取最高，叠加天赋和相邻强度后最多45%，不延长持续或减少冷却。夜行秘卷的护盾／治疗来自典籍独立技能。\n';
await save('三职业30件物品属性表-v2.md', text);

text = `# 共鸣与九本典籍设计 v2\n\n${date} · v15.2 已实施，从正式候选池和典籍目录导出。\n\n## 共鸣规则\n\n候选池共48个：职业27＋公共物品21；旧存档6个别名不进入新抽取。初始＋三次试炼共选四次，每次三选一。初始仅低阶；已选该系列基础后，才可出现进阶或直接高阶。选择进阶不替换已选基础，仍占一个共鸣槽位。\n\n低阶蓝／进阶紫／高阶金是三个不同共鸣；每个共鸣内仍有三个贡献触发阶段。职业阈值12／48／96、物品阈值4／12／24；不足最低阈值时不发动。物品贡献占格×1／2／4／8，一格只贡献职业。\n\n职业共鸣只来自勇者主职业。公共共鸣匹配所有职业同类别装备，本职业三个类别可抽；跨职业装备已入包后可开放其类别，不因辅修额外抽到其他职业共鸣。共鸣技能的伤害来源职业统一为勇者主职业，装备和典籍技能保留各自职业，用于职业增幅与克制判断。\n\n共鸣各自释放技能，不更改物品技能、冷却或相邻效果。辅助高阶响应原生辅助技能，单个共鸣每满回合最多一次，保存触发记录，恢复时不重复。\n\n| 共鸣 | 类型／系列 | 阶位 | 前置 | 贡献1阶段 | 贡献2阶段 | 贡献3阶段 |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const key of RESONANCE_KEYS) {
  const r = RESONANCES[key];
  text += `| ${r.name} | ${r.kind === 'profession' ? professions[r.profession] : '公共物品'}／${r.series} | ${rankNames[r.rank]} | ${r.requires.map((k) => RESONANCES[k].name).join('／') || '无'} | ${r.effects.map(escapeCell).join(' | ')} |\n`;
}
text +=
  '\n## 九本典籍\n\n加点后选择，不限制主职业。每本3阶；进入本局时绑定其当前等级。没有共鸣贡献，不占背包。跨职业典籍带来的装备投放比例15%，匹配典籍职业＋具体系列，不能仅按公共剑／辅助类别混入另一职业的系列。通关不产出残页，导师／遗物／特殊配方本轮不实现。\n\n';
for (const t of TOMES) {
  text += `### ${t.name} · ${professions[t.profession]}／${t.series}\n\n标识：\`${t.id}\`。\n\n| 典籍阶位 | 人物属性增幅 | 自动回合技能 |\n| --- | --- | --- |\n`;
  for (let n = 0; n < 3; n++)
    text += `| ${n + 1} | ${stats(t.attributes[n])} | ${escapeCell(readableEffect(t.skillStages[n]))} |\n`;
  text += `\n配合：${t.combo}\n\n`;
}
await save('共鸣与九本典籍设计-v2.md', text);

text = `# 初始天赋设计 v2\n\n${date} · v15.2 已实施。正式数据为 src/talent-catalogue.json，旧 design/talents-v1.json保留作历史。共14家族／42品质版本。\n\n固定四条：恰好一条对应主职业的职业天赋＋一条全七类池随机物品天赋＋一条基础属性天赋＋一条非职业随机。第四条基础／物品各50%；类别内家族均匀抽取，品质蓝／紫／金权重60／30／10。普通与定向招募同概率。\n\n同名不同品质允许，数值加算；同名同品质排除后重算剩余品质概率。天赋随勇者保存，刷新不重抽；已有旧勇者保留原天赋。\n\n职业增幅匹配伤害来源职业，所有已选共鸣归主职业，装备／典籍归自身职业。物品天赋仅增强该公共类别的原生技能，不增强典籍、共鸣或赋予本来不存在的效果；原生直伤不包含毒、灼烧、反击。多个职业／物品增伤加算一次。\n\n吸血只按原生直接攻击实际扣除的敌方生命计算，每满回合最多人物最大生命2%；高级职业反伤只按敌方原生直接攻击实际扣除的生命计算，每满回合最多人物攻击10%，反伤真实伤害不递归、不再次触发增伤。烟幕强度增强不改变持续和冷却。\n\n| 天赋家族 | 类别 | 蓝 · 稀有 | 紫 · 史诗 | 金 · 传说 |\n| --- | --- | --- | --- | --- |\n`;
for (const family of talents.talents) {
  text += `| ${family.name} | ${{ attribute: '基础', profession: '职业', item: '物品' }[family.category]} | ${qualities.map((q) => escapeCell(TALENTS[`${family.id}:${q}`].description)).join(' | ')} |\n`;
}
await save('初始天赋设计-v2.md', text);
