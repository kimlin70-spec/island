import { CONFIG } from '../config.js';
import { decorCard, LOOT } from './Crafting.js';
import { hitLevel, tapPop } from './Pick.js';

// 지하 꾸미기와 해적 전리품 (19장, Phase 20).
//   바닥재(19.2): 파낸 칸마다. floors: 'c,r' -> 'oak' | 'walnut' | 'stone'. 그림은 Underground.build 가 고른다.
//   벽판(19.3): 방 안쪽 벽마다. covers: 'fc,fr,l|r' -> 'wood' | 'plaster'. 벽은 (그 벽이 선 칸, 쪽)으로 기억한다.
//   벽 장식(19.4): 방 안쪽 벽마다 하나. wallDecos: 'fc,fr,l|r' -> { type, sprite, glow, on }
//   양탄자와 서 있는 장식(19.5)은 가구처럼 UgHome 이 놓는다(전리품은 가진 수로 센다).
//   전리품(19.6): 해적을 쓰러뜨리면 꾸러미가 떨어지고, 주우면 가진 수 +1.
const FLOOR = { floorOak: 'oak', floorWalnut: 'walnut', floorStone: 'stone' };
const COVER = { wallWood: 'wood', wallPlaster: 'plaster' };
const WALL_KEY = { shelf: 'deco_shelf', sconce: 'deco_sconce', painting: 'deco_painting', flag: 'deco_flag', wheel: 'deco_wheel', map: 'deco_map' };
const ICON = { wood: 'icon_wood', stone: 'icon_stone', iron: 'icon_iron' };
const isLoot = (id) => LOOT.includes(id);

export class Decor {
  constructor(scene) {
    this.scene = scene;
    this.floors = new Map();
    this.covers = new Map();
    this.wallDecos = new Map();
    this.loot = Object.fromEntries(LOOT.map((id) => [id, 0]));   // 가진 전리품
    this.dropped = false;          // 게임에서 처음 쓰러뜨린 해적은 반드시 떨어뜨린다
    this.drops = [];               // 떨어진 꾸러미 { sprite, col, row, map, sparkleLeft }
    this.tinted = [];              // 짓기 상태에서 빛깔을 준 벽 조각
    this.runnerRow = false;        // 긴 양탄자를 row 방향으로 놓는가
  }

  get ug() { return this.scene.ug; }
  key(c, r, side) { return c + ',' + r + (side ? ',' + side : ''); }

  // 꾸미기 카드인가: 바닥재, 벽판, 벽 장식(양탄자와 서 있는 장식은 가구처럼 UgHome)
  isMode(mode) { const c = decorCard(mode); return !!c && c.kind !== 'item'; }
  kind(mode) { const c = decorCard(mode); return c ? c.kind : null; }
  has(id) { return (this.loot[id] || 0) > 0; }
  give(id, n = 1) { this.loot[id] = (this.loot[id] || 0) + n; this.scene.events.emit('loot-changed'); }
  take(id) { if (!this.has(id)) return false; this.give(id, -1); return true; }
  canAfford(mode) { return isLoot(mode) ? this.has(mode) : this.scene.inventory.has(CONFIG.decor.cost[mode]); }
  // 재료를 낸다(전리품은 가진 수 −1)
  pay(mode) { return isLoot(mode) ? this.take(mode) : this.scene.inventory.pay(CONFIG.decor.cost[mode]); }
  // 걷을 때 돌려받기: 재료는 절반(내림), 전리품은 그대로 (19.5). 떠오르는 아이콘과 "+n"
  refund(mode, x, y) {
    const scene = this.scene, fx = scene.effects;
    if (isLoot(mode)) { this.give(mode); fx.popup(x, y - 40, decorCard(mode).icon, '+1'); scene.sfx.play('pickup'); return; }
    let line = 0;
    for (const [item, n] of Object.entries(CONFIG.decor.cost[mode])) {
      const back = Math.floor(n * CONFIG.build.refundRate);
      if (back <= 0) continue;
      scene.inventory.add(item, back);
      if (!line) scene.sfx.play('pickup');
      fx.popup(x, y - 40 - line++ * (CONFIG.fx.popupIcon + 2), ICON[item], '+' + back);
    }
  }
  modeOf(map, value) { return Object.keys(map).find((k) => map[k] === value); }

