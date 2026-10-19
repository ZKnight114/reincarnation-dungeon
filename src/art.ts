import { ENEMIES, QUALITIES } from './data';
import type { Equipment, Quality, Profession } from './types';
import { spriteUrl } from './assets';
export function icon(name: string, size = 20) {
  const paths: Record<string, string> = {
    dungeon:
      '<path d="M5 21V10a7 7 0 0 1 14 0v11M3 21h18M9 21v-9a3 3 0 0 1 6 0v9M3 7h3m12 0h3M2 14h3m14 0h3"/>',
    sword: '<path d="m14 4 6-1-1 6L8 20l-4-4L14 4ZM7 13l5 5M3 21l4-4"/>',
    wand: '<path d="m4 21 10-11m-8 7 3 3M17 2l1.4 4.6L23 8l-4.6 1.4L17 14l-1.4-4.6L11 8l4.6-1.4L17 2Z"/>',
    dagger: '<path d="M12 2 17 9l-5 7-5-7 5-7Zm0 0v14M6 16h12M10 16v5h4v-5M9 22h6"/>',
    heart:
      '<path d="M20.7 5.6a5.5 5.5 0 0 0-7.8 0l-.9.9-.9-.9a5.5 5.5 0 0 0-7.8 7.8L12 22l8.7-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    gem: '<path d="m12 2 9 10-9 10L3 12l9-10ZM3 12h18M12 2l-4 10 4 10 4-10-4-10Z"/>',
    soul: '<path d="M12 2C8 7 4 10 4 15a8 8 0 0 0 16 0c0-4-2-7-4-9 0 4-2 5-3 5-2-2-1-5-1-9Z"/><path d="M12 14c-2 2-3 3-3 5a3 3 0 0 0 6 0c0-2-1-3-3-5Z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="m12 6 4 6-4 6-4-6 4-6Z"/>',
    book: '<path d="M12 5C8 2 4 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-2-1-6-2-10 1Zm0 0v15M5 7l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1"/>',
    trophy:
      '<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5m-5 1h10"/>',
    settings:
      '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/><path d="m18 2 .7 2.3L21 5l-2.3.7L18 8l-.7-2.3L15 5l2.3-.7L18 2Z"/>',
    refresh: '<path d="M20 7A9 9 0 0 0 5 5L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m7 4 14 8-14 8V4Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    eye: '<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 10-12h-7l1-8Z"/>',
    bag: '<path d="M8 7V5a4 4 0 0 1 8 0v2M5 7h14l2 14H3L5 7ZM8 11h8m-8 4h8"/>',
    hammer: '<path d="m5 3 6 1 4 4-5 5-4-4-1-6Zm7 8 9 9-2 2-9-9M14 3l3 3"/>',
    sell: '<path d="M3 4h8l10 10-7 7L3 10V4Z"/><circle cx="7" cy="8" r="1"/>',
    unlock:
      '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 7-2m-3 11v2"/>',
    crown: '<path d="m3 6 5 4 4-7 4 7 5-4-2 13H5L3 6Zm3 10h12"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.gem}</svg>`;
}
export function professionIcon(profession: Profession) {
  const names = { warrior: '战士', mage: '法师', rogue: '盗贼' };
  return `<span class="profession-icon profession-${profession}" role="img" aria-label="${names[profession]}" title="${names[profession]}"><img src="${spriteUrl('ui/status/' + profession)}" alt="" aria-hidden="true"></span>`;
}
export const brand = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="m22 3 19 19-19 19L3 22 22 3Z" stroke="currentColor"/><path d="m22 9 13 13-13 13L9 22 13-13Z" stroke="currentColor" opacity=".4"/><path d="M16 29V19a6 6 0 0 1 12 0v10M13 29h18M20 29v-7a2 2 0 0 1 4 0v7" stroke="currentColor" stroke-width="1.3"/><path d="M22 3v4m19 15h-4M22 41v-4M3 22h4" stroke="currentColor"/></svg>`;

export function dungeonArt() {
  return `<svg class="dungeon-art" viewBox="0 0 650 270" fill="none" aria-hidden="true">
    <defs><radialGradient id="portal-glow"><stop stop-color="#79b191" stop-opacity=".15"/><stop offset="1" stop-color="#79b191" stop-opacity="0"/></radialGradient><linearGradient id="portal-light" x2="0" y2="1"><stop stop-color="#91bd9b" stop-opacity=".14"/><stop offset="1" stop-color="#91bd9b" stop-opacity=".025"/></linearGradient></defs>
    <ellipse cx="326" cy="140" rx="220" ry="130" fill="url(#portal-glow)"/>
    <g stroke="#6c8473" stroke-opacity=".22" stroke-width="1"><path d="M96 240h458M119 227h412M139 216h372M161 208h329M187 198h277M206 193h238"/><path d="m277 193-24 47m98-47 29 47m-79-47-9 47m38-47 11 47"/><path d="M216 194V99a109 109 0 0 1 218 0v95M227 194V99a98 98 0 0 1 196 0v95M241 194V99a84 84 0 0 1 168 0v95"/><path d="M247 194v-90a78 78 0 0 1 156 0v90"/><path d="m217 80 24 5m-15-34 26 13m-7-41 20 23m5-39 11 27m18-35 3 29m26-28-3 30m28-21-11 28m34-15-21 22m31-1-25 13m29 14-24 5"/><path d="M180 192V42h35m219 0h35v150M179 81h35m-35 37h35m-35 37h35m220-74h36m-36 37h36m-36 37h36M160 190V31h41m249 0h39v159"/>
    <path d="M70 181h87m-64-38h64m-40-36h40m334 74h94m-94-38h66m-66-36h44"/></g>
    <path d="M249 191v-88a76 76 0 0 1 152 0v88Z" fill="url(#portal-light)"/>
    <g stroke="#99bc9f" stroke-opacity=".45"><path d="m325 45 15 15-15 15-15-15 15-15Zm0 5v20m-10-10h20"/><path d="M266 115v57m116-57v57M261 119h10m106 0h10M261 164h10m106 0h10"/></g>
    <g stroke="#527663" stroke-opacity=".5"><path d="M190 42c-11 20 1 41-13 60s-6 44-21 64m23-78 15-7m-17 15-13-4m1 45 13-9m-15 18-12-4M461 51c13 18 0 31 12 47s4 35 18 50m-18-59-15-6m20 27 12-3m-5 24-11-4"/></g>
    <g fill="#a4c9ad"><circle cx="116" cy="63" r="1" opacity=".6"/><circle cx="530" cy="96" r="1.3" opacity=".5"/><circle cx="288" cy="110" r="1" opacity=".6"/><circle cx="363" cy="154" r="1.2" opacity=".4"/><circle cx="293" cy="175" r="1" opacity=".4"/><circle cx="428" cy="24" r="1" opacity=".6"/></g>
    <g stroke="#a5b296" stroke-opacity=".55"><path d="M139 167v-13m-4 5h8m-4 8-6 15h12l-6-15Zm377 0v-13m-4 5h8m-4 8-6 15h12l-6-15Z"/></g>
  </svg>`;
}

export function enemyArt(boss: boolean, species: number, elite = false) {
  const data = ENEMIES[species] ?? ENEMIES[0],
    color = data.color;
  const forms: Record<string, string> = {
    wraith:
      '<path d="M28 112 36 76C19 51 31 18 60 17s41 34 24 59l8 36-19-9-13 12-13-12-19 9Z"/><path d="M44 48c-4-24 36-24 32 0l-7 22H51l-7-22Z" fill="#101912"/><path d="m47 50 8 3m10 0 8-3M44 79l-7 22m46 0-7-22"/>',
    skeleton:
      '<path d="M39 32a21 21 0 0 1 42 0v19l-10 8v10H49V59l-10-8V32Z"/><path d="M48 41h7m10 0h7m-16 13 4-7 4 7m-11 6v7m7-7v7m7-7v7M60 69v34m-17-27 17 7 17-7m-32 12 15 5 15-5M40 70 25 91l8 7m47-28 15 21-8 7M60 103l-16 19m16-19 16 19"/><path d="m15 92 15-13 6 7-15 13Z"/>',
    slime:
      '<path d="M16 99C9 81 30 73 34 51c4-23 18-29 31-18 14 10 13 29 27 35 15 7 20 31 6 37-21 10-69 10-82-6Z"/><path d="M38 87c-11-7-2-16 0-22m38-10c-2-12-8-16-15-14" opacity=".6"/><ellipse cx="45" cy="78" rx="3" ry="5" fill="currentColor"/><ellipse cx="69" cy="78" rx="3" ry="5" fill="currentColor"/><path d="m50 90 8 3 8-3"/>',
    bat: '<path d="m56 36-8-18-5 18-7-4C24 30 8 40 3 61l19-3 3 20 19-5 8 16 8-6 8 6 8-16 19 5 3-20 19 3c-5-21-21-31-33-29l-7 4-5-18-8 18Z"/><path d="m47 48 7 3m12 0 7-3M44 39 22 53m54-14 22 14m-51 17 13 10 13-10"/>',
    spider:
      '<ellipse cx="60" cy="58" rx="22" ry="26"/><ellipse cx="60" cy="90" rx="16" ry="16"/><path d="M39 48 22 33 7 57m31 2L18 53 6 81m34-9L20 77l-7 27m31-17-12 19 6 18m43-76 17-15 15 24M82 59l20-6 12 28M80 72l20 5 7 27M76 87l12 19-6 18"/><path d="M50 84h5m10 0h5m-23 6h5m16 0h5m-18 9 5 6 5-6"/>',
    treant:
      '<path d="m44 117 2-32-13-13-4-20-15-11-4-19 14 13 16 7 5 19 3-30-9-16 15 8 6-18 6 18 15-8-9 16 3 30 5-19 16-7 14-13-4 19-15 11-4 20-13 13 2 32-17-7-16 7Z"/><path d="M50 51h5m10 0h5m-17 17 7 4 7-4m-9 10-3 19m13-18 3 19m-35-34-8 7m66-7 8 7"/>',
    cultist:
      '<path d="m30 117 7-40-13-16 16-25L60 7l20 29 16 25-13 16 7 40H30Z"/><path d="m60 23 16 37-16 13-16-13 16-37Z" fill="#10151a"/><path d="M52 55h5m6 0h5M47 82l13 12 13-12m-13-4v26M22 83v40m-4-42 4-14 4 14M86 40l21-12m-4-6 10 8-6 9"/>',
    knight:
      '<path d="m40 19 20-9 20 9 4 31-13 14 12 9 10 33-20-5-13 13-13-13-20 5 10-33 12-9-13-14 4-31Z"/><path d="M60 12v50m-20-28h40m-34 8h28m-23 8h18M39 73l21 14 21-14M49 91v12m22-12v12M20 65v50m-5-46h10m-4-17-6 16h10l-4-16ZM87 76l22 7-4 24-13 7-10-15 5-23Z"/>',
    watcher:
      '<path d="M8 67c22-44 82-44 104 0-22 44-82 44-104 0Z"/><circle cx="60" cy="67" r="23"/><circle cx="60" cy="67" r="9" fill="currentColor"/><path d="M19 52 10 40m26-1-5-15m30 11V16m29 23 5-15m6 28 10-12M36 88l-9 22m22-14-3 24m19-24 4 24m16-30 11 22"/>',
    goblin:
      '<path d="m41 40-22-15 8 27 11 6-6 16 13 23-8 18h17l6-17 6 17h17l-8-18 13-23-6-16 11-6 8-27-22 15-5-15H46l-5 15Z"/><path d="m43 49 10 3m14 0 10-3M51 68l9 8 9-8m-26 10 17 8 17-8M24 78 8 97l4 7 19-20m65-6 8 18-6 12"/>',
    golem:
      '<path d="m33 30 17-16h20l17 16-4 27 12 13 6 29-20 5-9-26 4 36H61l-1-21-1 21H44l4-36-9 26-20-5 6-29 12-13-4-27Z"/><path d="M47 35h9m9 0h9M45 48l15 8 15-8m-28 13 13 10 13-10-13-8-13 8Zm-7 12-8 6m48-6 8 6M49 82l-8 7m30-7 8 7"/><path d="m56 61 4-5 4 5-4 7-4-7Z" fill="currentColor"/>',
    wolf: '<path d="m30 75 14-19 12-4 6-24 8 19 17-13-3 26 19 6-10 17-18-2-4 27H59l-2-22-17 7-4 18H21l5-27-15-7 19-2Z"/><path d="m75 65 7-1M48 70l16 5m25-1 6-4M14 78 5 60l17 13"/>',
    mushroom:
      '<path d="M17 62C18 29 37 11 60 11s42 18 43 51c-23 9-63 9-86 0Z"/><path d="M42 68 37 110q23 17 46 0L78 68Z"/><circle cx="40" cy="42" r="8"/><circle cx="77" cy="35" r="6"/><circle cx="61" cy="51" r="5"/><path d="M49 85h5m12 0h5m-17 13h12"/>',
    serpent:
      '<path d="M64 14 84 29l-4 24-15 11c34 8 30 39 0 39-22 0-27 7-21 16-22-6-27-32-2-43 17-7 21-11 14-16L43 52l-4-23 25-15Z"/><path d="m47 34 10 4m15-4-9 4m-11 12 7 7 11-7m-6 6v10m-7 13c27-1 23 14 5 13"/>',
    ogre: '<path d="M38 25 53 15h20l13 18-6 23 15 12 6 28-17 5-10-25 5 39H61l-6-31-5 31H32l8-42-12 26-17-9 15-29 13-8-1-28Z"/><path d="M47 37h8m9 0h8m-26 13 6 12h17l5-12m-20 1v9m11-9v9M21 74 9 62l-5 8 12 11M97 86l16-41-9-5-15 38"/>',
    beetle:
      '<path d="M37 35a23 23 0 0 1 46 0v50a23 23 0 0 1-46 0V35Z"/><path d="M60 38v70M38 54l22 14 22-14m-44 23 22 15 22-15M48 20 39 9m33 11 9-11M38 39 18 32 8 48m30 10L16 61 7 85m31-5-15 22 9 18m50-81 20-7 10 16M82 58l22 3 9 24M82 80l15 22-9 18"/><path d="M49 31h5m12 0h5"/>',
    harpy:
      '<path d="M42 41c-4-30 40-30 36 0l-7 23 10 26-12 24-9-11-9 11-12-24 10-26-7-23Z"/><path d="m43 55-34-25 4 42 15 10-5-19 23 10m31-18 34-25-4 42-15 10 5-19-23 10M49 36h6m10 0h6m-17 11 6 7 6-7M47 83l13 9 13-9"/>',
    dragon:
      '<path d="m43 48-10-24 20 9 7-22 7 22 20-9-10 24 8 17 24-29-5 49-21-10-8 27-15-7-15 7-8-27-21 10-5-49 24 29 8-17Z"/><path d="m44 49 11 4m10 0 11-4M49 63l11 13 11-13M43 86l17 9 17-9m-17 9v21l-18 8m-14-58-10-16m74 16 10-16"/><path d="m53 92 7-10 7 10-7 9-7-9Z" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 120 130" class="enemy-portrait ${boss ? 'boss' : elite ? 'elite-portrait' : ''}" style="color:${color}" fill="none" aria-hidden="true"><ellipse cx="60" cy="117" rx="40" ry="5" fill="currentColor" opacity=".08"/>${boss ? '<circle cx="60" cy="64" r="52" stroke="currentColor" stroke-dasharray="2 7" opacity=".4"/>' : ''}<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" fill="currentColor" fill-opacity=".09">${forms[data.form] ?? forms.wraith}</g>${boss ? '<path d="m39 16-3-12 15 6 9-10 9 10 15-6-3 12" stroke="#e2be7d" stroke-width="1.7"/>' : elite ? '<path d="m98 8 8 8-8 8-8-8 8-8Z" stroke="#bba3dc" fill="#392e45"/>' : ''}</svg>`;
}

