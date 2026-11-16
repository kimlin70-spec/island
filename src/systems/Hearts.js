import { CONFIG } from '../config.js';

// 하트 (5.9). 바뀌면 'hearts-changed' 를 알린다. 깎이는 것은 적이 나오는 Phase 5에서 넣는다.
export class Hearts {
  constructor(scene) {
    this.scene = scene;
    this.max = CONFIG.player.maxHearts;
    this.value = this.max;
  }

  heal(n) {
    const v = Math.min(this.max, this.value + n);
    if (v === this.value) return;
    this.value = v;
    this.scene.events.emit('hearts-changed');
  }
}
