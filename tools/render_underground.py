#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
17장 미리보기: 지하 생활. 게임이 아니라 지하 그림이 게임 화면에서 어떻게 보일지 확인하는 용도.
실행: python tools/render_underground.py
결과: preview/preview_underground.png, preview/preview_underground.gif

벽·덮개·단면 고르기와 겹침 순서는 DEMO_SPEC.md 17.3 과 똑같다(ug_plan 함수가 게임의 규칙 그대로).
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw

import layout as LY
import render_preview as R

A, MAP = R.A, R.MAP
UG = MAP['underground']['floors'][0]
ORES = {(o['col'], o['row']) for o in UG['ores']}
SPORES = {(o['col'], o['row']) for o in UG['spores']}
START = {(o['col'], o['row']) for o in UG['startDug']}
ENTRY = (UG['entry']['col'], UG['entry']['row'])
HOLE = (UG['sealedHole']['col'], UG['sealedHole']['row'])
CAVE = (0x2a, 0x20, 0x19)                    # 안 판 곳(어둠) = 화면 바탕색
AMBIENT = (0x40 / 255, 0x3a / 255, 0x4c / 255)  # 지하의 화면색(빛 지도)
UG_WALL_H = 94                               # 벽 높이(화면 px)


# ------------------------------------------------------------------ 게임과 같은 규칙
def ug_plan(dug, ores=ORES, spores=SPORES, cols=UG['cols'], rows=UG['rows']):
    """파낸 칸 집합 -> 놓을 조각 [dict(key, col, row, depth)]. DEMO_SPEC 17.3."""
    D = set(dug)

    def tall(c, r):                               # 벽이 서는 흙 덩어리
        return (c, r) not in D and ((c + 1, r) in D or (c, r + 1) in D or (c + 1, r + 1) in D)

    def solid(c, r):
        return (c, r) in D or tall(c, r)

    def wy(c, r):
        return LY.t2w(c, r)[1]

    out = []
    for r in range(-1, rows + 1):
        for c in range(-1, cols + 1):
            if (c, r) in D:
                out.append(dict(key=f'ug_floor_{(c * 7 + r * 3) % 3 + 1}', col=c, row=r, depth=1))
            if solid(c, r):
                if not solid(c, r + 1):
                    out.append(dict(key='ug_cut_l', col=c, row=r, depth=1.5))
                if not solid(c + 1, r):
                    out.append(dict(key='ug_cut_r', col=c, row=r, depth=1.5))
            if tall(c, r):
                out.append(dict(key='ug_cap', col=c, row=r, depth=10 + wy(c, r) - 1.5))
                for side, (fc, fr) in (('l', (c + 1, r)), ('r', (c, r + 1))):
                    if tall(fc, fr):
                        continue
                    kind = 'iron' if (c, r) in ores else 'mush' if (c, r) in spores else \
                        'b' if (fc, fr) in D and (c * 7 + r * 13 + (3 if side == 'l' else 0)) % 5 == 0 else 'a'
                    out.append(dict(key=f'ug_wall_{side}_{kind}', col=fc, row=fr, depth=10 + wy(fc, fr) - 21))
            if (c, r) in D and tall(c - 1, r) and tall(c, r - 1):
                out.append(dict(key='ug_pillar', col=c, row=r, depth=10 + wy(c, r) - 20.5))
    return out


# ------------------------------------------------------------------ 그리기
def put(world, origin, key, col, row, frame=None, flip=False, alpha=1.0, dx=0, dy=0):
    m = A[key]
    im = R.img(key, frame, flip)
    if alpha < 1:
        a = np.asarray(im).copy()
        a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
        im = Image.fromarray(a)
    wx, wy = LY.t2w(col, row)
    ox = (1 - m['originX']) * im.width if flip else m['originX'] * im.width
    world.alpha_composite(im, (int(round(wx - origin[0] - ox + dx)), int(round(wy - origin[1] - m['originY'] * im.height + dy))))


def compose(dug, things, size, origin, fade=()):
    """things: dict(key, col, row, frame?, flip?, depth? (없으면 10 + 발 y), bias?, alpha?)"""
    world = Image.new('RGBA', size, CAVE + (255,))
    items = []
    for p in ug_plan(dug):
        p = dict(p)
        if (p['col'], p['row'], p['key'][:7]) in fade:
            p['alpha'] = 0.35
        items.append(p)
    for t in things:
        t = dict(t)
        t.setdefault('depth', 10 + LY.t2w(t['col'], t['row'])[1] + t.get('bias', 0))
        items.append(t)
    for i, t in sorted(enumerate(items), key=lambda it: (it[1]['depth'], it[0])):
        put(world, origin, t['key'], t['col'], t['row'], t.get('frame'), t.get('flip', False), t.get('alpha', 1.0), t.get('dx', 0), t.get('dy', 0))
    return world


