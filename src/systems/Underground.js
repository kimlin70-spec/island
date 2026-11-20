import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';

// 지하 생활 (17장, Phase 17): 굴 입구, 오르내리기, 칸 조각 고르기, 파기, 빛과 소리.
// 지하는 같은 GameScene 안의 월드 y + ug.offsetY 자리에 있다. 씬은 그대로 두고 카메라와 주인공(따라다니는 동물)만 옮긴다.
// 지하의 칸은 땅 위와 따로인 격자다. 주인공과 동물은 지하에 있는 동안 걷는 지도(map)를 이 격자(this.grid)로 바꾼다.
export class Underground {
  constructor(scene) {
    this.scene = scene;
    const F = (scene.mapData.underground || { floors: [] }).floors[0];
    this.floor = F;
    this.active = false;       // 주인공이 지하에 있는가
    this.busy = false;         // 오르내리는 중(누르기를 받지 않는다)
    this.pieces = [];          // 지금 놓인 칸 조각 { img, target: [c, r] | null, kind }
    this.hp = new Map();       // 파다 만 칸의 깎인 수
    this.cracks = new Map();   // 칸 -> 금 그림
    this.dugCount = 0;         // 주인공이 판 칸 수(할 일)
    this.marked = [];          // 표시(빛깔)한 벽 조각
    this.burrow = null;        // 내려간 굴 입구
    this.surfaceSpot = null;   // 내려갈 때 섰던 땅 위의 칸
    if (!F) return;
    const K = (t) => t.col + ',' + t.row;
    this.dug = new Set(F.startDug.map(K));
    this.ores = new Set(F.ores.map(K));
    this.spores = new Set(F.spores.map(K));
    this.holeKey = K(F.sealedHole);
    // 주인공과 동물이 지하에서 쓰는 걷는 지도(MapSystem 의 필요한 것만)
    const g = this;
    this.grid = {
      cols: F.cols, rows: F.rows, assets: scene.map.assets,
      isWalkable: (c, r) => g.standable(c, r), isPassable: (c, r) => g.standable(c, r), isOpen: (c, r) => g.standable(c, r),
      isLand: (c, r) => g.isDug(c, r), isSand: () => false,
      objectAt: () => null, structureAt: () => null, wireAt: () => null, anyStructureAt: () => null,
    };
  }

  get exists() { return !!this.floor; }
  key(c, r) { return c + ',' + r; }
  inBounds(c, r) { return c >= 0 && r >= 0 && c < this.floor.cols && r < this.floor.rows; }
  isDug(c, r) { return this.inBounds(c, r) && this.dug.has(this.key(c, r)); }
  // 설 수 있는 칸: 파낸 칸이고 막힌 구멍이 아니다(가구는 Phase 18)
  standable(c, r) { return this.isDug(c, r) && this.key(c, r) !== this.holeKey; }
  tall(c, r) { return !this.isDug(c, r) && (this.isDug(c + 1, r) || this.isDug(c, r + 1) || this.isDug(c + 1, r + 1)); }
  solid(c, r) { return this.isDug(c, r) || this.tall(c, r); }

  // 지하 칸 가운데의 월드 좌표 (17.2)
  world(c, r) { const w = tileToWorld(c, r); return { x: w.x, y: w.y + CONFIG.ug.offsetY }; }
  tileAt(wx, wy) { return worldToTile(wx, wy - CONFIG.ug.offsetY); }

  // ── 칸 조각 고르기 (17.3) ──

  build() {
    for (const p of this.pieces) p.img.destroy();
    this.pieces = [];
    this.marked = [];
    const F = this.floor, A = this.scene.map.assets;
    const place = (key, c, r, depth, target = null) => {
      const a = A[key], w = this.world(c, r);
      const img = this.scene.add.image(w.x, w.y, key).setOrigin(a.originX, a.originY).setDepth(depth);
      this.pieces.push({ img, target, kind: key.startsWith('ug_wall') ? 'wall' : key === 'ug_cap' ? 'cap' : key === 'ug_pillar' ? 'pillar' : 'floor' });
    };
    for (let r = -1; r <= F.rows; r++) for (let c = -1; c <= F.cols; c++) {
      const y = this.world(c, r).y;
      if (this.isDug(c, r)) place('ug_floor_' + ((c * 7 + r * 3) % 3 + 1), c, r, 1);
      if (this.solid(c, r)) {
        if (!this.solid(c, r + 1)) place('ug_cut_l', c, r, 1.5);
        if (!this.solid(c + 1, r)) place('ug_cut_r', c, r, 1.5);
      }
      if (this.tall(c, r)) {
        place('ug_cap', c, r, 10 + y - 1.5, [c, r]);
        for (const [side, fc, fr] of [['l', c + 1, r], ['r', c, r + 1]]) {
          if (this.tall(fc, fr)) continue;
          const k = this.key(c, r);
          const kind = this.ores.has(k) ? 'iron' : this.spores.has(k) ? 'mush'
            : (this.isDug(fc, fr) && (c * 7 + r * 13 + (side === 'l' ? 3 : 0)) % 5 === 0) ? 'b' : 'a';
          place('ug_wall_' + side + '_' + kind, fc, fr, 10 + this.world(fc, fr).y - 21, [c, r]);
        }
      }
      if (this.isDug(c, r) && this.tall(c - 1, r) && this.tall(c, r - 1)) place('ug_pillar', c, r, 10 + y - 20.5);
    }
  }

