import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// 좀비 한 마리. kind: 'zombie' | 'boss'
class Zombie {
  constructor(system, kind, col, row) {
    this.system = system;
    this.kind = kind;
    this.cfg = CONFIG[kind];
    this.key = kind === 'boss' ? 'char_zombie_boss' : 'char_zombie';
    this.asset = system.map.assets[this.key];
    this.col = col; this.row = row;
    this.tile = { col, row };
    this.next = null;          // 걸어가고 있는 칸
    this.hp = this.cfg.hp;
    this.alive = true;
    this.hitTimer = 0;         // 집·시설을 때리는 간격
    this.playerTimer = 0;      // 주인공 옆에 붙어 있던 시간
    this.flash = 0;            // 맞아서 하얗게 번쩍이는 남은 시간
    const j = CONFIG.zombie.jitter;
    this.ox = (Math.random() * 2 - 1) * j;   // 여럿이 한 칸에 겹쳐도 보이게 조금씩 어긋나게
    this.oy = (Math.random() * 2 - 1) * j * 0.5;

    const w = tileToWorld(col, row);
    this.sprite = system.scene.add.sprite(w.x, w.y, this.key, 0).setOrigin(this.asset.originX, this.asset.originY);
    this.sync();
  }

  get tiles() { return [this.tile]; }   // 주인공이 다가갈 때 쓰는 "차지한 칸"

  face(col, row) {
    const dx = (col - this.col) - (row - this.row);
    if (dx < -0.001) this.sprite.setFlipX(true);
    else if (dx > 0.001) this.sprite.setFlipX(false);
  }

  sync() {
    const w = tileToWorld(this.col, this.row);
    this.sprite.setPosition(w.x + this.ox, w.y + this.oy);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + this.oy + CONFIG.depth.charBias);
    // 안개 속의 좀비는 보이지 않는다(움직이기는 한다)
    this.sprite.setVisible(this.system.fog.isRevealed(this.tile.col, this.tile.row));
  }

  update(dt) {
    const sys = this.system;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.sprite.clearTint();
    }

    let walking = false;
    let left = this.cfg.speed * sys.speedFactorAt(this.col, this.row) * dt;
    for (let guard = 0; guard < 4 && left > 0; guard++) {
      if (!this.next) {
        const n = sys.nextStep(this.tile.col, this.tile.row);
        if (!n) break;                                   // 집 옆에 도착했거나 길이 없다
        if (sys.map.structureAt(n.col, n.row)) break;    // 시설이 길을 막고 있다
        this.next = n;
      }
      walking = true;
      const dc = this.next.col - this.col, dr = this.next.row - this.row;
      const dist = Math.hypot(dc, dr);
      this.face(this.next.col, this.next.row);
      if (dist <= left) {
        this.col = this.next.col; this.row = this.next.row;
        this.tile = { col: this.col, row: this.row };
        this.next = null;
        left -= dist;
      } else {
        this.col += dc / dist * left;
        this.row += dr / dist * left;
        left = 0;
      }
    }

    // 서 있으면: 길을 막은 시설을 때리거나, 집 옆이면 집을 때린다
    if (!walking && !this.next) {
      const n = sys.nextStep(this.tile.col, this.tile.row);
      const blocker = n ? sys.map.structureAt(n.col, n.row) : null;
      const atHouse = sys.isGoal(this.tile.col, this.tile.row);
      if (blocker || atHouse) {
        this.hitTimer += dt;
        if (blocker) this.face(blocker.col, blocker.row);
        else this.face(sys.houseCenter.col, sys.houseCenter.row);
        if (this.hitTimer >= this.cfg.hitInterval) {
          this.hitTimer = 0;
          if (blocker) sys.scene.build.damage(blocker, this.cfg.hitDamage);
          else sys.scene.damageHouse(this.cfg.hitDamage);
        }
      } else {
        this.hitTimer = 0;
      }
    } else {
      this.hitTimer = 0;
    }

    if (!this.alive) return;   // 집이 부서져 아침이 되면 이 좀비도 사라진다

    // 옆 칸에 주인공이 있으면 일정 시간마다 때린다(붙은 뒤 첫 공격도 그만큼 뒤)
    const p = sys.scene.player.tile;
    const near = Math.max(Math.abs(p.col - this.tile.col), Math.abs(p.row - this.tile.row)) <= 1;
    if (near) {
      this.playerTimer += dt;
      if (this.playerTimer >= CONFIG.zombie.playerHitInterval) {
        this.playerTimer = 0;
        sys.scene.hurtPlayer(CONFIG.zombie.playerDamage);
      }
    } else {
      this.playerTimer = 0;
    }

    if (walking) {
      this.sprite.anims.play(this.key + '_walk', true);
    } else {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      this.sprite.setFrame(this.asset.frames.indexOf('walk1'));
    }
    this.sync();
  }
}

