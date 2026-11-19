import { CONFIG } from '../config.js';
import { worldToTileFloat } from '../iso.js';

// 효과음 (15장). GameScene 이 하나 만들고(scene.sfx), UIScene 도 이것으로 튼다.
//   한 번 트는 소리: play(이름, { at: 월드 좌표, volume, detune })
//     - 화면을 처음 누르기 전(sound.locked)에는 틀지 않고 건너뛴다(쌓아 두지 않는다).
//     - at 이 있으면(월드에서 나는 소리) 카메라 가운데에서 그 자리까지의 거리로 크기를 줄인다(fullRange 안 그대로, hearRange 에서 0).
//     - 같은 소리는 sameSoundGap 초 안에 다시 틀지 않고, 동시에 maxSame 개까지만.
//   반복 소리(배경, 모닥불): loop(이름, 크기). 크기는 loopFade 초에 걸쳐 바뀐다. 0 이면 소리는 멈추지 않고 들리지 않게만.
//   켜고 끄기: toggleMute(). 상태는 브라우저에 기억한다(localStorage, 읽고 쓸 때 try/catch).
const DETUNE = new Set(['hit_wood', 'hit_stone', 'hit_iron', 'hit_enemy', 'swing', 'step', 'step_snow']);   // 15.2
const MUTE_KEY = 'island-survival.mute';

export class Sound {
  constructor(scene) {
    this.scene = scene;
    this.sound = scene.sound;
    this.last = {};            // 이름 -> 마지막으로 튼 때(now, 초)
    this.now = 0;              // 이 소리 도구의 시계(실제 시간, 초). update 에서 센다
    this.loops = {};           // 이름 -> { snd, target }
    let muted = false;
    try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 켠 채로 */ }
    this.isMuted = muted;      // 엔진의 mute 는 읽으면 바로 바뀌지 않을 때가 있어서 따로 기억한다
    this.sound.mute = muted;
  }

  get muted() { return this.isMuted; }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.sound.mute = this.isMuted;
    try { window.localStorage.setItem(MUTE_KEY, this.isMuted ? '1' : '0'); } catch (e) { /* 기억하지 못해도 된다 */ }
    return this.isMuted;
  }

  // 월드 좌표 (x, y)의 소리 크기 배수: 카메라 가운데에서의 거리(칸)로. 들리지 않으면 0
  distanceGain(x, y) {
    const S = CONFIG.sound, cam = this.scene.cameras.main;
    const a = worldToTileFloat(cam.midPoint.x, cam.midPoint.y), b = worldToTileFloat(x, y);
    const d = Math.hypot(a.col - b.col, a.row - b.row);
    if (d <= S.fullRange) return 1;
    if (d >= S.hearRange) return 0;
    return 1 - (d - S.fullRange) / (S.hearRange - S.fullRange);
  }

  play(name, { at = null, volume = 1 } = {}) {
    const S = CONFIG.sound, snd = this.sound;
    if (snd.locked || !this.scene.cache.audio.exists(name)) return;
    const gain = at ? this.distanceGain(at.x, at.y) : 1;
    if (gain <= 0) return;
    const now = this.now;
    if (this.last[name] !== undefined && now - this.last[name] < S.sameSoundGap) return;
    if (snd.getAll(name).filter((s) => s.isPlaying).length >= S.maxSame) return;
    this.last[name] = now;
    const detune = DETUNE.has(name) ? (Math.random() * 2 - 1) * S.detune : 0;
    snd.play(name, { volume: volume * gain * S.master, detune });
  }

  // 반복 소리의 크기를 volume 으로(loopFade 초에 걸쳐). 배경 소리는 ambience 를 곱해서 부른다.
  loop(name, volume, fade = true) {
    const S = CONFIG.sound;
    let L = this.loops[name];
    if (!L) {
      if (!this.scene.cache.audio.exists(name)) return;
      L = this.loops[name] = { snd: this.sound.add(name, { loop: true, volume: 0 }), target: 0, tween: null };
    }
    const target = volume * S.master;
    if (Math.abs(L.target - target) < 1e-4) return;
    L.target = target;
    if (L.tween) L.tween.stop();
    L.tween = null;
    if (!fade) L.snd.setVolume(target);
    else L.tween = this.scene.tweens.add({ targets: L.snd, volume: target, duration: S.loopFade * 1000 });
  }

  // 매 프레임(real: 이번 프레임의 실제 시간, 초): 시계를 세고, 화면을 처음 누른 뒤부터 반복 소리를 튼다(그 전에는 틀 수 없다)
  update(real) {
    this.now += real;
    if (this.sound.locked) return;
    for (const L of Object.values(this.loops)) if (!L.snd.isPlaying) L.snd.play();
  }
}