def add_glow(im, key, x, y, alpha, scale=1.0):
    """ADD 블렌드(빛 기둥, 불빛 무리)"""
    g = R.img(key)
    if scale != 1.0:
        g = g.resize((int(g.width * scale), int(g.height * scale)), Image.BILINEAR)
    m = A[key]
    x0, y0 = int(x - m['originX'] * g.width), int(y - m['originY'] * g.height)
    arr = np.asarray(im, np.float32)
    ga = np.asarray(g, np.float32) / 255.0
    h, w = arr.shape[:2]
    a0, b0, a1, b1 = max(0, -x0), max(0, -y0), min(g.width, w - x0), min(g.height, h - y0)
    sl = (slice(y0 + b0, y0 + b1), slice(x0 + a0, x0 + a1))
    arr[sl + (slice(0, 3),)] += ga[b0:b1, a0:a1, :3] * 255 * ga[b0:b1, a0:a1, 3:4] * alpha
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def light_of(t):
    """가구의 빛(DEMO_SPEC 17.5 의 표). 위치 = 기준점 + manifest 의 flame / lamp (좌우 뒤집으면 x 도 반대로)"""
    wx, wy = LY.t2w(t['col'], t['row'])
    s = -1 if t.get('flip') else 1
    if t['key'] == 'build_fireplace' and t.get('frame', 'off') != 'off':
        fx, fy = A['build_fireplace']['flame']
        return [dict(x=wx + s * fx, y=wy + fy, r=300, alpha=1.0, glow=110, color=(1.0, 0.93, 0.78))]
    if t['key'] == 'build_lantern' and t.get('frame') == 'on':
        lx, ly = A['build_lantern']['lamp']
        return [dict(x=wx + s * lx, y=wy + ly, r=210, alpha=0.9, glow=60, color=(1.0, 0.93, 0.78))]
    return []


def lights_for(things, origin, shaft=True):
    out = []
    for t in things:
        out += light_of(t)
        if t['key'] == 'char_player' and t.get('frame') not in ('climb1', 'climb2'):
            wx, wy = LY.t2w(t['col'], t['row'])
            out.append(dict(x=wx, y=wy - 24, r=150, alpha=0.6, color=(0.92, 0.94, 1.0)))
    if shaft:
        wx, wy = LY.t2w(*ENTRY)
        out += [dict(x=wx, y=wy, r=170, alpha=0.9, color=(1.0, 0.97, 0.88)), dict(x=wx, y=wy - 130, r=120, alpha=0.7, color=(1.0, 0.97, 0.88))]
    return out


def light_up(world, things, origin, shaft=True, flicker=1.0):
    lights = lights_for(things, origin, shaft)
    for L in lights:
        if L.get('glow'):
            L['r'] = int(L['r'] * flicker)
    im = world
    if shaft:
        wx, wy = LY.t2w(*ENTRY)
        im = add_glow(im, 'glow_shaft', wx - origin[0], wy - origin[1], 0.55)
    return R.night(im, origin, lights, AMBIENT)


def badge(im, text, sub=None):
    """시계 아래의 '지하 1층' 표시 + 땅 위 소식"""
    d = ImageDraw.Draw(im, 'RGBA')
    cx = im.width // 2
    tw = d.textlength(text, font=R.font(26))
    R.panel(d, (cx - tw / 2 - 64, 106, cx + tw / 2 + 26, 158), 26)
    R.icon(im, 'icon_underground', cx - tw / 2 - 56, 110, 44)
    d.text((cx - tw / 2 - 6, 132), text, font=R.font(26), fill=R.INK, anchor='lm')
    if sub:
        icon, msg = sub
        tw2 = d.textlength(msg, font=R.font(24, False))
        R.panel(d, (cx - tw2 / 2 - 52, 168, cx + tw2 / 2 + 24, 214), 23, fill=(255, 244, 214, 240))
        R.icon(im, icon, cx - tw2 / 2 - 46, 171, 40)
        d.text((cx - tw2 / 2 - 2, 191), msg, font=R.font(24, False), fill=R.INK, anchor='lm')
    return im


def hunger_row(im, n):
    d = ImageDraw.Draw(im, 'RGBA')
    R.panel(d, (24, 104, 24 + 5 * 48 + 22, 160), 20)
    for i in range(5):
        R.icon(im, 'icon_hunger' if i < n else 'icon_hunger_empty', 34 + i * 48, 108, 48)


def float_text(im, origin, col, row, icon_key, text, dy=-120):
    x, y = LY.t2w(col, row)
    x, y = x - origin[0], y - origin[1] + dy
    R.icon(im, icon_key, x - 50, y - 24, 48)
    ImageDraw.Draw(im).text((x + 2, y), text, font=R.font(34), fill=(255, 252, 240), anchor='lm', stroke_width=5, stroke_fill=R.INK)


