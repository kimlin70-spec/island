import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { bestTool } from './Crafting.js';

// 캐기 (5.2): 나무와 돌에 체력을 붙이고, 도구로 쳐서 깎고, 다 깎이면 재료를 준다.
// 다 캐면 그루터기·돌 부스러기가 남고, 이것은 곡괭이로 파내면 사라진다(사용자 요청: 땅을 고르게 하기).
// 칠 때와 다 캤을 때의 움직임은 12.6, 12.7.
// 도구의 세기를 고를 때 쓰는 묶음
const GROUP = { tree: 'tree', pine: 'tree', palm: 'tree', rock: 'rock', stump: 'ground', rubble: 'ground' };
const LEFTOVER = { tree: { key: 'obj_stump', kind: 'stump' }, rock: { key: 'obj_rubble', kind: 'rubble' } };   // 다 캐면 남는 장식
const NEED = { rock: '곡괭이가 필요합니다', ground: '곡괭이가 필요합니다' };   // 쓸 도구가 없을 때의 알림
const ICON = { wood: 'icon_wood', stone: 'icon_stone' };
// 조각 (12.6). 잎은 단풍나무(obj_tree_w1)만 leaf3
const WOOD = ['wood1', 'wood2'], STONE = ['stone1', 'stone2'];
const leavesOf = (key) => (key === 'obj_tree_w1' ? ['leaf3'] : ['leaf1', 'leaf2']);

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

  // 도구로 한 번 친다(내려치는 순간에 부른다). 피해가 들어갔으면 true.
  hit(o, tool) {
    const n = o.node;
    if (!n) return false;
    const scene = this.scene, fx = scene.effects, s = o.sprite, F = CONFIG.fx, C = F.chips;
    const { x, y } = tileToWorld(o.col, o.row);                // 그림의 기준점(흔들리기 전의 자리)
    const above = s.displayHeight * s.originY;                 // 발에서 그림 꼭대기까지
    n.hp -= CONFIG.tools[tool].power[n.group];
    // 맞은 곳 (12.4): 나무·돌은 기준점에서 30px 위. 그루터기·돌 부스러기는 낮아서 그림 높이의 절반을 넘지 않게.
    const lift = n.group === 'ground' ? Math.min(F.hitHeight, above * 0.5) : F.impactHeight.object;
    const p = fx.impact(x, y - lift, scene.player.foot());
    if (n.group === 'tree') {
      fx.burst(WOOD, C.treeHit[0], p.x, p.y);
      fx.burst(leavesOf(o.key), C.treeHit[1], p.x, p.y);
    } else if (n.group === 'rock') {
      fx.burst(STONE, C.rockHit[0], p.x, p.y);
      fx.burst(['dust'], C.rockHit[1], p.x, p.y);
    }
    if (n.hp > 0) {
      fx.shake(s);
      fx.showBar(o, n.hp / n.cfg.hp, x, y - above - F.barGap, F.barLinger);
      return true;
    }

    fx.stopShake(s);
    fx.removeBar(o);
    o.node = null;
    if (!n.cfg.give) {                                         // 그루터기·돌 부스러기를 파냈다: 땅이 고르게 된다
      fx.poof(x, y - above * 0.4);
      scene.map.removeDecorAt(o.col, o.row);
      return true;
    }

    // 다 캤다: 재료를 주고 장식(그루터기, 돌 부스러기)으로 바꾼다 (12.7)
    const amount = n.cfg.amountBySprite ? n.cfg.amountBySprite[o.key] : n.cfg.amount;
    fx.popup(x, y - above * 0.6, ICON[n.cfg.give], '+' + amount);
    if (n.group === 'tree') {
      // 나무는 주인공 반대쪽으로 넘어간다. 주인공이 바로 위나 아래에 있으면 주인공이 보는 쪽으로.
      const pl = scene.player, dx = x - pl.foot().x;
      const dir = dx > 0 ? 1 : dx < 0 ? -1 : (pl.sprite.flipX ? -1 : 1);
      fx.fall(o.key, x, y, s.depth, dir, leavesOf(o.key));
    } else {
      fx.dust(x, y);
      fx.burst(STONE, C.rockBreak, x, y - lift);
    }
    const left = LEFTOVER[n.group];
    scene.map.toDecor(o, left.key, left.kind);
    this.attach(o);
    scene.inventory.add(n.cfg.give, amount);
    return true;
  }
}
