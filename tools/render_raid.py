#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
18장 미리보기: 해적의 지하 침입. 게임이 아니라 그림이 게임 화면에서 어떻게 보일지 확인하는 용도.
실행: python tools/render_raid.py
결과: preview/preview_raid_surface.png  땅 위(주인공은 지하에 있다): 해적이 굴 입구 뚜껑을 부수는 중
      preview/preview_raid_underground.png  지하: 부서진 입구로 해적이 사다리를 타고 내려온다
      preview/preview_raid.gif  지하: 쿵쿵(흙이 떨어짐) -> 뚜껑이 부서짐 -> 해적이 내려와 다가온다
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw

import layout as LY
import render_farm as F
import render_preview as R
import render_underground as U

A = R.A
ENTRY = U.ENTRY
MOON = (0.62, 0.72, 1.0)


# ------------------------------------------------------------------ 해적 + 허리 등불
def pirate(key, col, row, frame, flip=False, dy=0, depth=None, lantern=True, lframe='flicker1'):
    """해적과 등불(기준점 + manifest lantern, 뒷모습이면 b, 뒤집으면 x 반대)."""
    wx, wy = LY.t2w(col, row)
    d = depth if depth is not None else 10 + wy
    out = [dict(key=key, col=col, row=row, frame=frame, flip=flip, dy=dy, depth=d)]
    if lantern:
        hx, hy = A[key]['lantern']['b' if frame.startswith('b') or frame.startswith('climb') else 'f']
        out.append(dict(key='fx_pirate_lantern', col=col, row=row, frame=lframe, dx=-hx if flip else hx, dy=dy + hy, depth=d + 0.1,
                        lamp=True))
    return out


def lantern_lights(things):
    out = []
    for t in things:
        if t.get('lamp'):
            wx, wy = LY.t2w(t['col'], t['row'])
            out.append(dict(x=wx + t['dx'], y=wy + t['dy'] + 12, r=140, alpha=0.85, glow=34, color=(1.0, 0.86, 0.62)))
    return out


def particles(im, origin, pts):
    """pts: [(world x, world y, frame, alpha)]"""
    m = A['fx_particles']
    for x, y, fr, a in pts:
        sp = R.img('fx_particles', fr)
        if a < 1:
            arr = np.asarray(sp).copy()
            arr[..., 3] = (arr[..., 3] * a).astype(np.uint8)
            sp = Image.fromarray(arr)
        im.alpha_composite(sp, (int(x - origin[0] - m['originX'] * sp.width), int(y - origin[1] - m['originY'] * sp.height)))


def debris(seed, t, n=14, spread=26, top=150, kinds=('wood1', 'wood2', 'dirt', 'dust')):
    """사다리 구멍에서 떨어지는 부스러기. t = 떨어지기 시작한 뒤 초."""
    rng = random.Random(seed)
    ex, ey = LY.t2w(*ENTRY)
    out = []
    for _ in range(n):
        x0 = ex + rng.uniform(-spread, spread)
        delay = rng.uniform(0, 0.35)
        tt = t - delay
        if tt < 0:
            continue
        y = ey - top + 0.5 * 900 * tt * tt + rng.uniform(-10, 10)
        if y > ey + rng.uniform(4, 16):
            continue
        out.append((x0 + rng.uniform(-6, 6) * tt, y, rng.choice(kinds), 1.0))
    return out


def toast(im, icon_key, msg, y=168):
    d = ImageDraw.Draw(im, 'RGBA')
    cx = im.width // 2
    tw = d.textlength(msg, font=R.font(26))
    R.panel(d, (cx - tw / 2 - 60, y, cx + tw / 2 + 28, y + 54), 26, fill=(255, 226, 214, 245))
    R.icon(im, icon_key, cx - tw / 2 - 54, y + 3, 48)
    d.text((cx - tw / 2 - 2, y + 27), msg, font=R.font(26), fill=R.INK, anchor='lm')


def emote_over_ladder(things, frame='alert'):
    things.append(dict(key='fx_emote', col=ENTRY[0], row=ENTRY[1], frame=frame, dy=-150, depth=50000))


