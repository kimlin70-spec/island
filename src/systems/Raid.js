import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

// 해적의 지하 침입 (18장, Phase 19).
// 주인공이 지하에 있는 동안 상륙한 해적은 굴 입구 뚜껑을 부수고(18.2), 사다리로 한 명씩 내려와 쫓아온다(18.3).
// 주인공이 땅 위로 올라가면 따라 올라온다. 지하의 해적은 허리 등불을 단다(18.4).
// 해적이 어디를 노리는지는 EnemySystem.target, 사다리를 오르내리는 동안의 움직임(transit)은 여기.
export class Raid {
  constructor(scene) {
    this.scene = scene;
    this.lastClimb = { down: -Infinity, up: -Infinity };   // 마지막으로 한 명이 들어간(올라간) 때. descendInterval 마다 한 명
    this.knockAt = -Infinity;      // 마지막 hatch_knock
    this.hitAt = -Infinity;        // 뚜껑을 마지막으로 친 때
    this.brokeAt = -Infinity;      // 뚜껑이 부서진 때
    this.warned = false;           // 이번 밤에 "해적이 굴 입구를 부수고 있습니다"를 띄웠는가
    this.shouted = false;          // 이번 밤에 첫 해적이 외쳤는가
    this.lanterns = new Map();     // 해적 -> { img, glow }
    this.alert = null;             // 사다리 구멍의 alert
    scene.events.on('morning', () => { this.warned = false; this.shouted = false; });
  }

  get enabled() { return CONFIG.raid.enabled && this.scene.ug.exists; }
  get burrow() { return this.scene.map.structures.find((s) => s.type === 'burrow') || null; }
  isRaider(e) { return this.enabled && e.kind !== 'zombie'; }

  // 사다리 칸 가운데(지하)와 사다리 구멍(그 150px 위)
  entry() { const F = this.scene.ug.floor; return this.scene.ug.world(F.entry.col, F.entry.row); }
  hole() { const e = this.entry(); return { x: e.x, y: e.y - CONFIG.raid.holeLift }; }

  // ── 뚜껑 부수기 (18.2) ──

  // 해적 e 가 뚜껑 b 를 한 번 쳤다(시설을 치는 규칙대로 structureInterval 마다)
  hitHatch(e, b) {
    const scene = this.scene, R = CONFIG.raid, fx = scene.effects, sp = b.sprite, under = scene.ug.active;
    if (b.broken) return;
    b.hp = Math.max(0, b.hp - e.cfg.structureDamage);
    this.hitAt = scene.elapsed;
    // 땅 위: hit_wood 와 나무 조각 (12.4)
    const p = fx.impact(sp.x, sp.y - CONFIG.fx.impactHeight.object, e.foot());
    fx.burst(['wood1', 'wood2'], CONFIG.fx.chips.treeHit[0], p.x, p.y);
    scene.sfx.play('hit_wood', { at: sp });
    if (!this.warned) {                              // 처음 칠 때: 알림, 침대에서 깨움(빨리 감기는 시설이 맞으면 멈춘다)
      this.warned = true;
      scene.notice('해적이 굴 입구를 부수고 있습니다', 'icon_pirate');
      scene.home.wake();
    }
    if (under) {                                     // 지하: 쿵쿵, 카메라 흔들림, 사다리 구멍에서 흙 부스러기
      if (scene.elapsed - this.knockAt >= R.knockSoundEvery) { this.knockAt = scene.elapsed; scene.sfx.play('hatch_knock'); }
      scene.cameras.main.shake(R.knockShake.duration, R.knockShake.intensity);
      this.debris(['dirt', 'dust'], R.debris.knock);
    }
    if (b.hp <= 0) { this.breakHatch(b); return; }
    this.setHatchFrame(b);
    fx.showBar(b, b.hp / b.maxHp, sp.x, sp.y - sp.displayHeight * sp.originY - CONFIG.fx.barGap, Infinity);
  }

  // 그림: closed -> 체력 절반 이하면 damaged -> 0 이면 broken
  setHatchFrame(b) {
    const A = this.scene.map.assets.build_burrow;
    b.sprite.setFrame(A.frames.indexOf(b.broken ? 'broken' : b.hp <= b.maxHp / 2 ? 'damaged' : 'closed'));
  }

