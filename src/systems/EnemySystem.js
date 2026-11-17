import { CONFIG } from '../config.js';
import { Enemy } from './Enemy.js';

// 적 전체: 밤마다 나오게 하기, 고르기(누르기), 주인공·시설을 때렸을 때, 아침에 사라지기. (5.8)
export class EnemySystem {
  constructor(scene) {
    this.scene = scene;
    this.map = scene.map;
    this.list = [];
    this.defeated = 0;           // 주인공이 물리친 적의 수(결과 창에 보여 준다)
    this.schedule = [];          // 이번 밤에 나올 시각들(밤이 시작된 뒤의 게임 시간, 초)
    this.tentHitAt = -Infinity;  // 텐트가 마지막으로 맞은 때(게임 시간). 한동안 안 맞다가 맞으면 알린다.
    this.repathBudget = 0;       // 이번 프레임에 길을 더 찾을 수 있는 좀비 수
    scene.events.on('night', () => this.startNight());
  }

  // N번째 밤에 나오는 수 = base + perNight × (N − 1), 최대 max. 밤의 처음 spawnWindow 동안 같은 간격으로 한 마리씩.
  startNight() {
    const W = CONFIG.wave, n = Math.min(W.max, W.base + W.perNight * (this.scene.clock.day - 1));
    const span = W.spawnWindow * CONFIG.time.nightLength;
    this.schedule = Array.from({ length: n }, (_, i) => i * span / n);
  }

  // 지금 적이 노리는 것: 주인공. 주인공이 텐트 안에 있으면 텐트.
  target() {
    const s = this.scene;
    if (s.rest.resting) return { tiles: s.rest.tent.tiles, structure: s.rest.tent };
    return { tiles: [s.player.here()], structure: null };
  }

  // 나오는 자리: map.zombieSpawns 중 주인공에게서 spawnMinDistance 칸(직선거리) 이상 떨어진 곳에서 무작위.
  // 그런 곳이 없으면 가장 먼 곳. 시설을 지어 막힌 자리는 쓰지 않는다.
  spawnPoint() {
    const p = this.scene.player, min = CONFIG.zombie.spawnMinDistance;
    const free = this.scene.mapData.zombieSpawns.filter((t) => this.map.isWalkable(t.col, t.row));
    if (!free.length) return null;
    const dist = (t) => Math.hypot(t.col - p.col, t.row - p.row);
    const far = free.filter((t) => dist(t) >= min);
    if (far.length) return far[Math.floor(Math.random() * far.length)];
    return free.reduce((a, b) => (dist(b) > dist(a) ? b : a));
  }

  // 한 마리 나온다(fx_poof)
  spawn(kind = 'zombie') {
    const t = this.spawnPoint();
    if (!t) return null;
    const e = new Enemy(this, kind, t.col, t.row);
    this.list.push(e);
    this.scene.effects.poof(e.sprite.x, e.sprite.y - e.sprite.displayHeight * e.sprite.originY * 0.5);
    return e;
  }

  // 이번 프레임에 길을 찾아도 되는가(한 프레임에 repathsPerFrame 마리까지. 나머지는 다음 프레임에)
  mayRepath() {
    if (this.repathBudget <= 0) return false;
    this.repathBudget -= 1;
    return true;
  }

  // 다른 좀비들이 서 있거나 가고 있는 칸
  takenTiles(me) {
    const out = new Set();
    for (const e of this.list) if (e !== me) { const t = e.spot(); out.add(t.col + ',' + t.row); }
    return out;
  }

  update(dt) {
    this.repathBudget = CONFIG.zombie.repathsPerFrame;
    const clock = this.scene.clock;
    while (clock.isNight && this.schedule.length && clock.t >= this.schedule[0]) {
      this.schedule.shift();
      this.spawn();
    }
    for (const e of [...this.list]) if (e.alive) e.update(dt);
  }

  // 적이 주인공을 때렸다: 하트가 hitDamage 만큼 준다
  hitPlayer(e) { this.scene.hurtPlayer(e.cfg.hitDamage); }

  // 적이 시설을 쳤다. 텐트가 공격받기 시작하면(attackNotice 초 동안 안 맞다가 맞으면) 알린다. (5.6)
  hitStructure(e, s) {
    const scene = this.scene;
    if (s.type === 'tent') {
      if (scene.elapsed - this.tentHitAt >= CONFIG.build.tent.attackNotice) scene.notice('텐트가 공격받고 있습니다');
      this.tentHitAt = scene.elapsed;
    }
    scene.build.damage(s, e.cfg.structureDamage);
  }

  // 주인공이 적을 물리쳤다
  kill(e) {
    this.remove(e);
    this.defeated += 1;
  }

  // 먼지와 함께 없앤다
  remove(e) {
    const sp = e.sprite;
    this.scene.effects.poof(sp.x, sp.y - sp.displayHeight * sp.originY * 0.5);
    e.destroy();
    this.list.splice(this.list.indexOf(e), 1);
  }

  // 아침: 남은 적은 모두 사라지고, 아직 나오지 않은 적은 나오지 않는다 (5.10)
  clearAll() {
    this.schedule = [];
    for (const e of [...this.list]) this.remove(e);
  }

  // 누른 점 (x, y)에 있는 적: 그림 사각형을 사방 enemyPad 만큼 넓힌 곳. 여럿이면 앞에 있는 것. (3.5)
  pickAt(x, y) {
    const pad = CONFIG.input.enemyPad;
    let best = null;
    for (const e of this.list) {
      const s = e.sprite, left = s.x - s.displayWidth * s.originX, top = s.y - s.displayHeight * s.originY;
      if (x < left - pad || x > left + s.displayWidth + pad || y < top - pad || y > top + s.displayHeight + pad) continue;
      if (!best || s.depth > best.sprite.depth) best = e;
    }
    return best;
  }

  // tile 과 붙은 칸(8방향, 같은 칸 포함)에 있는 적 중 가장 가까운 것
  nextTo(tile) {
    let best = null, bestD = Infinity;
    for (const e of this.list) {
      const h = e.here();
      if (Math.max(Math.abs(h.col - tile.col), Math.abs(h.row - tile.row)) > 1) continue;
      const d = Math.hypot(e.col - tile.col, e.row - tile.row);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // 텐트에서 range 칸(직선거리) 안에 적이 있는가. 텐트는 2×2칸이라 네 칸의 한가운데에서 잰다.
  near(s, range) {
    const c = s.tiles.reduce((a, t) => a + t.col, 0) / s.tiles.length, r = s.tiles.reduce((a, t) => a + t.row, 0) / s.tiles.length;
    return this.list.some((e) => Math.hypot(e.col - c, e.row - r) <= range);
  }

  // 적의 몸이 걸쳐 있는 칸들. 여기에는 시설을 지을 수 없다.
  occupiedTiles() { return this.list.flatMap((e) => e.occupiedTiles()); }

  onMapChanged() { for (const e of this.list) e.onMapChanged(); }

  sprites() { return this.list.map((e) => e.sprite); }
}