  // ── 짓기 상태 (19.2~19.4): 포인터 자리의 표시와 누르면 놓기 ──

  // 바닥재: 포인터 칸에 overlay_ok/no. 벽판·벽 장식: 포인터 아래의 벽 조각에 빛깔
  point(mode, wx, wy) {
    const b = this.scene.build;
    this.clearMarks();
    for (const m of b.marks) m.setVisible(false);
    if (this.kind(mode) === 'floor') {
      const t = this.ug.tileAt(wx, wy), ok = this.canFloor(mode, t), w = this.ug.world(t.col, t.row);
      b.marks[0].setTexture(ok ? 'overlay_ok' : 'overlay_no').setPosition(w.x, w.y).setVisible(true);
      return { ok, tile: t };
    }
    const piece = this.ug.pickWall(wx, wy);
    if (!piece) return { ok: false };
    const ok = this.canWall(mode, piece.wall);
    for (const p of this.ug.pieces) if (p.wall && this.key(p.wall.fc, p.wall.fr, p.wall.side) === this.key(piece.wall.fc, piece.wall.fr, piece.wall.side)) {
      p.img.setTint(ok ? CONFIG.decor.okTint : CONFIG.decor.noTint);
      this.tinted.push(p.img);
    }
    return { ok, wall: piece.wall };
  }

  clearMarks() { for (const img of this.tinted) if (img.active) img.clearTint(); this.tinted = []; }

  // 깔 수 있는 칸: 파낸 칸, reach 안, 같은 바닥재가 아님(가구·사다리·캐릭터는 상관없다)
  canFloor(mode, t) {
    const p = this.scene.player;
    return this.ug.isDug(t.col, t.row) && this.scene.build.inReach(t.col, t.row) && this.floors.get(this.key(t.col, t.row)) !== FLOOR[mode];
  }

  // 댈·달 수 있는 벽: 그 벽이 선 칸이 파낸 칸(방 안), reach 안. 벽판은 같은 벽판이 아님. 벽 장식은 장식이 없고 벽난로가 등진 벽이 아님
  canWall(mode, w) {
    const p = this.scene.player, k = this.key(w.fc, w.fr, w.side);
    if (!this.ug.isDug(w.fc, w.fr) || !this.scene.build.inReach(w.fc, w.fr)) return false;
    if (this.kind(mode) === 'cover') return this.covers.get(k) !== COVER[mode];
    return !this.wallDecos.has(k) && !this.fireplaceWalls().has(k);
  }

  // 벽난로가 등진 벽: 벽난로 칸의 l 벽(뒤집었으면 r)
  fireplaceWalls() {
    return new Set(this.scene.home.list.filter((f) => f.type === 'fireplace').map((f) => this.key(f.col, f.row, f.sprite.flipX ? 'r' : 'l')));
  }

  // 누르거나 손을 뗐다: 바로 놓는다. 놓았으면 true
  commit(mode, spot) {
    if (!spot || !spot.ok || !this.canAfford(mode)) return false;
    const kind = this.kind(mode);
    if (kind === 'floor') this.layFloor(mode, spot.tile);
    else if (kind === 'cover') this.coverWall(mode, spot.wall);
    else this.hangDeco(mode, spot.wall);
    return true;
  }

  // 바닥재를 깐다. 다른 바닥재가 있으면 바꿔 깐다(전 바닥재는 절반을 돌려받는다). floor_place, fx_dust 0.5배
  layFloor(mode, t) {
    const scene = this.scene, k = this.key(t.col, t.row), old = this.floors.get(k), w = this.ug.world(t.col, t.row);
    if (!this.pay(mode)) return;
    if (old) this.refund(this.modeOf(FLOOR, old), w.x, w.y);
    this.floors.set(k, FLOOR[mode]);
    this.ug.build();
    scene.sfx.play('floor_place', { at: w });
    scene.effects.dust(w.x, w.y, CONFIG.decor.floorDust);
    if ([...this.floors.values()].filter((v) => v === 'oak').length >= CONFIG.todo5.floor) scene.todo.check('oakFloor');
  }

