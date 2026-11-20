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
import { PirateSystem } from '../systems/PirateSystem.js';
import { TowerSystem, isTower } from '../systems/TowerSystem.js';
import { Shots } from '../systems/Shots.js';
import { Sound } from '../systems/Sound.js';
import { bestTool, cardCost, cardName, objectParticle } from '../systems/Crafting.js';
import { TODO_ITEMS2 } from '../systems/Todo.js';

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
    this.dt = 0;                                      // 이번 프레임에 흐르는 게임 시간(초)
    this.frame = 0;                                   // 프레임 번호(효과와 그림의 시간을 언제부터 셀지 정할 때 쓴다)
    this.updating = false;                            // 프레임을 돌리는 중인가(아니면 프레임 사이: 누르기 등)
    this.elapsed = 0;                                 // 흐른 게임 시간(초). 모닥불 빛이 일렁이는 데 쓴다.
    this.stage = 1;                                   // 1단계, 2단계(첫 밤의 결과 창에서 "계속하기" 뒤, 11.1), 3단계(2단계의 할 일을 모두 마친 뒤. 사용자와 정함)
    this.ironMined = 0;                               // (2단계) 캔 철광석 수(할 일 1번)

    this.sfx = new Sound(this);                       // 효과음 (15장)
    this.groanLeft = this.nextGroan();                // 밤 동안 좀비 신음까지 남은 시간(초)
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
    this.shots = new Shots(this);                     // (2단계) 날아가는 화살·총알, 총구 불꽃과 빛
    this.towers = new TowerSystem(this);              // (2단계) 망루와 총 타워 (11.5)
    this.build = new BuildSystem(this);
    this.rest = new RestSystem(this);
    this.enemies = new EnemySystem(this);
    this.pirates = new PirateSystem(this);           // 해적선, 보트, 해적의 상륙 (5.12)
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
    this.events.on('todo-changed', () => this.checkStage3());
    // 소리 (15.3): 저녁, 밤, 아침. 배경 소리는 저녁과 아침에 낮·밤을 서로 바꿔 튼다
    this.events.on('dusk', () => { this.notice('곧 밤이 됩니다'); this.sfx.play('dusk'); this.setAmbience(true); });
    this.events.on('night', () => { this.notice('밤이 되었습니다'); this.sfx.play('night_start'); this.setAmbience(true); });
    this.setAmbience(false);
    this.events.on('morning', (day) => this.onMorning(day));
    // 프레임마다 맨 먼저(그림의 애니메이션이 움직이기 전에) 게임 시간을 정한다
    this.events.on('preupdate', (time, delta) => this.beforeUpdate(delta));
    this.events.on('postupdate', () => { this.updating = false; });

    this.scene.launch('ui');
  }

  // 게임 시간의 빠르기: 시험용 속도 × (텐트에서 자는 동안 sleepTimeScale. 텐트 둘레에 적이 오면 원래대로).
  // 한 프레임은 maxFrameTime 까지만 흐른다. 캐릭터와 효과의 애니메이션, 조각도 이 게임 시간으로 흐르게 한다(12.1).
  beforeUpdate(delta) {
    this.frame += 1;
    this.updating = true;
    const T = CONFIG.build.tent;
    const sleeping = this.rest.resting && !this.enemyNear(this.rest.tent, T.wakeRange);
    this.speed = this.debugSpeed * (sleeping ? T.sleepTimeScale : 1);
    const real = delta / 1000;
    this.dt = Math.min(real, CONFIG.screen.maxFrameTime) * this.speed;
    const scale = real > 0 ? this.dt / real : this.speed;
    this.anims.globalTimeScale = scale;
    this.effects.setTimeScale(scale);
  }

  // 한 번 누르기(마우스 클릭 = 터치). 화면 UI를 누른 것은 여기로 오지 않는다.
  // 우선순위: 적 -> 사물·시설 -> 땅 (3.5)
  onPress(p) {
    if (!p.wasTouch && p.button !== 0) return;        // 마우스는 왼쪽 버튼만
    if (this.player.downed) return;                   // 쓰러진 뒤 창이 뜨기까지는 누를 수 없다
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
    if (e) this.pressEnemy(e);                        // 적: 다가가서 단검으로 친다 (5.9). 총이 있으면 멀리서 쏜다 (11.6)
    else if (o && o.kind === 'iron' && this.stage < 2) this.error('아직 캘 수 없습니다');   // 철광석은 2단계부터 캔다 (4장, 11.2)
    else if (o && o.node) this.pressNode(o);               // 나무, 돌, 철광석, 그루터기, 돌 부스러기
    else if (o && o.type === 'tent') this.pressTent(o);
    else if (o && isTower(o.type)) this.build.showRange(o, o.type, CONFIG.tower.rangeShowTime);   // 지은 탑: 사거리 원 2초 (11.5)
    else if (o && (o.type === 'fence' || o.type === 'wire' || o.type === 'gate')) this.walkTo(o.col, o.row);   // 울타리·철조망을 누른 것은 그 칸(땅)을 누른 것과 같다(철조망 칸은 걸어갈 수 있다).
    else if (!o) this.walkTo(t.col, t.row);           // 땅
    // 덤불, 모닥불은 눌러도 아무 일이 없다. 울타리 칸은 지나갈 수 없는 칸이라 아무 일이 없다.
  }

  // 마우스를 움직일 때(터치는 누르고 있는 동안)의 위치는 짓기 표시에만 쓴다
  onMove(p) {
    if (!this.build.building || (p.wasTouch && !p.isDown)) return;
    this.hovering = true;
    this.build.point(p.worldX, p.worldY);
  }

  // 클릭하거나 손을 뗐을 때: 짓기 상태면 그 칸에 짓는다
  onRelease(p) {
    if (this.pressing && this.build.mode && !this.player.downed) this.build.commit(p.worldX, p.worldY);
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

  get hasGun() { return this.tools.includes('gun'); }

  // 적을 눌렀다(또는 가만히 서 있는데 적이 붙었다): 붙은 칸으로 가서 단검으로 친다 (5.9)
  // (2단계) 총이 있으면 사거리 안이면 그 자리에서, 밖이면 사거리 안까지 걸어가서 쏜다 (11.6)
  // 땅에서 올라오는 중인 좀비는 다 올라올 때까지 옆(총이면 사거리 안)에서 기다린다(그동안은 맞지 않는다, 12.3).
  // auto: 가만히 서 있다가 저절로 쏘는 것. 그 적이 사거리를 벗어나도 쫓아가지 않는다(다음 프레임에 사거리 안의 다른 적을 고른다).
  pressEnemy(e, auto = false) {
    const G = CONFIG.tools.gun;
    this.player.act({
      target: e,
      chase: !(auto && this.hasGun),                  // 적이 움직이면 쫓아간다(총으로 저절로 쏘는 것은 그 자리에서만)
      ranged: this.hasGun ? G.range : 0,
      tool: () => (this.hasGun ? 'gun' : bestTool(this.tools, 'enemy')),
      isValid: () => e.alive,
      wait: () => e.rising,
      strike: (tool) => {
        if (!e.alive || e.rising) return false;
        if (tool === 'gun') {
          if (!this.player.inRange(e, G.range)) return false;
          this.shootEnemy(e);
          return true;
        }
        if (!this.player.isNextTo(e.tiles)) return false;
        e.hurt(CONFIG.tools[tool].power.enemy, this.player);
        return true;
      },
    });
  }

  // 주인공이 총을 쐈다 (11.6, 12.8): 총구 불꽃과 연기, 빛, 총알. 총알은 적을 따라가 반드시 맞는다(피해 damage).
  shootEnemy(e) {
    const G = CONFIG.tools.gun, m = this.player.muzzle(), pl = this.player;
    this.shots.muzzle(m.x, m.y, { flip: m.flip });
    this.sfx.play('gun_shot', { at: m });
    this.shots.homing('bullet', { x: m.x, y: m.y }, e, G.bulletSpeed, () => e.hurt(G.damage, pl));
  }

  // 적(from)에게 맞았다: 하트가 줄고 타격감(12.4). 0이 되면 쓰러진다(down 을 보여 주고 downDelay 초 뒤에 창).
  // 들어갔으면 true.
  hurtPlayer(n, from) {
    if (this.rest.resting) return false;              // 텐트 안에서는 공격받지 않는다
    if (this.player.downed) return false;             // 이미 쓰러졌다(같은 프레임에 여러 마리가 때린 경우도)
    this.hearts.damage(n);
    const down = this.hearts.value <= 0;
    this.player.struck(from, down);
    if (down) this.player.goDown();
    return true;
  }

  // 하트가 찼을 때 (12.6): 주인공의 가슴(텐트 안이면 텐트 문)에서 하트 조각이 천천히 오른다
  heartsUp() {
    const F = CONFIG.fx;
    this.sfx.play('heal');
    let x, y;
    if (this.rest.resting) {
      const s = this.rest.tent, door = this.map.assets.build_tent.door;
      x = s.sprite.x + door[0];
      y = s.sprite.y + door[1];
    } else {
      const w = this.player.foot();
      x = w.x;
      y = w.y - F.impactHeight.char;
    }
    this.effects.burst(['heart'], F.chips.hearts, x, y, 'hearts');
  }

  // "쓰러졌습니다" 창이나 첫 아침의 결과 창을 띄우고, 떠 있는 동안 게임 시간을 멈춘다
  stopGame(kind) {
    this.scene.pause();
    this.sfx.play(kind === 'down' ? 'game_over' : 'victory');
    if (kind === 'down') {
      this.events.emit('down');
    } else {
      this.events.emit('result', { defeated: this.enemies.defeated, fences: this.build.count('fence'), hearts: this.nightEndHearts });
    }
  }

  // 결과 창의 "계속하기"
  // 첫 아침의 결과 창에서 "계속하기"를 누르면 2단계가 시작된다(11.1)
  resumeGame() {
    if (this.stage < 2) this.startStage2();
    this.scene.resume();
  }

  // 2단계: 할 일 목록이 바뀌고, 가방에 철광석, 만들기 창이 두 줄이 되고, 철광석을 캘 수 있다
  startStage2() {
    this.stage = 2;
    this.events.emit('stage-changed');
    this.checkStage2();
  }

  // 2단계의 할 일 중 지금 상태로 정해지는 것(철광석 수, 철조망 수)
  checkStage2() {
    if (this.stage < 2) return;
    if (this.ironMined >= CONFIG.todo2.iron) this.todo.check('iron');
    if (this.build.count('wire') >= CONFIG.todo2.wire) this.todo.check('wire');
  }

  // (3단계) 2단계의 할 일을 모두 마치면 할 일 목록이 3단계로 바뀐다(사용자와 정함). 그때 이미 지은 문이 있으면 "문 달기"를 체크
  checkStage3() {
    if (this.stage !== 2 || !TODO_ITEMS2.every((t) => this.todo.isDone(t.id))) return;
    this.stage = 3;
    this.events.emit('stage-changed');
    if (this.build.count('gate') > 0) this.todo.check('gate');
  }

  onIronMined(n) {
    this.ironMined += n;
    this.checkStage2();
  }

  // 나무, 돌, 그루터기, 돌 부스러기를 눌렀다: 붙은 칸까지 걸어가서 도구로 친다 (5.2)
  pressNode(o) {
    if (!this.nodes.toolFor(o)) {                     // 곡괭이가 없다
      this.error(this.nodes.needText(o));
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
  // 할 수 없는 일을 눌렀다: 알림과 ui_error (15.3)
  error(text) {
    this.notice(text);
    this.sfx.play('ui_error');
  }

  // 배경 소리 (15.3): 낮 amb_day, 저녁부터 아침까지 amb_night. loopFade 초에 걸쳐 서로 바꾼다.
  setAmbience(night) {
    const v = CONFIG.sound.ambience;
    this.sfx.loop('amb_day', night ? 0 : v);
    this.sfx.loop('amb_night', night ? v : 0);
  }

  nextGroan() { const [a, b] = CONFIG.sound.groanEvery; return a + Math.random() * (b - a); }

  // 매 프레임 소리: 모닥불 곁(가장 가까운 모닥불까지의 거리), 밤 동안의 좀비 신음, 반복 소리 시작
  updateSound(dt) {
    const F = CONFIG.sound.fire, p = this.player;
    let d = Infinity;
    for (const s of this.map.structures) if (s.type === 'campfire') d = Math.min(d, Math.hypot(s.col - p.col, s.row - p.row));
    const v = d <= F.near ? F.volume : d >= F.far ? 0 : F.volume * (F.far - d) / (F.far - F.near);
    if (d < Infinity || this.sfx.loops.fire_loop) this.sfx.loop('fire_loop', v, false);
    if (this.clock.isNight) {
      if ((this.groanLeft -= dt) <= 0) {
        this.groanLeft = this.nextGroan();
        const zs = this.enemies.list.filter((e) => e.kind === 'zombie' && !e.rising);
        if (zs.length) this.sfx.play('zombie_groan', { at: zs[Math.floor(Math.random() * zs.length)].foot() });
      }
    }
    this.sfx.update(this.speed > 0 ? dt / this.speed : 0);
  }

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
    if (state === 'lack') {
      this.error('재료가 부족합니다');
      return;
    }
    this.sfx.play('ui_click');
    if (state === 'owned') return;
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
    this.sfx.play('craft');
    this.todo.check(card.id);
    // 짓던 시설의 재료가 모자라게 됐으면 짓기 상태를 푼다
    if (this.build.building && !this.build.canAfford(this.build.mode)) this.build.setMode(null);
  }

  // 시설을 하나 지었다: 할 일 목록 (5.11)
  onBuilt(s) {
    if (s.type === 'campfire' || s.type === 'tent') this.todo.check(s.type);
    if (isTower(s.type)) this.todo.check(s.type);    // (2단계) 할 일 3번 망루 세우기, 4번 총 타워 세우기
    if (s.type === 'gate' && this.stage >= 3) this.todo.check('gate');   // (3단계) 문 달기
    if (this.build.count('fence') >= CONFIG.todo.fenceCount) this.todo.check('fence');
    this.checkStage2();
  }

  // ── 낮과 밤 ──

  // 아침 (5.10): 남은 적이 사라지고, 하트가 2 차고, 남아 있는 시설의 체력이 가득 찬다.
  // 첫 밤을 넘긴 아침에는 화면이 다 밝아진 뒤 결과 창을 띄운다. 그 뒤의 아침에는 알림만.
  onMorning(day) {
    this.enemies.clearAll();
    this.shots.clearHostile();                        // 총잡이가 쏘고 날던 총알도
    this.nightEndHearts = this.hearts.value;          // 결과 창의 "남은 하트": 밤을 넘긴 때의 하트(아침에 차기 전)
    if (this.hearts.heal(CONFIG.player.morningHeal)) this.heartsUp();
    this.sfx.play('morning');
    this.setAmbience(false);
    this.build.repairAll();
    this.todo.check(this.stage >= 2 ? 'night' : 'morning');   // 2단계는 "밤을 넘기기"
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
    out.push(...this.pirates.lights());               // 해적선 등불
    out.push(...this.towers.lights());                // (2단계) 탑 등불
    out.push(...this.shots.lights());                 // (2단계) 총을 쏜 순간의 빛
    return out;
  }

  // ── 시험용 도구 (8장) ──
  // 나무, 돌 +20. 2단계에서는 철광석도(11.8)
  debugGive() {
    this.inventory.add('wood', CONFIG.ui.debug.giveAmount);
    this.inventory.add('stone', CONFIG.ui.debug.giveAmount);
    if (this.stage >= 2) this.inventory.add('iron', CONFIG.ui.debug.giveAmount);
  }

  // 결과 창을 기다리는 동안과 쓰러진 뒤에는 넘기지 않는다
  debugNight() { if (!this.clock.isNight && !this.resultPending && !this.player.downed) this.clock.startNight(); }
  debugMorning() { if (this.clock.isNight && !this.player.downed) this.clock.startMorning(); }
  debugZombie() { this.enemies.spawn(); }
  // (2단계) 해적 부르기: 밤에만. 해적선과 해적이 바로 나온다 (11.8)
  debugPirates() { if (this.clock.isNight && !this.player.downed) this.pirates.callNow(); }

  debugToggleSpeed() {
    this.debugSpeed = this.debugSpeed === 1 ? CONFIG.ui.debug.fastSpeed : 1;
    this.events.emit('speed-changed');
  }

  update() {
    const dt = this.dt;                               // beforeUpdate 에서 정한 게임 시간
    this.elapsed += dt;

    if (!this.player.downed) this.clock.update(dt);  // 쓰러진 뒤 창이 뜨기까지 1초 동안 시계는 멈춘다(그사이에 아침이 오지 않게)
    this.rest.update(dt);
    this.player.update(dt);
    this.enemies.update(dt);
    this.pirates.update(dt);
    this.towers.update(dt);
    this.shots.update(dt);
    this.build.update(dt);
    const pl = this.player;
    // 쓰러진 뒤 downDelay 초가 지나면 "쓰러졌습니다" 창 (12.3)
    if (pl.downed && pl.downLeft <= 0 && this.scene.isActive()) this.stopGame('down');
    // 가만히 서 있을 때 붙은 칸에 적이 오면 자동으로 공격한다 (5.9). 총이 있으면 사거리 안에서 가장 가까운 적을 쏜다 (11.6)
    if (!this.rest.resting && !pl.downed && !pl.moving && !pl.action && !pl.swing) {
      const e = this.hasGun ? this.enemies.nearestTo(pl.tile, CONFIG.tools.gun.range) : this.enemies.nextTo(pl.tile);
      if (e) this.pressEnemy(e, true);
    }
    this.effects.update(dt);
    this.updateSound(dt);
    this.towers.syncTurrets();                        // 포탑은 받침의 크기(튀어나오기)와 반동을 따라 놓는다
    this.build.updateGlow(this.clock.ambient().strength);
    // 짓기 표시는 포인터를 따라간다. 주인공이 걸으면 카메라가 움직이므로 프레임마다 다시 잡는다.
    if (this.hovering && this.build.building) {
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      this.build.point(p.worldX, p.worldY);
    }
    const chars = [...this.enemies.sprites(), ...this.effects.corpses];   // 쓰러지고 있는 적도 나무 뒤에 있으면 보이게
    if (this.player.sprite.visible) chars.push(this.player.sprite);
    this.map.updateOcclusion(chars, dt);
    if (this.cursorLeft > 0) {
      this.cursorLeft -= dt;
      if (this.cursorLeft <= 0) this.cursor.setVisible(false);
    }
    // 첫 아침: 화면이 낮으로 다 돌아오면 결과 창
    if (this.resultPending && this.clock.dawn <= 0 && this.scene.isActive() && !pl.downed) {
      this.resultPending = false;
      this.stopGame('result');
    }
  }
}
