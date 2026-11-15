#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
섬 생존 데모 - 그림(에셋) 생성기

실행:  python tools/make_assets.py
결과:  assets/ 아래 PNG 파일들 + assets/manifest.json

필요한 것: Python 3, cairosvg, pillow, numpy
    pip install cairosvg pillow numpy

그림 규칙
- 쿼터뷰(아이소메트릭). 한 칸 = 가로 128, 세로 64 픽셀 마름모.
- 빛은 왼쪽 위에서 온다. 왼쪽 면이 밝고 오른쪽 면이 어둡다.
- 외곽선은 짙은 갈색(OUT), 두께 3.
- 사물/캐릭터는 "발 기준점"을 칸 중심에 맞춰 놓는다. 기준점은 manifest.json 의 originX/originY.
"""
import io
import json
import math
import os
import random

import cairosvg
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

TW, TH = 128, 64          # 한 칸 크기
HW, HH = TW // 2, TH // 2
TILE_PAD = 2              # 타일 이미지는 사방 2px 더 크게(이음매 방지)
SW = 3                    # 기본 외곽선 두께

OUT = "#3b2a20"
C = dict(
    sand="#f2dc9c", sand_l="#faebbc", sand_d="#dfc57f",
    grass="#8fd15a", grass_l="#a6e070", grass_d="#72b944",
    forest="#5fa646", forest_l="#72b857", forest_d="#4c8e39",
    dirt="#cfa772", dirt_l="#dcb986", dirt_d="#b98f5c",
    water="#57bdea", water_l="#a9e3fa", water_d="#43a9dc",
    cliff_l="#d6b170", cliff_d="#b78f58", cliff_dd="#9c7645",
    stone="#aab2bb", stone_l="#cdd3d9", stone_d="#858e99",
    wood="#b47a45", wood_l="#e6c088", wood_d="#8c5a2e",
    leaf="#46a84f", leaf_l="#6fc864", leaf_d="#2f8742",
    pine="#2f8a55", pine_l="#4aa86a", pine_d="#226e45",
    palm="#57b84a", palm_d="#3a9440", palm_l="#7fd060",
    trunk="#c69a62", trunk_d="#a37a45",
    red="#e9574f", red_l="#f47c6c", red_d="#c2403f",
    blue="#4f8fe8", blue_l="#7fb0f2", blue_d="#3a6fc4",
    yellow="#ffd34d", yellow_d="#e6ac1f",
    white="#ffffff", cream="#fff3df",
    skin="#ffd9b5", skin_d="#f2bf96", hair="#6b4423",
    shirt="#ff9a3c", shirt_d="#e27d22", pants="#3f6fc9", shoe="#6b4423",
    zskin="#a9db9b", zskin_d="#86bf7c", zshirt="#9b7bd1", zshirt_d="#7d5fb5",
    zpants="#5d6470", zhair="#4c6b4a",
    dog="#e2aa6a", dog_d="#b9844a", dog_ear="#9c6234", dog_l="#fff1dc",
    boar="#9a6b47", boar_l="#b3835c", boar_d="#5c3b24", boar_snout="#dba68f",
    fire_o="#ff8a2b", fire_y="#ffd84a", fire_r="#f2552c",
    dark="#2b1d14",
)

MANIFEST = {}
_uid = [0]


def uid():
    _uid[0] += 1
    return f"c{_uid[0]}"


# ---------------------------------------------------------------- SVG 도우미
def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def pts(points):
    return " ".join(f"{f(x)},{f(y)}" for x, y in points)


def _st(fill, stroke, sw, op):
    s = f'fill="{fill}" '
    if stroke:
        s += f'stroke="{stroke}" stroke-width="{f(sw)}" stroke-linejoin="round" stroke-linecap="round" '
    if op is not None:
        s += f'opacity="{f(op)}" '
    return s


def poly(points, fill, stroke=OUT, sw=SW, op=None):
    return f'<polygon points="{pts(points)}" {_st(fill, stroke, sw, op)}/>'


def ell(cx, cy, rx, ry, fill, stroke=OUT, sw=SW, op=None, rot=None):
    t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ""
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" {_st(fill, stroke, sw, op)}{t}/>'


def circ(cx, cy, r, fill, stroke=OUT, sw=SW, op=None):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {_st(fill, stroke, sw, op)}/>'


def rrect(x, y, w, h, r, fill, stroke=OUT, sw=SW, rot=None, op=None):
    t = ""
    if rot:
        a, cx, cy = rot
        t = f' transform="rotate({f(a)} {f(cx)} {f(cy)})"'
    return (f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" '
            f'{_st(fill, stroke, sw, op)}{t}/>')


def path(d, fill="none", stroke=OUT, sw=SW, op=None, dash=None):
    extra = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="{d}" {_st(fill, stroke, sw, op)}{extra}/>'


def line(x1, y1, x2, y2, stroke=OUT, sw=SW, op=None):
    return path(f"M {f(x1)},{f(y1)} L {f(x2)},{f(y2)}", "none", stroke, sw, op)


def g(body, tx=0, ty=0, rot=None, scale=None, op=None, flip=False):
    t = f"translate({f(tx)} {f(ty)})"
    if rot:
        if isinstance(rot, (tuple, list)):
            t += f" rotate({f(rot[0])} {f(rot[1])} {f(rot[2])})"
        else:
            t += f" rotate({f(rot)})"
    if flip:
        t += " scale(-1 1)"
    if scale:
        t += f" scale({f(scale)})"
    o = f' opacity="{f(op)}"' if op is not None else ""
    return f'<g transform="{t}"{o}>{body}</g>'


def shadow(cx, cy, rx, ry, op=0.2):
    return ell(cx, cy, rx, ry, "#1c2a3a", stroke=None, op=op)


def clipped(clip_svg, body):
    cid = uid()
    return f'<clipPath id="{cid}">{clip_svg}</clipPath><g clip-path="url(#{cid})">{body}</g>'


def _shape(s, fill, stroke=None, sw=SW):
    if len(s) == 3:
        return circ(s[0], s[1], s[2], fill, stroke, sw)
    return ell(s[0], s[1], s[2], s[3], fill, stroke, sw)


def blob(shapes, fill, dark=(), light=(), dark_c=None, light_c=None, sw=SW, outline=True):
    """원/타원 여러 개를 합친 덩어리. 합집합 바깥에만 외곽선이 생긴다."""
    s = ""
    if outline:
        for sh in shapes:
            s += _shape(sh, OUT, OUT, 2 * sw)
    clip = "".join(_shape(sh, "#000") for sh in shapes)
    inner = '<rect x="-600" y="-600" width="1200" height="1200" fill="%s"/>' % fill
    for sh in dark:
        inner += _shape(sh, dark_c)
    for sh in light:
        inner += _shape(sh, light_c)
    return s + clipped(clip, inner)


def iso(x, y, z=0.0):
    """칸 단위 좌표(x,y), 높이 z(px) -> 화면 좌표. 원점은 칸 중심."""
    return ((x - y) * HW, (x + y) * HH - z)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def render(body, w, h):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
           f'viewBox="0 0 {w} {h}">{body}</svg>')
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def save(img, sub, key, origin, kind, **meta):
    d = os.path.join(ASSETS, sub)
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, key + ".png"))
    w, h = img.size
    entry = dict(file=f"{sub}/{key}.png", w=w, h=h,
                 originX=round(origin[0], 4), originY=round(origin[1], 4), kind=kind)
    entry.update(meta)
    MANIFEST[key] = entry


# ---------------------------------------------------------------- 타일
TILE_W, TILE_H = TW + TILE_PAD * 2, TH + TILE_PAD * 2
TCX, TCY = TILE_W / 2, TILE_H / 2


def diamond_mask(w, h, cx, cy, extend):
    """가장자리가 딱 떨어지는(반투명 없는) 마름모. extend(px)만큼 바깥으로 넓힘."""
    ys, xs = np.mgrid[0:h, 0:w]
    dx = np.abs(xs + 0.5 - cx) / HW
    dy = np.abs(ys + 0.5 - cy) / HH
    k = 1.0 + extend * math.hypot(1 / HW, 1 / HH)
    return (dx + dy) <= k


def rand_in_diamond(rng, k=0.8):
    while True:
        x = rng.uniform(-HW, HW)
        y = rng.uniform(-HH, HH)
        if abs(x) / HW + abs(y) / HH < k:
            return x, y


def tile(key, base, detail):
    body = f'<rect width="{TILE_W}" height="{TILE_H}" fill="{base}"/>'
    body += g(detail, TCX, TCY)
    img = render(body, TILE_W, TILE_H)
    a = np.array(img)
    mask = diamond_mask(TILE_W, TILE_H, TCX, TCY, TILE_PAD)
    a[..., 3] = np.where(mask, 255, 0)
    a[~mask, :3] = a[mask, :3].mean(axis=0).astype(np.uint8)  # 투명 부분 색 번짐 방지
    save(Image.fromarray(a), "tiles", key, (0.5, 0.5), "tile")


def tuft(x, y, col, s=1.0):
    return path(f"M {f(x-3*s)},{f(y)} L {f(x-4.5*s)},{f(y-5*s)} M {f(x)},{f(y)} L {f(x)},{f(y-7*s)} "
                f"M {f(x+3*s)},{f(y)} L {f(x+4.5*s)},{f(y-5*s)}", "none", col, 1.8)


def flower(x, y, petal, center="#ffd34d"):
    s = ""
    for a in range(0, 360, 72):
        s += circ(x + 2.6 * math.cos(math.radians(a)), y + 2.0 * math.sin(math.radians(a)), 1.9, petal, None)
    return s + circ(x, y, 1.4, center, None)


def make_tiles():
    # 풀
    for i in (1, 2, 3):
        rng = random.Random(100 + i)
        d = ""
        for _ in range(4):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(9, 18), rng.uniform(3.5, 6.5), C["grass_l"], None, op=0.75)
        for _ in range(2):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(8, 14), rng.uniform(3, 5), C["grass_d"], None, op=0.45)
        for _ in range(6):
            x, y = rand_in_diamond(rng, 0.78)
            d += tuft(x, y, C["grass_d"], rng.uniform(0.8, 1.1))
        if i == 3:
            for col in ("#ffffff", "#ffe36b", "#ffb3d1", "#ffffff"):
                x, y = rand_in_diamond(rng, 0.7)
                d += flower(x, y, col, "#ff9a3c" if col != "#ffe36b" else "#ffffff")
        tile(f"tile_grass_{i}", C["grass"], d)

    # 숲 바닥
    for i in (1, 2):
        rng = random.Random(200 + i)
        d = ""
        for _ in range(4):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(9, 18), rng.uniform(3.5, 6.5), C["forest_d"], None, op=0.6)
        for _ in range(3):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(8, 14), rng.uniform(3, 5), C["forest_l"], None, op=0.6)
        for _ in range(5):
            x, y = rand_in_diamond(rng, 0.78)
            d += tuft(x, y, C["forest_d"], rng.uniform(0.8, 1.1))
        for _ in range(5):
            x, y = rand_in_diamond(rng, 0.78)
            d += ell(x, y, 2.4, 1.4, "#d2c75c", None, rot=rng.uniform(-40, 40), op=0.9)
        if i == 2:
            x, y = rand_in_diamond(rng, 0.45)
            d += rrect(x - 1.5, y - 5, 3, 6, 1, C["cream"], None)
            d += path(f"M {f(x-6)},{f(y-5)} Q {f(x)},{f(y-13)} {f(x+6)},{f(y-5)} Z", C["red"], OUT, 1.2)
        tile(f"tile_forest_{i}", C["forest"], d)

    # 모래
    for i in (1, 2):
        rng = random.Random(300 + i)
        d = ""
        for _ in range(3):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(10, 20), rng.uniform(4, 7), C["sand_l"], None, op=0.8)
        for _ in range(2):
            x, y = rand_in_diamond(rng, 0.7)
            d += path(f"M {f(x-9)},{f(y)} q 4.5,-3 9,0 q 4.5,3 9,0", "none", C["sand_d"], 1.6, op=0.8)
        for _ in range(14):
            x, y = rand_in_diamond(rng, 0.85)
            d += circ(x, y, rng.uniform(0.9, 1.6), C["sand_d"], None)
        if i == 2:
            x, y = rand_in_diamond(rng, 0.5)
            d += ell(x, y, 4.2, 3, "#ffc7c2", OUT, 1.1)
            d += path(f"M {f(x-2)},{f(y+1.5)} L {f(x)},{f(y-2.5)} L {f(x+2)},{f(y+1.5)}", "none", "#e28f8a", 0.9)
            x, y = rand_in_diamond(rng, 0.6)
            d += ell(x, y, 3.2, 2.2, C["stone"], OUT, 1.1)
        tile(f"tile_sand_{i}", C["sand"], d)

    # 흙(집 주변)
    rng = random.Random(400)
    d = ""
    for _ in range(4):
        x, y = rand_in_diamond(rng, 0.7)
        d += ell(x, y, rng.uniform(9, 18), rng.uniform(3.5, 6.5), C["dirt_l"], None, op=0.8)
    for _ in range(3):
        x, y = rand_in_diamond(rng, 0.7)
        d += ell(x, y, rng.uniform(7, 13), rng.uniform(3, 5), C["dirt_d"], None, op=0.5)
    for _ in range(8):
        x, y = rand_in_diamond(rng, 0.85)
        d += ell(x, y, rng.uniform(1.4, 2.4), rng.uniform(1, 1.6), C["dirt_d"], None)
    tile("tile_dirt_1", C["dirt"], d)

    # 물(2장 = 잔물결 애니메이션)
    for i in (1, 2):
        rng = random.Random(500)           # 두 장이 같은 자리에서 조금씩만 움직이게
        d = ""
        for _ in range(3):
            x, y = rand_in_diamond(rng, 0.7)
            d += ell(x, y, rng.uniform(12, 22), rng.uniform(4, 7), C["water_d"], None, op=0.35)
        for _ in range(4):
            x, y = rand_in_diamond(rng, 0.62)
            x += 7 if i == 2 else 0
            y += 1.5 if i == 2 else 0
            d += path(f"M {f(x-10)},{f(y)} q 5,-3.5 10,0 q 5,3.5 10,0", "none", C["water_l"], 2.2, op=0.9)
        tile(f"tile_water_{i}", C["water"], d)


def make_edges():
    """땅이 물과 만나는 아래쪽 두 변에 붙이는 낭떠러지 띠. 타일과 같은 기준점."""
    H = 18
    w, h = TILE_W, TILE_H + H
    origin = (TCX / w, TCY / h)
    for key, sign, col, col_d in (("edge_sw", -1, C["cliff_l"], C["cliff_d"]),
                                  ("edge_se", 1, C["cliff_d"], C["cliff_dd"])):
        a = (sign * (HW + 2), -1.0)     # 옆 꼭짓점(조금 더 바깥)
        b = (0, HH + 0.0)               # 아래 꼭짓점
        top = [(a[0], a[1] - 4), (b[0], b[1] - 4)]
        d = poly([top[0], top[1], (b[0], b[1] + H), (a[0], a[1] + H)], col, None)
        # 아래쪽 어두운 띠
        d += poly([(a[0], a[1] + H - 7), (b[0], b[1] + H - 7), (b[0], b[1] + H), (a[0], a[1] + H)], col_d, None)
        # 물결 거품
        d += path(f"M {f(a[0])},{f(a[1]+H)} L {f(b[0])},{f(b[1]+H)}", "none", "#eefaff", 3.2, op=0.95)
        # 줄무늬 조금
        for t in (0.25, 0.6):
            p = lerp(a, b, t)
            d += line(p[0], p[1] + 5, p[0] + sign * -9, p[1] + 5 + 4.5, col_d, 1.6, op=0.8)
        img = render(g(d, TCX, TCY), w, h)
        save(img, "tiles", key, origin, "edge")


def make_fog():
    w, h = 192, 136
    cx, cy = w / 2, h / 2 + 6
    shapes = [(0, 2, 68, 35), (-38, -10, 24), (-8, -24, 28), (26, -20, 25), (48, -4, 20),
              (-52, 4, 18), (12, 10, 30), (-20, 12, 26)]
    gid = uid()
    body = (f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eef3f9"/>'
            f'<stop offset="1" stop-color="#c9d6e6"/></linearGradient>')
    clip = "".join(_shape(s, "#000") for s in shapes)
    inner = f'<rect x="-100" y="-70" width="200" height="140" fill="url(#{gid})"/>'
    inner += ell(-14, -22, 18, 9, "#ffffff", None, op=0.9)
    inner += ell(28, -18, 12, 6, "#ffffff", None, op=0.8)
    body += g(clipped(clip, inner), cx, cy)
    save(render(body, w, h), "tiles", "tile_fog", (cx / w, cy / h), "fog")


def make_overlays():
    def dia(k=1.0):
        return [(0, -HH * k), (HW * k, 0), (0, HH * k), (-HW * k, 0)]
    for key, fill, stroke in (("overlay_ok", "#5fe36a", "#1f9a35"), ("overlay_no", "#ff5a5a", "#c22a2a")):
        d = poly(dia(0.94), fill, stroke, 3, op=0.55)
        save(render(g(d, TCX, TCY), TILE_W, TILE_H), "ui", key, (0.5, 0.5), "overlay")
    d = poly(dia(0.92), "none", "#3b2a20", 7, op=0.35) + poly(dia(0.92), "none", "#ffffff", 4)
    save(render(g(d, TCX, TCY), TILE_W, TILE_H), "ui", "overlay_cursor", (0.5, 0.5), "overlay")
    d = poly(dia(0.96), "#ffe680", None, op=0.22)
    save(render(g(d, TCX, TCY), TILE_W, TILE_H), "ui", "overlay_claimed", (0.5, 0.5), "overlay")


# ---------------------------------------------------------------- 사물
def obj(sub, key, w, h, body, foot=None, kind="object", **meta):
    foot = foot or (w / 2, h - HH)
    img = render(g(body, foot[0], foot[1]), w, h)
    save(img, sub, key, (foot[0] / w, foot[1] / h), kind, **meta)


def draw_tree():
    b = shadow(8, 5, 46, 19)
    b += path("M -12,3 C -9,-20 -8,-44 -8,-72 L 9,-72 C 9,-44 10,-20 13,3 C 6,8 -6,8 -12,3 Z", C["wood_d"])
    b += path("M -4,-4 C -3,-26 -3,-46 -3,-66", "none", C["wood"], 4.5)
    shapes = [(0, -114, 44), (-36, -94, 28), (36, -92, 28), (-20, -134, 28), (24, -132, 28), (0, -86, 30)]
    b += blob(shapes, C["leaf"],
              dark=[(28, -84, 24), (44, -98, 16), (4, -72, 20)], dark_c=C["leaf_d"],
              light=[(-18, -132, 22), (-36, -100, 14), (12, -140, 13)], light_c=C["leaf_l"])
    return b


def draw_pine():
    b = shadow(8, 5, 40, 17)
    b += rrect(-7, -36, 14, 40, 4, C["wood_d"])
    tiers = [(-30, 54, 62), (-66, 45, 56), (-100, 35, 54)]
    for yb, hw, hh in tiers:
        tri = [(0, yb - hh), (hw, yb), (-hw, yb)]
        b += poly(tri, C["pine"], None)
        b += poly([(0, yb - hh), (2, yb), (-hw, yb)], C["pine_l"], None)
        b += poly([(0, yb - hh), (hw, yb), (hw * 0.45, yb)], C["pine_d"], None)
        b += poly(tri, "none")
    return b


def draw_palm():
    b = shadow(12, 5, 40, 16)
    d = "M -4,2 C -12,-48 -2,-98 22,-140"
    b += path(d, "none", OUT, 22)
    b += path(d, "none", C["trunk"], 16)
    # 줄무늬
    P0, P1, P2, P3 = (-4, 2), (-12, -48), (-2, -98), (22, -140)
    for t in (0.12, 0.26, 0.4, 0.54, 0.68, 0.82):
        mt = 1 - t
        x = mt**3 * P0[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t**3 * P3[0]
        y = mt**3 * P0[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t**3 * P3[1]
        b += path(f"M {f(x-8)},{f(y+2)} q 8,5 16,-2", "none", C["trunk_d"], 2.4)
    top = (22, -142)

    def frond(L, col, col2):
        d = (f"M 0,0 C {f(L*.30)},{f(-L*.52)} {f(L*.82)},{f(-L*.46)} {f(L)},{f(L*.26)} "
             f"C {f(L*.76)},{f(-L*.14)} {f(L*.36)},{f(-L*.10)} 0,0 Z")
        rib = f"M 3,-3 C {f(L*.32)},{f(-L*.34)} {f(L*.74)},{f(-L*.30)} {f(L*.95)},{f(L*.16)}"
        return path(d, col) + path(rib, "none", col2, 2.2)

    def both(L, rot, col, col2):
        return (g(frond(L, col, col2), top[0], top[1], rot=rot) +
                g(g(frond(L, col, col2), rot=rot), top[0], top[1], flip=True))

    # 뒤쪽 잎 -> 앞쪽 잎
    b += g(frond(58, C["palm_d"], C["leaf_d"]), top[0], top[1], rot=-104)
    b += both(70, -62, C["palm_d"], C["leaf_d"])
    b += both(82, -24, C["palm"], C["palm_d"])
    b += both(76, 18, C["palm_l"], C["palm"])
    # 코코넛
    b += circ(top[0] - 7, top[1] + 9, 7.5, C["wood_d"])
    b += circ(top[0] + 8, top[1] + 10, 7.5, C["wood"])
    b += circ(top[0], top[1] + 3, 6, C["palm_d"])
    return b


def draw_rock(scale=1.0):
    P = lambda L: [(x * scale, y * scale) for x, y in L]
    b = shadow(8 * scale, 4 * scale, 50 * scale, 18 * scale)
    outline = P([(-44, 4), (-48, -22), (-28, -50), (4, -60), (34, -46), (48, -18), (40, 6), (4, 14)])
    b += poly(outline, C["stone"], None)
    b += poly(P([(-28, -50), (4, -60), (34, -46), (10, -30), (-22, -32)]), C["stone_l"], None)
    b += poly(P([(34, -46), (48, -18), (40, 6), (4, 14), (10, -30)]), C["stone_d"], None)
    b += poly(outline, "none")
    b += path(f"M {f(-22*scale)},{f(-32*scale)} L {f(10*scale)},{f(-30*scale)} L {f(4*scale)},{f(14*scale)}",
              "none", OUT, 1.6, op=0.45)
    b += path(f"M {f(-30*scale)},{f(-14*scale)} l {f(8*scale)},{f(5*scale)}", "none", C["stone_d"], 2.2)
    # 작은 돌
    b += ell(-44 * scale, 10 * scale, 11 * scale, 8 * scale, C["stone_l"])
    return b


def draw_rubble():
    b = shadow(4, 3, 30, 10)
    b += ell(-14, -2, 12, 8.5, C["stone"]) + ell(12, 0, 13, 9, C["stone_d"]) + ell(0, -9, 11, 8, C["stone_l"])
    b += ell(24, 8, 6, 4.2, C["stone_l"]) + ell(-26, 8, 5, 3.6, C["stone"])
    return b


def draw_bush(berries=True):
    b = shadow(6, 4, 42, 15)
    shapes = [(0, -30, 26), (-26, -19, 21), (26, -19, 21), (0, -12, 24), (-14, -36, 18), (16, -36, 18)]
    b += blob(shapes, C["leaf"], dark=[(20, -10, 20), (34, -20, 14)], dark_c=C["leaf_d"],
              light=[(-14, -38, 14), (-28, -24, 11)], light_c=C["leaf_l"])
    if berries:
        for x, y in [(-24, -22), (-6, -42), (14, -28), (28, -16), (-6, -16), (10, -46), (-36, -12)]:
            b += circ(x, y, 5.2, C["red"], OUT, 1.8)
            b += circ(x - 1.6, y - 1.8, 1.4, "#ffd2cc", None)
    return b


def draw_stump():
    b = shadow(6, 4, 34, 13)
    b += path("M -22,-24 L -25,0 C -14,10 14,10 25,0 L 22,-24 Z", C["wood_d"])
    b += path("M -14,-18 L -15,2 M 8,-14 L 9,5", "none", C["wood"], 2.5)
    b += ell(0, -24, 22, 10.5, C["wood_l"])
    b += ell(0, -24, 13, 6, "none", C["wood"], 2)
    b += ell(0, -24, 5, 2.4, "none", C["wood"], 2)
    b += path("M -30,2 q -6,-4 -9,3 M 30,3 q 7,-3 9,4", "none", C["wood_d"], 4)
    return b


def draw_house():
    a, hwall = 0.88, 84
    r, zr = 1.08, hwall - 6
    b = poly([(p[0] + 20, p[1] + 12) for p in (iso(-1, 1), iso(1, 1), iso(1, -1), iso(-1, -1))],
             "#1c2a3a", None, op=0.18)

    def L(u, v):
        return iso(-a + 2 * a * u, a, v)

    def R(u, v):
        return iso(a, a - 2 * a * u, v)

    left = [L(0, 0), L(1, 0), L(1, hwall), L(0, hwall)]
    right = [R(0, 0), R(1, 0), R(1, hwall), R(0, hwall)]
    b += poly(left, "#efc98c", None) + poly(right, "#cf9f60", None)
    for v in (16, 32, 48, 64):
        b += line(*L(0, v), *L(1, v), "#d4a968", 2)
        b += line(*R(0, v), *R(1, v), "#b3854b", 2)
    b += poly(left, "none") + poly(right, "none")
    # 문(왼쪽 벽)
    door = [L(0.5, 0), L(0.82, 0), L(0.82, 62), L(0.5, 62)]
    b += poly(door, "#8c5a2e")
    b += line(*L(0.66, 2), *L(0.66, 60), "#6f4522", 2)
    k = L(0.76, 30)
    b += circ(k[0], k[1], 3.4, C["yellow"], OUT, 1.5)
    # 창문(오른쪽 벽)
    win = [R(0.3, 30), R(0.66, 30), R(0.66, 62), R(0.3, 62)]
    b += poly(win, "#bfe9ff")
    b += line(*R(0.48, 30), *R(0.48, 62), OUT, 2)
    b += line(*R(0.3, 46), *R(0.66, 46), OUT, 2)
    # 지붕
    apex = iso(0, 0, hwall + 104)
    Wr, Sr, Er = iso(-r, r, zr), iso(r, r, zr), iso(r, -r, zr)
    b += poly([Wr, Sr, apex], C["red_l"], None) + poly([Sr, Er, apex], C["red_d"], None)
    for t in (0.26, 0.5, 0.74):
        b += line(*lerp(Wr, apex, t), *lerp(Sr, apex, t), C["red"], 2.4)
        b += line(*lerp(Sr, apex, t), *lerp(Er, apex, t), "#a83636", 2.4)
    b += poly([Wr, Sr, apex], "none") + poly([Sr, Er, apex], "none")
    # 굴뚝
    c0 = lerp(lerp(Sr, Er, 0.5), apex, 0.55)
    b += rrect(c0[0] - 10, c0[1] - 38, 20, 38, 2, C["stone"]) + rrect(c0[0] - 13, c0[1] - 45, 26, 10, 2, C["stone_l"])
    return b


def draw_flag():
    b = shadow(8, 4, 30, 12)
    b += blob([(-13, -3, 11), (10, -2, 12), (-1, -10, 11)], C["stone"],
              light=[(-14, -8, 7), (-2, -15, 6)], light_c=C["stone_l"])
    b += rrect(-3.5, -176, 7, 170, 3, "#a8703a")
    b += path("M 3,-172 C 24,-182 42,-160 68,-168 L 62,-132 C 42,-124 24,-146 3,-134 Z", C["red"])
    b += path("M 3,-140 C 24,-152 42,-130 62,-138", "none", C["red_d"], 3, op=0.7)
    # 별
    sp = []
    for i in range(10):
        ang = math.radians(-90 + i * 36)
        rr = 11 if i % 2 == 0 else 4.8
        sp.append((33 + rr * math.cos(ang), -152 + rr * math.sin(ang)))
    b += poly(sp, C["yellow"], OUT, 1.6)
    b += circ(0, -178, 6, C["yellow"])
    return b


def draw_flag_spot():
    b = ell(0, 0, 42, 21, "#ffffff", None, op=0.28)
    b += path("M -42,0 A 42 21 0 1 1 42,0 A 42 21 0 1 1 -42,0", "none", "#ffffff", 3, dash="7 6")
    for k in range(8):
        ang = math.radians(k * 45 + 10)
        x, y = 46 * math.cos(ang), 23 * math.sin(ang)
        b += ell(x, y, 7.5, 5.2, C["stone_l"] if k % 2 else C["stone"], OUT, 1.8)
    b += ell(0, 0, 9, 4.5, C["dirt_d"], OUT, 1.8)
    return b


# ---------------------------------------------------------------- 방어 시설
def draw_fence():
    a, n = 0.37, 4
    logs = {}
    for i in range(n):
        t = i / (n - 1)
        for p, front in ((iso(-a + 2 * a * t, -a), False), (iso(-a, -a + 2 * a * t), False),
                         (iso(-a + 2 * a * t, a), True), (iso(a, -a + 2 * a * t), True)):
            key = (round(p[0], 1), round(p[1], 1))
            logs[key] = logs.get(key, False) or front
    b = poly([(p[0] + 10, p[1] + 6) for p in (iso(-.45, .45), iso(.45, .45), iso(.45, -.45), iso(-.45, -.45))],
             "#1c2a3a", None, op=0.18)
    w, h = 16, 32
    for (x, y), front in sorted(logs.items(), key=lambda kv: kv[0][1]):
        col, top = ("#c48a52", C["wood_l"]) if front else (C["wood"], "#d9b27a")
        b += path(f"M {f(x-w/2)},{f(y-h)} L {f(x-w/2)},{f(y-2)} Q {f(x)},{f(y+5)} {f(x+w/2)},{f(y-2)} "
                  f"L {f(x+w/2)},{f(y-h)} Z", col)
        b += rrect(x + 1.5, y - h + 1, w / 2 - 3.5, h - 4, 1.5, C["wood_d"], None, op=0.55)
        b += line(x - 3.5, y - h + 4, x - 3.5, y - 8, C["wood_l"], 2, op=0.6)
        b += rrect(x - w / 2 + 1.5, y - 20, w - 3, 4.5, 1, "#7a4d27", None)
        b += poly([(x - w / 2, y - h), (x, y - h - 13), (x + w / 2, y - h)], top)
    return b


def draw_stone_tower():
    rx, ry, H = 40, 20, 84
    b = shadow(10, 6, 50, 22)
    body = f"M {-rx},{-H} L {-rx},0 A {rx} {ry} 0 0 0 {rx},0 L {rx},{-H} Z"
    inner = f'<rect x="-60" y="-120" width="120" height="160" fill="{C["stone"]}"/>'
    inner += f'<rect x="12" y="-120" width="40" height="160" fill="{C["stone_d"]}"/>'
    inner += f'<rect x="-40" y="-120" width="12" height="160" fill="{C["stone_l"]}"/>'
    for i, y in enumerate((-66, -44, -22)):
        inner += path(f"M {-rx},{y} A {rx} {ry} 0 0 0 {rx},{y}", "none", OUT, 1.6, op=0.45)
    for (x, y0) in ((-22, -66), (6, -66), (-8, -44), (22, -44), (-24, -22), (2, -22), (26, -22), (-10, -84), (18, -84)):
        yy = y0 + ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2))
        inner += line(x, yy, x, yy + 22, OUT, 1.6, op=0.45)
    b += clipped(f'<path d="{body}"/>', inner)
    b += path(body, "none")
    # 창
    b += rrect(-12, -52, 9, 20, 4, C["dark"], OUT, 1.5)
    # 윗부분 테두리
    rx2, ry2, yt, hb = 47, 23.5, -98, 16
    rim = f"M {-rx2},{yt} L {-rx2},{yt+hb} A {rx2} {ry2} 0 0 0 {rx2},{yt+hb} L {rx2},{yt} Z"
    rin = f'<rect x="-60" y="-130" width="120" height="80" fill="{C["stone_l"]}"/>'
    rin += f'<rect x="14" y="-130" width="46" height="80" fill="{C["stone"]}"/>'
    for x in (-30, -10, 12, 32):
        yy = yt + ry2 * math.sqrt(max(0.0, 1 - (x / rx2) ** 2))
        rin += line(x, yy, x, yy + hb, OUT, 1.6, op=0.45)
    b += clipped(f'<path d="{rim}"/>', rin) + path(rim, "none")
    b += ell(0, yt, rx2, ry2, "#dfe4e9")
    b += ell(0, yt, 34, 17, C["stone_d"], OUT, 2)
    # 돌 더미
    b += circ(-12, yt - 6, 12, C["stone"]) + circ(12, yt - 5, 12, C["stone_d"]) + circ(0, yt - 20, 12, C["stone_l"])
    b += circ(-4, yt - 24, 3, "#ffffff", None, op=0.7)
    return b


def draw_campfire(frame=1):
    b = ell(0, 2, 58, 29, C["fire_y"], None, op=0.22 if frame == 1 else 0.3)
    for k in range(8):
        ang = math.radians(k * 45 + 22)
        x, y = 34 * math.cos(ang), 17 * math.sin(ang)
        if y < 0:
            b += ell(x, y, 8.5, 6.2, C["stone_d"], OUT, 2)
    b += rrect(-30, -9, 60, 13, 6, C["wood_d"], rot=(18, 0, -2))
    b += rrect(-30, -9, 60, 13, 6, C["wood"], rot=(-18, 0, -2))
    if frame == 1:
        b += path("M 2,-72 C 20,-52 28,-34 22,-16 C 16,2 -16,2 -22,-16 C -28,-32 -12,-42 -10,-58 C -4,-52 0,-60 2,-72 Z",
                  C["fire_o"])
        b += path("M 0,-44 C 10,-32 14,-22 10,-12 C 6,-2 -8,-2 -11,-12 C -14,-22 -4,-30 0,-44 Z", C["fire_y"], None)
    else:
        b += path("M -6,-78 C 12,-56 30,-36 22,-16 C 16,2 -16,2 -22,-16 C -30,-36 -18,-40 -16,-52 C -10,-50 -8,-62 -6,-78 Z",
                  C["fire_o"])
        b += path("M -2,-48 C 8,-34 15,-24 10,-12 C 6,-2 -8,-2 -11,-12 C -15,-24 -6,-34 -2,-48 Z", C["fire_y"], None)
        b += circ(18, -62, 3, C["fire_y"], None)
    for k in range(8):
        ang = math.radians(k * 45 + 22)
        x, y = 34 * math.cos(ang), 17 * math.sin(ang)
        if y >= 0:
            b += ell(x, y, 8.5, 6.2, C["stone"] if k % 2 else C["stone_l"], OUT, 2)
    return b


def draw_doghouse():
    a, hwall = 0.36, 40
    r, zr = 0.48, hwall - 3
    b = poly([(p[0] + 10, p[1] + 6) for p in (iso(-.48, .48), iso(.48, .48), iso(.48, -.48), iso(-.48, -.48))],
             "#1c2a3a", None, op=0.18)

    def L(u, v):
        return iso(-a + 2 * a * u, a, v)

    def R(u, v):
        return iso(a, a - 2 * a * u, v)

    b += poly([L(0, 0), L(1, 0), L(1, hwall), L(0, hwall)], "#efc98c")
    b += poly([R(0, 0), R(1, 0), R(1, hwall), R(0, hwall)], "#cf9f60")
    # 입구(왼쪽 벽)
    p0, p1, p2, p3 = L(0.26, 0), L(0.78, 0), L(0.78, 20), L(0.26, 20)
    t = L(0.52, 36)
    b += path(f"M {f(p0[0])},{f(p0[1])} L {f(p3[0])},{f(p3[1])} Q {f(t[0])},{f(t[1])} {f(p2[0])},{f(p2[1])} "
              f"L {f(p1[0])},{f(p1[1])} Z", C["dark"])
    apex = iso(0, 0, hwall + 42)
    Wr, Sr, Er = iso(-r, r, zr), iso(r, r, zr), iso(r, -r, zr)
    b += poly([Wr, Sr, apex], C["blue_l"]) + poly([Sr, Er, apex], C["blue_d"])
    # 뼈다귀 표시(오른쪽 벽)
    c = R(0.5, 22)
    b += g(bone_shape(0.34), c[0], c[1], rot=-26)
    return b


# ---------------------------------------------------------------- 아이콘 조각
def bone_shape(s=1.0, fill="#fffaf0"):
    d = ""
    for x in (-24, 24):
        for y in (-7, 7):
            d += circ(x * s, y * s, 9 * s, OUT, OUT, 2 * SW * min(1, s * 1.6))
    d += rrect(-24 * s, -7 * s, 48 * s, 14 * s, 4 * s, OUT, OUT, 2 * SW * min(1, s * 1.6))
    for x in (-24, 24):
        for y in (-7, 7):
            d += circ(x * s, y * s, 9 * s, fill, None)
    d += rrect(-24 * s, -7 * s, 48 * s, 14 * s, 4 * s, fill, None)
    return d


def heart_path(fill, stroke=OUT, sw=4):
    return path("M 0,30 C -38,4 -34,-28 -14,-28 C -6,-28 -2,-23 0,-18 C 2,-23 6,-28 14,-28 C 34,-28 38,4 0,30 Z",
                fill, stroke, sw)


def star_pts(R, r, n=5, rot=-90):
    p = []
    for i in range(n * 2):
        ang = math.radians(rot + i * 180 / n)
        rr = R if i % 2 == 0 else r
        p.append((rr * math.cos(ang), rr * math.sin(ang)))
    return p


def drumstick(meat="#c9713f", meat_l="#e39a62", bone="#fffaf0"):
    d = rrect(-4, -6, 40, 12, 5, bone, rot=(40, 0, 0))
    d += g(circ(36, -7, 7, bone) + circ(36, 7, 7, bone) + rrect(28, -6, 10, 12, 2, bone, None), rot=40)
    d += ell(-10, -10, 27, 22, meat, rot=40)
    d += ell(-16, -17, 11, 7, meat_l, None, rot=40, op=0.9)
    return d


# ---------------------------------------------------------------- 캐릭터
def kid(pose, pal, zombie=False, boss=False):
    """치비 캐릭터 한 프레임. 발 중심이 (0,0). 오른쪽을 본다."""
    ll, lr = pose.get("lift_l", 0), pose.get("lift_r", 0)     # 다리 들기
    sl, sr = pose.get("shift_l", 0), pose.get("shift_r", 0)   # 다리 앞뒤
    bob = pose.get("bob", 0)
    tilt = pose.get("tilt", 0)
    b = shadow(0, 1, 25, 9.5)

    # 다리
    def leg(x, lift, shift, far):
        s = rrect(x + shift, -29, 11.5, 25 - lift, 5, pal["pants_d"] if far else pal["pants"])
        s += ell(x + shift + 7.5, -3.5 - lift, 9, 5.6, pal["shoe"])
        return s

    legs = leg(-13.5, ll, sl, True) + leg(2, lr, sr, False)

    up = ""
    hy = -83 + bob
    sy = -57 + bob
    if zombie:
        # 뒤쪽 팔(앞으로 뻗음)
        up += rrect(-2, sy - 2, 34, 10.5, 5, pal["shirt_d"], rot=(pose.get("arm", 0) - 6, -2, sy + 3))
        up += g(circ(34, sy + 3, 6.5, pal["skin_d"]), rot=(pose.get("arm", 0) - 6, -2, sy + 3))
    else:
        al = pose.get("arm_l", 0)
        up += rrect(-24, sy, 10.5, 25, 5, pal["shirt_d"], rot=(al, -19, sy + 3))
        up += g(circ(-18.8, sy + 25, 5.6, pal["skin_d"]), rot=(al, -19, sy + 3))
    # 몸통
    up += rrect(-17.5, -62 + bob, 35, 37, 12, pal["shirt"])
    if zombie:
        up += rrect(-9, -44 + bob, 10, 9, 1.5, pal["patch"], OUT, 1.6)
        up += path(f"M -7,{-40+bob} l 6,0 M -4,{-43+bob} l 0,7", "none", OUT, 1.2)
    else:
        up += path(f"M -10,{-36+bob} q 10,6 20,0", "none", pal["shirt_d"], 3)
    # 머리
    hx = 1
    up += circ(hx, hy, 25.5, pal["skin"])
    if zombie:
        # 머리카락 몇 가닥
        up += poly([(hx - 14, hy - 21), (hx - 10, hy - 36), (hx - 3, hy - 24)], pal["hair"], OUT, 2)
        up += poly([(hx - 2, hy - 25), (hx + 4, hy - 40), (hx + 9, hy - 24)], pal["hair"], OUT, 2)
        up += poly([(hx + 9, hy - 23), (hx + 17, hy - 33), (hx + 18, hy - 18)], pal["hair"], OUT, 2)
        # 짝짝이 눈
        up += circ(hx - 6, hy + 0, 8, "#ffffff", OUT, 2.2) + circ(hx - 4, hy + 1, 2.6, C["dark"], None)
        up += circ(hx + 12, hy + 2, 5.6, "#ffffff", OUT, 2.2) + circ(hx + 13.5, hy + 3, 2, C["dark"], None)
        # 입
        up += path(f"M {hx-7},{hy+14} q 4,4 8,0 q 4,-4 8,0", "none", OUT, 2.4)
        up += rrect(hx + 2, hy + 12.5, 4.2, 4.6, 0.8, "#ffffff", OUT, 1.3)
        # 꿰맨 자국
        up += path(f"M {hx-18},{hy-9} l 9,-4 M {hx-16},{hy-13} l 2,5 M {hx-12},{hy-14} l 2,5", "none", pal["skin_dd"], 1.8)
        if boss:
            # 냄비 모자
            up += path(f"M {hx-25},{hy-12} C {hx-25},{hy-44} {hx+25},{hy-44} {hx+25},{hy-12} Z", C["stone"])
            up += path(f"M {hx-17},{hy-18} C {hx-16},{hy-34} {hx-4},{hy-37} {hx+2},{hy-37}", "none", C["stone_l"], 4)
            up += rrect(hx - 29, hy - 15, 58, 8, 4, C["stone_d"])
            up += rrect(hx + 27, hy - 14, 17, 6, 3, C["stone_d"])
            up += circ(hx, hy - 38, 4.5, C["stone_d"])
    else:
        # 머리카락
        up += path(f"M {hx-25.5},{hy-1} C {hx-31},{hy-38} {hx+31},{hy-38} {hx+25.5},{hy-1} "
                   f"C {hx+23},{hy-13} {hx+13},{hy-19} {hx+3},{hy-17} C {hx-6},{hy-13} {hx-18},{hy-11} {hx-25.5},{hy-1} Z",
                   pal["hair"])
        up += path(f"M {hx-2},{hy-29} q 3,-11 11,-8", "none", OUT, 6.5)
        up += path(f"M {hx-2},{hy-29} q 3,-11 11,-8", "none", pal["hair"], 3.5)
        up += path(f"M {hx-14},{hy-24} q 8,-6 18,-5", "none", "#8a5a30", 3, op=0.9)
        # 눈
        for ex in (hx - 5, hx + 12):
            up += ell(ex, hy + 3, 3.4, 4.8, C["dark"], None)
            up += circ(ex - 1, hy + 1.3, 1.3, "#ffffff", None)
        up += circ(hx - 14, hy + 11, 4.2, "#ff9c9c", None, op=0.65)
        up += circ(hx + 19, hy + 11, 4.2, "#ff9c9c", None, op=0.65)
        up += path(f"M {hx-1},{hy+12} q 4.5,4.5 9,0", "none", OUT, 2.2)
    # 앞쪽 팔
    if zombie:
        up += rrect(2, sy + 7, 34, 10.5, 5, pal["shirt"], rot=(pose.get("arm", 0), 2, sy + 12))
        up += g(circ(38, sy + 12, 6.5, pal["skin"]), rot=(pose.get("arm", 0), 2, sy + 12))
    else:
        ar = pose.get("arm_r", 0)
        piv = (18.5, sy + 3)
        arm = ""
        if pose.get("stick"):
            arm += path(f"M 18.8,{sy+25} L 18.8,{sy+62}", "none", OUT, 9)
            arm += path(f"M 18.8,{sy+25} L 18.8,{sy+62}", "none", C["wood"], 5)
        arm += rrect(13.5, sy, 10.5, 25, 5, pal["shirt"])
        arm += circ(18.8, sy + 25, 5.6, pal["skin"])
        up += g(arm, rot=(ar, piv[0], piv[1]))
    return b + legs + g(up, rot=(tilt, 0, -28))


PAL_KID = dict(skin=C["skin"], skin_d=C["skin_d"], hair=C["hair"], shirt=C["shirt"], shirt_d=C["shirt_d"],
               pants=C["pants"], pants_d="#335bab", shoe=C["shoe"])
PAL_ZOMBIE = dict(skin=C["zskin"], skin_d=C["zskin_d"], skin_dd="#5f9b58", hair=C["zhair"], shirt=C["zshirt"],
                  shirt_d=C["zshirt_d"], pants=C["zpants"], pants_d="#4a505a", shoe="#3d4148", patch="#c9b6ea")
PAL_BOSS = dict(PAL_ZOMBIE, shirt="#d05a4e", shirt_d="#ab4037", patch="#f0a79a", skin="#9bd08c", skin_d="#79b46e")


def dog(pose):
    """강아지 한 프레임. 발 중심 (0,0), 오른쪽을 본다."""
    o = pose.get("legs", (0, 0, 0, 0))     # 뒷다리(먼쪽,가까운쪽), 앞다리(먼쪽,가까운쪽) 앞뒤 이동
    lift = pose.get("lift", (0, 0, 0, 0))
    bob = pose.get("bob", 0)
    b = shadow(2, 1, 34, 10)
    # 꼬리
    wag = pose.get("wag", 0)
    td = f"M -22,{-30+bob} C -32,{-36+bob} {-34+wag},{-46+bob} {-28+wag},{-54+bob}"
    b += path(td, "none", OUT, 12) + path(td, "none", C["dog"], 6.5)
    # 먼쪽 다리
    b += rrect(-19 + o[0], -18, 8.5, 17 - lift[0], 4, C["dog_d"])
    b += rrect(9 + o[2], -18, 8.5, 17 - lift[2], 4, C["dog_d"])
    # 몸
    b += ell(-1, -27 + bob, 25, 15.5, C["dog"])
    b += ell(-2, -21 + bob, 15, 7, C["dog_l"], None, op=0.9)
    # 가까운 다리
    b += rrect(-12 + o[1], -18, 9, 18 - lift[1], 4.2, C["dog"])
    b += rrect(15 + o[3], -18, 9, 18 - lift[3], 4.2, C["dog"])
    # 목걸이 자리 + 머리
    hx, hy = 24, -43 + bob
    b += circ(hx, hy, 17, C["dog"])
    b += ell(hx + 12, hy + 6, 10.5, 8, C["dog_l"])
    b += ell(hx + 20, hy + 2.5, 4, 3.2, C["dark"], None)
    b += path(f"M {hx+12},{hy+9} q 4,3.5 8,0", "none", OUT, 2)
    b += ell(hx + 4, hy - 3, 3, 3.8, C["dark"], None) + circ(hx + 3.2, hy - 4.4, 1.1, "#ffffff", None)
    # 귀
    b += path(f"M {hx-9},{hy-14} C {hx-22},{hy-12} {hx-20},{hy+8} {hx-11},{hy+6} C {hx-6},{hy+1} {hx-5},{hy-9} {hx-9},{hy-14} Z",
              C["dog_ear"])
    return b


def boar(pose):
    """멧돼지 한 프레임. 발 중심 (0,0), 오른쪽을 본다."""
    o = pose.get("legs", (0, 0, 0, 0))
    lift = pose.get("lift", (0, 0, 0, 0))
    bob = pose.get("bob", 0)
    b = shadow(2, 1, 44, 12)
    b += path(f"M -38,{-40+bob} q -10,-2 -8,-10 q 6,-2 4,6", "none", OUT, 3)
    b += rrect(-26 + o[0], -18, 10, 17 - lift[0], 4, C["boar_d"])
    b += rrect(10 + o[2], -18, 10, 17 - lift[2], 4, C["boar_d"])
    b += ell(-4, -36 + bob, 36, 25, C["boar"])
    b += ell(-10, -44 + bob, 22, 10, C["boar_l"], None, op=0.55)
    # 갈기
    mane = [(-30, -55), (-22, -66), (-16, -58), (-8, -70), (-2, -60), (6, -70), (12, -59), (20, -64), (22, -52), (-4, -56)]
    b += poly([(x, y + bob) for x, y in mane], C["boar_d"], OUT, 2.4)
    b += rrect(-17 + o[1], -18, 10.5, 18 - lift[1], 4.5, C["boar_d"])
    b += rrect(18 + o[3], -18, 10.5, 18 - lift[3], 4.5, C["boar_d"])
    # 머리
    hx, hy = 30, -32 + bob
    b += poly([(hx - 12, hy - 14), (hx - 6, hy - 30), (hx + 2, hy - 15)], C["boar_d"], OUT, 2.4)
    b += ell(hx, hy, 21, 19, C["boar"])
    b += ell(hx + 17, hy + 6, 11, 9, C["boar_snout"])
    b += circ(hx + 15, hy + 5, 1.8, C["dark"], None) + circ(hx + 21, hy + 6, 1.8, C["dark"], None)
    b += path(f"M {hx+6},{hy+12} q 1,-11 7,-13 q -1,8 0,13 Z", "#fffaf0", OUT, 1.8)
    b += ell(hx + 2, hy - 5, 2.8, 3.4, C["dark"], None) + circ(hx + 1.4, hy - 6.2, 1, "#ffffff", None)
    b += line(hx - 4, hy - 13, hx + 7, hy - 9, OUT, 2.6)
    return b


def sheet(key, fw, fh, foot, frames, names, kind="char", scale=None):
    w = fw * len(frames)
    body = ""
    for i, fr in enumerate(frames):
        body += g(fr, i * fw + foot[0], foot[1], scale=scale)
    img = render(body, w, fh)
    save(img, "chars", key, (foot[0] / fw, foot[1] / fh), kind,
         frameWidth=fw, frameHeight=fh, frames=names)


def make_chars():
    idle = dict()
    w1 = dict(lift_l=7, shift_l=4, shift_r=-3, bob=-2, arm_l=24, arm_r=-24)
    w2 = dict(lift_r=7, shift_r=4, shift_l=-3, bob=-2, arm_l=-24, arm_r=24)
    atk = dict(shift_r=5, shift_l=-3, bob=-1, arm_l=20, arm_r=-118, stick=True)
    sheet("char_player", 168, 148, (84, 134),
          [kid(idle, PAL_KID), kid(w1, PAL_KID), kid(w2, PAL_KID), kid(atk, PAL_KID)],
          ["idle", "walk1", "walk2", "attack"])

    z1 = dict(lift_l=5, shift_l=3, shift_r=-2, tilt=-5, arm=-8)
    z2 = dict(lift_r=5, shift_r=3, shift_l=-2, tilt=5, arm=6)
    sheet("char_zombie", 128, 152, (64, 138),
          [kid(z1, PAL_ZOMBIE, True), kid(z2, PAL_ZOMBIE, True)], ["walk1", "walk2"])
    sheet("char_zombie_boss", 184, 216, (92, 198),
          [kid(z1, PAL_BOSS, True, True), kid(z2, PAL_BOSS, True, True)], ["walk1", "walk2"], scale=1.42)

    d0 = dict()
    d1 = dict(legs=(5, -5, -5, 5), lift=(0, 4, 4, 0), bob=-1.5, wag=5)
    d2 = dict(legs=(-5, 5, 5, -5), lift=(4, 0, 0, 4), bob=-1.5, wag=-5)
    sheet("char_dog", 112, 84, (56, 72), [dog(d0), dog(d1), dog(d2)], ["idle", "walk1", "walk2"])

    b1 = dict(legs=(5, -5, -5, 5), lift=(0, 4, 4, 0), bob=-1.5)
    b2 = dict(legs=(-5, 5, 5, -5), lift=(4, 0, 0, 4), bob=-1.5)
    sheet("char_boar", 136, 96, (68, 82), [boar(d0), boar(b1), boar(b2)], ["idle", "walk1", "walk2"])


# ---------------------------------------------------------------- 아이콘 / 효과
def icon(key, body, size=96, sub="ui", kind="icon"):
    img = render(g(body, size / 2, size / 2), size, size)
    save(img, sub, key, (0.5, 0.5), kind)


def make_icons():
    # 나무
    def log(col, col_l):
        s = rrect(-34, -13, 62, 26, 13, col)
        s += line(-18, -5, 12, -5, col_l, 3, op=0.7)
        s += ell(26, 0, 9, 13, C["wood_l"]) + ell(26, 0, 4, 6.5, "none", C["wood"], 2)
        return s
    icon("icon_wood", g(log(C["wood_d"], C["wood"]), -2, -16, rot=-16) + g(log(C["wood"], C["wood_l"]), 0, 14, rot=-16))
    # 돌
    icon("icon_stone", g(draw_rock(0.72).replace('opacity="0.2"', 'opacity="0"'), 4, 22))
    # 열매
    b = path("M 2,-22 C 14,-40 30,-34 32,-24 C 20,-18 10,-18 2,-22 Z", C["leaf"])
    b += line(2, -22, 0, -10, C["leaf_d"], 3)
    for x, y in ((-14, 6), (14, 4), (0, 22)):
        b += circ(x, y, 16, C["red"], OUT, 3.5) + circ(x - 5, y - 6, 4, "#ffd2cc", None)
    icon("icon_berry", b)
    # 고기
    icon("icon_meat", g(drumstick(), -1, 1, scale=1.05))
    # 뼈다귀
    icon("icon_bone", g(bone_shape(1.05), 0, 0, rot=-35))
    # 하트
    icon("icon_heart", g(heart_path("#ff5a6e") + ell(-15, -14, 7, 5, "#ffb3bd", None, rot=-30), 0, 2, scale=1.18))
    icon("icon_heart_empty", g(heart_path("#d8dde3", "#7c858f"), 0, 2, scale=1.18))
    # 배고픔
    icon("icon_hunger", g(drumstick(), -1, 1, scale=1.05))
    icon("icon_hunger_empty", g(drumstick("#d8dde3", "#e8ecf0", "#eef1f4").replace(OUT, "#7c858f"), -1, 1, scale=1.05))
    # 해 / 달
    b = ""
    for a in range(0, 360, 45):
        x, y = math.cos(math.radians(a)), math.sin(math.radians(a))
        b += line(x * 30, y * 30, x * 40, y * 40, C["yellow_d"], 7)
    b += circ(0, 0, 23, C["yellow"], OUT, 3.5)
    icon("icon_sun", b)
    b = path("M 10,-34 A 34 34 0 1 0 34,10 A 26 26 0 1 1 10,-34 Z", "#fff1b8", OUT, 3.5)
    b += g(poly(star_pts(8, 3.4), "#ffffff", None), 24, -22) + g(poly(star_pts(5.5, 2.3), "#ffffff", None), 34, -2)
    icon("icon_moon", b)
    # 망치(짓기)
    b = rrect(-5, -14, 10, 56, 5, C["wood"], rot=(40, 0, 0))
    b += g(rrect(-26, -34, 52, 24, 5, C["stone"]) + rrect(-26, -34, 16, 24, 4, C["stone_d"]) +
           line(-4, -28, 18, -28, C["stone_l"], 3), rot=40)
    icon("icon_build", g(b, 4, 4))
    # 치우기
    b = circ(0, 0, 34, C["red"], OUT, 3.5)
    b += line(-14, -14, 14, 14, "#ffffff", 9) + line(14, -14, -14, 14, "#ffffff", 9)
    icon("icon_remove", b)
    # 깃발
    b = rrect(-22, -36, 6, 72, 3, "#a8703a")
    b += path("M -17,-34 C -2,-42 10,-26 30,-32 L 26,-4 C 10,2 -2,-14 -17,-6 Z", C["red"], OUT, 3.5)
    icon("icon_flag", b)
    # 시설 버튼용 작은 그림
    for key, fn, sc, dy in (("icon_fence", draw_fence, 0.82, 22), ("icon_stone_tower", draw_stone_tower, 0.56, 44),
                            ("icon_campfire", draw_campfire, 0.78, 30), ("icon_doghouse", draw_doghouse, 0.72, 30)):
        icon(key, g(fn(), 0, dy, scale=sc))
    # 발자국(강아지 친밀도)
    b = ell(0, 10, 17, 14, C["dog_ear"], OUT, 3.5)
    for x, y in ((-20, -8), (-7, -20), (8, -20), (21, -8)):
        b += ell(x, y, 7, 8.5, C["dog_ear"], OUT, 3.5)
    icon("icon_paw", b)

    # 효과
    icon("fx_star", poly(star_pts(26, 11.5), C["yellow"], OUT, 3), 64, "fx", "fx")
    icon("fx_heart", g(heart_path("#ff7d95", OUT, 3.5), 0, 0, scale=0.8), 64, "fx", "fx")
    b = blob([(0, 0, 20), (-18, 4, 14), (18, 4, 14), (-8, -12, 14), (10, -12, 14)], "#ffffff",
             dark=[(6, 14, 22)], dark_c="#dfe7f0", sw=2.5)
    icon("fx_poof", b, 96, "fx", "fx")
    b = circ(0, 0, 10, C["stone"], OUT, 2.5) + circ(-3, -3, 3.2, C["stone_l"], None)
    icon("proj_stone", b, 28, "fx", "fx")


def make_objects():
    obj("objects", "obj_tree", 168, 216, draw_tree(), blocks=True)
    obj("objects", "obj_pine", 136, 216, draw_pine(), blocks=True)
    obj("objects", "obj_palm", 216, 248, draw_palm(), foot=(96, 216), blocks=True)
    obj("objects", "obj_rock", 128, 120, draw_rock(), foot=(66, 84), blocks=True)
    obj("objects", "obj_bush_berry", 128, 108, draw_bush(True), blocks=True)
    obj("objects", "obj_bush_empty", 128, 108, draw_bush(False), blocks=True)
    obj("objects", "obj_stump", 128, 92, draw_stump(), foot=(64, 62), blocks=True)
    obj("objects", "obj_rubble", 128, 72, draw_rubble(), foot=(64, 44), blocks=True)
    obj("objects", "obj_house", 312, 320, draw_house(), foot=(148, 240), blocks=True, footprint=[2, 2])
    obj("objects", "obj_flag", 128, 232, draw_flag(), foot=(56, 200), blocks=True)
    # 깃발 자리는 바닥 장식(타일과 같은 크기, 중심 기준)
    img = render(g(draw_flag_spot(), TCX, TCY), TILE_W, TILE_H)
    save(img, "objects", "obj_flag_spot", (0.5, 0.5), "decal")

    obj("towers", "tower_fence", 128, 108, draw_fence(), kind="tower")
    obj("towers", "tower_stone", 136, 196, draw_stone_tower(), kind="tower")
    obj("towers", "tower_campfire_1", 136, 128, draw_campfire(1), kind="tower")
    obj("towers", "tower_campfire_2", 136, 128, draw_campfire(2), kind="tower")
    obj("towers", "tower_doghouse", 128, 148, draw_doghouse(), kind="tower")


def main():
    make_tiles()
    make_edges()
    make_fog()
    make_overlays()
    make_objects()
    make_chars()
    make_icons()
    terrain_tiles = dict(
        water=[["tile_water_1", 10]],
        sand=[["tile_sand_1", 7], ["tile_sand_2", 3]],
        grass=[["tile_grass_1", 4], ["tile_grass_2", 4], ["tile_grass_3", 2]],
        forest=[["tile_forest_1", 7], ["tile_forest_2", 3]],
        dirt=[["tile_dirt_1", 10]],
    )
    meta = dict(tileWidth=TW, tileHeight=TH, tilePadding=TILE_PAD, terrainTiles=terrain_tiles,
                note="originX/originY = 칸 중심(발 위치)에 맞출 기준점. 시트는 frameWidth/frameHeight/frames 참고.")
    with open(os.path.join(ASSETS, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(dict(meta=meta, assets=MANIFEST), fp, ensure_ascii=False, indent=1)
    print(f"{len(MANIFEST)} assets -> {ASSETS}")


if __name__ == "__main__":
    main()
