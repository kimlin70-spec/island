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
    this.objects = [];                                               // { kind, key, col, row, tiles, sprite, blocks, tall, pickable }
    this.objectGrid = new Array(this.cols * this.rows).fill(null);   // 칸 -> 그 칸의 사물
    this.structures = [];                                            // 내가 지은 시설 { type, tiles, sprite, hp, ... }
    this.structGrid = new Array(this.cols * this.rows).fill(null);   // 칸 -> 그 칸의 시설
  }

  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  // 땅은 terrain 값이 0(물)이 아닌 칸이다
  isLand(col, row) { return this.inBounds(col, row) && this.map.terrain[row][col] !== 0; }
  objectAt(col, row) { return this.inBounds(col, row) ? this.objectGrid[row * this.cols + col] : null; }

  structureAt(col, row) { return this.inBounds(col, row) ? this.structGrid[row * this.cols + col] : null; }

  // 땅이고, 나무·돌·덤불이 없는 칸인가(시설은 따지지 않는다)
  isOpen(col, row) {
    if (!this.isLand(col, row)) return false;
    const o = this.objectGrid[row * this.cols + col];
    return !(o && o.blocks);
  }

  // 주인공이 걸을 수 있는 칸인가. 텐트와 모닥불은 막히고, 자기 울타리는 넘어 다닐 수 있다. (5.1)
  isWalkable(col, row) {
    if (!this.isOpen(col, row)) return false;
    const s = this.structGrid[row * this.cols + col];
    return !s || s.type === 'fence';
  }

  addStructure(s) {
    this.structures.push(s);
    for (const t of s.tiles) this.structGrid[t.row * this.cols + t.col] = s;
  }

  removeStructure(s) {
    this.structures.splice(this.structures.indexOf(s), 1);
    for (const t of s.tiles) this.structGrid[t.row * this.cols + t.col] = null;
  }

  // 그 칸의 장식(그루터기, 돌 부스러기)을 없앤다. 시설을 지으면 사라진다. (3.5)
  removeDecorAt(col, row) {
    const i = row * this.cols + col, o = this.objectGrid[i];
    if (!o || o.blocks) return;
    o.sprite.destroy();
    this.objects.splice(this.objects.indexOf(o), 1);
    this.objectGrid[i] = null;
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
        kind: o.kind, key: o.sprite, col: o.col, row: o.row, sprite,
        tiles: [{ col: o.col, row: o.row }],            // 차지한 칸
        blocks: true,                                   // 그 칸을 막는다
        tall: CONFIG.occlude.kinds.includes(o.kind),    // 캐릭터를 가릴 수 있다
        pickable: true,                                 // 눌러서 고를 수 있다
      };
      this.objects.push(obj);
      this.objectGrid[o.row * this.cols + o.col] = obj;
    }
  }

  // 다 쓴 사물을 장식(그루터기, 돌 부스러기)으로 바꾼다. 밟고 지나갈 수 있고, 눌러도 땅을 누른 것과 같다. (3.5)
  toDecor(o, key) {
    const a = this.assets[key];
    o.kind = 'decor';
    o.key = key;
    o.blocks = false;
    o.tall = false;
    o.pickable = false;
    o.sprite.setTexture(key).setOrigin(a.originX, a.originY).setAlpha(1);
  }

  // 월드 좌표 (x, y)를 눌렀을 때 고르는 사물이나 시설: 그림의 투명하지 않은 부분이 그 점에 놓인 것.
  // 누른 점이 그림 사각형 안에 있는 것들을 depth가 큰(앞에 있는) 것부터 본다. (3.5)
  // list 를 주면 그 안에서만 고른다(치우기는 시설만).
  pickObject(x, y, list = [...this.objects, ...this.structures]) {
    const hits = [];
    for (const o of list) {
      if (!o.pickable) continue;
      const s = o.sprite;
      const lx = Math.floor(x - (s.x - s.displayWidth * s.originX));
      const ly = Math.floor(y - (s.y - s.displayHeight * s.originY));
      if (lx >= 0 && ly >= 0 && lx < s.width && ly < s.height) hits.push({ o, lx, ly });
    }
    hits.sort((a, b) => b.o.sprite.depth - a.o.sprite.depth);
    for (const h of hits) {
      const s = h.o.sprite;
      const alpha = this.scene.textures.getPixelAlpha(h.lx, h.ly, s.texture.key, s.frame.name);
      if (alpha !== null && alpha > CONFIG.input.pickAlpha) return h.o;
    }
    return null;
  }

  // 캐릭터가 키 큰 사물 뒤에 가려지면 그 사물을 반투명하게 하고, 벗어나면 되돌린다 (3.4)
  // chars: 캐릭터 그림들(기준점이 발)
  updateOcclusion(chars, dt) {
    const O = CONFIG.occlude;
    const half = O.bodyWidth / 2;
    const step = dt / O.fadeTime * (1 - O.alpha);
    for (const o of [...this.objects, ...this.structures]) {
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
