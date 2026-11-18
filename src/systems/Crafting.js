import { CONFIG } from '../config.js';

// 만들기 창의 카드 (5.3). 이름과 재료는 config.js 의 tools, build 에서 읽는다.
const AXE      = { id: 'axe',      type: 'tool',   icon: 'icon_axe' };
const PICKAXE  = { id: 'pickaxe',  type: 'tool',   icon: 'icon_pickaxe' };
const GUN      = { id: 'gun',      type: 'tool',   icon: 'icon_gun' };
const FENCE    = { id: 'fence',    type: 'build',  icon: 'icon_fence' };
const WIRE     = { id: 'wire',     type: 'build',  icon: 'icon_wire' };
const CAMPFIRE = { id: 'campfire', type: 'build',  icon: 'icon_campfire' };
const TENT     = { id: 'tent',     type: 'build',  icon: 'icon_tent' };
const WATCH    = { id: 'watchtower', type: 'build', icon: 'icon_watchtower' };
const GUNTOWER = { id: 'guntower',   type: 'build', icon: 'icon_guntower' };
const REMOVE   = { id: 'remove',   type: 'remove', icon: 'icon_remove', name: '치우기', note: '절반 돌려받음' };
// 1단계: 6장 한 줄
export const CARDS = [AXE, PICKAXE, FENCE, CAMPFIRE, TENT, REMOVE];
// 2단계: 10장 두 줄(11.3)
export const CARDS2 = [AXE, PICKAXE, GUN, FENCE, WIRE, CAMPFIRE, TENT, WATCH, GUNTOWER, REMOVE];
export function cardsFor(stage) { return stage >= 2 ? CARDS2 : CARDS; }

function source(card) {
  return card.type === 'tool' ? CONFIG.tools[card.id] : card.type === 'build' ? CONFIG.build[card.id] : card;
}
export function cardName(card) { return source(card).name; }
export function cardCost(card) { return source(card).cost || null; }

// 가진 도구(owned) 가운데 대상(group: 'tree' | 'rock' | 'ground' | 'iron' | 'enemy')에 가장 센 것. 쓸 수 있는 도구가 없으면 null.
// 나무는 도끼가 있으면 도끼, 없으면 단검. 돌과 철광석은 곡괭이만. 적은 단검(총이 있으면 총. GameScene.pressEnemy). (5.2, 11.2, 11.6)
export function bestTool(owned, group) {
  let best = null;
  for (const id of owned) {
    const power = CONFIG.tools[id].power[group] || 0;
    if (power > 0 && (!best || power > CONFIG.tools[best].power[group])) best = id;
  }
  return best;
}

// 받침이 있으면 '을', 없으면 '를'
export function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
}