  // 벽판을 댄다. 다른 벽판이 있으면 바꿔 댄다(절반). floor_place
  coverWall(mode, wl) {
    const scene = this.scene, k = this.key(wl.fc, wl.fr, wl.side), old = this.covers.get(k), w = this.ug.world(wl.fc, wl.fr);
    if (!this.pay(mode)) return;
    if (old) this.refund(this.modeOf(COVER, old), w.x, w.y - 60);
    this.covers.set(k, COVER[mode]);
    this.ug.build();
    scene.sfx.play('floor_place', { at: w });
    if (this.covers.size >= CONFIG.todo5.cover) scene.todo.check('covers');
  }

  // 벽 장식을 단다: 왼쪽 위 벽 그림. 오른쪽 위 벽이면 뒤집는다. depth = 10 + 그 칸 y − 20.5 (19.4)
  hangDeco(mode, wl) {
    const scene = this.scene, key = WALL_KEY[mode], a = scene.map.assets[key], w = this.ug.world(wl.fc, wl.fr);
    if (!this.pay(mode)) return;
    const sprite = scene.add.sprite(w.x, w.y, key, 0).setOrigin(a.originX, a.originY).setFlipX(wl.side === 'r')
      .setDepth(CONFIG.depth.objectBase + w.y - 20.5);
    const d = { type: mode, sprite, glow: null, on: false, ...wl };
    if (mode === 'sconce') {
      const L = CONFIG.decor.light, at = this.flameAt(sprite);
      d.glow = scene.add.image(at.x, at.y, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(L.sconce.glow, L.sconce.glow).setAlpha(L.glowAlpha).setDepth(sprite.depth + 1);
      this.setSconce(d, true);
    }
    this.wallDecos.set(this.key(wl.fc, wl.fr, wl.side), d);
    scene.sfx.play('floor_place', { at: w });
    const b = sprite.getBounds();
    scene.effects.dust(b.centerX, b.centerY, CONFIG.decor.wallDust);
    scene.todo.check('wallDeco');
  }

  // 불꽃 자리: 기준점 + flame(뒤집으면 x 를 반대로)
  flameAt(sprite) {
    const f = this.scene.map.assets[sprite.texture.key].flame;
    return { x: sprite.x + (sprite.flipX ? -f[0] : f[0]), y: sprite.y + f[1] };
  }

  setSconce(d, on) {
    d.on = on;
    d.glow.setVisible(on);
    if (on) d.sprite.play('deco_sconce:burn');
    else d.sprite.stop().setFrame(this.scene.map.assets.deco_sconce.frames.indexOf('off'));
  }

  // 누른 벽 장식: 벽 촛대는 끄고 켠다(ui_click). 나머지는 그 벽을 누른 것(파기 -> "꾸민 벽은 먼저 치우세요")
  press(d) {
    if (d.type === 'sconce') { this.setSconce(d, !d.on); this.scene.sfx.play('ui_click'); tapPop(this.scene, d.sprite); return true; }
    return false;
  }

  // 그 흙 덩어리(c, r)의 벽이 꾸며져 있는가: (c+1, r, l), (c, r+1, r) 에 벽판이나 벽 장식 (19.3)
  decorated(c, r) {
    const a = this.key(c + 1, r, 'l'), b = this.key(c, r + 1, 'r');
    return this.covers.has(a) || this.covers.has(b) || this.wallDecos.has(a) || this.wallDecos.has(b);
  }

  // 벽 장식이 선 흙 덩어리 칸
  blockOf(d) { return d.side === 'l' ? { col: d.fc - 1, row: d.fr } : { col: d.fc, row: d.fr - 1 }; }

  // (x, y)에 있는 벽 장식(그림의 진한 곳 또는 가까이). 없으면 null
  pickWallDeco(x, y) {
    let best = null;
    for (const d of this.wallDecos.values()) {
      if (hitLevel(this.scene, d.sprite, x, y) && (!best || d.sprite.depth > best.sprite.depth)) best = d;
    }
    return best;
  }

  // ── 치우기 (지하): 가구 -> 벽 장식 -> 벽판 -> 바닥재(그 칸에 가구가 없을 때) ──

  removeAt(wx, wy) {
    const home = this.scene.home, t = this.ug.tileAt(wx, wy);
    const hit = this.ug.pick(wx, wy);                // (검사) 누르기와 같은 규칙으로 고른다(빗나간 탭이 옆 가구를 치우지 않게)
    if (hit && hit.furniture) { home.remove(hit.furniture); return; }
    if (hit && hit.wallDeco) { this.removeDeco(hit.wallDeco); return; }
    const piece = this.ug.pickWall(wx, wy);
    if (piece) {
      const k = this.key(piece.wall.fc, piece.wall.fr, piece.wall.side);
      if (this.wallDecos.has(k)) { this.removeDeco(this.wallDecos.get(k)); return; }   // 장식이 먼저
      if (this.covers.has(k)) { this.removeCover(k, piece.wall); return; }
    }
    const rug = home.at(t.col, t.row, true);
    if (rug) { home.remove(rug); return; }
    const k = this.key(t.col, t.row);
    if (this.floors.has(k) && !home.at(t.col, t.row)) {
      const w = this.ug.world(t.col, t.row);
      this.refund(this.modeOf(FLOOR, this.floors.get(k)), w.x, w.y);
      this.floors.delete(k);
      this.ug.build();
      this.scene.effects.poof(w.x, w.y);
    }
  }

  removeDeco(d) {
    const sp = d.sprite, b = sp.getBounds();
    this.refund(d.type, b.centerX, b.centerY);
    this.scene.effects.poof(b.centerX, b.centerY);
    sp.destroy();
    if (d.glow) d.glow.destroy();
    this.wallDecos.delete(this.key(d.fc, d.fr, d.side));
  }

  removeCover(k, wl) {
    const w = this.ug.world(wl.fc, wl.fr);
    this.refund(this.modeOf(COVER, this.covers.get(k)), w.x, w.y - 60);
    this.covers.delete(k);
    this.ug.build();
    this.scene.effects.poof(w.x, w.y - 50);
  }

  // ── 해적 전리품 (19.6) ──

  // 해적이 쓰러졌다: loot.chance 의 확률(처음 쓰러뜨린 해적은 반드시)로 그 자리에 꾸러미
  onKill(e) {
    if (e.kind === 'zombie') return;
    const L = CONFIG.loot, first = L.firstAlways && !this.dropped;
    if (!first && Math.random() >= L.chance) return;
    this.dropped = true;
    this.drop(e.here(), e.map, e.yOff);              // 쓰러진 몸에 가장 가까운 칸
  }

  // 칸 t(그 층의 지도 map)에 꾸러미를 떨어뜨린다: 0.3초 동안 24px 튀었다가 내려앉고 fx_poof 0.5배. 칸을 막지 않는다
  drop(t, map, yOff = 0) {
    const scene = this.scene, L = CONFIG.loot, a = scene.map.assets.obj_loot;
    const x = (t.col - t.row) * 40, y = (t.col + t.row) * 20 + yOff;
    const sprite = scene.add.image(x, y, 'obj_loot').setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.objectBase + y);
    const d = { sprite, col: t.col, row: t.row, map, sparkleLeft: L.sparkleEvery };
    this.drops.push(d);
    scene.effects.run(L.bounceTime, (k) => sprite.setY(y - L.bounce * Math.sin(k * Math.PI)), () => {
      sprite.setY(y);
      const p = scene.add.image(x, y, 'fx_poof').setDepth(CONFIG.depth.fx), F = CONFIG.fx, s = L.poofScale;
      scene.effects.run(F.poofTime, (k) => p.setScale(s * (F.poofFrom + (F.poofTo - F.poofFrom) * k)).setAlpha(1 - k), () => p.destroy());
    });
    return d;
  }

