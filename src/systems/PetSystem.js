import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { Walker } from './Walker.js';

// (3단계) 강아지와 고양이 (13.4). 길과 걷기는 주인공과 같다(Walker: 문은 지나가고 울타리는 못 지나간다).
// 적은 동물을 공격하지 않고, 동물은 다치지 않는다. 동물은 칸을 막지 않는다.
const STEP = new Set(['walk1', 'walk2', 'bwalk1', 'bwalk2']);
const GIFT_ICON = { carrot: 'icon_seed_carrot', corn: 'icon_seed_corn', pumpkin: 'icon_seed_pumpkin' };

class Pet extends Walker {
  constructor(system, kind, at) {
    super(system.map, at.col, at.row);
    this.system = system;
    this.scene = system.scene;
    this.kind = kind;                      // 'dog' | 'cat'
    this.key = 'char_' + kind;
    this.asset = this.map.assets[this.key];
    this.cfg = CONFIG.pets[kind];
    this.friend = false;
    this.greeted = false;                  // 주인공이 처음 4칸 안에 왔을 때 한 번 반긴다
    this.pets = 0;                         // 쓰다듬은 횟수(고양이)
    this.back = false;                     // 뒷모습인가
    this.oneShot = null;                   // 한 번 트는 것(happy, bark, bite, meow)
    this.pose = 'sit';                     // 서 있을 때: sit | idle | lie | sleep
    this.lieLeft = 0;                      // lie 를 보여 주고 sleep 으로 넘어가기까지(초)
    this.playing = null;
    this.noPath = 0;                       // 따라가는데 길이 없었던 시간(초)
    this.repathLeft = 0;
    this.goalKey = null;
    this.barkLeft = 0;                     // 강아지: 다음에 짖을 수 있을 때까지(초)
    this.biteLeft = 0;                     // 강아지: 다음 물기까지(초)
    this.biting = null;                    // 물고 있는 적
    this.freezeLeft = 0;                   // 물었을 때의 멈칫(초)
    this.giftDue = false;                  // 고양이: 아침 선물을 가져와야 한다
    this.spot = null;                      // 텐트에 들어갔을 때 가서 잘 칸
    this.sprite = this.scene.add.sprite(0, 0, this.key).setOrigin(this.asset.originX, this.asset.originY);
    this.sprite.on('animationupdate', (anim, frame) => this.onFrame(frame));
    this.sprite.on('animationstart', (anim, frame) => this.onFrame(frame));
    this.sprite.on('animationcomplete', (anim) => { if (anim.key === this.key + ':' + this.oneShot) this.oneShot = null; });
    this.sync();
    this.show();
  }

  foot() { const w = tileToWorld(this.col, this.row); return { x: w.x, y: w.y + this.yOff }; }
  // 주인공이 쓰다듬을 때 붙어야 하는 칸(Player.act)
  get tiles() { return [this.here()]; }

  // 화면 방향 (dx, dy)를 본다(12.2): dx < 0 이면 뒤집기, dy < 0 이면 뒷모습
  face(dx, dy) {
    if (dx < 0) this.sprite.setFlipX(true);
    else if (dx > 0) this.sprite.setFlipX(false);
    if (dy < 0) this.back = true;
    else if (dy > 0) this.back = false;
  }

  lookAt(col, row) {
    const dc = col - this.col, dr = row - this.row;
    this.face(dc - dr, dc + dr < 0 ? -1 : 1);
  }

  // 한 번 트는 것(앞모습만 있다)
  play(name) {
    this.oneShot = name;
    this.playing = name;
    this.sprite.play(this.key + ':' + name);
  }

  // 지금 보여 줄 것: 한 번 트는 것 > 걷기 > 서 있는 자세
  show() {
    if (this.oneShot || this.freezeLeft > 0) return;
    const A = this.asset.anims;
    let n;
    if (this.moving) n = this.back && A.bwalk ? 'bwalk' : 'walk';
    else if (this.pose === 'idle') n = this.back && A.bidle ? 'bidle' : 'idle';
    else n = this.pose;
    if (n === this.playing) return;
    this.playing = n;
    this.sprite.play(this.key + ':' + n);
  }

  onFrame(frame) {
    const name = this.asset.frames[Number(frame.textureFrame)];
    if (STEP.has(name)) this.stepped();
    if (name === 'bite' && this.oneShot === 'bite') this.system.biteHit(this);
  }

