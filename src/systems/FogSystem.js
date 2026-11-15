import { CONFIG } from '../config.js';

// 안개: 처음엔 모든 칸이 구름으로 덮여 있고, 주인공이 다가가면 걷힌다. (3.6, 5.3)
export class FogSystem {
  constructor(scene, mapSystem) {
    this.scene = scene;
    this.map = mapSystem;
    const n = mapSystem.cols * mapSystem.rows;
    this.revealed = new Uint8Array(n);
    this.tiles = new Array(n).fill(null);   // 칸마다 구름 그림
    this.fading = [];                       // 사라지는 중인 구름
    this.zoneTotal = {};                    // 구역별 땅 칸 수
    this.zoneRevealed = {};                 // 구역별 밝혀진 땅 칸 수
  }

  build() {
    const m = this.map;
    this.layer = this.scene.add.layer().setDepth(CONFIG.depth.fog);
    for (const [c, r] of m.order) {
      const img = m.place('tile_fog', c, r);
      this.layer.add(img);
      this.tiles[r * m.cols + c] = img;
      if (m.isLand(c, r)) {
        const z = m.zoneId(c, r);
        this.zoneTotal[z] = (this.zoneTotal[z] || 0) + 1;
        this.zoneRevealed[z] = this.zoneRevealed[z] || 0;
      }
    }
    m.hideAllForFog();
  }

  isRevealed(col, row) {
    return this.map.inBounds(col, row) && this.revealed[row * this.map.cols + col] === 1;
  }

  // (col, row) 둘레 반경 radius 칸을 밝힌다
  reveal(col, row, radius) {
    const m = this.map;
    const R = Math.ceil(radius);
    let changed = false;
    for (let r = row - R; r <= row + R; r++) {
      for (let c = col - R; c <= col + R; c++) {
        if (!m.inBounds(c, r) || this.revealed[r * m.cols + c]) continue;
        if (Math.hypot(c - col, r - row) > radius) continue;
        this.revealTile(c, r);
        changed = true;
      }
    }
    if (changed) this.scene.events.emit('fog-changed');
  }

  revealAll() {
    const m = this.map;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      if (!this.revealed[r * m.cols + c]) this.revealTile(c, r);
    }
    this.scene.events.emit('fog-changed');
  }

  revealTile(c, r) {
    const m = this.map;
    const i = r * m.cols + c;
    this.revealed[i] = 1;
    if (this.tiles[i]) { this.fading.push(this.tiles[i]); this.tiles[i] = null; }
    if (m.isLand(c, r)) this.zoneRevealed[m.zoneId(c, r)]++;
    m.showTile(c, r);
  }

  // 구역의 "안개 걷은 비율" (0~1)
  zoneRatio(zoneId) {
    const total = this.zoneTotal[zoneId] || 0;
    return total ? this.zoneRevealed[zoneId] / total : 0;
  }

  update(dt) {
    if (!this.fading.length) return;
    const step = dt / CONFIG.fog.fadeTime;
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const img = this.fading[i];
      img.alpha -= step;
      if (img.alpha <= 0) {
        img.destroy();
        this.fading[i] = this.fading[this.fading.length - 1];
        this.fading.pop();
      }
    }
  }
}