# ------------------------------------------------------------------ 장면
HOME = START | {(c, r) for c in (16, 17) for r in (13, 14, 15)} | {(c, r) for c in (13, 14, 15) for r in (16, 17)} | {(17, 12), (17, 11)}
TODO17 = ['굴 입구 짓기', '지하로 내려가기', '방 넓히기(10칸)', '침대 놓기', '버섯 기르기']


def home_things():
    return [dict(key='ug_ladder', col=ENTRY[0], row=ENTRY[1]),
            dict(key='build_bed', col=15.5, row=13, frame='empty'),
            dict(key='build_fireplace', col=13, row=15, frame='burn2'),
            dict(key='build_rug', col=14.5, row=14.5, depth=2),
            dict(key='build_table', col=15, row=14), dict(key='build_stool', col=16, row=14), dict(key='build_stool', col=15, row=15),
            dict(key='build_chest', col=13, row=14, frame='closed'),
            dict(key='build_lantern', col=17, row=15, frame='on'), dict(key='build_lantern', col=15, row=17, frame='on', flip=True),
            dict(key='build_planter', col=13, row=16, frame='ripe'), dict(key='build_planter', col=13, row=17, frame='grow'),
            dict(key='build_planter', col=14, row=17, frame='seed'),
            dict(key='ug_hole', col=HOLE[0], row=HOLE[1], frame='locked'),
            dict(key='char_dog', col=14.25, row=15.35, frame='sleep1')]


def view_origin(col, row, size=(LY.VIEW_W, LY.VIEW_H)):
    wx, wy = LY.t2w(col, row)
    return (wx - size[0] / 2, wy - size[1] / 2)


def still():
    origin = view_origin(15.6, 14.2)
    things = home_things() + [dict(key='char_player', col=17, row=11.05, frame='bpick2'),
                              dict(key='fx_dig_crack', col=17, row=11, frame='r2', depth=10 + LY.t2w(17, 11)[1] - 20)]
    world = compose(HOME, things, (LY.VIEW_W, LY.VIEW_H), origin)
    im = light_up(world, things, origin)
    float_text(im, origin, 17, 11, 'icon_iron', '+2', dy=-140)
    R.hud(im, '3일째 낮', False, 0.62, 5, [('wood', 7), ('stone', 18), ('iron', 4), ('mushroom', 3), ('spore', 2)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'hoe', 'watering_can'], [(i < 4, t) for i, t in enumerate(TODO17)])
    hunger_row(im, 4)
    badge(im, '지하 1층', ('icon_sun', '땅 위는 낮이에요 · 사다리를 누르면 올라가요'))
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_underground.png'))


# ------------------------------------------------------------------ 움직이는 미리보기(파기 -> 칸이 열림)
def gif():
    """오른쪽 위 벽(철 광맥)을 네 번 찍어 칸을 연다. 화면 가운데 960x600 만 저장."""
    origin = view_origin(15.6, 14.2)
    base = [t for t in home_things() if t['key'] != 'build_fireplace']
    frames = []
    seq = []                                                  # (프레임, 금 단계, 열렸나)
    for hit in range(4):
        seq += [('bpick1', hit, False)] * 3 + [('bpick2', hit + 1, hit == 3)] * 2 + [('bpick3', hit + 1, hit == 3)] * 2
    seq += [('bidle', 4, True)] * 6
    for i, (fr, stage, opened) in enumerate(seq):
        dug = HOME | ({(17, 10)} if opened else set())
        things = base + [dict(key='char_player', col=17, row=11.05, frame=fr),
                         dict(key='build_fireplace', col=13, row=15, frame=f'burn{i % 3 + 1}')]
        if 0 < stage < 4 and not opened:
            things.append(dict(key='fx_dig_crack', col=17, row=11, frame=f'r{min(stage, 3)}', depth=10 + LY.t2w(17, 11)[1] - 20))
        world = compose(dug, things, (LY.VIEW_W, LY.VIEW_H), origin)
        im = light_up(world, things, origin, flicker=1 + 0.03 * math.sin(i * 1.7))
        if opened:
            k = min(1.0, (i - 26) / 6) if i >= 26 else 0
            float_text(im, origin, 17, 10.6, 'icon_iron', '+2', dy=-110 - 30 * k)
        frames.append(im.crop((420, 200, 1380, 800)).convert('RGB'))          # 실제 크기 그대로 960x600 만 잘라 낸다
    pal = frames[len(frames) // 2].quantize(colors=160, method=Image.MEDIANCUT)
    out = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    out[0].save(os.path.join(R.ROOT, 'preview', 'preview_underground.gif'), save_all=True, append_images=out[1:], duration=110, loop=0)


def main():
    still()
    gif()
    print('preview_underground.png, preview_underground.gif')


if __name__ == '__main__':
    main()
