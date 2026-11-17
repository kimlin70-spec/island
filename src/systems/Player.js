import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { Walker } from './Walker.js';

// 도구 -> 캐릭터 시트의 그림 이름 앞부분 (dagger1, dagger2 / axe1, axe2 / pick1, pick2)
const TOOL_FRAME = { dagger: 'dagger', axe: 'axe', pickaxe: 'pick' };

// 주인공: 눌러서 이동, 걷는 동작, 좌우 뒤집기, 깊이 정렬, 옆 칸의 대상에게 도구 쓰기.
// 위치와 길, 걷기, 몸이 걸친 칸은 Walker 에 있다(좀비와 같다).
export class Player extends Walker {
  constructor(scene, map, col, row) {
    super(map, col, row);
    this.scene = scene;
    this.key = 'char_player';
    this.asset = map.assets[this.key];

    this.action = null;        // 하려는 행동(act 참고)
    this.swing = null;         // 도구를 휘두르는 중 { t, struck, tool }
    this.cooldown = 0;         // 다음에 도구를 쓸 수 있을 때까지 남은 시간(초)
    this.chaseLeft = 0;        // 쫓아가는 적에게 가는 길을 다시 찾을 수 있을 때까지 남은 시간(초)

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key, this.frame('idle'))
      .setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

  // 그림 이름('idle', 'walk1' ...) -> 프레임 번호
  frame(name) { return this.asset.frames.indexOf(name); }

  // (col, row) 칸으로 걸어간다. 하던 행동은 멈춘다. 갈 수 없는 칸이면 아무 일도 하지 않고 false.
  goTo(col, row) {
    if (!this.map.isWalkable(col, row)) return false;
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

  // 대상에 붙은 칸 중 가장 가까운 곳까지 걸어가서 행동한다. (5.1, 5.2)
  //   target: { tiles, sprite }   isValid(): 계속해도 되는가
  //   도구 쓰기:   tool(): 지금 쓸 도구, strike(tool): 내려치는 순간에 부른다. actionInterval 마다 되풀이한다.
  //   한 번 하기:  arrive(): 도착하면 한 번 부른다(텐트에 들어가기).
  //   stepOff:    대상 칸 위에 서 있으면 옆 칸으로 비켜서서 한다(밟고 지나갈 수 있는 그루터기 등).
  //   chase:      대상이 움직인다(적). 대상이 다른 칸으로 가면 길을 다시 찾아 쫓아간다.
  // 갈 수 없으면 아무 일도 하지 않고 false.
  act(action) {
    const tiles = action.target.tiles;
    // 이미 그 대상에게 하는 중이면 그대로 둔다. 다만 걷는 길이 시설에 끊겨 대상 옆까지 가지 못하면 길을 다시 찾는다.
    // 하던 행동이 막 끝났으면(나무가 방금 그루터기가 되었으면) 새 행동으로 받는다.
    const end = this.path[this.path.length - 1] || this.tile;
    const a = this.action;
    if (a && a.target === action.target && a.isValid() && this.isNextTo(tiles, end)) return true;
    const onTop = !this.moving && tiles.some((t) => t.col === this.tile.col && t.row === this.tile.row);
    const here = !this.moving && this.isNextTo(tiles) && !(action.stepOff && onTop);
    // 비켜설 칸이 없으면 그 자리에서 한다
    if (!here && !this.routeTo(this.neighborsOf(tiles)) && !onTop) return false;
    this.stopAction();
    this.action = action;
    return true;
  }

  // 움직이는 대상(적)을 쫓는다. 지금 길이 대상 옆에서 끝나지 않으면 길을 다시 찾는다(chaseInterval 마다 한 번 이하).
  // 내딛던 걸음은 마저 간다(되돌아가지 않는다). 갈 수 없게 되면 그만둔다.
  chase(a, dt) {
    this.chaseLeft -= dt;
    if (!a.isValid() || this.chaseLeft > 0) return;
    const tiles = a.target.tiles;
    if (this.isNextTo(tiles, this.path[this.path.length - 1] || this.tile)) return;
    this.chaseLeft = CONFIG.player.chaseInterval;
    if (!this.routeOn(this.neighborsOf(tiles)) && !this.moving) this.action = null;
  }

  // 하던 행동을 멈춘다. 들어 올린 도구는 내려치지 않는다.
  stopAction() {
    this.action = null;
    this.swing = null;
  }

  // 그림은 오른쪽을 본다. 화면 왼쪽을 볼 때만 뒤집는다. dx: 보려는 쪽의 화면 x 방향
  face(dx) {
    if (dx < -0.001) this.sprite.setFlipX(true);
    else if (dx > 0.001) this.sprite.setFlipX(false);
  }

  // 대상 쪽을 본다(흔들리는 중이면 제자리 기준)
  faceTarget(target) {
    const ts = target.sprite;
    this.face((ts.shakeBase === undefined ? ts.x : ts.shakeBase) - this.sprite.x);
  }

  update(dt) {
    const A = CONFIG.anim;
    this.cooldown = Math.max(0, this.cooldown - dt);

    this.walk(dt, CONFIG.player.speed);
    this.syncSprite();

    // 대상 옆에 도착했으면 행동한다
    if (this.action && this.action.chase) this.chase(this.action, dt);
    const a = this.action;
    if (a && !this.moving) {
      const near = this.isNextTo(a.target.tiles);
      if (!a.isValid() || (!near && !a.chase)) {
        this.action = null;
      } else if (!near) {
        // 쫓는 중에 대상이 비켜 갔다. chase 가 길을 다시 찾는다.
      } else if (a.arrive) {                          // 한 번 하기
        this.action = null;
        this.faceTarget(a.target);
        a.arrive();
      } else if (!this.swing && this.cooldown <= 0) { // 도구 들기
        const tool = a.tool();
        if (!tool) {
          this.action = null;
        } else {
          this.faceTarget(a.target);
          this.swing = { t: 0, struck: false, tool };
          this.cooldown = CONFIG.player.actionInterval;
        }
      }
    }

    // 휘두르기: 들어 올림 -> 내려침(이 순간에 피해) -> 서 있는 그림
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (!s.struck && s.t >= A.toolRaise) {
        s.struck = true;
        if (this.action) this.action.strike(s.tool);
      }
      if (s.t >= A.toolRaise + A.toolStrike) this.swing = null;
    }

    if (this.moving) {
      this.sprite.anims.play(this.key + '_walk', true);
    } else {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      const s = this.swing;
      this.sprite.setFrame(this.frame(s ? TOOL_FRAME[s.tool] + (s.struck ? '2' : '1') : 'idle'));
    }
  }

  // 발 위치의 y가 클수록 앞에 그린다. y가 같으면 캐릭터가 사물보다 앞이다.
  syncSprite() {
    const w = tileToWorld(this.col, this.row);
    this.sprite.setPosition(w.x, w.y);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }
}
