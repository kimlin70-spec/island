import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { Walker } from './Walker.js';
import { Body } from './Body.js';

// 적 한 마리: 좀비(5.8)와 해적(5.12). 해적은 좀비와 같은 규칙으로 움직이고 때린다. 다른 것은 숫자(cfg)와 그림뿐이다.
// 목표(주인공. 주인공이 텐트 안에 있으면 텐트)에 붙은 칸 중 가장 가까운 곳으로 걸어가서 때린다.
// 내 시설은 "부수면 지나갈 수 있는 칸"이다(길찾기 비용 breakCost). 다음에 갈 칸이 시설이면 그 앞에 서서 부순다.
// 위치와 길, 걷기, 몸이 걸친 칸은 Walker 에, 그림의 움직임(애니메이션, 앞뒤, 맞기, 멈칫)은 Body 에 있다(주인공과 같다).
export const ENEMY_KINDS = {
  zombie:   { key: 'char_zombie',   cfg: () => CONFIG.zombie, slowByFire: true },
  pirate_1: { key: 'char_pirate_1', cfg: () => CONFIG.pirate, slowByFire: false },   // 해적은 모닥불에 느려지지 않는다 (5.7)
  pirate_2: { key: 'char_pirate_2', cfg: () => CONFIG.pirate, slowByFire: false },
  // (2단계) 총잡이 해적 (11.7): 사거리 안에 들어오면 멈춰 서서 겨누고 쏜다. 걸어오는 것과 시설을 부수는 것은 다른 해적과 같다.
  pirate_3: { key: 'char_pirate_3', cfg: () => CONFIG.gunner, slowByFire: false, ranged: true },
};

export class Enemy extends Walker {
  constructor(system, kind, col, row) {
    super(system.map, col, row);
    const K = ENEMY_KINDS[kind];
    this.system = system;
    this.scene = system.scene;
    this.kind = kind;
    this.key = K.key;
    this.cfg = K.cfg();
    this.slowByFire = K.slowByFire;
    this.ranged = !!K.ranged;
    this.asset = this.map.assets[this.key];
    // 체력. 2단계부터는 stage2.enemyHpScale 배(사용자 요청: 난이도)
    this.hp = this.cfg.hp * (this.scene.stage >= 2 ? CONFIG.stage2.enemyHpScale : 1);
    this.maxHp = this.hp;
    this.alive = true;

    this.repathLeft = 0;     // 다음에 길을 다시 찾을 수 있을 때까지 남은 시간(초)
    this.wantPath = true;    // 길을 다시 찾아야 한다(목표의 칸이 바뀌었거나 시설이 생기고 없어졌다)
    this.goalKey = null;     // 지금 길을 찾았을 때의 목표 칸들
    this.goalKind = null;    // 그때의 목표: 'player' | 'tent'
    this.targetKeys = null;  // 길을 찾는 동안에만: 목표 칸(주인공의 칸, 텐트)들. 'col,row' 의 Set
    this.hitLeft = null;     // 주인공을 때리기까지 남은 시간(초). 붙어 있지 않으면 null
    this.smashing = null;    // 치고 있는 시설
    this.smashLeft = 0;      // 그 시설을 치기까지 남은 시간(초)
    this.swingFor = null;    // 휘두르기 시작한 대상: 'player' 또는 시설
    this.wireLeft = null;    // (2단계) 철조망 위에서 다음 피해까지 남은 시간(초). 철조망 위가 아니면 null
    this.gun = null;         // (2단계, 총잡이) 쏘는 중 { t: 이번 한 번의 겨누기 시작부터 흐른 시간, shot: 이번에 쐈는가, fresh }
    this.gunCool = 0;        // (2단계, 총잡이) 쏘다가 그만뒀을 때, 다시 겨누기를 시작할 수 있을 때까지 남은 시간(초)

    this.sprite = this.scene.add.sprite(0, 0, this.key).setOrigin(this.asset.originX, this.asset.originY);
    this.body = new Body(this.scene, this.sprite, this.key);
    this.body.onStep = () => this.stepped();
    this.syncSprite();
  }

