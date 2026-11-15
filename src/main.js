import { CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.view.width,
  height: CONFIG.view.height,
  backgroundColor: CONFIG.colors.cloud,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1 },
  disableContextMenu: true,
  scene: [BootScene, GameScene, UIScene],
});
window.__game = game;

// 아이패드 사파리: 두 손가락 확대, 더블탭 확대, 화면 끌림 막기
for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
