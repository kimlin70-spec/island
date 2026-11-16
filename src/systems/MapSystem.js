import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

// 지도: 바닥 그림과 사물을 그리고, "지나갈 수 있는 칸"을 알려 준다.
export class MapSystem {
  constructor(scene, map, manifest) {
    this.scene = scene;
    this.map = map;
    this.assets = manifest.assets;
    this.ground = manifest.meta.ground;
    this.cols = map.cols;
    this.rows = map.rows;
    this.objects = [];                                               // { kind, col, row, sprite, blocks, tall }
    this.objectGrid = new Array(this.cols * this.rows).fill(null);   // 칸 -> 그 칸의 사물
  }

  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  // 땅은 terrain 값이 0(물)이 아닌 칸이다
  isLand(col, row) { return this.inBounds(col, row) && this.map.terrain[row][col] !== 0; }
  objectAt(col, row) { return this.inBounds(col, row) ? this.objectGrid[row * this.cols + col] : null; }

  // 주인공이 걸을 수 있는 칸인가: 땅이고, 나무·돌·덤불이 없다
  isWalkable(col, row) {
    if (!this.isLand(col, row)) return false;
    const o = this.objectGrid[row * this.cols + col];
    return !(o && o.blocks);
  }

  // 그림의 기준점(발)을 칸 중심에 맞춰 놓는다
  place(key, col, row) {
    const w = tileToWorld(col, row);
    const a = this.assets[key];
    return this.scene.add.image(w.x, w.y, key).setOrigin(a.originX, a.originY);
  }

  build() {
    const D = CONFIG.depth;

    // 바닥: 섬 전체를 그린 큰 그림을 조각으로 나눈 것 (3.3).
    // 조각은 이웃과 1px씩 겹치게 만들어져 있어서, 가장자리를 뺀 안쪽만 그린다. setCrop을 빼면 조각 사이에 줄이 보인다.
    const G = this.ground;
    for (const ch of G.chunks) {
      this.scene.add.image(ch.x, ch.y, ch.key).setOrigin(0, 0)
        .setCrop(G.chunkMargin, G.chunkMargin, G.chunkStep, G.chunkStep)
        .setDepth(D.ground);
    }

    // 사물: 발 위치의 y가 클수록 앞에 그린다 (3.4)
    for (const o of this.map.objects) {
      const sprite = this.place(o.sprite, o.col, o.row);
      sprite.setDepth(D.objectBase + sprite.y);
      const obj = {
        kind: o.kind, col: o.col, row: o.row, sprite,
        blocks: true,                                   // 그 칸을 막는다
        tall: CONFIG.occlude.kinds.includes(o.kind),    // 캐릭터를 가릴 수 있다
      };
      this.objects.push(obj);
      this.objectGrid[o.row * this.cols + o.col] = obj;
    }
  }

  // 캐릭터가 키 큰 사물 뒤에 가려지면 그 사물을 반투명하게 하고, 벗어나면 되돌린다 (3.4)
  // chars: 캐릭터 그림들(기준점이 발)
  updateOcclusion(chars, dt) {
    const O = CONFIG.occlude;
    const half = O.bodyWidth / 2;
    const step = dt / O.fadeTime * (1 - O.alpha);
    for (const o of this.objects) {
      if (!o.tall) continue;
      const s = o.sprite;
      const left = s.x - s.displayWidth * s.originX;
      const top = s.y - s.displayHeight * s.originY;
      const m = s.displayWidth * O.inset;
      let hidden = false;
      for (const c of chars) {
        // 사물의 발이 캐릭터의 발보다 아래(앞)에 있고, 캐릭터의 발이 사물 그림의 윗부분보다 아래에 있으면
        // 몸의 일부가 그 그림 뒤에 놓인다. 좌우로는 몸통 폭만큼만 본다.
        if (s.y > c.y && c.y > top + m && c.x + half > left + m && c.x - half < left + s.displayWidth - m) {
          hidden = true;
          break;
        }
      }
      const target = hidden ? O.alpha : 1;
      if (s.alpha !== target) {
        s.alpha = s.alpha < target ? Math.min(target, s.alpha + step) : Math.max(target, s.alpha - step);
      }
    }
  }
}
