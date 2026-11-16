import { CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.view.width,
  height: CONFIG.view.height,
  backgroundColor: CONFIG.screen.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1 },
  disableContextMenu: true,
  scene: [BootScene, GameScene, UIScene],
});
window.__game = game;   // 브라우저 콘솔에서 들여다볼 때 쓴다

// 터치 기기: 두 손가락 확대, 두 번 눌러 확대, 길게 눌러 선택, 화면 끌림이 일어나지 않게 한다
for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
