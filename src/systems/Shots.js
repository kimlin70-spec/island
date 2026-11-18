import { CONFIG } from '../config.js';

// (2단계) 날아가는 화살과 총알, 총구 불꽃과 쏜 순간의 빛 (11.5~11.7, 11.10, 12.8). 탑, 주인공의 총, 총잡이 해적이 함께 쓴다.
//   따라가는 것(homing): 탑과 주인공이 쏜 것. 날아가는 동안 목표를 따라가서 반드시 맞는다. 목표가 먼저 사라지면 그 발밑에 떨어진다.
//   곧게 가는 것(straight): 총잡이가 쏜 것. 쏜 순간의 한 점으로 곧게 날아가고, 도착하면 arrive() 를 부른다(맞았는지는 부르는 쪽이 정한다).
// 시간은 모두 게임 시간(dt).
export class Shots {
  constructor(scene) {
    this.scene = scene;
    this.list = [];           // 날아가는 것들
    this.flashes = [];        // 쏜 순간의 빛 { x, y, left, frame }
  }

  // 맞는 곳: 적의 발에서 hitHeight 위
  aimPoint(e) {
    const f = e.foot();
    return { x: f.x, y: f.y - CONFIG.tower.hitHeight };
  }

  // 총을 쏜 순간 (12.8, 3.7): 총구 불꽃(muzzleTime) 뒤에 연기, 총구에 짧은 빛.
  // angle: 불꽃을 돌릴 화면 각도(라디안, 탑). flip: 불꽃을 좌우로 뒤집는다(왼쪽을 보는 캐릭터, 11.10).
  muzzle(x, y, { angle = 0, flip = false } = {}) {
    const T = CONFIG.tower, fx = this.scene.effects, a = this.scene.map.assets.fx_muzzle;
    // 뒤집으면 그림이 제 자리(틀) 안에서 좌우로 바뀌므로 기준점도 뒤집는다(총구 쪽 끝이 그대로 총구에 오게)
    const fl = this.scene.add.image(x, y, 'fx_muzzle').setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
      .setRotation(angle).setFlipX(flip).setDepth(CONFIG.depth.fx);
    fx.run(T.muzzleTime, () => {}, () => { fl.destroy(); fx.play('fx_smoke_puff', x, y); });
    this.flashes.push({ x, y, left: CONFIG.flashLight.time, frame: this.scene.frame });
  }

  // 목표를 따라가는 화살·총알. arc: 포물선 높이 = min(arc.max, 거리 × arc.ratio). 맞으면 onHit()
  homing(kind, from, target, speed, onHit, arc = null) {
    const aim = this.aimPoint(target), dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    this.list.push({ kind, homing: true, sprite: this.sprite(kind, from), from, target, last: aim, lastFoot: target.foot(),
      t: 0, speed, time: Math.max(dist / speed, 0.01), h: arc ? Math.min(arc.max, dist * arc.ratio) : 0, onHit });
  }

  // 한 점(to)으로 곧게 가는 총알. 도착하면 arrive(). hostile: 주인공을 노린 것(아침에 함께 없앤다)
  straight(from, to, speed, arrive, hostile = true) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    this.list.push({ kind: 'bullet', homing: false, sprite: this.sprite('bullet', from), from, end: to,
      t: 0, time: Math.max(dist / speed, 0.01), h: 0, arrive, hostile });
  }

  sprite(kind, at) {
    const key = kind === 'arrow' ? 'proj_arrow' : 'proj_bullet', a = this.scene.map.assets[key];
    return this.scene.add.image(at.x, at.y, key).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.fx);
  }

  update(dt) {
    // 쏜 순간의 빛: 생긴 프레임에는 줄이지 않는다(적어도 한 번은 그려지게)
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (f.frame === this.scene.frame) continue;
      if ((f.left -= dt) <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const end = p.homing ? this.follow(p) : p.end;
      p.t = Math.min(1, p.t + dt / p.time);
      const x0 = p.from.x, y0 = p.from.y, t = p.t;
      const x = x0 + (end.x - x0) * t;
      const y = y0 + (end.y - y0) * t - p.h * 4 * t * (1 - t);
      p.sprite.setPosition(x, y).setRotation(Math.atan2((end.y - y0) - p.h * 4 * (1 - 2 * t), end.x - x0));
      p.left = end.x < x0;
      if (p.t < 1) continue;
      this.list.splice(i, 1);
      p.sprite.destroy();
      if (!p.homing) p.arrive(end);
      else if (!p.lost) p.onHit();
      else this.miss(p, end);
    }
  }

  // 따라가는 것의 도착점: 목표가 살아 있으면 지금 맞는 곳. 목표를 방금 잃었으면 지금 자리에서 그 발밑으로 같은 빠르기로 곧게 떨어진다.
  follow(p) {
    if (p.target.alive) {
      p.last = this.aimPoint(p.target);
      p.lastFoot = p.target.foot();
      return p.last;
    }
    if (!p.lost) {
      p.lost = true;
      p.from = { x: p.sprite.x, y: p.sprite.y };
      p.time = Math.max(Math.hypot(p.lastFoot.x - p.from.x, p.lastFoot.y - p.from.y) / p.speed, 0.01);
      p.t = 0;
      p.h = 0;
    }
    return p.lastFoot;
  }

  // 목표를 잃었다 (12.8): 화살은 땅에 꽂혀 2초 뒤 0.5초에 걸쳐 사라진다(왼쪽으로 날던 화살은 뒤집는다). 총알은 작은 먼지.
  miss(p, at) {
    const F = CONFIG.fx, T = CONFIG.tower, fx = this.scene.effects;
    if (p.kind === 'bullet') {
      this.dust(at);
      return;
    }
    const a = this.scene.map.assets.proj_arrow_stuck;
    const img = this.scene.add.image(at.x, at.y, 'proj_arrow_stuck').setOrigin(p.left ? 1 - a.originX : a.originX, a.originY)
      .setFlipX(p.left).setDepth(CONFIG.depth.objectBase + at.y);
    fx.run(F.arrowStuckLife + T.arrowStuckFade, (k) => {
      const t = k * (F.arrowStuckLife + T.arrowStuckFade);
      if (img.active) img.setAlpha(t < F.arrowStuckLife ? 1 : 1 - (t - F.arrowStuckLife) / T.arrowStuckFade);
    }, () => img.destroy());
  }

  // 빗나간 총알이 떨어진 곳의 작은 먼지 (12.8)
  dust(at) { this.scene.effects.dust(at.x, at.y, CONFIG.tower.missDustScale); }

  // 아침: 주인공을 노리고 날던 총알은 없앤다(적이 모두 사라지므로)
  clearHostile() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!this.list[i].hostile) continue;
      this.list[i].sprite.destroy();
      this.list.splice(i, 1);
    }
  }

  // 밤의 빛(3.7): 총을 쏜 순간(0.1초)의 총구 빛
  lights() {
    const FL = CONFIG.flashLight;
    return this.flashes.map((f) => ({ x: f.x, y: f.y, radius: FL.radius, color: FL.color, alpha: FL.alpha }));
  }
}