  // 서 있는 자세를 바꾼다. sleep 은 lie 를 잠깐 보여 준 뒤(13.4)
  rest(pose) {
    if (pose === 'sleep') {
      if (this.pose === 'sleep' || this.pose === 'lie') return;
      this.pose = 'lie';
      this.lieLeft = this.lieTime();
      return;
    }
    this.pose = pose;
  }

  lieTime() { return this.asset.anims.lie.frames.reduce((s, f) => s + f[1], 0) / 1000; }

  sync() {
    const w = this.foot();
    this.sprite.setPosition(w.x, w.y).setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }

  // 칸 goals 중 가까운 곳으로 간다(길이 없으면 false)
  goTo(goals) {
    if (!goals.length) return false;
    return this.routeOn(goals);
  }
}

export class PetSystem {
  constructor(scene) {
    this.scene = scene;
    this.map = scene.map;
    this.list = [];
    this.emotes = [];          // { pet, img, left, rise, name }
    this.playerStill = 0;      // 주인공이 멈춰 있은 시간(초). 고양이가 잔다
    scene.events.on('morning', () => { for (const p of this.list) if (p.kind === 'cat' && p.friend) p.giftDue = true; });
  }

  get friends() { return this.list.filter((p) => p.friend); }
  dog() { return this.list.find((p) => p.kind === 'dog'); }

  // 2단계가 시작되면(사용자와 정함: 씨앗 상자와 함께) map.pets 의 자리에 나온다. 처음에는 앉아 있다.
  spawn() {
    if (this.list.length) return;
    const P = this.scene.mapData.pets || {};
    for (const kind of ['dog', 'cat']) if (P[kind]) this.list.push(new Pet(this, kind, P[kind]));
  }

  // 누른 점의 동물(그림 사각형 + enemyPad, 앞에 있는 것)
  pickAt(x, y) {
    const pad = CONFIG.input.enemyPad;
    let best = null;
    for (const p of this.list) {
      const s = p.sprite, left = s.x - s.displayWidth * s.originX, top = s.y - s.displayHeight * s.originY;
      if (x < left - pad || x > left + s.displayWidth + pad || y < top - pad || y > top + s.displayHeight + pad) continue;
      if (!best || s.depth > best.sprite.depth) best = p;
    }
    return best;
  }

  // 동물을 눌렀다: 붙은 칸으로 가서 crouch(쓰다듬기). hit 프레임에 petted
  press(pet) {
    let done = false;                                // 한 번 누르면 한 번만 쓰다듬는다
    this.scene.player.act({
      target: pet, chase: true,
      tool: () => 'crouch',
      isValid: () => !done && this.list.includes(pet),
      strike: () => { done = true; this.petted(pet); return true; },
    });
  }

