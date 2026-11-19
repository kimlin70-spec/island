import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { Walker } from './Walker.js';
import { Body } from './Body.js';

// 도구 -> 주인공의 애니메이션 이름 (12.3)
const TOOL_ANIM = { dagger: 'dagger', axe: 'axe', pickaxe: 'pick', gun: 'gun' };

// 주인공: 눌러서 이동, 옆 칸의 대상에게 도구 쓰기, 쓰러지기.
// 위치와 길, 걷기, 몸이 걸친 칸은 Walker 에, 그림의 움직임(애니메이션, 앞뒤, 맞기, 멈칫)은 Body 에 있다.
export class Player extends Walker {
  constructor(scene, map, col, row) {
    super(map, col, row);
    this.scene = scene;
    this.key = 'char_player';
    this.asset = map.assets[this.key];

    this.action = null;        // 하려는 행동(act 참고)
    this.swing = null;         // 도구를 휘두르는 중 { t, hitAt, total, struck, tool }
    this.cooldown = 0;         // 다음에 도구를 쓸 수 있을 때까지 남은 시간(초)
    this.chaseLeft = 0;        // 쫓아가는 적에게 가는 길을 다시 찾을 수 있을 때까지 남은 시간(초)
    this.downLeft = null;      // 쓰러진 뒤 "쓰러졌습니다" 창까지 남은 시간(초). 쓰러지지 않았으면 null

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key).setOrigin(this.asset.originX, this.asset.originY);
    this.body = new Body(scene, this.sprite, this.key, { blink: true });
    this.body.onStep = () => this.stepped();
    this.syncSprite();
    this.body.show(false);
  }

  get downed() { return this.downLeft !== null; }

  // 발 위치(월드). 맞아서 밀린 그림이 아니라 규칙의 위치.
  foot() { return tileToWorld(this.col, this.row); }

  // (col, row) 칸으로 걸어간다. 하던 행동은 멈춘다. 갈 수 없는 칸이면 아무 일도 하지 않고 false.
  goTo(col, row) {
    if (this.downed || !this.map.isWalkable(col, row)) return false;
    if (!this.routeTo([{ col, row }])) return false;
    this.stopAction();
    return true;
  }

  // tiles(대상이 차지한 칸들)에 붙은 칸(둘레 8방향) 중 걸을 수 있는 곳들
  neighborsOf(tiles) {
    const out = [], seen = new Set();
    for (const t of tiles) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = t.col + dc, r = t.row + dr, k = c + ',' + r;
        if ((!dc && !dr) || seen.has(k) || !this.map.isWalkable(c, r)) continue;
        seen.add(k);
        out.push({ col: c, row: r });
      }
    }
    return out;
  }

  // at 칸(주지 않으면 서 있는 칸)이 tiles 중 하나와 붙어 있는가(같은 칸 포함)
  isNextTo(tiles, at = this.tile) {
    return tiles.some((t) => Math.max(Math.abs(t.col - at.col), Math.abs(t.row - at.row)) <= 1);
  }

  // (2단계) at 칸(주지 않으면 서 있는 칸)에서 적(e)까지가 range 칸 안인가(칸 좌표의 직선 거리, 11.6)
  inRange(e, range, at = this.tile) { return Math.hypot(e.col - at.col, e.row - at.row) <= range; }

  // 총으로 쏠 수 있는 자리들: 적에게서 range 칸 안의 걸을 수 있는 칸(울타리 너머의 적도 가까이 가서 쏠 수 있게)
  rangeTiles(e, range) {
    const out = [], R = Math.floor(range), c0 = Math.round(e.col), r0 = Math.round(e.row);
    for (let r = r0 - R - 1; r <= r0 + R + 1; r++) for (let c = c0 - R - 1; c <= c0 + R + 1; c++) {
      if (Math.hypot(e.col - c, e.row - r) <= range && this.map.isWalkable(c, r)) out.push({ col: c, row: r });
    }
    return out;
  }

  // 행동하러 갈 곳: 총이면 사거리 안의 칸, 그 밖에는 대상에 붙은 칸
  goalsFor(action) {
    return action.ranged ? this.rangeTiles(action.target, action.ranged) : this.neighborsOf(action.target.tiles);
  }

  // 행동할 수 있는 자리인가: 총(ranged)이면 사거리 안, 그 밖에는 대상에 붙은 칸
  reaches(action, at = this.tile) {
    return action.ranged ? this.inRange(action.target, action.ranged, at) : this.isNextTo(action.target.tiles, at);
  }

  // 대상에 붙은 칸 중 가장 가까운 곳까지 걸어가서 행동한다. (5.1, 5.2)
  //   target: { tiles, sprite }   isValid(): 계속해도 되는가
  //   도구 쓰기:   tool(): 지금 쓸 도구, strike(tool): 내려치는 순간에 부른다(피해가 들어갔으면 true). actionInterval 마다 되풀이한다.
  //   wait():     true 인 동안은 옆에 서서 기다린다(땅에서 올라오는 중인 좀비)
  //   한 번 하기:  arrive(): 도착하면 한 번 부른다(텐트에 들어가기).
  //   stepOff:    대상 칸 위에 서 있으면 옆 칸으로 비켜서서 한다(밟고 지나갈 수 있는 그루터기 등).
  //   chase:      대상이 움직인다(적). 대상이 다른 칸으로 가면 길을 다시 찾아 쫓아간다.
  //   ranged:     (2단계, 총) 사거리(칸). 사거리 안이면 그 자리에서 하고, 밖이면 사거리 안에 들어설 때까지 다가간다(11.6).
  // 갈 수 없으면 아무 일도 하지 않고 false.
  act(action) {
    if (this.downed) return false;                    // 쓰러진 뒤에는 아무것도 하지 않는다
    const tiles = action.target.tiles;
    // 이미 그 대상에게 하는 중이면 그대로 둔다. 다만 걷는 길이 시설에 끊겨 대상 옆까지 가지 못하면 길을 다시 찾는다.
    // 하던 행동이 막 끝났으면(나무가 방금 그루터기가 되었으면) 새 행동으로 받는다.
    const end = this.path[this.path.length - 1] || this.tile;
    const a = this.action;
    if (a && a.target === action.target && !!a.chase === !!action.chase && a.isValid() && this.reaches(action, end)) return true;
    const onTop = !this.moving && tiles.some((t) => t.col === this.tile.col && t.row === this.tile.row);
    const here = !this.moving && this.reaches(action) && !(action.stepOff && onTop);
    // 비켜설 칸이 없으면 그 자리에서 한다
    if (!here && !this.routeTo(this.goalsFor(action)) && !onTop) return false;
    this.stopAction();
    this.action = action;
    return true;
  }

  // 움직이는 대상(적)을 쫓는다. 지금 길이 대상 옆에서 끝나지 않으면 길을 다시 찾는다(chaseInterval 마다 한 번 이하).
  // 내딛던 걸음은 마저 간다(되돌아가지 않는다). 갈 수 없게 되면 그만둔다.
  chase(a, dt) {
    this.chaseLeft -= dt;
    if (!a.isValid() || this.chaseLeft > 0) return;
    if (this.reaches(a, this.path[this.path.length - 1] || this.tile)) return;
    this.chaseLeft = CONFIG.player.chaseInterval;
    if (!this.routeOn(this.goalsFor(a)) && !this.moving) this.action = null;
  }

  // 하던 행동을 멈춘다. 들어 올린 도구는 내려치지 않는다.
  stopAction() {
    this.action = null;
    this.swing = null;
    this.body.cancel();
  }

  face(dx, dy) { this.body.face(dx, dy); }

  // 한 칸에 도착했다: 총으로 쏘러 가는 중이면 사거리 안에 들어선 곳에서 멈춘다(11.6)
  onArrive() {
    const a = this.action;
    if (a && a.ranged && a.isValid() && this.inRange(a.target, a.ranged)) this.path.length = 0;
  }

  // 총구(쏘는 순간의 gun2, 뒷모습은 bgun2): 발 기준, 오른쪽을 볼 때의 값. 왼쪽을 보면 x 를 뒤집는다(11.10)
  muzzle() {
    const back = !!(this.body.act && this.body.act.back), m = this.asset.muzzle[back ? 'bgun2' : 'gun2'], flip = this.sprite.flipX;
    return { x: this.sprite.x + (flip ? -m[0] : m[0]), y: this.sprite.y + m[1], flip };
  }

  // 대상 쪽을 본다(칸으로 잰다. 여러 칸이면 그 한가운데)
  faceTarget(target) {
    const ts = target.tiles;
    const c = ts.reduce((s, t) => s + t.col, 0) / ts.length - this.col;
    const r = ts.reduce((s, t) => s + t.row, 0) / ts.length - this.row;
    this.body.look(c - r, c + r);
  }

  update(dt) {
    this.body.tick(dt);
    if (this.downed) {                                // 쓰러졌다: 아무것도 하지 않는다. 창은 GameScene 이 띄운다
      this.downLeft -= dt;
      this.syncSprite();
      this.body.show(false);
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);

    this.walk(dt, CONFIG.player.speed);

    // 대상 옆에 도착했으면 행동한다
    if (this.action && this.action.chase) this.chase(this.action, dt);
    const a = this.action;
    if (a && !this.moving) {
      const near = this.reaches(a);
      if (!a.isValid() || (!near && !a.chase)) {
        this.action = null;
      } else if (!near) {
        // 쫓는 중에 대상이 비켜 갔다. chase 가 길을 다시 찾는다.
      } else if (a.arrive) {                          // 한 번 하기
        this.action = null;
        this.faceTarget(a.target);
        a.arrive();
      } else if (!this.swing && this.cooldown <= 0 && !(a.wait && a.wait())) {   // 도구 들기
        const tool = a.tool();
        if (!tool) {
          this.action = null;
        } else {
          this.faceTarget(a.target);
          const n = TOOL_ANIM[tool], b = this.body, gun = tool === 'gun';
          b.play(n, dt);                              // 든 프레임의 시간도 센다(아래). 그림도 그만큼 지난 곳부터.
          if (!gun) this.scene.sfx.play('swing', { at: this.foot(), volume: CONFIG.sound.swing });   // 휘두르는 소리 (15.3)
          // 총: gun1(겨누기) aimTime 뒤에 gun2(쏘기). interval 마다 한 번 (11.6)
          this.swing = { t: 0, hitAt: gun ? CONFIG.tools.gun.aimTime : b.hitAt(n) || 0, total: b.ms(n), struck: false, tool };
          this.cooldown = gun ? CONFIG.tools.gun.interval : CONFIG.player.actionInterval;
        }
      }
    }

    // 휘두르기: 든 프레임부터 시간을 센다(Phase 5 까지와 같다). hit 프레임의 시각에 내려친다(피해). 애니메이션이 끝나면 끝.
    const s = this.swing;
    if (s) {
      s.t += dt;
      if (!s.struck && s.t >= s.hitAt) {
        s.struck = true;
        const hit = !!(this.action && this.action.strike(s.tool));
        if (hit) this.body.strike(s.tool !== 'gun');       // 맞혔으면 멈칫과 휘두른 궤적 (12.4). 총은 쏘는 그림(gun2)만, 멈칫 없이
        else this.body.pass();                             // 빗나갔으면 그대로 따라 내려간다
      }
      if (s.t >= s.total) this.swing = null;
    }
    this.syncSprite();
    this.body.show(this.moving);
  }

  // 적에게 맞았다 (12.4): 맞은 곳, 하얗게 번쩍임, 때린 쪽 반대로 밀림, hurt, 멈칫, 카메라 흔들림.
  // 쓰러지는 한 대(fatal)는 hurt 와 멈칫 대신 down 을 보여 준다(goDown).
  struck(from, fatal) {
    const F = CONFIG.fx, fx = this.scene.effects, me = this.foot(), at = from ? from.foot() : null;
    this.scene.sfx.play('player_hurt');
    fx.impact(me.x, me.y - F.impactHeight.char, at);
    fx.flash(this.sprite);
    if (at) this.body.knockFrom(me.x - at.x, me.y - at.y);
    if (!fatal) {
      this.body.hurt();
      this.body.freeze();
    }
    this.scene.cameras.main.shake(F.cameraShake.duration, F.cameraShake.intensity);
  }

  // 하트가 0이 되었다: 하던 것을 멈추고 down 을 보여 준다. downDelay 초 뒤에 GameScene 이 "쓰러졌습니다" 창을 띄운다.
  goDown() {
    this.stopAction();
    // 그 자리에 멈춘다. 내딛던 걸음은 길에 남겨 둔다(칸 사이에 멈춘 채, 더 걷지는 않는다).
    const midStep = this.path[0] && (this.col !== this.tile.col || this.row !== this.tile.row);
    this.path.length = midStep ? 1 : 0;
    this.downLeft = CONFIG.fx.downDelay;
    this.body.setFinal('down');
  }

  // 발 위치의 y가 클수록 앞에 그린다. y가 같으면 캐릭터가 사물보다 앞이다. 맞아서 밀린 만큼 그림만 옮긴다.
  syncSprite() {
    const w = tileToWorld(this.col, this.row), o = this.body.offset();
    this.sprite.setPosition(w.x + o.x, w.y + o.y);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }
}
