import { CONFIG } from '../config.js';

// 두 색(0xrrggbb)을 k(0~1)만큼 섞는다
function mix(a, b, k) {
  const ch = (c, shift) => (c >> shift) & 0xff;
  const m = (shift) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

// 낮과 밤 (5.5). 낮 dayLength 초(끝의 duskLength 초는 저녁) -> 밤 nightLength 초 -> 다음 날 아침 -> ...
// 바뀌는 순간 scene.events 로 'dusk', 'night', 'morning'(날짜) 을 알린다.
export class TimeSystem {
  constructor(scene) {
    this.scene = scene;
    this.day = 1;            // 며칠째인가
    this.isNight = false;
    this.t = 0;              // 지금의 낮(또는 밤)이 시작된 뒤 흐른 게임 시간(초)
    this.dawn = 0;           // 아침에 화면색이 낮으로 돌아오기까지 남은 시간(초)
    this.duskShown = false;  // 오늘 저녁을 알렸는가
  }

  get length() { return this.isNight ? CONFIG.time.nightLength : CONFIG.time.dayLength; }
  get progress() { return Math.min(1, this.t / this.length); }
  get isDusk() { return !this.isNight && this.t >= CONFIG.time.dayLength - CONFIG.time.duskLength; }
  get label() { return `${this.day}일째 ${this.isNight ? '밤' : '낮'}`; }

  update(dt) {
    this.dawn = Math.max(0, this.dawn - dt);
    this.t += dt;
    if (this.isDusk && !this.duskShown) {
      this.duskShown = true;
      this.scene.events.emit('dusk');
    }
    if (this.t >= this.length) {
      const over = this.t - this.length;            // 넘친 시간은 다음으로 넘긴다
      if (this.isNight) this.startMorning();
      else this.startNight();
      this.t = over;
    }
  }

  // 밤이 된다
  startNight() {
    this.isNight = true;
    this.t = 0;
    this.dawn = 0;
    this.scene.events.emit('night');
  }

  // 아침이 된다: 다음 날 낮. 화면색은 dawnFade 초에 걸쳐 낮으로 돌아온다.
  startMorning() {
    this.isNight = false;
    this.t = 0;
    this.day += 1;
    this.duskShown = false;
    this.dawn = CONFIG.time.dawnFade;
    this.scene.events.emit('morning', this.day);
  }

  // 지금 시간의 화면색과 빛 세기 (3.7 표)
  //   낮 흰색·0 / 저녁 앞 절반 흰색→노을색·0 / 저녁 뒤 절반 노을색→밤색·0→1 / 밤 밤색·1 / 아침(dawnFade 초) 밤색→흰색·1→0
  ambient() {
    const T = CONFIG.time, C = CONFIG.colors;
    if (this.isNight) return { color: C.night, strength: 1 };
    if (this.dawn > 0) {
      const k = 1 - this.dawn / T.dawnFade;
      return { color: mix(C.night, C.day, k), strength: 1 - k };
    }
    const k = (this.t - (T.dayLength - T.duskLength)) / T.duskLength;   // 저녁이 얼마나 지났나(0~1)
    if (k <= 0) return { color: C.day, strength: 0 };
    if (k < 0.5) return { color: mix(C.day, C.dusk, k * 2), strength: 0 };
    const k2 = Math.min(1, (k - 0.5) * 2);
    return { color: mix(C.dusk, C.night, k2), strength: k2 };
  }
}
