import { CONFIG } from '../config.js';

// 화면 UI. 카메라 확대의 영향을 받지 않게 따로 둔 씬이다.
// Phase 1 에서는 아직 보여 줄 것이 없다. (하트, 가방, 시계 등은 다음 Phase 에서 추가)
export class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    // UI 위치와 크기에 곱하는 배율 (화면 폭 / 2048)
    this.s = CONFIG.view.width / 2048;
  }
}
