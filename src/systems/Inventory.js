// 가방: 나무, 돌, 열매, 고기, 뼈다귀
export const ITEMS = ['wood', 'stone', 'berry', 'meat', 'bone'];

export class Inventory {
  constructor(scene) {
    this.scene = scene;
    this.items = { wood: 0, stone: 0, berry: 0, meat: 0, bone: 0 };
  }

  count(item) { return this.items[item] || 0; }

  add(item, amount) {
    this.items[item] = Math.max(0, this.count(item) + amount);
    this.scene.events.emit('inventory-changed');
  }

  // cost: { wood: 2, stone: 4 } 같은 묶음
  has(cost) { return Object.entries(cost).every(([k, v]) => this.count(k) >= v); }

  pay(cost) {
    if (!this.has(cost)) return false;
    for (const [k, v] of Object.entries(cost)) this.items[k] -= v;
    this.scene.events.emit('inventory-changed');
    return true;
  }

  // 나무와 돌을 rate 비율만큼 잃는다(쓰러지거나 집이 부서졌을 때)
  losePart(rate) {
    for (const k of ['wood', 'stone']) this.items[k] -= Math.floor(this.items[k] * rate);
    this.scene.events.emit('inventory-changed');
  }
}
