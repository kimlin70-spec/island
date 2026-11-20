import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile, worldToTileFloat } from '../iso.js';
import { isTower } from './TowerSystem.js';

// 짓기와 치우기 (5.4). 시설: 울타리, 모닥불, 텐트, (2단계) 철조망, 망루, 총 타워, (3단계) 문.
export const REMOVE = 'remove';
const SPRITE = { fence: 'build_fence_0', campfire: 'build_campfire', tent: 'build_tent', wire: 'build_wire_0',
                 watchtower: 'build_watchtower', guntower: 'build_guntower', gate: 'build_gate_col' };
const TALL = { tent: true, watchtower: true, guntower: true };   // 캐릭터를 가릴 수 있는 키 큰 시설(3.4)
const BROKEN = { wire: ['iron'], guntower: ['stone1', 'stone2'] };   // 부서질 때의 조각(12.6). 그 밖은 나무
const OPEN = { wire: true };            // 길을 막지 않는 시설(누구나 지나간다, 11.4)
const LINKED = { fence: 'build_fence_', wire: 'build_wire_', gate: true };   // 이웃한 같은 시설끼리 이어지는 그림(3.6, 11.4, 13.2)
// 이어지는 무리: 울타리는 문과도 이어진다(13.2). 문 그림은 이어진 울타리의 방향으로 고른다(gateKey)
const LINK_GROUP = { fence: ['fence', 'gate'], gate: ['fence', 'gate'], wire: ['wire'] };
const ICON = { wood: 'icon_wood', stone: 'icon_stone', iron: 'icon_iron' };

export class BuildSystem {
  constructor(scene) {
    this.scene = scene;
    this.map = scene.map;
    this.mode = null;        // null | 'fence' | 'campfire' | 'tent' | 'remove'  (만들기 창에서 고른 카드)
    this.spot = null;        // 포인터가 있는 자리 { tiles, ok }
    // 바닥 표시: 지을 수 있음 / 없음. 텐트는 네 칸에 보여 준다.
    this.marks = [0, 1, 2, 3].map(() => scene.add.image(0, 0, 'overlay_ok').setDepth(CONFIG.depth.floor).setVisible(false));
    // (2단계) 탑의 사거리 원(11.5, 11.10): 지을 칸 둘레와, 지은 탑을 눌렀을 때 rangeShowTime 초
    this.range = scene.add.image(0, 0, 'overlay_range').setDepth(CONFIG.depth.floor).setVisible(false);
    this.rangeLeft = 0;
    // (사용자 요청) 지을 수 있는 거리: 짓는 동안 주인공 둘레에 reach 칸의 원. 탑의 사거리 원과 같은 그림, 다른 색.
    const RC = CONFIG.build.reachCircle;
    this.reachRing = scene.add.image(0, 0, 'overlay_range').setDepth(CONFIG.depth.floor).setTint(RC.tint).setAlpha(RC.alpha).setVisible(false);
  }

  get building() { return this.mode !== null && this.mode !== REMOVE; }   // 시설을 짓는 상태인가

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.rangeLeft = 0;                              // 눌러서 띄운 사거리 원도 짓기 상태가 바뀌면 숨긴다
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

  // 지을 수 있는 칸: 땅이고, 나무·돌·덤불·다른 시설(철조망 포함)이 없고, 캐릭터가 서 있지 않고, 주인공에게서 reach 칸 안.
  // 그루터기와 돌 부스러기 위에는 지을 수 있다.
  canBuildAt(col, row) {
    const m = this.map, p = this.scene.player;
    if (!m.isOpen(col, row) || m.anyStructureAt(col, row)) return false;
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
    if (isTower(this.mode)) this.showRange(tiles[0], this.mode, 0);
    this.spot = { tiles, ok: all };   // 네 칸 모두 지을 수 있어야 한다
  }

  hideMarks() {
    for (const mark of this.marks) mark.setVisible(false);
    if (this.rangeLeft <= 0) this.range.setVisible(false);
    this.spot = null;
  }

