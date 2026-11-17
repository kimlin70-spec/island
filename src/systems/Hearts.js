import { CONFIG } from '../config.js';

// 하트 (5.9). 바뀌면 'hearts-changed' 를 알린다. 좀비에게 맞으면 깎이고, 텐트와 아침에 찬다.
export class Hearts {
  constructor(scene) {
    this.scene = scene;
    this.max = CONFIG.player.maxHearts;
    this.value = this.max;
  }

  damage(n) {
    const v = Math.max(0, this.value - n);
    if (v === this.value) return;
    this.value = v;
    this.scene.events.emit('hearts-changed');
  }

  // 하트를 n 만큼 채운다. 실제로 늘었으면 true. 쓰러진 뒤(창이 뜨기 전 1초)에는 차지 않는다.
  heal(n) {
    const v = Math.min(this.max, this.value + n);
    if (v === this.value || this.scene.player.downed) return false;
    this.value = v;
    this.scene.events.emit('hearts-changed');
    return true;
  }
}
