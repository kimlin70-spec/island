#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
3단계 미리보기: 문, 밭, 반려동물, 날씨(비, 눈). 게임이 아니라 그림이 게임 화면에서 어떻게 보일지 확인하는 용도.
실행: python tools/render_farm.py
결과: preview/preview_farm.png, preview_rain.png, preview_snow.png, preview_farm.gif

좌표, 겹침 순서, 울타리 연결(문도 울타리처럼 이웃으로 친다)은 DEMO_SPEC.md 3장, 13장과 같다.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw

import layout as LY
import render_preview as R
import render_motion as RM

A, G, MAP = R.A, R.G, R.MAP
OBJS = {(o['col'], o['row']): o for o in MAP['objects']}
C0, R0 = 34, 36                                   # 캠프(7x7 울타리, render_preview 와 같은 자리)
RING = R.perimeter(C0, R0, 7)
GATE = (40, 39)                                   # 캠프 오른쪽 변의 문(row 방향 줄)
TENT = dict(key='build_tent', col=C0 + 2.5, row=R0 + 2.5)
FIRE = (C0 + 4, R0 + 4)
FIELD = [(c, r) for c in (42, 43, 44) for r in (36, 37, 38, 39)]


def ground(snow=False):
    m, step = G['chunkMargin'], G['chunkStep']
    full = Image.new('RGB', (G['width'], G['height']))
    for ch in G['snowChunks' if snow else 'chunks']:
        part = Image.open(os.path.join(R.ASSETS, ch['file'])).crop((m, m, m + step, m + step))
        full.paste(part, (ch['x'] + m - G['x'], ch['y'] + m - G['y']))
    return full.convert('RGBA')


def gate_axis(t, fences):
    c, r = t
    if (c + 1, r) in fences or (c - 1, r) in fences:
        return 'col'
    return 'row'


def scene(things, fences=(), gates=None, floor=(), stumps=(), snow=False, hide=(), picked=()):
    """바닥 + (바닥에 붙는 것) + 사물, 울타리, 문, 캐릭터를 발의 y 순서로."""
    world = ground(snow)
    gates = gates or {}

    def put(key, wx, wy, frame=None, flip=False, alpha=1.0, scale=1.0):
        m = A[key]
        im = R.img(key, frame, flip)
        if scale != 1.0:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        if alpha < 1:
            a = np.asarray(im).copy()
            a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
            im = Image.fromarray(a)
        ox = m['originX'] if not flip else 1 - m['originX']
        world.alpha_composite(im, (int(round(wx - G['x'] - ox * im.width)), int(round(wy - G['y'] - m['originY'] * im.height))))

    for f in floor:                                      # 밭 흙, 웅덩이, 발자국: 사물보다 먼저(바닥에 붙는다)
        wx, wy = LY.t2w(f['col'], f['row'])
        put(f['key'], wx + f.get('ox', 0), wy + f.get('oy', 0), f.get('frame'), f.get('flip', False), f.get('alpha', 1.0), f.get('scale', 1.0))
    draw = []
    for p, o in OBJS.items():
        if p in hide:
            continue
        wx, wy = LY.t2w(*p)
        key = 'obj_stump' if p in stumps else o['sprite'] + '_picked' if p in picked else o['sprite']   # 16장: 열매를 딴 덤불
        draw.append((wy, 0, key, wx, wy, None, False))
    near = set(fences) | set(gates)                      # 문도 울타리의 이웃으로 친다
    for t in fences:
        wx, wy = LY.t2w(*t)
        draw.append((wy, 1, f'build_fence_{R.fence_mask(t, near)}', wx, wy, None, False))
    for t, state in gates.items():
        wx, wy = LY.t2w(*t)
        draw.append((wy, 1, f'build_gate_{gate_axis(t, set(fences))}', wx, wy, state, False))
    for t in things:
        wx, wy = LY.t2w(t['col'], t['row'])
        draw.append((wy + t.get('dz', 0), 2, t['key'], wx + t.get('ox', 0), wy + t.get('oy', 0), t.get('frame'), t.get('flip', False)))
    for _, _, key, wx, wy, frame, flip in sorted(draw, key=lambda d: (d[0], d[1])):
        put(key, wx, wy, frame, flip)
    return world


