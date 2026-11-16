import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';
import { MapSystem } from '../systems/MapSystem.js';
import { Player } from '../systems/Player.js';
import { Inventory } from '../systems/Inventory.js';
import { Effects } from '../systems/Effects.js';
import { NodeSystem } from '../systems/NodeSystem.js';
import { Todo } from '../systems/Todo.js';
import { cardCost, cardName, objectParticle } from '../systems/Crafting.js';

// 월드: 섬, 사물, 주인공, 카메라, 누르기. 화면 UI(UIScene)에는 events 로 바뀐 것을 알린다.
//   inventory-changed, tools-changed, todo-changed, notice(글)
export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const manifest = this.cache.json.get('manifest');
    this.mapData = this.cache.json.get('map');
    this.speed = 1;                                   // 게임 시간이 흐르는 빠르기

    this.inventory = new Inventory(this);
    this.tools = ['dagger'];                          // 가진 도구(만든 순서). 단검을 가지고 시작한다.
    this.todo = new Todo(this);
    this.effects = new Effects(this);

    this.map = new MapSystem(this, this.mapData, manifest);
    this.map.build();
    this.nodes = new NodeSystem(this);

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

  // 한 번 누르기(마우스 클릭 = 터치). 화면 UI를 누른 것은 여기로 오지 않는다.
  // 우선순위: 사물 -> 땅 (3.5)
  onPress(p) {
    if (!p.wasTouch && p.button !== 0) return;        // 마우스는 왼쪽 버튼만
    const o = this.map.pickObject(p.worldX, p.worldY);
    if (o) {
      if (o.node) this.pressNode(o);                  // 나무, 돌. 덤불은 장식이라 아무 일도 없다.
      return;
    }
    // 땅을 누르면 그 칸으로 걸어간다. 갈 수 없는 칸이면 아무 일도 일어나지 않는다.
    const t = worldToTile(p.worldX, p.worldY);
    if (this.player.goTo(t.col, t.row)) this.showCursor(t.col, t.row);
  }

  // 나무나 돌을 눌렀다: 붙은 칸까지 걸어가서 도구로 친다 (5.2)
  pressNode(o) {
    if (!this.nodes.toolFor(o)) {                     // 돌인데 곡괭이가 없다
      this.notice(this.nodes.needText(o));
      return;
    }
    this.player.act({
      target: o,
      tool: () => this.nodes.toolFor(o),              // 휘두를 때마다 고른다(도중에 도끼를 만들면 바로 도끼로)
      isValid: () => !!o.node,
      strike: (tool) => this.nodes.hit(o, tool),
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
  // 카드의 상태: 'owned'(이미 가진 도구) | 'lack'(재료가 모자람) | 'ok'
  cardState(card) {
    if (card.type === 'tool' && this.tools.includes(card.id)) return 'owned';
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
    // 시설 카드와 치우기는 Phase 3에서 넣는다.
  }

  // 도구는 누르면 바로 만들어진다
  craftTool(card) {
    if (!this.inventory.pay(cardCost(card))) return;
    this.tools.push(card.id);
    this.events.emit('tools-changed');
    const name = cardName(card);
    this.notice(`${name}${objectParticle(name)} 만들었습니다`);
    this.todo.check(card.id);
  }

  // ── 시험용 도구 (8장) ──
  debugGive() {
    this.inventory.add('wood', CONFIG.ui.debug.giveAmount);
    this.inventory.add('stone', CONFIG.ui.debug.giveAmount);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, CONFIG.screen.maxFrameTime) * this.speed;
    this.player.update(dt);
    this.effects.update(dt);
    this.map.updateOcclusion([this.player.sprite], dt);
    if (this.cursorLeft > 0) {
      this.cursorLeft -= dt;
      if (this.cursorLeft <= 0) this.cursor.setVisible(false);
    }
  }
}
