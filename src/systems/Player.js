import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { findPath } from './Pathfinder.js';

// 주인공: 눌러서 이동, 걷는 동작, 좌우 뒤집기, 깊이 정렬, 옆 칸의 대상에게 행동(캐기 등)
export class Player {
  constructor(scene, mapSystem, col, row) {
    this.scene = scene;
    this.map = mapSystem;
    this.key = 'char_player';
    this.asset = mapSystem.assets[this.key];
    this.col = col;            // 지금 위치(소수 칸)
    this.row = row;
    this.tile = { col, row };  // 지금 서 있는(또는 막 떠난) 칸
    this.path = [];            // 앞으로 지나갈 칸들
    this.costAt = (c, r) => (this.map.isWalkable(c, r) ? 1 : 0);

    this.action = null;        // { target, isValid(target), act(target) }
    this.cooldown = 0;         // 다음 행동까지 남은 시간(초)
    this.attackTimer = 0;      // attack 그림을 보여 줄 남은 시간(초)
    this.onEnterTile = null;   // 새 칸에 들어설 때 부르는 함수 (col, row)

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key, this.frame('idle'))
      .setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

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
    if (!next && best.length === 1) best = [];   // 이미 그 칸에 서 있다
    this.path = best;
    return true;
  }

  // tiles(칸 목록)의 둘레 8방향 칸 중 걸을 수 있는 곳들
  neighborsOf(tiles) {
    const m = this.map;
    const out = [];
    const seen = new Set();
    for (const t of tiles) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const c = t.col + dc, r = t.row + dr, k = c + ',' + r;
        if (seen.has(k) || !m.isWalkable(c, r)) continue;
        seen.add(k);
        out.push({ col: c, row: r });
      }
    }
    return out;
  }

  // (col, row) 칸으로 걸어간다. 막힌 칸이면 그 옆 칸으로 간다. 하던 행동은 멈춘다.
  goTo(col, row) {
    this.action = null;
    const m = this.map;
    if (!m.inBounds(col, row)) return false;
    if (m.isWalkable(col, row)) return this.routeTo([{ col, row }]);
    return this.routeTo(this.neighborsOf([{ col, row }]));
  }

  // tiles 옆 칸까지 걸어간다. 하던 행동은 멈춘다.
  goNextTo(tiles) {
    this.action = null;
    return this.routeTo(this.neighborsOf(tiles));
  }

  // 대상 옆 칸까지 걸어가서 actionInterval 마다 act 를 부른다.
  // target.tiles: 대상이 차지한 칸들. isValid 가 false 가 되면 멈춘다.
  // chase: 움직이는 대상(좀비 등)을 쫓아간다.
  startAction(target, isValid, act, chase = false) {
    if (!this.isNextToNow(target.tiles) && !this.routeTo(this.neighborsOf(target.tiles))) { this.action = null; return false; }
    const t = target.tiles[0];
    this.action = { target, isValid, act, chase, seenCol: t.col, seenRow: t.row };
    return true;
  }

  // 서 있는 채로 이미 옆 칸인가
  isNextToNow(tiles) { return !this.moving && this.isNextTo(tiles); }

  // 시설이 새로 생겨 가던 길이 막혔으면 그 앞에서 멈춘다
  onMapChanged() {
    const i = this.path.findIndex((t) => !this.map.isWalkable(t.col, t.row));
    if (i >= 0) this.path.length = i;
  }

  // 지금 차지하고 있는 칸들(서 있는 칸과 막 들어서는 칸)
  occupiedTiles() {
    return this.path.length ? [this.tile, this.path[0]] : [this.tile];
  }

  isNextTo(tiles) {
    return tiles.some((t) => Math.max(Math.abs(t.col - this.tile.col), Math.abs(t.row - this.tile.row)) <= 1);
  }

  faceTile(col, row) {
    const screenDx = (col - this.col) - (row - this.row);
    if (screenDx < -0.001) this.sprite.setFlipX(true);
    else if (screenDx > 0.001) this.sprite.setFlipX(false);
  }

  // 길과 행동을 버리고 (col, row)에 바로 선다
  teleport(col, row) {
    this.path = [];
    this.action = null;
    this.col = col; this.row = row;
    this.tile = { col, row };
    this.syncSprite();
    if (this.onEnterTile) this.onEnterTile(col, row);
  }

  // 맞았을 때 하얗게 번쩍인다
  flashHit() {
    this.flash = CONFIG.fx.flashTime;
    this.sprite.setTintFill(0xffffff);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.sprite.clearTint();
    }

    let left = CONFIG.player.speed * dt;   // 이번 프레임에 갈 수 있는 거리(칸)
    while (left > 0 && this.path.length) {
      const t = this.path[0];
      const dc = t.col - this.col, dr = t.row - this.row;
      const dist = Math.hypot(dc, dr);
      this.faceTile(t.col, t.row);
      if (dist <= left) {
        const entered = t.col !== this.tile.col || t.row !== this.tile.row;
        this.col = t.col; this.row = t.row;
        this.tile = { col: t.col, row: t.row };
        this.path.shift();
        left -= dist;
        if (entered && this.onEnterTile) this.onEnterTile(t.col, t.row);
      } else {
        this.col += dc / dist * left;
        this.row += dr / dist * left;
        left = 0;
      }
    }

    // 쫓는 대상이 다른 칸으로 갔으면 길을 다시 잡는다
    if (this.action && this.action.chase) {
      const a = this.action, t = a.target.tiles[0];
      if (!a.isValid(a.target)) {
        this.action = null;
      } else if ((t.col !== a.seenCol || t.row !== a.seenRow) && !this.isNextToNow(a.target.tiles)) {
        a.seenCol = t.col; a.seenRow = t.row;
        if (!this.routeTo(this.neighborsOf(a.target.tiles))) this.action = null;
      }
    }

    // 도착했으면 옆 칸의 대상에게 행동한다
    if (this.action && !this.moving) {
      const a = this.action;
      if (!a.isValid(a.target) || !this.isNextTo(a.target.tiles)) {
        this.action = null;
      } else if (this.cooldown <= 0) {
        const t = a.target.tiles[0];
        this.faceTile(t.col, t.row);
        this.cooldown = CONFIG.player.actionInterval;
        this.attackTimer = CONFIG.anim.attackTime;
        a.act(a.target);
        if (!a.isValid(a.target)) this.action = null;
      }
    }

    if (this.moving) {
      this.sprite.anims.play(this.key + '_walk', true);
    } else {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      this.sprite.setFrame(this.frame(this.attackTimer > 0 ? 'attack' : 'idle'));
    }
    this.syncSprite();
  }

  syncSprite() {
    const w = tileToWorld(this.col, this.row);
    this.sprite.setPosition(w.x, w.y);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }
}
