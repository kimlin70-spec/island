import { CONFIG } from '../config.js';
import { ITEMS } from '../systems/Inventory.js';

// 화면 배치 (2048×1536 기준 px. 실제로는 화면 폭 / 2048 배율을 곱한다)
const L = {
  margin: 26,
  vitals: { x: 26, y: 26, w: 436, h: 186, iconScale: 0.8, gap: 80, rowGap: 78 },
  zone: { w: 540, h: 112, iconScale: 0.8 },
  bag: { h: 140, slotW: 196, iconScale: 0.9 },
  notice: { y: 250, padX: 44, padY: 22 },
  gear: { size: 104, gapY: 20 },
  debug: { w: 980, h: 620, btnW: 420, btnH: 150, gap: 30 },
};
const EDIBLE = ['berry', 'meat'];

// 화면 UI. 카메라 확대의 영향을 받지 않게 따로 둔 씬이다.
export class UIScene extends Phaser.Scene {
  constructor() {
    super('ui');
    this.capturedDownTime = -1;   // UI를 누른 터치의 시각(월드로 전달하지 않기 위해)
  }

  create() {
    this.world = this.scene.get('game');
    this.s = this.scale.width / 2048;
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.notices = [];
    this.noticeBusy = false;

    this.input.on('pointerdown', (p, over) => { if (over.length) this.capturedDownTime = p.downTime; });

    this.buildVitals();
    this.buildZone();
    this.buildGear();
    this.buildBag();
    this.buildNotice();
    this.buildDebug();
    this.buildFade();

    const ev = this.world.events;
    ev.on('vitals-changed', this.refreshVitals, this);
    ev.on('inventory-changed', this.refreshBag, this);
    ev.on('fog-changed', this.refreshZone, this);
    this.events.once('shutdown', () => {
      ev.off('vitals-changed', this.refreshVitals, this);
      ev.off('inventory-changed', this.refreshBag, this);
      ev.off('fog-changed', this.refreshZone, this);
    });
    this.refreshVitals();
    this.refreshBag();
    this.refreshZone();

    // 처음 시작할 때 알림 세 개
    this.notice('땅을 누르면 걸어가요');
    this.notice('나무와 돌을 누르면 모을 수 있어요');
    this.notice('밤이 오기 전에 집 둘레에 울타리를 지어요');
  }

  // ---- 만들기 도우미 ----
  px(v) { return v * this.s; }

  // 패널(둥근 사각형). 눌러도 월드로 전달되지 않게 터치를 받는다.
  panel(x, y, w, h, parent) {
    const U = CONFIG.ui;
    const g = this.add.graphics();
    g.fillStyle(U.panelColor, 1).fillRoundedRect(this.px(x), this.px(y), this.px(w), this.px(h), this.px(U.radius));
    g.lineStyle(this.px(U.borderWidth), U.borderColor, 1).strokeRoundedRect(this.px(x), this.px(y), this.px(w), this.px(h), this.px(U.radius));
    const zone = this.add.zone(this.px(x), this.px(y), this.px(w), this.px(h)).setOrigin(0).setInteractive();
    if (parent) parent.add([g, zone]);
    return g;
  }

  label(x, y, str, size = CONFIG.ui.fontSize) {
    return this.add.text(this.px(x), this.px(y), str, {
      fontFamily: CONFIG.ui.font, fontSize: this.px(size) + 'px', fontStyle: 'bold', color: CONFIG.colors.text,
    });
  }

  icon(x, y, key, scale) {
    return this.add.image(this.px(x), this.px(y), key).setScale(this.px(scale));
  }

  // 누르는 버튼. 가운데 좌표 (x, y).
  button(x, y, w, h, str, onClick, parent) {
    const U = CONFIG.ui;
    const g = this.add.graphics();
    g.fillStyle(U.panelColor, 1).fillRoundedRect(-this.px(w) / 2, -this.px(h) / 2, this.px(w), this.px(h), this.px(U.radius));
    g.lineStyle(this.px(U.borderWidth), U.borderColor, 1).strokeRoundedRect(-this.px(w) / 2, -this.px(h) / 2, this.px(w), this.px(h), this.px(U.radius));
    const text = this.label(0, 0, str).setOrigin(0.5);
    const zone = this.add.zone(0, 0, this.px(w), this.px(h)).setInteractive();
    const box = this.add.container(this.px(x), this.px(y), [g, text, zone]);
    zone.on('pointerdown', () => box.setScale(0.96));
    zone.on('pointerout', () => box.setScale(1));
    zone.on('pointerup', () => { box.setScale(1); onClick(); });
    box.text = text;
    if (parent) parent.add(box);
    return box;
  }

