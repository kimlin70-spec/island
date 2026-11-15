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
    this.shots = [];           // 날아가는 돌

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
    if (s.bar) s.bar.destroy();
    s.sprite.destroy();
    s.hp = 0;
    this.scene.events.emit('structures-changed');
  }

  // 시설이 맞았다. 체력이 0이면 부서진다.
  damage(s, n) {
    if (s.hp <= 0) return;
    s.hp -= n;
    if (s.hp <= 0) {
      this.scene.effects.poof(s.sprite.x, s.sprite.y - s.sprite.height * 0.3);
      this.destroy(s);
      return;
    }
    if (!s.bar) s.bar = this.scene.effects.makeBar(s.sprite.x, s.sprite.y - s.sprite.height * s.sprite.originY - 10);
    s.bar.set(s.hp / s.maxHp);
  }

  // 아침: 살아남은 시설의 체력이 가득 찬다
  repairAll() {
    for (const s of this.map.structures) {
      s.hp = s.maxHp;
      if (s.bar) s.bar.set(1);
    }
  }

  // 돌 던지는 탑: 범위 안의 가장 가까운 좀비에게 돌을 던진다
  update(dt) {
    const zombies = this.scene.zombies;
    for (const s of this.map.structures) {
      if (s.type !== 'stoneTower') continue;
      s.cool = Math.max(0, (s.cool || 0) - dt);
      if (s.cool > 0) continue;
      const z = zombies.nearest(s.col, s.row, s.cfg.range);
      if (!z) continue;
      s.cool = s.cfg.interval;
      const top = s.sprite.y - s.sprite.height * s.sprite.originY + 20;
      const img = this.scene.add.image(s.sprite.x, top, 'proj_stone').setDepth(CONFIG.depth.fx);
      this.shots.push({ img, target: z, damage: s.cfg.damage, speed: s.cfg.projectileSpeed });
    }

    // 날아가는 돌
    const tileW = this.map.manifest.meta.tileWidth;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const z = shot.target;
      if (!z.alive) { shot.img.destroy(); this.shots.splice(i, 1); continue; }
      const tx = z.sprite.x, ty = z.sprite.y - z.sprite.height * 0.5;
      const dx = tx - shot.img.x, dy = ty - shot.img.y;
      const dist = Math.hypot(dx, dy);
      const step = shot.speed * tileW * 0.5 * dt;    // 칸 → px (한 칸을 대략 64px 로 본다)
      if (dist <= step) {
        shot.img.destroy();
        this.shots.splice(i, 1);
        zombies.damage(z, shot.damage);
      } else {
        shot.img.x += dx / dist * step;
        shot.img.y += dy / dist * step;
        const t = worldToTile(shot.img.x, shot.img.y);
        shot.img.setVisible(this.fog.isRevealed(t.col, t.row));
      }
    }
  }
}
