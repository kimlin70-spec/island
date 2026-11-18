import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

const TOWERS = { watchtower: true, guntower: true };
export const isTower = (type) => !!TOWERS[type];

// (2단계) 망루와 총 타워 (11.5, 11.10, 12.8). 받침(시설)과 포탑 두 장. 받침은 BuildSystem 이 다른 시설처럼 짓고,
// 여기서는 포탑을 붙이고, 목표를 고르고, 돌리고, 쏘고, 날아가는 화살과 총알을 움직인다. 시간은 모두 게임 시간(dt).
//   목표: 사거리 안의 적 중 탑에서 가장 가까운 적(칸 좌표의 직선 거리). 죽거나 사거리를 벗어날 때까지 바꾸지 않는다.
//         땅에서 올라오는 중인 좀비는 공격받지 않으므로 고르지 않는다(12.3).
//   쏘기: 목표가 있고 쏠 수 있게 되면(interval 마다) 바로 쏜다. 화살·총알은 목표를 따라가 반드시 맞는다.
export class TowerSystem {
  constructor(scene) {
    this.scene = scene;
    this.shots = [];          // 날아가는 화살·총알 { kind, sprite, from, target, last, t, time, h, dir }
    this.flashes = [];        // 총을 쏜 순간의 빛 { x, y, left }
  }

  get towers() { return this.scene.map.structures.filter((s) => s.turret); }

  // 지은 탑에 포탑을 붙인다(11.10): 받침 기준점 + mount, depth 는 받침 + 0.5
  attach(s) {
    const A = this.scene.map.assets, base = A[s.sprite.texture.key], tk = base.turret, ta = A[tk];
    const w = tileToWorld(s.col, s.row);
    s.turret = this.scene.add.sprite(w.x + base.mount[0], w.y + base.mount[1], tk, 0)
      .setOrigin(ta.originX, ta.originY).setDepth(s.sprite.depth + 0.5);
    s.turretKey = tk;
    s.mountAt = { x: w.x + base.mount[0], y: w.y + base.mount[1] };
    s.dir = 4;                // 처음은 화면 아래(보는 사람 쪽)
    s.target = null;
    s.cooldown = 0;
    s.shotLeft = 0;           // 망루: shot 그림이 남은 시간
    s.recoil = { x: 0, y: 0 }; // 총 타워: 쏠 때 포탑이 밀린 만큼
    this.setTurretFrame(s);
  }

  // 받침이 없어질 때 포탑도
  detach(s) {
    if (s.turret) s.turret.destroy();
    s.turret = null;
    s.target = null;
  }

  foot(s) { return tileToWorld(s.col, s.row); }

  // 방향 번호 0~15: 화면의 세로를 2배로 펴서 잰 각도를 16등분(11.10). 0 = 오른쪽, 4 = 아래, 8 = 왼쪽, 12 = 위
  dirTo(from, to) {
    const a = Math.atan2((to.y - from.y) * 2, to.x - from.x);
    return ((Math.round(a / (Math.PI * 2 / 16)) % 16) + 16) % 16;
  }

  setTurretFrame(s) {
    const frames = this.scene.map.assets[s.turretKey].frames;
    const name = s.type === 'watchtower' ? (s.shotLeft > 0 ? 'shot' : 'load') + s.dir : 'dir' + s.dir;
    s.turret.setFrame(frames.indexOf(name));
  }

  inRange(s, e) {
    return e.alive && !e.rising && Math.hypot(e.col - s.col, e.row - s.row) <= s.cfg.range;
  }

