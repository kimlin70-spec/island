#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
19장 미리보기: 지하 꾸미기(바닥재, 벽판, 벽 장식, 해적 전리품). 게임이 아니라 그림이 게임 화면에서 어떻게 보일지 확인하는 용도.
실행: python tools/render_decor.py
결과: preview/preview_decor.png      꾸민 지하 집(preview_underground.png 와 같은 자리라 꾸미기 전후를 견줄 수 있다)
      preview/preview_decor_ui.png   꾸미기 창(만들 것 + 해적 전리품)과 마루를 까는 중
      preview/preview_loot.png       해적을 쓰러뜨린 뒤 떨어진 전리품 꾸러미를 줍는 모습

바닥재·벽판·벽 장식의 자리와 겹침 순서는 DEMO_SPEC.md 19장과 같다(decor_plan).
"""
import os

import numpy as np
from PIL import Image, ImageDraw

import layout as LY
import render_preview as R
import render_raid as RR
import render_underground as U

A = R.A


# ------------------------------------------------------------------ 게임과 같은 규칙(19.2~19.4)
def decor_plan(dug, floors, covers):
    """U.ug_plan 에 바닥재와 벽판을 입힌다. floors: {(c, r): 'oak'|'walnut'|'stone'}, covers: {(fc, fr, side): 'wood'|'plaster'}"""
    out = []
    for p in U.ug_plan(dug):
        c, r, k = p['col'], p['row'], p['key']
        if k.startswith('ug_floor_') and (c, r) in floors:
            p = dict(p, key=f'ug_floor_{floors[(c, r)]}_{(c * 7 + r * 3) % 2 + 1}')
        elif k.startswith('ug_wall_') and (c, r) in dug:
            side = k[8]
            if (c, r, side) in covers:
                p = dict(p, key=f'ug_wall_{side}_{covers[(c, r, side)]}')
        out.append(p)
        if k in ('ug_cut_l', 'ug_cut_r') and (c, r) in floors:                    # 꾸민 바닥의 앞 가장자리
            out.append(dict(key=f'ug_edge_{k[-1]}_{"stone" if floors[(c, r)] == "stone" else "wood"}', col=c, row=r, depth=1.6))
    return out


def wall_deco(key, fc, fr, side, frame=None):
    """벽 장식: 그 벽이 선 칸 자리에, depth = 벽 + 0.5, 오른쪽 위 벽이면 좌우 뒤집기."""
    wy = LY.t2w(fc, fr)[1]
    return dict(key=key, col=fc, row=fr, frame=frame or A[key]['frames'][0], flip=side == 'r', depth=10 + wy - 20.5)


def compose(dug, floors, covers, things, size, origin):
    world = Image.new('RGBA', size, U.CAVE + (255,))
    items = decor_plan(dug, floors, covers)
    for t in things:
        t = dict(t)
        t.setdefault('depth', 10 + LY.t2w(t['col'], t['row'])[1] + t.get('bias', 0))
        items.append(t)
    for i, t in sorted(enumerate(items), key=lambda it: (it[1]['depth'], it[0])):
        U.put(world, origin, t['key'], t['col'], t['row'], t.get('frame'), t.get('flip', False), t.get('alpha', 1.0), t.get('dx', 0), t.get('dy', 0))
    return world


def deco_lights(things):
    """벽 촛대와 서 있는 촛대의 빛(19.6)"""
    out = []
    for t in things:
        if t['key'] in ('deco_sconce', 'deco_candelabra') and t.get('frame', 'off') != 'off':
            wx, wy = LY.t2w(t['col'], t['row'])
            fx, fy = A[t['key']]['flame']
            s = -1 if t.get('flip') else 1
            r = 190 if t['key'] == 'deco_sconce' else 230
            out.append(dict(x=wx + s * fx, y=wy + fy, r=r, alpha=0.9, glow=46 if t['key'] == 'deco_sconce' else 60, color=(1.0, 0.92, 0.76)))
    return out


def night_light(world, things, origin):
    lights = U.lights_for(things, origin, shaft=False) + deco_lights(things) + RR.lantern_lights(things)
    return R.night(world, origin, lights, U.AMBIENT)


# ------------------------------------------------------------------ 꾸민 집
FLOORS = {**{(c, r): 'oak' for c in (13, 14, 15) for r in (13, 14, 15)},
          **{(c, r): 'walnut' for c in (16, 17) for r in (13, 14, 15)},
          **{(c, r): 'stone' for c in (13, 14, 15) for r in (16, 17)}}
COVERS = {(13, 13, 'l'): 'plaster', (13, 14, 'l'): 'plaster', (13, 15, 'l'): 'plaster', (13, 16, 'l'): 'wood', (13, 17, 'l'): 'wood',
          (13, 13, 'r'): 'plaster', (14, 13, 'r'): 'plaster', (15, 13, 'r'): 'wood', (16, 13, 'r'): 'wood'}


def home_decor(player=True):
    keep = [t for t in U.home_things() if t['key'] not in ('build_rug', 'build_lantern', 'char_dog')]
    things = keep + [
        dict(key='deco_rug_persian', col=14.5, row=14.5, frame='rug', depth=2),
        dict(key='deco_rug_round', col=16.5, row=14.5, frame='rug', depth=2),
        dict(key='build_lantern', col=15, row=17, frame='on', flip=True),
        dict(key='deco_candelabra', col=14, row=13, frame='on1'),
        dict(key='deco_globe', col=17, row=13, frame='globe'),
        dict(key='deco_treasure', col=17, row=14, frame='open'),
        dict(key='deco_barrel', col=15, row=16, frame='barrel'),
        dict(key='char_dog', col=14.25, row=15.35, frame='sleep1'),
        wall_deco('deco_painting', 14, 13, 'r'), wall_deco('deco_flag', 16, 13, 'r'), wall_deco('deco_sconce', 15, 13, 'r', 'on1'),
        wall_deco('deco_sconce', 13, 14, 'l', 'on2'), wall_deco('deco_shelf', 13, 16, 'l'), wall_deco('deco_wheel', 13, 17, 'l'),
        wall_deco('deco_map', 13, 13, 'r')]
    if player:
        things.append(dict(key='char_player', col=16.3, row=15.7, frame='idle', flip=True))
    return things


TODO19 = ['나무 마루 10칸 깔기', '벽판 4칸 대기', '벽 장식 달기', '해적 전리품 줍기']


def still():
    origin = U.view_origin(15.6, 14.2)
    things = home_decor()
    world = compose(U.HOME, FLOORS, COVERS, things, (LY.VIEW_W, LY.VIEW_H), origin)
    im = night_light(world, things, origin)
    R.hud(im, '6일째 밤', True, 0.35, 5, [('wood', 64), ('stone', 120), ('iron', 9), ('mushroom', 4)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'gun'], [(True, t) for t in TODO19])
    U.hunger_row(im, 4)
    U.badge(im, '지하 1층')
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_decor.png'))


# ------------------------------------------------------------------ 꾸미기 창
CRAFT = [('icon_floor_oak', '나무 마루', {'wood': 1}), ('icon_floor_walnut', '짙은 마루', {'wood': 2}), ('icon_floor_stone', '돌 바닥', {'stone': 2}),
         ('icon_wall_wood', '나무 벽판', {'wood': 2}), ('icon_wall_plaster', '회벽', {'stone': 1, 'wood': 1}),
         ('icon_shelf', '선반', {'wood': 2}), ('icon_sconce', '벽 촛대', {'iron': 1, 'wood': 1}), ('icon_painting', '그림 액자', {'wood': 2})]
LOOT = [('icon_rug_persian', '페르시아 양탄자', 1), ('icon_rug_round', '둥근 양탄자', 2), ('icon_rug_runner', '긴 양탄자', 0),
        ('icon_flag', '해적 깃발', 1), ('icon_wheel', '배 키', 1), ('icon_map', '보물 지도', 0), ('icon_candelabra', '촛대', 1),
        ('icon_globe', '지구본', 1), ('icon_treasure', '보물 상자', 0), ('icon_barrel', '술통', 2)]


def decor_panel(im, selected='나무 마루', cw=150, ch=172):
    """만들기 창의 '꾸미기' 쪽: 위 줄 = 재료로 만드는 것, 아래 줄 = 해적 전리품(가진 수)"""
    W, H = im.size
    gap, pad, cols = 10, 18, 10
    width = cols * cw + (cols - 1) * gap + pad * 2
    height = pad * 2 + 2 * (34 + ch) + gap + 14
    x0, y0 = W - 24 - width, H - 184 - height
    d = ImageDraw.Draw(im, 'RGBA')
    R.panel(d, (x0, y0, W - 24, H - 184))
    for tx, label, on in ((x0 + pad, '만들기', False), (x0 + pad + 112, '꾸미기', True)):                 # 탭
        d.rounded_rectangle((tx - 8, y0 + 8, tx + 96, y0 + 44), 14, fill=(R.YELLOW if on else (236, 226, 208)) + (255,), outline=R.INK + (255,), width=3 if on else 2)
        d.text((tx + 44, y0 + 26), label, font=R.font(24), fill=R.INK, anchor='mm')
    d.text((W - 24 - pad, y0 + 26), '흐린 것은 재료나 전리품이 없는 것', font=R.font(19, False), fill=(132, 120, 110), anchor='rm')

    def card(x, y, ic, name, cost, ok, sel=False):
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer, 'RGBA')
        ld.rounded_rectangle((x, y, x + cw, y + ch), 14, fill=R.CARD + (255,), outline=(R.YELLOW if sel else R.INK) + (255,), width=7 if sel else 3)
        R.icon(layer, ic, x + (cw - 84) // 2, y + 6, 84)
        ld.text((x + cw // 2, y + ch - 62), name, font=R.font(21 if len(name) > 5 else 23), fill=R.INK, anchor='mm')
        if isinstance(cost, dict):
            tw = len(cost) * 60 - 6
            px = x + (cw - tw) // 2
            for k, v in cost.items():
                R.icon(layer, 'icon_' + k, px, y + ch - 46, 36)
                ld.text((px + 38, y + ch - 28), str(v), font=R.font(22), fill=R.INK, anchor='lm')
                px += 60
        else:
            ld.text((x + cw // 2, y + ch - 26), f'가진 것 {cost}', font=R.font(21, False), fill=R.INK, anchor='mm')
        if not ok:
            a = np.asarray(layer).copy()
            a[..., 3] = (a[..., 3] * 0.42).astype(np.uint8)
            layer = Image.fromarray(a)
        im.alpha_composite(layer)

    y = y0 + pad + 40
    d.text((x0 + pad, y), '재료로 만들기', font=R.font(21), fill=(110, 98, 90), anchor='lm')
    for i, (ic, name, cost) in enumerate(CRAFT):
        card(x0 + pad + i * (cw + gap), y + 16, ic, name, cost, True, name == selected)
    y += 16 + ch + gap + 14
    d.text((x0 + pad, y), '해적 전리품', font=R.font(21), fill=(110, 98, 90), anchor='lm')
    for i, (ic, name, n) in enumerate(LOOT):
        card(x0 + pad + i * (cw + gap), y + 16, ic, name, n, n > 0)
    return im


def hint_below_badge(im, msg, y=172):
    """지하에서는 시계 아래에 '지하 1층' 표시가 있으므로 안내 글은 그 아래에 둔다(19.7)."""
    d = ImageDraw.Draw(im, 'RGBA')
    cx = im.width // 2
    tw = d.textlength(msg, font=R.font(28))
    R.panel(d, (cx - tw / 2 - 28, y, cx + tw / 2 + 28, y + 56), 28)
    d.text((cx, y + 28), msg, font=R.font(28), fill=R.INK, anchor='mm')


def ui():
    """마루를 한 칸씩 까는 중(짓기 상태 유지, 5.4): 깔린 칸 + 방금 깐 칸의 먼지 + 포인터 칸 표시(overlay_ok) + 꾸미기 창"""
    origin = U.view_origin(16.4, 18.4)
    half = {k: v for k, v in FLOORS.items() if v == 'oak' and (k[0] + k[1] <= 28 or k == (14, 15))}
    things = [t for t in U.home_things() if t['key'] not in ('build_rug',)] + [dict(key='char_player', col=15.6, row=15.6, frame='bidle', flip=True)]
    things.append(dict(key='overlay_ok', col=15, row=14, depth=3))
    things.append(dict(key='fx_dust', col=14, row=15, frame='dust2', dy=-4, depth=50000, alpha=0.8))
    world = compose(U.HOME, half, {(13, 13, 'l'): 'plaster', (13, 14, 'l'): 'plaster'}, things, (LY.VIEW_W, LY.VIEW_H), origin)
    im = night_light(world, things, origin)
    R.hud(im, '6일째 밤', True, 0.35, 5, [('wood', 64), ('stone', 120), ('iron', 9), ('mushroom', 4)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'gun'], [(i < 1, t) for i, t in enumerate(TODO19)], craft_on=True)
    U.badge(im, '지하 1층')
    hint_below_badge(im, '나무 마루: 깔 칸을 누르세요')
    decor_panel(im)
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_decor_ui.png'))


# ------------------------------------------------------------------ 전리품
def loot():
    """지하에서 해적을 물리친 뒤: 전리품 꾸러미 둘(반짝임), 하나를 줍는 중 + '전리품' 알림"""
    origin = U.view_origin(15.0, 14.6)
    things = [t for t in U.home_things() if t['key'] != 'char_dog']
    things += [dict(key='obj_loot', col=14.0, row=13.6), dict(key='obj_loot', col=16.6, row=14.3),
               dict(key='fx_sparkle', col=14.0, row=13.6, frame='sparkle2', dy=-30, depth=50000),
               dict(key='fx_sparkle', col=16.6, row=14.3, frame='sparkle3', dy=-26, depth=50000),
               dict(key='fx_poof', col=16.6, row=14.3, dy=-20, depth=50000, alpha=0.5),
               dict(key='char_player', col=14.3, row=14.15, frame='crouch', flip=True),
               dict(key='char_dog', col=15.2, row=15.0, frame='sit', flip=True)]
    world = compose(U.HOME, {}, {}, things, (LY.VIEW_W, LY.VIEW_H), origin)
    im = night_light(world, things, origin)
    U.float_text(im, origin, 14.0, 13.6, 'icon_rug_persian', '+1', dy=-110)
    R.hud(im, '3일째 밤', True, 0.82, 3, [('wood', 7), ('stone', 18), ('iron', 4), ('mushroom', 3)],
          ['dagger', 'tshirt', 'axe', 'pickaxe', 'gun'], [(i < 3, t) for i, t in enumerate(TODO19)])
    U.badge(im, '지하 1층')
    RR.toast(im, 'icon_treasure', '전리품: 페르시아 양탄자', y=168)
    im.convert('RGB').save(os.path.join(R.ROOT, 'preview', 'preview_loot.png'))


def main():
    still()
    ui()
    loot()
    print('preview_decor.png, preview_decor_ui.png, preview_loot.png')


if __name__ == '__main__':
    main()