  // 사거리 원: 칸 t 를 가운데로, type 의 사거리만큼. time 초 뒤에 숨는다(0 이면 짓기 표시처럼 포인터를 따라간다)
  showRange(t, type, time) {
    const R = CONFIG.build[type].range, S = CONFIG.tower.rangeSize, w = tileToWorld(t.col, t.row);
    this.range.setPosition(w.x, w.y).setDisplaySize(S[0] * R, S[1] * R).setVisible(true);
    this.rangeLeft = time;
  }

  // 클릭하거나 손을 뗐을 때: 표시가 overlay_ok 였으면 그 칸에 바로 짓는다. 치우기를 골랐으면 누른 시설을 없앤다.
  commit(wx, wy) {
    if (this.mode === REMOVE) {
      const t = worldToTile(wx, wy);
      const s = this.map.pickObject(wx, wy, this.map.structures) || this.map.anyStructureAt(t.col, t.row);
      if (s) this.remove(s);
      return;
    }
    if (!this.building) return;
    this.point(wx, wy);
    if (!this.spot.ok) return;
    const type = this.mode;
    if (!this.scene.inventory.pay(CONFIG.build[type].cost)) return;
    const s = this.place(type, this.spot.tiles);
    this.popUp(s);
    this.scene.sfx.play('construct', { at: s.sprite });
    this.scene.onBuilt(s);
    this.point(wx, wy);                              // 방금 지은 칸은 이제 지을 수 없는 칸이다
    // 짓기 상태는 유지된다. 더 지을 수 없게 되면 풀린다.
    if (this.atMax(type)) {
      this.setMode(null);
    } else if (!this.canAfford(type)) {
      this.scene.error('재료가 부족합니다');
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
      blocks: !OPEN[type],                           // 철조망만 false
    };
    if (isTower(type)) scene.towers.attach(s);           // 포탑(11.10)
    if (type === 'gate') s.open = false;                  // (3단계) 문: 열려 있는가(보이는 것만. 적은 늘 막힌다)
    if (type === 'campfire') {
      // 불꽃 애니메이션과 빛무리(월드에 ADD로 올린다. 모닥불 바로 위)
      sprite.play(SPRITE[type] + '_burn');
      s.glow = scene.add.image(w.x + a.flame[0], w.y + a.flame[1], 'glow_warm')
        .setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(cfg.glow.size, cfg.glow.size)
        .setAlpha(cfg.glow.day).setDepth(sprite.depth + 1);
    }
    this.map.addStructure(s);
    if (LINKED[type]) this.refreshLinks(type, s.col, s.row);
    scene.onMapChanged();
    scene.events.emit('structures-changed');
    return s;
  }

  // 지었을 때 (12.7, 12.6): 튀어나오듯 커지고, 먼지(작게)와 반짝임, 먼지 조각
  popUp(s) {
    const F = CONFIG.fx, fx = this.scene.effects, sp = s.sprite;
    fx.pop(sp);                                      // 포탑은 TowerSystem 이 받침의 크기를 따라 놓는다
    fx.dust(sp.x, sp.y, F.buildDustScale);
    fx.play('fx_sparkle', sp.x, sp.y - sp.displayHeight * sp.originY * 0.5);
    fx.burst(['dust'], F.chips.build, sp.x, sp.y);
  }

  // 치우기: 없애고 재료의 절반(내림)을 돌려준다. 울타리는 돌려받는 것이 없다.
  remove(s) {
    const fx = this.scene.effects, x = s.sprite.x, y = s.sprite.y;
    let line = 0;
    for (const [item, n] of Object.entries(s.cfg.cost)) {
      const back = Math.floor(n * CONFIG.build.refundRate);
      if (back <= 0) continue;
      this.scene.inventory.add(item, back);
      if (!line) this.scene.sfx.play('pickup');
      fx.popup(x, y - 40 - line++ * (CONFIG.fx.popupIcon + 2), ICON[item], '+' + back);
    }
    this.destroy(s);
  }

