import { CONFIG } from '../config.js';

// 재료가 나오는 사물(나무, 돌, 덤불) (5.4)
const KIND = { tree: 'tree', pine: 'tree', palm: 'tree', rock: 'rock', bush: 'bush' };
const USED_KEY = { tree: 'obj_stump', rock: 'obj_rubble', bush: 'obj_bush_empty' };   // 다 쓴 모습

export class NodeSystem {
  constructor(scene, mapSystem) {
    this.scene = scene;
    this.map = mapSystem;
    this.nodes = [];
    for (const o of mapSystem.objects) {
      const kind = KIND[o.type];
      if (!kind) continue;
      const cfg = CONFIG.nodes[kind];
      o.node = { kind, cfg, hitsLeft: cfg.hits, depleted: false, morningsLeft: 0, fullKey: o.sprite.texture.key, fullTall: o.tall };
      this.nodes.push(o);
    }
  }

  canHarvest(o) { return !!o.node && !o.node.depleted; }

  // 한 번 캔다. 얻은 것을 돌려준다.
  hit(o) {
    const n = o.node;
    n.hitsLeft -= 1;
    if (n.hitsLeft <= 0) this.deplete(o);
    return { item: n.cfg.give, amount: n.cfg.amount };
  }

  setLook(o, key, tall) {
    const a = this.map.assets[key];
    o.sprite.setTexture(key).setOrigin(a.originX, a.originY).setAlpha(1);
    o.tall = tall;
  }

  deplete(o) {
    const n = o.node;
    n.depleted = true;
    n.morningsLeft = n.cfg.regrowMornings;
    this.setLook(o, USED_KEY[n.kind], false);
  }

  restore(o) {
    const n = o.node;
    n.depleted = false;
    n.hitsLeft = n.cfg.hits;
    this.setLook(o, n.fullKey, n.fullTall);
  }

  // 아침마다 부른다. 다시 생길 때가 된 재료가 돌아온다.
  onMorning() {
    for (const o of this.nodes) {
      if (!o.node.depleted) continue;
      o.node.morningsLeft -= 1;
      if (o.node.morningsLeft <= 0) this.restore(o);
    }
  }
}
