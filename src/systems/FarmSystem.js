import { CONFIG } from '../config.js';
import { tileToWorld, worldToTile } from '../iso.js';

// (3단계) 농사 (13.3): 씨앗 상자, 밭 갈기, 심기, 물 주기, 자라기, 거두기, 먹기.
// 밭은 바닥에 붙는 그림(depth 2)이고 누구나 밟고 지나간다. 작물은 사물처럼 발 위치로 앞뒤를 정한다. 적은 밭과 작물을 무시한다.
// 주인공의 동작(걸어가서 괭이질, 물 주기, 쪼그려 앉기)은 Player.act 로 하고, 그 hit 프레임에 여기의 일이 일어난다.
export const CROPS = ['carrot', 'corn', 'pumpkin'];
const STAGES = ['seed', 'sprout', 'grow', 'ripe'];
const ICON = { carrot: 'icon_carrot', corn: 'icon_corn', pumpkin: 'icon_pumpkin' };
const seedItem = (crop) => 'seed_' + crop;

export class FarmSystem {
  constructor(scene) {
    this.scene = scene;
    this.map = scene.map;
    this.fields = new Map();       // 'col,row' -> { col, row, soil, wet, crop: { type, stage, t, sprite, sway } | null }
    this.crate = null;             // 씨앗 상자(맵의 사물). 열면 사라진다
    this.crateDue = false;         // 놓아야 하는데 그 칸이 막혀 있어서 기다리는 중
  }

  key(col, row) { return col + ',' + row; }
  fieldAt(col, row) { return this.fields.get(this.key(col, row)) || null; }
  get count() { return this.fields.size; }
  seeds() { return CROPS.filter((c) => this.scene.inventory.count(seedItem(c)) > 0); }

  // ── 씨앗 상자 ──

  // 2단계가 시작되면(사용자와 정함: 농사 카드와 함께) map.seedCrate 칸에 놓는다. 그 칸에 무엇이 있으면 빌 때까지 기다린다.
  placeCrate() {
    if (this.crate || this.crateOpened) return;
    this.crateDue = true;
    this.tryCrate();
  }

