import { CONFIG } from '../config.js';

// 효과 (3.4, 12장): 맞은 곳, 먼지, 휘두른 궤적, 조각, 흔들림, 넘어가는 나무, 지을 때 튀어나옴, 쓰러진 적, 발자국,
// 떠오르는 "+4"와 체력 막대. 월드 위 depth 50000 에 그린다(발자국만 땅 바로 위).
// 모두 게임 시간(dt)으로 움직인다. 게임이 빨라지면 같이 빨라지고, 창이 떠 있는 동안은 멈춘다.
// (효과 그림의 애니메이션과 조각은 GameScene 이 프레임마다 게임 시간에 맞춘다: setTimeScale)
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.running = [];         // { t, life, step(k), done(), fresh, dead }  k: 0 -> 1
    this.bars = [];
    this.prints = [];          // 남아 있는 발자국(오래된 것부터)
    this.corpses = [];         // 쓰러지고 있는 적의 그림(나무 뒤에 있으면 나무를 반투명하게 한다)
    this.emitters = new Map(); // 조각 효과(12.6)의 파티클. 흩어지는 모양과 조각 이름마다 하나
    this.updated = -1;         // 마지막으로 update 한 프레임 번호
  }

  // life 초 동안 step(k)를 부르고 끝나면 done(). 이 프레임의 update 전에 만든 것은 이 프레임에는 세지 않는다
  // (짧은 것도 한 번은 그려지게. 0.06초 번쩍임이 느린 기기에서 아예 안 보이는 일이 없게).
  run(life, step, done) {
    const e = { t: 0, life, step, done, fresh: this.updated !== this.scene.frame, dead: false };
    this.running.push(e);
    step(0);
    return e;
  }

  // run 으로 시작한 것을 그만둔다(done 은 부르지 않는다)
  cancel(e) { if (e) e.dead = true; }

  update(dt) {
    this.updated = this.scene.frame;
    for (let i = this.running.length - 1; i >= 0; i--) {
      const e = this.running[i];
      if (e.dead) { this.running.splice(i, 1); continue; }
      if (e.fresh) { e.fresh = false; continue; }
      e.t += dt;
      if (e.t >= e.life) {
        this.running.splice(i, 1);
        if (e.done) e.done();
      } else {
        e.step(e.t / e.life);
      }
    }
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const b = this.bars[i];
      b.left -= dt;
      if (b.left <= 0) b.g.setVisible(false);
    }
  }

  // 효과 그림의 애니메이션과 조각이 이번 프레임에 게임 시간으로 흐르게 한다(scale = 게임 시간 / 실제 시간)
  setTimeScale(scale) {
    for (const em of this.emitters.values()) em.timeScale = scale;
  }

  // ── 한 번 트는 효과 그림 ──

  // key 그림의 anim 애니메이션을 (x, y)에서 한 번 튼다. 기준점은 manifest. 애니메이션 시간이 지나면 없앤다.
  play(key, x, y, { anim = 'play', scale = 1, flip = false, depth = CONFIG.depth.fx } = {}) {
    const a = this.scene.map.assets[key];
    const v = a && a.anims && a.anims[anim];
    if (!v) return null;
    const sp = this.scene.add.sprite(x, y, key).setOrigin(a.originX, a.originY)
      .setScale(scale).setFlipX(flip).setDepth(depth);
    sp.play(key + ':' + anim);
    this.run(v.frames.reduce((s, f) => s + f[1], 0) / 1000, () => {}, () => sp.destroy());
    return sp;
  }

  // 맞은 곳 (12.4): (x, y)를 때린 쪽(from: 발 위치)으로 impactPull 만큼 당겨서 fx_impact
  impact(x, y, from) {
    const p = this.pull(x, y, from);
    this.play('fx_impact', p.x, p.y);
    return p;
  }

  pull(x, y, from) {
    if (!from) return { x, y };
    const dx = from.x - x, dy = from.y - y, L = Math.hypot(dx, dy), d = CONFIG.fx.impactPull;
    return L ? { x: x + dx / L * d, y: y + dy / L * d } : { x, y };
  }

  dust(x, y, scale = 1) { this.play('fx_dust', x, y, { scale }); }

  // 휘두른 궤적 (12.5): 캐릭터의 발에 같은 좌우로. 앞모습이면 캐릭터 앞, 뒷모습이면 뒤에 그린다.
  swingTrail(sprite, name, back) {
    this.play('fx_swing', sprite.x, sprite.y, { anim: name, flip: sprite.flipX, depth: sprite.depth + (back ? -0.5 : 0.5) });
  }

  // 사물이 다 쓰이거나 캐릭터·시설이 사라질 때(아침, 치우기, 그루터기 파내기): 먼지가 커지며 흐려진다
  poof(x, y) {
    const F = CONFIG.fx;
    const img = this.scene.add.image(x, y, 'fx_poof').setDepth(CONFIG.depth.fx);
    this.run(F.poofTime, (k) => img.setScale(F.poofFrom + (F.poofTo - F.poofFrom) * k).setAlpha(1 - k), () => img.destroy());
  }

  // ── 조각 효과 (12.6) ──

  // names 중에서 고른 조각 n 개(× particleCount, 반올림, 최소 1)를 (x, y)에서 흩뿌린다. shape: config.fx.burst 의 모양
  burst(names, n, x, y, shape = 'chips') {
    const count = Math.max(1, Math.round(n * CONFIG.fx.particleCount));
    this.emitter(shape, names).explode(count, x, y);
  }

  emitter(shape, names) {
    const id = shape + ':' + names.join(',');
    let em = this.emitters.get(id);
    if (em) return em;
    const F = CONFIG.fx, P = F.particles, S = F.burst[shape];
    const frames = this.scene.map.assets.fx_particles.frames;
    const range = (v) => ({ min: v[0], max: v[1] });
    const cfg = {
      frame: names.map((n) => frames.indexOf(n)), emitting: false,
      lifespan: S.lifespan || P.lifespan, speed: range(S.speed || P.speed), angle: range(S.angle),
      gravityY: S.gravityY !== undefined ? S.gravityY : P.gravityY, alpha: { start: 1, end: 0 },
    };
    if (S.rotate) cfg.rotate = range(S.rotate);
    if (S.scale) cfg.scale = range(S.scale);
    em = this.scene.add.particles(0, 0, 'fx_particles', cfg).setDepth(CONFIG.depth.fx);
    this.emitters.set(id, em);
    return em;
  }

  // ── 맞은 것의 움직임 ──

  // 맞은 캐릭터는 잠깐 하얗게 번쩍인다 (12.4)
  flash(sprite) {
    sprite.setTintFill(0xffffff);
    this.cancel(sprite.flashRun);
    sprite.flashRun = this.run(CONFIG.fx.flash, () => {}, () => {
      sprite.flashRun = null;
      if (sprite.active) sprite.clearTint();
    });
  }

  // 나무·돌을 칠 때 좌우로 흔든다 (12.7): 3px, 0.16초에 걸쳐 잦아든다
  shake(sprite) {
    const F = CONFIG.fx;
    this.cancel(sprite.shakeRun);
    if (sprite.shakeBase === undefined) sprite.shakeBase = sprite.x;
    const base = sprite.shakeBase;
    sprite.shakeRun = this.run(F.treeShakeTime, (k) => {
      if (sprite.active) sprite.x = base + F.treeShake * Math.sin(k * 3 * Math.PI) * (1 - k);
    }, () => this.stopShake(sprite));
  }

  stopShake(sprite) {
    this.cancel(sprite.shakeRun);
    sprite.shakeRun = null;
    if (sprite.shakeBase === undefined) return;
    if (sprite.active) sprite.x = sprite.shakeBase;
    sprite.shakeBase = undefined;
  }

  // 다 벤 나무가 넘어간다 (12.7): 같은 그림을 발을 축으로 dir 쪽(1 오른쪽, -1 왼쪽)으로 넘어뜨리며 흐려지게 하고 없앤다.
  // 넘어간 끝(발에서 넘어간 쪽으로)에 먼지와 잎. alpha0: 넘어가기 전의 진하기(캐릭터를 가려 반투명이었으면 그대로).
  fall(key, x, y, depth, dir, leaves, alpha0 = 1) {
    const F = CONFIG.fx, T = F.treeFall, a = this.scene.map.assets[key];
    const img = this.scene.add.image(x, y, key).setOrigin(a.originX, a.originY).setDepth(depth).setAlpha(alpha0);
    let landed = false;
    const land = () => {
      landed = true;
      const lx = x + dir * F.fallDustDistance;
      this.dust(lx, y);
      this.burst(leaves, F.chips.treeFall, lx, y, 'leaves');
    };
    this.run(T.time, (k) => {
      const t = k * T.time;
      img.setRotation(dir * T.angle * Math.PI / 180 * Math.pow(k, F.fallEase));
      img.setAlpha(alpha0 * (t < T.fadeAfter ? 1 : 1 - (t - T.fadeAfter) / (T.time - T.fadeAfter)));
      if (!landed && t >= F.fallDustAt) land();
    }, () => {
      img.destroy();
      if (!landed) land();
    });
  }

  // 시설을 지을 때 (12.7): 크기 0.8 -> 1.06 -> 1.0 으로 튀어나온다
  pop(sprite) {
    const B = CONFIG.fx.buildPop, peak = CONFIG.fx.buildPopPeak;
    this.run(B.time, (k) => {
      if (!sprite.active) return;
      sprite.setScale(k < peak ? B.from + (B.over - B.from) * k / peak : B.over + (1 - B.over) * (k - peak) / (1 - peak));
    }, () => { if (sprite.active) sprite.setScale(1); });
  }

  // 쓰러진 적 (12.3): die 를 틀고(마지막 장에서 머문다) 흐려지며, 좀비는 fx_vanish, 해적은 fx_dust. 그 뒤 없앤다.
  // (ux, uy): 밀려나는 쪽. 맞아서 밀린 자리에 그대로 눕는다.
  corpse(sprite, key, ux, uy, smoke) {
    const F = CONFIG.fx, A = this.scene.map.assets[key].anims || {};
    const dieTime = A.die ? A.die.frames.reduce((s, f) => s + f[1], 0) / 1000 : 0;
    const bx = sprite.x, by = sprite.y;
    this.corpses.push(sprite);
    if (A.die) sprite.play(key + ':die');
    this.run(F.knockbackTime, (k) => {
      const d = F.knockback * Math.sin(k * Math.PI / 2);
      if (sprite.active) sprite.setPosition(bx + ux * d, by + uy * d);
    }, () => { if (sprite.active) sprite.setPosition(bx + ux * F.knockback, by + uy * F.knockback); });
    this.run(dieTime, () => {}, () => {
      if (!sprite.active) { this.dropCorpse(sprite); return; }
      // 몸은 보는 쪽의 뒤로 눕는다. 연기는 누운 몸의 한가운데에.
      this.play(smoke, sprite.x + (sprite.flipX ? 1 : -1) * F.corpseShift, sprite.y);
      this.run(F.dieFade, (k) => { if (sprite.active) sprite.setAlpha(1 - k); }, () => {
        this.dropCorpse(sprite);
        sprite.destroy();
      });
    });
  }

  dropCorpse(sprite) {
    const i = this.corpses.indexOf(sprite);
    if (i >= 0) this.corpses.splice(i, 1);
  }

  // ── 걷기 (12.9) ──

  // 디딜 때: 뒷발 쪽(발 (x, y)에서 걷는 방향 (dx, dy)의 반대로 stepBack)에 작은 먼지, 모래 위면 발자국.
  // 화면에서 먼 곳은 만들지 않는다.
  step(x, y, dx, dy, sand) {
    const F = CONFIG.fx, L = Math.hypot(dx, dy) || 1;
    const px = x - dx / L * F.stepBack, py = y - dy / L * F.stepBack;
    if (this.offScreen(px, py)) return;
    this.dust(px, py, F.stepDustScale);
    if (sand) this.footprint(px, py, dx < 0);
  }

  // 모래 위의 발자국: depth 2, footprintLife 초 뒤에 footprintFade 초에 걸쳐 사라진다. 한 번에 footprintMax 개까지(넘치면 오래된 것부터).
  footprint(x, y, flip) {
    const F = CONFIG.fx, a = this.scene.map.assets.fx_footprint;
    while (this.prints.length >= F.footprintMax) this.dropPrint(this.prints[0]);
    const img = this.scene.add.image(x, y, 'fx_footprint').setOrigin(a.originX, a.originY)
      .setFlipX(flip).setDepth(CONFIG.depth.footprint);
    const p = { img, run: null };
    const life = F.footprintLife + F.footprintFade;
    p.run = this.run(life, (k) => {
      const t = k * life;
      img.setAlpha(t < F.footprintLife ? 1 : 1 - (t - F.footprintLife) / F.footprintFade);
    }, () => this.dropPrint(p));
    this.prints.push(p);
  }

  dropPrint(p) {
    const i = this.prints.indexOf(p);
    if (i < 0) return;
    this.prints.splice(i, 1);
    this.cancel(p.run);
    p.img.destroy();
  }

  // (x, y)가 화면 밖 stepMargin 보다 멀면 true(발걸음 먼지와 발자국을 만들지 않는다)
  offScreen(x, y) {
    const v = this.scene.cameras.main.worldView, m = CONFIG.fx.stepMargin;
    return x < v.x - m || x > v.right + m || y < v.y - m || y > v.bottom + m;
  }

  // ── 떠오르는 글과 체력 막대 (3장) ──

  // 재료를 얻었을 때: 아이콘과 "+4"가 떠오른다
  popup(x, y, iconKey, label) {
    const F = CONFIG.fx;
    const icon = this.scene.add.image(0, 0, iconKey).setDisplaySize(F.popupIcon, F.popupIcon).setOrigin(1, 0.5);
    const text = this.scene.add.text(2, 0, label, {
      fontFamily: CONFIG.screen.font, fontSize: F.popupFont + 'px', fontStyle: 'bold',
      color: CONFIG.screen.textColor, stroke: '#fbf6ea', strokeThickness: 6,
    }).setOrigin(0, 0.5);
    const box = this.scene.add.container(x, y, [icon, text]).setDepth(CONFIG.depth.fx);
    this.run(F.popupTime, (k) => {
      box.y = y - F.popupRise * k;
      box.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }, () => box.destroy());
  }

  // 체력 막대. owner.bar 에 달아 둔다. linger 초 뒤에 저절로 숨는다(계속 보이게 하려면 Infinity).
  showBar(owner, ratio, x, y, linger) {
    const F = CONFIG.fx;
    if (!owner.bar) {
      owner.bar = { g: this.scene.add.graphics().setDepth(CONFIG.depth.fx), left: 0 };
      this.bars.push(owner.bar);
    }
    const b = owner.bar, w = F.barWidth, h = F.barHeight;
    b.left = linger;
    b.g.setPosition(x, y).setVisible(true).clear();
    b.g.fillStyle(F.barBorder, 1).fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 3);
    b.g.fillStyle(F.barTrack, 1).fillRect(-w / 2, -h / 2, w, h);
    b.g.fillStyle(F.barFill, 1).fillRect(-w / 2, -h / 2, w * Math.max(0, Math.min(1, ratio)), h);
  }

  removeBar(owner) {
    if (!owner.bar) return;
    this.bars.splice(this.bars.indexOf(owner.bar), 1);
    owner.bar.g.destroy();
    owner.bar = null;
  }
}
