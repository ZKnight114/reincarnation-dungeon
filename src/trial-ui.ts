import { finalAttributes } from './backpack';
import { professionIcon } from './art';
import { foeArt } from './pixel';
import { esc } from './pack-ui';
import { realmName } from './progression';
import { runRoute, stageGrowth, STAGES, TRIALS } from './journey';
import { uiIcon } from './ui-art';
import type { GameState, TrialTier } from './types';

export function trialView(s: GameState, tier: TrialTier) {
  const encounter = s.run.encounter;
  if (!encounter) return '';
  const stage = runRoute(s).trials.indexOf(s.run.index),
    difficulty = TRIALS[tier];
  const planned = structuredClone(s);
  planned.run.trials[stage] = tier;
  planned.run.stages = stage + 1;
  planned.run.growth = stageGrowth(s.run.profession, planned.run.trials, stage + 1);
  const gain = planned.run.growth,
    previous = s.run.growth;
  const maxHp = finalAttributes(planned, true).hp;
  const revised = s.run.routeRevision === 16;
  const heal = Math.max(0, Math.min(maxHp - s.player.hp, maxHp * [0.25, 0.35, 0.45][tier]));
  const value = (n: number) => +n.toFixed(2);
  return `<h2 id="decision-title">守关试炼</h2><p class="trial-stage">${STAGES[stage]} · 晋阶之门</p>
    <div class="trial-boss">${foeArt(encounter)}<h3>${esc(encounter.name)} ${professionIcon(encounter.profession ?? 'warrior')}</h3></div>
    <div class="trial-realm"><small>胜利晋升</small><span>${realmName(s.run.realm)}</span><i>→</i><strong>${realmName(s.run.realm + 1)}</strong></div>
    <div class="trial-tiers" role="radiogroup" aria-label="试炼难度">${TRIALS.map((t, n) => `<button data-trial-tier="${n}" role="radio" aria-checked="${n === tier}" tabindex="${n === tier ? 0 : -1}" class="trial-quality-${['blue', 'purple', 'gold'][n]} ${n === tier ? 'selected' : ''}">${t.name}<small>${['稳健', '进取', '极限'][n]}</small></button>`).join('')}</div>
    <div class="trial-details" aria-live="polite"><div class="trial-risk"><span>${uiIcon('hp')}敌人生命 <b>×${difficulty.hp}</b></span><span>${uiIcon('attack')}敌人伤害 <b>×${difficulty.attack}</b></span></div>
    <div class="trial-gains"><span>${uiIcon('attack')}<small>晋升攻击</small><b>+${value((gain.attack - previous.attack) * 100)}%</b></span><span>${uiIcon('hp')}<small>最大生命</small><b>+${value(gain.hp - previous.hp)}</b></span><span>${uiIcon('defense')}<small>晋升防御</small><b>+${value(gain.defense - previous.defense)}</b></span><span>${uiIcon('hp')}<small>战后恢复</small><b>${revised ? '30%' : Math.round(heal)}</b><em>${revised ? '最大生命，实际封顶' : `${[25, 35, 45][tier]}% 上限，实际封顶`}</em></span></div></div>
    <button class="primary-button" data-action="challenge-trial">挑战试炼</button>`;
}