  // ---- 왼쪽 위: 하트와 배고픔 ----
  buildVitals() {
    const v = L.vitals;
    this.panel(v.x, v.y, v.w, v.h);
    this.heartIcons = [];
    this.hungerIcons = [];
    const x0 = v.x + 58, y0 = v.y + 54;
    for (let i = 0; i < CONFIG.player.maxHearts; i++) {
      this.heartIcons.push(this.icon(x0 + i * v.gap, y0, 'icon_heart', v.iconScale));
    }
    for (let i = 0; i < CONFIG.player.maxHunger; i++) {
      this.hungerIcons.push(this.icon(x0 + i * v.gap, y0 + v.rowGap, 'icon_hunger', v.iconScale));
    }
  }

  refreshVitals() {
    const v = this.world.vitals;
    this.heartIcons.forEach((img, i) => img.setTexture(i < v.hearts ? 'icon_heart' : 'icon_heart_empty'));
    this.hungerIcons.forEach((img, i) => img.setTexture(i < v.hunger ? 'icon_hunger' : 'icon_hunger_empty'));
  }

  // ---- 오른쪽 위: 노리는 구역 ----
  buildZone() {
    const z = L.zone;
    const x = 2048 - L.margin - z.w, y = L.margin;
    this.panel(x, y, z.w, z.h);
    this.icon(x + 62, y + z.h / 2, 'icon_flag', z.iconScale);
    this.zoneText = this.label(x + 122, y + z.h / 2, '').setOrigin(0, 0.5);
  }

  refreshZone() {
    const zone = this.world.targetZone();
    if (!zone) return;
    const pct = Math.floor(this.world.fog.zoneRatio(zone.id) * 100);
    this.zoneText.setText(`${zone.name}  안개 ${pct}%`);
  }

  // ---- 왼쪽 아래: 가방 ----
  buildBag() {
    const b = L.bag;
    const x = L.margin, y = 1536 - L.margin - b.h;
    const w = b.slotW * ITEMS.length + 20;
    this.panel(x, y, w, b.h);
    this.bagTexts = {};
    ITEMS.forEach((item, i) => {
      const sx = x + 10 + i * b.slotW;
      this.icon(sx + 62, y + b.h / 2, 'icon_' + item, b.iconScale);
      this.bagTexts[item] = this.label(sx + 116, y + b.h / 2, '0', CONFIG.ui.countFontSize).setOrigin(0, 0.5);
      if (EDIBLE.includes(item)) {
        // 열매, 고기는 누르면 먹는다
        const zone = this.add.zone(this.px(sx), this.px(y), this.px(b.slotW), this.px(b.h)).setOrigin(0).setInteractive();
        zone.on('pointerup', () => this.world.eat(item));
      }
    });
  }

  refreshBag() {
    for (const item of ITEMS) this.bagTexts[item].setText(String(this.world.inventory.count(item)));
  }

  // ---- 가운데 위쪽: 알림 ----
  buildNotice() {
    this.noticeBg = this.add.graphics();
    this.noticeText = this.label(0, 0, '', CONFIG.ui.noticeFontSize).setOrigin(0.5);
    this.noticeBox = this.add.container(this.W / 2, this.px(L.notice.y), [this.noticeBg, this.noticeText]).setAlpha(0);
  }

  // 알림을 띄운다. 여러 개면 차례로 보여 준다.
  notice(str) {
    this.notices.push(str);
    if (!this.noticeBusy) this.nextNotice();
  }

