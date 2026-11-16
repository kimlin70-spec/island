// 화면 UI와 밤의 빛 지도. 월드(GameScene) 위에 겹쳐 그려진다.
// Phase 1에는 아직 보여 줄 것이 없다. Phase 2부터 하트, 가방, 만들기 버튼 등을 채운다.
export class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.world = this.scene.get('game');
  }
}
