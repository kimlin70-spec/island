import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { Walker } from './Walker.js';

// 적 한 마리: 좀비(5.8)와 해적(5.12). 해적은 좀비와 같은 규칙으로 움직이고 때린다. 다른 것은 숫자(cfg)와 그림뿐이다.
// 목표(주인공. 주인공이 텐트 안에 있으면 텐트)에 붙은 칸 중 가장 가까운 곳으로 걸어가서 때린다.
// 내 시설은 "부수면 지나갈 수 있는 칸"이다(길찾기 비용 breakCost). 다음에 갈 칸이 시설이면 그 앞에 서서 부순다.
// 위치와 길, 걷기, 몸이 걸친 칸은 Walker 에 있다(주인공과 같다).
export const ENEMY_KINDS = {
  zombie:   { key: 'char_zombie',   cfg: () => CONFIG.zombie, slowByFire: true },
  pirate_1: { key: 'char_pirate_1', cfg: () => CONFIG.pirate, slowByFire: false },   // 해적은 모닥불에 느려지지 않는다 (5.7)
  pirate_2: { key: 'char_pirate_2', cfg: () => CONFIG.pirate, slowByFire: false },
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
    this.asset = this.map.assets[this.key];
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.alive = true;

    this.repathLeft = 0;     // 다음에 길을 다시 찾을 수 있을 때까지 남은 시간(초)
    this.wantPath = true;    // 길을 다시 찾아야 한다(목표의 칸이 바뀌었거나 시설이 생기고 없어졌다)
    this.goalKey = null;     // 지금 길을 찾았을 때의 목표 칸들
    this.goalKind = null;    // 그때의 목표: 'player' | 'tent'
    this.hitLeft = null;     // 주인공을 때리기까지 남은 시간(초). 붙어 있지 않으면 null
    this.smashing = null;    // 치고 있는 시설
    this.smashLeft = 0;      // 그 시설을 치기까지 남은 시간(초)
    this.attackLeft = 0;     // attack 그림을 보여 주는 남은 시간(초)
    this.shakeLeft = 0;      // 맞아서 흔들리는 남은 시간(초)

    this.sprite = this.scene.add.sprite(0, 0, this.key, this.frame('walk1')).setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

  frame(name) { return this.asset.frames.indexOf(name); }

  // 주인공이 이 적을 칠 때 붙어야 하는 칸(Player.act 가 읽는다). 걷는 중이면 몸의 한가운데가 있는 칸.
  get tiles() { return [this.here()]; }

  // 지나가는 비용: 땅 1, 내 시설은 breakCost(부수고 지나간다). 물과 나무·돌·덤불은 못 간다.
  costAt(col, row) {
    if (!this.map.isOpen(col, row)) return 0;
    return this.map.structureAt(col, row) ? this.cfg.breakCost : 1;
  }

  // 비스듬히 갈 때 양옆 칸은 비어 있어야 한다. 시설 두 개 사이를 비스듬히 빠져나가지 않는다.
  sideOk(col, row) { return this.map.isWalkable(col, row); }

  // 다음 칸이 시설이면 그 앞에서 멈춘다(부순 다음에 간다)
  mayEnter(t) { return !this.map.structureAt(t.col, t.row); }

  // 목표 옆의 제자리에 오면 멈춘다. 목표 칸 위나 다른 좀비의 자리면 멈추지 않고 가던 길을 간다.
  onArrive() { if (this.inPlace(this.system.target())) this.path.length = 0; }

  // 서 있는 칸이 목표 칸 중 하나와 붙어 있는가(8방향, 같은 칸 포함). 붙어 있으면 때린다.
  nextTo(target) {
    return target.tiles.some((t) => Math.max(Math.abs(t.col - this.tile.col), Math.abs(t.row - this.tile.row)) <= 1);
  }

  // 여기 서서 목표를 치면 되는가: 목표에 붙은 칸이고, 목표 칸 위가 아니고(주인공과 한 칸에 겹쳐 서지 않게),
  // 다른 좀비가 서 있거나 가고 있는 칸이 아니다(두 마리가 한 칸에 겹쳐 서서 한 마리처럼 보이지 않게).
  inPlace(target) {
    const t = this.tile;
    if (!this.nextTo(target) || target.tiles.some((g) => g.col === t.col && g.row === t.row)) return false;
    return !this.system.takenTiles(this).has(t.col + ',' + t.row);
  }

  // 목표 칸들에 붙은 칸 중 설 수 있는 곳(시설이 있으면 부수고 선다).
  // all: 그런 칸 전부. free: 그중 다른 좀비가 서 있거나 가고 있지 않은 칸.
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
    return { all, free: all.filter((t) => !taken.has(t.col + ',' + t.row)) };
  }

  // 다른 좀비가 피할 칸: 가고 있는 칸(길의 끝)과, 칸 한가운데에 서 있으면 그 칸(시설 앞에 서서 부수는 중일 때도)
  claims() {
    const end = this.path[this.path.length - 1];
    const out = end ? [end] : [];
    if (!end || (this.col === this.tile.col && this.row === this.tile.row)) out.push(this.tile);
    return out;
  }

  // 길을 다시 찾는다. 이미 목표 옆의 제자리에 서 있으면 그대로 있는다.
  // 다른 좀비가 없는 칸으로 가는 길을 먼저 찾는다. 그런 칸이 없거나 갈 수 없으면 다른 좀비가 있는 칸이라도 간다.
  // 한 걸음 내딛는 중이면 그 칸까지는 그대로 간다(길을 자주 다시 찾아도 되돌아가며 떨지 않게).
  repath(target, key) {
    this.wantPath = false;
    this.repathLeft = this.cfg.repathInterval;
    this.goalKey = key;
    this.goalKind = target.structure ? 'tent' : 'player';
    if (!this.moving && this.inPlace(target)) return;
    const g = this.goalsAround(target.tiles);
    if (this.routeOn(g.free)) return;
    if (g.free.length < g.all.length && this.routeOn(g.all)) return;
    this.wantPath = true;                            // 갈 길이 없으면 조금 뒤에 다시 찾는다
  }

  // 시설이 생기거나 없어졌다: 지금 길에서 갈 수 없게 된 걸음 앞에서 멈추고, 길을 다시 찾는다
  onMapChanged() {
    super.onMapChanged();
    this.wantPath = true;
  }

  // 모닥불 가까이(slowRange 칸 안)에서는 느려진다 (5.7)
  speedNow() {
    const C = CONFIG.build.campfire;
    const slow = this.slowByFire && this.map.structures.some((s) =>
      s.type === 'campfire' && Math.hypot(s.col - this.col, s.row - this.row) <= C.slowRange);
    return this.cfg.speed * (slow ? C.slow : 1);
  }

  // 그림은 오른쪽을 본다. 화면 왼쪽을 볼 때만 뒤집는다. dx: 보려는 쪽의 화면 x 방향
  face(dx) {
    if (dx < -0.001) this.sprite.setFlipX(true);
    else if (dx > 0.001) this.sprite.setFlipX(false);
  }

  update(dt) {
    this.repathLeft -= dt;
    this.attackLeft = Math.max(0, this.attackLeft - dt);
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);

    // 길을 다시 찾을 때: 목표의 칸이 바뀌었다(주인공이 움직였다, 텐트에 들어가거나 나왔다), 시설이 생기거나 없어졌다,
    // 서 있는데 목표 옆의 제자리가 아니다. 다만 시설을 부수는 중이면 주인공이 움직였다는 것만으로는 바꾸지 않는다(하던 것을 마저 부순다).
    const target = this.system.target();
    const key = target.tiles.map((t) => t.col + ',' + t.row).join(' ');
    const kind = target.structure ? 'tent' : 'player';
    if (key !== this.goalKey && !(this.smashing && kind === this.goalKind)) this.wantPath = true;
    if (!this.moving && !this.inPlace(target)) this.wantPath = true;
    if (this.wantPath && this.repathLeft <= 0 && this.system.mayRepath()) this.repath(target, key);

    // 때리는 동작(attack 그림)을 다 보여 준 뒤에 걷는다. 시설을 부순 마지막 한 대도 그대로 보이게.
    const swinging = this.attackLeft > 0;
    if (!swinging) this.walk(dt, this.speedNow());

    // 서 있는 동안 하는 일: 목표 옆이면 목표를, 다음 칸이 시설이면 그 시설을 친다
    const atCentre = this.col === this.tile.col && this.row === this.tile.row;
    const next = this.path[0];
    const blocker = atCentre && next && (next.col !== this.tile.col || next.row !== this.tile.row)
      ? this.map.structureAt(next.col, next.row) : null;
    const standing = atCentre && (!this.moving || blocker || swinging);
    if (standing && this.nextTo(target)) {
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

  // 주인공 옆: 붙은 뒤 firstHitDelay 초 뒤에 처음 때리고, 그다음부터 hitInterval 초마다 하트 1
  attackPlayer(dt) {
    this.smashing = null;
    const p = this.scene.player;
    this.face(p.sprite.x - this.sprite.x);
    if (this.hitLeft === null) this.hitLeft = this.cfg.firstHitDelay;
    this.hitLeft -= dt;
    if (this.hitLeft > 0) return;
    this.hitLeft += this.cfg.hitInterval;
    this.attackLeft = CONFIG.anim.attackTime;
    this.system.hitPlayer(this);
  }

  // 시설(울타리, 모닥불, 텐트) 앞: structureInterval 초마다 structureDamage
  smash(s, dt) {
    this.hitLeft = null;
    this.face(s.sprite.x - this.sprite.x);
    if (this.smashing !== s) {
      this.smashing = s;
      this.smashLeft = this.cfg.structureInterval;
    }
    this.smashLeft -= dt;
    if (this.smashLeft > 0) return;
    this.smashLeft += this.cfg.structureInterval;
    this.attackLeft = CONFIG.anim.attackTime;
    this.system.hitStructure(this, s);
  }

  // 주인공의 단검에 맞았다: 흔들리고, 하얗게 번쩍이고, 타격 그림. 체력이 0이 되면 사라진다.
  hurt(n) {
    const fx = this.scene.effects, F = CONFIG.fx, sp = this.sprite;
    this.hp -= n;
    this.shakeLeft = F.shakeTime;
    fx.hit(sp.x + Math.sign(this.scene.player.sprite.x - sp.x) * 10, sp.y - F.hitHeight);
    fx.flash(sp);
    if (this.hp <= 0) this.system.kill(this);
  }

  // 그림: 걸을 때 walk1·walk2, 서 있을 때 walk1, 때릴 때 attack (3.5). 깊이는 발 위치. 깎였을 때만 체력 막대.
  syncSprite(standing = !this.moving) {
    const F = CONFIG.fx, sp = this.sprite;
    const w = tileToWorld(this.col, this.row);
    const shake = this.shakeLeft > 0 ? (this.shakeLeft > F.shakeTime / 2 ? -F.shakePx : F.shakePx) : 0;
    sp.setPosition(w.x + shake, w.y);
    sp.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
    if (!standing) {
      sp.anims.play(this.key + '_walk', true);
    } else {
      if (sp.anims.isPlaying) sp.anims.stop();
      sp.setFrame(this.frame(this.attackLeft > 0 ? 'attack' : 'walk1'));
    }
    if (this.hp < this.maxHp) {
      this.scene.effects.showBar(this, this.hp / this.maxHp, w.x, w.y - sp.displayHeight * sp.originY - F.barGap, Infinity);
    }
  }

  // 없앤다(먼지는 부르는 쪽에서)
  destroy() {
    this.alive = false;
    this.path.length = 0;
    this.scene.effects.removeBar(this);
    this.sprite.destroy();
  }
}
