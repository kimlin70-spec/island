#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
미리보기 그림 만들기(게임이 아니라, 그림과 맵이 게임 화면에서 어떻게 보일지 확인용).
실행: python tools/render_preview.py
결과: preview/preview_map.png, preview_day.png, preview_build.png, preview_night.png

여기 쓴 좌표, 겹침 순서, 울타리 연결, 밤의 '빛 지도' 계산이 DEMO_SPEC.md 3장과 같다.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import layout as LY

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
MAN = json.load(open(os.path.join(ASSETS, 'manifest.json'), encoding='utf-8'))
A = MAN['assets']
G = MAN['meta']['ground']
MAP = json.load(open(os.path.join(ROOT, 'data', 'map.json'), encoding='utf-8'))
INK = (74, 61, 56)
PAPER = (251, 246, 234)
CARD = (255, 252, 242)
YELLOW = (246, 207, 94)
NIGHT_AMBIENT = (0x66 / 255, 0x70 / 255, 0xB8 / 255)        # DEMO_SPEC 의 밤 색 #6670b8
_cache = {}


def font(size, bold=True):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
              "C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def img(key, frame=None, flip=False):
    ck = (key, frame, flip)
    if ck not in _cache:
        m = A[key]
        im = Image.open(os.path.join(ASSETS, m['file'])).convert('RGBA')
        if frame is not None:
            fw, fh = m['frameWidth'], m['frameHeight']
            i = m['frames'].index(frame)
            cols = m['w'] // fw                          # 여러 줄로 된 시트도 있다(왼쪽->오른쪽, 위->아래)
            x, y = (i % cols) * fw, (i // cols) * fh
            im = im.crop((x, y, x + fw, y + fh))
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        _cache[ck] = im
    return _cache[ck]


def ground():
    """바닥: 조각마다 가장자리 여유분(1px)을 뺀 안쪽 1022x1022만 이어 붙인다."""
    m, step = G['chunkMargin'], G['chunkStep']
    full = Image.new('RGB', (G['width'], G['height']))
    for ch in G['chunks']:
        part = Image.open(os.path.join(ASSETS, ch['file'])).crop((m, m, m + step, m + step))
        full.paste(part, (ch['x'] + m - G['x'], ch['y'] + m - G['y']))
    return full


def fence_mask(t, fences):
    """이웃한 울타리에 따라 0~15. 1: col+1, 2: col-1, 4: row+1, 8: row-1"""
    c, r = t
    return (1 if (c + 1, r) in fences else 0) | (2 if (c - 1, r) in fences else 0) | \
           (4 if (c, r + 1) in fences else 0) | (8 if (c, r - 1) in fences else 0)


def render(things=(), fences=(), stumps=(), rubble=(), floor=(), wires=(), hide=(), on_top=()):
    """바닥 그림 위에 사물을 '발 위치의 y' 순서로 그린다. 월드 전체 크기의 이미지를 돌려준다.
    things: dict(key, col, row, frame, flip, ox, oy, dz)  ox/oy = 그리는 위치만 옮김(포탑), dz = 순서만 미룸
    on_top: 맨 위에 그리는 것(날아가는 것, 불꽃) dict(key, x, y, ang, scale, flip)  x, y = 월드 좌표"""
    world = ground().convert('RGBA')

    def put(key, wx, wy, frame=None, flip=False):
        m = A[key]
        im = img(key, frame, flip)
        ox = m['originX'] if not flip else 1 - m['originX']
        fw = m.get('frameWidth', m['w'])
        fh = m.get('frameHeight', m['h'])
        world.alpha_composite(im, (int(round(wx - G['x'] - ox * fw)), int(round(wy - G['y'] - m['originY'] * fh))))

    for f in floor:                                               # 바닥 표시(지을 수 있음/없음, 사거리)
        key, col, row = f[:3]
        wx, wy = LY.t2w(col, row)
        if len(f) > 3:                                            # 크기를 바꿔 그리는 사거리 표시
            im = img(key).resize(f[3], Image.LANCZOS)
            world.alpha_composite(im, (int(wx - G['x'] - im.width / 2), int(wy - G['y'] - im.height / 2)))
        else:
            put(key, wx, wy)
    draw = []
    for o in MAP['objects']:
        p = (o['col'], o['row'])
        if p in hide:
            continue
        key = 'obj_stump' if p in stumps else 'obj_rubble' if p in rubble else o['sprite']
        wx, wy = LY.t2w(*p)
        draw.append((wy, 0, key, wx, wy, None, False))
    fset = set(fences)
    for t in fset:
        wx, wy = LY.t2w(*t)
        draw.append((wy, 1, f'build_fence_{fence_mask(t, fset)}', wx, wy, None, False))
    wset = set(wires)
    for t in wset:
        wx, wy = LY.t2w(*t)
        draw.append((wy, 1, f'build_wire_{fence_mask(t, wset)}', wx, wy, None, False))
    for t in things:
        wx, wy = LY.t2w(t['col'], t['row'])
        draw.append((wy + t.get('dz', 0), 2, t['key'], wx + t.get('ox', 0), wy + t.get('oy', 0), t.get('frame'), t.get('flip', False)))
    for _, _, key, wx, wy, frame, flip in sorted(draw, key=lambda d: (d[0], d[1])):
        put(key, wx, wy, frame, flip)
    for f in on_top:
        put_rot(world, f['key'], f['x'], f['y'], f.get('ang', 0), f.get('scale', 1.0), f.get('flip', False), f.get('frame'))
    return world


def put_rot(world, key, wx, wy, ang=0.0, scale=1.0, flip=False, frame=None):
    """기준점을 중심으로 돌려서(ang 도, 화면에서 시계 방향) 그린다."""
    m = A[key]
    im = img(key, frame, flip)
    ox = (m['originX'] if not flip else 1 - m['originX']) * im.width
    oy = m['originY'] * im.height
    r = int(max(ox, im.width - ox, oy, im.height - oy)) + 2
    canvas = Image.new('RGBA', (2 * r, 2 * r), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(r - ox)), int(round(r - oy))))
    if scale != 1.0:
        canvas = canvas.resize((int(2 * r * scale), int(2 * r * scale)), Image.LANCZOS)
    canvas = canvas.rotate(-ang, resample=Image.BICUBIC)
    world.alpha_composite(canvas, (int(round(wx - G['x'] - canvas.width / 2)), int(round(wy - G['y'] - canvas.height / 2))))


