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
    this.structureHitAt = -Infinity;   // (지하) 시설이 마지막으로 맞은 때. 침대의 빨리 감기를 멈춘다 (17.7)
    this.newsAt = -Infinity;           // (지하) "땅 위: 캠프가 공격받고 있습니다"를 마지막으로 띄운 때 (17.9)
    this.repathBudget = 0;       // 이번 프레임에 길을 더 찾을 수 있는 좀비 수
    scene.events.on('night', () => this.startNight());
  }

  // N번째 밤에 나오는 수 = base + perNight × (N − 1), 최대 max. 밤의 처음 spawnWindow 동안 같은 간격으로 한 마리씩.
  startNight() {
    const W = CONFIG.wave, n = Math.min(W.max, W.base + W.perNight * (this.scene.clock.day - 1));
    const span = W.spawnWindow * CONFIG.time.nightLength;
    this.schedule = Array.from({ length: n }, (_, i) => i * span / n);
  }

  // 지금 적(e)이 노리는 것: 주인공. 주인공이 텐트 안에 있으면 텐트.
  // (해적의 지하 침입, 18장) 해적: 주인공이 지하에 있으면 굴 입구(뚜껑을 부수고, 부서졌으면 그 칸으로 가서 내려간다).
  // 지하의 해적은 주인공이 지하면 주인공, 땅 위면 사다리 칸으로 가서 올라간다. climb: 그 칸에 올라서서 오르내린다('down' | 'up')
  target(e) {
    const s = this.scene, R = s.raid;
    if (e && R.isRaider(e)) {
      if (e.under) {
        if (s.ug.active) return { tiles: [s.player.here()], structure: null };
        const t = s.ug.floor.entry;
        if (!R.burrow) return { tiles: [{ col: t.col, row: t.row }], structure: null, wander: true };   // 굴 입구가 없어졌다: 아침까지 지하에서 서성인다
        return { tiles: [{ col: t.col, row: t.row }], structure: null, climb: 'up' };
      }
      const b = s.ug.active ? R.burrow : null;
      if (b && b.broken) return { tiles: [{ col: b.col, row: b.row }], structure: null, climb: 'down' };
      if (b) return { tiles: b.tiles, structure: b };
    }
    // (지하) 주인공이 지하에 있으면 없는 것으로 친다: 가까운 시설을 노리고(굴 입구는 빼고), 없으면 굴 입구 둘레를 돌아다닌다 (17.2)
    if (s.ug.active) {
      const b = s.ug.burrow, at = b || s.player;
      const list = s.map.structures.filter((x) => x.blocks && x.type !== 'burrow');
      list.sort((a, c) => Math.hypot(a.col - at.col, a.row - at.row) - Math.hypot(c.col - at.col, c.row - at.row));
      if (list.length) return { tiles: list[0].tiles, structure: list[0] };
      return { tiles: b ? b.tiles : [{ col: s.ug.surfaceSpot.col, row: s.ug.surfaceSpot.row }], structure: null, wander: true };
    }
    if (s.rest.resting) return { tiles: s.rest.tent.tiles, structure: s.rest.tent };
    return { tiles: [s.player.here()], structure: null };
  }

  // 나오는 자리: map.zombieSpawns 중 주인공에게서 spawnMinDistance 칸(직선거리) 이상 떨어진 곳에서 무작위.
  // 그런 곳이 없으면 가장 먼 곳. 시설을 지어 막힌 자리는 쓰지 않는다.
  spawnPoint() {
    const ug = this.scene.ug, p = ug.active ? (ug.burrow || ug.surfaceSpot) : this.scene.player, min = CONFIG.zombie.spawnMinDistance;
    const free = this.scene.mapData.zombieSpawns.filter((t) => this.map.isPassable(t.col, t.row));
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
    for (const e of this.list) if (e !== me && e.map === me.map && !e.transit) for (const t of e.claims()) out.add(t.col + ',' + t.row);   // 같은 층의 적만
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
    this.structureHitAt = scene.elapsed;
    if (s.type === 'burrow') { scene.raid.hitHatch(e, s); return; }   // (지하 침입) 굴 입구 뚜껑 (18.2)
    if (scene.ug.active) {                           // (지하) 땅 위 소식: attackNotice 초에 한 번 이하 (17.9)
      if (scene.elapsed - this.newsAt >= CONFIG.ug.attackNotice) { scene.surfaceNews('캠프가 공격받고 있습니다'); this.newsAt = scene.elapsed; }
    } else if (s.type === 'tent') {
      if (scene.elapsed - this.tentHitAt >= CONFIG.build.tent.attackNotice) scene.notice('텐트가 공격받고 있습니다');
      this.tentHitAt = scene.elapsed;
    }
    this.structureHitAt = scene.elapsed;
    scene.build.damage(s, n, e);
  }

  // 주인공이 적을 물리쳤다: 바로 목록에서 빠진다(길, 칸, 짓기, 목표는 이제 이 적을 보지 않는다).
  // 그림은 쓰러진 몸으로 남아 사라진다 (12.3). (dx, dy): 밀려나는 쪽
  kill(e, dx, dy) {
    const i = this.list.indexOf(e);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.defeated += 1;
    this.scene.raid.dropLantern(e, true);            // (지하 침입) 등불은 0.3초 동안 흐려지며 사라진다
    if (e.kind === 'zombie') this.scene.sfx.play('zombie_die', { at: e.foot() });
    e.die(dx, dy);
  }

  // 먼지와 함께 없앤다(아침)
  remove(e) {
    if (!this.list.includes(e)) return;
    const sp = e.sprite;
    this.scene.effects.poof(sp.x, sp.y - sp.displayHeight * sp.originY * 0.5);
    this.scene.raid.dropLantern(e, false);
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
      if (e.transit) continue;                       // 사다리를 오르내리는 해적은 누를 수 없다
      const s = e.sprite, left = s.x - s.displayWidth * s.originX, top = s.y - s.displayHeight * s.originY;
      if (x < left - pad || x > left + s.displayWidth + pad || y < top - pad || y > top + s.displayHeight + pad) continue;
      if (!best || s.depth > best.sprite.depth) best = e;
    }
    return best;
  }

  // tile 과 붙은 칸(8방향, 같은 칸 포함)에 있는 적 중 가장 가까운 것. 땅에서 올라오는 중인 좀비는 빼고.
  // (지하 침입) map: 주인공이 있는 층(지도). 그 층의 적만
  nextTo(tile, map = this.map) {
    let best = null, bestD = Infinity;
    for (const e of this.list) {
      if (e.rising || e.transit || e.map !== map) continue;
      const h = e.here();
      if (Math.max(Math.abs(h.col - tile.col), Math.abs(h.row - tile.row)) > 1) continue;
      const d = Math.hypot(e.col - tile.col, e.row - tile.row);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // (2단계) tile 에서 range 칸(직선거리) 안의 적 중 가장 가까운 것. 땅에서 올라오는 중인 좀비는 빼고. (11.6)
  nearestTo(tile, range, map = this.map) {
    let best = null, bestD = Infinity;
    for (const e of this.list) {
      if (e.rising || e.transit || e.map !== map) continue;
      const d = Math.hypot(e.col - tile.col, e.row - tile.row);
      if (d <= range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // 텐트에서 range 칸(직선거리) 안에 적이 있는가. 텐트는 2×2칸이라 네 칸의 한가운데에서 잰다.
  near(s, range) {
    const c = s.tiles.reduce((a, t) => a + t.col, 0) / s.tiles.length, r = s.tiles.reduce((a, t) => a + t.row, 0) / s.tiles.length;
    return this.list.some((e) => !e.under && Math.hypot(e.col - c, e.row - r) <= range);
  }

  // 적의 몸이 걸쳐 있는 칸들. 여기에는 시설을 지을 수 없다.
  // map: 그 층(기본: 땅 위)의 적만
  occupiedTiles(map = this.map) { return this.list.filter((e) => e.map === map).flatMap((e) => e.occupiedTiles()); }

  onMapChanged() { for (const e of this.list) e.onMapChanged(); }

  sprites() { return this.list.map((e) => e.sprite); }
}