  // 시설을 없앤다(재료 없이). 들어가 있던 텐트면 주인공은 들어갔던 칸(텐트 옆)으로 나온다.
  // broken: 적에게 부서졌다 -> 나무 조각과 먼지 (12.7). 아니면(치우기) fx_poof.
  destroy(s, broken = false) {
    if (this.scene.rest.tent === s) this.scene.rest.exit();
    const fx = this.scene.effects, sp = s.sprite;
    if (broken) {
      this.scene.sfx.play('collapse', { at: sp });
      fx.burst(BROKEN[s.type] || ['wood1', 'wood2'], CONFIG.fx.chips.broken, sp.x, sp.y - CONFIG.fx.impactHeight.object);
      fx.dust(sp.x, sp.y);
    } else {
      fx.poof(sp.x, sp.y);
    }
    fx.removeBar(s);
    this.map.removeStructure(s);
    s.sprite.destroy();
    if (s.glow) s.glow.destroy();
    if (s.turret) this.scene.towers.detach(s);
    if (LINKED[s.type]) this.refreshLinks(s.type, s.col, s.row);
    this.scene.onMapChanged();
    this.scene.events.emit('structures-changed');
  }

  // 적이 시설을 쳤다: 체력이 깎이고, 깎인 동안 체력 막대를 보여 준다. 0이 되면 부서져 사라진다. (5.4)
  // 맞은 곳은 기준점에서 30px 위를 때린 쪽(from)으로 조금 당긴 곳 (12.4)
  damage(s, n, from) {
    const sp = s.sprite;
    s.hp -= n;
    this.scene.effects.impact(sp.x, sp.y - CONFIG.fx.impactHeight.object, from ? from.foot() : null);
    if (s.hp <= 0) {
      this.destroy(s, true);
      return;
    }
    this.scene.effects.showBar(s, s.hp / s.maxHp, sp.x, sp.y - sp.displayHeight * sp.originY - CONFIG.fx.barGap, Infinity);
  }

  // 아침: 남아 있는 시설의 체력이 가득 찬다 (5.10)
  repairAll() {
    for (const s of this.map.structures) {
      s.hp = s.maxHp;
      this.scene.effects.removeBar(s);
    }
  }

  // (3단계) 문 열고 닫기 (13.2): 주인공이 openRange 칸 안에 오면 open 과 gate_open, closeRange 칸보다 멀어지면 close 와 gate_close.
  // 텐트 안의 주인공은 문 곁에 없는 것으로 본다. (친구가 된 동물은 Phase 13 에서 더한다)
  updateGates() {
    const G = CONFIG.build.gate, p = this.scene.player, out = this.scene.rest.resting;
    for (const s of this.map.structures) {
      if (s.type !== 'gate') continue;
      const d = out ? Infinity : Math.hypot(p.col - s.col, p.row - s.row);
      if (!s.open && d <= G.openRange) this.swingGate(s, true);
      else if (s.open && d > G.closeRange) this.swingGate(s, false);
    }
  }

  swingGate(s, open) {
    s.open = open;
    s.sprite.play(s.sprite.texture.key + (open ? ':open' : ':close'));
    this.scene.sfx.play(open ? 'gate_open' : 'gate_close', { at: s.sprite });
  }

  // 지을 수 있는 거리의 원: 짓는 상태(치우기 제외)에서 주인공의 발을 가운데로. canBuildAt 의 reach 와 같은 원이다.
  syncReach() {
    const p = this.scene.player, on = this.building && !p.downed;
    this.reachRing.setVisible(on);
    if (!on) return;
    const R = CONFIG.build.reach, S = CONFIG.tower.rangeSize, w = tileToWorld(p.col, p.row);
    this.reachRing.setPosition(w.x, w.y).setDisplaySize(S[0] * R, S[1] * R);
  }

