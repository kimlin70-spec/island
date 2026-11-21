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
const GATE     = { id: 'gate',     type: 'build',  icon: 'icon_gate' };
const HOE      = { id: 'hoe',      type: 'tool',   icon: 'icon_hoe' };
const CAN      = { id: 'watering_can', type: 'tool', icon: 'icon_watering_can' };
const FARM     = { id: 'farm',     type: 'farm',   icon: 'icon_farm', name: '밭 갈기' };   // (3단계) 괭이가 있을 때만 (13.3)
const BURROW   = { id: 'burrow',   type: 'build',  icon: 'icon_burrow' };   // (지하) 17.2
// (지하) 지하 가구 (17.6). 지하에서 만들기 창을 열면 시설 카드 대신 이 카드들
const UG_CARDS = ['bed', 'fireplace', 'lantern', 'planter', 'table', 'stool', 'rug', 'chest'].map((id) => ({ id, type: 'build', icon: 'icon_' + id }));
// (지하 꾸미기) 꾸미기 탭 (19.1, 19.8). kind: floor 바닥재, cover 벽판, wall 벽 장식, item 양탄자·서 있는 장식(가구처럼 놓는다)
const D = (id, kind, icon) => ({ id, type: 'decor', kind, icon: 'icon_' + icon });
const L = (id, kind, icon) => ({ id, type: 'loot', kind, icon: 'icon_' + icon });
export const DECOR_CARDS = [D('floorOak', 'floor', 'floor_oak'), D('floorWalnut', 'floor', 'floor_walnut'), D('floorStone', 'floor', 'floor_stone'),
  D('wallWood', 'cover', 'wall_wood'), D('wallPlaster', 'cover', 'wall_plaster'), D('shelf', 'wall', 'shelf'), D('sconce', 'wall', 'sconce'), D('painting', 'wall', 'painting')];
export const LOOT_CARDS = [L('rugPersian', 'item', 'rug_persian'), L('rugRound', 'item', 'rug_round'), L('rugRunner', 'item', 'rug_runner'),
  L('flag', 'wall', 'flag'), L('wheel', 'wall', 'wheel'), L('map', 'wall', 'map'), L('candelabra', 'item', 'candelabra'), L('globe', 'item', 'globe'),
  L('treasure', 'item', 'treasure'), L('barrel', 'item', 'barrel')];
export const LOOT = LOOT_CARDS.map((c) => c.id);
export const decorCard = (id) => [...DECOR_CARDS, ...LOOT_CARDS].find((c) => c.id === id) || null;
const REMOVE   = { id: 'remove',   type: 'remove', icon: 'icon_remove', name: '치우기', note: '절반 돌려받음' };
// 1단계: 한 줄. (사용자 요청) 망루를 1단계부터 지을 수 있다(문서 11.3 은 2단계부터). 그래서 6장 -> 7장
export const CARDS = [AXE, PICKAXE, FENCE, CAMPFIRE, TENT, WATCH, REMOVE];
// 2단계: 10장 두 줄(11.3). (3단계, 사용자와 정함) 셋째 줄에 문. 농사 카드(Phase 12)도 셋째 줄에 더한다
export const CARDS2 = [AXE, PICKAXE, GUN, FENCE, WIRE, CAMPFIRE, TENT, WATCH, GUNTOWER, REMOVE, GATE, HOE, CAN, BURROW];
// tools: 가진 도구. 괭이가 있으면 밭 갈기 카드가 셋째 줄 끝에 생긴다(13.3)
// under: (지하) 지하에 있다. 도구 카드, 지하 가구 카드, 치우기 (17.6). 세 줄(5, 5, 4)
// tab: (지하) 'make' | 'decor'. 꾸미기 탭은 윗줄 재료 8장, 아랫줄 전리품 10장
export function cardsFor(stage, tools = [], under = false, tab = 'make') {
  if (under && tab === 'decor') return [...DECOR_CARDS, ...LOOT_CARDS];
  if (under) return [...CARDS2.filter((c) => c.type === 'tool'), ...UG_CARDS, REMOVE];
  if (stage < 2) return CARDS;
  return tools.includes('hoe') ? [...CARDS2, FARM] : CARDS2;
}

function source(card) {
  if (card.type === 'decor' || card.type === 'loot') return { name: CONFIG.decor.names[card.id], cost: CONFIG.decor.cost[card.id] };   // 전리품은 재료 없음
  return card.type === 'tool' ? CONFIG.tools[card.id] : card.type === 'build' ? CONFIG.build[card.id] : card;   // 치우기, 밭 갈기는 카드에 적힌 이름
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

// 받침이 있으면 '이', 없으면 '가'
export function subjectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
}

// 받침이 있으면 '을', 없으면 '를'
export function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
}
