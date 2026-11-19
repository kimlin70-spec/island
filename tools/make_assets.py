#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사물, 캐릭터, 아이콘 그림을 만든다.   실행: python tools/make_assets.py
결과: assets/ 아래 PNG 와 assets/manifest.json  (바닥 그림은 make_ground.py)

필요한 것: pip install cairosvg pillow numpy scipy
"""
import json
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import artlib as A
import layout as LY
import wc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
MAN = {}


def save(img, sub, key, anchor, kind, **meta):
    d = os.path.join(ASSETS, sub)
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, key + '.png'))
    MAN[key] = dict(file=f'{sub}/{key}.png', w=img.width, h=img.height,
                    originX=round(anchor[0] / img.width, 4), originY=round(anchor[1] / img.height, 4), kind=kind, **meta)


def one(sub, key, prims, kind, **meta):
    img, anchor = wc.sprite(prims, key)
    save(img, sub, key, anchor, kind, **meta)


def sheet(sub, key, frames, names, kind, cols=None, pencil=1.0, wobble=1.0, **meta):
    """같은 크기의 프레임을 가로로 이어 붙인 시트(cols를 주면 그 수마다 다음 줄로). 발이 프레임 가로 한가운데에 온다."""
    boxes = [A.bbox(wc.frame_prims(p), 12) for p in frames]
    m = max(max(abs(b[0]), abs(b[2])) for b in boxes)
    box = (-m, min(b[1] for b in boxes), m, max(b[3] for b in boxes))
    imgs = []
    for p in frames:
        img, anchor = wc.sprite_layers(p, key, box, pencil=pencil, wobble=wobble)      # 같은 이름 = 같은 흔들림 무늬
        imgs.append(img)
    fw, fh = imgs[0].size
    cols = cols or len(imgs)
    rows = (len(imgs) + cols - 1) // cols
    strip = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
    for i, im in enumerate(imgs):
        strip.paste(im, ((i % cols) * fw, (i // cols) * fh))
    d = os.path.join(ASSETS, sub)
    os.makedirs(d, exist_ok=True)
    strip.save(os.path.join(d, key + '.png'))
    MAN[key] = dict(file=f'{sub}/{key}.png', w=strip.width, h=strip.height, originX=0.5, originY=round(anchor[1] / fh, 4),
                    kind=kind, frameWidth=fw, frameHeight=fh, frames=names, **meta)


def px(pt):
    """마스터 좌표의 한 점 -> 저장 크기에서 기준점으로부터의 거리(px)."""
    return [round(pt[0] * A.SCALE, 1), round(pt[1] * A.SCALE, 1)]


def make_objects():
    for i, (tone, seed) in enumerate([('a', 11), ('a', 12), ('a', 13)], 1):
        one('objects', f'obj_tree_a{i}', A.tree(tone, seed), 'object')
    for i, seed in enumerate((21, 22), 1):
        one('objects', f'obj_tree_b{i}', A.tree('b', seed), 'object')
    one('objects', 'obj_tree_w1', A.tree('w', 31), 'object')
    for i, seed in enumerate((41, 42, 43), 1):
        one('objects', f'obj_pine_{i}', A.pine(seed), 'object')
    for i, seed in enumerate((51, 54), 1):
        one('objects', f'obj_palm_{i}', A.palm(seed), 'object')
    one('objects', 'obj_stump', A.stump(), 'object')
    for size, seed in (('s', 61), ('m', 62), ('l', 63)):
        one('objects', f'obj_rock_{size}', A.rock(size, seed), 'object')
    one('objects', 'obj_rubble', A.rubble(), 'object')
    for i, seed in enumerate((71, 72), 1):
        one('objects', f'obj_bush_{i}', A.bush(seed), 'object')
        # 16장(배고픔): 열매를 딴 덤불. 같은 이름의 무늬(같은 붓자국)로 그려서 바꿔 끼워도 잎이 그대로다
        full = A.bush(seed)
        img, anchor = wc.sprite([p for p in full if p[2] != 'berry'], f'obj_bush_{i}', box=A.bbox(full, 12))
        save(img, 'objects', f'obj_bush_{i}_picked', anchor, 'object')
    one('objects', 'obj_ship', A.ship(), 'object', lamp=px(A.SHIP_LAMP))
    one('objects', 'obj_rowboat', A.rowboat(), 'object')
    one('objects', 'obj_iron_1', A.iron_ore(81, False), 'object')
    one('objects', 'obj_iron_2', A.iron_ore(82, True), 'object')


def make_builds():
    box = A.bbox(A.fence(15), 12)
    for m in range(16):
        img, anchor = wc.sprite(A.fence(m), 'build_fence', box=box, keep_box=True)
        save(img, 'build', f'build_fence_{m}', anchor, 'build')
    door = A.lerp(A.lerp(A.iso(1, 0.8), A.iso(1, -0.8), 0.5), A.iso(1, 0, 112), 0.3)
    tbox = A.bbox(A.tent(), 12)
    for key, lit in (('build_tent', False), ('build_tent_lit', True)):
        img, anchor = wc.sprite(A.tent(lit), 'build_tent', box=tbox, keep_box=True)
        save(img, 'build', key, anchor, 'build', footprint=[2, 2], door=px(door))
    sheet('build', 'build_campfire', [A.campfire(i) for i in range(3)], ['burn1', 'burn2', 'burn3'], 'build', flame=px((0, -28)))


def make_defense():
    """2단계: 철조망, 망루, 총 타워, 포탑(16방향)"""
    b0, b1 = A.bbox(A.wire(15), 12), A.bbox(A.wire(0), 12)
    box = (min(b0[0], b1[0]), min(b0[1], b1[1]), max(b0[2], b1[2]), max(b0[3], b1[3]))
    for m in range(16):
        img, anchor = wc.sprite(A.wire(m), 'build_wire', box=box, keep_box=True, pencil=0.8, wobble=0.6)
        save(img, 'build', f'build_wire_{m}', anchor, 'build')
    one('build', 'build_watchtower', A.watchtower(), 'build', footprint=[1, 1], mount=px((0, -A.WT_PIVOT)),
        lamp=px(A.pr(A.WT_LAMP)), turret='turret_bow')
    one('build', 'build_guntower', A.guntower(), 'build', footprint=[1, 1], mount=px((0, -A.GT_PIVOT)),
        lamp=px(A.pr(A.GT_LAMP)), turret='turret_gun')
    n = A.TURRET_DIRS
    angles = [round(A.screen_angle(i), 1) for i in range(n)]
    sheet('build', 'turret_bow', [A.crossbow(A.turret_phi(i), True) for i in range(n)] +
          [A.crossbow(A.turret_phi(i), False) for i in range(n)],
          [f'load{i}' for i in range(n)] + [f'shot{i}' for i in range(n)], 'turret', cols=n,
          directions=n, muzzle=[px(A.turret_tip('bow', i)) for i in range(n)], screenAngle=angles)
    sheet('build', 'turret_gun', [A.swivel_gun(A.turret_phi(i)) for i in range(n)], [f'dir{i}' for i in range(n)], 'turret',
          directions=n, muzzle=[px(A.turret_tip('gun', i)) for i in range(n)], screenAngle=angles)


# ---- 애니메이션: 프레임 순서와 각 프레임의 시간(ms). hit = 피해를 주는 프레임, swing = 그때 함께 보여 줄 fx_swing 애니메이션
def anim(frames, loop=False, **extra):
    return dict(frames=[[n, ms] for n, ms in frames], loop=loop, **extra)


def walk(prefix, ms):
    return anim([(prefix + 'walk1', ms), (prefix + 'walk3', ms), (prefix + 'walk2', ms), (prefix + 'walk4', ms)], True)


def swing3(prefix, tool, ms, hit_fx):
    return anim([(f'{prefix}{tool}1', ms[0]), (f'{prefix}{tool}2', ms[1]), (f'{prefix}{tool}3', ms[2])], hit=f'{prefix}{tool}2', swing=hit_fx)


PLAYER_ANIMS = dict(
    idle=anim([('idle', 700), ('idle2', 700)], True), bidle=anim([('bidle', 700), ('bidle2', 700)], True),
    walk=walk('', 83), bwalk=walk('b', 83), blink=anim([('blink', 120)]),
    dagger=swing3('', 'dagger', (140, 90, 140), 'swing'), axe=swing3('', 'axe', (190, 90, 150), 'heavy'),
    pick=swing3('', 'pick', (190, 90, 150), 'heavy'), gun=anim([('gun1', 250), ('gun2', 150)], hit='gun2'),
    bdagger=swing3('b', 'dagger', (140, 90, 140), 'bswing'), baxe=swing3('b', 'axe', (190, 90, 150), 'bheavy'),
    bpick=swing3('b', 'pick', (190, 90, 150), 'bheavy'), bgun=anim([('bgun1', 250), ('bgun2', 150)], hit='bgun2'),
    hurt=anim([('hurt', 220)]), down=anim([('down', 1000)]),
    # 3단계: 농사
    hoe=swing3('', 'hoe', (190, 90, 150), 'heavy'), bhoe=swing3('b', 'hoe', (190, 90, 150), 'bheavy'),
    water=anim([('water1', 150), ('water2', 450)], hit='water2'), bwater=anim([('bwater1', 150), ('bwater2', 450)], hit='bwater2'),
    crouch=anim([('crouch', 450)], hit='crouch'), bcrouch=anim([('bcrouch', 450)], hit='bcrouch'),
    eat=anim([('eat', 280), ('idle', 120), ('eat', 280)]))
ZOMBIE_ANIMS = dict(
    idle=anim([('idle', 500), ('idle2', 500)], True), walk=walk('', 160), bwalk=walk('b', 160),
    attack=anim([('attack0', 260), ('attack', 220)], hit='attack'), battack=anim([('battack0', 260), ('battack', 220)], hit='battack'),
    hurt=anim([('hurt', 200)]), die=anim([('die1', 150), ('die2', 140), ('die3', 700)]),
    rise=anim([('rise1', 260), ('rise2', 260), ('rise3', 260)]))
PIRATE_ANIMS = dict(
    idle=anim([('idle', 600), ('idle2', 600)], True), walk=walk('', 125), bwalk=walk('b', 125),
    attack=anim([('attack0', 220), ('attack', 90), ('attack2', 160)], hit='attack', swing='heavy'),
    battack=anim([('battack0', 220), ('battack', 160)], hit='battack', swing='bheavy'),
    hurt=anim([('hurt', 200)]), die=anim([('die1', 150), ('die2', 140), ('die3', 700)]))
GUNNER_ANIMS = dict(
    idle=anim([('idle', 600), ('idle2', 600)], True), walk=walk('', 125), bwalk=walk('b', 125),
    aim=anim([('aim', 600)]), shoot=anim([('shoot', 200)], hit='shoot'),
    reload=anim([('reload1', 400), ('reload2', 400), ('reload1', 400), ('reload2', 400)]),
    hurt=anim([('hurt', 200)]), die=anim([('die1', 150), ('die2', 140), ('die3', 700)]))


def make_chars():
    sheet('chars', 'char_player', [A.survivor(p) for p in A.POSES], list(A.POSES), 'char', cols=10, anims=PLAYER_ANIMS,
          muzzle={p: px(A.survivor_muzzle(p)) for p in ('gun1', 'gun2', 'bgun1', 'bgun2')})
    sheet('chars', 'char_zombie', [A.zombie(p) for p in A.ZPOSES], list(A.ZPOSES), 'char', cols=10, anims=ZOMBIE_ANIMS)
    for v in (1, 2):
        sheet('chars', f'char_pirate_{v}', [A.pirate(v, p) for p in A.PPOSES], list(A.PPOSES), 'char', cols=10, anims=PIRATE_ANIMS)
    sheet('chars', 'char_pirate_3', [A.gunner(p) for p in A.GPOSES], list(A.GPOSES), 'char', cols=10, anims=GUNNER_ANIMS,
          muzzle={p: px(A.gunner_muzzle(p)) for p in ('aim', 'shoot')})


def make_motion_fx():
    """움직임과 타격감을 위한 효과. 대부분 프레임 시트이고 anims 에 순서와 시간이 있다."""
    names, frames, anims = [], [], {}
    for nm in A.SWINGS:
        fs = A.swing_frames(nm)
        frames += fs
        names += [f'{nm}{i}' for i in (1, 2, 3)]
        anims[nm] = anim([(f'{nm}1', 40), (f'{nm}2', 60), (f'{nm}3', 70)])
    sheet('fx', 'fx_swing', frames, names, 'fx', cols=6, pencil=0.35, wobble=0.6, anims=anims,
          note='기준점 = 캐릭터의 발. 캐릭터와 같은 자리, 같은 좌우 뒤집기로 놓는다.')
    for key, fs, prefix, ms, pencil in (('fx_impact', A.impact_frames(), 'impact', (40, 50, 60, 70), 0.15),
                                        ('fx_dust', A.dust_frames(), 'dust', (70,) * 5, 0.25),
                                        ('fx_sparkle', A.sparkle_frames(), 'sparkle', (80,) * 4, 0.3),
                                        ('fx_vanish', A.vanish_frames(), 'vanish', (100,) * 5, 0.2),
                                        ('fx_splash', A.splash_frames(), 'splash', (80,) * 4, 0.3),
                                        ('fx_smoke_puff', A.smoke_puff_frames(), 'puff', (120,) * 4, 0.25)):
        nm = [f'{prefix}{i}' for i in range(1, len(fs) + 1)]
        sheet('fx', key, fs, nm, 'fx', pencil=pencil, wobble=0.6, anims={'play': anim(list(zip(nm, ms)))})
    sheet('fx', 'fx_particles', [A.xform(A.particle(n), k=1.35) for n in A.PARTICLES], list(A.PARTICLES), 'particle',
          pencil=0.6, wobble=0.4)
    img, anchor = wc.sprite(A.footprint(), 'fx_footprint', pencil=0.0, wobble=0.5)
    save(img, 'fx', 'fx_footprint', anchor, 'decal')
    img, anchor = wc.sprite(A.arrow_stuck(), 'proj_arrow_stuck', pencil=0.7)
    save(img, 'fx', 'proj_arrow_stuck', anchor, 'projectile')


DOG_ANIMS = dict(
    idle=anim([('idle', 500), ('idle2', 500)], True), bidle=anim([('bidle', 1000)], True),
    walk=walk('', 90), bwalk=walk('b', 90), sit=anim([('sit', 220), ('sit2', 220)], True), lie=anim([('lie', 1000)], True),
    sleep=anim([('sleep1', 900), ('sleep2', 900)], True), happy=anim([('happy1', 140), ('happy2', 140)] * 3),
    bark=anim([('bark', 160), ('idle', 110), ('bark', 160), ('idle', 250)]), bite=anim([('bite0', 220), ('bite', 200)], hit='bite'))
CAT_ANIMS = dict(
    idle=anim([('idle', 700), ('idle2', 700)], True), bidle=anim([('bidle', 1000)], True),
    walk=walk('', 110), bwalk=walk('b', 110), sit=anim([('sit', 1200), ('sit2', 400)], True), lie=anim([('lie', 1000)], True),
    sleep=anim([('sleep1', 1100), ('sleep2', 1100)], True), happy=anim([('happy1', 300), ('happy2', 300)] * 2),
    meow=anim([('meow', 500), ('sit', 200)]))


def make_stage3():
    """3단계: 문, 밭과 작물, 씨앗 상자, 반려동물, 농사 효과, 날씨"""
    gate_anims = dict(open=anim([('open1', 60), ('open2', 60), ('open3', 80)]), close=anim([('open2', 60), ('open1', 60), ('closed', 80)]))
    for ax in ('col', 'row'):
        sheet('build', f'build_gate_{ax}', [A.gate(ax, st) for st in A.GATE_STATES], list(A.GATE_STATES), 'build', anims=gate_anims)
    sheet('farm', 'farm_soil', [A.soil(False), A.soil(True)], ['dry', 'wet'], 'decal', pencil=0.35)
    for c, k in (('carrot', 1.15), ('corn', 1.0), ('pumpkin', 1.35)):          # 칸 안에서 잘 보이게 조금 키운다
        sheet('farm', f'crop_{c}', [A.xform(A.CROPS[c](st), k=k) for st in A.CROP_STAGES], list(A.CROP_STAGES), 'crop', pencil=0.8)
    sheet('objects', 'obj_seed_crate', [A.seed_crate('closed'), A.seed_crate('open')], ['closed', 'open'], 'object')
    for kind, anims in (('dog', DOG_ANIMS), ('cat', CAT_ANIMS)):
        frames = A.DOG_FRAMES if kind == 'dog' else A.CAT_FRAMES
        built = {n: A.pet(kind, n) for n in frames}
        hr = (A.DOG if kind == 'dog' else A.CAT)['hr']
        sheet('chars', f'char_{kind}', [built[n][0] for n in frames], list(frames), 'char', cols=10, anims=anims,
              emote={n: px((built[n][1][0], built[n][1][1] - hr - 6)) for n in frames})
    sheet('fx', 'fx_water', A.water_frames(), [f'water{i}' for i in range(1, 5)], 'fx', pencil=0.3, wobble=0.5,
          anims={'play': anim([(f'water{i}', 90) for i in range(1, 5)])})
    sheet('fx', 'fx_emote', [A.emote(n) for n in A.EMOTES], list(A.EMOTES), 'fx', pencil=0.3, wobble=0.4,
          anims={'zzz': anim([('zzz1', 450), ('zzz2', 450), ('zzz3', 600)], True)},
          note='기준점 = 표시의 아래 가운데. 동물의 emote 위치(기준점에서의 거리)에 놓는다.')
    # 날씨
    sheet('fx', 'fx_weather', [A.weather_part(n) for n in A.WEATHER_PARTS], list(A.WEATHER_PARTS), 'particle', pencil=0.0, wobble=0.0)
    sheet('fx', 'fx_rain_splash', A.rain_splash_frames(), [f'splash{i}' for i in range(1, 5)], 'fx', pencil=0.0, wobble=0.3,
          anims={'play': anim([(f'splash{i}', 55) for i in range(1, 5)])})
    for i, seed in enumerate((3, 8), 1):
        img, anchor = wc.sprite(A.xform(A.puddle(seed), k=1.45), f'decal_puddle_{i}', pencil=0.25, wobble=0.6)
        save(img, 'fx', f'decal_puddle_{i}', anchor, 'decal')
    save(rain_sheet(), 'fx', 'overlay_rain', (256, 256), 'weather', tile=True)
    save(snow_sheet(), 'fx', 'overlay_snow', (256, 256), 'weather', tile=True)


def _wrap_draw(size, draw_one, items):
    """이어 붙여도 이음매가 없게: 가장자리를 넘는 것은 반대쪽에도 그린다."""
    for it in items:
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                draw_one(it, ox, oy)


def rain_sheet(size=512, s=2, n=240, seed=7):
    """빗줄기 무늬(가로세로로 이어 붙일 수 있다). 화면에 고정해서 아래로 흘려 쓴다."""
    rng = random.Random(seed)
    S = size * s
    a = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(a)
    dx, dy = 0.22, 1.0
    items = [(rng.uniform(0, S), rng.uniform(0, S), rng.uniform(14, 34) * s, rng.uniform(1.0, 1.9) * s, rng.uniform(0.28, 0.62)) for _ in range(n)]

    def one(it, ox, oy):
        x, y, ln, w, al = it
        for k in range(3):                                   # 꼬리 쪽이 옅다
            f0, f1 = k / 3, (k + 1) / 3
            d.line([(x + ox + dx * ln * f0, y + oy + dy * ln * f0), (x + ox + dx * ln * f1, y + oy + dy * ln * f1)],
                   fill=int(255 * al * (0.45 + 0.55 * f1)), width=max(1, int(round(w))))
    _wrap_draw(S, one, items)
    a = a.resize((size, size), Image.LANCZOS)
    img = Image.new('RGBA', (size, size), (226, 236, 248, 0))
    img.putalpha(a)
    return img


def snow_sheet(size=512, s=2, n=150, seed=9):
    rng = random.Random(seed)
    S = size * s
    a = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(a)
    items = [(rng.uniform(0, S), rng.uniform(0, S), rng.uniform(1.4, 3.6) * s, rng.uniform(0.6, 0.95)) for _ in range(n)]
    items += [(rng.uniform(0, S), rng.uniform(0, S), rng.uniform(4.5, 6.5) * s, rng.uniform(0.25, 0.4)) for _ in range(14)]

    def one(it, ox, oy):
        x, y, r, al = it
        d.ellipse((x + ox - r, y + oy - r, x + ox + r, y + oy + r), fill=int(255 * al))
    _wrap_draw(S, one, items)
    big = Image.new('L', (S * 3, S * 3))                     # 흐리게 할 때도 이음매가 없게 3x3으로 붙여서 흐린 뒤 가운데만
    for i in range(3):
        for j in range(3):
            big.paste(a, (i * S, j * S))
    a = big.filter(ImageFilter.GaussianBlur(1.3 * s)).crop((S, S, 2 * S, 2 * S)).resize((size, size), Image.LANCZOS)
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    img.putalpha(a)
    return img


def make_ui():
    box = (-64, -64, 64, 64)
    for name in ('wood', 'stone', 'heart', 'heart_empty', 'dagger', 'axe', 'pickaxe', 'tshirt', 'fence', 'tent',
                 'campfire', 'sun', 'moon', 'craft', 'remove', 'sleep', 'iron', 'gun', 'wire', 'watchtower', 'guntower',
                 'hoe', 'watering_can', 'farm', 'gate', 'carrot', 'corn', 'pumpkin', 'seed_carrot', 'seed_corn', 'seed_pumpkin',
                 'rain', 'snow', 'sound_on', 'sound_off', 'hunger', 'hunger_empty', 'berry'):
        prims = A.fit(icon2(name), 94, enlarge=True)
        img, anchor = wc.sprite(prims, 'icon_' + name, box=box, keep_box=True)
        save(img, 'ui', 'icon_' + name, (img.width / 2, img.height / 2), 'icon')
    # 바닥 표시: 지을 수 있음(초록) / 지을 수 없음(빨강, X 표시) / 누른 칸(흰 테두리).
    # 풀밭과 모래 위 모두에서 잘 보여야 해서 수채화 처리를 하지 않고 또렷하게 그린다.
    for key, fill, mark in (('overlay_ok', (104, 224, 128, 140), None), ('overlay_no', (244, 86, 78, 178), 'x'),
                            ('overlay_cursor', None, None)):
        save(overlay(fill, mark), 'ui', key, (45, 25), 'overlay')
    save(range_ring(), 'ui', 'overlay_range', (256, 128), 'overlay')


def icon2(name):
    """2단계 아이콘(나머지는 artlib.icon)"""
    noshadow = lambda ps: [p for p in ps if p[-1].get('tag') != 'shadow']
    if name == 'iron':
        return noshadow(A.iron_ore(83, False))
    if name == 'gun':
        return A.musket((-40, 34), -38, 88, 1.0)[0]
    if name == 'wire':
        return A.xform(noshadow(A.wire(1)), -30, 14, 1.25) + A.xform(noshadow(A.wire(2)), 10, 34, 1.25)
    if name == 'watchtower':
        return noshadow(A.watchtower()) + A.xform(A.crossbow(A.turret_phi(2)), 0, -A.WT_PIVOT)
    if name == 'guntower':
        return noshadow(A.guntower()) + A.xform(A.swivel_gun(A.turret_phi(2)), 0, -A.GT_PIVOT)
    try:
        return A.icon(name)
    except KeyError:
        return A.icon3(name)


def range_ring(w=512, h=256, s=3):
    """사거리 표시: 땅 위의 원(화면에서는 가로 2 : 세로 1 타원). 사거리에 맞춰 늘려 쓴다."""
    im = Image.new('RGBA', (w * s, h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = 6 * s
    d.ellipse((m, m, w * s - m, h * s - m), fill=(255, 255, 255, 34), outline=(74, 61, 56, 120), width=int(7 * s))
    d.ellipse((m + 2 * s, m + 2 * s, w * s - m - 2 * s, h * s - m - 2 * s), outline=(255, 255, 255, 235), width=int(3 * s))
    return im.resize((w, h), Image.LANCZOS)


def overlay(fill, mark, w=90, h=50, s=4):
    """한 칸(80x40)보다 조금 작은 마름모. 4배로 그린 뒤 줄여서 가장자리를 부드럽게 한다."""
    im = Image.new('RGBA', (w * s, h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy, hw, hh = w * s / 2, h * s / 2, 36 * s, 18 * s
    pts = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
    if fill:
        d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=(74, 61, 56, 110), width=int(5.5 * s), joint='curve')
    d.line(pts + [pts[0]], fill=(255, 255, 255, 245), width=int(2.6 * s), joint='curve')
    if mark == 'x':
        for dx in (-1, 1):
            d.line([(cx - 9 * s * dx, cy - 5 * s), (cx + 9 * s * dx, cy + 5 * s)], fill=(255, 255, 255, 245), width=int(3 * s))
    return im.resize((w, h), Image.LANCZOS)


def make_fx():
    for key, prims in (('fx_poof', A.poof()), ('fx_hit', A.hit())):
        box = (-56, -56, 56, 56)
        img, anchor = wc.sprite(prims, key, box=box, keep_box=True)
        save(img, 'fx', key, (img.width / 2, img.height / 2), 'fx')
    # 2단계: 날아가는 것(오른쪽을 향해 그렸다. 날아가는 방향으로 돌려서 쓴다)과 총 효과
    for key, prims, kind in (('proj_arrow', A.arrow(), 'projectile'), ('proj_bullet', A.bullet(), 'projectile'),
                             ('fx_muzzle', A.muzzle_flash(), 'fx'), ('fx_smoke', A.smoke(), 'fx')):
        img, anchor = wc.sprite(prims, key, pencil=0.7)
        save(img, 'fx', key, anchor, kind)
    # 빛 그림: 밤의 '빛 지도'에 찍는 부드러운 흰 원, 모닥불 둘레에 더하는 주황 빛무리
    for key, size, rgb, power in (('light_soft', 512, (255, 255, 255), 1.6), ('glow_warm', 256, (255, 176, 92), 2.2)):
        ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
        dist = np.hypot(xs - size / 2 + 0.5, ys - size / 2 + 0.5) / (size / 2)
        a = np.clip(1 - dist, 0, 1) ** power
        arr = np.zeros((size, size, 4), np.uint8)
        arr[..., :3] = rgb
        arr[..., 3] = (a * 255).astype(np.uint8)
        save(Image.fromarray(arr), 'fx', key, (size / 2, size / 2), 'light')


def main():
    make_objects()
    make_builds()
    make_defense()
    make_chars()
    make_ui()
    make_fx()
    make_motion_fx()
    make_stage3()
    ground = json.load(open(os.path.join(ASSETS, 'ground', 'ground.json'), encoding='utf-8'))
    meta = dict(tileWidth=LY.HW * 2, tileHeight=LY.HH * 2, viewWidth=LY.VIEW_W, viewHeight=LY.VIEW_H, ground=ground, turretDirections=A.TURRET_DIRS,
                note='originX/originY = 그림에서 발이 닿는 점. 이 점을 칸 중심의 월드 좌표에 맞춘다.')
    out = dict(meta=meta, assets=MAN)
    snd = os.path.join(ASSETS, 'sfx', 'sounds.json')                 # 효과음 목록(make_sounds.py 가 만든다)
    if os.path.exists(snd):
        out['sounds'] = json.load(open(snd, encoding='utf-8'))
    with open(os.path.join(ASSETS, 'manifest.json'), 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print(len(MAN), 'assets')


if __name__ == '__main__':
    main()