  // 땅에서 올라오는 중인가 (12.3). 그동안은 움직이지도, 길을 찾지도, 때리지도, 맞지도 않는다.
  get rising() { return this.body.final === 'rise'; }
  rise() { this.body.setFinal('rise', this.body.ms('rise')); }

  // 발 위치(월드). 맞아서 밀린 그림이 아니라 규칙의 위치.
  foot() { return tileToWorld(this.col, this.row); }

  // 주인공이 이 적을 칠 때 붙어야 하는 칸(Player.act 가 읽는다). 걷는 중이면 몸의 한가운데가 있는 칸.
  get tiles() { return [this.here()]; }

  // 지나가는 비용: 땅 1, 내 시설은 breakCost(부수고 지나간다), 철조망은 pathCost(조금 돌아가서 피할 수 있으면 피한다, 11.4).
  // 물과 나무·돌·덤불은 못 간다.
  costAt(col, row) {
    if (!this.map.isOpen(col, row)) return 0;
    if (this.map.structureAt(col, row)) return this.cfg.breakCost;
    return this.map.wireAt(col, row) ? CONFIG.build.wire.pathCost : 1;
  }

  // 길을 찾을 때: 목표 칸(주인공의 칸)에서 시설 칸으로 바로 들어가는 걸음은 넣지 않는다.
  // 주인공의 칸을 밟고 지나가는 것은 되지만(문 같은 좁은 틈), 거기 멈춰 서서 시설을 부수게 되는 길은 고르지 않는다.
  stepOk(fc, fr, tc, tr) {
    return !(this.targetKeys && this.targetKeys.has(fc + ',' + fr) && this.map.structureAt(tc, tr));
  }

  // 비스듬히 갈 때 양옆 칸은 비어 있어야 한다. 시설 두 개 사이를 비스듬히 빠져나가지 않는다.
  sideOk(col, row) { return this.map.isWalkable(col, row); }

  // 다음 칸이 시설이면 그 앞에서 멈춘다(부순 다음에 간다)
  mayEnter(t) { return !this.map.structureAt(t.col, t.row); }

  // 목표 옆의 제자리에 오면 멈춘다. 목표 칸 위나 다른 적의 자리면 멈추지 않고 가던 길을 간다.
  onArrive() { if (this.inPlace(this.system.target())) this.path.length = 0; }

  // 서 있는 칸이 목표 칸 중 하나와 붙어 있는가(8방향, 같은 칸 포함). 붙어 있으면 때린다.
  nextTo(target) {
    return target.tiles.some((t) => Math.max(Math.abs(t.col - this.tile.col), Math.abs(t.row - this.tile.row)) <= 1);
  }

  // 칸 t(기본: 서 있는 칸)가 목표 칸 중 하나인가(주인공과 같은 칸)
  onTarget(target, t = this.tile) { return target.tiles.some((g) => g.col === t.col && g.row === t.row); }

  // (총잡이) 칸 t(기본: 서 있는 칸)에서 목표(주인공의 칸, 텐트면 네 칸의 한가운데)까지가 사거리 안인가 (11.7)
  inRange(target, t = this.tile) {
    const n = target.tiles.length;
    const c = target.tiles.reduce((a, g) => a + g.col, 0) / n, r = target.tiles.reduce((a, g) => a + g.row, 0) / n;
    return Math.hypot(c - t.col, r - t.row) <= this.cfg.range;
  }

  // 여기 서서 목표를 치면 되는가: 목표에 붙은 칸이고(총잡이는 사거리 안), 목표 칸 위가 아니고(주인공과 한 칸에 겹쳐 서지 않게),
  // 다른 적이 서 있거나 가고 있는 칸이 아니다(두 마리가 한 칸에 겹쳐 서서 한 마리처럼 보이지 않게).
  inPlace(target) {
    const t = this.tile;
    if (!(this.ranged ? this.inRange(target) : this.nextTo(target)) || this.onTarget(target)) return false;
    return !this.system.takenTiles(this).has(t.col + ',' + t.row);
  }