def turret_index(tower, target):
    """포탑 방향 번호: 땅 위의 방향(세로를 2배로 펴서 잰 각도)을 16등분. tower, target = 칸 좌표"""
    (x0, y0), (x1, y1) = LY.t2w(*tower), LY.t2w(*target)
    n = A['turret_bow']['directions']
    ang = math.atan2((y1 - y0) * 2, x1 - x0)
    return int(round(ang / (2 * math.pi / n))) % n


def tower_parts(kind, col, row, target, shot=False):
    """탑 받침 + 포탑. 포탑은 받침의 mount 위치에 그리고, 순서는 받침 바로 다음."""
    base = A['build_watchtower' if kind == 'bow' else 'build_guntower']
    i = turret_index((col, row), target)
    tkey = base['turret']
    frame = (f'shot{i}' if shot else f'load{i}') if kind == 'bow' else f'dir{i}'
    mx, my = base['mount']
    parts = [dict(key='build_watchtower' if kind == 'bow' else 'build_guntower', col=col, row=row),
             dict(key=tkey, col=col, row=row, frame=frame, ox=mx, oy=my, dz=0.5)]
    wx, wy = LY.t2w(col, row)
    tip = A[tkey]['muzzle'][i]
    return parts, (wx + mx + tip[0], wy + my + tip[1]), A[tkey]['screenAngle'][i], i


def arc_point(p0, p1, t, h):
    """화살이 날아가는 길(포물선) 위의 점과 그 점에서의 방향(도)"""
    x = p0[0] + (p1[0] - p0[0]) * t
    y = p0[1] + (p1[1] - p0[1]) * t - h * 4 * t * (1 - t)
    dx, dy = p1[0] - p0[0], (p1[1] - p0[1]) - h * 4 * (1 - 2 * t)
    return x, y, math.degrees(math.atan2(dy, dx))


def view(world, col, row, w=LY.VIEW_W, h=LY.VIEW_H):
    """카메라: (col,row)를 화면 가운데에 두되 바닥 그림 밖으로 나가지 않는다."""
    wx, wy = LY.t2w(col, row)
    x0 = int(min(max(wx - G['x'] - w / 2, 0), G['width'] - w))
    y0 = int(min(max(wy - G['y'] - h / 2, 0), G['height'] - h))
    return world.crop((x0, y0, x0 + w, y0 + h)), (x0 + G['x'], y0 + G['y'])