  nextNotice() {
    const str = this.notices.shift();
    if (str === undefined) { this.noticeBusy = false; return; }
    this.noticeBusy = true;
    const U = CONFIG.ui, n = L.notice;
    this.noticeText.setText(str);
    const w = this.noticeText.width + this.px(n.padX) * 2, h = this.noticeText.height + this.px(n.padY) * 2;
    this.noticeBg.clear();
    this.noticeBg.fillStyle(U.panelColor, 1).fillRoundedRect(-w / 2, -h / 2, w, h, this.px(U.radius));
    this.noticeBg.lineStyle(this.px(U.borderWidth), U.borderColor, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, this.px(U.radius));
    this.tweens.killTweensOf(this.noticeBox);
    this.tweens.chain({
      targets: this.noticeBox,
      tweens: [
        { alpha: 1, duration: U.noticeFade * 1000 },
        { alpha: 0, duration: U.noticeFade * 1000, delay: U.noticeTime * 1000 },
      ],
      onComplete: () => this.nextNotice(),
    });
  }

  // ---- 시험용 도구 (8장) ----
  buildGear() {
    const g = L.gear;
    const cx = 2048 - L.margin - g.size / 2, cy = L.margin + L.zone.h + g.gapY + g.size / 2;
    // 톱니 그림이 없어서 도형으로 그린다
    const U = CONFIG.ui;
    const gfx = this.add.graphics({ x: this.px(cx), y: this.px(cy) });
    const pts = [];
    const teeth = 8, rOut = this.px(g.size * 0.46), rIn = this.px(g.size * 0.34);
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = (i % 4 < 2) ? rOut : rIn;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    gfx.fillStyle(U.panelColor, 1).fillPoints(pts, true);
    gfx.lineStyle(this.px(U.borderWidth), U.borderColor, 1).strokePoints(pts, true);
    gfx.fillStyle(U.borderColor, 1).fillCircle(0, 0, this.px(g.size * 0.13));
    const zone = this.add.zone(this.px(cx), this.px(cy), this.px(g.size), this.px(g.size)).setInteractive();
    zone.on('pointerup', () => this.debugBox.setVisible(true));
  }

  buildDebug() {
    const d = L.debug;
    const box = this.add.container(0, 0).setVisible(false);
    this.debugBox = box;
    // 창 바깥을 누르면 닫힌다
    const shade = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.35).setOrigin(0).setInteractive();
    shade.on('pointerup', () => box.setVisible(false));
    box.add(shade);
    const x = (2048 - d.w) / 2, y = (1536 - d.h) / 2;
    this.panel(x, y, d.w, d.h, box);
    box.add(this.label(1024, y + 70, '시험용 도구').setOrigin(0.5));

    const col = (i) => 1024 + (i === 0 ? -1 : 1) * (d.btnW + d.gap) / 2;
    const row = (j) => y + 150 + d.btnH / 2 + j * (d.btnH + d.gap);
    this.button(col(0), row(0), d.btnW, d.btnH, `재료 +${CONFIG.debug.giveAmount}`, () => this.world.debugGive(), box);
    this.button(col(1), row(0), d.btnW, d.btnH, '안개 모두 걷기', () => this.world.debugRevealAll(), box);
    const speedBtn = this.button(col(0), row(1), d.btnW, d.btnH, '속도 ×1', () => {
      speedBtn.text.setText('속도 ×' + this.world.debugToggleSpeed());
    }, box);
    this.button(col(1), row(1), d.btnW, d.btnH, '닫기', () => box.setVisible(false), box);
  }

  // ---- 화면 어두워지기 (쓰러졌을 때) ----
  buildFade() {
    this.fadeRect = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 1).setOrigin(0).setAlpha(0);
  }

  // 화면이 어두워졌다가 밝아진다. 가장 어두울 때 onDark 를 부른다.
  fadeBlack(onDark) {
    const C = CONFIG.collapse;
    this.tweens.killTweensOf(this.fadeRect);
    this.tweens.chain({
      targets: this.fadeRect,
      tweens: [
        { alpha: 1, duration: C.fadeTime * 1000, onComplete: onDark },
        { alpha: 0, duration: C.fadeTime * 1000, delay: C.holdTime * 1000 },
      ],
    });
  }
}
