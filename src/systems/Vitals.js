import { CONFIG } from '../config.js';

// 하트와 배고픔 (5.5)
export class Vitals {
  constructor(scene) {
    this.scene = scene;
    this.hearts = CONFIG.player.maxHearts;
    this.hunger = CONFIG.player.maxHunger;
    this.hungerTimer = 0;
    this.starveTimer = 0;
  }

  update(dt) {
    const P = CONFIG.player;
    if (this.hunger > 0) {
      this.hungerTimer += dt;
      if (this.hungerTimer >= P.hungerInterval) {
        this.hungerTimer = 0;
        this.starveTimer = 0;
        this.hunger -= 1;
        this.changed();
      }
    } else {
      this.starveTimer += dt;
      if (this.starveTimer >= P.starveInterval) {
        this.starveTimer = 0;
        this.damage(1);
      }
    }
  }

  damage(n) {
    if (this.hearts <= 0) return;
    this.hearts = Math.max(0, this.hearts - n);
    this.changed();
    if (this.hearts === 0) this.scene.events.emit('player-collapsed');
  }

  heal(n) {
    this.hearts = Math.min(CONFIG.player.maxHearts, this.hearts + n);
    this.changed();
  }

  fillHearts() { this.heal(CONFIG.player.maxHearts); }

  // 먹어서 달라지는 것이 있으면 true
  canEat(kind) {
    const f = CONFIG.food[kind];
    return (f.hunger > 0 && this.hunger < CONFIG.player.maxHunger)
      || (f.heart > 0 && this.hearts < CONFIG.player.maxHearts);
  }

  eat(kind) {
    const f = CONFIG.food[kind];
    if (this.hunger === 0) this.hungerTimer = 0;
    this.hunger = Math.min(CONFIG.player.maxHunger, this.hunger + f.hunger);
    this.hearts = Math.min(CONFIG.player.maxHearts, this.hearts + f.heart);
    this.changed();
  }

  changed() { this.scene.events.emit('vitals-changed'); }
}
