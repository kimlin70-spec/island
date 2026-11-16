import { CONFIG } from '../config.js';
import { bestTool } from './Crafting.js';

// 캐기 (5.2): 나무와 돌에 체력을 붙이고, 도구로 쳐서 깎고, 다 깎이면 재료를 준다.
// 다 캐면 그루터기·돌 부스러기가 남고, 이것은 곡괭이로 파내면 사라진다(사용자 요청: 땅을 고르게 하기).
// 도구의 세기를 고를 때 쓰는 묶음
const GROUP = { tree: 'tree', pine: 'tree', palm: 'tree', rock: 'rock', stump: 'ground', rubble: 'ground' };
const LEFTOVER = { tree: { key: 'obj_stump', kind: 'stump' }, rock: { key: 'obj_rubble', kind: 'rubble' } };   // 다 캐면 남는 장식
const NEED = { rock: '곡괭이가 필요합니다', ground: '곡괭이가 필요합니다' };   // 쓸 도구가 없을 때의 알림
const ICON = { wood: 'icon_wood', stone: 'icon_stone' };

export class NodeSystem {
  constructor(scene) {
    this.scene = scene;
    for (const o of scene.map.objects) this.attach(o);
  }

  // 캘 수 있는 것에 체력을 붙인다. 덤불은 장식이라 붙이지 않는다.
  attach(o) {
    const cfg = CONFIG.nodes[o.kind];
    o.node = cfg ? { cfg, group: GROUP[o.kind], hp: cfg.hp } : null;
  }

  // 지금 가진 도구 중 이 대상에 쓸 것. 없으면 null.
  toolFor(o) { return bestTool(this.scene.tools, o.node.group); }
  needText(o) { return NEED[o.node.group]; }

  // 도구로 한 번 친다(내려치는 순간에 부른다)
  hit(o, tool) {
    const n = o.node;
    if (!n) return;
    const scene = this.scene, fx = scene.effects, s = o.sprite, F = CONFIG.fx;
    const x = s.x, y = s.y;
    const above = s.displayHeight * s.originY;                 // 발에서 그림 꼭대기까지
    n.hp -= CONFIG.tools[tool].power[n.group];
    fx.shake(s);
    // 타격 그림은 주인공 쪽으로 조금 당겨서
    fx.hit(x + Math.sign(scene.player.sprite.x - x) * 10, y - Math.min(F.hitHeight, above * 0.5));
    if (n.hp > 0) {
      fx.showBar(o, n.hp / n.cfg.hp, x, y - above - F.barGap, F.barLinger);
      return;
    }

    fx.removeBar(o);
    o.node = null;
    if (!n.cfg.give) {                                         // 그루터기·돌 부스러기를 파냈다: 땅이 고르게 된다
      fx.poof(x, y - above * 0.4);
      scene.map.removeDecorAt(o.col, o.row);
      return;
    }

    // 다 캤다: 재료를 주고 장식(그루터기, 돌 부스러기)으로 바꾼다
    const amount = n.cfg.amountBySprite ? n.cfg.amountBySprite[o.key] : n.cfg.amount;
    fx.poof(x, y - above * 0.4);
    fx.popup(x, y - above * 0.6, ICON[n.cfg.give], '+' + amount);
    const left = LEFTOVER[n.group];
    scene.map.toDecor(o, left.key, left.kind);
    this.attach(o);
    scene.inventory.add(n.cfg.give, amount);
  }
}
