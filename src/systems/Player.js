import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { findPath } from './Pathfinder.js';

// 주인공: 눌러서 이동, 걷는 동작, 좌우 뒤집기, 깊이 정렬
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

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key, this.frame('idle'))
      .setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

  frame(name) { return this.asset.frames.indexOf(name); }
  get moving() { return this.path.length > 0; }

  // (col, row) 칸으로 걸어간다. 막힌 칸이면 그 옆 칸으로 간다. 갈 수 없으면 false.
  goTo(col, row) {
    const m = this.map;
    if (!m.inBounds(col, row)) return false;
    const start = this.tile;
    let best = null;
    if (m.isWalkable(col, row)) {
      best = findPath(m.cols, m.rows, start, { col, row }, this.costAt);
    } else {
      // 사물, 집, 물을 눌렀으면 둘레 8칸 중 가장 가까운 곳으로
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const c = col + dc, r = row + dr;
        if (!m.isWalkable(c, r)) continue;
        const p = findPath(m.cols, m.rows, start, { col: c, row: r }, this.costAt);
        if (p && (!best || p.cost < best.cost)) best = p;
      }
    }
    if (!best) return false;

    // 걷던 중이면 떠나온 칸과 가던 칸 사이에 있다.
    // 새 길이 가던 칸을 바로 지나가면 되돌아가지 않고 그대로 이어 간다.
    const next = this.path[0];
    if (next && best.length >= 2 && best[1].col === next.col && best[1].row === next.row) best.shift();
    this.path = best;
    return true;
  }

  update(dt) {
    let left = CONFIG.player.speed * dt;   // 이번 프레임에 갈 수 있는 거리(칸)
    while (left > 0 && this.path.length) {
      const t = this.path[0];
      const dc = t.col - this.col, dr = t.row - this.row;
      const dist = Math.hypot(dc, dr);
      const screenDx = dc - dr;            // 화면에서 왼쪽(-) / 오른쪽(+)
      if (screenDx < -0.001) this.sprite.setFlipX(true);
      else if (screenDx > 0.001) this.sprite.setFlipX(false);
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

    if (this.moving) {
      this.sprite.anims.play(this.key + '_walk', true);
    } else if (this.sprite.anims.isPlaying) {
      this.sprite.anims.stop();
      this.sprite.setFrame(this.frame('idle'));
    }
    this.syncSprite();
  }

  syncSprite() {
    const w = tileToWorld(this.col, this.row);
    this.sprite.setPosition(w.x, w.y);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }
}
