import { CONFIG } from '../config.js';
import { worldToTileFloat } from '../iso.js';

// 지하 살림 (17.6~17.8, Phase 18): 지하 가구 놓기와 치우기, 침대에서 자기, 의자에 앉기,
// 벽난로·등불 켜고 끄기, 보관 상자 열고 닫기, 버섯 화분.
// 가구는 지하 격자(Underground)의 칸에 놓는다. 깔개 말고는 그 칸을 막는다. 체력이 없다(적이 오지 않는다).
export const FURNITURE = ['bed', 'fireplace', 'lantern', 'planter', 'table', 'stool', 'rug', 'chest'];
export const isFurniture = (type) => FURNITURE.includes(type);
const PLANTER = ['empty', 'seed', 'grow', 'ripe'];
const FIRST = { bed: 'empty', fireplace: 'burn1', lantern: 'on', planter: 'empty', chest: 'closed' };   // 지었을 때의 그림
const ICON = { wood: 'icon_wood', stone: 'icon_stone', iron: 'icon_iron' };

export class UgHome {
  constructor(scene) {
    this.scene = scene;
    this.list = [];            // 놓은 가구 { type, tiles, col, row, sprite, glow, on, open, stage, t }
    this.bed = null;           // 자고 있는 침대
    this.zzz = null;           // 자는 동안 베개 위의 zzz
    this.healLeft = 0;         // 자는 동안 다음 하트까지 남은 게임 시간(초)
  }

  get ug() { return this.scene.ug; }
  get assets() { return this.scene.map.assets; }
  count(type) { return this.list.filter((f) => f.type === type).length; }

  // 그 칸의 가구. 깔개보다 다른 가구를 먼저. rugs: 깔개도 보는가
  at(col, row, rugs = false) {
    let rug = null;
    for (const f of this.list) {
      if (!f.tiles.some((t) => t.col === col && t.row === row)) continue;
      if (f.type !== 'rug') return f;
      rug = f;
    }
    return rugs ? rug : null;
  }
  // 그 칸을 막는 가구가 있는가(깔개는 막지 않는다)
  blocks(col, row) { return !!this.at(col, row); }

  // ── 놓기 (17.6) ──

  // 포인터가 (wx, wy)에 있을 때 가구가 차지할 칸들: 침대는 (col, row)와 (col+1, row), 깔개는 2×2(텐트와 같은 방법), 그 밖은 한 칸
  footprint(type, wx, wy) {
    const t = this.ug.tileAt(wx, wy);
    if (type === 'bed') return [t, { col: t.col + 1, row: t.row }];
    if (type !== 'rug') return [t];
    const f = worldToTileFloat(wx, wy - CONFIG.ug.offsetY), col = Math.floor(f.col), row = Math.floor(f.row);
    return [{ col, row }, { col: col + 1, row }, { col, row: row + 1 }, { col: col + 1, row: row + 1 }];
  }

  // 놓을 수 있는 칸: 파낸 칸이고, 가구(깔개 위에는 다른 가구를 놓을 수 있다)·사다리 칸·막힌 구멍·캐릭터가 없고, 주인공에게서 reach 안
  canPlaceAt(type, col, row) {
    const ug = this.ug, e = ug.floor.entry, p = this.scene.player;
    if (!ug.standable(col, row) || (col === e.col && row === e.row)) return false;
    if (type === 'rug' && this.at(col, row, true)) return false;
    if (this.characterTiles().some((t) => t.col === col && t.row === row)) return false;
    return Math.hypot(col - p.col, row - p.row) <= CONFIG.build.reach;
  }

  // 지하에 있는 캐릭터(주인공과 따라온 동물)가 몸을 걸친 칸
  characterTiles() {
    const pets = this.scene.pets.list.filter((q) => q.map === this.ug.grid);
    return [...this.scene.player.occupiedTiles(), ...pets.flatMap((q) => q.occupiedTiles()), ...this.scene.enemies.occupiedTiles(this.ug.grid)];   // (지하 침입) 지하의 해적도
  }

