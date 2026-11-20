import { CONFIG } from '../config.js';
import { tileToWorld } from '../iso.js';

// 배고픔 (16장)과 덤불 열매(16.3). config.hunger.enabled 가 false 면 배부름은 없고, 먹을 것은 하트를 채운다(13.3).
// 덤불 열매는 배고픔을 꺼도 딸 수 있다.
export const FOODS = ['berry', 'carrot', 'corn', 'pumpkin'];   // 가방에서 눌러 먹는 것(버섯은 17장)

export class HungerSystem {
  constructor(scene) {
    this.scene = scene;
    const H = CONFIG.hunger;
    this.value = H.start;
    this.drainLeft = H.drainEvery;
    this.starveLeft = H.starveEvery;
    scene.events.on('morning', () => this.regrowBerries());
  }

  get enabled() { return CONFIG.hunger.enabled; }
  get max() { return CONFIG.hunger.max; }
  // 다 비었다: 이 동안은 텐트와 아침의 하트 회복이 없다(16.1)
  get starving() { return this.enabled && this.value <= 0; }

  set(v) {
    const before = this.value;
    this.value = Math.max(0, Math.min(this.max, v));
    if (this.value === before) return;
    if (this.value > 0) this.starveLeft = CONFIG.hunger.starveEvery;
    this.scene.events.emit('hunger-changed');
  }

  // 게임 시간 drainEvery 초마다 1. warnAt 이 되면 "배가 고픕니다", 0 이 되면 "배가 너무 고픕니다".
  // 0 인 동안은 starveEvery 초마다 하트 1(쓰러질 수도 있다)
  update(dt) {
    if (!this.enabled || this.scene.player.downed) return;
    const H = CONFIG.hunger, scene = this.scene;
    this.drainLeft -= dt;
    while (this.drainLeft <= 0 && this.value > 0) {
      this.drainLeft += H.drainEvery;
      this.set(this.value - 1);
      if (this.value === H.warnAt) {
        scene.notice('배가 고픕니다');
        scene.sfx.play('hungry');
      } else if (this.value === 0) scene.notice('배가 너무 고픕니다');
    }
    if (this.value > 0) return;
    this.drainLeft = Math.max(this.drainLeft, 0);
    this.starveLeft -= dt;
    if (this.starveLeft > 0) return;
    this.starveLeft += H.starveEvery;
    this.starve();
  }

  // 굶어서 하트 1. 텐트 안이어도 줄고, 0 이 되면 텐트에서 나와 쓰러진다
  starve() {
    const scene = this.scene, pl = scene.player;
    scene.sfx.play('hungry');
    scene.hearts.damage(1);
    const down = scene.hearts.value <= 0;
    if (scene.rest.resting) {
      if (down) scene.rest.exit();
      else return;
    }
    pl.struck(null, down);
    if (down) pl.goDown();
  }

  // ── 먹기 (16.2, 13.3) ──

  // 가방의 먹을 것을 눌렀다: 배고픔이 켜져 있으면 배부름 +food(가득이면 "배가 부릅니다"),
  // 꺼져 있으면 하트 +heal(가득이면 "하트가 가득 찼습니다")
  eat(item) {
    const scene = this.scene;
    if (scene.inventory.count(item) <= 0 || scene.player.downed) return;
    if (this.enabled) {
      if (this.value >= this.max) { scene.error('배가 부릅니다'); return; }
      scene.inventory.add(item, -1);
      this.set(this.value + CONFIG.hunger.food[item]);
    } else {
      if (scene.hearts.value >= scene.hearts.max) { scene.error('하트가 가득 찼습니다'); return; }
      scene.inventory.add(item, -1);
      scene.hearts.heal(item === 'berry' ? CONFIG.berries.heal : CONFIG.farm.crops[item].heal);
      scene.heartsUp();
    }
    scene.sfx.play('eat');
    if (!scene.rest.resting) scene.player.body.play('eat');
  }

  // ── 덤불 열매 (16.3) ──

  // 덤불을 눌렀다: 붙은 칸으로 가서 crouch, hit 프레임에 열매 +perBush. 딴 덤불은 "열매가 아직 없습니다"
  pressBush(o) {
    const scene = this.scene;
    if (o.picked) { scene.error('열매가 아직 없습니다'); return; }
    scene.player.act({
      target: o,
      tool: () => 'crouch',
      isValid: () => !o.picked && scene.map.objects.includes(o),
      strike: () => { this.pick(o); return true; },
    });
  }

  pick(o) {
    const scene = this.scene, fx = scene.effects, B = CONFIG.berries, w = tileToWorld(o.col, o.row);
    o.picked = true;
    this.setBushKey(o, o.key + '_picked');
    scene.inventory.add('berry', B.perBush);
    fx.popup(w.x, w.y - 40, 'icon_berry', '+' + B.perBush);
    fx.burst(['leaf1', 'leaf2'], CONFIG.fx.chips.berry, w.x, w.y - 20);
    scene.sfx.play('pickup');
  }

  // 그림을 바꾼다. 기준점은 manifest 값대로(같은 자리에 선다)
  setBushKey(o, key) {
    const a = this.scene.map.assets[key];
    o.sprite.setTexture(key).setOrigin(a.originX, a.originY);
  }

  // 아침: 딴 덤불에 열매가 다시 열린다
  regrowBerries() {
    for (const o of this.scene.map.objects) {
      if (o.kind !== 'bush' || !o.picked) continue;
      o.picked = false;
      this.setBushKey(o, o.key);
    }
  }
}
