#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사물, 캐릭터, 아이콘 그림을 만든다.   실행: python tools/make_assets.py
결과: assets/ 아래 PNG 와 assets/manifest.json  (바닥 그림은 make_ground.py)

필요한 것: pip install cairosvg pillow numpy scipy
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw

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


def sheet(sub, key, frames, names, kind, cols=None, **meta):
    """같은 크기의 프레임을 가로로 이어 붙인 시트(cols를 주면 그 수마다 다음 줄로). 발이 프레임 가로 한가운데에 온다."""
    boxes = [A.bbox(p, 12) for p in frames]
    m = max(max(abs(b[0]), abs(b[2])) for b in boxes)
    box = (-m, min(b[1] for b in boxes), m, max(b[3] for b in boxes))
    imgs = []
    for p in frames:
        img, anchor = wc.sprite(p, key, box=box, keep_box=True)      # 같은 이름 = 같은 흔들림 무늬
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


def make_chars():
    sheet('chars', 'char_player', [A.survivor(p) for p in A.POSES], list(A.POSES), 'char',
          muzzle={p: px(A.survivor_muzzle(p)) for p in ('gun1', 'gun2')})
    sheet('chars', 'char_zombie', [A.zombie(p) for p in A.ZPOSES], list(A.ZPOSES), 'char')
    for v in (1, 2):
        sheet('chars', f'char_pirate_{v}', [A.pirate(v, p) for p in A.PPOSES], list(A.PPOSES), 'char')
    sheet('chars', 'char_pirate_3', [A.gunner(p) for p in A.GPOSES], list(A.GPOSES), 'char',
          muzzle={p: px(A.gunner_muzzle(p)) for p in ('aim', 'shoot')})


def make_ui():
    box = (-64, -64, 64, 64)
    for name in ('wood', 'stone', 'heart', 'heart_empty', 'dagger', 'axe', 'pickaxe', 'tshirt', 'fence', 'tent',
                 'campfire', 'sun', 'moon', 'craft', 'remove', 'sleep', 'iron', 'gun', 'wire', 'watchtower', 'guntower'):
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
    return A.icon(name)


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
    ground = json.load(open(os.path.join(ASSETS, 'ground', 'ground.json'), encoding='utf-8'))
    meta = dict(tileWidth=LY.HW * 2, tileHeight=LY.HH * 2, viewWidth=LY.VIEW_W, viewHeight=LY.VIEW_H, ground=ground, turretDirections=A.TURRET_DIRS,
                note='originX/originY = 그림에서 발이 닿는 점. 이 점을 칸 중심의 월드 좌표에 맞춘다.')
    with open(os.path.join(ASSETS, 'manifest.json'), 'w', encoding='utf-8') as fp:
        json.dump(dict(meta=meta, assets=MAN), fp, ensure_ascii=False, indent=1)
    print(len(MAN), 'assets')


if __name__ == '__main__':
    main()
