import { CONFIG } from '../config.js';

// 텐트에서 쉬기 (5.6). 들어가면 주인공이 보이지 않고 텐트에 불이 켜진다.
// 주인공은 들어갔던 칸(텐트에 붙은 칸)에 그대로 있는 것으로 치고, 나올 때 그 칸에 다시 보인다.
export class RestSystem {
  constructor(scene) {
    this.scene = scene;
    this.tent = null;        // 들어가 있는 텐트
    this.healLeft = 0;       // 다음 하트가 찰 때까지 남은 게임 시간(초)
  }

  get resting() { return this.tent !== null; }

  enter(tent) {
    if (this.tent) return;
    const p = this.scene.player;
    p.stopAction();
    p.sprite.setVisible(false);
    this.tent = tent;
    this.scene.sfx.play('tent');
    tent.sprite.setTexture('build_tent_lit');
    this.healLeft = CONFIG.build.tent.healInterval;
    this.scene.events.emit('rest-changed');
  }

  // 들어갔던 칸으로 나온다
  exit() {
    if (!this.tent) return;
    if (this.tent.sprite.active) this.tent.sprite.setTexture('build_tent');
    this.scene.sfx.play('tent');
    this.tent = null;
    this.scene.player.sprite.setVisible(true);
    this.scene.events.emit('rest-changed');
  }

  // 쉬는 동안 healInterval 초마다 하트가 1 찬다
  update(dt) {
    if (!this.tent) return;
    this.healLeft -= dt;
    while (this.healLeft <= 0) {
      this.healLeft += CONFIG.build.tent.healInterval;
      if (this.scene.hearts.heal(1)) this.scene.heartsUp();
    }
  }
}
