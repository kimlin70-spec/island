import { CONFIG } from '../config.js';
import { CARDS, cardCost, cardName } from '../systems/Crafting.js';
import { TODO_ITEMS } from '../systems/Todo.js';

const U = CONFIG.ui;
const INK = Phaser.Display.Color.HexStringToColor(U.ink).color;
const Rect = Phaser.Geom.Rectangle;
// 처음 시작할 때 차례로 보여 주는 알림 (7장)
const INTRO = ['땅을 누르면 이동합니다', '나무를 누르면 다가가서 벱니다', '만들기에서 도구와 캠프를 만들 수 있습니다'];

// 화면 UI. 월드(GameScene) 위에 겹쳐 그려지고, 카메라와 상관없이 제자리에 있다.
// 패널과 버튼은 setInteractive 를 해 두어서, 그 위를 누른 것은 월드로 전달되지 않는다.
export class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.world = this.scene.get('game');
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.makeTodo();
    this.makeBag();
    this.makeEquipment();
    this.makeCraft();
    this.makeDebug();
    this.makeNotice();

    // 월드에서 바뀐 것을 받아 화면을 고친다
    const listen = (name, fn) => {
      this.world.events.on(name, fn, this);
      this.events.once('shutdown', () => this.world.events.off(name, fn, this));
    };
    listen('inventory-changed', () => { this.refreshBag(); this.refreshCards(); });
    listen('tools-changed', () => { this.refreshEquipment(); this.refreshCards(); });
    listen('todo-changed', () => this.refreshTodo());
    listen('build-changed', () => { this.refreshCards(); this.refreshHint(); });
    listen('structures-changed', () => this.refreshCards());
    listen('notice', (text) => this.notice(text));

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

  // ── 오른쪽 위: 할 일 (5.11) ──

  makeTodo() {
    const T = U.todo;
    const x = this.W - U.margin - T.w, y = U.margin;
    this.todoPos = { x, y, h: T.padTop + TODO_ITEMS.length * T.lineHeight + T.padBottom };
    this.panel(this.add.graphics(), x, y, T.w, this.todoPos.h);
    this.label(x + T.titleX, y + T.titleY, '할 일', T.titleFont);
    this.todoBoxes = this.add.graphics();
    this.todoLabels = TODO_ITEMS.map((item, i) =>
      this.label(x + T.textX, y + T.padTop + i * T.lineHeight + T.textY, item.label, T.font, { regular: true }));
    this.refreshTodo();
  }

  refreshTodo() {
    const T = U.todo, g = this.todoBoxes.clear(), k = T.boxSize / 22;
    TODO_ITEMS.forEach((item, i) => {
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

  makeBag() {
    const B = U.bag;
    const x = U.margin, y = this.H - U.margin - B.h;
    this.panel(this.add.graphics(), x, y, B.w, B.h);
    this.bagCounts = {};
    ['wood', 'stone'].forEach((item, i) => {
      this.add.image(x + B.iconX[i], y + B.h / 2, 'icon_' + item).setDisplaySize(B.icon, B.icon);
      this.bagCounts[item] = this.label(x + B.countX[i], y + B.countY, '0', B.font);
    });
    this.refreshBag();
  }

  refreshBag() {
    for (const item of Object.keys(this.bagCounts)) this.bagCounts[item].setText(String(this.world.inventory.count(item)));
  }

  makeEquipment() {
    this.equipBg = this.add.graphics();
    this.equipIcons = [];
    this.refreshEquipment();
  }

  // 단검, 티셔츠, 만든 도구. 도구가 늘면 칸이 옆으로 늘어난다.
  refreshEquipment() {
    const E = U.equip, B = U.bag;
    const list = this.world.equipment();
    const x = U.margin + B.w + E.gap, y = this.H - U.margin - B.h;
    this.panel(this.equipBg, x, y, E.pad * 2 + list.length * E.slot, B.h);
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
    this.craftBtn.on('pointerdown', () => this.toggleCraft());
    this.drawCraftButton();
    this.add.image(cx, cy + C.iconY, 'icon_craft').setDisplaySize(C.icon, C.icon);
    this.label(cx, cy + C.textY, '만들기', C.font, { originX: 0.5 });

    // 창: 버튼 위로 열린다. 카드 6장.
    const n = CARDS.length;
    const w = K.pad * 2 + n * K.cardW + (n - 1) * K.cardGap;
    const h = K.pad * 2 + K.titleHeight + K.cardH;
    this.craftWin = this.add.container(this.W - U.margin - w, cy - r - K.gapToButton - h).setDepth(10).setVisible(false);
    this.craftWin.add(this.panel(this.add.graphics(), 0, 0, w, h));
    this.craftWin.add(this.label(K.pad, K.titleY, '만들기', K.titleFont));
    this.craftWin.add(this.label(w - K.pad, K.titleY, '재료가 모자라면 흐리게 보입니다', K.noteFont, { originX: 1, regular: true, color: U.dimInk }));
    this.cards = CARDS.map((card, i) => this.makeCard(card, K.pad + i * (K.cardW + K.cardGap), K.pad + K.titleHeight));
    this.refreshCards();
  }

  drawCraftButton() {
    const C = U.craftButton, { cx, cy, r } = this.craftPos;
    const b = this.craftOpen ? C.borderOpen : C.border;
    this.craftBtn.clear().fillStyle(U.yellow, 1).fillCircle(cx, cy, r).lineStyle(b, INK, 1).strokeCircle(cx, cy, r - b / 2);
  }

  // 만들기 버튼: 누르면 창이 열리고, 다시 누르면 닫히면서 짓기 상태도 끝난다
  toggleCraft() {
    this.craftOpen = !this.craftOpen;
    this.craftWin.setVisible(this.craftOpen);
    this.drawCraftButton();
    if (!this.craftOpen) this.world.build.setMode(null);
  }

  // 카드 한 장: 아이콘, 이름, 재료(아이콘과 숫자) 또는 글자("보유", "절반 돌려받음")
  makeCard(card, x, y) {
    const K = U.craft;
    const box = this.add.container(x, y);
    const bg = this.hitRect(this.add.graphics(), 0, 0, K.cardW, K.cardH);
    bg.on('pointerdown', () => this.world.pressCard(card));
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
    return { card, box, bg, status, costParts };
  }

  // 재료가 모자란 카드와 이미 가진 것의 카드는 흐리게 보인다. 고른 카드는 노란 굵은 테두리.
  refreshCards() {
    const K = U.craft;
    for (const c of this.cards) {
      const state = this.world.cardState(c.card);
      const selected = this.world.build.mode === c.card.id;
      if (c.costParts.length) {
        for (const part of c.costParts) part.setVisible(state !== 'owned');
        c.status.setText(state === 'owned' ? '보유' : '');
      }
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
    btn.on('pointerdown', () => this.debugWin.setVisible(!this.debugWin.visible));
    this.label(bx + D.buttonW / 2, by + D.buttonH / 2, '시험', D.font, { originX: 0.5 });

    const items = [
      [`나무, 돌 +${D.giveAmount}`, () => this.world.debugGive()],
      ['닫기', () => this.debugWin.setVisible(false)],
    ];
    const h = D.pad * 2 + items.length * D.itemH + (items.length - 1) * D.itemGap;
    this.debugWin = this.add.container(this.W - U.margin - D.w, by + D.buttonH + D.gap).setDepth(10).setVisible(false);
    this.debugWin.add(this.panel(this.add.graphics(), 0, 0, D.w, h));
    items.forEach(([text, onPress], i) => {
      const y = D.pad + i * (D.itemH + D.itemGap), w = D.w - D.pad * 2;
      const g = this.hitRect(this.add.graphics(), D.pad, y, w, D.itemH);
      this.roundRect(g, D.pad, y, w, D.itemH, D.radius, U.cardColor, 1, INK, U.panel.borderWidth);
      g.on('pointerdown', onPress);
      this.debugWin.add([g, this.label(D.w / 2, y + D.itemH / 2, text, D.itemFont, { originX: 0.5 })]);
    });
  }

  // ── 가운데 위쪽: 알림 ──

  makeNotice() {
    this.noticeBg = this.add.graphics();
    this.noticeText = this.label(this.W / 2, U.notice.y, '', U.notice.font, { originX: 0.5 });
    this.noticeBox = this.add.container(0, 0, [this.noticeBg, this.noticeText]).setDepth(20).setVisible(false);
    this.noticeQueue = [];
    this.noticeLeft = 0;     // 떠 있는 알림이 사라질 때까지 남은 시간(초)
    this.hint = null;        // 짓기 상태의 안내. 알림이 없는 동안 계속 떠 있다.
  }

  // 알림 자리에 글을 띄운다
  showNotice(text) {
    const N = U.notice, P = U.panel;
    this.noticeText.setText(text);
    const w = this.noticeText.width + N.padX * 2;
    this.roundRect(this.noticeBg.clear(), this.W / 2 - w / 2, N.y - N.height / 2, w, N.height, N.height / 2, P.color, P.alpha, P.border, P.borderWidth);
    this.noticeBox.setVisible(true).setAlpha(1);
  }

  // 알림은 2.5초 떴다가 사라진다. 새 알림은 떠 있던 것을 바로 바꾼다.
  // queued 가 true 면 떠 있는 알림이 끝난 뒤에 차례로 보여 준다(처음의 안내 세 개).
  notice(text, queued = false) {
    if (queued && this.noticeLeft > 0) {
      this.noticeQueue.push(text);
      return;
    }
    this.showNotice(text);
    this.noticeLeft = U.notice.time;
  }

  // 짓기 상태의 안내는 계속 떠 있다: "울타리: 지을 칸을 누르세요"
  refreshHint() {
    const mode = this.world.build.mode;
    const card = CARDS.find((c) => c.id === mode);
    this.hint = !card ? null : card.type === 'remove' ? '치우기: 없앨 시설을 누르세요' : `${cardName(card)}: 지을 칸을 누르세요`;
    if (this.hint) {                                  // 안내는 바로 띄운다(기다리던 알림은 버린다)
      this.noticeQueue.length = 0;
      this.noticeLeft = 0;
      this.showNotice(this.hint);
    } else if (this.noticeLeft <= 0) {                // 떠 있는 알림("재료가 부족합니다" 등)은 그대로 둔다
      this.noticeBox.setVisible(false);
    }
  }

  update(time, delta) {
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
