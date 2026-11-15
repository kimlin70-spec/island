import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';

// 지을 수 있는 시설. key 는 CONFIG.build 의 이름과 같다.
export const BUILDINGS = {
  fence:      { name: '울타리', sprite: 'tower_fence', icon: 'icon_fence', tall: false },
  stoneTower: { name: '돌 던지는 탑', sprite: 'tower_stone', icon: 'icon_stone_tower', tall: true },
};
export const REMOVE = 'remove';

// 짓기와 치우기 (5.7)
export class BuildSystem {
  constructor(scene, mapSystem, fog, inventory, player) {
    this.scene = scene;
    this.map = mapSystem;
    this.fog = fog;
    this.inventory = inventory;
    this.player = player;
    this.mode = null;          // null | 'fence' | 'stoneTower' | 'remove'
    this.markOk = false;       // 손가락을 댄 칸에 지을(치울) 수 있는가
    this.markTile = null;

    // 손가락을 댄 칸의 표시. 안개 위에서도 보이도록 안개 바로 위에 둔다.
    const a = mapSystem.assets.overlay_ok;
    this.mark = scene.add.image(0, 0, 'overlay_ok').setOrigin(a.originX, a.originY)
      .setDepth(CONFIG.depth.buildMark).setVisible(false);
  }

  setMode(mode) {
    this.mode = mode;
    this.hideMark();
    this.scene.events.emit('build-changed');
  }

  cost(type) { return CONFIG.build[type].cost; }
  canAfford(type) { return this.inventory.has(this.cost(type)); }

  // 지을 수 있는 칸: 밝혀진 땅이고, 사물·시설·집·깃발 자리·집 문 앞이 아니고, 캐릭터가 서 있지 않은 칸
  canBuildAt(col, row) {
    const m = this.map;
    if (!m.inBounds(col, row) || !m.isLand(col, row)) return false;
    if (!this.fog.isRevealed(col, row)) return false;
    if (m.isSolid(col, row) || m.structureAt(col, row)) return false;
    if (m.flagGrid[row * m.cols + col]) return false;
    const door = m.map.houseDoor;
    if (door.col === col && door.row === row) return false;
    for (const t of this.scene.characterTiles()) if (t.col === col && t.row === row) return false;
    return true;
  }

  // 손가락을 댄 곳(월드 좌표)에 표시를 보여 준다
  touch(worldX, worldY) {
    if (!this.mode) return;
    const t = worldToTile(worldX, worldY);
    if (!this.map.inBounds(t.col, t.row)) { this.hideMark(); return; }
    this.markTile = t;
    if (this.mode === REMOVE) {
      this.markOk = !!this.structureUnder(worldX, worldY, t);
    } else {
      this.markOk = this.canAfford(this.mode) && this.canBuildAt(t.col, t.row);
    }
    const w = tileToWorld(t.col, t.row);
    this.mark.setTexture(this.markOk ? 'overlay_ok' : 'overlay_no').setPosition(w.x, w.y).setVisible(true);
  }

  // 손을 뗐을 때: 표시가 "됨"이었으면 짓는다(치운다)
  release(worldX, worldY) {
    if (!this.mode) return;
    this.touch(worldX, worldY);
    if (this.markOk && this.markTile) {
      if (this.mode === REMOVE) this.remove(this.structureUnder(worldX, worldY, this.markTile));
      else this.place(this.mode, this.markTile.col, this.markTile.row);
    }
    this.hideMark();
  }

  hideMark() {
    this.mark.setVisible(false);
    this.markOk = false;
    this.markTile = null;
  }

  // 누른 칸의 시설, 없으면 누른 곳에 그림이 놓인 시설
  structureUnder(worldX, worldY, tile) {
    const s = this.map.structureAt(tile.col, tile.row);
    if (s) return s;
    const o = this.map.pickObject(worldX, worldY);
    return o && o.isStructure ? o : null;
  }

  place(type, col, row) {
    if (!this.inventory.pay(this.cost(type))) return null;
    const def = BUILDINGS[type], cfg = CONFIG.build[type];
    const sprite = this.map.place(def.sprite, col, row);
    sprite.setDepth(CONFIG.depth.objectBase + sprite.y);
    const s = {
      isStructure: true, type, col, row, tiles: [{ col, row }],
      sprite, tall: def.tall, cfg, hp: cfg.hp, maxHp: cfg.hp,
    };
    this.map.addStructure(s);
    this.player.onMapChanged();
    this.scene.events.emit('structures-changed');
    return s;
  }

  // 치우기: 재료의 절반(내림)을 돌려받는다
  remove(s) {
    if (!s) return;
    for (const [item, n] of Object.entries(this.cost(s.type))) {
      const back = Math.floor(n * CONFIG.build.refundRate);
      if (back > 0) this.inventory.add(item, back);
    }
    this.destroy(s);
  }

  // 재료를 돌려주지 않고 없앤다(부서졌을 때도 쓴다)
  destroy(s) {
    this.map.removeStructure(s);
    s.sprite.destroy();
    this.scene.events.emit('structures-changed');
  }
}
