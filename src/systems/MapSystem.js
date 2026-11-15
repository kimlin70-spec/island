import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

const OBJECT_KEY = { tree: 'obj_tree', pine: 'obj_pine', palm: 'obj_palm', rock: 'obj_rock', bush: 'obj_bush_berry' };
const TALL_TYPES = ['tree', 'pine', 'palm', 'house'];   // 주인공을 가릴 수 있는 키 큰 사물

// 지도: 물, 낭떠러지 띠, 땅, 사물, 집을 그리고 "지나갈 수 있는 칸"을 알려 준다.
export class MapSystem {
  constructor(scene, map, manifest) {
    this.scene = scene;
    this.map = map;
    this.manifest = manifest;
    this.assets = manifest.assets;
    this.cols = map.cols;
    this.rows = map.rows;
    this.objects = [];                       // { type, col, row, sprite, tall }
    this.solid = new Uint8Array(this.cols * this.rows);   // 사물, 집이 있는 칸
    this.waterTiles = [];
  }

  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  terrainId(col, row) { return this.inBounds(col, row) ? this.map.terrain[row][col] : 0; }
  terrainName(col, row) { return this.map.terrainLegend[String(this.terrainId(col, row))]; }
  isLand(col, row) { return this.terrainId(col, row) !== 0; }
  isSolid(col, row) { return this.solid[row * this.cols + col] === 1; }
  // 주인공이 걸을 수 있는 칸인가
  isWalkable(col, row) { return this.isLand(col, row) && !this.isSolid(col, row); }

  // 같은 땅이라도 칸마다 그림이 조금씩 다르게 고른다 (3.4)
  tileKey(kind, col, row) {
    const list = this.manifest.meta.terrainTiles[kind];
    let h = (((col * 73856093) ^ (row * 19349663)) >>> 0) % 10;
    for (const [key, weight] of list) {
      if (h < weight) return key;
      h -= weight;
    }
    return list[0][0];
  }

  place(key, col, row) {
    const w = tileToWorld(col, row);
    const a = this.assets[key];
    return this.scene.add.image(w.x, w.y, key).setOrigin(a.originX, a.originY);
  }

  build() {
    const D = CONFIG.depth;
    const scene = this.scene;

    // col + row 가 작은 칸부터 만든다
    const order = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) order.push([c, r]);
    order.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);

    // 바닥(물, 띠, 땅)은 한 묶음으로 둔다. 움직이는 캐릭터와 따로 정렬되어 가볍다.
    this.groundLayer = scene.add.layer().setDepth(D.water);
    this.floorLayer = scene.add.layer().setDepth(D.floor);

    for (const [c, r] of order) {
      if (this.isLand(c, r)) continue;
      const img = this.place('tile_water_1', c, r).setDepth(D.water);
      this.groundLayer.add(img);
      this.waterTiles.push({ img, offbeat: ((c * 7 + r * 13) & 1) === 1 });
    }
    this.edges = [];
    for (const [c, r] of order) {
      if (!this.isLand(c, r)) continue;
      if (!this.isLand(c, r + 1)) this.addEdge('edge_sw', c, r);
      if (!this.isLand(c + 1, r)) this.addEdge('edge_se', c, r);
    }
    for (const [c, r] of order) {
      if (!this.isLand(c, r)) continue;
      const img = this.place(this.tileKey(this.terrainName(c, r), c, r), c, r).setDepth(D.land);
      this.groundLayer.add(img);
    }

    // 깃발 자리(바닥 표시)
    this.flagSpots = [];
    for (const z of this.map.zones) {
      const img = this.place('obj_flag_spot', z.flagSpot.col, z.flagSpot.row);
      this.floorLayer.add(img);
      this.flagSpots.push({ zone: z, img });
    }

    // 사물
    for (const o of this.map.objects) {
      const sprite = this.place(OBJECT_KEY[o.type], o.col, o.row);
      sprite.setDepth(D.objectBase + sprite.y);
      this.objects.push({ type: o.type, col: o.col, row: o.row, sprite, tall: TALL_TYPES.includes(o.type) });
      this.solid[o.row * this.cols + o.col] = 1;
    }

    // 집 (2×2칸의 한가운데에 놓는다)
    const h = this.map.house;
    const hs = this.place('obj_house', h.col + (h.w - 1) / 2, h.row + (h.h - 1) / 2);
    hs.setDepth(D.objectBase + hs.y);
    this.house = { type: 'house', col: h.col, row: h.row, sprite: hs, tall: true };
    this.objects.push(this.house);
    for (let r = h.row; r < h.row + h.h; r++) for (let c = h.col; c < h.col + h.w; c++) this.solid[r * this.cols + c] = 1;

    // 잔물결: 두 그림을 번갈아, 칸의 절반은 엇박자로
    this.waterPhase = false;
    scene.time.addEvent({
      delay: CONFIG.anim.waterInterval * 1000,
      loop: true,
      callback: () => {
        this.waterPhase = !this.waterPhase;
        for (const t of this.waterTiles) {
          t.img.setTexture(this.waterPhase !== t.offbeat ? 'tile_water_2' : 'tile_water_1');
        }
      },
    });
  }

  addEdge(key, col, row) {
    const img = this.place(key, col, row).setDepth(CONFIG.depth.edge);
    this.groundLayer.add(img);
    this.edges.push({ col, row, img });
  }

  // 주인공이 키 큰 사물 뒤에 가려지면 그 사물을 반투명하게 (3.3)
  updateOcclusion(playerSprite, dt) {
    const pw = playerSprite.displayWidth, ph = playerSprite.displayHeight;
    const pLeft = playerSprite.x - pw * playerSprite.originX;
    const pTop = playerSprite.y - ph * playerSprite.originY;
    // 몸통만 본다(그림 둘레의 빈 곳 제외)
    const px1 = pLeft + pw * 0.3, px2 = pLeft + pw * 0.7;
    const py1 = pTop + ph * 0.1, py2 = pTop + ph;
    const step = dt / CONFIG.occlude.fadeTime * (1 - CONFIG.occlude.alpha);
    for (const o of this.objects) {
      if (!o.tall) continue;
      const s = o.sprite;
      let hidden = false;
      if (s.y > playerSprite.y) {
        const x1 = s.x - s.displayWidth * s.originX, y1 = s.y - s.displayHeight * s.originY;
        const mx = s.displayWidth * 0.15;   // 그림 가장자리의 빈 곳은 뺀다
        hidden = px2 > x1 + mx && px1 < x1 + s.displayWidth - mx && py2 > y1 + mx && py1 < y1 + s.displayHeight;
      }
      const target = hidden ? CONFIG.occlude.alpha : 1;
      if (s.alpha !== target) {
        s.alpha = s.alpha < target ? Math.min(target, s.alpha + step) : Math.max(target, s.alpha - step);
      }
    }
  }
}