  // 사거리 안에서 가장 가까운 적. 지금 목표가 살아 있고 사거리 안이면 그대로.
  pickTarget(s) {
    if (s.target && this.inRange(s, s.target)) return s.target;
    let best = null, bestD = Infinity;
    for (const e of this.scene.enemies.list) {
      if (!this.inRange(s, e)) continue;
      const d = Math.hypot(e.col - s.col, e.row - s.row);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  update(dt) {
    // 총구 빛은 먼저 줄인다(이번 프레임에 쏜 빛은 적어도 한 번 그려지게)
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if ((this.flashes[i].left -= dt) <= 0) this.flashes.splice(i, 1);
    }
    for (const s of this.towers) {
      s.cooldown -= dt;                              // 쏘는 간격은 남은 시간을 이어서 센다(긴 프레임에도 1.1초, 1.6초마다)
      if (s.shotLeft > 0) s.shotLeft = Math.max(0, s.shotLeft - dt);
      s.target = this.pickTarget(s);
      if (s.target) s.dir = this.dirTo(this.foot(s), s.target.foot());   // 목표가 없으면 마지막 방향 그대로
      if (!s.target) s.cooldown = Math.max(0, s.cooldown);
      else if (s.cooldown <= 0) this.fire(s);
      this.setTurretFrame(s);
    }
    this.moveShots(dt);
  }

  // 포탑을 받침 위에 놓는다: 받침 기준점 + mount × 받침의 크기(지을 때 튀어나오는 동안에도 붙어 있게) + 반동
  syncTurrets() {
    for (const s of this.towers) {
      const b = s.sprite, m = this.scene.map.assets[b.texture.key].mount, k = b.scaleX;
      s.turret.setPosition(b.x + m[0] * k + s.recoil.x, b.y + m[1] * k + s.recoil.y).setScale(k);
    }
  }

  // 화살·총알이 나가는 곳: 포탑 위치 + muzzle[방향]
  muzzle(s) {
    const m = this.scene.map.assets[s.turretKey].muzzle[s.dir];
    return { x: s.mountAt.x + m[0], y: s.mountAt.y + m[1] };
  }

  fire(s) {
    const T = CONFIG.tower, fx = this.scene.effects, A = this.scene.map.assets;
    s.cooldown += s.cfg.interval;
    const from = this.muzzle(s), target = s.target;
    const aim = this.aimPoint(target);
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    if (s.type === 'watchtower') {
      s.shotLeft = T.shotTime;
      const a = A.proj_arrow;
      const sprite = this.scene.add.image(from.x, from.y, 'proj_arrow').setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.fx);
      this.shots.push({ kind: 'arrow', sprite, tower: s, from, target, last: aim, lastFoot: target.foot(), t: 0, speed: s.cfg.arrowSpeed,
        time: Math.max(dist / s.cfg.arrowSpeed, 0.01), h: Math.min(s.cfg.arcMax, dist * s.cfg.arcRatio) });
    } else {
      // 총 타워: 총구 불꽃(0.07초) 뒤 연기, 짧은 빛, 포탑 반동 (11.5, 12.8)
      const ang = A[s.turretKey].screenAngle[s.dir] * Math.PI / 180;
      const fl = this.scene.add.image(from.x, from.y, 'fx_muzzle').setOrigin(A.fx_muzzle.originX, A.fx_muzzle.originY)
        .setRotation(ang).setDepth(CONFIG.depth.fx);
      fx.run(T.muzzleTime, () => {}, () => { fl.destroy(); fx.play('fx_smoke_puff', from.x, from.y); });
      this.flashes.push({ x: from.x, y: from.y, left: CONFIG.flashLight.time });
      const ux = Math.cos(ang), uy = Math.sin(ang), r = s.recoil;
      fx.run(T.recoilTime, (k) => { r.x = -ux * T.recoil * (1 - k); r.y = -uy * T.recoil * (1 - k); }, () => { r.x = 0; r.y = 0; });
      const b = A.proj_bullet;
      const sprite = this.scene.add.image(from.x, from.y, 'proj_bullet').setOrigin(b.originX, b.originY).setDepth(CONFIG.depth.fx);
      this.shots.push({ kind: 'bullet', sprite, tower: s, from, target, last: aim, lastFoot: target.foot(), t: 0, speed: s.cfg.bulletSpeed,
        time: Math.max(dist / s.cfg.bulletSpeed, 0.01), h: 0 });
    }
  }