  // 사다리, 햇빛 기둥, 막힌 구멍(처음 내려갈 때 한 번 만든다)
  makeFixtures() {
    if (this.ladder) return;
    const A = this.scene.map.assets, F = this.floor, e = this.world(F.entry.col, F.entry.row);
    this.ladder = this.scene.add.image(e.x, e.y, 'ug_ladder').setOrigin(A.ug_ladder.originX, A.ug_ladder.originY).setDepth(10 + e.y);
    this.shaft = this.scene.add.image(e.x, e.y, 'glow_shaft').setOrigin(A.glow_shaft.originX, A.glow_shaft.originY)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(this.ladder.depth + 1);
    const h = this.world(F.sealedHole.col, F.sealedHole.row), ha = A.ug_hole;
    this.hole = this.scene.add.sprite(h.x, h.y, 'ug_hole', ha.frames.indexOf('locked')).setOrigin(ha.originX, ha.originY).setDepth(10 + h.y);
    this.build();
  }

  // ── 오르내리기 (17.2) ──

  // 굴 입구를 눌렀다: 붙은 칸으로 걸어가서 내려간다
  pressBurrow(b) {
    const scene = this.scene;
    if (!this.exists || this.busy) return;
    scene.player.act({ target: b, isValid: () => scene.map.structures.includes(b) && !this.active, arrive: () => this.goDown(b) });
  }

