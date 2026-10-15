import { pixel, actorArt } from './pixel';
import { spriteName, BRANCHES, cells, definition, PROFESSIONS } from './backpack';
import { QUALITIES } from './data';
import type { Equipment, Profession } from './types';

export function dungeonArt(chapter: number) {
  const tones = [
    ['#263e45', '#7d9b85'],
    ['#353a49', '#b3a98f'],
    ['#263e35', '#7d976c'],
    ['#393541', '#9e8c85'],
    ['#453930', '#ba956a'],
  ][(chapter - 1) % 5];
  return `<svg class="dungeon-art" viewBox="0 0 600 560" aria-hidden="true"><defs><linearGradient id="dungeon-sky" x2="0" y2="1"><stop stop-color="${tones[0]}"/><stop offset="1" stop-color="#111e21"/></linearGradient><radialGradient id="dungeon-light"><stop stop-color="${tones[1]}" stop-opacity=".45"/><stop offset="1" stop-color="${tones[0]}" stop-opacity="0"/></radialGradient></defs><rect width="600" height="560" fill="url(#dungeon-sky)"/><circle cx="455" cy="90" r="34" fill="#dbd6ba" opacity=".35"/><path d="M0 280 60 120 118 235 200 100 267 240 320 158 392 256 480 142 560 240 600 210V560H0Z" fill="#152829"/><path d="M0 400 80 290 133 346 210 277 272 375 340 296 400 361 516 280 600 360V560H0Z" fill="#203131"/><path d="M120 405V250l32-28v-77h60v63h29V185h118v23h29v-63h60v77l32 28v155Z" fill="#4a5049"/><path d="M138 405V260h324v145M180 170v90M420 170v90M255 207h90" fill="none" stroke="#707263" stroke-width="5"/><path d="M238 420V316a62 62 0 0 1 124 0v104Z" fill="#0b191c" stroke="#858271" stroke-width="9"/><path d="M259 420V318a41 41 0 0 1 82 0v102Z" fill="${tones[0]}"/><path d="M120 405H480M153 302h37m220 0h36M255 236h89" stroke="#96917a" stroke-width="3"/><path d="M268 416 215 560H394L330 416Z" fill="#8c8268" opacity=".5"/><path d="M296 418 270 560m52-142 26 142" stroke="#b8ab83" stroke-width="2" opacity=".35"/><ellipse cx="300" cy="387" rx="210" ry="160" fill="url(#dungeon-light)"/><path d="M95 560V370m0 22-37-48m37 74 36-41M518 560V360m0 39 35-40m-35 83-34-50" stroke="#112320" stroke-width="12"/><path d="M218 335v30m163-30v30" stroke="#bca66e" stroke-width="4"/><ellipse cx="218" cy="328" rx="6" ry="12" fill="#e9c786"/><ellipse cx="381" cy="328" rx="6" ry="12" fill="#e9c786"/><path d="M0 475Q110 446 190 466T370 462T600 458M0 508Q90 477 220 498T420 490T600 496" fill="none" stroke="#84958b" stroke-width="14" opacity=".08"/></svg>`;
}

export function shapePath(points: [number, number][], unit = 100) {
  const set = new Set(points.map((p) => p.join(','))),
    edges = new Map<string, [number, number]>();
  for (const [x, y] of points) {
    if (!set.has(`${x},${y - 1}`)) edges.set(`${x},${y}`, [x + 1, y]);
    if (!set.has(`${x + 1},${y}`)) edges.set(`${x + 1},${y}`, [x + 1, y + 1]);
    if (!set.has(`${x},${y + 1}`)) edges.set(`${x + 1},${y + 1}`, [x, y + 1]);
    if (!set.has(`${x - 1},${y}`)) edges.set(`${x},${y + 1}`, [x, y]);
  }
  let result = '';
  while (edges.size) {
    const start = [...edges.keys()][0],
      first = start.split(',').map(Number);
    let key = start;
    result += `M${first[0] * unit},${first[1] * unit}`;
    do {
      const next = edges.get(key)!;
      edges.delete(key);
      result += `L${next[0] * unit},${next[1] * unit}`;
      key = next.join(',');
    } while (key !== start && edges.has(key));
    result += 'Z';
  }
  return result;
}
export function itemPainting(item: Equipment, _rotation = 0, _context = 'item') {
  const points = cells(item),
    w = (Math.max(...points.map((p) => p[0])) + 1) * 100,
    h = (Math.max(...points.map((p) => p[1])) + 1) * 100;
  return `<svg viewBox="0 0 ${w} ${h}" class="item-painting" data-profession="${item.profession}" data-branch="${item.branch}" aria-hidden="true"><image href="${pixel(spriteName(item)!)}" width="${w}" height="${h}"/></svg>`;
}
export function guildArt() {
  return `<svg class="guild-art" viewBox="0 0 900 740" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="guild-sky" x2="0" y2="1"><stop stop-color="#273246"/><stop offset="1" stop-color="#99806c"/></linearGradient><linearGradient id="guild-stone" x2="1" y2="1"><stop stop-color="#a28d6d"/><stop offset="1" stop-color="#5a5547"/></linearGradient></defs><rect width="900" height="740" fill="url(#guild-sky)"/><circle cx="710" cy="120" r="41" fill="#e4d7b4" opacity=".7"/><path d="M0 320 140 150 300 335 470 220 680 330 820 220 900 290v450H0Z" fill="#3f4b49"/><path d="M0 485q180-80 340-16t560-15v286H0Z" fill="#344434"/><g fill="url(#guild-stone)" stroke="#413d33" stroke-width="6"><path d="M180 352h540v284H180Z"/><path d="M125 305h118v340H125Zm532 0h118v340H657Z"/><path d="m97 308 87-161 86 161Zm532 0 87-161 86 161Z" fill="#4a4b48"/><path d="m192 357 258-161 258 161Z" fill="#56494c"/><path d="M291 383h318v253H291Z"/></g><g stroke="#6e5941" stroke-width="8"><path d="M381 636V476q0-96 69-96t69 96v160Z" fill="#2e302c"/><path d="M450 395v241M390 508h120m-120 58h120"/><path d="M207 422h46v77h-46Zm440 0h46v77h-46Z" fill="#e2bc78"/><path d="M158 354h40v89h-40Zm544 0h40v89h-40Z" fill="#dcad66"/></g><path d="M319 326h262v56H319Z" fill="#c2ab77" stroke="#806d45" stroke-width="5"/><text x="450" y="362" text-anchor="middle" font-size="27" fill="#3b3930" font-family="Georgia,serif" letter-spacing="4">ADVENTURERS GUILD</text><g fill="#58755f" stroke="#c4b483" stroke-width="3"><path d="M263 376h35v145l-18-13-17 13Z"/><path d="M602 376h35v145l-18-13-17 13Z"/></g><path d="M377 630h145l55 110H323Z" fill="#867b63"/><g fill="#c29b61"><circle cx="340" cy="608" r="10"/><circle cx="560" cy="608" r="10"/></g><path d="M340 610v66m220-66v66" stroke="#473c2f" stroke-width="8"/><g fill="#18332b"><path d="m61 416-86 160h42l-48 123h162L75 576h32Z"/><path d="m845 387-71 136h31l-48 127h143V506Z"/></g></svg>`;
}
export function heroArt(profession: Profession) {
  return actorArt(profession);
}