  // (x, y)를 누른 꾸러미(그 층 map 의 것만)
  pickDrop(x, y, map) {
    return this.drops.find((d) => d.map === map && !d.taking && hitLevel(this.scene, d.sprite, x, y) > 0) || null;
  }

  // 꾸러미를 눌렀다: 그 칸으로 걸어가 crouch, hit 프레임에 줍는다(그 칸에 설 수 없으면 옆 칸에서)
  pressDrop(d) {
    const scene = this.scene, pl = scene.player, tile = { col: d.col, row: d.row };
    tapPop(scene, d.sprite);
    const onIt = pl.map.isWalkable(tile.col, tile.row);
    pl.act({
      target: { tiles: [tile] },
      goals: onIt ? () => [tile] : undefined,
      near: onIt ? (at) => at.col === tile.col && at.row === tile.row : undefined,
      tool: () => 'crouch',
      isValid: () => this.drops.includes(d) && !d.taking && d.map === pl.map,
      strike: () => { this.pickUp(d); return true; },
    });
  }

  // 줍는다: loot_pickup, 꾸러미가 0.4초 동안 16px 떠오르며 흐려짐, 아이콘과 "+1", "전리품: 이름"(icon_treasure)
  pickUp(d) {
    const scene = this.scene, L = CONFIG.loot, sp = d.sprite, y0 = sp.y;
    d.taking = true;
    this.drops.splice(this.drops.indexOf(d), 1);
    const id = this.roll();
    this.give(id);
    scene.sfx.play('loot_pickup', { at: sp });
    scene.effects.run(L.pickTime, (k) => sp.setY(y0 - L.pickRise * k).setAlpha(1 - k), () => sp.destroy());
    scene.effects.popup(sp.x, y0 - 40, decorCard(id).icon, '+1');
    scene.notice('전리품: ' + CONFIG.decor.names[id], 'icon_treasure');
    scene.todo.check('loot');
  }