  // 벽난로는 뒷벽에 붙인다: (c-1, r)이 흙 덩어리면 그대로(왼쪽 위 벽), 아니고 (c, r-1)이면 뒤집는다(오른쪽 위 벽). 둘 다 아니면 null
  wallSide(t) {
    if (this.ug.tall(t.col - 1, t.row)) return 'l';
    if (this.ug.tall(t.col, t.row - 1)) return 'r';
    return null;
  }

  // tiles 에 가구를 놓는다(재료는 따지지 않는다). 그림은 차지한 칸들의 한가운데. depth 10 + y, 깔개는 2(바닥에 붙는 것)
  place(type, tiles) {
    const scene = this.scene, key = 'build_' + type, a = this.assets[key];
    const col = tiles.reduce((s, t) => s + t.col, 0) / tiles.length, row = tiles.reduce((s, t) => s + t.row, 0) / tiles.length;
    const w = this.ug.world(col, row);
    const sprite = (a.frames ? scene.add.sprite(w.x, w.y, key, a.frames.indexOf(FIRST[type])) : scene.add.image(w.x, w.y, key))
      .setOrigin(a.originX, a.originY).setDepth(type === 'rug' ? CONFIG.depth.footprint : CONFIG.depth.objectBase + w.y);
    const f = { type, tiles, col: tiles[0].col, row: tiles[0].row, sprite, on: false, open: false, stage: 0, t: 0 };
    if (type === 'fireplace') sprite.setFlipX(this.wallSide(tiles[0]) === 'r');
    if (type === 'fireplace' || type === 'lantern') {
      const G = CONFIG.ug[type].glow, at = this.lightAt(f);
      f.glow = scene.add.image(at.x, at.y, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(G.size, G.size).setAlpha(G.alpha).setDepth(sprite.depth + 1);
      this.setOn(f, true, false);
    }
    this.list.push(f);
    // 놓은 칸을 지나가던 길은 그 앞에서 멈춘다
    scene.player.onMapChanged();
    for (const q of scene.pets.list) q.onMapChanged();
    scene.events.emit('structures-changed');
    return f;
  }

  // 만들기에서 지었다: construct 소리와 fx_poof. 침대는 할 일 "침대 놓기"
  built(f) {
    const scene = this.scene, sp = f.sprite;
    scene.effects.poof(sp.x, sp.y);
    scene.sfx.play('construct', { at: sp });
    if (f.type === 'bed') scene.todo.check('bed');
  }

  // 치우기 (5.4): 없애고 재료의 절반(내림)을 돌려준다
  remove(f) {
    const scene = this.scene, fx = scene.effects, x = f.sprite.x, y = f.sprite.y;
    if (this.bed === f) this.wake();
    if (scene.player.seat && scene.player.seat.stool === f) this.standUp();
    let line = 0;
    for (const [item, n] of Object.entries(CONFIG.build[f.type].cost)) {
      const back = Math.floor(n * CONFIG.build.refundRate);
      if (back <= 0) continue;
      scene.inventory.add(item, back);
      if (!line) scene.sfx.play('pickup');
      fx.popup(x, y - 40 - line++ * (CONFIG.fx.popupIcon + 2), ICON[item], '+' + back);
    }
    fx.poof(x, y);
    f.sprite.destroy();
    if (f.glow) f.glow.destroy();
    this.list.splice(this.list.indexOf(f), 1);
    scene.events.emit('structures-changed');
  }

  // 치우기에서 누른 가구: 그림을 누른 것이 먼저, 아니면 그 칸의 가구(깔개 포함)
  removeAt(wx, wy) {
    const t = this.ug.tileAt(wx, wy), f = this.pick(wx, wy) || this.at(t.col, t.row, true);
    if (f) this.remove(f);
  }

  // ── 누르기 ──

  // (x, y)를 누른 가구. 그림 안의 투명하지 않은 곳만, depth 가 큰 것부터. 깔개는 바닥이라 고르지 않는다
  pick(x, y) {
    let best = null;
    for (const f of this.list) {
      if (f.type === 'rug' || !this.ug.hitImage(f.sprite, x, y)) continue;
      if (!best || f.sprite.depth > best.sprite.depth) best = f;
    }
    return best;
  }

  press(f) {
    const scene = this.scene, pl = scene.player;
    const valid = () => this.list.includes(f);
    switch (f.type) {
      case 'bed': pl.act({ target: f, isValid: valid, arrive: () => this.sleep(f) }); break;
      case 'stool': pl.act({ target: f, isValid: valid, arrive: () => this.sit(f) }); break;
      case 'fireplace': case 'lantern': this.setOn(f, !f.on); scene.sfx.play('ui_click'); break;
      case 'chest':
        f.open = !f.open;
        f.sprite.setFrame(this.assets.build_chest.frames.indexOf(f.open ? 'open' : 'closed'));
        scene.sfx.play(f.open ? 'gate_open' : 'gate_close', { at: f.sprite, volume: CONFIG.ug.chestVolume });
        break;
      case 'planter': this.pressPlanter(f); break;
      default: break;                                 // 탁자: 장식
    }
  }

  // 벽난로·등불 켜고 끄기. 빛(lights)과 빛무리, 벽난로의 불꽃 애니메이션
  setOn(f, on) {
    f.on = on;
    f.glow.setVisible(on);
    const A = this.assets[f.sprite.texture.key];
    if (f.type === 'fireplace') {
      if (on) f.sprite.play('build_fireplace:burn');
      else f.sprite.stop().setFrame(A.frames.indexOf('off'));
    } else f.sprite.setFrame(A.frames.indexOf(on ? 'on' : 'off'));
  }

  // 불꽃(벽난로 flame)과 등불(lamp)의 자리: 기준점 + 그 값. 뒤집으면 x 를 반대로
  lightAt(f) {
    const a = this.assets[f.sprite.texture.key], o = f.type === 'fireplace' ? a.flame : a.lamp, k = f.sprite.flipX ? -1 : 1;
    return { x: f.sprite.x + k * o[0], y: f.sprite.y + o[1] };
  }

  // ── 침대 (17.7) ──

  // 눕는다: 주인공을 감추고 침대는 sleep, 베개 위에 zzz. 주인공은 들어갔던 칸(침대 옆)에 그대로 있는 것으로 친다
  sleep(f) {
    const scene = this.scene, pl = scene.player, Z = CONFIG.ug.zzz, a = this.assets.fx_emote;
    if (this.bed) return;
    pl.stopAction();
    pl.sprite.setVisible(false);
    this.bed = f;
    f.sprite.setFrame(this.assets.build_bed.frames.indexOf('sleep'));
    this.zzz = scene.add.sprite(f.sprite.x + Z[0], f.sprite.y + Z[1], 'fx_emote', a.frames.indexOf('zzz1'))
      .setOrigin(a.originX, a.originY).setDepth(f.sprite.depth + 1).play('fx_emote:zzz');
    this.healLeft = CONFIG.ug.bed.healInterval;
    scene.events.emit('rest-changed');
  }

  // 일어난다: 들어갔던 칸으로 나오고 침대는 empty
  wake() {
    const f = this.bed;
    if (!f) return;
    this.bed = null;
    if (f.sprite.active) f.sprite.setFrame(this.assets.build_bed.frames.indexOf('empty'));
    if (this.zzz) { this.zzz.destroy(); this.zzz = null; }
    this.scene.player.sprite.setVisible(true);
    this.scene.events.emit('rest-changed');
  }

  // 베개 위(하트 조각이 오르는 곳)
  pillow() { const Z = CONFIG.ug.zzz, sp = this.bed.sprite; return { x: sp.x + Z[0], y: sp.y + Z[1] }; }

  // ── 의자 (17.7): 의자와 같은 자리에서 sit(depth = 의자 + 0.5). 보던 쪽은 그대로. 다른 곳을 누르면 일어난다 ──

  sit(f) {
    const pl = this.scene.player;
    pl.seat = { stool: f, x: f.sprite.x, y: f.sprite.y, depth: f.sprite.depth + CONFIG.depth.charBias };
    pl.body.setFinal('sit');
    pl.syncSprite();
  }

  standUp() {
    const pl = this.scene.player;
    if (!pl.seat) return;
    pl.seat = null;
    if (pl.body.final === 'sit') pl.body.clearFinal();
    pl.syncSprite();
  }

  // ── 버섯 화분 (17.8) ──

  pressPlanter(f) {
    const scene = this.scene, stage = PLANTER[f.stage];
    if (stage === 'empty') {
      if (scene.inventory.count('spore') <= 0) { scene.error('포자가 필요합니다'); return; }
      scene.player.act({
        target: f, tool: () => 'crouch',
        isValid: () => this.list.includes(f) && f.stage === 0 && scene.inventory.count('spore') > 0,
        strike: () => {
          scene.inventory.add('spore', -1);
          this.setStage(f, 1);
          scene.sfx.play('plant', { at: f.sprite });
          return true;
        },
      });
    } else if (stage === 'ripe') {
      scene.player.act({
        target: f, tool: () => 'crouch',
        isValid: () => this.list.includes(f) && f.stage === PLANTER.length - 1,
        strike: () => {
          const M = CONFIG.ug.mushroom, sp = f.sprite;
          this.setStage(f, 0);
          scene.inventory.add('mushroom', M.yield);
          scene.effects.popup(sp.x, sp.y - 40, 'icon_mushroom', '+' + M.yield);
          scene.sfx.play('harvest', { at: sp });
          scene.todo.check('mushroom');
          return true;
        },
      });
    } else scene.notice('아직 자라는 중입니다');
  }

  setStage(f, stage) {
    f.stage = stage;
    f.t = 0;
    f.sprite.setFrame(this.assets.build_planter.frames.indexOf(PLANTER[stage]));
  }

  // (시험용) 버섯 다 자라게: 심어 둔 화분(seed, grow)이 모두 ripe
  ripenAll() { for (const f of this.list) if (f.type === 'planter' && f.stage > 0) this.setStage(f, PLANTER.length - 1); }

  // ── 매 프레임 ──

  update(dt) {
    // 버섯은 growEvery 초(게임 시간)마다 한 단계. 물도 날씨도 상관없다. 주인공이 땅 위에 있어도 자란다
    for (const f of this.list) {
      if (f.type !== 'planter' || f.stage === 0 || f.stage >= PLANTER.length - 1) continue;
      f.t += dt;
      if (f.t >= CONFIG.ug.mushroom.growEvery) this.setStage(f, f.stage + 1);
    }
    // 자는 동안 healInterval 초마다 하트 +1(배부름이 0 이면 없음, 16.1)
    if (this.bed) {
      this.healLeft -= dt;
      while (this.healLeft <= 0) {
        this.healLeft += CONFIG.ug.bed.healInterval;
        if (!this.scene.hunger.starving && this.scene.hearts.heal(1)) this.scene.heartsUp();
      }
    }
  }

  // 지하의 빛 (17.5): 켜진 벽난로(±3% 일렁임)와 켜진 등불
  lights() {
    const out = [], t = this.scene.elapsed;
    for (const f of this.list) {
      if (!f.on) continue;
      const L = CONFIG.ug[f.type].light, at = this.lightAt(f);
      let r = L.radius;
      if (L.flicker) {
        const phase = f.col + f.row;
        r *= 1 + L.flicker * (Math.sin(t * L.flickerRates[0] + phase) + Math.sin(t * L.flickerRates[1] + 2 * phase)) / 2;
      }
      out.push({ x: at.x, y: at.y, radius: r, color: L.color, alpha: L.alpha });
    }
    return out;
  }

  // 켜진 벽난로까지의 가장 가까운 거리(칸). 없으면 Infinity (모닥불 곁의 fire_loop 와 같은 규칙, 17.5)
  fireDistance(p) {
    let d = Infinity;
    for (const f of this.list) if (f.type === 'fireplace' && f.on) d = Math.min(d, Math.hypot(f.col - p.col, f.row - p.row));
    return d;
  }
}
