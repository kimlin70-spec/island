import { CONFIG } from '../config.js';

// 낮과 밤 (5.6). 낮 → (마지막 30초는 저녁) → 밤 → 아침, 반복.
export class TimeSystem {
  constructor(scene) {
    this.scene = scene;
    this.day = 1;            // 며칠째
    this.phase = 'day';      // 'day' | 'night'
    this.t = 0;              // 지금 낮/밤이 시작된 뒤 흐른 시간(초)
    this.evening = false;
  }

  get isNight() { return this.phase === 'night'; }
  get length() { return this.isNight ? CONFIG.time.nightLength : CONFIG.time.dayLength; }
  get progress() { return Math.min(1, this.t / this.length); }
  get label() { return `${this.day}일째 ${this.isNight ? '밤' : '낮'}`; }

  update(dt) {
    this.t += dt;
    if (!this.isNight) {
      if (!this.evening && this.t >= CONFIG.time.dayLength - CONFIG.time.eveningLength) {
        this.evening = true;
        this.scene.events.emit('evening');
      }
      if (this.t >= CONFIG.time.dayLength) this.startNight();
    } else if (this.t >= CONFIG.time.nightLength) {
      this.startMorning();
    }
  }

  startNight() {
    if (this.isNight) return;
    this.phase = 'night';
    this.t = 0;
    this.evening = false;
    this.scene.events.emit('night');
  }

  startMorning() {
    if (!this.isNight) return;
    this.phase = 'day';
    this.t = 0;
    this.day += 1;
    this.scene.events.emit('morning');
  }
}
