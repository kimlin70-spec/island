import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { Player } from '../systems/Player.js';

// 월드: 섬, 사물, 주인공, 카메라, 누르기
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const manifest = this.cache.json.get('manifest');
    this.mapData = this.cache.json.get('map');
    this.speed = 1;                                   // 게임 시간이 흐르는 빠르기

    this.map = new MapSystem(this, this.mapData, manifest);
    this.map.build();

    const st = this.mapData.playerStart;
    this.player = new Player(this, this.map, st.col, st.row);

    // 카메라: 주인공을 부드럽게 따라가고, 바닥 그림 밖으로 나가지 않는다
    const G = manifest.meta.ground;
    const cam = this.cameras.main;
    cam.setBounds(G.x, G.y, G.width, G.height);
    cam.setZoom(CONFIG.view.zoom);
    cam.startFollow(this.player.sprite, false, CONFIG.view.cameraLerp, CONFIG.view.cameraLerp);

    // 누른 칸 표시
    this.cursor = this.add.image(0, 0, 'overlay_cursor').setDepth(CONFIG.depth.floor).setVisible(false);
    this.cursorLeft = 0;

    this.input.on('pointerdown', (p) => this.onPress(p));
    this.scene.launch('ui');
  }

  // 한 번 누르기(마우스 클릭 = 터치)
  onPress(p) {
    if (!p.wasTouch && p.button !== 0) return;        // 마우스는 왼쪽 버튼만
    const t = worldToTile(p.worldX, p.worldY);
    // 땅을 누르면 그 칸으로 걸어간다. 갈 수 없는 칸이면 아무 일도 일어나지 않는다.
    if (this.player.goTo(t.col, t.row)) this.showCursor(t.col, t.row);
  }

  showCursor(col, row) {
    const w = tileToWorld(col, row);
    this.cursor.setPosition(w.x, w.y).setVisible(true);
    this.cursorLeft = CONFIG.input.cursorTime;
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, CONFIG.screen.maxFrameTime) * this.speed;
    this.player.update(dt);
    this.map.updateOcclusion([this.player.sprite], dt);
    if (this.cursorLeft > 0) {
      this.cursorLeft -= dt;
      if (this.cursorLeft <= 0) this.cursor.setVisible(false);
    }
  }
}