  breakHatch(b) {
    const scene = this.scene, R = CONFIG.raid;
    b.broken = true;
    this.brokeAt = scene.elapsed;
    this.setHatchFrame(b);
    scene.effects.removeBar(b);
    scene.sfx.play('hatch_break');                   // 땅 위와 지하 모두(거리와 상관없이)
    if (scene.ug.active) {
      scene.cameras.main.shake(R.breakShake.duration, R.breakShake.intensity);
      this.debris(['wood1', 'wood2', 'dirt', 'dust'], R.debris.break);
      scene.notice('해적이 내려옵니다!', 'icon_pirate');
    }
    scene.onMapChanged();                            // 부서진 굴 입구는 해적이 지나갈 수 있다
  }

  // 사다리 구멍에서 바닥까지 조각이 떨어진다(지하에서만 보인다)
  debris(names, n) {
    const scene = this.scene, R = CONFIG.raid.debris, h = this.hole(), e = this.entry(), frames = scene.map.assets.fx_particles.frames;
    const depth = scene.ug.ladder ? scene.ug.ladder.depth + 2 : CONFIG.depth.fx;
    const count = Math.max(1, Math.round(n * CONFIG.fx.particleCount));
    for (let i = 0; i < count; i++) {
      const name = names[i % names.length], x = h.x + (Math.random() * 2 - 1) * R.spread, y1 = e.y + (Math.random() * 2 - 1) * 8;
      const time = R.time[0] + Math.random() * (R.time[1] - R.time[0]), spin = (Math.random() * 2 - 1) * 6;
      const img = scene.add.image(x, h.y, 'fx_particles', frames.indexOf(name)).setDepth(depth);
      scene.effects.run(time, (k) => img.setPosition(x, h.y + (y1 - h.y) * k * k).setRotation(spin * k).setAlpha(k < 0.8 ? 1 : (1 - k) * 5), () => img.destroy());
    }
  }

  // ── 고치기 (18.2): 땅 위에서만. 나무 repairCost, construct 와 fx_poof, closed, 체력 가득 ──

  repair(b) {
    const scene = this.scene;
    if (!scene.map.structures.includes(b) || scene.ug.active) return;
    if (!scene.inventory.pay(CONFIG.raid.repairCost)) { scene.error('재료가 부족합니다'); return; }
    b.broken = false;
    b.hp = b.maxHp;
    this.setHatchFrame(b);
    scene.effects.removeBar(b);
    scene.effects.poof(b.sprite.x, b.sprite.y);
    scene.sfx.play('construct', { at: b.sprite });
    scene.onMapChanged();
  }

  // ── 사다리 오르내리기 (18.3) ──

  // 해적 e 가 굴 입구 칸(dir 'down') 또는 사다리 칸(dir 'up')에 섰다. descendInterval 마다 한 명씩 들어간다
  tryClimb(e, dir) {
    const scene = this.scene;
    if (scene.elapsed - this.lastClimb[dir] < CONFIG.raid.descendInterval) return;
    this.lastClimb[dir] = scene.elapsed;
    e.path.length = 0;
    e.smashing = null;
    e.hitLeft = null;
    e.gunStop();
    e.body.cancel();
    e.body.setFinal('climb');
    e.transit = { dir, phase: dir === 'down' ? 'enter' : 'climb', t: 0 };
  }

