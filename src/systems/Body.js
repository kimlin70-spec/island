import { CONFIG } from '../config.js';

// 걷기의 디딤 프레임(12.9): 이 그림이 나올 때 발밑에 먼지(모래 위면 발자국)
const STEP = new Set(['walk1', 'walk2', 'bwalk1', 'bwalk2']);
// 뒷모습이 없는 것(12.2): 맞기, 쓰러지기, 올라오기, 눈 깜빡임은 늘 앞모습
const FRONT_ONLY = new Set(['hurt', 'down', 'rise', 'blink', 'die']);

// 캐릭터 그림의 움직임 (12.1~12.4). 주인공과 적이 함께 쓴다. 살아 있는 캐릭터의 sprite.anims 는 여기서만 만진다.
// 규칙(언제 피해를 주는가)은 주인공과 적 쪽에 그대로 있고, 그림은 그 시각에 맞춘다: 피해를 주는 순간에 strike()로
// 그림을 hit 프레임에 맞추고 잠깐 멈춘다. 그림의 시간도 게임 시간(dt)으로 센다.
//   늘 하는 것: 서 있으면 idle, 걸으면 walk. 뒷모습이면 앞에 b 가 붙은 것(있을 때만. 적은 bidle 이 없어 서면 앞모습).
//   한 번 하는 것(play): 도구 쓰기, 공격, 눈 깜빡임. hit 프레임 전(휘두르기 시작)에는 맞아도 끊기지 않는다.
//   hit 가 있는 것은 주인이 strike(맞힘) 또는 pass(빗나감)를 부를 때까지 hit 프레임을 넘어가지 않는다.
//   그래서 프레임이 길어도 피해를 주는 순간보다 그림이 먼저 끝나지 않는다.
//   맞기(hurt), 멈칫(freeze), 밀림(knock), 끝 상태(final: down, rise).
// 매 프레임: tick(dt) -> (주인 쪽 규칙) -> show(걷는 중인가)
// 이 프레임의 tick 전에 생긴 시간은 그 tick 에서 줄이지 않는다(fresh). 그림은 다음 프레임부터 흐르기 때문이다.
export class Body {
  constructor(scene, sprite, key, opts = {}) {
    this.scene = scene;
    this.sprite = sprite;
    this.key = key;
    this.asset = scene.map.assets[key];
    this.A = this.asset.anims || {};
    this.back = false;          // 뒷모습인가(화면 위쪽을 보는가). 좌우는 sprite.flipX
    this.act = null;            // 한 번 하는 것 { name, back, t, total, hitAt, struck, fresh }
    this.hurtLeft = 0;          // hurt 그림을 보여 줄 남은 시간(초)
    this.hurtFresh = false;
    this.freezeLeft = 0;        // 멈칫(그림만 멈춤) 남은 시간(초)
    this.freezeFresh = false;
    this.knock = null;          // 밀림 { ux, uy, t, fresh }
    this.final = null;          // 끝 상태: 'down' | 'rise'
    this.finalLeft = Infinity;  // 끝 상태가 끝나기까지 남은 시간(초). rise 만 끝난다
    this.finalFresh = false;
    this.playing = null;        // 지금 틀고 있는 애니메이션 이름
    this.blinkLeft = opts.blink ? this.nextBlink() : null;
    // 마지막으로 tick 한 프레임 번호. 프레임 사이(누르기)에 생기면 이번 프레임은 끝난 것으로 친다.
    this.ticked = scene.updating ? -1 : scene.frame;
    this.onStep = null;         // 디딤 프레임이 나올 때 부른다
    this.mute = false;          // walk <-> bwalk 를 이어 틀 때는 디딤으로 치지 않는다
    // 걷기의 첫 프레임은 animationstart 로만 온다. 둘 다 본다.
    this.shown = (anim, frame) => {
      if (!this.mute && this.onStep && frame && STEP.has(this.asset.frames[Number(frame.textureFrame)])) this.onStep();
    };
    sprite.on('animationstart', this.shown);
    sprite.on('animationupdate', this.shown);
  }

  // 그림을 다른 곳(쓰러진 적)에 넘길 때: 더는 디딤을 알리지 않는다
  detach() {
    this.sprite.off('animationstart', this.shown);
    this.sprite.off('animationupdate', this.shown);
    this.onStep = null;
  }

  // 이 프레임에 아직 tick 하지 않았다: 지금 생긴 시간은 이 프레임의 tick 에서 줄이지 않는다
  get fresh() { return this.ticked !== this.scene.frame; }

  nextBlink() { const [a, b] = CONFIG.fx.blinkEvery; return a + Math.random() * (b - a); }