// 좀비 전체: 나오기, 길찾기, 물리치기 (5.8)
export class ZombieSystem {
  constructor(scene, mapSystem, fog) {
    this.scene = scene;
    this.map = mapSystem;
    this.fog = fog;
    this.list = [];
    this.toSpawn = [];         // 이번 밤에 나올 시각(초)들
    this.fieldDirty = true;
    this.fieldAge = Infinity;  // 길을 마지막으로 계산한 뒤 흐른 시간

    const h = mapSystem.map.house;
    this.houseCenter = { col: h.col + (h.w - 1) / 2, row: h.row + (h.h - 1) / 2 };
    // 목표: 집에 붙은 칸(둘레 8방향)
    const n = mapSystem.cols * mapSystem.rows;
    this.goal = new Uint8Array(n);
    this.goalTiles = [];
    for (let r = h.row - 1; r <= h.row + h.h; r++) for (let c = h.col - 1; c <= h.col + h.w; c++) {
      if (!mapSystem.inBounds(c, r) || !this.passable(c, r)) continue;
      this.goal[r * mapSystem.cols + c] = 1;
      this.goalTiles.push({ col: c, row: r });
    }
    this.dist = new Float64Array(n);
    this.nextIdx = new Int32Array(n);

    scene.events.on('structures-changed', () => { this.fieldDirty = true; });
  }

  // 좀비가 (시설을 부수고라도) 지나갈 수 있는 칸인가. 자연 사물, 집, 물은 못 지나간다.
  passable(col, row) { return this.map.isLand(col, row) && !this.map.isSolid(col, row); }
  isGoal(col, row) { return this.goal[row * this.map.cols + col] === 1; }

  // 모닥불 등으로 느려지는 정도(1 = 보통). Phase 7 에서 쓴다.
  speedFactorAt() { return 1; }

