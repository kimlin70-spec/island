import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { findPath } from './Pathfinder.js';

// 도구 -> 캐릭터 시트의 그림 이름 앞부분 (dagger1, dagger2 / axe1, axe2 / pick1, pick2)
const TOOL_FRAME = { dagger: 'dagger', axe: 'axe', pickaxe: 'pick' };

// 주인공: 눌러서 이동, 걷는 동작, 좌우 뒤집기, 깊이 정렬, 옆 칸의 대상에게 도구 쓰기
export class Player {
  constructor(scene, map, col, row) {
    this.scene = scene;
    this.map = map;
    this.key = 'char_player';
    this.asset = map.assets[this.key];
    this.col = col;            // 지금 위치(소수 칸)
    this.row = row;
    this.tile = { col, row };  // 지금 서 있는(또는 막 떠난) 칸
    this.path = [];            // 앞으로 지나갈 칸들
    this.costAt = (c, r) => (this.map.isWalkable(c, r) ? 1 : 0);

    this.action = null;        // 하려는 행동 { target, tool(), isValid(), strike(tool) }
    this.swing = null;         // 도구를 휘두르는 중 { t, struck, tool }
    this.cooldown = 0;         // 다음에 도구를 쓸 수 있을 때까지 남은 시간(초)

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key, this.frame('idle'))
      .setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

  // 그림 이름('idle', 'walk1' ...) -> 프레임 번호
  frame(name) { return this.asset.frames.indexOf(name); }
  get moving() { return this.path.length > 0; }

  // goals(칸 목록) 중 가장 가까운 곳까지의 길로 바꾼다. 갈 수 없으면 false.
  routeTo(goals) {
    const m = this.map;
    let best = null;
    for (const g of goals) {
      const p = findPath(m.cols, m.rows, this.tile, g, this.costAt);
      if (p && (!best || p.cost < best.cost)) best = p;
    }
    if (!best) return false;
    // 걷던 중이면 떠나온 칸과 가던 칸 사이에 있다.
    // 새 길이 가던 칸을 바로 지나가면 되돌아가지 않고 그대로 이어 간다.
    const next = this.path[0];
    if (next && best.length >= 2 && best[1].col === next.col && best[1].row === next.row) best.shift();
    this.path = (!next && best.length === 1) ? [] : best;   // 이미 그 칸에 서 있으면 갈 곳이 없다
    return true;
  }

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

  // 서 있는 칸이 tiles 중 하나와 붙어 있는가(같은 칸 포함)
  isNextTo(tiles) {
    return tiles.some((t) => Math.max(Math.abs(t.col - this.tile.col), Math.abs(t.row - this.tile.row)) <= 1);
  }

  // 대상에 붙은 칸 중 가장 가까운 곳까지 걸어가서 actionInterval 마다 도구를 쓴다. (5.1, 5.2)
  //   target: { tiles, sprite }   tool(): 지금 쓸 도구   isValid(): 계속해도 되는가   strike(tool): 내려치는 순간에 부른다
  // 갈 수 없으면 아무 일도 하지 않고 false.
  act(action) {
    if (this.action && this.action.target === action.target) return true;   // 이미 그 대상에게 하는 중
    const here = !this.moving && this.isNextTo(action.target.tiles);
    if (!here && !this.routeTo(this.neighborsOf(action.target.tiles))) return false;
    this.stopAction();
    this.action = action;
    return true;
  }

  // 지금 차지하고 있는 칸들(서 있는 칸과 막 들어서는 칸). 여기에는 시설을 지을 수 없다.
  occupiedTiles() {
    return this.path.length ? [this.tile, this.path[0]] : [this.tile];
  }

  // 시설이 새로 생겨 가던 길이 막혔으면 그 앞에서 멈춘다
  onMapChanged() {
    const i = this.path.findIndex((t) => !this.map.isWalkable(t.col, t.row));
    if (i >= 0) this.path.length = i;
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

  update(dt) {
    const A = CONFIG.anim;
    this.cooldown = Math.max(0, this.cooldown - dt);

    let left = CONFIG.player.speed * dt;   // 이번 프레임에 갈 수 있는 거리(칸)
    while (left > 0 && this.path.length) {
      const t = this.path[0];
      const dc = t.col - this.col, dr = t.row - this.row;
      const dist = Math.hypot(dc, dr);
      this.face(dc - dr);
      if (dist <= left) {
        this.col = t.col; this.row = t.row;
        this.tile = { col: t.col, row: t.row };
        this.path.shift();
        left -= dist;
      } else {
        this.col += dc / dist * left;
        this.row += dr / dist * left;
        left = 0;
      }
    }
    this.syncSprite();

    // 대상 옆에 도착했으면 도구를 든다
    const a = this.action;
    if (a && !this.moving) {
      if (!a.isValid() || !this.isNextTo(a.target.tiles)) {
        this.action = null;
      } else if (!this.swing && this.cooldown <= 0) {
        const ts = a.target.sprite;
        this.face((ts.shakeBase === undefined ? ts.x : ts.shakeBase) - this.sprite.x);   // 흔들리는 중이면 제자리 기준
        this.swing = { t: 0, struck: false, tool: a.tool() };
        this.cooldown = CONFIG.player.actionInterval;
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