  has(name) { return !!this.A[name]; }
  // 뒷모습이면 b 가 붙은 것(있을 때만)
  pick(name) { return this.back && !FRONT_ONLY.has(name) && this.A['b' + name] ? 'b' + name : name; }
  // 애니메이션 전체 시간(초)
  ms(name) { return this.A[name] ? this.A[name].frames.reduce((s, f) => s + f[1], 0) / 1000 : 0; }
  // hit 프레임이 나오기까지의 시간(초). hit 가 없으면 null
  hitAt(name) {
    const a = this.A[name];
    if (!a || !a.hit) return null;
    let t = 0;
    for (const [f, ms] of a.frames) { if (f === a.hit) return t / 1000; t += ms; }
    return null;
  }

  // 화면 방향 (dx, dy)를 본다 (12.2): dx < 0 이면 왼쪽(뒤집기), dy < 0 이면 뒷모습, dy > 0 이면 앞모습. 0 이면 그대로 둔다.
  face(dx, dy) {
    if (dx < 0) this.sprite.setFlipX(true);
    else if (dx > 0) this.sprite.setFlipX(false);
    if (dy < 0) this.back = true;
    else if (dy > 0) this.back = false;
  }
  // 때리는 목표 쪽을 본다: 목표가 화면 위쪽이면 뒷모습, 그 밖(옆이나 아래)은 앞모습 (12.2)
  look(dx, dy) { this.face(dx, dy < 0 ? -1 : 1); }

  // Phaser 애니메이션을 튼다. at: 이미 지난 시간(초) -> 그 시간이 든 프레임부터
  run(n, at = 0) {
    const fr = this.A[n].frames, atMs = at * 1000;
    let startFrame = 0, t = 0;
    for (let i = 0; i < fr.length; i++) {
      startFrame = i;
      t += fr[i][1];
      if (atMs < t - 0.001) break;
    }
    this.sprite.play({ key: this.key + ':' + n, startFrame });
    if (this.sprite.anims.isPaused) this.sprite.anims.resume();
    this.playing = n;
  }

  // 한 번 하는 것을 시작한다(도구 쓰기, 공격, 눈 깜빡임). at: 늦게 시작할 때 이미 지난 시간(초)
  play(name, at = 0) {
    if (this.final) return null;
    const n = this.pick(name);
    if (!this.A[n]) return null;
    const hitAt = this.hitAt(n);
    this.act = { name: n, back: n !== name, t: hitAt === null ? at : Math.min(at, hitAt), total: this.ms(n), hitAt, struck: false, fresh: this.fresh };
    this.hurtLeft = 0;
    this.run(n, at);
    if (this.freezeLeft > 0) this.sprite.anims.pause();
    return this.act;
  }

  // 하던 한 번 하는 것을 그만둔다. 다음 show 에서 늘 하는 것으로 돌아간다.
  cancel() { this.act = null; }

  // 도구 쓰기·공격 중인가(hit 프레임 전이든 뒤든)
  attacking() { return !!(this.act && this.act.hitAt !== null); }
  // 아직 맞히지(또는 빗나가지) 않았는가(휘두르기 시작)
  winding() { return this.attacking() && !this.act.struck; }
  // 맞아도 hurt 로 끊지 않는 때: 휘두르기 시작과, 맞힌 순간의 멈칫(hit 프레임이 보이는 동안)
  guarded() { return this.attacking() && (!this.act.struck || this.act.t <= this.act.hitAt); }

  // 피해를 준 순간 (12.4, 12.5): 그림을 hit 프레임에 맞추고, 휘두른 궤적을 남기고, 잠깐 멈춘다.
  // pause 가 false 면 멈추지 않는다(총을 쏜 순간: 맞는 것은 총알이 닿을 때다)
  strike(pause = true) {
    const a = this.act;
    if (a && a.hitAt !== null) {
      a.t = a.hitAt;
      a.struck = true;
      a.fresh = false;
      this.run(a.name, a.hitAt);
      const sw = this.A[a.name].swing;
      if (sw) this.scene.effects.swingTrail(this.sprite, sw, a.back);
    }
    if (pause) this.freeze();
  }

  // 피해 없이 hit 시각을 지났다(빗나감, 텐트 안의 주인공을 친 것 등): 멈칫 없이 따라 내려가는 동작을 마저 한다
  pass() {
    if (this.attacking()) this.act.struck = true;
  }

  // 그림만 time 초 멈춘다(게임은 그대로 흐른다)
  freeze(time = CONFIG.fx.hitStop) {
    if (this.final) return;
    if (time > this.freezeLeft) {
      this.freezeLeft = time;
      this.freezeFresh = this.fresh;
    }
    this.sprite.anims.pause();
  }

  // 맞았다: 휘두르기 시작과 맞힌 순간(hit 프레임)은 끊지 않는다. 그 밖에는 hurt 그림을 그 시간만큼 보여 주고,
  // 끝나면 지금 할 것(걷기·서 있기)으로 돌아간다(따라 내려가던 동작은 다시 잇지 않는다).
  hurt() {
    if (this.final || this.guarded() || !this.A.hurt) return;
    this.act = null;
    this.hurtLeft = this.ms('hurt');
    this.hurtFresh = this.fresh;
    this.run('hurt');
    if (this.freezeLeft > 0) this.sprite.anims.pause();
  }