def night(im, origin, lights, ambient=NIGHT_AMBIENT):
    """게임과 같은 방식. (1) 모닥불 빛무리를 더한다(ADD). (2) 밤 색으로 채운 '빛 지도'에
    빛 그림(light_soft)을 보통 방식으로 겹쳐 그린다. (3) 화면에 빛 지도를 곱한다(MULTIPLY)."""
    arr = np.asarray(im.convert('RGB'), np.float32) / 255.0
    h, w = arr.shape[:2]
    soft = np.asarray(img('light_soft'), np.float32)[..., 3] / 255.0
    lm = np.ones((h, w, 3), np.float32) * np.array(ambient, np.float32)
    for L in lights:
        x, y = L['x'] - origin[0], L['y'] - origin[1]
        if L.get('glow'):
            gs = int(L['glow'])
            gim = np.asarray(img('glow_warm').resize((gs * 2, gs * 2), Image.BILINEAR), np.float32) / 255.0
            gx0, gy0 = int(x - gs), int(y - gs)
            a0, b0, a1, b1 = max(0, -gx0), max(0, -gy0), min(gs * 2, w - gx0), min(gs * 2, h - gy0)
            if a1 > a0 and b1 > b0:
                arr[gy0 + b0:gy0 + b1, gx0 + a0:gx0 + a1] += gim[b0:b1, a0:a1, :3] * gim[b0:b1, a0:a1, 3:4] * 0.45
        r = int(L['r'])
        stamp = np.asarray(Image.fromarray((soft * 255).astype(np.uint8)).resize((r * 2, r * 2), Image.BILINEAR), np.float32) / 255.0
        x0, y0 = int(x - r), int(y - r)
        sx0, sy0, sx1, sy1 = max(0, -x0), max(0, -y0), min(r * 2, w - x0), min(r * 2, h - y0)
        if sx1 <= sx0 or sy1 <= sy0:
            continue
        a = stamp[sy0:sy1, sx0:sx1, None] * L.get('alpha', 1.0)
        col = np.array(L.get('color', (1.0, 0.93, 0.78)), np.float32)
        sl = (slice(y0 + sy0, y0 + sy1), slice(x0 + sx0, x0 + sx1))
        lm[sl] = lm[sl] * (1 - a) + col * a
    out = np.clip(np.clip(arr, 0, 1) * lm, 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8)).convert('RGBA')


# ------------------------------------------------------------------ 화면 UI 예시
def panel(d, box, r=22, fill=PAPER + (236,), width=3):
    d.rounded_rectangle(box, r, fill=fill, outline=INK + (255,), width=width)


def icon(im, key, x, y, s):
    im.alpha_composite(img(key).resize((s, s), Image.LANCZOS), (int(x), int(y)))


def hud(im, clock, is_night, progress, hearts, mats, tools, todo, hint=None, craft_on=False):
    """mats: [('wood', 9), ('stone', 2), ('iron', 0)]"""
    d = ImageDraw.Draw(im, 'RGBA')
    W, H = im.size
    # 왼쪽 위: 하트
    panel(d, (24, 24, 24 + 5 * 58 + 24, 96))
    for i in range(5):
        icon(im, 'icon_heart' if i < hearts else 'icon_heart_empty', 36 + i * 58, 32, 56)
    # 가운데 위: 시계
    cx = W // 2
    panel(d, (cx - 230, 24, cx + 230, 96))
    icon(im, 'icon_moon' if is_night else 'icon_sun', cx - 222, 28, 64)
    d.text((cx - 150, 28), clock, font=font(26), fill=INK)
    d.rounded_rectangle((cx - 150, 66, cx + 206, 84), 9, fill=(196, 184, 168, 255))
    d.rounded_rectangle((cx - 150, 66, cx - 150 + int(356 * progress), 84), 9, fill=(104, 122, 196, 255) if is_night else (240, 190, 84, 255))
    # 오른쪽 위: 할 일
    panel(d, (W - 344, 24, W - 24, 82 + len(todo) * 36))
    d.text((W - 324, 32), '할 일', font=font(26), fill=INK)
    for i, (done, label) in enumerate(todo):
        y = 74 + i * 36
        d.rounded_rectangle((W - 322, y + 4, W - 300, y + 26), 5, outline=INK + (255,), width=2, fill=(143, 187, 120, 255) if done else CARD + (255,))
        if done:
            d.line([(W - 318, y + 15), (W - 313, y + 21), (W - 303, y + 9)], fill=(255, 255, 255, 255), width=3)
        d.text((W - 288, y - 2), label, font=font(23, False), fill=(132, 120, 110) if done else INK)
    # 왼쪽 아래: 재료와 장비
    panel(d, (24, H - 112, 24 + 14 + 142 * len(mats), H - 24))
    for i, (k, n) in enumerate(mats):
        icon(im, 'icon_' + k, 34 + 142 * i, H - 104, 72)
        d.text((108 + 142 * i, H - 88), str(n), font=font(34), fill=INK)
    x0 = 24 + 14 + 142 * len(mats) + 20
    panel(d, (x0, H - 112, x0 + 20 + len(tools) * 76, H - 24))
    for i, t in enumerate(tools):
        icon(im, 'icon_' + t, x0 + 12 + i * 76, H - 104, 72)
    # 오른쪽 아래: 만들기 버튼
    d.ellipse((W - 164, H - 164, W - 28, H - 28), fill=YELLOW + (255,), outline=INK + (255,), width=6 if craft_on else 4)
    icon(im, 'icon_craft', W - 136, H - 156, 80)
    d.text((W - 96, H - 62), '만들기', font=font(22), fill=INK, anchor='mm')
    if hint:
        tw = d.textlength(hint, font=font(28))
        panel(d, (cx - tw / 2 - 26, 120, cx + tw / 2 + 26, 174), 27)
        d.text((cx, 146), hint, font=font(28), fill=INK, anchor='mm')
    return im


