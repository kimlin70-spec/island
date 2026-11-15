import { CONFIG } from '../config.js';

// 효과: 떠오르는 아이콘과 숫자
export class Effects {
  constructor(scene) {
    this.scene = scene;
  }

  // 펑 하고 사라지는 연기
  poof(x, y) {
    const img = this.scene.add.image(x, y, 'fx_poof').setDepth(CONFIG.depth.fx).setScale(0.6);
    this.scene.tweens.add({
      targets: img, scale: 1.4, alpha: 0, duration: CONFIG.fx.poofTime * 1000,
      onComplete: () => img.destroy(),
    });
  }

  // 위로 튀어 오르는 별
  star(x, y) {
    const img = this.scene.add.image(x, y, 'fx_star').setDepth(CONFIG.depth.fx);
    this.scene.tweens.add({
      targets: img, y: y - CONFIG.fx.starRise, angle: 180, duration: CONFIG.fx.starTime * 1000, ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: img, alpha: 0, delay: CONFIG.fx.starTime * 500, duration: CONFIG.fx.starTime * 500,
      onComplete: () => img.destroy(),
    });
  }

  // 작은 체력 막대. 깎였을 때만 보인다. set(비율 0~1) 로 바꾼다.
  makeBar(x, y) {
    const F = CONFIG.fx;
    const back = this.scene.add.rectangle(0, 0, F.barWidth + 6, F.barHeight + 6, F.barBack);
    const fill = this.scene.add.rectangle(-F.barWidth / 2, 0, F.barWidth, F.barHeight, F.barFill).setOrigin(0, 0.5);
    const box = this.scene.add.container(x, y, [back, fill]).setDepth(CONFIG.depth.fx).setVisible(false);
    box.set = (ratio) => {
      const r = Math.max(0, Math.min(1, ratio));
      fill.scaleX = r;
      fill.setFillStyle(r > 0.4 ? F.barFill : F.barLow);
      box.setVisible(r < 1);
    };
    return box;
  }

  // 월드 좌표 (x, y)에서 아이콘과 글자("+1")가 떠오르다 사라진다
  popup(x, y, iconKey, label) {
    const F = CONFIG.fx;
    const scene = this.scene;
    const icon = scene.add.image(0, 0, iconKey).setScale(F.popupIconScale).setOrigin(1, 0.5);
    const text = scene.add.text(4, 0, label, {
      fontFamily: CONFIG.ui.font, fontSize: F.popupFontSize + 'px', fontStyle: 'bold',
      color: CONFIG.colors.text, stroke: '#ffffff', strokeThickness: 8,
    }).setOrigin(0, 0.5);
    const box = scene.add.container(x, y, [icon, text]).setDepth(CONFIG.depth.fx);
    scene.tweens.add({
      targets: box, y: y - F.popupRise, duration: F.popupTime * 1000, ease: 'Cubic.easeOut',
    });
    scene.tweens.add({
      targets: box, alpha: 0, delay: F.popupTime * 600, duration: F.popupTime * 400,
      onComplete: () => box.destroy(),
    });
  }
}