def emote_at(things, key, col, row, frame, emote, flip=False):
    """동물 머리 위 표시: 기준점 + manifest 의 emote(뒤집으면 x 를 반대로)."""
    ex, ey = A[key]['emote'][frame]
    things.append(dict(key='fx_emote', col=col, row=row, frame=emote, ox=-ex if flip else ex, oy=ey, dz=0.6))


def tint(im, rgb):
    a = np.asarray(im.convert('RGB'), np.float32) * np.array(rgb, np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')


def weather_layer(im, key, alpha, scale=1.0, shift=(0, 0)):
    """이어 붙일 수 있는 날씨 무늬를 화면 전체에 깐다(게임에서는 TileSprite)."""
    tile = R.img(key)
    if scale != 1.0:
        tile = tile.resize((int(tile.width * scale), int(tile.height * scale)), Image.LANCZOS)
    a = np.asarray(tile).copy()
    a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
    tile = Image.fromarray(a)
    W, H = im.size
    for x in range(-tile.width + shift[0] % tile.width, W, tile.width):
        for y in range(-tile.height + shift[1] % tile.height, H, tile.height):
            im.alpha_composite(tile, (x, y))
    return im


def screen(world, col, row):
    wx, wy = LY.t2w(col, row)
    x0 = int(min(max(wx - G['x'] - LY.VIEW_W / 2, 0), G['width'] - LY.VIEW_W))
    y0 = int(min(max(wy - G['y'] - LY.VIEW_H / 2, 0), G['height'] - LY.VIEW_H))
    return world.crop((x0, y0, x0 + LY.VIEW_W, y0 + LY.VIEW_H)), (x0 + G['x'], y0 + G['y'])


def extra_hud(im, weather=None, hunger=None):
    """R.hud 위에 더하는 것: 소리 켜고 끄기 버튼(왼쪽 위), 날씨 아이콘(시계 오른쪽), 배부름 칸(하트 아래, 16장)."""
    d = ImageDraw.Draw(im, 'RGBA')
    if hunger is not None:
        R.panel(d, (24, 104, 24 + 5 * 48 + 22, 160), 20)
        for i in range(5):
            R.icon(im, 'icon_hunger' if i < hunger else 'icon_hunger_empty', 34 + i * 48, 108, 48)
    x = 24 + 5 * 58 + 24 + 14
    d.ellipse((x, 26, x + 68, 94), fill=R.PAPER + (236,), outline=R.INK + (255,), width=3)
    R.icon(im, 'icon_sound_on', x + 8, 34, 52)
    if weather:
        cx = im.width // 2
        d.ellipse((cx + 238, 26, cx + 306, 94), fill=R.PAPER + (236,), outline=R.INK + (255,), width=3)
        R.icon(im, 'icon_' + weather, cx + 244, 32, 56)
    return im


def seed_popup(im, items):
    """빈 밭을 눌렀을 때: 가진 씨앗만 보여 주는 작은 창"""
    W, H = im.size
    cw, ch, gap = 150, 168, 12
    width = len(items) * cw + (len(items) - 1) * gap + 40
    x0, y0 = W // 2 - width // 2, H - 132 - 70 - ch - 50
    d = ImageDraw.Draw(im, 'RGBA')
    R.panel(d, (x0, y0, x0 + width, y0 + ch + 74))
    d.text((x0 + 20, y0 + 12), '무엇을 심을까요?', font=R.font(26), fill=R.INK)
    d.text((x0 + width - 20, y0 + 18), '닫기 ✕', font=R.font(22, False), fill=(132, 120, 110), anchor='ra')
    for i, (key, name, n) in enumerate(items):
        x, y = x0 + 20 + i * (cw + gap), y0 + 56
        d.rounded_rectangle((x, y, x + cw, y + ch), 16, fill=R.CARD + (255,), outline=R.INK + (255,), width=3)
        R.icon(im, key, x + (cw - 84) // 2, y + 8, 84)
        d.text((x + cw // 2, y + ch - 48), name, font=R.font(22), fill=R.INK, anchor='mm')
        d.text((x + cw // 2, y + ch - 20), f'{n}개', font=R.font(21, False), fill=R.INK, anchor='mm')
    return im


def float_text(im, origin, col, row, icon_key, text, dy=-90):
    x, y = LY.t2w(col, row)
    x, y = x - origin[0], y - origin[1] + dy
    R.icon(im, icon_key, x - 50, y - 24, 48)
    ImageDraw.Draw(im).text((x + 2, y), text, font=R.font(34), fill=(255, 252, 240), anchor='lm', stroke_width=5, stroke_fill=R.INK)


CROPS = {(42, 36): ('crop_carrot', 'ripe'), (42, 37): ('crop_carrot', 'ripe'), (42, 38): ('crop_carrot', 'grow'), (42, 39): ('crop_carrot', 'sprout'),
         (43, 36): ('crop_corn', 'ripe'), (43, 37): ('crop_corn', 'grow'), (43, 38): ('crop_corn', 'grow'), (43, 39): ('crop_corn', 'sprout'),
         (44, 36): ('crop_pumpkin', 'ripe'), (44, 37): ('crop_pumpkin', 'grow'), (44, 38): ('crop_pumpkin', 'sprout'), (44, 39): ('crop_pumpkin', 'seed')}
TODO3 = ['문 달기', '괭이 만들기', '밭 6칸 갈기', '씨앗 심기', '작물 거두기', '강아지와 친구 되기']


def farm_things(wet):
    floor = [dict(key='farm_soil', col=c, row=r, frame='wet' if (c, r) in wet else 'dry') for c, r in FIELD]
    things = [dict(key=k, col=c, row=r, frame=st) for (c, r), (k, st) in CROPS.items()]
    return floor, things


def still_farm():
    ring = [t for t in RING if t != GATE]
    floor, things = farm_things({(42, 38), (43, 38), (42, 39), (43, 39), (44, 39), (42, 37)})
    things += [TENT, dict(key='build_campfire', col=FIRE[0], row=FIRE[1], frame='burn1'),
               dict(key='char_player', col=41, row=38, frame='water2'),
               dict(key='fx_water', col=42, row=38, frame='water2', dz=0.7),
               dict(key='char_dog', col=40.9, row=39.7, frame='sit'),
               dict(key='char_cat', col=36.3, row=40.4, frame='sleep1')]
    emote_at(things, 'char_dog', 40.9, 39.7, 'sit', 'heart')
    emote_at(things, 'char_cat', 36.3, 40.4, 'sleep1', 'zzz3')
    trees = sorted((p for p, o in OBJS.items() if o['kind'] in ('tree', 'pine', 'palm')), key=lambda p: (p[0] - 37) ** 2 + (p[1] - 39) ** 2)
    world = scene(things, ring, {GATE: 'closed'}, floor, stumps=set(trees[:11]), picked={(43, 40)})
    im, origin = screen(world, 40.5, 39.5)
    R.hud(im, '3일째 낮', False, 0.35, 5, [('wood', 9), ('stone', 4), ('berry', 3), ('carrot', 2), ('seed_carrot', 3), ('seed_corn', 1), ('seed_pumpkin', 1)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'hoe', 'watering_can'], [(i < 4, t) for i, t in enumerate(TODO3)][:3] +
          [(True, TODO3[3]), (False, TODO3[4]), (False, TODO3[5])])
    extra_hud(im, hunger=3)
    seed_popup(im, [('icon_seed_carrot', '당근 씨앗', 3), ('icon_seed_corn', '옥수수 씨앗', 1), ('icon_seed_pumpkin', '호박 씨앗', 1)])
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_farm.png'))


def still_weather(kind):
    ring = [t for t in RING if t != GATE]
    rng = random.Random(5 if kind == 'rain' else 6)
    floor, things = farm_things(set(FIELD) if kind == 'rain' else set())
    things += [TENT, dict(key='build_campfire', col=FIRE[0], row=FIRE[1], frame='burn2')]
    trees = sorted((p for p, o in OBJS.items() if o['kind'] in ('tree', 'pine', 'palm')), key=lambda p: (p[0] - 37) ** 2 + (p[1] - 39) ** 2)
    stumps = set(trees[:11])
    if kind == 'rain':
        spots = [(c, r) for c in range(31, 48) for r in range(33, 45) if (c, r) not in OBJS and (c, r) not in RING and (c, r) not in FIELD
                 and MAP['terrain'][r][c] in (2, 3, 4)]
        for i, (c, r) in enumerate(rng.sample(spots, 9)):
            floor.append(dict(key=f'decal_puddle_{1 + i % 2}', col=c + rng.uniform(-0.2, 0.2), row=r + rng.uniform(-0.2, 0.2)))
        things += [dict(key='char_player', col=41.2, row=40.6, frame='bwalk2'),
                   dict(key='char_dog', col=42.1, row=41.3, frame='bwalk1'),
                   dict(key='char_cat', col=35.8, row=38.2, frame='lie')]
        world = scene(things, ring, {GATE: 'open3'}, floor, stumps=stumps)
        im, origin = screen(world, 40.5, 39.5)
        im = tint(im, (0.78, 0.82, 0.9))
        d = ImageDraw.Draw(im, 'RGBA')
        for _ in range(70):                                         # 땅에 튀는 빗방울
            x, y = rng.uniform(0, im.width), rng.uniform(140, im.height)
            fr = rng.choice(['splash1', 'splash2', 'splash3'])
            m = A['fx_rain_splash']
            sp = R.img('fx_rain_splash', fr)
            im.alpha_composite(sp, (int(x - m['originX'] * sp.width), int(y - m['originY'] * sp.height)))
        weather_layer(im, 'overlay_rain', 0.75, 1.0, (40, 10))
        weather_layer(im, 'overlay_rain', 0.45, 1.7, (210, 90))
        R.hud(im, '3일째 낮', False, 0.55, 5, [('wood', 9), ('stone', 4), ('carrot', 4), ('seed_carrot', 2)],
              ['dagger', 'tshirt', 'axe', 'pickaxe', 'hoe', 'watering_can'], [(True, t) for t in TODO3[:5]] + [(False, TODO3[5])],
              hint='비가 내립니다 · 밭에 물이 저절로 찹니다')
        extra_hud(im, 'rain', hunger=4)
        im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_rain.png'))
        return
    # 눈: 눈 덮인 바닥 + 발자국 + 눈송이
    path = [(38.0 + 0.5 * i, 43.6 - 0.32 * i) for i in range(9)]
    for i, (c, r) in enumerate(path):
        floor.append(dict(key='fx_footprint', col=c, row=r, alpha=0.55 + 0.05 * i, oy=4))
    things += [dict(key='char_player', col=42.4, row=40.9, frame='bwalk3'),
               dict(key='char_dog', col=41.4, row=41.8, frame='bwalk2'),
               dict(key='char_cat', col=FIRE[0] - 0.9, row=FIRE[1] + 0.4, frame='sleep2')]
    emote_at(things, 'char_cat', FIRE[0] - 0.9, FIRE[1] + 0.4, 'sleep2', 'zzz2')
    world = scene(things, ring, {GATE: 'open2'}, floor, stumps=stumps, snow=True)
    im, origin = screen(world, 40.5, 39.5)
    im = tint(im, (0.94, 0.96, 1.02))
    weather_layer(im, 'overlay_snow', 0.95, 1.0, (60, 30))
    weather_layer(im, 'overlay_snow', 0.6, 1.8, (300, 200))
    R.hud(im, '4일째 낮', False, 0.3, 5, [('wood', 12), ('stone', 6), ('pumpkin', 1), ('seed_corn', 2)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'hoe', 'watering_can'], [(True, t) for t in TODO3],
          hint='눈이 내립니다 · 작물이 자라지 않습니다')
    extra_hud(im, 'snow', hunger=2)
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_snow.png'))


# ================================================================== 움직이는 미리보기
CW, CH, COLS, ROWS, UP, FPS, LOOP = 190, 200, 4, 2, 1.6, 15, 4800
fa, al, ht = RM.frame_at, RM.anim_len, RM.hit_time


def main_gif():
    random.seed(1)
    world = R.ground()
    sx, sy = LY.t2w(30, 41)
    x0, y0 = int(sx - G['x']) - 120, int(sy - G['y']) - 160
    bg = world.crop((x0, y0, x0 + CW * COLS, y0 + CH * ROWS)).convert('RGBA')
    d = ImageDraw.Draw(bg, 'RGBA')
    for i in range(1, COLS):
        d.line([(i * CW, 0), (i * CW, CH * ROWS)], fill=(255, 255, 255, 120), width=2)
    d.line([(0, CH), (CW * COLS, CH)], fill=(255, 255, 255, 120), width=2)
    bursts = RM.Bursts()
    cells = Cells(bursts)
    frames = []
    for k in range(int(LOOP / 1000 * FPS)):
        t = k * 1000 / FPS
        cv = RM.Canvas(bg)
        cells.draw(cv, t)
        bursts.draw(cv, t)
        cells.draw_top(cv, t)
        big = cv.im.resize((int(cv.im.width * UP), int(cv.im.height * UP)), Image.LANCZOS)
        dd = ImageDraw.Draw(big, 'RGBA')
        for i, title in enumerate(cells.TITLES):
            cx, cy = (i % COLS) * CW * UP + 12, (i // COLS) * CH * UP + 10
            dd.rounded_rectangle((cx, cy, cx + dd.textlength(title, font=R.font(22)) + 20, cy + 36), 12, fill=(251, 246, 234, 230))
            dd.text((cx + 10, cy + 4), title, font=R.font(22), fill=R.INK)
        frames.append(big.convert('RGB'))
    picks = frames[::6]
    w, h = picks[0].width // 2, picks[0].height // 2
    mosaic = Image.new('RGB', (w * len(picks), h))
    for i, f in enumerate(picks):
        mosaic.paste(f.resize((w, h), Image.BILINEAR), (i * w, 0))
    pal = mosaic.quantize(colors=255, method=Image.FASTOCTREE)
    q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    out = os.path.join(R.ROOT, 'preview', 'preview_farm.gif')
    q[0].save(out, save_all=True, append_images=q[1:], duration=int(1000 / FPS), loop=0, optimize=True, disposal=1)
    print('preview_farm.gif', len(frames), 'frames', os.path.getsize(out) // 1024, 'KB')
    return frames


class Cells:
    TITLES = ['문 열고 닫기', '괭이로 밭 갈기', '심기 · 물 주기', '자라기(빨리 감기)', '거두기 · 먹기', '강아지', '고양이', '비 · 눈']

    def __init__(self, bursts):
        self.b = bursts
        # 밭 갈기: 두 번 친다
        for k, s in enumerate((300, 1400)):
            h = s + ht('char_player', 'hoe')
            bursts.add(h, CW + 128, 158, ['dirt', 'dirt', 'dust'], 6, 300 + k, speed=(60, 150), scale=0.7)
        # 거두기
        bursts.add(700, 128, CH + 150, ['leaf1', 'leaf2'], 6, 400, speed=(60, 150), life=(500, 800), grav=400)
        bursts.add(2900, 64, CH + 90, ['heart'], 3, 401, up=(250, 290), speed=(40, 70), life=(800, 1100), grav=-20)
        # 강아지 쓰다듬기
        bursts.add(2350, CW + 118, CH + 120, ['heart'], 3, 402, up=(250, 290), speed=(40, 70), life=(800, 1100), grav=-20)
        # 비 튀김: 미리 정한 자리
        r = random.Random(9)
        self.splashes = [(r.uniform(0, 2300), 3 * CW + r.uniform(10, 180), CH + r.uniform(60, 195)) for _ in range(40)]

    def draw(self, cv, t):
        self.c_gate(cv, 0, 0, t)
        self.c_till(cv, CW, 0, t)
        self.c_plant(cv, 2 * CW, 0, t)
        self.c_grow(cv, 3 * CW, 0, t)
        self.c_harvest(cv, 0, CH, t)
        self.c_dog(cv, CW, CH, t)
        self.c_cat(cv, 2 * CW, CH, t)
        self.c_weather(cv, 3 * CW, CH, t)

    def draw_top(self, cv, t):
        pass

    # 1) 문
    def c_gate(self, cv, ox, oy, t):
        gx, gy = ox + 96, oy + 132
        f_l, f_r = (gx - 40, gy + 20), (gx + 40, gy - 20)             # row 방향 줄: 화면 ↙↗
        u = (t % LOOP) / LOOP
        px, py = ox + 22 + 150 * u, oy + 94 + 75 * u                   # col 방향으로 걷는다(화면 ↘)
        near = abs(u - 0.5) < 0.22
        ph = t % LOOP
        t_open, t_close = 0.28 * LOOP, 0.72 * LOOP
        if ph < t_open:
            fr = 'closed'
        elif ph < t_close:
            fr = fa('build_gate_row', 'open', ph - t_open)
        else:
            fr = fa('build_gate_row', 'close', ph - t_close)
        items = [(f_r[1], 'build_fence_12', f_r, None), (gy, 'build_gate_row', (gx, gy), fr), (f_l[1], 'build_fence_12', f_l, None),
                 (py, 'char_player', (px, py), fa('char_player', 'walk', ph))]
        items.sort(key=lambda it: it[0])
        for _, key, (x, y), frm in items:
            cv.put(key, x, y, frm)

    # 2) 괭이로 밭 갈기
    def c_till(self, cv, ox, oy, t):
        px, py = ox + 66, oy + 160
        sx, sy = ox + 128, oy + 162
        starts = [300, 1400]
        hit2 = starts[1] + ht('char_player', 'hoe')
        if t >= hit2:
            cv.put('farm_soil', sx, sy, 'dry', alpha=min(1, (t - hit2) / 150) if t < 4300 else max(0, 1 - (t - 4300) / 400))
        fr = 'idle'
        for s in starts:
            if s <= t < s + al('char_player', 'hoe'):
                fr = fa('char_player', 'hoe', t - s)
        cv.put('char_player', px, py, fr)
        for s in starts:
            h = s + ht('char_player', 'hoe')
            RM.fx_play(cv, 'fx_swing', 'heavy', t - h, px, py)
            RM.fx_play(cv, 'fx_dust', 'play', t - h, sx, sy + 2, scale=0.7)

    # 3) 심기, 물 주기
    def c_plant(self, cv, ox, oy, t):
        px, py = ox + 66, oy + 160
        sx, sy = ox + 128, oy + 162
        wet = t >= 2000 + ht('char_player', 'water')
        cv.put('farm_soil', sx, sy, 'wet' if wet else 'dry')
        if t >= 700:
            cv.put('crop_carrot', sx, sy, 'seed')
        if 500 <= t < 500 + al('char_player', 'crouch'):
            fr = 'crouch'
        elif 2000 <= t < 2000 + al('char_player', 'water') + 500:
            fr = fa('char_player', 'water', t - 2000)
        else:
            fr = fa('char_player', 'idle', t)
        cv.put('char_player', px, py, fr)
        if 2000 <= t < 3100:
            RM.fx_play(cv, 'fx_water', 'play', (t - 2150) % 360, sx, sy)

    # 4) 자라기
    def c_grow(self, cv, ox, oy, t):
        sx, sy = ox + 95, oy + 165
        stage = min(3, int(t // 1100))
        cv.put('farm_soil', sx, sy, 'wet' if (t % 1100) < 700 else 'dry')
        cv.put('crop_corn', sx, sy, ['seed', 'sprout', 'grow', 'ripe'][stage])
        for k in (1, 2, 3):
            RM.fx_play(cv, 'fx_sparkle', 'play', t - k * 1100, sx + 8, sy - 30 - 18 * k, scale=0.7)

    # 5) 거두기, 먹기
    def c_harvest(self, cv, ox, oy, t):
        px, py = ox + 66, oy + 160
        sx, sy = ox + 128, oy + 162
        cv.put('farm_soil', sx, sy, 'dry')
        if t < 700:
            cv.put('crop_carrot', sx, sy, 'ripe')
        if 400 <= t < 400 + al('char_player', 'crouch'):
            fr = 'crouch'
        elif 2700 <= t < 2700 + al('char_player', 'eat'):
            fr = fa('char_player', 'eat', t - 2700)
        else:
            fr = fa('char_player', 'idle', t)
        cv.put('char_player', px, py, fr)
        RM.fx_play(cv, 'fx_sparkle', 'play', t - 700, sx, sy - 18, scale=0.8)
        if 700 <= t < 2300:                                         # 얻은 작물이 떠오른다
            u = (t - 700) / 1600
            cv.put('icon_carrot', sx - 10, sy - 60 - 30 * u, alpha=min(1, (1 - u) * 3), scale=0.42)

    # 6) 강아지: 걸어와서 앉아 꼬리 흔들고, 쓰다듬으면 좋아한다
    def c_dog(self, cv, ox, oy, t):
        px, py = ox + 58, oy + 160
        cv_player = 'idle'
        if 2100 <= t < 2100 + al('char_player', 'crouch') + 300:
            cv_player = 'crouch'
        cv.put('char_player', px, py, cv_player if cv_player == 'crouch' else fa('char_player', 'idle', t))
        if t < 1100:
            u = t / 1100
            x, y = ox + 180 - 70 * u, oy + 130 + 32 * u
            cv.put('char_dog', x, y, fa('char_dog', 'walk', t), flip=True)
        elif t < 2200:
            cv.put('char_dog', ox + 110, oy + 162, fa('char_dog', 'sit', t - 1100), flip=True)
        elif t < 2200 + al('char_dog', 'happy'):
            cv.put('char_dog', ox + 110, oy + 162, fa('char_dog', 'happy', t - 2200), flip=True)
            ex, ey = A['char_dog']['emote']['happy1']
            cv.put('fx_emote', ox + 110 - ex, oy + 162 + ey - 6, 'heart')
        elif t < 3900:
            cv.put('char_dog', ox + 110, oy + 162, fa('char_dog', 'bark', t - 3100), flip=True)
            ex, ey = A['char_dog']['emote']['bark']
            cv.put('fx_emote', ox + 110 - ex, oy + 162 + ey - 4, 'alert')
        else:
            cv.put('char_dog', ox + 110, oy + 162, fa('char_dog', 'sit', t), flip=True)

    # 7) 고양이: 자다가 깨서 울고, 다시 눕는다
    def c_cat(self, cv, ox, oy, t):
        x, y = ox + 95, oy + 160
        if t < 2400:
            cv.put('char_cat', x, y, fa('char_cat', 'sleep', t))
            ex, ey = A['char_cat']['emote']['sleep1']
            cv.put('fx_emote', x + ex, y + ey, fa('fx_emote', 'zzz', t))
        elif t < 2400 + al('char_cat', 'meow') + 400:
            fr = fa('char_cat', 'meow', t - 2400)
            cv.put('char_cat', x, y, fr)
            ex, ey = A['char_cat']['emote'][fr]
            cv.put('fx_emote', x + ex, y + ey, 'note')
        elif t < 4300:
            cv.put('char_cat', x, y, fa('char_cat', 'happy', t - 3300))
        else:
            cv.put('char_cat', x, y, 'lie')

    # 8) 비, 눈
    def c_weather(self, cv, ox, oy, t):
        rain = t < 2400
        tile = R.img('overlay_rain' if rain else 'overlay_snow')
        dark = Image.new('RGBA', (CW, CH), (40, 55, 85, 46) if rain else (235, 242, 255, 60))
        cv.im.alpha_composite(dark, (ox, oy))
        cv.put('char_dog', ox + 95, oy + 170, 'sit' if rain else 'lie')
        if rain:
            for t0, x, y in self.splashes:
                RM.fx_play(cv, 'fx_rain_splash', 'play', (t - t0) % 600, x, y)
        off = int((t * (0.9 if rain else 0.08)) % 512)
        sway = int(10 * math.sin(t / 600)) if not rain else int(t * 0.2) % 512
        crop = Image.new('RGBA', (CW, CH))
        for xx in (-512, 0):
            for yy in (-512, 0):
                crop.alpha_composite(tile, (xx + (sway % 512), yy + off))
        a = np.asarray(crop).copy()
        a[..., 3] = (a[..., 3] * (0.8 if rain else 1.0)).astype(np.uint8)
        cv.im.alpha_composite(Image.fromarray(a), (ox, oy))


def main():
    still_farm()
    still_weather('rain')
    still_weather('snow')
    frames = main_gif()
    frames[int(2350 / 1000 * FPS)].save(os.path.join(R.ROOT, 'preview', 'preview_farm_frame.png'))
    print('ok')


if __name__ == '__main__':
    main()
