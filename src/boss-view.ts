import type { BattleRuntime } from './skill-types';
import { pixel } from './pixel';
import { esc } from './pack-ui';

/** The same preparation, phase and summons display is used in both battle modes. */
export function updateBossView(scene: Element | null, runtime: BattleRuntime | null | undefined) {
  if (!scene) return;
  scene.classList.toggle('boss-preparing', !!runtime?.warning);
  scene.classList.toggle('boss-phase', !!runtime?.phase);
  let layer = scene.querySelector('.boss-mechanics');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'boss-mechanics';
    scene.append(layer);
  }
  const text = runtime?.warning || (runtime?.phase ? '第二阶段' : '');
  const html = `${text ? `<span class="boss-cue" role="status">${esc(text)}</span>` : ''}<div class="boss-minions">${(
    runtime?.minions ?? []
  )
    .filter((m) => m.hp > 0)
    .map(
      (m) =>
        `<div class="boss-minion" data-minion="${m.id}" aria-label="幼蛛，生命${Math.ceil(m.hp)}"><img src="${pixel('enemy-spider-full')}" alt="幼蛛"><span><i style="width:${(100 * m.hp) / m.maxHp}%"></i></span></div>`,
    )
    .join('')}</div>`;
  if (layer.innerHTML !== html) layer.innerHTML = html;
}