  // 사다리를 오르내리는 동안(공격하지도 공격받지도 않는다). depth = 사다리 + 1
  step(e, dt) {
    const scene = this.scene, R = CONFIG.raid, U = CONFIG.ug, tr = e.transit, sp = e.sprite, b = this.burrow;
    tr.t += dt;
    const top = b ? b.sprite : sp, ladderDepth = scene.ug.ladder ? scene.ug.ladder.depth : sp.depth, en = this.entry();
    if (tr.phase === 'enter') {                      // 굴 입구 칸에서 0.5초 동안 40px 내려가며 흐려진다
      const k = Math.min(1, tr.t / (R.enterMs / 1000));
      sp.setPosition(top.x, top.y + R.enterDrop * k).setAlpha(1 - k).setDepth(top.depth + 1);
      if (k >= 1) this.toLevel(e, true, 'descend');
    } else if (tr.phase === 'descend') {             // 지하: 사다리 칸 150px 위에서 0.8초 동안 내려온다
      const k = Math.min(1, tr.t / (U.climbMs / 1000));
      if (!tr.half && k >= 0.5) { tr.half = true; scene.sfx.play('ladder', { at: en }); }
      sp.setPosition(en.x, en.y - U.climbRise * (1 - k)).setAlpha(1).setDepth(ladderDepth + 1);
      if (k >= 1) {
        if (!this.shouted) { this.shouted = true; scene.sfx.play('pirate_shout', { at: en }); }
        this.landed(e);
      }
    } else if (tr.phase === 'climb') {               // 지하: 사다리 위로 0.8초 동안 올라가며 흐려진다
      const k = Math.min(1, tr.t / (U.climbMs / 1000));
      if (!tr.half && k >= 0.5) { tr.half = true; scene.sfx.play('ladder', { at: en }); }
      sp.setPosition(en.x, en.y - U.climbRise * k).setAlpha(1 - k).setDepth(ladderDepth + 1);
      if (k >= 1) this.toLevel(e, false, 'emerge');
    } else if (tr.phase === 'emerge') {              // 땅 위: 굴 입구에서 0.5초 동안 나타나며 올라선다
      const k = Math.min(1, tr.t / (R.enterMs / 1000));
      sp.setPosition(top.x, top.y + R.enterDrop * (1 - k)).setAlpha(k).setDepth(top.depth + 1);
      if (k >= 1) this.landed(e);
    }
  }

  // 지하로(down) / 땅 위로 옮긴다. 지하에서는 사다리 칸, 땅 위에서는 굴 입구 칸
  toLevel(e, down, phase) {
    const scene = this.scene, ug = scene.ug, b = this.burrow;
    const at = down ? ug.floor.entry : (b ? { col: b.col, row: b.row } : ug.surfaceTile());   // 굴 입구가 그사이 없어졌으면 주인공이 올라온 자리 곁
    e.map = down ? ug.grid : scene.map;
    e.yOff = down ? CONFIG.ug.offsetY : 0;
    e.col = at.col; e.row = at.row; e.tile = { col: at.col, row: at.row };
    e.transit.phase = phase;
    e.transit.t = 0;
    e.transit.half = false;
    if (down) { this.lantern(e); scene.sfx.play('ladder', { at: this.entry() }); }
    else this.dropLantern(e, false);
  }

