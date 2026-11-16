// 가방: 나무와 돌의 개수
export class Inventory {
  constructor(scene) {
    this.scene = scene;
    this.items = { wood: 0, stone: 0 };
  }

  count(item) { return this.items[item] || 0; }

  add(item, amount) {
    this.items[item] = this.count(item) + amount;
    this.scene.events.emit('inventory-changed');
  }

  // cost: { wood: 3, stone: 3 } 처럼 적는다
  has(cost) {
    return Object.entries(cost || {}).every(([item, n]) => this.count(item) >= n);
  }

  // 재료를 낸다. 모자라면 아무것도 빼지 않고 false.
  pay(cost) {
    if (!this.has(cost)) return false;
    for (const [item, n] of Object.entries(cost || {})) this.items[item] -= n;
    this.scene.events.emit('inventory-changed');
    return true;
  }
}
