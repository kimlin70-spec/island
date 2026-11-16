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
  // 엔진은 시작 직후와 창으로 돌아온 직후 120프레임 동안 시간을 초당 60장 기준으로 줄여서 센다.
  // 화면이 그보다 느리게 그려지는 기기에서는 그동안 게임이 느리게 흘러서, 이 구간을 끈다.
  fps: { panicMax: 0 },
  disableContextMenu: true,
  scene: [BootScene, GameScene, UIScene],
});
window.__game = game;   // 브라우저 콘솔에서 들여다볼 때 쓴다

// 터치 기기: 두 손가락 확대, 두 번 눌러 확대, 길게 눌러 선택, 화면 끌림이 일어나지 않게 한다
for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