  // 목표 칸들에 붙은 칸 중 설 수 있는 곳(시설이 있으면 부수고 선다).
  // all: 그런 칸 전부. free: 그중 다른 적이 서 있거나 가고 있지 않은 칸. plain, freePlain: 그중 시설이 없는 칸.
  goalsAround(tiles) {
    const all = [], seen = new Set(tiles.map((t) => t.col + ',' + t.row));
    for (const t of tiles) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = t.col + dc, r = t.row + dr, k = c + ',' + r;
        if (seen.has(k) || !this.costAt(c, r)) continue;
        seen.add(k);
        all.push({ col: c, row: r });
      }
    }
    const taken = this.system.takenTiles(this);
    const free = all.filter((t) => !taken.has(t.col + ',' + t.row));
    const plain = (t) => !this.map.structureAt(t.col, t.row);
    return { all, free, plain: all.filter(plain), freePlain: free.filter(plain) };
  }

  // 다른 좀비가 피할 칸: 가고 있는 칸(길의 끝)과, 칸 한가운데에 서 있으면 그 칸(시설 앞에 서서 부수는 중일 때도)
  claims() {
    const end = this.path[this.path.length - 1];
    const out = end ? [end] : [];
    if (!end || (this.col === this.tile.col && this.row === this.tile.row)) out.push(this.tile);
    return out;
  }

  // 길을 다시 찾는다. 이미 목표 옆의 제자리에 서 있으면 그대로 있는다.
  // 다른 적이 없는 칸으로 가는 길을 먼저 찾는다. 그런 칸이 없거나 갈 수 없으면 다른 적이 있는 칸이라도 간다.
  // 주인공의 칸 위에 있으면(주인공이 다가왔거나 해서) 먼저 한 걸음에 갈 수 있는 시설 없는 옆 칸으로 비켜선다(그 자리에서 때리지 않는다).
  // 한 걸음 내딛는 중이면 그 칸까지는 그대로 간다(길을 자주 다시 찾아도 되돌아가며 떨지 않게).
  repath(target, key) {
    this.wantPath = false;
    this.repathLeft = this.cfg.repathInterval;
    this.goalKey = key;
    this.goalKind = target.structure ? 'tent' : 'player';
    if (!this.moving && this.inPlace(target)) return;
    const g = this.goalsAround(target.tiles);
    const midStep = this.path[0] && (this.col !== this.tile.col || this.row !== this.tile.row);
    const from = midStep ? this.path[0] : this.tile;          // 길을 찾기 시작하는 칸
    // 주인공의 칸 위면: 한 걸음에 바로 들어갈 수 있는 시설 없는 옆 칸으로 비켜선다(다른 적이 없는 칸 먼저)
    const step1 = (list) => list.filter((t) => this.canStep(from, t));
    const lists = this.onTarget(target, from) ? [step1(g.freePlain), step1(g.plain), g.free, g.all] : [g.free, g.all];
    const tried = new Set();
    this.targetKeys = new Set(target.tiles.map((t) => t.col + ',' + t.row));
    let found = false;
    for (const list of lists) {
      const k = list.map((t) => t.col + ',' + t.row).join(' ');
      if (!list.length || tried.has(k)) continue;
      tried.add(k);
      if (this.routeOn(list)) { found = true; break; }
    }
    this.targetKeys = null;
    if (!found) this.wantPath = true;                // 갈 길이 없으면 조금 뒤에 다시 찾는다
  }

  // 시설이 생기거나 없어졌다: 지금 길에서 갈 수 없게 된 걸음 앞에서 멈추고, 길을 다시 찾는다
  onMapChanged() {
    super.onMapChanged();
    this.wantPath = true;
  }

  // 모닥불 가까이(slowRange 칸 안)에서는 느려진다 (5.7). 철조망 칸 위에서는 wire.slow 배 (11.4)
  speedNow() {
    const C = CONFIG.build.campfire;
    const slow = this.slowByFire && this.map.structures.some((s) =>
      s.type === 'campfire' && Math.hypot(s.col - this.col, s.row - this.row) <= C.slowRange);
    return this.cfg.speed * (slow ? C.slow : 1) * (this.wireUnder() ? CONFIG.build.wire.slow : 1);
  }

  // 몸의 한가운데가 있는 칸의 철조망(없으면 null)
  wireUnder() {
    const h = this.here();
    return this.map.wireAt(h.col, h.row);
  }

  // (2단계) 철조망 위에 있는 동안 damageInterval 초마다 피해. 줄 때마다 철조망 체력이 1 준다 (11.4)
  touchWire(dt) {
    const w = this.wireUnder(), W = CONFIG.build.wire;
    if (!w) {
      this.wireLeft = null;
      return;
    }
    if (this.wireLeft === null) this.wireLeft = W.damageInterval;
    this.wireLeft -= dt;
    if (this.wireLeft > 0) return;
    this.wireLeft += W.damageInterval;
    this.scene.build.wear(w);
    this.harm(W.damage);
  }

  face(dx, dy) { this.body.face(dx, dy); }

  // 칸 t(소수 칸도 된다) 쪽을 본다. 휘두르는 동안은 바꾸지 않는다.
  faceTile(t) {
    if (this.body.attacking()) return;
    const dc = t.col - this.col, dr = t.row - this.row;
    this.body.look(dc - dr, dc + dr);
  }

  // 지금 서 있는 자리에서 칠 것: 목표 옆이면 목표(주인공은 'player', 텐트는 그 시설), 다음 칸이 시설이면 그 시설.
  // 시설이 아닌 칸으로 걸어갈 길이 있으면(다른 칸으로 옮기려는 중) 치지 않고 걷는다. 없으면 null.
  // (update 의 '서 있는 동안 하는 일'과 같은 규칙. 휘두르기 시작한 대상이 이것과 다르면 그만둔다.)
  aim(target) {
    const t = this.tile;
    if (this.col !== t.col || this.row !== t.row) return null;
    const next = this.path.find((p) => p.col !== t.col || p.row !== t.row);
    const blocker = next ? this.map.structureAt(next.col, next.row) : null;
    if (next && !blocker) return null;
    if (this.nextTo(target) && !this.onTarget(target)) return target.structure || 'player';
    return blocker;
  }

  update(dt) {
    this.body.tick(dt);
    if (this.rising) {                               // 땅에서 올라오는 중
      this.syncSprite(true);
      return;
    }
    this.repathLeft -= dt;
    this.gunCool = Math.max(0, this.gunCool - dt);

    // 길을 다시 찾을 때: 목표의 칸이 바뀌었다(주인공이 움직였다, 텐트에 들어가거나 나왔다), 시설이 생기거나 없어졌다,
    // 서 있는데 목표 옆의 제자리가 아니다. 다만 시설을 부수는 중이면 주인공이 움직였다는 것만으로는 바꾸지 않는다(하던 것을 마저 부순다).
    const target = this.system.target();
    const key = target.tiles.map((t) => t.col + ',' + t.row).join(' ');
    const kind = target.structure ? 'tent' : 'player';
    if (key !== this.goalKey && !(this.smashing && kind === this.goalKind)) this.wantPath = true;
    // 서 있는데(목표 옆에서 시설에 막혀 서 있는 것도) 목표 옆의 제자리가 아니면 다시 찾는다(빈 칸이 생기면 옮긴다)
    const nx = this.path[0];
    const held = nx && this.col === this.tile.col && this.row === this.tile.row
      && (nx.col !== this.tile.col || nx.row !== this.tile.row) && !!this.map.structureAt(nx.col, nx.row);
    if ((!this.moving || (held && this.nextTo(target))) && !this.inPlace(target)) this.wantPath = true;
    if (this.wantPath && this.repathLeft <= 0 && this.system.mayRepath()) this.repath(target, key);

    // 휘두르기 시작(hit 프레임 전)인데 그 대상을 더는 칠 수 없으면(주인공이 비켜 갔다, 텐트에 들어갔다, 시설이 없어졌다)
    // 피해 없이 그만두고 바로 걷는다. 맞힌 뒤에는 따라 내려가는 동작을 다 보여 준 뒤에 걷는다(시설을 부순 마지막 한 대도).
    if (this.body.winding() && this.aim(target) !== this.swingFor) this.body.cancel();
    const swinging = this.body.attacking();
    if (!swinging) this.walk(dt, this.speedNow());
    this.touchWire(dt);
    if (!this.alive) return;

    // 서 있는 동안 하는 일: 목표 옆이면 목표를, 다음 칸이 시설이면 그 시설을 친다
    const atCentre = this.col === this.tile.col && this.row === this.tile.row;
    const next = this.path[0];
    const blocker = atCentre && next && (next.col !== this.tile.col || next.row !== this.tile.row)
      ? this.map.structureAt(next.col, next.row) : null;
    const standing = atCentre && (!this.moving || blocker || swinging);
    if (this.ranged) {                               // 총잡이: 사거리 안에 서 있으면 쏜다. 시설에 막혔으면 부순다.
      if (standing && this.inRange(target) && !this.onTarget(target)) {
        this.hitLeft = null;
        this.smashing = null;
        this.gunCycle(target, dt);
      } else {
        this.gunStop();
        if (blocker) this.smash(blocker, dt);
        else this.smashing = null;
      }
    } else if (standing && this.nextTo(target) && !this.onTarget(target)) {   // 주인공의 칸 위에서는 때리지 않는다(비켜선 뒤에)
      if (target.structure) this.smash(target.structure, dt);
      else this.attackPlayer(dt);
    } else if (blocker) {
      this.smash(blocker, dt);
    } else {
      this.hitLeft = null;
      this.smashing = null;
    }
    this.syncSprite(standing);
  }

  // (총잡이) 쏘는 한 번 (11.7, 12.3): aim(aimTime) -> shoot(그 순간 총구 불꽃과 총알) -> reload -> 쉼. 한 번에 interval 초.
  // 겨누는 동안은 목표 쪽을 보고, 쏘는 순간의 목표 자리로 총알이 곧게 간다(그 사이에 움직이면 피할 수 있다).
  // 그림은 이 시간에 맞춰 튼다. 맞아서 hurt 를 보여 준 뒤에는 그 시간의 그림으로 돌아간다.
  gunCycle(target, dt) {
    const G = this.cfg;
    if (!this.gun) {
      if (this.gunCool > 0) {                        // 쏘고 비켜섰다 돌아왔다: 지난번에 쏜 뒤 아직 interval 이 지나지 않았다
        this.faceGoal(target);
        return;
      }
      this.gun = { t: 0, shot: false, fresh: true };
    }
    const g = this.gun;
    if (g.fresh) g.fresh = false;
    else g.t += dt;
    if (g.t >= G.interval) {                         // 한 번 끝: 남은 시간을 이어서 바로 다음 겨누기(긴 프레임에도 interval 마다)
      g.t -= G.interval;
      g.shot = false;
    }
    if (!g.shot) this.faceGoal(target);
    if (!g.shot && g.t >= G.aimTime) {
      g.shot = true;
      this.gunFire(target);
    }
    const shootEnd = G.aimTime + this.body.ms('shoot'), reloadEnd = shootEnd + this.body.ms('reload');
    const [name, at] = g.t < G.aimTime ? ['aim', g.t] : g.t < shootEnd ? ['shoot', g.t - G.aimTime]
      : g.t < reloadEnd ? ['reload', g.t - shootEnd] : [null, 0];
    const b = this.body;
    if (name && !(b.act && b.act.name === name) && b.hurtLeft <= 0) {
      b.play(name, at);
      if (name === 'shoot') b.pass();                // 쏘는 그림은 첫 장이 hit. 멈칫 없이 그대로 간다
    }
  }

  // 쏘던 것을 그만둔다(사거리를 벗어났다, 비켜서야 한다). 겨누기만 하고 못 쐈으면 다음에는 바로 다시 겨눌 수 있다.
  gunStop() {
    const g = this.gun;
    if (!g) return;
    this.gunCool = g.shot ? this.cfg.interval - g.t : 0;   // 쏜 뒤면 그 한 번의 남은 시간(장전)이 지나야 다시 겨눈다
    this.gun = null;
    const a = this.body.act;
    if (a && (a.name === 'aim' || a.name === 'shoot' || a.name === 'reload')) this.body.cancel();
  }

  // 목표 쪽을 본다(텐트면 네 칸의 한가운데)
  faceGoal(target) {
    const n = target.tiles.length;
    this.faceTile({ col: target.tiles.reduce((a, t) => a + t.col, 0) / n, row: target.tiles.reduce((a, t) => a + t.row, 0) / n });
  }

  // 쏜다: 총구(shoot 그림, 왼쪽을 보면 x 를 뒤집는다)에서 불꽃과 연기, 빛. 총알은 지금의 목표 자리로 곧게 bulletSpeed 로 간다.
  // 주인공을 쐈으면 도착했을 때 주인공이 그 점에서 dodgeRadius 칸 안에 있어야 맞는다(하트 damage). 아니면 땅에 먼지.
  // 텐트를 쐈으면(주인공이 텐트 안) 반드시 맞는다(피해 tentDamage).
  gunFire(target) {
    const G = this.cfg, scene = this.scene, shots = scene.shots, sp = this.sprite;
    const m = this.asset.muzzle.shoot, flip = sp.flipX;
    const from = { x: sp.x + (flip ? -m[0] : m[0]), y: sp.y + m[1] };
    shots.muzzle(from.x, from.y, { flip });
    scene.sfx.play('gun_shot', { at: from });
    const H = CONFIG.tower.hitHeight;
    const tent = target.structure;
    if (tent) {
      const n = tent.tiles.length, w = tileToWorld(tent.tiles.reduce((a, t) => a + t.col, 0) / n, tent.tiles.reduce((a, t) => a + t.row, 0) / n);
      shots.straight(from, { x: w.x, y: w.y - H }, G.bulletSpeed, () => {
        if (scene.map.structures.includes(tent)) this.system.damageStructure(this, tent, G.tentDamage);
        else shots.dust(w);
      });
      return;
    }
    const pl = scene.player, at = { col: pl.col, row: pl.row }, w = tileToWorld(at.col, at.row);
    shots.straight(from, { x: w.x, y: w.y - H }, G.bulletSpeed, () => {
      const hit = !scene.rest.resting && Math.hypot(pl.col - at.col, pl.row - at.row) <= G.dodgeRadius;
      if (!hit || !scene.hurtPlayer(G.damage, this)) shots.dust(w);
    });
  }

  // 주인공 옆: 붙은 뒤 firstHitDelay 초 뒤에 처음 때리고, 그다음부터 hitInterval 초마다 하트 1
  attackPlayer(dt) {
    this.smashing = null;
    this.faceTile(this.scene.player.here());
    if (this.hitLeft === null) this.hitLeft = this.cfg.firstHitDelay;
    this.hitLeft -= dt;
    this.windUp('player', this.hitLeft);
    if (this.hitLeft > 0) return;
    this.hitLeft += this.cfg.hitInterval;
    this.system.hitPlayer(this);
  }

  // 시설(울타리, 모닥불, 텐트) 앞: structureInterval 초마다 structureDamage
  smash(s, dt) {
    this.hitLeft = null;
    const n = s.tiles.length;
    this.faceTile({ col: s.tiles.reduce((a, t) => a + t.col, 0) / n, row: s.tiles.reduce((a, t) => a + t.row, 0) / n });
    if (this.smashing !== s) {
      this.smashing = s;
      this.smashLeft = this.cfg.structureInterval;
    }
    this.smashLeft -= dt;
    this.windUp(s, this.smashLeft);
    if (this.smashLeft > 0) return;
    this.smashLeft += this.cfg.structureInterval;
    this.system.hitStructure(this, s);
  }

  // 때리기까지 left 초 남았다 (12.3): attack 의 hit 프레임까지 걸리는 시간 안으로 들어오면 attack 을 튼다.
  // 늦었으면(프레임이 길었으면) 그만큼 지난 곳부터. 그래서 hit 프레임이 피해를 주는 순간에 나온다.
  windUp(what, left) {
    if (this.body.attacking()) return;
    const W = this.body.hitAt(this.body.pick('attack'));
    if (W === null || left > W) return;
    this.body.play('attack', W - left);
    this.scene.sfx.play('swing', { at: this.foot(), volume: CONFIG.sound.swing });
    this.swingFor = what;
  }

  // 주인공(from)에게 맞았다 (12.4): 맞은 곳, 하얗게 번쩍임, 조각(goo), 때린 쪽 반대로 밀림, hurt, 멈칫.
  // 체력이 0이 되면 hurt 와 멈칫 없이 쓰러진다(EnemySystem.kill).
  hurt(n, from = this.scene.player) {
    const F = CONFIG.fx, fx = this.scene.effects, me = this.foot(), at = from.foot();
    this.hp -= n;
    this.scene.sfx.play('hit_enemy', { at: me });
    const p = fx.impact(me.x, me.y - F.impactHeight.char, at);
    fx.flash(this.sprite);
    fx.burst(['goo'], F.chips.enemyHit, p.x, p.y);
    if (this.hp <= 0) {
      this.system.kill(this, me.x - at.x, me.y - at.y);
      return;
    }
    this.body.hurt();
    this.body.knockFrom(me.x - at.x, me.y - at.y);
    this.body.freeze();
  }

  // 때린 쪽 없이 다쳤다(철조망): 번쩍임, 조각, hurt. 체력이 0이 되면 쓰러진다(밀리지 않는다).
  harm(n) {
    const F = CONFIG.fx, fx = this.scene.effects, me = this.foot();
    this.hp -= n;
    this.scene.sfx.play('hit_enemy', { at: me });
    fx.flash(this.sprite);
    fx.burst(['goo'], F.chips.enemyHit, me.x, me.y - F.impactHeight.char);
    if (this.hp <= 0) {
      this.system.kill(this, 0, 0);
      return;
    }
    this.body.hurt();
  }

  // 그림: 걸으면 walk, 서 있으면 idle, 때릴 때 attack (12.3). 깊이는 발 위치. 깎였을 때만 체력 막대.
  // standing: 서 있는가(시설에 막혀 길은 있지만 서 있는 것도).
  syncSprite(standing = !this.moving) {
    const F = CONFIG.fx, sp = this.sprite;
    const w = tileToWorld(this.col, this.row), o = this.body.offset();
    sp.setPosition(w.x + o.x, w.y + o.y);
    sp.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
    this.body.show(!standing);
    if (this.hp < this.maxHp) {
      this.scene.effects.showBar(this, this.hp / this.maxHp, w.x, w.y - sp.displayHeight * sp.originY - F.barGap, Infinity);
    }
  }

  // 쓰러졌다 (12.3): 규칙에서는 바로 빠지고(EnemySystem.kill), 그림은 쓰러진 몸이 되어 die -> 흐려짐 -> 연기.
  // (dx, dy): 맞아서 밀려나는 쪽
  die(dx, dy) {
    this.alive = false;
    this.path.length = 0;
    this.scene.effects.removeBar(this);
    this.body.detach();
    const L = Math.hypot(dx || 0, dy || 0);
    this.scene.effects.corpse(this.sprite, this.key, L ? dx / L : 0, L ? dy / L : 0, this.kind === 'zombie' ? 'fx_vanish' : 'fx_dust');
  }

  // 없앤다(아침. 먼지는 부르는 쪽에서)
  destroy() {
    this.alive = false;
    this.path.length = 0;
    this.scene.effects.removeBar(this);
    this.body.detach();
    this.sprite.destroy();
  }
}