  // 무엇이 나오는지: loot.weights 의 가중치로
  roll() {
    const W = CONFIG.loot.weights, total = Object.values(W).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [id, w] of Object.entries(W)) { if (r < w) return id; r -= w; }
    return LOOT[0];
  }

  // ── 매 프레임 ──

  update(dt) {
    const L = CONFIG.loot;
    for (const d of this.drops) {                    // sparkleEvery 초마다 꾸러미 30px 위에서 반짝
      d.sparkleLeft -= dt;
      if (d.sparkleLeft <= 0) { d.sparkleLeft += L.sparkleEvery; this.scene.effects.play('fx_sparkle', d.sprite.x, d.sprite.y - L.sparkleLift); }
    }
  }

  // 지하의 빛 (19.7): 켜진 벽 촛대와 촛대(가구)
  lights() {
    const L = CONFIG.decor.light, out = [];
    for (const d of this.wallDecos.values()) {
      if (d.type !== 'sconce' || !d.on) continue;
      const at = this.flameAt(d.sprite);
      out.push({ x: at.x, y: at.y, radius: L.sconce.radius, color: L.color, alpha: L.alpha });
    }
    for (const f of this.scene.home.list) {
      if (f.type !== 'candelabra' || !f.on) continue;
      const at = this.flameAt(f.sprite);
      out.push({ x: at.x, y: at.y, radius: L.candelabra.radius, color: L.color, alpha: L.alpha });
    }
    return out;
  }

  // ── 시험용 도구 (19.8) ──
  debugAll() { for (const id of LOOT) this.give(id); }
  // 주인공 옆 칸에 꾸러미
  debugDrop() {
    const scene = this.scene, pl = scene.player, m = pl.map;
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
      const c = pl.tile.col + dc, r = pl.tile.row + dr;
      if (m.isWalkable(c, r)) return this.drop({ col: c, row: r }, m, pl.yOff);
    }
    return null;
  }
}
