import { CONFIG } from '../config.js';
import { Enemy } from './Enemy.js';

// 적 전체(좀비와 해적): 밤마다 좀비가 나오게 하기, 고르기(누르기), 주인공·시설을 때렸을 때, 아침에 사라지기. (5.8)
// 해적이 나오는 때와 자리는 PirateSystem 이 정한다(여기의 add 를 부른다).
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

  // 좀비 한 마리가 좀비가 나오는 자리 중 하나에 나온다 (5.8). 땅에서 올라오며 흙이 튄다 (12.3, 12.6)
  spawn(kind = 'zombie') {
    const t = this.spawnPoint();
    if (!t) return null;
    const e = this.add(kind, t);
    e.rise();
    this.scene.sfx.play('zombie_rise', { at: e.foot() });
    const F = CONFIG.fx, fx = this.scene.effects, w = e.foot();
    fx.burst(['dirt'], F.chips.rise[0], w.x, w.y);
    fx.burst(['dust'], F.chips.rise[1], w.x, w.y);
    return e;
  }

  // kind 적 한 마리를 칸 t 에 둔다(효과 없이). 해적이 상륙할 때는 이것을 쓴다(물보라는 PirateSystem 이).
  add(kind, t) {
    const e = new Enemy(this, kind, t.col, t.row);
    this.list.push(e);
    return e;
  }

  // 이번 프레임에 길을 찾아도 되는가(한 프레임에 repathsPerFrame 마리까지. 나머지는 다음 프레임에)
  mayRepath() {
    if (this.repathBudget <= 0) return false;
    this.repathBudget -= 1;
    return true;
  }

  // 다른 좀비들이 서 있거나 가고 있는 칸(Enemy.claims)
  takenTiles(me) {
    const out = new Set();
    for (const e of this.list) if (e !== me) for (const t of e.claims()) out.add(t.col + ',' + t.row);
    return out;
  }

  update(dt) {
    this.repathBudget = CONFIG.zombie.repathsPerFrame;
    const clock = this.scene.clock;
    while (clock.isNight && this.schedule.length && clock.t >= this.schedule[0]) {
      this.schedule.shift();
      this.spawn();
    }
    // 길을 오래 못 찾은 좀비부터 움직인다. 길 찾기는 한 프레임에 repathsPerFrame 마리까지라서, 늘 같은 좀비만 기다리지 않게.
    const order = [...this.list].sort((a, b) => a.repathLeft - b.repathLeft);
    for (const e of order) if (e.alive) e.update(dt);
  }

  // 적이 주인공을 때렸다: 하트가 hitDamage 만큼 준다. 들어갔으면 때린 쪽은 멈칫(12.4). 아니면(텐트 안, 쓰러진 뒤) 그대로 휘두른다.
  hitPlayer(e) {
    if (this.scene.hurtPlayer(e.cfg.hitDamage, e)) e.body.strike();
    else e.body.pass();
  }

  // 적이 시설을 쳤다. 텐트가 공격받기 시작하면(attackNotice 초 동안 안 맞다가 맞으면) 알린다. (5.6)
  hitStructure(e, s) {
    this.damageStructure(e, s, e.cfg.structureDamage);
    e.body.strike();
  }

  // 시설에 피해 n. 텐트가 공격받기 시작하면 알린다(총잡이의 총알도 이것을 쓴다)
  damageStructure(e, s, n) {
    const scene = this.scene;
    if (s.type === 'tent') {
      if (scene.elapsed - this.tentHitAt >= CONFIG.build.tent.attackNotice) scene.notice('텐트가 공격받고 있습니다');
      this.tentHitAt = scene.elapsed;
    }
    scene.build.damage(s, n, e);
  }

  // 주인공이 적을 물리쳤다: 바로 목록에서 빠진다(길, 칸, 짓기, 목표는 이제 이 적을 보지 않는다).
  // 그림은 쓰러진 몸으로 남아 사라진다 (12.3). (dx, dy): 밀려나는 쪽
  kill(e, dx, dy) {
    const i = this.list.indexOf(e);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.defeated += 1;
    if (e.kind === 'zombie') this.scene.sfx.play('zombie_die', { at: e.foot() });
    e.die(dx, dy);
  }

  // 먼지와 함께 없앤다(아침)
  remove(e) {
    if (!this.list.includes(e)) return;
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

  // tile 과 붙은 칸(8방향, 같은 칸 포함)에 있는 적 중 가장 가까운 것. 땅에서 올라오는 중인 좀비는 빼고.
  nextTo(tile) {
    let best = null, bestD = Infinity;
    for (const e of this.list) {
      if (e.rising) continue;
      const h = e.here();
      if (Math.max(Math.abs(h.col - tile.col), Math.abs(h.row - tile.row)) > 1) continue;
      const d = Math.hypot(e.col - tile.col, e.row - tile.row);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // (2단계) tile 에서 range 칸(직선거리) 안의 적 중 가장 가까운 것. 땅에서 올라오는 중인 좀비는 빼고. (11.6)
  nearestTo(tile, range) {
    let best = null, bestD = Infinity;
    for (const e of this.list) {
      if (e.rising) continue;
      const d = Math.hypot(e.col - tile.col, e.row - tile.row);
      if (d <= range && d < bestD) { best = e; bestD = d; }
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
