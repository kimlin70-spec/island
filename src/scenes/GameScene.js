import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { FogSystem } from '../systems/FogSystem.js';
import { NodeSystem } from '../systems/NodeSystem.js';
import { Inventory, ITEMS } from '../systems/Inventory.js';
import { Vitals } from '../systems/Vitals.js';
import { Effects } from '../systems/Effects.js';
import { Player } from '../systems/Player.js';

// 월드: 지도, 안개, 주인공, 카메라
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const manifest = this.cache.json.get('manifest');
    const map = this.cache.json.get('map');
    this.mapData = map;
    this.speed = 1;            // 시험용 도구의 속도 배수
    this.collapsing = false;

    this.mapSystem = new MapSystem(this, map, manifest);
    this.mapSystem.build();
    this.fog = new FogSystem(this, this.mapSystem);
    this.fog.build();
    this.nodes = new NodeSystem(this, this.mapSystem);
    this.inventory = new Inventory(this);
    this.vitals = new Vitals(this);
    this.effects = new Effects(this);

    this.player = new Player(this, this.mapSystem, map.playerStart.col, map.playerStart.row);
    this.player.onEnterTile = (c, r) => this.fog.reveal(c, r, CONFIG.player.revealRadius);
    this.fog.reveal(map.playerStart.col, map.playerStart.row, CONFIG.player.startRevealRadius);

    // 누른 칸 표시
    const ca = manifest.assets.overlay_cursor;
    this.cursor = this.add.image(0, 0, 'overlay_cursor').setOrigin(ca.originX, ca.originY).setVisible(false);
    this.mapSystem.floorLayer.add(this.cursor);

    // 카메라: 낮에는 주인공을 따라간다
    const cam = this.cameras.main;
    cam.setZoom(CONFIG.view.dayZoom);
    cam.startFollow(this.player.sprite, false, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
    cam.centerOn(this.player.sprite.x, this.player.sprite.y);

    // 화면 UI (별도 씬)
    this.ui = this.scene.get('ui');
    this.scene.launch('ui');

    // 누르기 / 끌기 구분: 누른 뒤 일정 거리 넘게 움직이면 끌기
    this.input.on('pointerup', (p) => {
      if (this.ui.capturedDownTime === p.downTime) return;   // UI를 누른 터치는 월드로 보내지 않는다
      const scale = this.scale.displayScale.x;   // 게임 px ÷ 화면 px
      const moved = Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) / scale;
      if (moved > CONFIG.input.dragThreshold) return;
      const w = cam.getWorldPoint(p.upX, p.upY);
      this.onTap(w.x, w.y);
    });

    this.events.on('player-collapsed', this.onCollapsed, this);
  }

  // 누른 곳의 우선순위: (화면 UI) → 캐릭터 → 사물/시설 → 땅
  onTap(worldX, worldY) {
    const t = worldToTile(worldX, worldY);
    const m = this.mapSystem;

    let obj = m.pickObject(worldX, worldY);
    if (!obj && this.fog.isRevealed(t.col, t.row)) obj = m.objectAt(t.col, t.row);
    if (obj) {
      if (this.nodes.canHarvest(obj)) {
        const ok = this.player.startAction(obj, (o) => this.nodes.canHarvest(o), (o) => this.harvest(o));
        if (ok) this.showCursor(obj.col, obj.row);
      } else {
        this.player.goNextTo(obj.tiles);   // 다 쓴 사물, 집: 옆까지만 간다
      }
      return;
    }

    if (!m.inBounds(t.col, t.row)) return;
    if (this.player.goTo(t.col, t.row)) this.showCursor(t.col, t.row);
  }

  // 한 번 캐기 (5.4)
  harvest(obj) {
    const got = this.nodes.hit(obj);
    this.inventory.add(got.item, got.amount);
    this.effects.popup(obj.sprite.x, obj.sprite.y - CONFIG.fx.popupHeight, 'icon_' + got.item, '+' + got.amount);
  }

  // 가방의 열매나 고기를 먹는다 (5.5)
  eat(kind) {
    if (this.inventory.count(kind) <= 0) return;
    if (!this.vitals.canEat(kind)) { this.ui.notice('배가 불러요'); return; }
    this.inventory.add(kind, -1);
    this.vitals.eat(kind);
  }

  // 하트가 0: 화면이 잠깐 어두워졌다가 집 문 앞에서 깨어난다 (5.5)
  onCollapsed() {
    if (this.collapsing) return;
    this.collapsing = true;
    this.ui.fadeBlack(() => {
      const d = this.mapData.houseDoor;
      this.player.teleport(d.col, d.row);
      this.cameras.main.centerOn(this.player.sprite.x, this.player.sprite.y);
      this.vitals.fillHearts();
      this.inventory.losePart(CONFIG.penalty.loseRate);
      this.collapsing = false;
    });
  }

  // 지금 노리는 구역 (내 땅 만들기는 Phase 6. 그 전에는 1구역)
  targetZone() {
    return this.mapData.zones[0];
  }

  // ---- 시험용 도구 (8장) ----
  debugGive() {
    for (const k of ITEMS) this.inventory.add(k, CONFIG.debug.giveAmount);
  }
  debugRevealAll() { this.fog.revealAll(); }
  debugToggleSpeed() {
    this.speed = this.speed === 1 ? CONFIG.debug.fastSpeed : 1;
    this.time.timeScale = this.speed;
    this.tweens.timeScale = this.speed;
    this.anims.globalTimeScale = this.speed;
    return this.speed;
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
    const dt = Math.min(delta, 100) / 1000 * this.speed;
    this.player.update(dt);
    if (!this.collapsing) this.vitals.update(dt);
    this.fog.update(dt);
    this.mapSystem.updateOcclusion(this.player.sprite, dt);
  }
}