def ug_light(world, things, origin, moon=True, flicker=1.0):
    """지하 밤: 입구는 부서져 달빛만 조금(파란 빛 기둥), 해적 등불 빛을 더한다."""
    lights = U.lights_for(things, origin, shaft=False) + lantern_lights(things)
    for L in lights:
        if L.get('glow') and L['r'] >= 200:
            L['r'] = int(L['r'] * flicker)
    im = world
    if moon:
        wx, wy = LY.t2w(*ENTRY)
        g = R.img('glow_shaft')
        arr = np.asarray(g).astype(np.float32)
        arr[..., :3] *= np.array(MOON, np.float32)
        tinted = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        R._cache[('glow_shaft_moon', None, False)] = tinted
        U.A['glow_shaft_moon'] = A['glow_shaft']
        im = U.add_glow(im, 'glow_shaft_moon', wx - origin[0], wy - origin[1], 0.3)
        lights += [dict(x=wx, y=wy, r=120, alpha=0.4, color=MOON), dict(x=wx, y=wy - 120, r=90, alpha=0.3, color=MOON)]
    return R.night(im, origin, lights, U.AMBIENT)


# ------------------------------------------------------------------ 땅 위
def surface():
    """주인공은 지하에 있다. 해적이 굴 입구(38,38)를 부수는 중(damaged), 총잡이는 곁을 지킨다."""
    burrow = (38, 38)
    ring = [t for t in F.RING if t != F.GATE]
    things = [F.TENT, dict(key='build_campfire', col=F.FIRE[0], row=F.FIRE[1], frame='burn2'),
              dict(key='build_burrow', col=burrow[0], row=burrow[1], frame='damaged'),
              dict(key='char_pirate_1', col=39.05, row=38.0, frame='battack', flip=True),
              dict(key='char_pirate_2', col=38.0, row=39.05, frame='battack0'),
              dict(key='char_pirate_3', col=39.7, row=40.9, frame='idle', flip=True),
              dict(key='char_zombie', col=41.6, row=36.2, frame='walk2', flip=True)]
    trees = sorted((p for p, o in F.OBJS.items() if o['kind'] in ('tree', 'pine', 'palm')), key=lambda p: (p[0] - 37) ** 2 + (p[1] - 39) ** 2)
    world = F.scene(things, ring, {F.GATE: 'open3'}, stumps=set(trees[:11]))
    im, origin = F.screen(world, 38.5, 39.0)
    rng = random.Random(4)
    bx, by = LY.t2w(*burrow)
    pts = [(bx + rng.uniform(-30, 34), by - rng.uniform(4, 46), rng.choice(['wood1', 'wood2', 'wood2', 'dust']), 1.0) for _ in range(9)]
    particles(im, origin, pts)
    fx, fy = LY.t2w(*F.FIRE)
    lights = [dict(x=fx, y=fy + A['build_campfire']['flame'][1], r=300, glow=110)]
    im = R.night(im, origin, lights)
    d = ImageDraw.Draw(im, 'RGBA')
    msg = '땅 위의 모습 · 주인공은 지하에 있다 · 해적이 굴 입구 뚜껑을 부수는 중(damaged → broken)'
    tw = d.textlength(msg, font=R.font(26))
    R.panel(d, (24, 24, 24 + tw + 44, 82), 22)
    d.text((46, 53), msg, font=R.font(26), fill=R.INK, anchor='lm')
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_raid_surface.png'))


# ------------------------------------------------------------------ 지하
def base_things():
    return [t for t in U.home_things() if t['key'] not in ('build_fireplace', 'char_dog')]


def underground():
    origin = U.view_origin(15.0, 14.6)
    ex, ey = LY.t2w(*ENTRY)
    lad = 10 + ey
    things = base_things() + [dict(key='build_fireplace', col=13, row=15, frame='burn2')]
    things += pirate('char_pirate_1', ENTRY[0], ENTRY[1], 'climb2', dy=-62, depth=lad + 1)
    things += pirate('char_pirate_2', 14.1, 13.9, 'walk2', lframe='flicker2')
    things += [dict(key='char_player', col=15.6, row=15.55, frame='bdagger1', flip=True),
               dict(key='char_dog', col=16.4, row=15.1, frame='bark', flip=True)]
    emote_over_ladder(things)
    dex, dey = U.A['char_dog']['emote']['bark']
    things.append(dict(key='fx_emote', col=16.4, row=15.1, frame='alert', dx=-dex, dy=dey, depth=50000))
    world = U.compose(U.HOME, things, (LY.VIEW_W, LY.VIEW_H), origin)
    particles(world, origin, debris(7, 0.42, n=10, spread=20))
    im = ug_light(world, things, origin)
    R.hud(im, '3일째 밤', True, 0.4, 4, [('wood', 7), ('stone', 18), ('iron', 4), ('mushroom', 3)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'gun'], [(i < 4, t) for i, t in enumerate(U.TODO17)])
    U.hunger_row(im, 4)
    U.badge(im, '지하 1층')
    toast(im, 'icon_pirate', '해적이 내려옵니다!')
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_raid_underground.png'))