  // 맞는 곳: 적의 발에서 hitHeight 위
  aimPoint(e) {
    const f = e.foot();
    return { x: f.x, y: f.y - CONFIG.tower.hitHeight };
  }

  // 날아가는 동안 목표의 위치를 따라간다. 목표가 먼저 사라지면 그 발밑(땅)으로 떨어진다.
  moveShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const p = this.shots[i];
      const alive = p.target.alive;
      if (alive) {
        p.last = this.aimPoint(p.target);
        p.lastFoot = p.target.foot();
      } else if (!p.lost) {
        // 목표를 방금 잃었다: 지금 자리에서 그 발밑으로 같은 빠르기로 곧게 떨어진다(한 번에 튀지 않게)
        p.lost = true;
        p.from = { x: p.sprite.x, y: p.sprite.y };
        p.time = Math.max(Math.hypot(p.lastFoot.x - p.from.x, p.lastFoot.y - p.from.y) / p.speed, 0.01);
        p.t = 0;
        p.h = 0;
      }
      p.t = Math.min(1, p.t + dt / p.time);
      const end = alive ? p.last : p.lastFoot;
      const x0 = p.from.x, y0 = p.from.y, t = p.t;
      const x = x0 + (end.x - x0) * t;
      const y = y0 + (end.y - y0) * t - p.h * 4 * t * (1 - t);
      p.sprite.setPosition(x, y).setRotation(Math.atan2((end.y - y0) - p.h * 4 * (1 - 2 * t), end.x - x0));
      p.left = end.x < x0;
      if (p.t < 1) continue;
      this.shots.splice(i, 1);
      p.sprite.destroy();
      if (alive) this.hit(p);
      else this.miss(p, end);
    }
  }

  // 맞았다: 피해와 타격감(12.4: 맞은 곳 fx_impact, 번쩍임, 조각, 밀림, hurt, 멈칫). 쓰러뜨리면 적은 탑 반대쪽으로 쓰러진다.
  hit(p) {
    const s = p.tower, from = { foot: () => tileToWorld(s.col, s.row) };
    p.target.hurt(s.cfg.damage, from);
  }

  // 목표를 잃었다 (12.8): 화살은 땅에 꽂혀 2초 뒤 0.5초에 걸쳐 사라진다(왼쪽으로 날던 화살은 뒤집는다). 총알은 작은 먼지.
  miss(p, at) {
    const F = CONFIG.fx, T = CONFIG.tower, fx = this.scene.effects;
    if (p.kind === 'bullet') {
      fx.dust(at.x, at.y, T.missDustScale);
      return;
    }
    const a = this.scene.map.assets.proj_arrow_stuck;
    const img = this.scene.add.image(at.x, at.y, 'proj_arrow_stuck').setOrigin(a.originX, a.originY)
      .setFlipX(p.left).setDepth(CONFIG.depth.objectBase + at.y);
    fx.run(F.arrowStuckLife + T.arrowStuckFade, (k) => {
      const t = k * (F.arrowStuckLife + T.arrowStuckFade);
      if (img.active) img.setAlpha(t < F.arrowStuckLife ? 1 : 1 - (t - F.arrowStuckLife) / T.arrowStuckFade);
    }, () => img.destroy());
  }

  // 밤의 빛(3.7): 탑 등불(받침 + lamp)과 총을 쏜 순간의 총구 빛
  lights() {
    const out = [];
    for (const s of this.towers) {
      const lamp = this.scene.map.assets[s.sprite.texture.key].lamp, L = s.cfg.light;
      out.push({ x: s.sprite.x + lamp[0], y: s.sprite.y + lamp[1], radius: L.radius, color: L.color, alpha: L.alpha });
    }
    const FL = CONFIG.flashLight;
    for (const f of this.flashes) out.push({ x: f.x, y: f.y, radius: FL.radius, color: FL.color, alpha: FL.alpha });
    return out;
  }
}