  goDown(b) {
    const scene = this.scene, U = CONFIG.ug, pl = scene.player, A = scene.map.assets.build_burrow;
    this.busy = true;
    this.burrow = b;
    this.surfaceSpot = { col: pl.tile.col, row: pl.tile.row };
    b.sprite.setFrame(A.frames.indexOf('open'));
    pl.stopAction();
    pl.body.play('crouch');
    scene.time.delayedCall(U.crouchMs, () => {
      scene.cameras.main.fadeOut(U.fadeMs, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', () => {
        b.sprite.setFrame(A.frames.indexOf('closed'));
        this.switchTo(true);
        scene.cameras.main.fadeIn(U.fadeMs, 0, 0, 0);
        this.climb(false, () => { this.busy = false; scene.todo.check('down'); });
      });
    });
  }

  // 사다리를 눌렀다: 사다리 칸으로 걸어가서 올라간다
  pressLadder() {
    const pl = this.scene.player, e = this.floor.entry;
    if (pl.tile.col === e.col && pl.tile.row === e.row && !pl.moving) { this.goUp(); return; }
    if (pl.goTo(e.col, e.row)) this.upPending = true;
  }

  goUp() {
    const scene = this.scene, U = CONFIG.ug;
    this.upPending = false;
    this.busy = true;
    scene.player.stopAction();
    this.climb(true, () => {
      scene.cameras.main.fadeOut(U.fadeMs, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', () => {
        this.switchTo(false);
        scene.cameras.main.fadeIn(U.fadeMs, 0, 0, 0);
        this.busy = false;
      });
    });
  }

  // 사다리 오르내리기: 사다리 칸의 150px 위 <-> 사다리 칸, climbMs 동안 climb. 올라갈 때는 흐려진다. ladder 소리 두 번
  climb(up, done) {
    const scene = this.scene, U = CONFIG.ug, pl = scene.player, sp = pl.sprite, e = this.world(this.floor.entry.col, this.floor.entry.row);
    pl.held = true;
    sp.setDepth(this.ladder.depth + 1).setPosition(e.x, up ? e.y : e.y - U.climbRise).setAlpha(1);
    sp.play('char_player:climb');
    scene.sfx.play('ladder', { at: e });
    scene.time.delayedCall(U.climbMs / 2, () => scene.sfx.play('ladder', { at: e }));
    scene.tweens.add({ targets: sp, y: up ? e.y - U.climbRise : e.y, alpha: up ? 0 : 1, duration: U.climbMs, onComplete: () => {
      pl.held = false;
      pl.body.playing = null;
      if (!up) sp.setAlpha(1);
      done();
    } });
  }

  // 지하로(true) / 땅 위로(false) 옮긴다: 주인공과 따라다니는 동물, 카메라, 바탕색, 소리, 날씨
  switchTo(down) {
    const scene = this.scene, U = CONFIG.ug, pl = scene.player, cam = scene.cameras.main;
    this.active = down;
    let at;
    if (down) {
      this.makeFixtures();
      at = this.floor.entry;
      pl.map = this.grid;
      pl.yOff = U.offsetY;
      const F = this.floor, a = this.world(0, F.rows), b = this.world(F.cols, 0), top = this.world(0, 0), bot = this.world(F.cols, F.rows);
      cam.setBounds(a.x - U.boundsPad, top.y - U.boundsPad - 200, b.x - a.x + U.boundsPad * 2, bot.y - top.y + U.boundsPad * 2 + 200);
      cam.setBackgroundColor(U.background);
    } else {
      pl.map = scene.map;
      pl.yOff = 0;
      at = this.surfaceTile();
      const G = scene.map.ground;
      cam.setBounds(G.x, G.y, G.width, G.height);
      cam.setBackgroundColor(CONFIG.screen.background);
      pl.sprite.setAlpha(1);
    }
    pl.path.length = 0;
    pl.col = at.col; pl.row = at.row; pl.tile = { col: at.col, row: at.row };
    pl.syncSprite();
    cam.centerOn(pl.sprite.x, pl.sprite.y);
    scene.pets.follow(down ? this.grid : scene.map, down ? U.offsetY : 0);
    scene.setAmbience(!down && scene.clock.isNight);
    scene.events.emit('ug-changed', down);
  }

  // 올라올 칸: 내려갈 때 섰던 칸. 막혔으면 굴 입구(없으면 그 칸) 둘레의 가까운 빈 칸
  surfaceTile() {
    const m = this.scene.map, s = this.surfaceSpot || { col: this.scene.player.col, row: this.scene.player.row };
    if (m.isWalkable(s.col, s.row)) return s;
    const c = this.burrow ? { col: this.burrow.col, row: this.burrow.row } : s;
    for (let d = 1; d < 6; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (m.isWalkable(c.col + dc, c.row + dr)) return { col: c.col + dc, row: c.row + dr };
    }
    return s;
  }

  // ── 누르기와 파기 (17.4) ──

  onPress(wx, wy) {
    if (this.busy) return;
    const hit = this.pick(wx, wy);
    if (hit === 'ladder') { this.pressLadder(); return; }
    if (hit === 'hole') {
      const h = this.hole;
      this.scene.effects.popup(h.x, h.y - 60, 'icon_lock', '');
      this.scene.error('아직 열 수 없습니다');
      return;
    }
    const t = hit || this.tileAt(wx, wy);
    if (this.standable(t.col, t.row)) { this.upPending = false; this.scene.walkTo(t.col, t.row); return; }
    this.dig(t);
  }

  // 누른 것: 사다리, 막힌 구멍, 벽·덮개(그 흙 덩어리 칸). depth 가 큰 것부터, 투명하지 않은 곳만. 없으면 null
  pick(x, y) {
    const tex = this.scene.textures, hits = [];
    const test = (img) => {
      const lx = Math.floor(x - (img.x - img.displayWidth * img.originX)), ly = Math.floor(y - (img.y - img.displayHeight * img.originY));
      if (lx < 0 || ly < 0 || lx >= img.width || ly >= img.height) return false;
      const a = tex.getPixelAlpha(lx, ly, img.texture.key, img.frame.name);
      return a !== null && a > CONFIG.input.pickAlpha;
    };
    if (this.ladder && test(this.ladder)) hits.push({ d: this.ladder.depth, v: 'ladder' });
    if (this.hole && test(this.hole)) hits.push({ d: this.hole.depth, v: 'hole' });
    for (const p of this.pieces) if (p.target && test(p.img)) hits.push({ d: p.img.depth, v: { col: p.target[0], row: p.target[1] } });
    hits.sort((a, b) => b.d - a.d);
    return hits.length ? hits[0].v : null;
  }

  // 팔 수 있는 칸: 안 판 칸, 가장자리가 아님, 변을 맞댄 이웃 중에 설 수 있는 칸이 있다
  sides(t) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => ({ col: t.col + dc, row: t.row + dr })); }
  canDig(t) {
    const F = this.floor;
    if (this.isDug(t.col, t.row) || t.col <= 0 || t.row <= 0 || t.col >= F.cols - 1 || t.row >= F.rows - 1) return false;
    return this.sides(t).some((n) => this.standable(n.col, n.row));
  }

  dig(t) {
    const scene = this.scene;
    if (!this.canDig(t)) {
      const w = this.world(t.col, t.row);
      const no = scene.add.image(w.x, w.y, 'overlay_no').setDepth(CONFIG.depth.floor);
      scene.effects.run(CONFIG.ug.noMarkTime, () => {}, () => no.destroy());
      scene.sfx.play('ui_error');
      return;
    }
    if (!scene.tools.includes('pickaxe')) { scene.error('곡괭이가 필요합니다'); return; }
    const cell = { col: t.col, row: t.row }, k = this.key(t.col, t.row);
    this.upPending = false;
    scene.player.act({
      target: { tiles: [cell] }, ugCell: cell,
      goals: () => this.sides(cell).filter((n) => this.standable(n.col, n.row)),
      near: (at) => Math.abs(at.col - cell.col) + Math.abs(at.row - cell.row) === 1,
      tool: () => (scene.tools.includes('pickaxe') ? 'pickaxe' : null),
      isValid: () => !this.dug.has(k),
      strike: () => { this.hit(cell); return true; },
    });
  }

  // 한 번 친다(hit 프레임): dig_dirt, 카메라 살짝, dirt 2, 칸 체력 -1, 금. 0 이면 다 판다
  hit(t) {
    const scene = this.scene, U = CONFIG.ug, k = this.key(t.col, t.row), w = this.world(t.col, t.row);
    const max = this.ores.has(k) ? U.digHitsIron : U.digHits, n = (this.hp.get(k) || 0) + 1;
    this.hp.set(k, n);
    scene.sfx.play('dig_dirt', { at: w });
    scene.cameras.main.shake(U.shake.duration, U.shake.intensity);
    scene.effects.burst(['dirt'], U.chips.hit, w.x, w.y - 20);
    if (n >= max) { this.digOut(t); return; }
    this.crack(t, Math.min(3, Math.ceil(n / max * 3)));
  }

  // 금 (17.4): 목표가 서 있는 칸의 왼쪽 위(l), 오른쪽 위(r)면 서 있는 칸 자리에, 아래쪽이면(f) 목표 칸 자리에
  crack(t, stage) {
    const scene = this.scene, s = scene.player.tile, A = scene.map.assets.fx_dig_crack, k = this.key(t.col, t.row);
    const side = t.col === s.col - 1 && t.row === s.row ? 'l' : t.col === s.col && t.row === s.row - 1 ? 'r' : 'f';
    const at = side === 'f' ? t : s, w = this.world(at.col, at.row);
    const depth = side === 'f' ? CONFIG.ug.crackFrontDepth : 10 + w.y - 21 + 0.5;
    let img = this.cracks.get(k);
    if (!img) { img = scene.add.sprite(w.x, w.y, 'fx_dig_crack').setOrigin(A.originX, A.originY); this.cracks.set(k, img); }
    img.setPosition(w.x, w.y).setDepth(depth).setFrame(A.frames.indexOf(side + stage));
  }

  // 다 팠다: 파낸 칸이 되고 조각을 다시 고른다. 돌 +1, 철 칸이면 철 +2, 버섯 칸이면 포자 +2
  digOut(t) {
    const scene = this.scene, U = CONFIG.ug, fx = scene.effects, k = this.key(t.col, t.row), w = this.world(t.col, t.row);
    this.dug.add(k);
    this.hp.delete(k);
    const c = this.cracks.get(k);
    if (c) { c.destroy(); this.cracks.delete(k); }
    this.build();
    scene.sfx.play('rock_break', { at: w });
    fx.dust(w.x, w.y);
    fx.burst(['dirt'], U.chips.out, w.x, w.y - 20);
    const got = [['stone', U.stonePerCell, 'icon_stone']];
    if (this.ores.has(k)) { got.push(['iron', U.ironPerCell, 'icon_iron']); fx.burst(['iron'], U.chips.iron, w.x, w.y - 20); }
    if (this.spores.has(k)) got.push(['spore', U.sporePerCell, 'icon_spore']);
    got.forEach(([item, n, icon], i) => {
      scene.inventory.add(item, n);
      fx.popup(w.x, w.y - 40 - i * (CONFIG.fx.popupIcon + 2), icon, '+' + n);
    });
    scene.sfx.play('pickup');
    this.dugCount += 1;
    if (this.dugCount >= CONFIG.todo4.dig) scene.todo.check('dig');
  }

  // ── 매 프레임 ──

  update() {
    if (!this.active) return;
    const scene = this.scene, pl = scene.player;
    if (this.upPending && !pl.moving && !this.busy) {
      const e = this.floor.entry;
      if (pl.tile.col === e.col && pl.tile.row === e.row) this.goUp();
      else this.upPending = false;
    }
    // 파는 칸 표시: 그 덩어리를 가리키는 벽 조각에 빛깔, 벽이 없으면(빈 어둠) overlay_dig
    for (const img of this.marked) img.clearTint();
    this.marked = [];
    const a = pl.action, cell = a && a.ugCell;
    let walls = 0;
    if (cell) for (const p of this.pieces) {
      if (p.kind === 'wall' && p.target[0] === cell.col && p.target[1] === cell.row) { p.img.setTint(CONFIG.ug.markTint); this.marked.push(p.img); walls++; }
    }
    if (!this.digMark) this.digMark = scene.add.image(0, 0, 'overlay_dig').setDepth(CONFIG.depth.floor).setVisible(false);
    if (cell && !walls) { const w = this.world(cell.col, cell.row); this.digMark.setPosition(w.x, w.y).setVisible(true); }
    else this.digMark.setVisible(false);
    // 가리면 반투명 (17.3): 벽·덮개·기둥 중 주인공보다 앞(depth 가 큼)이고 그림 사각형이 겹치는 것
    const ps = pl.sprite, pb = ps.getBounds();
    for (const p of this.pieces) {
      if (p.kind === 'floor') continue;
      const over = p.img.depth > ps.depth && Phaser.Geom.Intersects.RectangleToRectangle(pb, p.img.getBounds());
      p.img.setAlpha(over ? CONFIG.ug.wallFadeAlpha : 1);
    }
    if (this.shaft) this.shaft.setAlpha(CONFIG.ug.shaft.glowAlpha * this.sun());
  }

  // 햇빛 세기 (17.5): 낮 1, 저녁 동안 1 -> 0.2, 밤 0, 아침 dawnFade 동안 0 -> 1
  sun() {
    const c = this.scene.clock, T = CONFIG.time;
    if (c.isNight) return 0;
    if (c.dawn > 0) return 1 - c.dawn / T.dawnFade;
    const k = (c.t - (T.dayLength - T.duskLength)) / T.duskLength;
    return k <= 0 ? 1 : 1 - (1 - CONFIG.ug.shaft.duskMin) * Math.min(1, k);
  }

  // 지하의 빛 (17.5): 주인공, 입구의 햇빛 두 개
  lights() {
    const P = CONFIG.player.light, S = CONFIG.ug.shaft, sp = this.scene.player.sprite, e = this.world(this.floor.entry.col, this.floor.entry.row), sun = this.sun();
    const out = [{ x: sp.x, y: sp.y - P.lift, radius: P.radius, color: P.color, alpha: P.alpha }];
    if (sun > 0) {
      out.push({ x: e.x, y: e.y, radius: S.low.radius, color: S.color, alpha: S.low.alpha * sun });
      out.push({ x: e.x, y: e.y - S.high.lift, radius: S.high.radius, color: S.color, alpha: S.high.alpha * sun });
    }
    return out;
  }

  // (시험용) 지하로 / 땅 위로 바로 옮기기
  jump() {
    if (!this.exists || this.busy) return;
    if (!this.active) {
      this.surfaceSpot = { col: this.scene.player.tile.col, row: this.scene.player.tile.row };
      this.burrow = this.scene.map.structures.find((s) => s.type === 'burrow') || null;
    }
    this.scene.player.stopAction();
    this.switchTo(!this.active);
  }

  // (시험용) 주인공 둘레 5×5 를 판다(가장자리는 빼고)
  digAround() {
    if (!this.active) return;
    const t = this.scene.player.tile, F = this.floor;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const c = t.col + dc, r = t.row + dr;
      if (c > 0 && r > 0 && c < F.cols - 1 && r < F.rows - 1) this.dug.add(this.key(c, r));
    }
    this.build();
  }
}
