import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { Player } from '../systems/Player.js';

// 월드: 지도, 주인공, 카메라
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const manifest = this.cache.json.get('manifest');
    const map = this.cache.json.get('map');

    this.mapSystem = new MapSystem(this, map, manifest);
    this.mapSystem.build();

    this.player = new Player(this, this.mapSystem, map.playerStart.col, map.playerStart.row);

    // 누른 칸 표시
    const ca = manifest.assets.overlay_cursor;
    this.cursor = this.add.image(0, 0, 'overlay_cursor').setOrigin(ca.originX, ca.originY).setVisible(false);
    this.mapSystem.floorLayer.add(this.cursor);

    // 카메라: 낮에는 주인공을 따라간다
    const cam = this.cameras.main;
    cam.setZoom(CONFIG.view.dayZoom);
    cam.startFollow(this.player.sprite, false, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
    cam.centerOn(this.player.sprite.x, this.player.sprite.y);

    // 누르기 / 끌기 구분: 누른 뒤 일정 거리 넘게 움직이면 끌기
    this.input.on('pointerup', (p) => {
      const scale = this.scale.displayScale.x;   // 게임 px ÷ 화면 px
      const moved = Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) / scale;
      if (moved > CONFIG.input.dragThreshold) return;
      const w = cam.getWorldPoint(p.upX, p.upY);
      this.onTap(w.x, w.y);
    });
  }

  onTap(worldX, worldY) {
    const t = worldToTile(worldX, worldY);
    if (!this.mapSystem.inBounds(t.col, t.row)) return;
    if (this.player.goTo(t.col, t.row)) this.showCursor(t.col, t.row);
  }

  showCursor(col, row) {
    const w = tileToWorld(col, row);
    this.tweens.killTweensOf(this.cursor);
    this.cursor.setPosition(w.x, w.y).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: this.cursor, alpha: 0,
      duration: CONFIG.anim.cursorTime * 1000,
      onComplete: () => this.cursor.setVisible(false),
    });
  }

  update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    this.player.update(dt);
    this.mapSystem.updateOcclusion(this.player.sprite, dt);
  }
}
