import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { Player } from '../systems/Player.js';
import { Inventory } from '../systems/Inventory.js';
import { Effects } from '../systems/Effects.js';
import { NodeSystem } from '../systems/NodeSystem.js';
import { Todo } from '../systems/Todo.js';
import { BuildSystem } from '../systems/BuildSystem.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { Hearts } from '../systems/Hearts.js';
import { RestSystem } from '../systems/RestSystem.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { bestTool, cardCost, cardName, objectParticle } from '../systems/Crafting.js';

// 월드: 섬, 사물, 주인공, 적, 카메라, 누르기, 시간. 화면 UI(UIScene)에는 events 로 바뀐 것을 알린다.
//   inventory-changed, tools-changed, todo-changed, build-changed, structures-changed,
//   hearts-changed, rest-changed, speed-changed, dusk, night, morning(날짜), notice(글),
//   down(쓰러짐), result(첫 아침의 결과)
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const manifest = this.cache.json.get('manifest');
    this.mapData = this.cache.json.get('map');
    this.debugSpeed = 1;                              // 시험용 도구의 속도(×1 / ×3)
    this.speed = 1;                                   // 게임 시간이 흐르는 빠르기(시험용 속도 × 텐트에서 자는 동안의 빠르기)
    this.elapsed = 0;                                 // 흐른 게임 시간(초). 모닥불 빛이 일렁이는 데 쓴다.

    this.inventory = new Inventory(this);
    this.tools = ['dagger'];                          // 가진 도구(만든 순서). 단검을 가지고 시작한다.
    this.todo = new Todo(this);
    this.effects = new Effects(this);
    this.clock = new TimeSystem(this);
    this.hearts = new Hearts(this);

    this.map = new MapSystem(this, this.mapData, manifest);
    this.map.build();
    this.nodes = new NodeSystem(this);

    const st = this.mapData.playerStart;
    this.player = new Player(this, this.map, st.col, st.row);
    this.build = new BuildSystem(this);
    this.rest = new RestSystem(this);
    this.enemies = new EnemySystem(this);
    this.resultPending = false;                       // 첫 아침: 화면이 다 밝아지면 결과 창을 띄운다

    // 카메라: 주인공을 부드럽게 따라가고, 바닥 그림 밖으로 나가지 않는다
    const G = manifest.meta.ground;
    const cam = this.cameras.main;
    cam.setBounds(G.x, G.y, G.width, G.height);
    cam.setZoom(CONFIG.view.zoom);
    cam.startFollow(this.player.sprite, false, CONFIG.view.cameraLerp, CONFIG.view.cameraLerp);

    // 누른 칸 표시
    this.cursor = this.add.image(0, 0, 'overlay_cursor').setDepth(CONFIG.depth.floor).setVisible(false);
    this.cursorLeft = 0;

    this.pressing = false;                            // 월드를 누르고 있는 중인가(짓기에서 쓴다)
    this.hovering = false;                            // 포인터가 월드 위에 있는가(짓기 표시를 따라가게 할 때 쓴다)
    this.input.on('pointerdown', (p) => this.onPress(p));
    this.input.on('pointermove', (p) => this.onMove(p));
    this.input.on('pointerup', (p) => this.onRelease(p));
    this.input.on('pointerupoutside', () => this.pointerLeft());
    this.input.on('gameout', () => this.pointerLeft());

    // 낮과 밤 (5.5)
    this.events.on('dusk', () => this.notice('곧 밤이 됩니다'));
    this.events.on('night', () => this.notice('밤이 되었습니다'));
    this.events.on('morning', (day) => this.onMorning(day));

    this.scene.launch('ui');
  }

  // 한 번 누르기(마우스 클릭 = 터치). 화면 UI를 누른 것은 여기로 오지 않는다.
  // 우선순위: 적 -> 사물·시설 -> 땅 (3.5)
  onPress(p) {
    if (!p.wasTouch && p.button !== 0) return;        // 마우스는 왼쪽 버튼만
    if (this.build.mode) {                            // 짓기·치우기 상태: 걷지 않는다. 손을 뗄 때 짓는다.
      this.pressing = true;
      this.hovering = true;
      this.build.point(p.worldX, p.worldY);
      return;
    }
    const o = this.map.pickObject(p.worldX, p.worldY);
    const t = worldToTile(p.worldX, p.worldY);
    if (this.rest.resting) {                          // 텐트 안: 텐트를 누르면 나온다. 다른 곳은 반응하지 않는다.
      const tent = this.rest.tent;
      if (o === tent || this.map.structureAt(t.col, t.row) === tent) this.rest.exit();
      return;
    }
    const e = this.enemies.pickAt(p.worldX, p.worldY);
    if (e) this.pressEnemy(e);                        // 적: 다가가서 단검으로 친다 (5.9)
    else if (o && o.node) this.pressNode(o);               // 나무, 돌, 그루터기, 돌 부스러기
    else if (o && o.type === 'tent') this.pressTent(o);
    else if (o && o.type === 'fence') this.walkTo(o.col, o.row);   // 울타리를 누른 것은 그 울타리 칸(땅)을 누른 것과 같다.
    else if (!o) this.walkTo(t.col, t.row);           // 땅
    // 덤불, 모닥불은 눌러도 아무 일이 없다. 울타리 칸도 지금은 지나갈 수 없는 칸이라 아무 일이 없다.
  }

  // 마우스를 움직일 때(터치는 누르고 있는 동안)의 위치는 짓기 표시에만 쓴다
  onMove(p) {
    if (!this.build.building || (p.wasTouch && !p.isDown)) return;
    this.hovering = true;
    this.build.point(p.worldX, p.worldY);
  }

  // 클릭하거나 손을 뗐을 때: 짓기 상태면 그 칸에 짓는다
  onRelease(p) {
    if (this.pressing && this.build.mode) this.build.commit(p.worldX, p.worldY);
    this.pressing = false;
    if (p.wasTouch) this.pointerLeft();               // 터치는 손을 떼면 표시도 사라진다
  }

  // 포인터가 월드를 벗어났다(UI 위로 갔거나, 화면 밖으로 나갔거나, 손을 뗐다)
  pointerLeft() {
    this.pressing = false;
    this.hovering = false;
    this.build.hideMarks();
  }

  // 땅을 누르면 그 칸으로 걸어간다. 갈 수 없는 칸이면 아무 일도 일어나지 않는다.
  walkTo(col, row) {
    if (this.player.goTo(col, row)) this.showCursor(col, row);
  }

  // 캐릭터(주인공과 적)가 몸을 걸치고 있는 칸들(Walker.occupiedTiles). 여기에는 시설을 지을 수 없다.
  // 주인공이 텐트 안에 있는 동안에는 들어갔던 칸이다.
  characterTiles() { return [...this.player.occupiedTiles(), ...this.enemies.occupiedTiles()]; }

  // 시설이 생기거나 없어졌다: 걷던 길을 다시 본다
  onMapChanged() {
    this.player.onMapChanged();
    this.enemies.onMapChanged();
  }

  // 적을 눌렀다(또는 가만히 서 있는데 적이 붙었다): 붙은 칸으로 가서 단검으로 친다 (5.9)
  pressEnemy(e) {
    this.player.act({
      target: e,
      chase: true,                                    // 적이 움직이면 쫓아간다
      tool: () => bestTool(this.tools, 'enemy'),
      isValid: () => e.alive,
      strike: (tool) => { if (e.alive && this.player.isNextTo(e.tiles)) e.hurt(CONFIG.tools[tool].power.enemy); },
    });
  }

  // 좀비에게 맞았다: 하트가 줄고 주인공이 번쩍인다. 0이 되면 쓰러진다.
  hurtPlayer(n) {
    if (this.rest.resting) return;                    // 텐트 안에서는 공격받지 않는다
    if (this.hearts.value <= 0) return;               // 이미 쓰러졌다(같은 프레임에 여러 마리가 때린 경우)
    this.hearts.damage(n);
    this.effects.flash(this.player.sprite);
    if (this.hearts.value <= 0) this.stopGame('down');
  }

  // "쓰러졌습니다" 창이나 첫 아침의 결과 창을 띄우고, 떠 있는 동안 게임 시간을 멈춘다
  stopGame(kind) {
    this.scene.pause();
    if (kind === 'down') {
      this.events.emit('down');
    } else {
      this.events.emit('result', { defeated: this.enemies.defeated, fences: this.build.count('fence'), hearts: this.nightEndHearts });
    }
  }

  // 결과 창의 "계속하기"
  resumeGame() { this.scene.resume(); }

  // 나무, 돌, 그루터기, 돌 부스러기를 눌렀다: 붙은 칸까지 걸어가서 도구로 친다 (5.2)
  pressNode(o) {
    if (!this.nodes.toolFor(o)) {                     // 곡괭이가 없다
      this.notice(this.nodes.needText(o));
      return;
    }
    const node = o.node;
    this.player.act({
      target: o,
      stepOff: !o.blocks,                             // 그루터기 위에 서 있으면 옆으로 비켜서서 판다
      tool: () => this.nodes.toolFor(o),              // 휘두를 때마다 고른다(도중에 도끼를 만들면 바로 도끼로)
      isValid: () => o.node === node,                 // 다 캐면(그루터기가 되어도) 멈춘다
      strike: (tool) => this.nodes.hit(o, tool),
    });
  }

  // 텐트를 눌렀다: 붙은 칸까지 걸어가서 들어간다 (5.6)
  pressTent(tent) {
    this.player.act({
      target: tent,
      isValid: () => this.map.structures.includes(tent),
      arrive: () => this.rest.enter(tent),
    });
  }

  showCursor(col, row) {
    const w = tileToWorld(col, row);
    this.cursor.setPosition(w.x, w.y).setVisible(true);
    this.cursorLeft = CONFIG.input.cursorTime;
  }

  notice(text) { this.events.emit('notice', text); }

  // 장비 칸에 보이는 것: 단검, 티셔츠(효과 없음), 만든 도구
  equipment() { return ['dagger', 'tshirt', ...this.tools.slice(1)]; }

  // ── 만들기 (5.3) ──
  // 카드의 상태: 'owned'(이미 가진 도구, 이미 지은 텐트) | 'lack'(재료가 모자람) | 'ok'
  cardState(card) {
    if (card.type === 'tool' && this.tools.includes(card.id)) return 'owned';
    if (card.type === 'build' && this.build.atMax(card.id)) return 'owned';
    return this.inventory.has(cardCost(card)) ? 'ok' : 'lack';
  }

  // 만들기 창에서 카드를 눌렀다
  pressCard(card) {
    const state = this.cardState(card);
    if (state === 'owned') return;
    if (state === 'lack') {
      this.notice('재료가 부족합니다');
      return;
    }
    if (card.type === 'tool') this.craftTool(card);
    else this.build.setMode(card.id);                 // 시설 카드, 치우기: 다른 카드를 고르거나 창을 닫을 때까지 유지된다
  }

  // 도구는 누르면 바로 만들어진다
  craftTool(card) {
    if (!this.inventory.pay(cardCost(card))) return;
    this.tools.push(card.id);
    this.events.emit('tools-changed');
    const name = cardName(card);
    this.notice(`${name}${objectParticle(name)} 만들었습니다`);
    this.todo.check(card.id);
    // 짓던 시설의 재료가 모자라게 됐으면 짓기 상태를 푼다
    if (this.build.building && !this.build.canAfford(this.build.mode)) this.build.setMode(null);
  }

  // 시설을 하나 지었다: 할 일 목록 (5.11)
  onBuilt(s) {
    if (s.type === 'campfire' || s.type === 'tent') this.todo.check(s.type);
    if (this.build.count('fence') >= CONFIG.todo.fenceCount) this.todo.check('fence');
  }

  // ── 낮과 밤 ──

  // 아침 (5.10): 남은 적이 사라지고, 하트가 2 차고, 남아 있는 시설의 체력이 가득 찬다.
  // 첫 밤을 넘긴 아침에는 화면이 다 밝아진 뒤 결과 창을 띄운다. 그 뒤의 아침에는 알림만.
  onMorning(day) {
    this.enemies.clearAll();
    this.nightEndHearts = this.hearts.value;          // 결과 창의 "남은 하트": 밤을 넘긴 때의 하트(아침에 차기 전)
    this.hearts.heal(CONFIG.player.morningHeal);
    this.build.repairAll();
    this.todo.check('morning');
    if (day === 2) this.resultPending = true;
    else this.notice(`${day}일째 아침입니다`);
  }

  // 텐트에서 range 칸 안에 적이 있는가
  enemyNear(tent, range) { return this.enemies.near(tent, range); }

  // 밤의 빛 (3.7): 월드 좌표의 빛 목록 { x, y, radius, color, alpha }. UIScene 이 빛 지도에 그린다.
  lightSources() {
    const out = [];
    const t = this.elapsed;
    for (const s of this.map.structures) {
      if (s.type !== 'campfire') continue;
      const L = s.cfg.light, flame = this.map.assets.build_campfire.flame;
      const phase = s.col + s.row;                    // 모닥불마다 일렁임이 조금씩 다르게
      const flicker = 1 + L.flicker * (Math.sin(t * L.flickerRates[0] + phase) + Math.sin(t * L.flickerRates[1] + 2 * phase)) / 2;
      out.push({ x: s.sprite.x + flame[0], y: s.sprite.y + flame[1], radius: L.radius * flicker, color: L.color, alpha: L.alpha });
    }
    if (this.rest.resting) {                          // 주인공이 들어가 있는 텐트: 문 앞이 밝다
      const s = this.rest.tent, L = s.cfg.light, door = this.map.assets.build_tent.door;
      out.push({ x: s.sprite.x + door[0], y: s.sprite.y + door[1], radius: L.radius, color: L.color, alpha: L.alpha });
    } else {                                          // 주인공 둘레의 옅은 빛
      const L = CONFIG.player.light, sp = this.player.sprite;
      out.push({ x: sp.x, y: sp.y - L.lift, radius: L.radius, color: L.color, alpha: L.alpha });
    }
    return out;
  }

  // ── 시험용 도구 (8장) ──
  debugGive() {
    this.inventory.add('wood', CONFIG.ui.debug.giveAmount);
    this.inventory.add('stone', CONFIG.ui.debug.giveAmount);
  }

  debugNight() { if (!this.clock.isNight && !this.resultPending) this.clock.startNight(); }   // 결과 창을 기다리는 동안은 넘기지 않는다
  debugMorning() { if (this.clock.isNight) this.clock.startMorning(); }
  debugZombie() { this.enemies.spawn(); }

  debugToggleSpeed() {
    this.debugSpeed = this.debugSpeed === 1 ? CONFIG.ui.debug.fastSpeed : 1;
    this.events.emit('speed-changed');
  }

  update(time, delta) {
    // 게임 시간의 빠르기: 시험용 속도 × (텐트에서 자는 동안 sleepTimeScale. 텐트 둘레에 적이 오면 원래대로)
    const T = CONFIG.build.tent;
    const sleeping = this.rest.resting && !this.enemyNear(this.rest.tent, T.wakeRange);
    const speed = this.debugSpeed * (sleeping ? T.sleepTimeScale : 1);
    if (speed !== this.speed) {
      this.speed = speed;
      this.anims.globalTimeScale = speed;             // 걷는 그림, 모닥불 그림도 같은 빠르기로
    }
    const dt = Math.min(delta / 1000, CONFIG.screen.maxFrameTime) * this.speed;
    this.elapsed += dt;

    this.clock.update(dt);
    this.rest.update(dt);
    this.player.update(dt);
    this.enemies.update(dt);
    // 가만히 서 있을 때 붙은 칸에 적이 오면 자동으로 공격한다 (5.9)
    const pl = this.player;
    if (!this.rest.resting && !pl.moving && !pl.action && !pl.swing) {
      const e = this.enemies.nextTo(pl.tile);
      if (e) this.pressEnemy(e);
    }
    this.effects.update(dt);
    this.build.updateGlow(this.clock.ambient().strength);
    // 짓기 표시는 포인터를 따라간다. 주인공이 걸으면 카메라가 움직이므로 프레임마다 다시 잡는다.
    if (this.hovering && this.build.building) {
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      this.build.point(p.worldX, p.worldY);
    }
    const chars = this.enemies.sprites();
    if (this.player.sprite.visible) chars.push(this.player.sprite);
    this.map.updateOcclusion(chars, dt);
    if (this.cursorLeft > 0) {
      this.cursorLeft -= dt;
      if (this.cursorLeft <= 0) this.cursor.setVisible(false);
    }
    // 첫 아침: 화면이 낮으로 다 돌아오면 결과 창
    if (this.resultPending && this.clock.dawn <= 0 && this.scene.isActive()) {
      this.resultPending = false;
      this.stopGame('result');
    }
  }
}