export function equipmentArt(item: Equipment | string, quality: Quality = 'white', size = 54) {
  const kind = typeof item === 'string' ? item : item.artKind;
  const q = typeof item === 'string' ? quality : item.quality;
  const shapes: Record<string, string> = {
    sword:
      '<path d="m34 7 10-3-3 10-21 29-6-6L34 7ZM13 31l14 12M10 51l9-12"/><path d="m34 11 6 3"/>',
    dagger: '<path d="m38 12 9-3-2 10-19 22-7-6 19-23ZM17 29l15 13m-19 7 10-11"/>',
    axe: '<path d="m19 50 20-39m-5-5c-1 10-10 14-21 9l2 16c11 2 21-5 23-16l13 7 3-12-20-4Z"/>',
    staff: '<path d="M28 53 36 18M22 7l10-4 9 7-6 10-11-3-2-10Zm6 1 4 5 5-5M27 41l7 2"/>',
    bow: '<path d="M17 8c24 2 32 26 23 42M17 8 40 50m-25-3 35-29m-11 1 11-1-2 11M24 6l-8 8M42 43l-7 8"/>',
    spear: '<path d="m12 53 31-40m-5-5 10-6 2 11-9 10-6-6 3-9ZM27 34l5 4"/>',
    hammer: '<path d="m15 49 20-24m-8-16 16-5 12 11-17 16-18-14 7-8Zm-2 7 12 9m1-13 8 7"/>',
    scythe: '<path d="m22 54 9-43M10 9c28-12 43 7 44 26-10-13-20-17-36-14l-8-12Z"/>',
    orb: '<circle cx="32" cy="24" r="14"/><path d="m32 12 6 12-6 12-6-12 6-12ZM17 45l15-6 15 6-6 8H23l-6-8Zm15-6v-1"/>',
    leather:
      '<path d="m23 8 9 7 9-7 12 12-9 8-3 25H23l-3-25-9-8L23 8ZM25 24h14M26 33h12M26 43h12"/>',
    plate:
      '<path d="m22 7 10 7 10-7 12 13-11 9-3 23H24l-3-23-11-9L22 7ZM24 21l8 8 8-8m-8 8v23M23 40l9 5 9-5"/>',
    cloak: '<path d="M23 6h18l12 46-21-8-21 8L23 6Zm0 0 9 16L41 6M24 30l-5 14m21-14 5 14"/>',
    robe: '<path d="m23 6 9 9 9-9 12 9-7 14-6-8 6 33H18l6-33-6 8-7-14 12-9Zm9 9v38M23 33h18"/>',
    shield:
      '<path d="m32 5 21 8v17c0 12-13 22-21 27-8-5-21-15-21-27V13l21-8Zm0 8 13 5v11c0 7-7 15-13 20-6-5-13-13-13-20V18l13-5Zm-7 15 7-9 7 9-7 9-7-9Z"/>',
    helmet:
      '<path d="M15 26a17 17 0 0 1 34 0v21l-11 8-6-17-6 17-11-8V26Zm17-14v27m-17-7h34M20 5l12 8 12-8m-24 29h7m10 0h7"/>',
    mail: '<path d="m23 8 9 6 9-6 14 12-10 9-5 24H24l-5-24-10-9L23 8ZM22 25l5 5 5-5 5 5 5-5m-20 9 5 5 5-5 5 5 5-5m-18 9 4 5 4-5 4 5 4-5"/>',
    boots:
      '<path d="M14 8h15l-2 27 10 12-3 7H12l-2-11 4-35Zm23-1h14l-1 28 9 11-3 7H37l-3-11 3-35ZM13 20h15m8-1h14"/>',
    amulet:
      '<path d="M16 7c-2 13 3 19 16 26C45 26 50 20 48 7M32 27l15 15-15 15-15-15 15-15Zm0 8 7 7-7 7-7-7 7-7Z"/>',
    ring: '<circle cx="32" cy="36" r="17"/><circle cx="32" cy="36" r="12"/><path d="m23 9 9-6 9 6-4 11H27L23 9Zm4 1h10m-5-5v13"/>',
    pendant:
      '<path d="M13 4c0 10 4 17 19 25C47 21 51 14 51 4M32 24l10 11-3 17H25l-3-17 10-11Zm0 7v16"/>',
    sigil:
      '<circle cx="32" cy="31" r="23"/><path d="m32 13 5 12 12 6-12 6-5 12-5-12-12-6 12-6 5-12Zm0 7v22m-11-11h22"/>',
    hourglass:
      '<path d="M17 6h30M17 54h30M20 6v11l12 13-12 13v11m24-48v11L32 30l12 13v11M24 14h16m-16 34 8-9 8 9H24Z"/>',
    book: '<path d="m14 9 31-5 6 45-31 8-6-48ZM20 16l20-3m-19 10 20-3m-11 12 8 2-5 9-8-2 5-9Zm15-28 7 5 5 41-6-1"/>',
    flask:
      '<path d="M24 4h16v15l12 23c3 7-2 13-8 13H20c-6 0-11-6-8-13l12-23V4Zm-4 0h24M24 14h16M19 34h26m-23 8 6 6m10-11 3 4"/>',
    skull:
      '<path d="M15 25a17 17 0 0 1 34 0v14l-10 6v10H25V45l-10-6V25Zm7 4h6m8 0h6m-14 12 4-7 4 7m-8 7v7m8-7v7"/>',
    crystal:
      '<path d="m32 3 16 15-5 29-11 12-11-12-5-29L32 3ZM16 18h32M21 47h22M32 3l-7 15 7 41 7-41-7-15Z"/>',
    herbs:
      '<path d="M31 56V29m0 14C9 45 6 26 12 17c16 2 23 11 19 26Zm0-8C50 36 60 20 53 8c-17 1-25 13-22 27ZM13 20l18 23m19-29L31 34m-7 18 7 4 9-3"/>',
    'poison-sac':
      '<path d="M25 5h14v12l12 14c8 15-1 25-19 25S5 46 13 31l12-14V5Zm-4 0h22m-18 9h14M32 25c-8 11-12 19 0 19s8-8 0-19Z"/><circle cx="22" cy="47" r="2"/>',
    whetstone:
      '<path d="m8 35 36-12 13 12-36 16L8 35Zm0 0v8l13 15 36-17v-6M21 51v7m-8-36L36 5l8 3-3 7-20 19-8-12Zm6 9 5-5m25-9 5-7m-1 14 8-1"/>',
    'thorn-plate':
      '<path d="m22 12 10 7 12-7 7 14-9 24-12 7-11-10-6-20 9-15Zm3 10 13 4-2 21-10-6-1-19ZM15 25l-9-7 7 20m30-17 12-9-5 23M20 45l-9 6 15 3m16-11 11 5-16 8"/>',
  };
  const accent: Record<string, string> = {
    herbs: '#a3c98d',
    'poison-sac': '#9dbf86',
    'thorn-plate': '#c1b18c',
    pendant: '#a9c8e5',
    sigil: '#d6ad7e',
    whetstone: '#bdc5bc',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" class="item-art" style="color:${accent[kind] ?? QUALITIES[q].color}" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor" fill-opacity=".1">${shapes[kind] ?? shapes.sword}</g></svg>`;
}
