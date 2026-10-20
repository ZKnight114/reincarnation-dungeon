import { finalAttributes } from './backpack';
import {
  heroAttributes,
  allocationLimit,
  pointsSpent,
  ATTRIBUTE_KEYS,
  ATTRIBUTES,
  TALENTS,
} from './hero';
import { heroArt } from './scene';
import { realmName } from './progression';
import { professionIcon } from './art';
import { esc } from './pack-ui';
import { aptitudeIcon, APTITUDES } from './aptitude';
import type { GameState, TalentKey } from './types';

export function talentChip(key: TalentKey) {
  const t = TALENTS[key],
    quality = t.quality ?? 'blue';
  return `<button class="talent-badge quality-${quality}" data-inspect-talent="${key}" aria-label="${esc(t.name)}，${{ blue: '蓝色', purple: '紫色', gold: '金色' }[quality]}天赋" aria-haspopup="true" aria-expanded="false"><strong>${esc(t.name)}</strong></button>`;
}
export function configurationView(s: GameState, guildText: string) {
  const t = s.run.trainee!;
  const base = heroAttributes(t, t.profession, false),
    allocated = finalAttributes(s),
    remaining = allocationLimit(t) - pointsSpent(t);
  return `<header><button data-action="chapters">地牢</button><span>勇者档案</span></header><section class="admission-file compact-admission">
    <div class="file-heading"><h1>入会档案</h1><span class="aptitude-badge" style="--aptitude-color:${t.aptitude ? APTITUDES[t.aptitude].color : '#bac6bf'}">${aptitudeIcon(t.aptitude)}<strong>${t.aptitude ? APTITUDES[t.aptitude].name : '未评定'}</strong></span></div>
    <div class="admission-profile"><div class="admission-avatar">${heroArt(t.profession, t.appearance)}</div><div class="admission-profile-info"><h2>${esc(t.name)} ${professionIcon(t.profession)}</h2><p>${realmName(t.realmStart ?? 0)} · ${t.recruitment === 'random' ? '基础招募' : '定向招募'}</p><div class="talent-grid">${t.talents.map(talentChip).join('')}</div></div></div>
    <div class="allocation-heading"><strong>可分配属性点 <b id="remaining-points">${remaining}</b> / ${allocationLimit(t)}</strong><div><button data-action="reset-allocation">重置</button><button data-action="balance-allocation">均衡分配</button></div></div>
    <div class="attribute-rows">${ATTRIBUTE_KEYS.map((k) => `<div class="attribute-row" data-stat-row="${k}"><div class="attribute-name"><strong>${ATTRIBUTES[k].name}</strong><small>每点 +${ATTRIBUTES[k].step}</small></div><div class="attribute-value"><span>${base[k]}</span><i>→</i><b>${+allocated[k].toFixed(1)}</b></div><div class="attribute-controls"><button data-attribute="${k}" data-delta="-1" aria-label="减少${ATTRIBUTES[k].name}加点" ${t.allocation[k] === 0 ? 'disabled' : ''}>−</button><span>${t.allocation[k]}</span><button data-attribute="${k}" data-delta="1" aria-label="增加${ATTRIBUTES[k].name}加点" ${remaining === 0 ? 'disabled' : ''}>＋</button></div></div>`).join('')}</div>
    <p class="allocation-guild">${esc(guildText)}</p><button class="primary-button admission-submit" data-action="confirm-allocation" ${remaining ? 'disabled' : ''}>确认加点</button></section>`;
}
