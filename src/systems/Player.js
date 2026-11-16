import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';
import { findPath } from './Pathfinder.js';

// 주인공: 눌러서 이동, 걷는 동작, 좌우 뒤집기, 깊이 정렬
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

    const w = tileToWorld(col, row);
    this.sprite = scene.add.sprite(w.x, w.y, this.key, this.frame('idle'))
      .setOrigin(this.asset.originX, this.asset.originY);
    this.syncSprite();
  }

  // 그림 이름('idle', 'walk1' ...) -> 프레임 번호
  frame(name) { return this.asset.frames.indexOf(name); }
  get moving() { return this.path.length > 0; }

  // (col, row) 칸으로 걸어간다. 갈 수 없는 칸이면 아무 일도 하지 않고 false.
  goTo(col, row) {
    const m = this.map;
    if (!m.isWalkable(col, row)) return false;
    const path = findPath(m.cols, m.rows, this.tile, { col, row }, this.costAt);
    if (!path) return false;
    // 걷던 중이면 떠나온 칸과 가던 칸 사이에 있다.
    // 새 길이 가던 칸을 바로 지나가면 되돌아가지 않고 그대로 이어 간다.
    const next = this.path[0];
    if (next && path.length >= 2 && path[1].col === next.col && path[1].row === next.row) path.shift();
    this.path = (!next && path.length === 1) ? [] : path;   // 이미 그 칸에 서 있으면 갈 곳이 없다
    return true;
  }

  // 그림은 오른쪽을 본다. 화면 왼쪽으로 갈 때만 뒤집는다.
  faceTile(col, row) {
    const screenDx = (col - this.col) - (row - this.row);
    if (screenDx < -0.001) this.sprite.setFlipX(true);
    else if (screenDx > 0.001) this.sprite.setFlipX(false);
  }

  update(dt) {
    let left = CONFIG.player.speed * dt;   // 이번 프레임에 갈 수 있는 거리(칸)
    while (left > 0 && this.path.length) {
      const t = this.path[0];
      const dc = t.col - this.col, dr = t.row - this.row;
      const dist = Math.hypot(dc, dr);
      this.faceTile(t.col, t.row);
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
    } else {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      this.sprite.setFrame(this.frame('idle'));
    }
    this.syncSprite();
  }

  // 발 위치의 y가 클수록 앞에 그린다. y가 같으면 캐릭터가 사물보다 앞이다.
  syncSprite() {
    const w = tileToWorld(this.col, this.row);
    this.sprite.setPosition(w.x, w.y);
    this.sprite.setDepth(CONFIG.depth.objectBase + w.y + CONFIG.depth.charBias);
  }
}
