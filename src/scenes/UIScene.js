import { CONFIG } from '../config.js';
import { cardsFor, cardCost, cardName, DECOR_CARDS, LOOT_CARDS } from '../systems/Crafting.js';
import { todoFor } from '../systems/Todo.js';
import { CROPS } from '../systems/FarmSystem.js';
import { FOODS } from '../systems/HungerSystem.js';

const U = CONFIG.ui;
const INK = Phaser.Display.Color.HexStringToColor(U.ink).color;
const Rect = Phaser.Geom.Rectangle;
// 처음 시작할 때 차례로 보여 주는 알림 (7장)
const INTRO = ['땅을 누르면 이동합니다', '나무를 누르면 다가가서 벱니다', '만들기에서 도구와 캠프를 만들 수 있습니다'];

// 화면 UI와 밤의 빛 지도. 월드(GameScene) 위에 겹쳐 그려지고, 카메라와 상관없이 제자리에 있다.
// 패널과 버튼은 setInteractive 를 해 두어서, 그 위를 누른 것은 월드로 전달되지 않는다.
export class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.world = this.scene.get('game');
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.bagOpen = false;      // (사용자 요청) 가방의 재료 밖 칸(열매, 작물, 씨앗, 버섯, 포자)을 펼쳤는가. 처음은 접힘
    this.makeLightmap();       // 가장 먼저: 월드 위, 다른 UI 아래 (3.7)
    this.makeHearts();
    this.makeSoundButton();
    this.makeHunger();
    this.makeClock();
    this.makeUgTag();
    this.makeTodo();
    this.makeBag();
    this.makeEquipment();
    this.makeCraft();
    this.makeDebug();
    this.makeRest();
    this.makeNotice();

    // 월드에서 바뀐 것을 받아 화면을 고친다
    const listen = (name, fn) => {
      this.world.events.on(name, fn, this);
      this.events.once('shutdown', () => this.world.events.off(name, fn, this));
    };
    listen('inventory-changed', () => { this.refreshBag(); this.refreshCards(); });
    listen('choose-seed', (f) => this.showSeedWindow(f));
    listen('burrow-menu', (b) => this.showBurrowMenu(b));   // (지하 침입) 굴 입구 고치기 (18.2)
    listen('loot-changed', () => this.refreshCards());      // (지하 꾸미기) 전리품의 가진 수 (19.6)
    listen('weather-changed', () => this.refreshWeather());
    // (지하) 만들기 창의 카드가 바뀌고(17.6), 시계 아래에 "지하 1층", 알림은 그 아래로 (17.9)
    listen('ug-changed', (down) => { this.closeSeedWindow(); this.makeCraftWindow(); this.ugTag.setVisible(down); this.placeNotice(); });
    listen('tools-changed', () => { this.refreshEquipment(); if (this.world.stage >= 2) this.makeCraftWindow(); else this.refreshCards(); this.makeRest(); });
    listen('todo-changed', () => this.refreshTodo());
    listen('build-changed', () => { this.refreshCards(); this.refreshHint(); this.drawCraftButton(); });
    listen('structures-changed', () => this.refreshCards());
    listen('hearts-changed', () => this.refreshHearts());
    listen('hunger-changed', () => this.refreshHunger());
    listen('rest-changed', () => { this.closeSeedWindow(); this.makeRest(); this.restBox.setVisible(this.world.rest.resting || !!this.world.home.bed); });
    listen('speed-changed', () => this.refreshDebug());
    listen('stage-changed', () => this.onStage());
    listen('notice', (text, icon) => this.notice(text, false, icon));
    listen('down', () => this.showModal('쓰러졌습니다', [], [['다시 시작', () => this.restart(), true]]));
    listen('result', (r) => this.showModal('첫 밤을 넘겼습니다',
      [['물리친 적', `${r.defeated}마리`], ['남은 울타리', `${r.fences}개`], ['남은 하트', `${r.hearts}칸`]],
      [['계속하기', () => { this.closeModal(); this.world.resumeGame(); }, true], ['다시 시작', () => this.restart()]]));

    // 빛 지도와 시계는 화면을 그리기 직전에 고친다. Phaser는 위에 있는 씬(UI)을 월드보다 먼저 update 하고,
    // 카메라 위치는 그리기 직전에 정해지므로, 여기서 그려야 이번 프레임의 주인공·카메라 위치와 맞는다.
    this.events.on('prerender', () => {
      this.drawLightmap();
      this.refreshClock();
      this.placeBurrowMenu();
      this.refreshUpButton();
    });

    // 포인터가 패널이나 버튼 위로 가면 월드에 알린다(짓기 표시를 숨기고, 거기서 손을 떼도 짓지 않게).
    const overUi = (pointer, over) => { if (over.length) this.world.pointerLeft(); };
    this.input.on('pointermove', overUi);
    this.input.on('pointerup', overUi);

    for (const text of INTRO) this.notice(text, true);
  }

  // ── 그리기 도구 ──

  // 글자. 세로는 가운데를 기준으로 놓는다. opts: { originX, regular(보통 굵기), color }
  label(x, y, str, size, opts = {}) {
    return this.add.text(x, y, str, {
      fontFamily: CONFIG.screen.font, fontSize: size + 'px',
      fontStyle: opts.regular ? 'normal' : 'bold',
      color: opts.color || U.ink,
    }).setOrigin(opts.originX || 0, 0.5);
  }

  // 둥근 사각형. 테두리는 안쪽으로 그린다.
  roundRect(g, x, y, w, h, radius, fill, alpha, border, borderWidth) {
    const half = borderWidth / 2;
    g.fillStyle(fill, alpha).fillRoundedRect(x, y, w, h, radius);
    g.lineStyle(borderWidth, border, 1).strokeRoundedRect(x + half, y + half, w - borderWidth, h - borderWidth, Math.max(1, radius - half));
    return g;
  }

  // 누르는 영역을 정한다(이미 있으면 크기만 바꾼다)
  hitRect(g, x, y, w, h) {
    if (g.input) g.input.hitArea.setTo(x, y, w, h);
    else g.setInteractive(new Rect(x, y, w, h), Rect.Contains);
    return g;
  }

  // 패널 (7장): 바탕 #fbf6ea, 테두리 #4a3d38, 둥근 모서리
  panel(g, x, y, w, h, radius = U.panel.radius) {
    const P = U.panel;
    this.roundRect(g.clear(), x, y, w, h, radius, P.color, P.alpha, P.border, P.borderWidth);
    return this.hitRect(g, x, y, w, h);
  }

  // ── 밤의 빛 지도 (3.7) ──

  // 화면 크기의 그림판. 화면에 곱해진다(MULTIPLY): 화면색 부분은 어두워지고 빛 부분은 원래 색이 살아난다.
  makeLightmap() {
    this.lightmap = this.add.renderTexture(0, 0, this.W, this.H).setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
    this.stamp = this.make.image({ key: 'light_soft', add: false });
  }

  // 매 프레임: 지금 시간의 화면색으로 채우고, 빛마다 light_soft 를 빛 색으로 물들여 그린다. 낮에는 숨긴다.
  drawLightmap() {
    const amb = this.world.ambient();
    if (amb.color === CONFIG.colors.day && amb.strength <= 0) {
      this.lightmap.setVisible(false);
      return;
    }
    const cam = this.world.cameras.main, rt = this.lightmap;
    rt.setVisible(true).fill(amb.color);
    if (amb.strength <= 0) return;
    for (const L of this.world.lightSources()) {
      const size = L.radius * 2 * cam.zoom;
      this.stamp.setTint(L.color).setAlpha(L.alpha * amb.strength).setDisplaySize(size, size);
      // 월드 -> 화면. cam.worldView 는 반올림된 값이라 쓰지 않는다.
      rt.draw(this.stamp, (L.x - cam.midPoint.x) * cam.zoom + cam.width / 2, (L.y - cam.midPoint.y) * cam.zoom + cam.height / 2);
    }
  }

  // ── 왼쪽 위: 하트 ──

  makeHearts() {
    const HT = U.hearts, n = this.world.hearts.max;
    this.panel(this.add.graphics(), U.margin, U.margin, HT.padX * 2 + (n - 1) * HT.step + HT.icon, HT.h);
    this.heartIcons = [];
    for (let i = 0; i < n; i++) {
      this.heartIcons.push(this.add.image(U.margin + HT.padX + HT.icon / 2 + i * HT.step, U.margin + HT.h / 2, 'icon_heart'));
    }
    this.refreshHearts();
  }

  refreshHearts() {
    const v = this.world.hearts.value, size = U.hearts.icon;
    this.heartIcons.forEach((img, i) => img.setTexture(i < v ? 'icon_heart' : 'icon_heart_empty').setDisplaySize(size, size));
  }

  click() { this.world.sfx.play('ui_click'); }

  // ── 하트 칸 아래: 배부름 (16.4). 배고픔을 끄면 없다. 1 이하면 남은 밥그릇이 shakeEvery 초마다 살짝 흔들린다 ──

  makeHunger() {
    const HN = U.hunger, HT = U.hearts, n = this.world.hunger.max, y = U.margin + HT.h + HN.gap;
    if (this.hungerObjs) for (const o of this.hungerObjs) o.destroy();
    if (this.hungerShake) this.hungerShake.remove();
    this.hungerObjs = [];
    this.hungerIcons = [];
    if (!this.world.hunger.enabled) return;
    this.hungerObjs.push(this.panel(this.add.graphics(), U.margin, y, HN.padX * 2 + (n - 1) * HN.step + HN.icon, HN.h));
    for (let i = 0; i < n; i++) {
      const img = this.add.image(U.margin + HN.padX + HN.icon / 2 + i * HN.step, y + HN.h / 2, 'icon_hunger');
      img.baseX = img.x;
      this.hungerIcons.push(img);
      this.hungerObjs.push(img);
    }
    this.hungerShake = this.time.addEvent({ delay: HN.shakeEvery * 1000, loop: true, callback: () => this.shakeHunger() });
    this.refreshHunger();
  }

  refreshHunger() {
    if (!this.hungerIcons) return;
    const v = this.world.hunger.value, size = U.hunger.icon;
    this.hungerIcons.forEach((img, i) => img.setTexture(i < v ? 'icon_hunger' : 'icon_hunger_empty').setDisplaySize(size, size));
  }

  shakeHunger() {
    const v = this.world.hunger.value;
    if (v > 1) return;
    for (const img of this.hungerIcons.slice(0, v)) {
      this.tweens.add({ targets: img, x: { from: img.baseX - U.hunger.shake, to: img.baseX }, duration: 200, ease: 'Sine.easeOut' });
    }
  }

  // ── 하트 칸 오른쪽: 소리 켜고 끄기 (15.1) ──

  makeSoundButton() {
    const HT = U.hearts, S = U.soundButton, r = HT.h / 2;
    const cx = U.margin + HT.padX * 2 + (this.world.hearts.max - 1) * HT.step + HT.icon + S.gap + r, cy = U.margin + r;
    const g = this.add.graphics().fillStyle(U.panel.color, U.panel.alpha).fillCircle(cx, cy, r)
      .lineStyle(U.panel.borderWidth, INK, 1).strokeCircle(cx, cy, r - U.panel.borderWidth / 2);
    g.setInteractive(new Phaser.Geom.Circle(cx, cy, r), Phaser.Geom.Circle.Contains);
    this.soundIcon = this.add.image(cx, cy, 'icon_sound_on').setDisplaySize(S.icon, S.icon);
    const show = () => this.soundIcon.setTexture(this.world.sfx.muted ? 'icon_sound_off' : 'icon_sound_on').setDisplaySize(S.icon, S.icon);
    g.on('pointerdown', () => { this.world.sfx.toggleMute(); show(); this.click(); });
    show();
  }

  // ── 가운데 위: 시계 (5.5) ──

  makeClock() {
    const C = U.clock, cx = this.W / 2, y = U.margin;
    this.panel(this.add.graphics(), cx - C.w / 2, y, C.w, C.h);
    this.clockIcon = this.add.image(cx + C.iconX, y + C.h / 2, 'icon_sun').setDisplaySize(C.icon, C.icon);
    this.clockText = this.label(cx + C.textX, y + C.textY, '', C.font);
    // (날씨) 맑음이 아니면 시계 오른쪽에 비·눈 아이콘 (14.1)
    this.weatherIcon = this.add.image(cx + C.w / 2 + C.weatherGap + C.weatherIcon / 2, y + C.h / 2, 'icon_rain').setVisible(false);
    this.refreshWeather();
    this.clockBar = this.add.graphics();
    this.clockShown = {};    // 지금 그려 둔 것. 바뀔 때만 다시 그린다.
    this.refreshClock();
  }

  // (지하) 시계 아래의 "지하 1층" 표시 (17.9, preview_underground.png). 지하에 있는 동안만
  makeUgTag() {
    const T = U.ugTag, cx = this.W / 2, y = U.margin + U.clock.h + T.gap;
    const text = this.label(0, y + T.h / 2, '지하 1층', T.font);
    const w = T.padX * 2 + T.icon + T.iconGap + text.width, x = cx - w / 2;
    const bg = this.panel(this.add.graphics(), x, y, w, T.h, T.h / 2);
    const icon = this.add.image(x + T.padX + T.icon / 2, y + T.h / 2, 'icon_underground').setDisplaySize(T.icon, T.icon);
    text.setX(x + T.padX + T.icon + T.iconGap);
    this.ugTag = this.add.container(0, 0, [bg, icon, text]).setVisible(this.world.ug.active);
  }

  refreshWeather() {
    const key = this.world.weather.icon(), C = U.clock;
    this.weatherIcon.setVisible(!!key);
    if (key) this.weatherIcon.setTexture(key).setDisplaySize(C.weatherIcon, C.weatherIcon);
  }

  refreshClock() {
    const C = U.clock, clock = this.world.clock, s = this.clockShown;
    const label = clock.label, night = clock.isNight, w = Math.round(C.barW * clock.progress);
    if (s.label === label && s.night === night && s.w === w) return;
    Object.assign(s, { label, night, w });
    this.clockText.setText(label);
    this.clockIcon.setTexture(night ? 'icon_moon' : 'icon_sun').setDisplaySize(C.icon, C.icon);
    const x = this.W / 2 + C.barX, y = U.margin + C.barY, r = C.barH / 2;
    const g = this.clockBar.clear();
    g.fillStyle(C.track, 1).fillRoundedRect(x, y, C.barW, C.barH, r);
    if (w > 0) g.fillStyle(night ? C.nightFill : C.dayFill, 1).fillRoundedRect(x, y, Math.max(w, C.barH), C.barH, r);
  }

  // ── 오른쪽 위: 할 일 (5.11) ──

  // 1단계와 2단계(11.1)의 목록. 2단계가 되면 다시 만든다(줄 수는 둘 다 6줄).
  makeTodo() {
    const T = U.todo, items = todoFor(this.world.stage);
    const x = this.W - U.margin - T.w, y = U.margin;
    if (this.todoObjs) for (const o of this.todoObjs) o.destroy();
    this.todoItems = items;
    this.todoPos = { x, y, h: T.padTop + items.length * T.lineHeight + T.padBottom };
    const bg = this.panel(this.add.graphics(), x, y, T.w, this.todoPos.h);
    const title = this.label(x + T.titleX, y + T.titleY, '할 일', T.titleFont);
    this.todoBoxes = this.add.graphics();
    this.todoLabels = items.map((item, i) =>
      this.label(x + T.textX, y + T.padTop + i * T.lineHeight + T.textY, item.label, T.font, { regular: true }));
    this.todoObjs = [bg, title, this.todoBoxes, ...this.todoLabels];
    this.refreshTodo();
  }

  refreshTodo() {
    const T = U.todo, g = this.todoBoxes.clear(), k = T.boxSize / 22;
    this.todoItems.forEach((item, i) => {
      const done = this.world.todo.isDone(item.id);
      const bx = this.todoPos.x + T.boxX, by = this.todoPos.y + T.padTop + i * T.lineHeight + T.boxY;
      this.roundRect(g, bx, by, T.boxSize, T.boxSize, T.boxRadius, done ? U.green : U.cardColor, 1, INK, T.boxBorder);
      if (done) {   // 체크 표시
        g.lineStyle(3 * k, 0xffffff, 1).beginPath();
        g.moveTo(bx + 4 * k, by + 11 * k).lineTo(bx + 9 * k, by + 17 * k).lineTo(bx + 19 * k, by + 5 * k);
        g.strokePath();
      }
      this.todoLabels[i].setColor(done ? U.dimInk : U.ink);   // 체크된 줄은 흐린 글자색
    });
  }

  // ── 왼쪽 아래: 가방과 장비 ──

  // 가방의 칸 수와 크기: 1단계는 나무와 돌, 2단계는 철광석까지(11.3)
  // 가방에 있는 것: 재료(1단계 나무·돌, 2단계부터 철광석도), (3단계) 가진 열매·작물·씨앗, (지하) 버섯·포자
  bagItems() { return [...this.bagBase(), ...this.bagExtra()]; }
  bagBase() { return this.world.stage >= 2 ? ['wood', 'stone', 'iron'] : ['wood', 'stone']; }
  bagExtra() { return ['berry', ...CROPS, ...CROPS.map((c) => 'seed_' + c), 'mushroom', 'spore'].filter((it) => this.world.inventory.count(it) > 0); }

  // (사용자 요청: 가방이 길어져 화면을 넘어감) 재료 말고 나머지(열매, 작물, 씨앗, 버섯, 포자)는 가방 끝의 접기 단추로 옆으로 펼치고 접는다.
  // 처음은 접혀 있다. 펼쳐서 만들기 버튼까지 닿으면 넘치는 칸은 위 줄로. 장비 칸과 아래 가운데 버튼도 자리가 없으면 위로 올린다.
  // 돌려주는 것: rows(가방 줄들 { x, y, w, items, tab }), equip { x, y, w }, button(w) -> { x, y }
  bottomLayout() {
    const B = this.world.stage >= 2 ? { ...U.bag, ...U.bag2 } : { ...U.bag }, E = U.equip, T = U.bagTab, C = U.craftButton;
    const base = this.bagBase(), extra = this.bagExtra(), shown = this.bagOpen ? [...base, ...extra] : base;
    const limit = this.W - C.edge - C.size - T.gapToCraft;
    const tabW = extra.length ? T.w : 0, n0 = base.length;
    const width = (k) => B.w + (k - n0) * B.step;           // 칸 k 개인 가방 줄의 폭(재료 칸은 preview 그대로)
    let k0 = shown.length;
    while (k0 > n0 && U.margin + width(k0) + tabW > limit) k0--;
    const yb = this.H - U.margin - B.h;
    const rows = [{ x: U.margin, y: yb, w: width(k0) + tabW, items: shown.slice(0, k0), tab: tabW > 0 }];
    if (k0 < shown.length) rows.push({ x: U.margin, y: yb - B.h - T.rowGap, w: width(shown.length - k0), items: shown.slice(k0), tab: false });
    let top = rows[rows.length - 1].y;
    const ew = E.pad * 2 + this.world.equipment().length * E.slot;
    let equip = { x: U.margin + rows[0].w + E.gap, y: yb, w: ew };
    if (equip.x + ew > limit) { equip = { x: U.margin, y: top - B.h - T.rowGap, w: ew }; top = equip.y; }
    const right = equip.y === yb ? equip.x + ew : U.margin + rows[0].w;
    const button = (w) => {
      const x = Math.max(this.W / 2 - w / 2, right + E.gap);
      return x + w <= limit ? { x, y: this.H - U.margin - U.rest.h } : { x: this.W / 2 - w / 2, y: top - U.rest.h - T.rowGap };
    };
    return { B, rows, equip, button, hidden: this.bagOpen ? 0 : extra.length };
  }

  makeBag() {
    const L = this.bottomLayout(), B = L.B, T = U.bagTab;
    if (this.bagObjs) for (const o of this.bagObjs) o.destroy();
    this.bagObjs = [];
    this.bagCounts = {};
    this.bagKey = [this.bagOpen, ...this.bagItems()].join(',');
    for (const row of L.rows) {
      this.bagObjs.push(this.panel(this.add.graphics(), row.x, row.y, row.w, B.h));
      row.items.forEach((item, i) => {
        const img = this.add.image(row.x + B.iconX[0] + i * B.step, row.y + B.h / 2, 'icon_' + item).setDisplaySize(B.icon, B.icon);
        if (FOODS.includes(item)) img.setInteractive().on('pointerdown', () => this.world.hunger.eat(item));   // 열매와 작물을 누르면 먹는다 (13.3, 16.2)
        this.bagObjs.push(img);
        this.bagCounts[item] = this.label(row.x + B.countX[0] + i * B.step, row.y + B.countY, '0', B.font);
        this.bagObjs.push(this.bagCounts[item]);
      });
      if (!row.tab) continue;
      // 접기 단추: 접혀 있으면 "▸ 숨은 칸 수", 펼쳐져 있으면 "◂"
      const tx = row.x + row.w - T.w, g = this.add.graphics();
      g.fillStyle(INK, T.shade).fillRoundedRect(tx + T.inset, row.y + T.inset, T.w - T.inset * 2, B.h - T.inset * 2, T.radius);
      this.hitRect(g, tx, row.y, T.w, B.h);
      g.on('pointerdown', () => { this.click(); this.bagOpen = !this.bagOpen; this.relayoutBottom(); });
      this.bagTab = g;
      this.bagObjs.push(g, this.label(tx + T.w / 2, row.y + B.h / 2, L.hidden ? '▸' + L.hidden : '◂', T.font, { originX: 0.5 }));
    }
    this.refreshBag(false);
  }

  // 가방, 장비 칸, 아래 가운데 버튼을 다시 놓는다
  relayoutBottom() {
    this.makeBag();
    this.refreshEquipment();
    this.makeRest();
  }

  // 개수를 고친다. 가방의 칸이 바뀌었으면(작물·씨앗이 생기거나 다 떨어졌으면) 가방과 그 옆의 장비 칸, 쉬기 버튼을 다시 놓는다
  refreshBag(check = true) {
    if (check && [this.bagOpen, ...this.bagItems()].join(',') !== this.bagKey) {
      this.relayoutBottom();
      return;
    }
    for (const item of Object.keys(this.bagCounts)) this.bagCounts[item].setText(String(this.world.inventory.count(item)));
  }

  // ── (3단계) "무엇을 심을까요?" 창 (13.3, preview_farm.png): 가진 씨앗만 개수와 함께. 고르면 그 밭에 심으러 간다 ──

  showSeedWindow(field) {
    const S = U.seedWin, farm = this.world.farm, seeds = farm.seeds();
    this.closeSeedWindow();
    if (!seeds.length) return;
    const w = S.pad * 2 + seeds.length * S.cardW + (seeds.length - 1) * S.cardGap, h = S.pad * 2 + S.titleH + S.cardH;
    const x = (this.W - w) / 2, y = this.H - S.bottom - h;
    const parts = [this.panel(this.add.graphics(), 0, 0, w, h)];
    parts.push(this.label(S.pad, S.titleY, '무엇을 심을까요?', S.titleFont));
    const close = this.label(w - S.pad, S.titleY, '닫기 ✕', S.closeFont, { originX: 1, regular: true, color: U.dimInk });
    close.setInteractive().on('pointerdown', () => { this.click(); this.closeSeedWindow(); });
    parts.push(close);
    seeds.forEach((crop, i) => {
      const cx = S.pad + i * (S.cardW + S.cardGap), cy = S.pad + S.titleH;
      const g = this.hitRect(this.add.graphics(), cx, cy, S.cardW, S.cardH);
      this.roundRect(g, cx, cy, S.cardW, S.cardH, U.craft.cardRadius, U.cardColor, 1, INK, U.craft.cardBorder);
      g.on('pointerdown', () => { this.click(); this.closeSeedWindow(); farm.plant(field, crop); });
      parts.push(g, this.add.image(cx + S.cardW / 2, cy + S.iconY, 'icon_seed_' + crop).setDisplaySize(S.icon, S.icon));
      parts.push(this.label(cx + S.cardW / 2, cy + S.nameY, CONFIG.farm.crops[crop].name + ' 씨앗', S.nameFont, { originX: 0.5 }));
      parts.push(this.label(cx + S.cardW / 2, cy + S.countY, this.world.inventory.count('seed_' + crop) + '개', S.countFont, { originX: 0.5, regular: true }));
    });
    this.seedWin = this.add.container(x, y, parts).setDepth(12);
  }

  // ── (지하 침입) 굴 입구 곁의 "고치기 · 나무 2" / "내려가기" 버튼 (18.2). b 가 null 이면 닫는다 ──

  showBurrowMenu(b) {
    if (this.burrowMenu) { this.burrowMenu.destroy(); this.burrowMenu = null; }
    if (!b) return;
    const M = CONFIG.raid.menu, w = this.world, cost = CONFIG.raid.repairCost.wood;
    const parts = [];
    [[`고치기 · 나무 ${cost}`, () => w.raid.repair(b)], ['내려가기', () => w.ug.pressBurrow(b)]].forEach(([text, onPress], i) => {
      const y = i * (M.h + M.gap);
      const g = this.hitRect(this.add.graphics(), -M.w / 2, y, M.w, M.h);
      this.roundRect(g, -M.w / 2, y, M.w, M.h, M.h / 2, i ? U.cardColor : U.yellow, 1, INK, U.panel.borderWidth);
      g.on('pointerdown', () => { this.click(); w.closeBurrowMenu(); onPress(); });
      parts.push(g, this.label(0, y + M.h / 2, text, M.font, { originX: 0.5 }));
    });
    this.burrowMenu = this.add.container(0, 0, parts).setDepth(12);
    this.burrowMenu.target = b;
    this.placeBurrowMenu();
  }

  // 굴 입구의 화면 위치 위에 둔다(카메라가 움직여도 따라간다)
  placeBurrowMenu() {
    const m = this.burrowMenu;
    if (!m) return;
    const b = m.target, cam = this.world.cameras.main, M = CONFIG.raid.menu;
    if (!b.sprite.active) { this.world.closeBurrowMenu(); return; }
    const h = 2 * M.h + M.gap;
    m.setPosition((b.sprite.x - cam.midPoint.x) * cam.zoom + cam.width / 2, (b.sprite.y - M.lift - cam.midPoint.y) * cam.zoom + cam.height / 2 - h);
  }

  closeSeedWindow() {
    if (!this.seedWin) return;
    this.seedWin.destroy();
    this.seedWin = null;
  }

  makeEquipment() {
    this.equipBg = this.add.graphics();
    this.equipIcons = [];
    this.refreshEquipment();
  }

  // 단검, 티셔츠, 만든 도구. 도구가 늘면 칸이 옆으로 늘어난다.
  refreshEquipment() {
    const E = U.equip, L = this.bottomLayout(), B = L.B, { x, y, w } = L.equip;
    const list = this.world.equipment();
    this.panel(this.equipBg, x, y, w, B.h);
    for (const img of this.equipIcons) img.destroy();
    this.equipIcons = list.map((id, i) =>
      this.add.image(x + E.pad + E.slot * (i + 0.5), y + B.h / 2, 'icon_' + id).setDisplaySize(E.icon, E.icon));
  }

  // ── 오른쪽 아래: 만들기 버튼과 창 (5.3) ──

  makeCraft() {
    const C = U.craftButton, K = U.craft;
    const r = C.size / 2;
    const cx = this.W - C.edge - r, cy = this.H - C.edge - r;
    this.craftOpen = false;
    this.craftPos = { cx, cy, r };
    this.craftBtn = this.add.graphics();
    this.craftBtn.setInteractive(new Phaser.Geom.Circle(cx, cy, r), Phaser.Geom.Circle.Contains);
    this.craftBtn.on('pointerdown', () => { this.click(); this.toggleCraft(); });
    this.drawCraftButton();
    this.craftIcons = [this.add.image(cx, cy + C.iconY, 'icon_craft').setDisplaySize(C.icon, C.icon),
      this.label(cx, cy + C.textY, '만들기', C.font, { originX: 0.5 })];
    this.makeCraftWindow();
  }

  // 창: 버튼 위로 열린다. 1단계는 카드 6장 한 줄, 2단계는 10장 두 줄(11.3. 아직 만들지 않은 Phase 의 카드 자리는 비워 둔다).
  // (지하 꾸미기) 지하에서는 위에 탭 "만들기" / "꾸미기"(19.1, 19.8). 꾸미기 탭은 윗줄 "재료로 만들기" 8장, 아랫줄 "해적 전리품" 10장
  makeCraftWindow() {
    const { cy, r } = this.craftPos;
    const stage2 = this.world.stage >= 2, under = this.world.ug.active;
    if (!under) this.craftTab = 'make';
    const tab = this.craftTab || 'make', decor = under && tab === 'decor';
    const K = decor ? { ...U.craft, ...U.craft2, ...U.craftDecor } : stage2 ? { ...U.craft, ...U.craft2 } : U.craft;
    const list = cardsFor(this.world.stage, this.world.tools, under, tab), perRow = stage2 || decor ? K.perRow : list.length;
    // 카드의 줄과 칸: 꾸미기 탭은 재료 줄과 전리품 줄
    const place = decor ? list.map((c, i) => (i < DECOR_CARDS.length ? [0, i] : [1, i - DECOR_CARDS.length])) : list.map((c, i) => [Math.floor(i / perRow), i % perRow]);
    const rows = Math.max(...place.map((p) => p[0])) + 1, rowGap = K.rowGap || 0, sec = decor ? K.sectionH : 0;
    const w = K.pad * 2 + perRow * K.cardW + (perRow - 1) * K.cardGap;
    const h = K.pad * 2 + K.titleHeight + rows * (K.cardH + sec) + (rows - 1) * rowGap;
    const visible = this.craftWin ? this.craftWin.visible : false;
    if (this.craftWin) this.craftWin.destroy();
    this.craftK = K;
    this.craftWin = this.add.container(this.W - U.margin - w, cy - r - K.gapToButton - h).setDepth(10).setVisible(visible);
    this.craftWin.add(this.panel(this.add.graphics(), 0, 0, w, h));
    if (under) this.makeCraftTabs(K, tab);
    else this.craftWin.add(this.label(K.pad, K.titleY, '만들기', K.titleFont));
    this.craftWin.add(this.label(w - K.pad, K.titleY, decor ? '흐린 것은 재료나 전리품이 없는 것' : '재료가 모자라면 흐리게 보입니다', K.noteFont, { originX: 1, regular: true, color: U.dimInk }));
    const rowY = (row) => K.pad + K.titleHeight + row * (K.cardH + sec + rowGap) + sec;
    if (decor) ['재료로 만들기', '해적 전리품'].forEach((t, row) => this.craftWin.add(this.label(K.pad, rowY(row) - sec / 2, t, K.sectionFont, { color: U.dimInk })));
    this.cards = [];
    list.forEach((card, i) => {
      if (!card) return;
      const [row, col] = place[i];
      this.cards.push(this.makeCard(card, K.pad + col * (K.cardW + K.cardGap), rowY(row)));
    });
    this.refreshCards();
  }

  // 탭 두 개: 고른 탭은 노랑. 누르면 그 탭의 카드로 다시 만든다(짓던 것은 그대로)
  makeCraftTabs(K, tab) {
    const T = U.craftTabs;
    [['make', '만들기'], ['decor', '꾸미기']].forEach(([id, text], i) => {
      const x = K.pad - T.x + i * (T.w + T.gap), y = T.y;
      const g = this.hitRect(this.add.graphics(), x, y, T.w, T.h);
      this.roundRect(g, x, y, T.w, T.h, T.radius, id === tab ? U.yellow : U.cardColor, 1, INK, U.panel.borderWidth);
      g.on('pointerdown', () => { if (this.craftTab === id) return; this.click(); this.craftTab = id; this.makeCraftWindow(); });
      this.craftWin.add([g, this.label(x + T.w / 2, y + T.h / 2, text, T.font, { originX: 0.5 })]);
    });
  }

  // 2단계가 되었다: 할 일, 가방, 만들기 창, 시험용 도구를 다시 만든다
  onStage() {
    this.makeTodo();
    this.makeBag();
    this.refreshEquipment();
    this.makeRest();
    this.makeCraftWindow();
    this.makeDebugWindow();
    this.makeHunger();
  }

  // 창이 열려 있거나 짓는 중이면 굵은 테두리
  drawCraftButton() {
    const C = U.craftButton, { cx, cy, r } = this.craftPos;
    const b = this.craftOpen || this.world.build.mode ? C.borderOpen : C.border;
    this.craftBtn.clear().fillStyle(U.yellow, 1).fillCircle(cx, cy, r).lineStyle(b, INK, 1).strokeCircle(cx, cy, r - b / 2);
  }

  // 만들기 버튼: 누르면 창이 열리고, 다시 누르면 닫히면서 짓기 상태도 끝난다
  // 2단계의 두 줄 창은 시험용 창과 겹치므로, 2단계에서는 하나를 열면 다른 하나는 닫는다.
  // (사용자 요청) 창을 접은 채 짓는 중이면: 짓기를 그만둔다(창은 열지 않는다. 다시 누르면 열린다)
  toggleCraft() {
    if (!this.craftOpen && this.world.build.mode) { this.world.build.setMode(null); this.drawCraftButton(); return; }
    this.craftOpen = !this.craftOpen;
    this.craftWin.setVisible(this.craftOpen);
    if (this.craftOpen && this.debugWin && this.world.stage >= 2) this.debugWin.setVisible(false);
    this.drawCraftButton();
    if (!this.craftOpen) this.world.build.setMode(null);
  }

  // (사용자 요청) 카드를 골라 짓기·치우기 상태가 되면 만들기 창을 접는다. 짓기 상태는 그대로(안내는 위에 뜬다)
  minimizeCraft() {
    this.craftOpen = false;
    this.craftWin.setVisible(false);
    this.drawCraftButton();
  }

  // 카드 한 장: 아이콘, 이름, 재료(아이콘과 숫자) 또는 글자("보유", "절반 돌려받음")
  makeCard(card, x, y) {
    const K = this.craftK;
    const box = this.add.container(x, y);
    const bg = this.hitRect(this.add.graphics(), 0, 0, K.cardW, K.cardH);
    bg.on('pointerdown', () => {
      this.world.pressCard(card);
      // (사용자 요청) 짓기·치우기·밭 갈기를 고르면 창을 접는다. 긴 양탄자의 방향은 아래 가운데의 "방향 바꾸기" 버튼으로도 바꾼다
      if (this.world.build.mode === card.id) this.minimizeCraft();
    });
    const icon = this.add.image(K.cardW / 2, K.iconY, card.icon).setDisplaySize(K.icon, K.icon);
    const name = this.label(K.cardW / 2, K.nameY, cardName(card), K.nameFont, { originX: 0.5 });
    const status = this.label(K.cardW / 2, K.costY, card.note || '', K.statusFont, { originX: 0.5, regular: true });
    const costParts = [];
    const parts = Object.entries(cardCost(card) || {});
    let px = (K.cardW - (parts.length * K.costStep - K.costTrim)) / 2;
    for (const [item, amount] of parts) {
      costParts.push(this.add.image(px, K.costY, 'icon_' + item).setOrigin(0, 0.5).setDisplaySize(K.costIcon, K.costIcon));
      costParts.push(this.label(px + K.costTextX, K.costY, String(amount), K.costFont));
      px += K.costStep;
    }
    box.add([bg, icon, name, status, ...costParts]);
    this.craftWin.add(box);
    return { card, box, bg, status, costParts, icon };
  }

  // 재료가 모자란 카드와 이미 가진 것의 카드는 흐리게 보인다. 고른 카드는 노란 굵은 테두리.
  refreshCards() {
    const K = this.craftK;
    for (const c of this.cards) {
      const state = this.world.cardState(c.card);
      const selected = this.world.build.mode === c.card.id;
      if (c.costParts.length) {
        for (const part of c.costParts) part.setVisible(state !== 'owned');
        c.status.setText(state === 'owned' ? '보유' : '');
      }
      if (c.card.type === 'loot') c.status.setText('가진 것 ' + (this.world.decor.loot[c.card.id] || 0));   // (지하 꾸미기) 19.8
      if (c.card.id === 'rugRunner') c.icon.setFlipX(this.world.decor.runnerRow);   // row 방향이면 아이콘도 뒤집는다
      c.box.setAlpha(state === 'ok' ? 1 : U.dimAlpha);
      this.roundRect(c.bg.clear(), 0, 0, K.cardW, K.cardH, K.cardRadius, U.cardColor, 1,
        selected ? U.yellow : INK, selected ? K.selectedBorder : K.cardBorder);
    }
  }

  // ── 할 일 아래: 시험용 도구 (8장) ──

  makeDebug() {
    const D = U.debug;
    const bx = this.W - U.margin - D.buttonW, by = this.todoPos.y + this.todoPos.h + D.gap;
    const btn = this.panel(this.add.graphics(), bx, by, D.buttonW, D.buttonH, D.radius);
    btn.on('pointerdown', () => {
      this.click();
      this.debugWin.setVisible(!this.debugWin.visible);
      // 2단계: 만들기 창만 숨긴다. 짓기 상태는 그대로(만들기 버튼을 다시 누르거나 다른 카드를 고를 때까지, 5.4)
      if (this.debugWin.visible && this.craftOpen && this.world.stage >= 2) {
        this.craftOpen = false;
        this.craftWin.setVisible(false);
        this.drawCraftButton();
      }
    });
    this.label(bx + D.buttonW / 2, by + D.buttonH / 2, '시험', D.font, { originX: 0.5 });
    this.debugAt = { x: this.W - U.margin - D.w, y: by + D.buttonH + D.gap };
    this.makeDebugWindow();
  }

  // 시험용 창. 단계가 바뀌면 다시 만든다(2단계에는 "해적 부르기"가 더해진다, 11.8)
  makeDebugWindow() {
    const D = U.debug, open = !!(this.debugWin && this.debugWin.visible);
    if (this.debugWin) this.debugWin.destroy();
    // [글(또는 글을 돌려주는 함수), 누르면 할 일]
    const items = [
      [() => (this.world.stage >= 2 ? `나무, 돌, 철광석 +${D.giveAmount}` : `나무, 돌 +${D.giveAmount}`), () => this.world.debugGive()],
      ['밤으로 넘기기', () => this.world.debugNight()],
      ['아침으로 넘기기', () => this.world.debugMorning()],
      ['좀비 1마리 부르기', () => this.world.debugZombie()],
      ...(this.world.stage >= 2 ? [['해적 부르기', () => this.world.debugPirates()]] : []),
      ...(this.world.stage >= 2 ? [['씨앗 +' + CONFIG.farm.debugSeeds, () => this.world.debugSeeds()], ['작물 다 자라게', () => this.world.debugRipen()], ['동물 모두 친구로', () => this.world.debugPets()]] : []),   // (3단계) 13.5
      [() => `속도 ×${this.world.debugSpeed}`, () => this.world.debugToggleSpeed()],
      ['날씨 바꾸기', () => this.world.debugWeather()],   // 14.4
      ...(this.world.hunger.enabled ? [['배부름 가득', () => this.world.debugHungerFull()], ['배부름 0', () => this.world.debugHungerZero()]] : []),   // 16.4
      ...(this.world.stage >= 2 && this.world.ug.exists ? [['지하로 / 땅 위로', () => this.world.debugUnderground()], ['둘레 5×5 파기', () => this.world.debugDigAround()],
        ['포자 +' + CONFIG.ug.debugSpores, () => this.world.debugSpores()], ['버섯 다 자라게', () => this.world.debugMushrooms()],
        ...(this.world.raid.enabled ? [['해적 습격(지하)', () => this.world.debugRaid()]] : []),
        ['전리품 모두 +1', () => this.world.debugLoot()], ['꾸러미 떨어뜨리기', () => this.world.debugDrop()]] : []),   // 17.10, 18.5, 19.8
      ['닫기', () => this.debugWin.setVisible(false)],
    ];
    // 단추가 많아 만들기 버튼까지 내려오면 단추 높이를 줄여 그 위에 맞춘다
    // 만들기 버튼 위까지. (검사) 1단계는 두 창을 같이 열 수 있으므로 만들기 창 위까지
    const { cy, r } = this.craftPos, bottom = this.world.stage >= 2 ? cy - r : this.craftWin.y, room = bottom - D.gap - this.debugAt.y, n = items.length;
    const itemH = Math.min(D.itemH, Math.floor((room - D.pad * 2 - (n - 1) * D.itemGap) / n));
    const font = Math.min(D.itemFont, Math.round(D.itemFont * itemH / D.itemH));
    const h = D.pad * 2 + n * itemH + (n - 1) * D.itemGap;
    this.debugWin = this.add.container(this.debugAt.x, this.debugAt.y).setDepth(10).setVisible(open);
    this.debugWin.add(this.panel(this.add.graphics(), 0, 0, D.w, h));
    this.debugLabels = [];
    items.forEach(([text, onPress], i) => {
      const y = D.pad + i * (itemH + D.itemGap), w = D.w - D.pad * 2;
      const g = this.hitRect(this.add.graphics(), D.pad, y, w, itemH);
      this.roundRect(g, D.pad, y, w, itemH, D.radius, U.cardColor, 1, INK, U.panel.borderWidth);
      g.on('pointerdown', () => { this.click(); onPress(); });
      const label = this.label(D.w / 2, y + itemH / 2, '', font, { originX: 0.5 });
      this.debugLabels.push({ label, text });
      this.debugWin.add([g, label]);
    });
    this.refreshDebug();
  }

  refreshDebug() {
    for (const d of this.debugLabels) d.label.setText(typeof d.text === 'function' ? d.text() : d.text);
  }

  // ── 아래 가운데: 텐트에서 쉬는 동안의 버튼 (5.6). 누르면 텐트에서 나온다. ──

  // 가운데에 둔다. 다만 장비 칸이 길어지면(2단계는 가방이 넓다) 장비 칸의 오른쪽으로 비켜 둔다(겹치지 않게).
  // 도구가 늘거나 단계가 바뀌면 다시 만든다.
  makeRest() {
    const R = U.rest, E = U.equip;
    const visible = this.restBox ? this.restBox.visible : false;
    if (this.restBox) this.restBox.destroy();
    const bg = this.add.graphics();
    const icon = this.add.image(0, 0, 'icon_sleep').setDisplaySize(R.icon, R.icon);
    const text = this.label(0, 0, this.world.home.bed ? '자는 중 · 누르면 일어납니다' : '쉬는 중 · 누르면 나옵니다', R.font);   // (지하) 침대 (17.7)
    const w = R.padX * 2 + R.icon + R.gap + text.width;
    const { x, y } = this.bottomLayout().button(w);   // (사용자 요청) 자리가 없으면 위로
    this.panel(bg, x, y, w, R.h);
    bg.on('pointerdown', () => { this.click(); this.world.wakeUp(); });
    icon.setPosition(x + R.padX + R.icon / 2, y + R.h / 2);
    text.setPosition(x + R.padX + R.icon + R.gap, y + R.h / 2);
    this.restBox = this.add.container(0, 0, [bg, icon, text]).setVisible(visible);
    this.makeUpButton();
  }

  // (사용자 요청) 지하에 있는 동안 아래 가운데에 "올라가기" 버튼(쉬는 버튼과 같은 모양, 같은 자리). 누르면 사다리로 걸어가 올라간다.
  // 오르내리는 중과 침대에서 자는 중에는 감춘다(prerender 에서 고친다)
  makeUpButton() {
    const R = U.rest, E = U.equip;
    if (this.upBox) this.upBox.destroy();
    const bg = this.add.graphics();
    const icon = this.add.image(0, 0, 'icon_surface').setDisplaySize(R.icon, R.icon);
    const text = this.label(0, 0, '올라가기', R.font);
    const w = R.padX * 2 + R.icon + R.gap + text.width;
    const { x, y } = this.bottomLayout().button(w);   // (사용자 요청) 자리가 없으면 위로
    this.panel(bg, x, y, w, R.h);
    bg.on('pointerdown', () => { this.click(); this.world.climbUp(); });
    icon.setPosition(x + R.padX + R.icon / 2, y + R.h / 2);
    text.setPosition(x + R.padX + R.icon + R.gap, y + R.h / 2);
    this.upBox = this.add.container(0, 0, [bg, icon, text]);
    this.makeRotateButton();
    this.refreshUpButton();
  }

  // (사용자 요청) 긴 양탄자를 놓는 동안 아래 가운데에 "방향 바꾸기"(만들기 창이 접혀 있어도 돌릴 수 있게. 그동안 "올라가기"는 감춘다)
  makeRotateButton() {
    const R = U.rest;
    if (this.rotBox) this.rotBox.destroy();
    const bg = this.add.graphics();
    const icon = this.add.image(0, 0, 'icon_rug_runner').setDisplaySize(R.icon, R.icon);
    const text = this.label(0, 0, '방향 바꾸기', R.font);
    const w = R.padX * 2 + R.icon + R.gap + text.width;
    const { x, y } = this.bottomLayout().button(w);
    this.panel(bg, x, y, w, R.h);
    bg.on('pointerdown', () => { this.world.rotateRunner(); });
    icon.setPosition(x + R.padX + R.icon / 2, y + R.h / 2);
    text.setPosition(x + R.padX + R.icon + R.gap, y + R.h / 2);
    this.rotBox = this.add.container(0, 0, [bg, icon, text]).setVisible(false);
    this.rotIcon = icon;
  }

  refreshUpButton() {
    const w = this.world, rot = w.ug.active && w.build.mode === 'rugRunner' && !w.home.bed;   // (검사) 자는 동안은 "자는 중" 버튼이 그 자리
    const on = w.ug.active && !w.ug.busy && !w.home.bed && !w.player.downed && !rot;
    if (this.upBox.visible !== on) this.upBox.setVisible(on);
    if (this.rotBox.visible !== rot) this.rotBox.setVisible(rot);
    if (rot) this.rotIcon.setFlipX(w.decor.runnerRow);
  }

  // ── 화면 가운데: "쓰러졌습니다" 창, 첫 아침의 결과 창 (5.9, 5.10) ──
  // 떠 있는 동안 월드는 멈춰 있다(GameScene.stopGame). 뒤의 화면은 흐려지고 눌리지 않는다.
  //   lines: [[이름, 값], ...]   buttons: [[글, 누르면 할 일, 노란 버튼인가], ...]
  showModal(title, lines, buttons) {
    const M = U.modal;
    this.closeModal();
    const blocker = this.add.graphics().fillStyle(0x000000, M.dim).fillRect(0, 0, this.W, this.H);
    this.hitRect(blocker, 0, 0, this.W, this.H);
    const h = M.lineY + lines.length * M.lineH + M.gapAfterLines + M.buttonH + M.pad;
    const x = (this.W - M.w) / 2, y = (this.H - h) / 2;
    const parts = [blocker, this.panel(this.add.graphics(), x, y, M.w, h)];
    parts.push(this.label(this.W / 2, y + M.titleY, title, M.titleFont, { originX: 0.5 }));
    lines.forEach(([name, value], i) => {
      const ly = y + M.lineY + i * M.lineH + M.lineH / 2;
      parts.push(this.label(x + M.labelX, ly, name, M.lineFont, { regular: true }));
      parts.push(this.label(x + M.valueX, ly, value, M.lineFont, { originX: 1 }));
    });
    const by = y + M.lineY + lines.length * M.lineH + M.gapAfterLines;
    const total = buttons.length * M.buttonW + (buttons.length - 1) * M.buttonGap;
    buttons.forEach(([text, onPress, primary], i) => {
      const bx = this.W / 2 - total / 2 + i * (M.buttonW + M.buttonGap);
      const g = this.hitRect(this.add.graphics(), bx, by, M.buttonW, M.buttonH);
      this.roundRect(g, bx, by, M.buttonW, M.buttonH, M.buttonRadius, primary ? U.yellow : U.cardColor, 1, INK, U.panel.borderWidth);
      g.on('pointerdown', () => { this.click(); onPress(); });
      parts.push(g, this.label(bx + M.buttonW / 2, by + M.buttonH / 2, text, M.buttonFont, { originX: 0.5 }));
    });
    this.modal = this.add.container(0, 0, parts).setDepth(30);
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.destroy();
    this.modal = null;
  }

  // "다시 시작": 처음부터 다시 시작한다. 저장하는 것이 없으므로 페이지를 새로 읽는다.
  restart() { window.location.reload(); }

  // ── 가운데 위쪽: 알림 ──

  makeNotice() {
    this.noticeBg = this.add.graphics();
    this.noticeText = this.label(this.W / 2, U.notice.y, '', U.notice.font, { originX: 0.5 });
    this.noticeIcon = this.add.image(0, 0, 'icon_surface').setVisible(false);   // (지하) 땅 위 소식의 아이콘 (17.9)
    this.noticeBox = this.add.container(0, 0, [this.noticeBg, this.noticeIcon, this.noticeText]).setDepth(20).setVisible(false);
    this.placeNotice();
    this.noticeQueue = [];
    this.noticeLeft = 0;     // 떠 있는 알림이 사라질 때까지 남은 시간(초)
    this.hint = null;        // 짓기 상태의 안내. 알림이 없는 동안 계속 떠 있다.
  }

  // 알림의 세로 자리: 지하에서는 "지하 1층" 표시 아래로 내려간다 (17.9)
  placeNotice() {
    const N = U.notice, T = U.ugTag;
    this.noticeBox.y = this.world.ug.active ? U.margin + U.clock.h + T.gap + T.h + T.gap + N.height / 2 - N.y : 0;
  }

  // 알림 자리에 글을 띄운다. icon: 글 앞의 아이콘(땅 위 소식)
  showNotice(text, icon = null) {
    const N = U.notice, P = U.panel, I = U.noticeIcon;
    this.noticeText.setText(text);
    const iw = icon ? I.size + I.gap : 0, w = this.noticeText.width + N.padX * 2 + iw;
    this.noticeText.setX(this.W / 2 + iw / 2);
    this.noticeIcon.setVisible(!!icon);
    if (icon) this.noticeIcon.setTexture(icon).setDisplaySize(I.size, I.size).setPosition(this.W / 2 - w / 2 + N.padX + I.size / 2, N.y);
    this.roundRect(this.noticeBg.clear(), this.W / 2 - w / 2, N.y - N.height / 2, w, N.height, N.height / 2, P.color, P.alpha, P.border, P.borderWidth);
    this.noticeBox.setVisible(true).setAlpha(1);
  }

  // 알림은 2.5초 떴다가 사라진다. 새 알림은 떠 있던 것을 바로 바꾼다.
  // queued 가 true 면 떠 있는 알림이 끝난 뒤에 차례로 보여 준다(처음의 안내 세 개).
  notice(text, queued = false, icon = null) {
    if (queued && this.noticeLeft > 0) {
      this.noticeQueue.push(text);
      return;
    }
    this.showNotice(text, icon);
    this.noticeLeft = U.notice.time;
  }

  // 짓기 상태의 안내는 계속 떠 있다: "울타리: 지을 칸을 누르세요"
  refreshHint() {
    const mode = this.world.build.mode;
    const card = [...cardsFor(this.world.stage, this.world.tools, this.world.ug.active), ...DECOR_CARDS, ...LOOT_CARDS].find((c) => c && c.id === mode);
    // (지하 꾸미기) 바닥재 "깔 칸", 벽판 "댈 벽", 벽 장식 "달 벽" (19.2~19.4)
    const what = card && card.kind === 'floor' ? '깔 칸을' : card && card.kind === 'cover' ? '댈 벽을' : card && card.kind === 'wall' ? '달 벽을'
      : this.world.build.furnishing ? '놓을 칸을' : '지을 칸을';
    this.hint = !card ? null : card.type === 'remove' ? (this.world.ug.active ? '치우기: 없앨 것을 누르세요' : '치우기: 없앨 시설을 누르세요')
      : card.type === 'farm' ? '밭 갈기: 갈 칸을 누르세요' : `${cardName(card)}: ${what} 누르세요`;
    if (this.hint) {                                  // 안내는 바로 띄운다(기다리던 알림은 버린다)
      this.noticeQueue.length = 0;
      this.noticeLeft = 0;
      this.showNotice(this.hint);
    } else if (this.noticeLeft <= 0) {                // 떠 있는 알림("재료가 부족합니다" 등)은 그대로 둔다
      this.noticeBox.setVisible(false);
    }
  }

  update(time, delta) {
    this.updateNotice(delta);
  }

  // 알림은 실제 시간으로 2.5초 떠 있다(게임이 빨라져도 같다)
  updateNotice(delta) {
    if (this.noticeLeft <= 0) return;
    this.noticeLeft -= delta / 1000;
    if (this.noticeLeft > 0) {
      // 끝에 살짝 흐려지며 사라진다(뒤이어 다른 글이 뜰 때는 그대로 둔다)
      if (!this.noticeQueue.length && !this.hint) this.noticeBox.setAlpha(Math.min(1, this.noticeLeft / U.notice.fade));
      return;
    }
    if (this.noticeQueue.length) this.notice(this.noticeQueue.shift());
    else if (this.hint) this.showNotice(this.hint);
    else this.noticeBox.setVisible(false);
  }
}