def gif():
    """쿵쿵 두 번(흙이 떨어짐) -> 부서짐(부스러기) -> 첫 해적이 내려와 외치고 다가온다 -> 둘째가 내려오기 시작"""
    origin = U.view_origin(15.0, 14.6)
    ex, ey = LY.t2w(*ENTRY)
    lad = 10 + ey
    frames = []
    N = 52
    for i in range(N):
        t = i * 0.11
        things = base_things() + [dict(key='build_fireplace', col=13, row=15, frame=f'burn{i % 3 + 1}'),
                                  dict(key='char_player', col=15.6, row=15.55, frame='bidle' if i < 26 else 'bdagger1', flip=True),
                                  dict(key='char_dog', col=16.4, row=15.1, frame='bark' if (i // 3) % 2 and i > 8 else 'sit', flip=True)]
        msg = None
        shake = (0, 0)
        pts = []
        if i < 14:                                            # 두드림 두 번
            emote_over_ladder(things)
            msg = '해적이 굴 입구를 부수고 있습니다'
            for k0 in (1, 7):
                if k0 <= i < k0 + 3:
                    shake = ((-2, 1), (2, -1), (-1, 0))[i - k0]
                if i >= k0:
                    pts += debris(30 + k0, (i - k0) * 0.11, n=4, spread=14, kinds=('dirt', 'dust'))
        else:
            msg = '해적이 내려옵니다!'
            if i < 30:
                pts += debris(9, (i - 14) * 0.11, n=14, spread=24)
            if i in (14, 15):
                shake = ((-3, 2), (3, -1))[i - 14]
        lf = f'flicker{(i % 3) + 1}'
        if 16 <= i < 30:                                      # 첫째: 사다리를 타고 내려옴
            k = (i - 16) / 13
            things += pirate('char_pirate_1', ENTRY[0], ENTRY[1], 'climb1' if (i // 3) % 2 else 'climb2', dy=-150 * (1 - k), depth=lad + 1, lframe=lf)
        elif i >= 30:                                         # 내려와서 주인공 쪽으로 걷는다
            k = min(1.0, (i - 33) / 18) if i >= 33 else 0
            col, row = ENTRY[0] + 0.15 + 1.25 * k, ENTRY[1] + 0.55 + 0.75 * k
            fr = 'idle' if i < 33 else f'walk{(i // 2) % 4 + 1}'
            things += pirate('char_pirate_1', col, row, fr, lframe=lf)
        if i >= 40:                                           # 둘째가 내려오기 시작
            k = min(1.0, (i - 40) / 13)
            things += pirate('char_pirate_2', ENTRY[0], ENTRY[1], 'climb2' if (i // 3) % 2 else 'climb1', dy=-150 * (1 - k), depth=lad + 1, lframe=lf)
        o2 = (origin[0] + shake[0], origin[1] + shake[1])
        world = U.compose(U.HOME, things, (LY.VIEW_W, LY.VIEW_H), o2)
        particles(world, o2, pts)
        im = ug_light(world, things, o2, flicker=1 + 0.03 * math.sin(i * 1.7))
        if msg:
            toast(im, 'icon_pirate', msg, y=150)
        if 30 <= i < 38:                                      # 외침
            x, y = LY.t2w(ENTRY[0] + 0.15, ENTRY[1] + 0.55)
            ImageDraw.Draw(im).text((x - o2[0] + 30, y - o2[1] - 118), '야아르!', font=R.font(34), fill=(255, 252, 240), anchor='lm', stroke_width=5, stroke_fill=R.INK)
        frames.append(im.crop((420, 130, 1380, 730)).convert('RGB'))
    pal = frames[34].quantize(colors=160, method=Image.MEDIANCUT)
    out = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    out[0].save(os.path.join(R.ROOT, 'preview', 'preview_raid.gif'), save_all=True, append_images=out[1:], duration=110, loop=0)


def main():
    surface()
    underground()
    gif()
    print('preview_raid_surface.png, preview_raid_underground.png, preview_raid.gif')


if __name__ == '__main__':
    main()
