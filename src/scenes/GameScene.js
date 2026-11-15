import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { FogSystem } from '../systems/FogSystem.js';
import { NodeSystem } from '../systems/NodeSystem.js';
import { Inventory, ITEMS } from '../systems/Inventory.js';
import { Vitals } from '../systems/Vitals.js';
import { Effects } from '../systems/Effects.js';
import { Player } from '../systems/Player.js';
import { BuildSystem } from '../systems/BuildSystem.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { ZombieSystem } from '../systems/ZombieSystem.js';

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

    this.build = new BuildSystem(this, this.mapSystem, this.fog, this.inventory, this.player);
    this.clock = new TimeSystem(this);
    this.zombies = new ZombieSystem(this, this.mapSystem, this.fog);

    // 집 체력
    this.house = this.mapSystem.house;
    this.house.maxHp = CONFIG.house.hp;
    this.house.hp = CONFIG.house.hp;
    const hs = this.house.sprite;
    this.house.bar = this.effects.makeBar(hs.x, hs.y - hs.height * hs.originY + CONFIG.fx.houseBarDrop);
    const hc = tileToWorld(map.house.col + (map.house.w - 1) / 2, map.house.row + (map.house.h - 1) / 2);
    this.houseCenter = hc;

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

    // 짓기 상태: 손가락을 댄 칸에 지을 수 있는지 표시한다
    const touchBuild = (p) => {
      if (!this.build.mode || !p.isDown || this.ui.capturedDownTime === p.downTime) return;
      const w = cam.getWorldPoint(p.x, p.y);
      this.build.touch(w.x, w.y);
    };
    this.input.on('pointerdown', touchBuild);
    this.input.on('pointermove', touchBuild);

    // 밤: 화면을 끌면 지도가 움직인다
    this.input.on('pointermove', (p) => {
      if (!this.clock.isNight || this.build.mode || !p.isDown || this.ui.capturedDownTime === p.downTime) return;
      if (cam.panEffect.isRunning) return;
      const moved = Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) / this.scale.displayScale.x;
      if (moved <= CONFIG.input.dragThreshold) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    // 누르기 / 끌기 구분: 누른 뒤 일정 거리 넘게 움직이면 끌기
    this.input.on('pointerup', (p) => {
      if (this.ui.capturedDownTime === p.downTime) return;   // UI를 누른 터치는 월드로 보내지 않는다
      if (this.build.mode) {                                  // 짓기 상태: 손을 뗀 칸에 짓는다
        const w = cam.getWorldPoint(p.upX, p.upY);
        this.build.release(w.x, w.y);
        return;
      }
      const scale = this.scale.displayScale.x;   // 게임 px ÷ 화면 px
      const moved = Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) / scale;
      if (moved > CONFIG.input.dragThreshold) return;
      const w = cam.getWorldPoint(p.upX, p.upY);
      this.onTap(w.x, w.y);
    });

    this.events.on('player-collapsed', this.onCollapsed, this);
    this.events.on('evening', this.onEvening, this);
    this.events.on('night', this.onNight, this);
    this.events.on('morning', this.onMorning, this);
  }

  // ---- 낮과 밤 (5.6) ----
  onEvening() {
    this.ui.setTint('evening');
    this.ui.notice('곧 밤이 돼요! 집을 지켜요');
  }

  onNight() {
    this.ui.setTint('night');
    this.zombies.startNight(this.clock.day, CONFIG.time.nightLength);
    // 카메라: 넓어지며 집을 화면 가운데에 둔다. 주인공을 따라가지 않는다.
    const cam = this.cameras.main, ms = CONFIG.camera.changeTime * 1000;
    cam.stopFollow();
    cam.pan(this.houseCenter.x, this.houseCenter.y, ms, 'Sine.easeInOut', true);
    cam.zoomTo(CONFIG.view.nightZoom, ms, 'Sine.easeInOut', true);
  }

  onMorning() {
    this.ui.setTint('day');
    this.zombies.clearAll();                       // 남은 좀비가 모두 사라진다
    this.vitals.heal(CONFIG.player.morningHeal);   // 하트 +2
    this.build.repairAll();                        // 시설과 집의 체력이 가득 찬다
    this.house.hp = this.house.maxHp;
    this.house.bar.set(1);
    this.nodes.onMorning();                        // 다시 생길 때가 된 재료가 돌아온다
    // 카메라: 다시 주인공에게 돌아가며 확대된다
    const cam = this.cameras.main, ms = CONFIG.camera.changeTime * 1000;
    cam.panEffect.reset();
    cam.zoomTo(CONFIG.view.dayZoom, ms, 'Sine.easeInOut', true);
    cam.startFollow(this.player.sprite, false, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
  }

  // 집이 맞았다. 체력이 0이면 바로 아침으로 넘어가고 나무와 돌을 절반 잃는다. (5.8)
  damageHouse(n) {
    if (this.house.hp <= 0) return;
    this.house.hp -= n;
    this.house.bar.set(this.house.hp / this.house.maxHp);
    if (this.house.hp <= 0) {
      this.ui.notice('집이 부서졌어요');
      this.inventory.losePart(CONFIG.penalty.loseRate);
      this.events.emit('house-destroyed');
      if (this.clock.isNight) this.clock.startMorning();
      else { this.house.hp = this.house.maxHp; this.house.bar.set(1); this.zombies.clearAll(); }
    }
  }

  // 주인공이 맞았다
  hurtPlayer(n) {
    if (this.collapsing) return;
    this.player.flashHit();
    this.vitals.damage(n);
  }

  // 좀비를 때린다
  attackZombie(z) {
    this.zombies.damage(z, CONFIG.player.attackDamage);
  }

  // 지금 좀비가 나오는 구역 (내 땅 만들기는 Phase 6. 그 전에는 1구역)
  spawnZone() {
    return this.mapData.zones[0];
  }

  // 누른 곳의 우선순위: (화면 UI) → 캐릭터 → 사물/시설 → 땅
  onTap(worldX, worldY) {
    const t = worldToTile(worldX, worldY);
    const m = this.mapSystem;

    // 좀비를 누르면 쫓아가서 때린다
    const z = this.zombies.pick(worldX, worldY);
    if (z) {
      this.player.startAction(z, (t) => t.alive, (t) => this.attackZombie(t), true);
      return;
    }

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

  // 지금 캐릭터들이 차지한 칸(그 칸에는 지을 수 없다)
  characterTiles() {
    return [...this.player.occupiedTiles(), ...this.zombies.occupiedTiles()];
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
      if (!this.clock.isNight) this.cameras.main.centerOn(this.player.sprite.x, this.player.sprite.y);
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
  debugNight() { this.clock.startNight(); }
  debugMorning() { this.clock.startMorning(); }
  debugZombie() { this.zombies.spawn('zombie'); }
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
    this.clock.update(dt);
    this.zombies.update(dt, this.clock.isNight ? this.clock.t : null);
    // 가만히 서 있을 때 옆 칸에 좀비가 오면 자동으로 때린다(쫓아가지는 않는다)
    if (!this.player.action && !this.player.moving && !this.collapsing) {
      const z = this.zombies.adjacentTo(this.player.tile.col, this.player.tile.row);
      if (z) this.player.startAction(z, (t) => t.alive, (t) => this.attackZombie(t), false);
    }
    this.player.update(dt);
    this.build.update(dt);
    if (!this.collapsing) this.vitals.update(dt);
    this.fog.update(dt);
    this.mapSystem.updateOcclusion(this.player.sprite, dt);
  }
}