  // 내려섰다(올라섰다): 사다리 칸·굴 입구 칸을 비우고 가까운 빈 칸으로 비킨다
  landed(e) {
    e.transit = null;
    e.sprite.setAlpha(1);
    e.body.clearFinal();
    e.wantPath = true;
    e.repathLeft = 0;
    const here = e.tile, taken = this.scene.enemies.takenTiles(e), out = [];
    for (let d = 1; d <= 3 && !out.length; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      const c = here.col + dc, r = here.row + dr;
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || taken.has(c + ',' + r)) continue;
      if (e.map.isPassable(c, r) && !e.map.structureAt(c, r)) out.push({ col: c, row: r });
    }
    if (out.length) e.routeTo(out);                  // 다음 길찾기에서 목표(주인공)로 가는 길로 바뀐다
  }

  // ── 허리 등불 (18.4): 지하에 있는 해적에게만 ──

  lantern(e) {
    if (this.lanterns.has(e)) { const L = this.lanterns.get(e); L.img.setVisible(true); L.glow.setVisible(true); return; }
    const scene = this.scene, a = scene.map.assets.fx_pirate_lantern, G = CONFIG.raid.lanternLight;
    const img = scene.add.sprite(0, 0, 'fx_pirate_lantern').setOrigin(a.originX, a.originY).play('fx_pirate_lantern:flicker');
    const glow = scene.add.image(0, 0, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(G.glowSize, G.glowSize).setAlpha(G.glowAlpha);
    this.lanterns.set(e, { img, glow });
  }

  // 등불을 없앤다. fade: 쓰러졌을 때 0.3초 동안 흐려지며
  dropLantern(e, fade) {
    const L = this.lanterns.get(e);
    if (!L) return;
    this.lanterns.delete(e);
    if (!fade) { L.img.destroy(); L.glow.destroy(); return; }
    const a0 = L.glow.alpha;
    this.scene.effects.run(CONFIG.raid.lanternFade, (k) => { L.img.setAlpha(1 - k); L.glow.setAlpha(a0 * (1 - k)); }, () => { L.img.destroy(); L.glow.destroy(); });
  }

  // 등불의 자리: 해적 기준점 + lantern(앞모습 f, 뒷모습과 climb 은 b). 뒤집으면 x 를 반대로
  lanternAt(e) {
    const sp = e.sprite, A = e.asset, name = A.frames[+sp.frame.name] || '';
    const o = A.lantern[name.startsWith('b') || name.startsWith('climb') ? 'b' : 'f'];
    return { x: sp.x + (sp.flipX ? -o[0] : o[0]), y: sp.y + o[1] };
  }

  // ── 매 프레임(적이 움직인 뒤) ──

  update() {
    const scene = this.scene, R = CONFIG.raid, t = scene.elapsed;
    for (const [e, L] of this.lanterns) {
      const at = this.lanternAt(e), sw = e.moving && !e.transit ? R.lantern.swing * Math.sin(t * R.swingRate) : 0;
      L.img.setPosition(at.x, at.y).setDepth(e.sprite.depth + 0.1).setAngle(sw);
      L.glow.setPosition(at.x, at.y + R.lanternLight.drop).setDepth(e.sprite.depth + 0.2);
    }
    // 사다리 구멍의 alert: 뚜껑을 치는 동안, 부서진 뒤 3초 동안 (지하에서만)
    const on = scene.ug.active && (t - this.hitAt < R.alertHold || t - this.brokeAt < R.alertAfter);
    if (on && !this.alert) {
      const a = scene.map.assets.fx_emote, h = this.hole();
      this.alert = scene.add.image(h.x, h.y, 'fx_emote', a.frames.indexOf('alert')).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.fx);
    }
    if (this.alert) this.alert.setVisible(on);
    // 지하의 해적이 있으면 침대에서 깨운다
    if (scene.home.bed && scene.enemies.list.some((e) => e.under)) scene.home.wake();
  }

  // 지하의 빛: 해적 등불(등불에서 12px 아래), 부서진 굴 입구의 달빛(밤)
  lights() {
    const R = CONFIG.raid, out = [];
    for (const [e, L] of this.lanterns) if (L.img.visible) out.push({ x: L.glow.x, y: L.glow.y, radius: R.lantern.radius, color: R.lantern.color, alpha: R.lantern.alpha });
    return out;
  }

  // 부서진 굴 입구로 달빛이 드는가(밤이고 부서져 있다)
  get moonlit() { const b = this.burrow; return !!(b && b.broken && this.scene.clock.isNight); }

  // (시험용) 해적 습격(지하): 밤으로 바꾸고 해적 2명을 굴 입구 둘레의 빈 칸에 (주인공이 지하에 있을 때)
  debugRaid() {
    const scene = this.scene, b = this.burrow;
    if (!this.enabled || !scene.ug.active || !b) return;
    if (!scene.clock.isNight) scene.clock.startNight();
    const m = scene.map, out = [];
    for (let d = 1; d <= 4 && out.length < 2; d++) for (let dr = -d; dr <= d && out.length < 2; dr++) for (let dc = -d; dc <= d && out.length < 2; dc++) {
      const c = b.col + dc, r = b.row + dr;
      if (Math.max(Math.abs(dc), Math.abs(dr)) === d && m.isPassable(c, r) && !m.anyStructureAt(c, r)) out.push({ col: c, row: r });
    }
    out.forEach((t, i) => { const e = scene.enemies.add(i ? 'pirate_2' : 'pirate_1', t); const w = tileToWorld(t.col, t.row); scene.effects.dust(w.x, w.y); return e; });
  }
}