  tryCrate() {
    const at = this.scene.mapData.seedCrate, m = this.map;
    if (!at || !m.isPassable(at.col, at.row) || m.objectAt(at.col, at.row) || m.wireAt(at.col, at.row) || this.fieldAt(at.col, at.row)) return;
    if (this.scene.characterTiles().some((t) => t.col === at.col && t.row === at.row)) return;
    const a = m.assets.obj_seed_crate, w = tileToWorld(at.col, at.row);
    const sprite = this.scene.add.sprite(w.x, w.y, 'obj_seed_crate', a.frames.indexOf('closed'))
      .setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.objectBase + w.y);
    this.crate = { kind: 'crate', key: 'obj_seed_crate', col: at.col, row: at.row, sprite, tiles: [{ col: at.col, row: at.row }],
      blocks: true, tall: false, pickable: true };
    m.objects.push(this.crate);
    m.objectGrid[at.row * m.cols + at.col] = this.crate;
    this.crateDue = false;
    this.scene.onMapChanged();
  }

  // 상자를 눌렀다: 붙은 칸으로 가서 crouch, hit 프레임에 열고 씨앗을 얻는다
  pressCrate(o) {
    this.scene.player.act({
      target: o,
      tool: () => 'crouch',
      isValid: () => this.crate === o && !o.opened,
      strike: () => { this.openCrate(o); return true; },
    });
  }

  openCrate(o) {
    const F = CONFIG.farm, scene = this.scene, fx = scene.effects, sp = o.sprite;
    o.opened = true;
    o.pickable = false;
    this.crateOpened = true;
    sp.setFrame(scene.map.assets.obj_seed_crate.frames.indexOf('open'));
    let line = 0;
    for (const [crop, n] of Object.entries(F.crateSeeds)) {
      scene.inventory.add(seedItem(crop), n);
      fx.popup(sp.x, sp.y - 40 - line++ * (CONFIG.fx.popupIcon + 2), 'icon_seed_' + crop, '+' + n);
    }
    scene.sfx.play('pickup');
    // 2초 뒤 0.5초에 걸쳐 흐려지며 사라지고, 칸이 빈다
    const T = F.crateFade;
    fx.run(T.after + T.time, (k) => {
      const t = k * (T.after + T.time);
      if (sp.active) sp.setAlpha(t < T.after ? 1 : 1 - (t - T.after) / T.time);
    }, () => this.removeCrate());
  }

  removeCrate() {
    const o = this.crate, m = this.map;
    if (!o) return;
    this.crate = null;
    m.objects.splice(m.objects.indexOf(o), 1);
    m.objectGrid[o.row * m.cols + o.col] = null;
    o.sprite.destroy();
    this.scene.onMapChanged();
  }

  // ── 밭 갈기 ──

  // 갈 수 있는 칸: 풀·숲 바닥·돌밭이고, 사물·시설·밭·그루터기·돌 부스러기가 없고, 주인공에게서 reach 칸 안
  canTill(col, row) {
    const m = this.map, F = CONFIG.farm, p = this.scene.player;
    if (!m.isLand(col, row) || !F.tillTerrain.includes(m.map.terrain[row][col])) return false;
    if (m.objectAt(col, row) || m.anyStructureAt(col, row) || this.fieldAt(col, row)) return false;
    return this.scene.build.inReach(col, row, F.reach);   // (사용자 요청) 멀면 걸어가서 간다(BuildSystem.walkToBuild)
  }

  // 그 칸으로 가서 괭이질(hoe), hit 프레임에 밭이 된다. 걸어가는 동안 다른 칸을 누르면 그쪽으로 바꾼다(새 행동이 된다).
  till(t) {
    const tile = { col: t.col, row: t.row }, target = { tiles: [tile] };
    this.scene.player.act({
      target, stepOff: true,
      tool: () => (this.scene.tools.includes('hoe') ? 'hoe' : null),
      isValid: () => !this.fieldAt(tile.col, tile.row) && !this.map.objectAt(tile.col, tile.row) && !this.map.anyStructureAt(tile.col, tile.row),
      strike: () => { this.makeField(tile); return true; },
    });
  }

  makeField(t) {
    const scene = this.scene, fx = scene.effects, a = this.map.assets.farm_soil, w = tileToWorld(t.col, t.row);
    const soil = scene.add.sprite(w.x, w.y, 'farm_soil', a.frames.indexOf('dry')).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.footprint);
    const f = { col: t.col, row: t.row, tiles: [{ col: t.col, row: t.row }], soil, wet: false, crop: null };
    this.fields.set(this.key(t.col, t.row), f);
    scene.pets.shoo(f.tiles);                        // (사용자 요청) 밭 위의 동물은 비킨다
    fx.dust(w.x, w.y, CONFIG.farm.tillDustScale);
    fx.burst(['dirt'], CONFIG.fx.chips.till, w.x, w.y);
    scene.sfx.play('till', { at: w });
    scene.onFarmChanged();
    return f;
  }

  // 치우기로 밭을 없앤다(작물도 함께, 돌려받는 것 없음)
  removeField(f) {
    if (f.crop) this.removeCrop(f);
    f.soil.destroy();
    this.fields.delete(this.key(f.col, f.row));
    this.scene.effects.poof(f.soil.x, f.soil.y);
    this.scene.onFarmChanged();
  }

  // ── 밭을 눌렀을 때 ──

  // 누른 점의 밭: 작물 그림을 눌렀으면 그 밭, 아니면 누른 칸의 밭
  pickField(x, y) {
    let best = null;
    for (const f of this.fields.values()) {
      const s = f.crop && f.crop.sprite;
      if (!s) continue;
      const left = s.x - s.displayWidth * s.originX, top = s.y - s.displayHeight * s.originY;
      if (x >= left && x <= left + s.displayWidth && y >= top && y <= top + s.displayHeight && (!best || s.depth > best.crop.sprite.depth)) best = f;
    }
    if (best) return best;
    const t = worldToTile(x, y);
    return this.fieldAt(t.col, t.row);
  }

  // 빈 밭 -> 심기(씨앗 고르기 창) / 다 자란 작물 -> 거두기 / 작물이 있고 마른 밭 -> 물 주기 / 그 밖 -> 그 칸으로 걸어간다
  // (13.3 의 순서는 "마른 밭 -> 물 주기"가 먼저지만, 다 자란 작물의 밭은 늘 말라 있어서 거두기를 먼저 본다)
  pressField(f) {
    const scene = this.scene;
    if (!f.crop) {
      if (!this.seeds().length) scene.error('씨앗이 없습니다');
      else scene.events.emit('choose-seed', f);
    } else if (f.crop.stage === STAGES.length - 1) this.harvest(f);
    else if (!f.wet) {
      if (!scene.tools.includes('watering_can')) scene.error('물뿌리개가 필요합니다');
      else this.water(f);
    } else scene.walkTo(f.col, f.row);
  }

  // 씨앗 고르기 창에서 골랐다: 걸어가서 crouch, hit 프레임에 seed 단계로 심는다
  plant(f, crop) {
    this.scene.player.act({
      target: f, stepOff: true,
      tool: () => 'crouch',
      isValid: () => this.fields.get(this.key(f.col, f.row)) === f && !f.crop && this.scene.inventory.count(seedItem(crop)) > 0,
      strike: () => {
        const scene = this.scene;
        scene.inventory.add(seedItem(crop), -1);
        f.crop = { type: crop, stage: 0, t: 0, sprite: null, sway: null };
        this.showCrop(f);
        scene.sfx.play('plant', { at: f.soil });
        scene.todo.check('plant');
        return true;
      },
    });
  }

  water(f) {
    this.scene.player.act({
      target: f, stepOff: true,
      tool: () => (this.scene.tools.includes('watering_can') ? 'watering_can' : null),
      isValid: () => this.fields.get(this.key(f.col, f.row)) === f && !!f.crop && !f.wet,
      strike: () => {
        const scene = this.scene;
        this.setWet(f, true);
        scene.effects.play('fx_water', f.soil.x, f.soil.y);
        scene.sfx.play('water_pour', { at: f.soil });
        return true;
      },
    });
  }

  harvest(f) {
    this.scene.player.act({
      target: f, stepOff: true,
      tool: () => 'crouch',
      isValid: () => this.fields.get(this.key(f.col, f.row)) === f && !!f.crop && f.crop.stage === STAGES.length - 1,
      strike: () => {
        const scene = this.scene, fx = scene.effects, C = CONFIG.farm.crops[f.crop.type], type = f.crop.type;
        const x = f.soil.x, y = f.soil.y;
        this.removeCrop(f);
        const [a, b] = C.seeds, seeds = a + Math.floor(Math.random() * (b - a + 1));
        scene.inventory.add(type, C.harvest);
        scene.inventory.add(seedItem(type), seeds);
        fx.popup(x, y - 40, ICON[type], '+' + C.harvest);
        fx.burst(['leaf1', 'leaf2'], CONFIG.fx.chips.harvest, x, y - 20);
        fx.play('fx_sparkle', x, y - 20);
        scene.sfx.play('harvest', { at: f.soil });
        scene.todo.check('harvest');
        return true;
      },
    });
  }

  // ── 자라기 ──

  setWet(f, wet) {
    f.wet = wet;
    f.soil.setFrame(this.map.assets.farm_soil.frames.indexOf(wet ? 'wet' : 'dry'));
  }

  showCrop(f) {
    const c = f.crop, key = 'crop_' + c.type, a = this.map.assets[key], w = tileToWorld(f.col, f.row);
    if (!c.sprite) c.sprite = this.scene.add.sprite(w.x, w.y, key).setOrigin(a.originX, a.originY).setDepth(CONFIG.depth.objectBase + w.y);
    c.sprite.setFrame(a.frames.indexOf(STAGES[c.stage]));
    // 다 자란 작물은 1.5초마다 기준점을 축으로 2° 흔든다
    if (c.stage === STAGES.length - 1 && !c.sway) {
      const S = CONFIG.farm.ripeSway;
      c.sway = this.scene.tweens.add({ targets: c.sprite, angle: { from: -S.angle, to: S.angle }, duration: S.period * 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  removeCrop(f) {
    const c = f.crop;
    if (!c) return;
    if (c.sway) c.sway.stop();
    c.sprite.destroy();
    f.crop = null;
  }

  // 한 단계 자란다: 밭은 다시 마르고, 그 자리에 반짝임(0.5배)
  grow(f) {
    const c = f.crop;
    c.stage += 1;
    c.t = 0;
    this.setWet(f, false);
    this.showCrop(f);
    this.scene.effects.play('fx_sparkle', f.soil.x, f.soil.y - 20, { scale: CONFIG.farm.growSparkleScale });
    if (c.stage === STAGES.length - 1) this.scene.onCropRipe(c.type);   // (지하) 땅 위 소식 (17.9)
  }

  // 젖은 밭의 작물은 stageTime 초(게임 시간)마다 한 단계. 마른 밭에서는 시간이 멈춘다. ripe 가 되면 그만.
  update(dt) {
    if (this.crateDue) this.tryCrate();
    if (this.scene.weather.kind === 'snow') return;   // 눈이 오는 동안은 자라지 않는다(14.3)
    for (const f of this.fields.values()) {
      const c = f.crop;
      if (!c || !f.wet || c.stage >= STAGES.length - 1) continue;
      c.t += dt;
      if (c.t >= CONFIG.farm.crops[c.type].stageTime) this.grow(f);
    }
  }

  // (시험용) 모든 작물을 다 자라게
  ripenAll() {
    for (const f of this.fields.values()) {
      if (!f.crop || f.crop.stage >= STAGES.length - 1) continue;
      f.crop.stage = STAGES.length - 1;
      this.setWet(f, false);
      this.showCrop(f);
    }
  }

  // ── 먹기 ── 배고픔(16장)과 함께 HungerSystem.eat 에서 한다
  eat(crop) { this.scene.hunger.eat(crop); }
}