  // 밀림: (dx, dy) 쪽으로 knockbackTime 동안 밀려 나가고, 맞은 그림(hurt)과 멈칫이 끝나면 제자리로.
  // 쓰러진 주인공은 밀린 채로 있는다.
  knockFrom(dx, dy) {
    const L = Math.hypot(dx, dy);
    if (!L) return;
    this.knock = { ux: dx / L, uy: dy / L, t: 0, fresh: this.fresh };
  }

  // 그림을 이만큼 옮겨 그린다(밀림). 규칙의 위치는 그대로다.
  offset() {
    const k = this.knock;
    if (!k) return { x: 0, y: 0 };
    const F = CONFIG.fx;
    const d = F.knockback * Math.sin(Math.min(1, k.t / F.knockbackTime) * Math.PI / 2);
    return { x: k.ux * d, y: k.uy * d };
  }

  // 끝 상태(down, rise): 다른 무엇도 이 그림을 바꾸지 않는다. time 초가 지나면 끝난다(rise).
  setFinal(name, time = Infinity) {
    this.final = name;
    this.finalLeft = time;
    this.finalFresh = this.fresh;
    this.act = null;
    this.hurtLeft = 0;
    this.freezeLeft = 0;
    if (this.A[name]) this.run(name);
  }

  tick(dt) {
    this.ticked = this.scene.frame;
    // 이번 프레임에 그림이 멈춰 있었는가. 이번 프레임(이 tick 전)에 생긴 멈칫은 그림이 이미 이번 몫만큼 움직인 뒤에 걸렸다.
    const frozen = this.freezeLeft > 0 && !this.freezeFresh;
    this.freezeFresh = false;
    const a = this.act;
    if (frozen) {
      if ((this.freezeLeft -= dt) <= 0) {
        this.freezeLeft = 0;
        this.sprite.anims.resume();
      }
      if (a) a.fresh = false;                        // 멈춘 동안 생긴 것은 멈칫이 풀린 뒤부터 센다
      this.hurtFresh = false;
    } else {
      if (a) {
        if (a.fresh) a.fresh = false;
        else {
          a.t += dt;
          if (!a.struck && a.hitAt !== null) a.t = Math.min(a.t, a.hitAt);   // 맞히기 전에는 hit 프레임에서 기다린다
          if (a.t >= a.total) this.act = null;
        }
      }
      if (this.hurtLeft > 0) {
        if (this.hurtFresh) this.hurtFresh = false;
        else this.hurtLeft = Math.max(0, this.hurtLeft - dt);
      }
    }
    if (this.final && this.finalLeft !== Infinity) {
      if (this.finalFresh) this.finalFresh = false;
      else if ((this.finalLeft -= dt) <= 0) {
        this.final = null;
        this.finalLeft = Infinity;
      }
    }
    const k = this.knock;
    if (k) {
      if (k.fresh) k.fresh = false;
      else k.t += dt;
      if (k.t >= CONFIG.fx.knockbackTime && this.hurtLeft <= 0 && this.freezeLeft <= 0 && this.final !== 'down') this.knock = null;
    }
    // 눈 깜빡임(주인공): 앞모습으로 서 있는 동안만 세다가 blink 를 한 번
    if (this.blinkLeft !== null && !this.act && this.hurtLeft <= 0 && this.freezeLeft <= 0 && !this.final && this.playing === 'idle') {
      if ((this.blinkLeft -= dt) <= 0) {
        this.blinkLeft = this.nextBlink();
        this.play('blink');
      }
    }
  }

  // 지금 보여 줄 애니메이션을 고른다. 순서: 끝 상태 > 휘두르기 시작 > 맞기 > 따라 내려감·깜빡임 > 걷기·서 있기.
  // 걷기 시작하면 하던 한 번 하는 것은 그만둔다. 바뀔 때만 틀고, 멈칫 중에는 바꾸지 않는다.
  show(stepping) {
    if (this.freezeLeft > 0) return;
    if (stepping && this.act) this.act = null;
    let n;
    if (this.final) n = this.final;
    else if (this.winding()) n = this.act.name;
    else if (this.hurtLeft > 0) n = 'hurt';
    else if (this.act) n = this.act.name;
    else n = this.pick(stepping ? 'walk' : 'idle');
    if (n === this.playing || !this.A[n]) return;
    // walk <-> bwalk 는 지금 프레임 번호에서 잇는다(다리가 튀지 않게)
    const cont = (n === 'walk' && this.playing === 'bwalk') || (n === 'bwalk' && this.playing === 'walk');
    const cur = this.sprite.anims.currentFrame;
    this.mute = cont;
    this.sprite.play({ key: this.key + ':' + n, startFrame: cont && cur ? cur.index - 1 : 0 });
    this.mute = false;
    this.playing = n;
  }
}