def craft_panel(im, cards, selected=None, cols=None, cw=170, ch=196):
    """만들기 창. cards: (icon, 이름, {'wood':n,'stone':n,'iron':n} 또는 글자, 상태)  상태: ok | lack | owned"""
    W, H = im.size
    gap, pad = 12, 20
    cols = cols or len(cards)
    rows = (len(cards) + cols - 1) // cols
    width = cols * cw + (cols - 1) * gap + pad * 2
    x0, y0 = W - 24 - width, H - 184 - (pad * 2 + 44 + rows * ch + (rows - 1) * gap)
    d = ImageDraw.Draw(im, 'RGBA')
    panel(d, (x0, y0, W - 24, H - 184))
    d.text((x0 + pad, y0 + 14), '만들기', font=font(28), fill=INK)
    d.text((W - 24 - pad, y0 + 20), '재료가 모자라면 흐리게 보입니다', font=font(20, False), fill=(132, 120, 110), anchor='ra')
    for i, (ic, name, cost, state) in enumerate(cards):
        x, y = x0 + pad + (i % cols) * (cw + gap), y0 + pad + 44 + (i // cols) * (ch + gap)
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer, 'RGBA')
        sel = selected == name
        ld.rounded_rectangle((x, y, x + cw, y + ch), 16, fill=CARD + (255,), outline=(YELLOW if sel else INK) + (255,), width=7 if sel else 3)
        isz = min(96, ch - 100)
        icon(layer, ic, x + (cw - isz) // 2, y + 8, isz)
        ld.text((x + cw // 2, y + ch - 72), name, font=font(24), fill=INK, anchor='mm')
        if isinstance(cost, str):
            ld.text((x + cw // 2, y + ch - 32), cost, font=font(22, False), fill=INK, anchor='mm')
        else:
            parts = [(k, v) for k, v in cost.items()]
            tw = len(parts) * 66 - 6
            px = x + (cw - tw) // 2
            for k, v in parts:
                icon(layer, 'icon_' + k, px, y + ch - 52, 40)
                ld.text((px + 42, y + ch - 32), str(v), font=font(24), fill=INK, anchor='lm')
                px += 66
        if state != 'ok':                                       # 흐리게
            a = np.asarray(layer).copy()
            a[..., 3] = (a[..., 3] * 0.45).astype(np.uint8)
            layer = Image.fromarray(a)
        im.alpha_composite(layer)
    return im


def perimeter(c0, r0, n):
    """(c0,r0)에서 시작해 n x n 칸의 둘레를 한 바퀴 도는 칸 목록."""
    out = [(c, r0) for c in range(c0, c0 + n)] + [(c0 + n - 1, r) for r in range(r0 + 1, r0 + n)]
    out += [(c, r0 + n - 1) for c in range(c0 + n - 2, c0 - 1, -1)] + [(c0, r) for r in range(r0 + n - 2, r0, -1)]
    return out


def main():
    os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
    st = (MAP['playerStart']['col'], MAP['playerStart']['row'])
    objs = {(o['col'], o['row']): o for o in MAP['objects']}
    near = lambda p: (p[0] - st[0]) ** 2 + (p[1] - st[1]) ** 2

    # 캠프 자리: 시작점에 가장 가까운, 아무것도 없는 7x7 칸. 둘레에 울타리를 두른다.
    def free_block(c0, r0, n):
        return all((c, r) not in objs and MAP['terrain'][r][c] in (1, 2) for c in range(c0, c0 + n) for r in range(r0, r0 + n))
    cands = [(c, r) for c in range(st[0] - 12, st[0] + 6) for r in range(st[1] - 12, st[1] + 6) if free_block(c, r, 7)]
    c0, r0 = min(cands, key=lambda p: (p[0] + 3 - st[0]) ** 2 + (p[1] + 3 - st[1]) ** 2)
    ring = perimeter(c0, r0, 7)
    tent = dict(key='build_tent', col=c0 + 2.5, row=r0 + 2.5)          # 2x2: (c0+2..3, r0+2..3)
    fire = (c0 + 4, r0 + 4)
    trees = sorted((p for p, o in objs.items() if o['kind'] in ('tree', 'pine', 'palm')), key=near)
    rocks = sorted((p for p, o in objs.items() if o['kind'] == 'rock'), key=near)
    TODO = ['나무 도끼 만들기', '나무 곡괭이 만들기', '모닥불 피우기', '텐트 치기', '울타리 8개 세우기', '아침까지 버티기']
    todo = lambda n: [(i < n, t) for i, t in enumerate(TODO)]

    # ---------- 1) 섬 전체
    pz = MAP['pirates']
    world = render([dict(key='char_player', col=st[0], row=st[1], frame='idle'),
                    dict(key='obj_ship', col=pz['ship']['col'], row=pz['ship']['row']),
                    dict(key='obj_rowboat', col=pz['boat']['col'], row=pz['boat']['row'])])
    land = [LY.t2w(c, r) for r in range(MAP['rows']) for c in range(MAP['cols']) if MAP['terrain'][r][c]]
    xs, ys = [p[0] for p in land], [p[1] for p in land]
    box = (int(min(xs) - G['x'] - 330), int(min(ys) - G['y'] - 300), int(max(xs) - G['x'] + 330), int(max(ys) - G['y'] + 420))
    full = world.crop(box)
    d = ImageDraw.Draw(full, 'RGBA')

    def spot(col, row):
        x, y = LY.t2w(col, row)
        return x - G['x'] - box[0], y - G['y'] - box[1]

    def label(col, row, text, dy=-70):
        x, y = spot(col, row)
        d.text((x, y + dy), text, font=font(38), fill=(255, 252, 240), anchor='mm', stroke_width=5, stroke_fill=INK)

    for s in MAP['zombieSpawns']:
        x, y = spot(s['col'], s['row'])
        d.ellipse((x - 22, y - 11, x + 22, y + 11), fill=(164, 147, 199, 210), outline=INK + (255,), width=3)
    x, y = spot(pz['landing']['col'], pz['landing']['row'])
    d.ellipse((x - 22, y - 11, x + 22, y + 11), fill=(233, 120, 104, 220), outline=INK + (255,), width=3)
    label(st[0], st[1], '시작')
    label(MAP['zombieSpawns'][0]['col'], MAP['zombieSpawns'][0]['row'], '보라색 점: 좀비가 나오는 자리', -120)
    label(pz['ship']['col'], pz['ship']['row'], '해적선', -240)
    label(pz['landing']['col'] + 2.5, pz['landing']['row'] - 2.5, '해적 상륙 지점', -30)
    label(22.5, 40.5, '돌밭', -80)
    label(46, 31, '철광 지대', -95)
    full.resize((2000, int(full.height * 2000 / full.width)), Image.LANCZOS).convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_map.png'))

    # ---------- 2) 낮: 단검으로 첫 나무를 베는 중
    target = trees[0]
    world = render([dict(key='char_player', col=target[0], row=target[1] + 1, frame='dagger2')], stumps=set())
    day, _ = view(world, st[0] - 0.5, st[1] + 0.5)
    hud(day, '1일째 낮', False, 0.08, 5, [('wood', 0), ('stone', 0)], ['dagger', 'tshirt'], todo(0), hint='나무를 누르면 다가가서 벱니다')
    day.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_day.png'))

    # ---------- 3) 낮: 만들기 창을 열고 울타리를 짓는 중
    built = ring[:13]
    nxt = ring[13]
    things = [tent, dict(key='build_campfire', col=fire[0], row=fire[1], frame='burn1'),
              dict(key='char_player', col=c0 + 5, row=r0 + 2, frame='idle')]
    world = render(things, built, stumps=set(trees[:7]), rubble=set(rocks[:2]),
                   floor=[('overlay_ok', nxt[0], nxt[1]), ('overlay_no', trees[8][0], trees[8][1])])
    bview, _ = view(world, c0 + 5.5, r0 + 6.5)
    hud(bview, '1일째 낮', False, 0.66, 5, [('wood', 6), ('stone', 1)], ['dagger', 'tshirt', 'axe', 'pickaxe'], todo(4),
        hint='울타리: 지을 칸을 누르세요', craft_on=True)
    craft_panel(bview, [('icon_axe', '나무 도끼', '보유', 'owned'), ('icon_pickaxe', '나무 곡괭이', '보유', 'owned'),
                        ('icon_fence', '울타리', {'wood': 1}, 'ok'), ('icon_campfire', '모닥불', {'wood': 3, 'stone': 3}, 'lack'),
                        ('icon_tent', '텐트', '보유', 'owned'), ('icon_remove', '치우기', '절반 돌려받음', 'ok')], selected='울타리')
    bview.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_build.png'))

    # ---------- 4) 밤: 좀비는 숲에서, 해적은 바다에서
    px_, py_ = c0 + 5.2, r0 + 7.3                                       # 주인공: 울타리 밖에서 싸우는 중
    things = [tent, dict(key='build_campfire', col=fire[0], row=fire[1], frame='burn2'),
              dict(key='char_player', col=px_, row=py_, frame='dagger2', flip=True),
              dict(key='char_zombie', col=px_ - 0.2, row=py_ + 1.2, frame='attack'),
              dict(key='char_zombie', col=c0 + 7.1, row=r0 + 3.3, frame='attack', flip=True),
              dict(key='char_zombie', col=c0 + 2.0, row=r0 - 2.6, frame='walk2'),
              dict(key='char_zombie', col=c0 + 9.6, row=r0 - 1.0, frame='walk1', flip=True),
              dict(key='obj_ship', col=pz['ship']['col'], row=pz['ship']['row']),
              dict(key='obj_rowboat', col=pz['boat']['col'], row=pz['boat']['row']),
              dict(key='char_pirate_1', col=pz['landing']['col'] + 0.2, row=pz['landing']['row'] - 3.2, frame='walk1'),
              dict(key='char_pirate_2', col=pz['landing']['col'] + 2.2, row=pz['landing']['row'] - 1.6, frame='walk2')]
    world = render(things, ring, stumps=set(trees[:11]), rubble=set(rocks[:2]))
    nview, origin = view(world, c0 + 1.5, r0 + 7.5)
    fx, fy = LY.t2w(*fire)
    wx, wy = LY.t2w(px_, py_)
    sx, sy = LY.t2w(pz['ship']['col'], pz['ship']['row'])
    lamp = A['obj_ship']['lamp']
    lights = [dict(x=fx, y=fy + A['build_campfire']['flame'][1], r=300, glow=110),
              dict(x=wx, y=wy - 24, r=150, alpha=0.6, color=(0.92, 0.94, 1.0)),
              dict(x=sx + lamp[0], y=sy + lamp[1], r=130, alpha=0.9, glow=36)]
    nview = night(nview, origin, lights)
    hud(nview, '1일째 밤', True, 0.45, 4, [('wood', 3), ('stone', 1)], ['dagger', 'tshirt', 'axe', 'pickaxe'], todo(5), hint='해적이 상륙했습니다')
    nview.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_night.png'))
    # ================================================================== 2단계: 철과 방어 시설
    TODO2 = ['철광석 5개 모으기', '총 만들기', '망루 세우기', '총 타워 세우기', '철조망 6개 깔기', '밤을 넘기기']
    todo2 = lambda flags: [(f, t) for f, t in zip(flags, TODO2)]
    WT, GT = (c0 + 6, r0), (c0, r0 + 6)                   # 망루 = 캠프 오른쪽 모서리, 총 타워 = 왼쪽 모서리
    ring2 = [t for t in ring if t not in (WT, GT)]
    free = lambda t: t not in objs and MAP['terrain'][t[1]][t[0]] != 0
    wire_back = [t for t in [(c, r0 - 2) for c in range(c0 - 1, c0 + 8)] + [(c0 - 2, r) for r in range(r0 - 1, r0 + 8)] if free(t)]
    wire_front = [t for t in [(c, r0 + 8) for c in range(c0 - 1, c0 + 8)] + [(c0 + 8, r) for r in range(r0 - 1, r0 + 8)] if free(t)]
    tools2 = ['dagger', 'tshirt', 'axe', 'pickaxe', 'gun']
    cut2, rub2 = set(trees[:11]), set(rocks[:2])
    camp_things = [tent, dict(key='build_campfire', col=fire[0], row=fire[1], frame='burn1')]
    chest = lambda col, row: (LY.t2w(col, row)[0], LY.t2w(col, row)[1] - 40)

    def view_w(world, wx, wy, w=LY.VIEW_W, h=LY.VIEW_H):
        x0 = int(min(max(wx - G['x'] - w / 2, 0), G['width'] - w))
        y0 = int(min(max(wy - G['y'] - h / 2, 0), G['height'] - h))
        return world.crop((x0, y0, x0 + w, y0 + h)), (x0 + G['x'], y0 + G['y'])

    # ---------- 5) 낮: 철광 지대에서 곡괭이로 철광석 캐기
    node, done_node = (45, 30), (43, 31)
    hx, hy = LY.t2w(*node)
    world = render(camp_things + [dict(key='char_player', col=node[0] - 1, row=node[1], frame='pick2')], ring,
                   stumps=cut2, rubble=rub2 | {done_node}, on_top=[dict(key='fx_hit', x=hx, y=hy - 22, scale=0.7)])
    iview, origin = view_w(world, *LY.t2w(44, 32))
    d = ImageDraw.Draw(iview, 'RGBA')
    fx_, fy_ = LY.t2w(*done_node)
    fx_, fy_ = fx_ - origin[0], fy_ - origin[1] - 78
    icon(iview, 'icon_iron', fx_ - 46, fy_ - 24, 48)
    d.text((fx_ + 6, fy_), '+2', font=font(34), fill=(255, 252, 240), anchor='lm', stroke_width=5, stroke_fill=INK)
    hud(iview, '2일째 낮', False, 0.15, 5, [('wood', 14), ('stone', 9), ('iron', 2)], ['dagger', 'tshirt', 'axe', 'pickaxe'],
        todo2([False] * 6), hint='철광석은 곡괭이로 캡니다')
    iview.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_iron.png'))

    # ---------- 6) 낮: 만들기 창에서 총 타워를 고르고 지을 칸을 고르는 중(사거리 표시)
    R_GUN = 6.5
    rw, rh = int(2 * R_GUN * 56.57), int(2 * R_GUN * 28.28)
    wt_parts, _, _, _ = tower_parts('bow', *WT, target=(c0 + 3, r0 - 6))
    world = render(camp_things + wt_parts + [dict(key='char_player', col=c0 + 2, row=r0 + 5, frame='idle', flip=True)],
                   ring2, stumps=cut2, rubble=rub2, wires=wire_back[:3],
                   floor=[('overlay_range', GT[0], GT[1], (rw, rh)), ('overlay_ok', GT[0], GT[1])])
    cx_, cy_ = LY.t2w(c0 + 3, r0 + 3)
    dview, _ = view_w(world, cx_ + 260, cy_ + 40)
    hud(dview, '2일째 낮', False, 0.7, 5, [('wood', 11), ('stone', 8), ('iron', 6)], tools2,
        todo2([True, True, True, False, False, False]), hint='총 타워: 지을 칸을 누르세요', craft_on=True)
    craft_panel(dview, [('icon_axe', '나무 도끼', '보유', 'owned'), ('icon_pickaxe', '나무 곡괭이', '보유', 'owned'),
                        ('icon_gun', '총', '보유', 'owned'), ('icon_fence', '울타리', {'wood': 1}, 'ok'),
                        ('icon_wire', '철조망', {'iron': 1}, 'ok'), ('icon_campfire', '모닥불', {'wood': 3, 'stone': 3}, 'ok'),
                        ('icon_tent', '텐트', '보유', 'owned'), ('icon_watchtower', '망루', {'wood': 8, 'stone': 2}, 'ok'),
                        ('icon_guntower', '총 타워', {'stone': 6, 'iron': 4}, 'ok'), ('icon_remove', '치우기', '절반 돌려받음', 'ok')],
                selected='총 타워', cols=5, cw=150, ch=170)
    dview.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_defense_day.png'))

    # ---------- 7) 밤: 망루는 화살, 총 타워와 주인공은 총, 총잡이 해적은 멀리서 총
    P_, GN = (c0 + 4.6, r0 + 5.3), (36.2, 47.0)                 # 주인공, 총잡이 해적
    C1, C2 = (41.5, 45.8), (32.6, 45.0)                          # 선장, 선원
    Z1 = (36, 34)                                                 # 철조망에 걸린 좀비(망루가 쏘는 중)
    wt_parts, wt_tip, _, _ = tower_parts('bow', *WT, target=Z1, shot=True)
    gt_parts, gt_tip, gt_ang, _ = tower_parts('gun', *GT, target=C2)
    pm = A['char_player']['muzzle']['gun2']
    gm = A['char_pirate_3']['muzzle']['shoot']
    px_, py_ = LY.t2w(*P_)
    gx_, gy_ = LY.t2w(*GN)
    p_mz = (px_ - pm[0], py_ + pm[1])                              # 주인공은 왼쪽을 본다(뒤집힘)
    g_mz = (gx_ + gm[0], gy_ + gm[1])
    things = camp_things[:1] + [dict(key='build_campfire', col=fire[0], row=fire[1], frame='burn2')] + wt_parts + gt_parts + [
        dict(key='char_player', col=P_[0], row=P_[1], frame='gun2', flip=True),
        dict(key='char_pirate_3', col=GN[0], row=GN[1], frame='shoot'),
        dict(key='char_pirate_1', col=C1[0], row=C1[1], frame='walk2'),
        dict(key='char_pirate_2', col=C2[0], row=C2[1], frame='walk1', flip=True),
        dict(key='char_zombie', col=Z1[0], row=Z1[1], frame='attack'),
        dict(key='char_zombie', col=33, row=34, frame='walk1'),
        dict(key='char_zombie', col=c0 - 2, row=r0 + 2.4, frame='walk2'),
        dict(key='char_zombie', col=35.2, row=31.3, frame='walk1'),
        dict(key='obj_ship', col=pz['ship']['col'], row=pz['ship']['row']),
        dict(key='obj_rowboat', col=pz['boat']['col'], row=pz['boat']['row'])]
    on_top = []
    zc = chest(*Z1)
    ax, ay, aang = arc_point(wt_tip, zc, 0.55, min(60, 0.25 * math.dist(wt_tip, zc)))
    on_top.append(dict(key='proj_arrow', x=ax, y=ay, ang=aang))
    c2 = chest(*C2)
    on_top += [dict(key='fx_smoke', x=gt_tip[0] + 6, y=gt_tip[1] - 8, scale=0.9),
               dict(key='fx_muzzle', x=gt_tip[0], y=gt_tip[1], ang=gt_ang),
               dict(key='proj_bullet', x=gt_tip[0] + (c2[0] - gt_tip[0]) * 0.78, y=gt_tip[1] + (c2[1] - gt_tip[1]) * 0.78,
                    ang=math.degrees(math.atan2(c2[1] - gt_tip[1], c2[0] - gt_tip[0]))),
               dict(key='fx_hit', x=c2[0], y=c2[1], scale=0.6)]
    pc, gc_ = chest(*P_), chest(*GN)
    on_top += [dict(key='fx_smoke', x=g_mz[0] + 8, y=g_mz[1] - 6, scale=0.8), dict(key='fx_muzzle', x=g_mz[0], y=g_mz[1], ang=-10),
               dict(key='proj_bullet', x=g_mz[0] + (pc[0] - g_mz[0]) * 0.45, y=g_mz[1] + (pc[1] - g_mz[1]) * 0.45,
                    ang=math.degrees(math.atan2(pc[1] - g_mz[1], pc[0] - g_mz[0]))),
               dict(key='fx_muzzle', x=p_mz[0], y=p_mz[1], ang=190),
               dict(key='proj_bullet', x=p_mz[0] + (gc_[0] - p_mz[0]) * 0.3, y=p_mz[1] + (gc_[1] - p_mz[1]) * 0.3,
                    ang=math.degrees(math.atan2(gc_[1] - p_mz[1], gc_[0] - p_mz[0])))]
    world = render(things, ring2, stumps=cut2, rubble=rub2, wires=wire_back + wire_front, on_top=on_top)
    nview2, origin = view_w(world, LY.t2w(c0 + 3, r0 + 3)[0] - 170, LY.t2w(c0 + 3, r0 + 3)[1] + 40)
    fx_, fy_ = LY.t2w(*fire)
    wtx, wty = LY.t2w(*WT)
    gtx, gty = LY.t2w(*GT)
    sx, sy = LY.t2w(pz['ship']['col'], pz['ship']['row'])
    lamp = A['obj_ship']['lamp']
    warm = (1.0, 0.93, 0.78)
    lights = [dict(x=fx_, y=fy_ + A['build_campfire']['flame'][1], r=300, glow=110),
              dict(x=px_, y=py_ - 24, r=150, alpha=0.6, color=(0.92, 0.94, 1.0)),
              dict(x=wtx + A['build_watchtower']['lamp'][0], y=wty + A['build_watchtower']['lamp'][1], r=120, alpha=0.85, glow=30),
              dict(x=gtx + A['build_guntower']['lamp'][0], y=gty + A['build_guntower']['lamp'][1], r=120, alpha=0.85, glow=30),
              dict(x=sx + lamp[0], y=sy + lamp[1], r=130, alpha=0.9, glow=36)]
    for mx_, my_ in (gt_tip, g_mz, p_mz):                         # 총을 쏜 순간의 짧은 불빛
        lights.append(dict(x=mx_, y=my_, r=110, alpha=0.9, color=warm, glow=40))
    nview2 = night(nview2, origin, lights)
    hud(nview2, '2일째 밤', True, 0.5, 4, [('wood', 6), ('stone', 2), ('iron', 1)], tools2,
        todo2([True] * 5 + [False]), hint='총잡이 해적이 나타났습니다')
    nview2.convert('RGB').save(os.path.join(ROOT, 'preview', 'preview_defense_night.png'))
    print('camp', (c0, r0), 'first tree', target, 'wire', len(wire_back), len(wire_front), 'ok')


if __name__ == '__main__':
    main()