  // 집까지의 길을 모든 칸에 대해 한 번에 계산한다(집에서 거꾸로 퍼져 나감).
  // 내 시설이 있는 칸은 "부수면 지나갈 수 있는 칸"으로 비용 breakCost.
  computeField() {
    const m = this.map, cols = m.cols, rows = m.rows;
    const dist = this.dist, next = this.nextIdx;
    dist.fill(Infinity);
    next.fill(-1);
    const cost = (c, r) => (m.structureAt(c, r) ? CONFIG.zombie.breakCost : 1);
    const free = (c, r) => m.inBounds(c, r) && this.passable(c, r) && !m.structureAt(c, r);

    const heap = [];
    const push = (d, i) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let s = k;
          if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
          if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
          if (s === k) break;
          [heap[s], heap[k]] = [heap[k], heap[s]];
          k = s;
        }
      }
      return top;
    };

    for (const g of this.goalTiles) {
      const i = g.row * cols + g.col;
      dist[i] = cost(g.col, g.row) - 1;   // 목표 칸에 시설이 있으면 그것도 부숴야 한다
      push(dist[i], i);
    }
    while (heap.length) {
      const [d, cur] = pop();
      if (d > dist[cur]) continue;
      const cc = cur % cols, cr = (cur - cc) / cols;
      const stepCost = cost(cc, cr);     // 이웃 칸에서 이 칸으로 들어오는 비용
      for (const [dc, dr] of DIRS) {
        const nc = cc + dc, nr = cr + dr;
        if (!m.inBounds(nc, nr) || !this.passable(nc, nr)) continue;
        const diagonal = dc !== 0 && dr !== 0;
        // 비스듬히 갈 때는 양옆 칸이 모두 비어 있어야 한다(울타리 사이로 새지 않게)
        if (diagonal && (!free(cc, nr) || !free(nc, cr))) continue;
        const ni = nr * cols + nc;
        const nd = d + stepCost * (diagonal ? Math.SQRT2 : 1);
        if (nd < dist[ni]) {
          dist[ni] = nd;
          next[ni] = cur;
          push(nd, ni);
        }
      }
    }
    this.fieldDirty = false;
    this.fieldAge = 0;
  }

  // (col, row)에서 집 쪽으로 가는 다음 칸. 도착했거나 길이 없으면 null.
  nextStep(col, row) {
    const i = row * this.map.cols + col;
    if (this.goal[i] && !this.map.structureAt(col, row)) return null;
    const n = this.nextIdx[i];
    if (n < 0) return null;
    return { col: n % this.map.cols, row: Math.floor(n / this.map.cols) };
  }

  // 밤이 시작될 때: 이번 밤에 나올 좀비들의 시각을 정한다
  startNight(nightNumber, nightLength) {
    const W = CONFIG.wave;
    const count = Math.min(W.max, W.base + W.perNight * (nightNumber - 1));
    const gap = nightLength * W.spawnWindow / count;
    this.toSpawn = [];
    for (let i = 0; i < count; i++) this.toSpawn.push({ at: (i + W.firstDelay) * gap, kind: 'zombie' });
  }

  // 좀비가 나오는 구역의 자리 중 하나에 나온다
  spawn(kind = 'zombie') {
    const zone = this.scene.spawnZone();
    if (!zone) return null;
    let spots = zone.spawns.filter((s) => this.passable(s.col, s.row) && !this.map.structureAt(s.col, s.row));
    if (!spots.length) spots = zone.spawns;
    const s = spots[Math.floor(Math.random() * spots.length)];
    const z = new Zombie(this, kind, s.col, s.row);
    this.list.push(z);
    if (z.sprite.visible) this.scene.effects.poof(z.sprite.x, z.sprite.y - z.sprite.height * 0.4);
    return z;
  }

  // 보이는 좀비 중 (x, y)를 누른 것. 그림 둘레에 여유를 둔다. 겹치면 앞에 있는 것.
  pick(x, y) {
    const pad = CONFIG.input.charPad;
    let best = null;
    for (const z of this.list) {
      const s = z.sprite;
      if (!s.visible) continue;
      const left = s.x - s.width * s.originX - pad, top = s.y - s.height * s.originY - pad;
      if (x < left || y < top || x > left + s.width + pad * 2 || y > top + s.height + pad * 2) continue;
      if (!best || s.depth > best.sprite.depth) best = z;
    }
    return best;
  }

  // (col, row) 옆 칸(같은 칸 포함)에 있는 좀비 하나
  adjacentTo(col, row) {
    return this.list.find((z) => Math.max(Math.abs(z.tile.col - col), Math.abs(z.tile.row - row)) <= 1) || null;
  }

  // (col, row)에서 range 칸 안의 가장 가까운 좀비
  nearest(col, row, range) {
    let best = null, bestD = range;
    for (const z of this.list) {
      const d = Math.hypot(z.col - col, z.row - row);
      if (d <= bestD) { best = z; bestD = d; }
    }
    return best;
  }

  damage(z, n, byPlayer = false) {
    if (!z.alive) return;
    z.hp -= n;
    z.flash = CONFIG.fx.flashTime;
    z.sprite.setTintFill(0xffffff);
    if (z.hp <= 0) this.kill(z, true);
  }

  // 좀비를 없앤다. defeated 면 별이 튀고 재료가 나올 수 있다.
  kill(z, defeated) {
    if (!z.alive) return;
    z.alive = false;
    const i = this.list.indexOf(z);
    if (i >= 0) this.list.splice(i, 1);
    const s = z.sprite;
    if (s.visible) {
      const y = s.y - s.height * 0.4;
      this.scene.effects.poof(s.x, y);
      if (defeated) this.scene.effects.star(s.x, y);
    }
    if (defeated && Math.random() < CONFIG.zombie.dropChance) {
      const item = Math.random() < 0.5 ? 'wood' : 'stone';
      this.scene.inventory.add(item, 1);
      this.scene.effects.popup(s.x, s.y - CONFIG.fx.popupHeight, 'icon_' + item, '+1');
    }
    s.destroy();
  }

  // 아침: 남은 좀비가 모두 사라진다
  clearAll() {
    for (const z of [...this.list]) this.kill(z, false);
    this.toSpawn = [];
  }

  // 좀비들이 차지한 칸(그 칸에는 지을 수 없다)
  occupiedTiles() {
    const out = [];
    for (const z of this.list) { out.push(z.tile); if (z.next) out.push(z.next); }
    return out;
  }

  update(dt, nightTime) {
    // 시설이 바뀌면 길을 다시 계산한다(0.5초에 한 번 이하)
    this.fieldAge += dt;
    if (this.fieldDirty && this.fieldAge >= CONFIG.zombie.repathInterval) this.computeField();

    if (nightTime !== null) {
      while (this.toSpawn.length && this.toSpawn[0].at <= nightTime) this.spawn(this.toSpawn.shift().kind);
    }
    for (const z of [...this.list]) if (z.alive) z.update(dt);
  }
}
