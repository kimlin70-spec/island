import { CONFIG } from '../config.js';

// 효과(먼지, 타격, 떠오르는 숫자, 흔들림)와 체력 막대. 모두 월드 위, depth 50000 에 그린다. (3.4)
// 게임 시간(dt)으로 움직이므로 게임이 빨라지면 효과도 같이 빨라진다.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.running = [];   // { t, life, step(k), done() }  k: 0 -> 1
    this.bars = [];
  }

  run(life, step, done) {
    this.running.push({ t: 0, life, step, done });
    step(0);
  }

  update(dt) {
    for (let i = this.running.length - 1; i >= 0; i--) {
      const e = this.running[i];
      e.t += dt;
      if (e.t >= e.life) {
        this.running.splice(i, 1);
        if (e.done) e.done();
      } else {
        e.step(e.t / e.life);
      }
    }
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const b = this.bars[i];
      b.left -= dt;
      if (b.left <= 0) b.g.setVisible(false);
    }
  }

  // 사물이 다 쓰이거나 캐릭터·시설이 사라질 때: 먼지가 커지며 흐려진다
  poof(x, y) {
    const F = CONFIG.fx;
    const img = this.scene.add.image(x, y, 'fx_poof').setDepth(CONFIG.depth.fx);
    this.run(F.poofTime, (k) => img.setScale(F.poofFrom + (F.poofTo - F.poofFrom) * k).setAlpha(1 - k), () => img.destroy());
  }

  // 맞은 자리에 타격 그림을 잠깐 보여 준다
  hit(x, y) {
    const img = this.scene.add.image(x, y, 'fx_hit').setDepth(CONFIG.depth.fx);
    this.run(CONFIG.fx.hitTime, () => {}, () => img.destroy());
  }

  // 맞은 대상을 좌우로 흔든다
  shake(sprite) {
    const F = CONFIG.fx;
    if (sprite.shakeBase === undefined) sprite.shakeBase = sprite.x;
    const base = sprite.shakeBase;
    this.run(F.shakeTime, (k) => { sprite.x = base + (k < 0.5 ? -F.shakePx : F.shakePx); }, () => {
      sprite.x = base;
      sprite.shakeBase = undefined;
    });
  }

  // 맞은 캐릭터는 잠깐 하얗게 번쩍인다 (3.5)
  flash(sprite) {
    sprite.setTintFill(0xffffff);
    this.run(CONFIG.fx.flashTime, () => {}, () => { if (sprite.active) sprite.clearTint(); });
  }

  // 재료를 얻었을 때: 아이콘과 "+4"가 떠오른다
  popup(x, y, iconKey, label) {
    const F = CONFIG.fx;
    const icon = this.scene.add.image(0, 0, iconKey).setDisplaySize(F.popupIcon, F.popupIcon).setOrigin(1, 0.5);
    const text = this.scene.add.text(2, 0, label, {
      fontFamily: CONFIG.screen.font, fontSize: F.popupFont + 'px', fontStyle: 'bold',
      color: CONFIG.screen.textColor, stroke: '#fbf6ea', strokeThickness: 6,
    }).setOrigin(0, 0.5);
    const box = this.scene.add.container(x, y, [icon, text]).setDepth(CONFIG.depth.fx);
    this.run(F.popupTime, (k) => {
      box.y = y - F.popupRise * k;
      box.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }, () => box.destroy());
  }

  // 체력 막대. owner.bar 에 달아 둔다. linger 초 뒤에 저절로 숨는다(계속 보이게 하려면 Infinity).
  showBar(owner, ratio, x, y, linger) {
    const F = CONFIG.fx;
    if (!owner.bar) {
      owner.bar = { g: this.scene.add.graphics().setDepth(CONFIG.depth.fx), left: 0 };
      this.bars.push(owner.bar);
    }
    const b = owner.bar, w = F.barWidth, h = F.barHeight;
    b.left = linger;
    b.g.setPosition(x, y).setVisible(true).clear();
    b.g.fillStyle(F.barBorder, 1).fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 3);
    b.g.fillStyle(F.barTrack, 1).fillRect(-w / 2, -h / 2, w, h);
    b.g.fillStyle(F.barFill, 1).fillRect(-w / 2, -h / 2, w * Math.max(0, Math.min(1, ratio)), h);
  }

  removeBar(owner) {
    if (!owner.bar) return;
    this.bars.splice(this.bars.indexOf(owner.bar), 1);
    owner.bar.g.destroy();
    owner.bar = null;
  }
}
