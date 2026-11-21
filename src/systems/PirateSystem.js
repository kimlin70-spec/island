import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

// 해적 (5.12, Phase 6). config.pirate.enabled 일 때만 나온다.
// 밤의 shipAt 시점: 해적선이 appearTime 초에 걸쳐 나타나고 등불이 켜진다. "해적선이 나타났습니다"
// 밤의 landAt 시점: 보트가 나타나고, 해적 count 명이 상륙 칸과 그 옆의 빈 땅 칸에 나타난다. 물가에 물보라(12.9). "해적이 상륙했습니다"
// 해적은 좀비와 같은 Enemy 다(숫자만 config.pirate). 아침에 먼지와 함께 사라지는 것도 좀비와 같다(EnemySystem.clearAll).
// 아침: 배와 보트는 leaveTime 초에 걸쳐 사라진다.
// 배와 보트는 바다 위의 그림일 뿐이다. 칸을 막지 않고, 누를 수 없다.
const KINDS = ['pirate_1', 'pirate_2'];   // 해적 그림 두 가지를 번갈아
const GUNNER = 'pirate_3';                // (2단계) 총잡이 해적 (11.7)

export class PirateSystem {
  constructor(scene) {
    this.scene = scene;
    const P = scene.mapData.pirates;
    this.landing = P.landing;
    this.ship = this.makeImage('obj_ship', P.ship);
    this.boat = this.makeImage('obj_rowboat', P.boat);
    this.shipDue = false;      // 이번 밤에 해적선이 아직 안 나왔다
    this.landDue = false;      // 이번 밤에 해적이 아직 상륙하지 않았다
    scene.events.on('night', () => this.startNight());
    scene.events.on('morning', () => this.leave());
  }

  // 배·보트 그림: 기준점을 그 자리(소수 칸)에 맞추고, 깊이는 발 위치. 처음에는 숨겨 둔다.
  makeImage(key, at) {
    const a = this.scene.map.assets[key], w = tileToWorld(at.col, at.row);
    const img = this.scene.add.image(w.x, w.y, key).setOrigin(a.originX, a.originY)
      .setDepth(CONFIG.depth.objectBase + w.y).setAlpha(0).setVisible(false);
    img.fade = null;           // { to, rate }: 알파를 초당 rate 만큼 to 로
    return img;
  }

  startNight() {
    const on = CONFIG.pirate.enabled;
    this.shipDue = on;
    this.landDue = on;
  }

  // time 초에 걸쳐 알파를 to 로(0이면 바로)
  fadeTo(img, to, time) {
    if (to > 0) img.setVisible(true);
    if (time > 0) {
      img.fade = { to, rate: 1 / time };
      return;
    }
    img.fade = null;
    img.setAlpha(to);
    if (to <= 0) img.setVisible(false);
  }

  stepFade(img, dt) {
    const f = img.fade;
    if (!f) return;
    const a = img.alpha < f.to ? Math.min(f.to, img.alpha + f.rate * dt) : Math.max(f.to, img.alpha - f.rate * dt);
    img.setAlpha(a);
    if (a === f.to) img.fade = null;
    if (a <= 0) img.setVisible(false);
  }

  update(dt) {
    const clock = this.scene.clock, P = CONFIG.pirate, len = CONFIG.time.nightLength;
    if (clock.isNight && this.shipDue && clock.t >= P.shipAt * len) {
      this.shipDue = false;
      this.fadeTo(this.ship, 1, P.appearTime);
      this.scene.notice('해적선이 나타났습니다');
      this.scene.sfx.play('ship_bell');
    }
    if (clock.isNight && this.landDue && clock.t >= P.landAt * len) {
      this.landDue = false;
      this.land();
    }
    this.stepFade(this.ship, dt);
    this.stepFade(this.boat, dt);
  }

  // 상륙: 보트가 나타나고 해적이 상륙 칸과 그 옆에 나온다. 둘 다 바로(5.12에 나타나는 효과가 없다).
  // 상륙 칸에서 배 쪽으로 splashDistance 떨어진 물가에 물보라 (12.9)
  land() {
    this.fadeTo(this.boat, 1, 0);
    // 2단계에서는 총잡이 gunners 명이 함께 내린다 (11.7)
    const P = CONFIG.pirate, n = P.count + (this.scene.stage >= 2 ? P.gunners : 0);
    this.landingTiles(n).forEach((t, i) => this.scene.enemies.add(i < P.count ? KINDS[i % KINDS.length] : GUNNER, t));
    const L = this.landing, w = tileToWorld(L.col, L.row), dx = this.ship.x - w.x, dy = this.ship.y - w.y;
    const d = CONFIG.fx.splashDistance / (Math.hypot(dx, dy) || 1);
    this.scene.effects.play('fx_splash', w.x + dx * d, w.y + dy * d);
    this.scene.notice('해적이 상륙했습니다');
  }

  // (2단계) 시험용 도구 "해적 부르기": 해적선과 해적이 바로 나온다(배는 바로 보이고, 바로 상륙). 이번 밤의 예정은 취소한다.
  callNow() {
    this.shipDue = false;
    this.landDue = false;
    this.fadeTo(this.ship, 1, 0);
    this.scene.sfx.play('ship_bell');
    this.land();
  }

  // 해적이 나올 칸 n 개: 상륙 칸에서 가까운 빈 땅 칸(걸을 수 있고, 캐릭터의 몸이 걸쳐 있지 않은 칸).
  // 보통은 상륙 칸과 그 옆 칸이다. 거기에 시설을 지었거나 누가 서 있으면 그다음으로 가까운 칸.
  // 거리가 같으면 위쪽 줄, 왼쪽 칸 먼저.
  landingTiles(n) {
    const m = this.scene.map, L = this.landing;
    const busy = new Set([...this.scene.characterTiles(), ...this.scene.pets.list.filter((q) => q.map === this.scene.map).flatMap((q) => q.occupiedTiles())].map((t) => t.col + ',' + t.row));   // 동물 칸에도 내리지 않는다
    const out = [];
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        if (m.isPassable(c, r) && !busy.has(c + ',' + r)) out.push({ col: c, row: r, d: Math.hypot(c - L.col, r - L.row) });
      }
    }
    out.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col);
    return out.slice(0, n).map((t) => ({ col: t.col, row: t.row }));
  }

  // 아침: 아직 안 일어난 일은 취소하고, 배와 보트는 천천히 사라진다
  leave() {
    this.shipDue = false;
    this.landDue = false;
    const t = CONFIG.pirate.leaveTime;
    this.fadeTo(this.ship, 0, t);
    this.fadeTo(this.boat, 0, t);
  }

  // 밤의 빛(3.7): 해적선 등불. 배가 나타나고 사라지는 동안 함께 밝아지고 어두워진다.
  lights() {
    const s = this.ship;
    if (!s.visible || s.alpha <= 0) return [];
    const L = CONFIG.pirate.lampLight, lamp = this.scene.map.assets.obj_ship.lamp;
    return [{ x: s.x + lamp[0], y: s.y + lamp[1], radius: L.radius, color: L.color, alpha: L.alpha * s.alpha }];
  }
}
