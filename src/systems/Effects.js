import { CONFIG } from '../config.js';

// 효과: 떠오르는 아이콘과 숫자
export class Effects {
  constructor(scene) {
    this.scene = scene;
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