  // 밤에는 모닥불마다 불꽃에서 불티가 emberEvery 초마다 하나씩 오른다 (12.6). 지은 탑을 눌러 띄운 사거리 원을 시간이 되면 숨긴다.
  update(dt) {
    this.syncReach();
    this.updateGates();
    if (this.rangeLeft > 0 && (this.rangeLeft -= dt) <= 0 && !isTower(this.mode)) this.range.setVisible(false);
    if (!this.scene.clock.isNight) return;
    const F = CONFIG.fx, flame = this.map.assets.build_campfire.flame;
    for (const s of this.map.structures) {
      if (s.type !== 'campfire') continue;
      s.emberLeft = (s.emberLeft === undefined ? F.emberEvery : s.emberLeft) - dt;
      while (s.emberLeft <= 0) {
        s.emberLeft += F.emberEvery;
        this.scene.effects.burst(['ember'], F.chips.ember, s.sprite.x + flame[0], s.sprite.y + flame[1], 'ember');
      }
    }
  }

  // 모닥불 빛무리의 진하기: 낮 glow.day ~ 밤 glow.night (3.7). strength: 지금의 빛 세기(0~1)
  updateGlow(strength) {
    for (const s of this.map.structures) {
      if (s.glow) s.glow.setAlpha(s.cfg.glow.day + (s.cfg.glow.night - s.cfg.glow.day) * strength);
    }
  }

  // 울타리·철조망 연결 (3.6, 11.4): 이웃 칸에 같은 무리의 시설이 있는 방향으로 이어진다. build_fence_0~15, build_wire_0~15.
  // 울타리와 철조망은 서로 이어지지 않는다. 울타리는 문과 이어진다(문 칸도 울타리로 본다, 13.2).
  sameAt(type, col, row) {
    const s = this.map.anyStructureAt(col, row);
    return !!s && LINK_GROUP[type].includes(s.type);
  }

  // 문 그림 (13.2): 이웃 울타리(문 포함)가 col 방향에 있으면 build_gate_col, row 방향이면 build_gate_row. 둘 다이거나 없으면 col
  gateKey(col, row) {
    const c = this.sameAt('gate', col + 1, row) || this.sameAt('gate', col - 1, row);
    const r = this.sameAt('gate', col, row + 1) || this.sameAt('gate', col, row - 1);
    return r && !c ? 'build_gate_row' : 'build_gate_col';
  }

  // 문 그림을 고르고, 열려 있으면 열린 모습(open3), 아니면 닫힌 모습(closed)
  setGateTexture(s) {
    const key = this.gateKey(s.col, s.row), frames = this.map.assets[key].frames;
    s.sprite.setTexture(key, frames.indexOf(s.open ? 'open3' : 'closed'));
  }

  linkMask(type, col, row) {
    const has = (c, r) => this.sameAt(type, c, r);
    return (has(col + 1, row) ? 1 : 0) | (has(col - 1, row) ? 2 : 0) | (has(col, row + 1) ? 4 : 0) | (has(col, row - 1) ? 8 : 0);
  }

  // 그 칸과 이웃 네 칸의 type 그림을 다시 고른다
  refreshLinks(type, col, row) {
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!this.sameAt(type, col + dc, row + dr)) continue;
      const s = this.map.anyStructureAt(col + dc, row + dr);
      if (s.type === 'gate') this.setGateTexture(s);
      else s.sprite.setTexture(LINKED[s.type] + this.linkMask(s.type, s.col, s.row));
    }
  }

  // (2단계) 철조망이 적을 다치게 할 때마다 체력이 1 준다. 0이 되면 사라진다(11.4, 12.7: 조각과 먼지).
  wear(s) {
    s.hp -= 1;
    if (s.hp <= 0) {
      this.destroy(s, true);
      return;
    }
    // 철조망 위에는 적이 서 있으므로 막대는 철조망 아래쪽(칸의 앞 끝)에 둔다(적의 얼굴에 걸리지 않게)
    const sp = s.sprite;
    this.scene.effects.showBar(s, s.hp / s.maxHp, sp.x, sp.y + CONFIG.fx.wireBarDrop, Infinity);
  }
}
