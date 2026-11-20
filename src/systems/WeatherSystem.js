import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';

// 날씨 (14장): 맑음, 비, 눈. 아침마다 그날의 날씨를 정하고(1일째는 늘 맑음), 바뀔 때는 fade 초에 걸쳐 서서히.
// 비와 눈의 무늬, 어둡게 하기는 월드의 맨 위(depth 60000 이상, 화면에 고정)에 그린다. 빛 지도와 UI(UIScene)는 그 위다.
const DEPTH = { shade: 60000, far: 60001, near: 60002 };
const NOTICE = { clear: '날이 갰습니다', rain: '비가 내립니다', snow: '눈이 내립니다' };
const PUDDLE_TERRAIN = [1, 2, 3, 4];     // 모래, 풀, 숲, 흙 (14.2)

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.kind = CONFIG.weather.firstDay;   // 지금의 날씨
    this.level = { rain: 0, snow: 0 };     // 서서히 바뀌는 세기(0~1)
    this.cover = 0;                        // 쌓인 눈(0~1)
    this.splashLeft = 0;
    this.puddles = [];
    this.time = 0;
    const W = scene.scale.width, H = scene.scale.height;
    const layer = (key, P, d) => scene.add.tileSprite(0, 0, W, H, key).setOrigin(0, 0).setScrollFactor(0).setDepth(d)
      .setTileScale(P.scale || 1).setAlpha(0).setVisible(false);
    const R = CONFIG.weather.rain, S = CONFIG.weather.snow;
    const shade = (color) => scene.add.rectangle(0, 0, W, H, color).setOrigin(0, 0).setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(DEPTH.shade).setAlpha(0).setVisible(false);
    this.rain = { shade: shade(R.shade), far: layer('overlay_rain', R.far, DEPTH.far), near: layer('overlay_rain', R.near, DEPTH.near) };
    this.snow = { shade: shade(S.shade), far: layer('overlay_snow', S.far, DEPTH.far), near: layer('overlay_snow', S.near, DEPTH.near) };
    this.snowGround = null;                // 눈 덮인 바닥 조각(처음 눈이 올 때 불러온다)
    scene.events.on('morning', () => this.newDay());
  }

  get snowy() { return !this.scene.ug.active && this.cover > CONFIG.weather.snow.footprintCover; }   // 디딜 때 발자국과 step_snow

  // 아침: 그날의 날씨를 chance 로 정한다
  newDay() {
    const C = CONFIG.weather.chance;
    let r = Math.random(), kind = 'clear';
    for (const [k, p] of Object.entries(C)) { if (r < p) { kind = k; break; } r -= p; }
    this.set(kind);
  }

  // 날씨를 바꾼다(시험용 도구도 이것)
  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    if (!this.scene.ug.active) this.scene.notice(NOTICE[kind]);
    else if (kind !== 'clear') this.scene.surfaceNews(NOTICE[kind]);   // (지하) 비나 눈이 오기 시작하면 땅 위 소식 (17.9)
    if (kind === 'rain') this.makePuddles();
    else this.dryPuddles();
    if (kind === 'snow') this.loadSnowGround();
    this.scene.events.emit('weather-changed', kind);
  }

  // 시험용 "날씨 바꾸기": 맑음 -> 비 -> 눈 -> 맑음
  cycle() { this.set({ clear: 'rain', rain: 'snow', snow: 'clear' }[this.kind]); }

  // ── 눈 덮인 바닥 (14.3): 보통 바닥 조각과 같은 자리, 같은 setCrop, depth 1 ──
  loadSnowGround() {
    if (this.snowGround) return;
    this.snowGround = [];
    const scene = this.scene, G = scene.map.ground, missing = G.snowChunks.filter((c) => !scene.textures.exists(c.key));
    const place = () => {
      for (const ch of G.snowChunks) {
        this.snowGround.push(scene.add.image(ch.x, ch.y, ch.key).setOrigin(0, 0)
          .setCrop(G.chunkMargin, G.chunkMargin, G.chunkStep, G.chunkStep).setDepth(CONFIG.depth.snow).setAlpha(this.cover));
      }
    };
    if (!missing.length) { place(); return; }
    for (const ch of missing) scene.load.image(ch.key, 'assets/' + ch.file);
    scene.load.once('complete', place);
    scene.load.start();
  }

  // ── 웅덩이 (14.2): 카메라 둘레 ±10칸 안의 빈 땅 10곳에 6초에 걸쳐 나타나고, 비가 그치면 20초에 걸쳐 사라진다 ──
  makePuddles() {
    const R = CONFIG.weather.rain, scene = this.scene, m = scene.map, cam = scene.cameras.main;
    const c = worldToTile(cam.midPoint.x, cam.midPoint.y), cands = [];
    for (let r = c.row - R.puddleRange; r <= c.row + R.puddleRange; r++) for (let col = c.col - R.puddleRange; col <= c.col + R.puddleRange; col++) {
      if (!m.isLand(col, r) || !PUDDLE_TERRAIN.includes(m.map.terrain[r][col])) continue;
      if (m.objectAt(col, r) || m.anyStructureAt(col, r) || scene.farm.fieldAt(col, r)) continue;
      if (this.puddles.some((p) => p.col === col && p.row === r)) continue;
      cands.push({ col, row: r });
    }
    for (let i = 0; i < R.puddles && cands.length; i++) {
      const t = cands.splice(Math.floor(Math.random() * cands.length), 1)[0], w = tileToWorld(t.col, t.row);
      const key = Math.random() < 0.5 ? 'decal_puddle_1' : 'decal_puddle_2', a = m.assets[key];
      const img = scene.add.image(w.x, w.y, key).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.footprint).setAlpha(0);
      this.puddles.push({ col: t.col, row: t.row, img, rate: 1 / R.puddleIn });
    }
  }

  dryPuddles() { for (const p of this.puddles) p.rate = -1 / CONFIG.weather.rain.puddleOut; }

  // ── 매 프레임 ──
  update(dt) {
    const W = CONFIG.weather, scene = this.scene;
    this.time += dt;
    for (const k of ['rain', 'snow']) {                          // 세기를 fade 초에 걸쳐
      const want = this.kind === k ? 1 : 0, step = dt / W.fade;
      this.level[k] = want > this.level[k] ? Math.min(want, this.level[k] + step) : Math.max(want, this.level[k] - step);
    }
    // 비: 무늬가 오른쪽 아래로 흐른다. 화면을 어둡게 한다.
    const R = W.rain, rl = this.level.rain;
    this.show(this.rain, rl, R);
    if (rl > 0) {
      this.flow(this.rain.far, R.far.speed[0], R.far.speed[1], dt);
      this.flow(this.rain.near, R.near.speed[0], R.near.speed[1], dt);
      this.splashLeft -= dt;
      while (this.splashLeft <= 0) {
        this.splashLeft += R.splashEvery;
        if (Math.random() < rl && !scene.ug.active) this.splash();
      }
    }
    // 눈: 아래로 천천히, 좌우로 흔들며. 화면을 밝게.
    const S = W.snow, sl = this.level.snow;
    this.show(this.snow, sl, S);
    if (sl > 0) {
      const ms = this.time * 1000;
      this.snow.far.tilePositionY -= S.far.fall * dt;
      this.snow.near.tilePositionY -= S.near.fall * dt;
      this.snow.far.tilePositionX = -S.far.sway * Math.sin(ms / S.far.swayPeriod);
      this.snow.near.tilePositionX = -S.near.sway * Math.sin(ms / S.near.swayPeriod);
    }
    // 쌓인 눈: 눈이 오는 동안 coverIn 초에 1까지, 그친 뒤 coverOut 초에 0까지(녹음)
    this.cover = this.kind === 'snow' ? Math.min(1, this.cover + dt / S.coverIn) : Math.max(0, this.cover - dt / S.coverOut);
    if (this.snowGround) for (const img of this.snowGround) img.setAlpha(this.cover).setVisible(this.cover > 0);
    // 웅덩이
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i], a = Math.max(0, Math.min(1, p.img.alpha + p.rate * dt));
      p.img.setAlpha(a);
      if (p.rate < 0 && a <= 0) { p.img.destroy(); this.puddles.splice(i, 1); }
    }
    // 비가 오는 동안 모든 밭은 젖어 있다
    if (this.kind === 'rain') for (const f of scene.farm.fields.values()) if (!f.wet) scene.farm.setWet(f, true);
    // 소리: 비 rain_loop, 눈 wind_loop (15.3. 배경 소리라 ambience 를 곱한다)
    const amb = scene.ug.active ? 0 : CONFIG.sound.ambience;   // (지하) 비와 바람 소리는 들리지 않는다
    if (rl > 0 || scene.sfx.loops.rain_loop) scene.sfx.loop('rain_loop', rl * amb, false);
    if (sl > 0 || scene.sfx.loops.wind_loop) scene.sfx.loop('wind_loop', sl * amb, false);
  }

  // 무늬와 어둡게 하기의 진하기 = 정해진 투명도 × 세기
  show(L, level, P) {
    const on = level > 0 && !this.scene.ug.active;     // (지하) 날씨 무늬는 감춘다 (17.2)
    L.shade.setVisible(on).setAlpha(level);
    L.far.setVisible(on).setAlpha(P.far.alpha * level);
    L.near.setVisible(on).setAlpha(P.near.alpha * level);
  }

  // 무늬를 (vx, vy) px/초로 흐르게 한다(tilePosition 을 줄이면 무늬는 오른쪽 아래로 간다)
  flow(ts, vx, vy, dt) {
    ts.tilePositionX -= vx * dt / ts.tileScaleX;
    ts.tilePositionY -= vy * dt / ts.tileScaleY;
  }

  // 화면 안의 땅 아무 곳에 튀는 물방울 한 번(depth 3)
  splash() {
    const scene = this.scene, cam = scene.cameras.main, v = cam.worldView;
    const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height, t = worldToTile(x, y);
    if (!scene.map.isLand(t.col, t.row)) return;
    scene.effects.play('fx_rain_splash', x, y, { depth: CONFIG.depth.floor });
  }

  // 시계 옆의 날씨 아이콘(맑음이면 없음)
  icon() { return this.kind === 'clear' ? null : 'icon_' + this.kind; }
}