  petted(pet) {
    const scene = this.scene, fx = scene.effects, F = CONFIG.fx;
    pet.lookAt(scene.player.col, scene.player.row);
    pet.path.length = 0;
    pet.pose = pet.friend ? pet.pose : 'sit';
    this.emote(pet, 'heart');
    if (pet.friend) {                                // 친구: 반기기만 한다
      pet.play('happy');
      fx.burst(['heart'], F.chips.hearts, pet.sprite.x, pet.sprite.y - 30, 'hearts');
      return;
    }
    pet.pets += 1;
    if (pet.kind === 'dog' || pet.pets >= pet.cfg.petsToBefriend) {
      pet.friend = true;
      pet.pose = 'sit';
      pet.play('happy');
      fx.burst(['heart'], F.chips.hearts, pet.sprite.x, pet.sprite.y - 30, 'hearts');
      scene.sfx.play(pet.kind === 'dog' ? 'dog_bark' : 'cat_meow', { at: pet.sprite });
      scene.notice(pet.kind === 'dog' ? '강아지와 친구가 되었습니다' : '고양이와 친구가 되었습니다');
      if (pet.kind === 'dog') scene.todo.check('dog');
      return;
    }
    // 고양이의 처음 두 번: 1~2칸 떨어진 빈 칸으로 가서 다시 앉는다
    const C = CONFIG.pets.cat, out = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const d = Math.max(Math.abs(dc), Math.abs(dr)), c = pet.tile.col + dc, r = pet.tile.row + dr;
      if (d >= C.hop[0] && d <= C.hop[1] && this.map.isWalkable(c, r) && !this.occupied(c, r)) out.push({ col: c, row: r });
    }
    if (out.length) pet.goTo([out[Math.floor(Math.random() * out.length)]]);
  }

  // 사람이 서 있는 칸인가(동물이 갈 칸을 고를 때 피한다). 지하(map 이 땅 위가 아님)에는 적이 없다
  occupied(col, row, map = this.map) {
    const p = this.scene.player.tile;
    if (p.col === col && p.row === row) return true;
    return this.scene.enemies.list.some((e) => e.map === map && e.tile.col === col && e.tile.row === row);   // 그 층의 적만
  }

  // 칸 t 의 둘레(8칸) 중 걸을 수 있고 비어 있는 칸들(map: 땅 위 또는 지하)
  freeAround(t, map = this.map) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const c = t.col + dc, r = t.row + dr;
      if (map.isWalkable(c, r) && !this.occupied(c, r, map)) out.push({ col: c, row: r });
    }
    return out;
  }

  // (지하) 따라다니는 동물을 주인공과 함께 옮긴다: 주인공 옆 빈 칸, 먼지 0.5배 (17.2)
  follow(map, yOff) {
    for (const p of this.friends) {
      p.map = map;
      p.yOff = yOff;
      p.spot = null;
      this.teleport(p);
    }
  }

  // 주인공 옆 빈 칸으로 옮긴다(멀리 떨어졌거나 길이 없을 때). 먼지 0.5배
  teleport(pet) {
    const around = this.freeAround(this.scene.player.tile, pet.map);
    if (!around.length) return;
    const t = around[Math.floor(Math.random() * around.length)];
    pet.path.length = 0;
    pet.col = t.col; pet.row = t.row; pet.tile = { col: t.col, row: t.row };
    pet.noPath = 0;
    pet.sync();
    this.scene.effects.dust(pet.sprite.x, pet.sprite.y, CONFIG.pets.teleportDust);
  }

  // ── 감정 표시 fx_emote (13.4) ──

  emote(pet, name) {
    const a = this.map.assets.fx_emote;
    const img = this.scene.add.sprite(0, 0, 'fx_emote', a.frames.indexOf(name === 'zzz' ? 'zzz1' : name)).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.fx);
    if (name === 'zzz') img.play('fx_emote:zzz');
    const e = { pet, img, name, left: name === 'zzz' ? Infinity : CONFIG.pets.emote.time };
    if (name !== 'zzz') for (const o of this.emotes) if (o.pet === pet && o.name !== 'zzz') o.left = 0;   // 새 표시가 앞의 것을 바꾼다
    this.emotes.push(e);
    this.placeEmote(e);
    return e;
  }

  placeEmote(e) {
    const s = e.pet.sprite, frame = e.pet.asset.frames[Number(s.frame.name)];
    const m = e.pet.asset.emote[frame] || e.pet.asset.emote.idle, E = CONFIG.pets.emote;
    const k = e.left === Infinity ? 0 : 1 - e.left / E.time;
    e.img.setPosition(s.x + (s.flipX ? -m[0] : m[0]), s.y + m[1] - E.rise * k).setAlpha(e.left === Infinity ? 1 : 1 - k);
  }

  updateEmotes(dt) {
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      const sleeping = e.name === 'zzz' && e.pet.pose === 'sleep' && e.pet.playing === 'sleep';
      if (e.name === 'zzz' ? !sleeping : (e.left -= dt) <= 0) {
        e.img.destroy();
        this.emotes.splice(i, 1);
        continue;
      }
      this.placeEmote(e);
    }
    for (const p of this.list) {                     // 잠자는 동안 zzz
      if (p.pose === 'sleep' && p.playing === 'sleep' && !this.emotes.some((e) => e.pet === p && e.name === 'zzz')) this.emote(p, 'zzz');
    }
  }

  // ── 매 프레임 ──

  update(dt) {
    if (!this.list.length) return;
    const pl = this.scene.player;
    this.playerStill = pl.moving || pl.swing ? 0 : this.playerStill + dt;
    for (const p of this.list) {
      if (p.freezeLeft > 0 && (p.freezeLeft -= dt) <= 0) { p.freezeLeft = 0; p.sprite.anims.resume(); }
      if (p.pose === 'lie' && (p.lieLeft -= dt) <= 0) p.pose = 'sleep';
      p.barkLeft = Math.max(0, p.barkLeft - dt);
      p.biteLeft = Math.max(0, p.biteLeft - dt);
      if (!p.friend) this.updateWild(p);
      else this.updateFriend(p, dt);
      p.walk(dt, p.cfg.speed);
      p.sync();
      p.show();
    }
    this.updateEmotes(dt);
  }

  // 친구가 되기 전: 앉아 있다. 주인공이 처음 4칸 안에 오면 강아지 happy, 고양이 meow 한 번
  updateWild(p) {
    const pl = this.scene.player;
    if (!p.moving) p.pose = 'sit';
    if (this.scene.ug.active) return;                // 주인공이 지하에 있다
    if (!p.greeted && Math.hypot(pl.col - p.col, pl.row - p.row) <= CONFIG.pets.greetRange) {
      p.greeted = true;
      p.lookAt(pl.col, pl.row);
      p.play(p.kind === 'dog' ? 'happy' : 'meow');
    }
  }

  updateFriend(p, dt) {
    const scene = this.scene, pl = scene.player, P = CONFIG.pets;
    const d = Math.hypot(pl.col - p.col, pl.row - p.row);
    // 텐트 안: 강아지는 문 앞, 고양이는 모닥불 옆(없으면 텐트 옆)에서 잔다. 적이 오면 강아지는 깨서 짖는다
    if (scene.rest.resting) {
      if (p.kind === 'dog' && this.dogGuard(p, dt)) return;
      if (!p.spot) p.spot = this.restSpot(p);
      if (p.spot && (p.tile.col !== p.spot.col || p.tile.row !== p.spot.row)) {
        if (!p.moving && !p.goTo([p.spot])) p.spot = null;
      } else if (!p.moving) p.rest('sleep');
      return;
    }
    p.spot = null;
    if (d > P.teleportFar) { this.teleport(p); return; }
    if (p.kind === 'dog' && this.dogGuard(p, dt)) return;
    // 고양이의 아침 선물: 주인공 곁(followFar 안)에 서면 준다
    if (p.giftDue && !p.moving && d <= P.followFar) { this.gift(p); }
    // 따라오기: followFar 보다 멀면 주인공 곁(followNear 안)으로 걸어온다. 가까우면 멈춘다
    if (d > P.followFar || (p.moving && d > P.followNear)) {
      p.repathLeft -= dt;
      const key = pl.tile.col + ',' + pl.tile.row;
      if (!p.moving || (key !== p.goalKey && p.repathLeft <= 0)) {
        p.goalKey = key;
        p.repathLeft = P.repathInterval;
        const ok = p.goTo(this.followTiles(p.map));
        p.noPath = ok ? 0 : p.noPath + dt;
        if (p.noPath >= P.noPathTeleport) this.teleport(p);
      }
    } else if (p.moving && d <= P.followNear) {
      // 내딛던 걸음만 마저 간다
      p.path.length = Math.min(p.path.length, 1);
    }
    if (!p.moving) {
      p.noPath = 0;
      if (p.kind === 'cat' && this.playerStill > P.catSleepAfter) p.rest('sleep');
      else p.rest('sit');
    }
  }

  // 주인공 둘레 followNear 칸 안의 걸을 수 있는 칸(주인공의 칸은 빼고)
  followTiles(map = this.map) {
    const t = this.scene.player.tile, R = CONFIG.pets.followNear, out = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      if ((!dc && !dr) || Math.hypot(dc, dr) > R) continue;
      if (map.isWalkable(t.col + dc, t.row + dr)) out.push({ col: t.col + dc, row: t.row + dr });
    }
    return out;
  }

  // 텐트에서 잘 칸: 강아지는 텐트 문 앞의 빈 칸, 고양이는 가장 가까운 모닥불 옆(없으면 텐트 옆)
  restSpot(p) {
    const scene = this.scene, tent = scene.rest.tent;
    const near = (tiles, x, y) => {
      const cands = tiles.flatMap((t) => this.freeAround(t)).filter((t) => !tent.tiles.some((u) => u.col === t.col && u.row === t.row));
      cands.sort((a, b) => { const wa = tileToWorld(a.col, a.row), wb = tileToWorld(b.col, b.row); return Math.hypot(wa.x - x, wa.y - y) - Math.hypot(wb.x - x, wb.y - y); });
      return cands[0] || null;
    };
    if (p.kind === 'dog') {
      const door = scene.map.assets.build_tent.door;
      return near(tent.tiles, tent.sprite.x + door[0], tent.sprite.y + door[1]);
    }
    const fires = scene.map.structures.filter((s) => s.type === 'campfire');
    fires.sort((a, b) => Math.hypot(a.col - p.col, a.row - p.row) - Math.hypot(b.col - p.col, b.row - p.row));
    if (fires.length) return near(fires[0].tiles, fires[0].sprite.x, fires[0].sprite.y) || near(tent.tiles, tent.sprite.x, tent.sprite.y);
    return near(tent.tiles, tent.sprite.x, tent.sprite.y);
  }

  // ── 강아지: 짖기와 물기 ──

  // 밤에 적이 주인공(텐트 안이면 텐트)에게서 barkRange 안에 오면 짖고, 주인공에게서 chaseMax 안의 적에게 가서 문다.
  // 하던 일을 했으면 true(따라오기는 하지 않는다)
  dogGuard(p, dt) {
    const scene = this.scene, D = p.cfg, pl = scene.player;
    if (!scene.clock.isNight) return false;          // (지하 침입) 지하에서도 그 층의 적에게 짖고 문다 (18.4)
    const home = scene.rest.resting ? this.centre(scene.rest.tent.tiles) : { col: pl.col, row: pl.row };
    const foes = scene.enemies.list.filter((e) => e.alive && !e.rising && !e.transit && e.map === p.map);
    const near = foes.filter((e) => Math.hypot(e.col - home.col, e.row - home.row) <= D.barkRange);
    if (!near.length) return false;
    const dist = (e) => Math.hypot(e.col - p.col, e.row - p.row);
    near.sort((a, b) => dist(a) - dist(b));
    const e = near[0];
    if (p.pose === 'sleep' || p.pose === 'lie') p.pose = 'sit';   // 깨어난다
    if (p.barkLeft <= 0 && !p.oneShot) {
      p.barkLeft = D.barkEvery;
      p.lookAt(e.col, e.row);
      p.path.length = Math.min(p.path.length, 1);
      p.play('bark');
      this.emote(p, 'alert');
      scene.sfx.play('dog_bark', { at: p.sprite });
      return true;
    }
    // 물기: biteRange 안이면 서서 biteInterval 마다. 아니면 chaseMax 안의 적에게 다가간다
    if (dist(e) <= D.biteRange) {
      p.path.length = Math.min(p.path.length, 1);
      if (!p.moving && p.biteLeft <= 0 && !p.oneShot) {
        p.biteLeft = D.biteInterval;
        p.biting = e;
        p.lookAt(e.col, e.row);
        p.play('bite');
      }
      p.pose = 'sit';
      return true;
    }
    const reach = (t) => Math.hypot(t.col - home.col, t.row - home.row) <= D.chaseMax;
    if (Math.hypot(e.col - home.col, e.row - home.row) <= D.chaseMax + D.biteRange) {
      p.repathLeft -= dt;
      if (!p.moving || p.repathLeft <= 0) {
        p.repathLeft = CONFIG.pets.repathInterval;
        const goals = this.freeAround(e.here(), p.map).filter(reach);
        if (goals.length) p.goTo(goals);
      }
      return true;
    }
    return p.oneShot === 'bark';
  }

  // 물기의 hit 프레임: 피해 biteDamage, 타격감은 12.4 와 같다(맞는 쪽은 Enemy.hurt). 강아지도 잠깐 멈칫
  biteHit(p) {
    const e = p.biting;
    p.biting = null;
    if (!e || !e.alive || Math.hypot(e.col - p.col, e.row - p.row) > p.cfg.biteRange + CONFIG.pets.biteSlack) return;
    e.hurt(p.cfg.biteDamage, p);
    p.freezeLeft = CONFIG.fx.hitStop;
    p.sprite.anims.pause();
  }

  centre(tiles) {
    return { col: tiles.reduce((a, t) => a + t.col, 0) / tiles.length, row: tiles.reduce((a, t) => a + t.row, 0) / tiles.length };
  }

  // ── 고양이: 아침 선물 (13.4) ──

  gift(p) {
    const scene = this.scene, G = p.cfg.gift;
    p.giftDue = false;
    let r = Math.random(), crop = 'pumpkin';
    for (const [c, w] of Object.entries(G)) { if (r < w) { crop = c; break; } r -= w; }
    scene.inventory.add('seed_' + crop, 1);
    p.lookAt(scene.player.col, scene.player.row);
    p.play('meow');
    this.emote(p, 'note');
    scene.sfx.play('cat_meow', { at: p.sprite });
    scene.effects.popup(p.sprite.x, p.sprite.y - 50, GIFT_ICON[crop], '+1');
  }

  // (시험용) 동물 모두 친구로
  befriendAll() {
    for (const p of this.list) {
      if (p.friend) continue;
      p.friend = true;
      p.pose = 'sit';
      if (p.kind === 'dog') this.scene.todo.check('dog');
    }
  }

  // 문을 여는 것(13.2): 친구가 된 동물의 위치
  openers() { return this.friends.filter((p) => p.map === this.map).map((p) => ({ col: p.col, row: p.row })); }

  sprites() { return this.list.map((p) => p.sprite); }
  occupiedTiles() { return this.list.flatMap((p) => p.occupiedTiles()); }
}
