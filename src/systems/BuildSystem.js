import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile, worldToTileFloat } from '../iso.js';

// 짓기와 치우기 (5.4). 시설: 울타리, 모닥불, 텐트.
export const REMOVE = 'remove';
const SPRITE = { fence: 'build_fence_0', campfire: 'build_campfire', tent: 'build_tent' };
const TALL = { tent: true };            // 캐릭터를 가릴 수 있는 키 큰 시설
const ICON = { wood: 'icon_wood', stone: 'icon_stone' };

export class BuildSystem {
  constructor(scene) {
    this.scene = scene;
    this.map = scene.map;
    this.mode = null;        // null | 'fence' | 'campfire' | 'tent' | 'remove'  (만들기 창에서 고른 카드)
    this.spot = null;        // 포인터가 있는 자리 { tiles, ok }
    // 바닥 표시: 지을 수 있음 / 없음. 텐트는 네 칸에 보여 준다.
    this.marks = [0, 1, 2, 3].map(() => scene.add.image(0, 0, 'overlay_ok').setDepth(CONFIG.depth.floor).setVisible(false));
  }

  get building() { return this.mode !== null && this.mode !== REMOVE; }   // 시설을 짓는 상태인가

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.hideMarks();
    this.scene.events.emit('build-changed');
  }

  count(type) { return this.map.structures.filter((s) => s.type === type).length; }
  canAfford(type) { return this.scene.inventory.has(CONFIG.build[type].cost); }
  // 텐트는 1개만
  atMax(type) { return CONFIG.build[type].max !== undefined && this.count(type) >= CONFIG.build[type].max; }

  // 포인터가 (wx, wy)에 있을 때 시설이 차지할 칸들. 차지하는 칸 수는 manifest 의 footprint.
  footprint(type, wx, wy) {
    const [w, h] = this.map.assets[SPRITE[type]].footprint || [1, 1];
    if (w === 1 && h === 1) return [worldToTile(wx, wy)];
    const f = worldToTileFloat(wx, wy);
    const col = Math.floor(f.col), row = Math.floor(f.row);
    const tiles = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) tiles.push({ col: col + c, row: row + r });
    return tiles;
  }

  // 지을 수 있는 칸: 땅이고, 나무·돌·덤불·다른 시설이 없고, 캐릭터가 서 있지 않고, 주인공에게서 reach 칸 안.
  // 그루터기와 돌 부스러기 위에는 지을 수 있다.
  canBuildAt(col, row) {
    const m = this.map, p = this.scene.player;
    if (!m.isOpen(col, row) || m.structureAt(col, row)) return false;
    if (this.scene.characterTiles().some((t) => t.col === col && t.row === row)) return false;
    return Math.hypot(col - p.col, row - p.row) <= CONFIG.build.reach;
  }

  // 포인터가 있는 칸에 overlay_ok / overlay_no 를 보여 준다
  point(wx, wy) {
    if (!this.building) return;
    const tiles = this.footprint(this.mode, wx, wy);
    let all = true;
    this.marks.forEach((mark, i) => {
      const t = tiles[i];
      if (!t) { mark.setVisible(false); return; }
      const ok = this.canBuildAt(t.col, t.row);
      const w = tileToWorld(t.col, t.row);
      mark.setTexture(ok ? 'overlay_ok' : 'overlay_no').setPosition(w.x, w.y).setVisible(true);
      all = all && ok;
    });
    this.spot = { tiles, ok: all };   // 네 칸 모두 지을 수 있어야 한다
  }

  hideMarks() {
    for (const mark of this.marks) mark.setVisible(false);
    this.spot = null;
  }

  // 클릭하거나 손을 뗐을 때: 표시가 overlay_ok 였으면 그 칸에 바로 짓는다. 치우기를 골랐으면 누른 시설을 없앤다.
  commit(wx, wy) {
    if (this.mode === REMOVE) {
      const t = worldToTile(wx, wy);
      const s = this.map.pickObject(wx, wy, this.map.structures) || this.map.structureAt(t.col, t.row);
      if (s) this.remove(s);
      return;
    }
    if (!this.building) return;
    this.point(wx, wy);
    if (!this.spot.ok) return;
    const type = this.mode;
    if (!this.scene.inventory.pay(CONFIG.build[type].cost)) return;
    const s = this.place(type, this.spot.tiles);
    this.scene.effects.poof(s.sprite.x, s.sprite.y);
    this.scene.onBuilt(s);
    this.point(wx, wy);                              // 방금 지은 칸은 이제 지을 수 없는 칸이다
    // 짓기 상태는 유지된다. 더 지을 수 없게 되면 풀린다.
    if (this.atMax(type)) {
      this.setMode(null);
    } else if (!this.canAfford(type)) {
      this.scene.notice('재료가 부족합니다');
      this.setMode(null);
    }
  }

  // tiles 에 시설을 놓는다(재료는 따지지 않는다). 그림은 차지한 칸들의 한가운데에 놓는다.
  place(type, tiles) {
    const scene = this.scene, cfg = CONFIG.build[type];
    const col = tiles.reduce((sum, t) => sum + t.col, 0) / tiles.length;
    const row = tiles.reduce((sum, t) => sum + t.row, 0) / tiles.length;
    const w = tileToWorld(col, row), a = this.map.assets[SPRITE[type]];
    for (const t of tiles) this.map.removeDecorAt(t.col, t.row);      // 그루터기와 돌 부스러기는 사라진다

    const sprite = a.frames ? scene.add.sprite(w.x, w.y, SPRITE[type]) : scene.add.image(w.x, w.y, SPRITE[type]);
    sprite.setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.objectBase + w.y);
    const s = {
      type, cfg, sprite, tiles,
      col: tiles[0].col, row: tiles[0].row,
      hp: cfg.hp, maxHp: cfg.hp,
      tall: !!TALL[type], pickable: true,
    };
    if (type === 'campfire') {
      // 불꽃 애니메이션과 빛무리(월드에 ADD로 올린다. 모닥불 바로 위)
      sprite.play(SPRITE[type] + '_burn');
      s.glow = scene.add.image(w.x + a.flame[0], w.y + a.flame[1], 'glow_warm')
        .setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(cfg.glow.size, cfg.glow.size)
        .setAlpha(cfg.glow.day).setDepth(sprite.depth + 1);
    }
    this.map.addStructure(s);
    if (type === 'fence') this.refreshFences(s.col, s.row);
    scene.player.onMapChanged();
    scene.events.emit('structures-changed');
    return s;
  }

  // 치우기: 없애고 재료의 절반(내림)을 돌려준다. 울타리는 돌려받는 것이 없다.
  remove(s) {
    const fx = this.scene.effects, x = s.sprite.x, y = s.sprite.y;
    let line = 0;
    for (const [item, n] of Object.entries(s.cfg.cost)) {
      const back = Math.floor(n * CONFIG.build.refundRate);
      if (back <= 0) continue;
      this.scene.inventory.add(item, back);
      fx.popup(x, y - 40 - line++ * (CONFIG.fx.popupIcon + 2), ICON[item], '+' + back);
    }
    this.destroy(s);
  }

  // 시설을 없앤다(재료 없이). 먼지가 뜬다.
  destroy(s) {
    this.scene.effects.poof(s.sprite.x, s.sprite.y);
    this.scene.effects.removeBar(s);
    this.map.removeStructure(s);
    s.sprite.destroy();
    if (s.glow) s.glow.destroy();
    if (s.type === 'fence') this.refreshFences(s.col, s.row);
    this.scene.events.emit('structures-changed');
  }

  // 울타리 연결 (3.6): 이웃 칸에 울타리가 있는 방향으로 가로대가 이어진다. build_fence_0 ~ build_fence_15
  fenceMask(col, row) {
    const has = (c, r) => { const s = this.map.structureAt(c, r); return !!s && s.type === 'fence'; };
    return (has(col + 1, row) ? 1 : 0) | (has(col - 1, row) ? 2 : 0) | (has(col, row + 1) ? 4 : 0) | (has(col, row - 1) ? 8 : 0);
  }

  // 그 칸과 이웃 네 칸의 울타리 그림을 다시 고른다
  refreshFences(col, row) {
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = this.map.structureAt(col + dc, row + dr);
      if (s && s.type === 'fence') s.sprite.setTexture('build_fence_' + this.fenceMask(s.col, s.row));
    }
  }
}
