#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
섬 생존 데모 - 미리보기 그림 만들기 (게임이 아니라, 그림과 맵이 어떻게 보일지 확인용)

실행:  python tools/render_preview.py
결과:  preview/preview_map.png   섬 전체(안개 없음, 구역 표시)
       preview/preview_day.png   낮 화면 예시
       preview/preview_night.png 밤 화면 예시

여기 쓰인 좌표/겹침 규칙이 DEMO_SPEC.md 3장과 같다. 게임 구현 시 참고용.
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
HW, HH = 64, 32
BG = (227, 234, 243)            # 화면 바깥(구름색)

MAN = json.load(open(os.path.join(ASSETS, "manifest.json"), encoding="utf-8"))
A = MAN["assets"]
MAP = json.load(open(os.path.join(ROOT, "data", "map_demo.json"), encoding="utf-8"))
N = MAP["cols"]
TERRAIN = MAP["terrain"]
_cache = {}


def font(size, bold=False):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "",
              "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
              "C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf",
              "/System/Library/Fonts/AppleSDGothicNeo.ttc"):
        if p and os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def img(key, frame=None, flip=False):
    ck = (key, frame, flip)
    if ck not in _cache:
        m = A[key]
        im = Image.open(os.path.join(ASSETS, m["file"])).convert("RGBA")
        if frame is not None:
            fw = m["frameWidth"]
            i = m["frames"].index(frame)
            im = im.crop((i * fw, 0, (i + 1) * fw, m["frameHeight"]))
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        _cache[ck] = im
    return _cache[ck]


def center(col, row):
    """칸 중심의 월드 좌표."""
    return ((col - row) * HW, (col + row) * HH)


def variant(kind, col, row):
    """같은 땅이라도 칸마다 그림을 조금씩 다르게."""
    h = (((col * 73856093) ^ (row * 19349663)) & 0xFFFFFFFF) % 10
    for key, weight in MAN["meta"]["terrainTiles"][kind]:
        if h < weight:
            return key
        h -= weight
    return MAN["meta"]["terrainTiles"][kind][0][0]


def terrain(col, row):
    if 0 <= col < N and 0 <= row < N:
        return TERRAIN[row][col]
    return 0


class Canvas:
    def __init__(self):
        self.ox = (N - 1) * HW + 200
        self.oy = 360
        self.im = Image.new("RGBA", (2 * (N - 1) * HW + 400, 2 * (N - 1) * HH + 560), BG + (255,))

    def blit(self, key, wx, wy, frame=None, flip=False):
        m = A[key]
        im = img(key, frame, flip)
        w, h = im.size
        ox = m["originX"] if not flip else 1 - m["originX"]
        x = round(self.ox + wx - ox * w)
        y = round(self.oy + wy - m["originY"] * h)
        self.im.alpha_composite(im, (x, y))


def render(revealed=None, things=(), removed=(), claimed=(), night=False, stumps=()):
    """revealed: 밝혀진 칸 집합(None이면 전부). things: 추가로 놓을 것들."""
    cv = Canvas()
    order = sorted(((c, r) for r in range(N) for c in range(N)), key=lambda t: (t[0] + t[1], t[0]))
    names = MAP["terrainLegend"]
    seen = (lambda c, r: True) if revealed is None else (lambda c, r: (c, r) in revealed)

    # 1) 물
    for c, r in order:
        if TERRAIN[r][c] == 0:
            cv.blit(variant("water", c, r), *center(c, r))
    # 2) 낭떠러지 띠
    for c, r in order:
        if TERRAIN[r][c] != 0 and seen(c, r):
            if terrain(c, r + 1) == 0:
                cv.blit("edge_sw", *center(c, r))
            if terrain(c + 1, r) == 0:
                cv.blit("edge_se", *center(c, r))
    # 3) 땅
    for c, r in order:
        t = TERRAIN[r][c]
        if t != 0:
            cv.blit(variant(names[str(t)], c, r), *center(c, r))
    # 4) 바닥 장식(내 땅 표시, 깃발 자리)
    for c, r in order:
        if MAP["zone"][r][c] in claimed:
            cv.blit("overlay_claimed", *center(c, r))
    flags = {(z["flagSpot"]["col"], z["flagSpot"]["row"]) for z in MAP["zones"]}
    built_flags = {(t["col"], t["row"]) for t in things if t["key"] == "obj_flag"}
    for c, r in flags - built_flags:
        if seen(c, r):
            cv.blit("obj_flag_spot", *center(c, r))
    # 5) 안개
    for c, r in order:
        if not seen(c, r):
            cv.blit("tile_fog", *center(c, r))
    # 6) 사물과 캐릭터: 발 위치의 y 순서대로
    draw = []
    objkey = dict(tree="obj_tree", pine="obj_pine", palm="obj_palm", rock="obj_rock", bush="obj_bush_berry")
    for o in MAP["objects"]:
        p = (o["col"], o["row"])
        if p in removed or not seen(*p):
            continue
        key = "obj_stump" if p in stumps else objkey[o["type"]]
        wx, wy = center(*p)
        draw.append((wy, 0, key, wx, wy, None, False))
    h = MAP["house"]
    wx, wy = center(h["col"] + 0.5, h["row"] + 0.5)
    draw.append((wy, 0, "obj_house", wx, wy, None, False))
    for t in things:
        wx, wy = center(t["col"], t["row"])
        draw.append((wy, 1, t["key"], wx, wy, t.get("frame"), t.get("flip", False)))
    for wy, _, key, wx, wy2, frame, flip in sorted(draw, key=lambda d: (d[0], d[1])):
        cv.blit(key, wx, wy2, frame, flip)

    if night:                       # 게임에서는 월드 위에 #8ca6f2 사각형을 곱하기(MULTIPLY)로 덮는다
        r_, g_, b_, a_ = cv.im.split()
        r_ = r_.point(lambda v: int(v * 0.55))
        g_ = g_.point(lambda v: int(v * 0.65))
        b_ = b_.point(lambda v: int(v * 0.95))
        cv.im = Image.merge("RGBA", (r_, g_, b_, a_))
    return cv


def view(cv, col, row, world_w, world_h, out_w, out_h):
    wx, wy = center(col, row)
    x0 = int(cv.ox + wx - world_w / 2)
    y0 = int(cv.oy + wy - world_h / 2)
    return cv.im.crop((x0, y0, x0 + world_w, y0 + world_h)).resize((out_w, out_h), Image.LANCZOS)


def text(d, xy, s, ft, fill=(255, 255, 255), stroke=(40, 30, 24), sw=4, anchor="la"):
    d.text(xy, s, font=ft, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)


def hud(im, day_text, is_night, hearts, hunger, inv, zone_text, progress=0.5):
    """화면 UI 예시(1600x1200 기준)."""
    d = ImageDraw.Draw(im, "RGBA")
    W, H = im.size

    def icon(key, x, y, size):
        ic = img(key).resize((size, size), Image.LANCZOS)
        im.alpha_composite(ic, (int(x), int(y)))

    def panel(x0, y0, x1, y1, r=28):
        d.rounded_rectangle((x0, y0, x1, y1), r, fill=(255, 248, 230, 225), outline=(59, 42, 32, 255), width=4)

    # 왼쪽 위: 하트, 배고픔
    panel(20, 20, 20 + 5 * 62 + 28, 20 + 2 * 62 + 20)
    for i in range(5):
        icon("icon_heart" if i < hearts else "icon_heart_empty", 34 + i * 62, 30, 58)
        icon("icon_hunger" if i < hunger else "icon_hunger_empty", 34 + i * 62, 90, 58)
    # 가운데 위: 낮/밤 시계
    cx = W // 2
    panel(cx - 250, 20, cx + 250, 108)
    icon("icon_moon" if is_night else "icon_sun", cx - 240, 26, 76)
    d.rounded_rectangle((cx - 150, 68, cx + 226, 92), 12, fill=(120, 110, 100, 255))
    fillc = (110, 130, 230, 255) if is_night else (255, 196, 60, 255)
    d.rounded_rectangle((cx - 150, 68, cx - 150 + int(376 * progress), 92), 12, fill=fillc)
    text(d, (cx - 150, 24), day_text, font(30, True), fill=(59, 42, 32), sw=0)
    # 오른쪽 위: 구역 상태
    panel(W - 440, 20, W - 20, 108)
    icon("icon_flag", W - 432, 26, 76)
    text(d, (W - 348, 44), zone_text, font(30, True), fill=(59, 42, 32), sw=0)
    # 아래: 가방
    bw = 150
    x0 = 20
    panel(x0, H - 130, x0 + len(inv) * bw + 16, H - 20)
    for i, (key, n) in enumerate(inv):
        icon(key, x0 + 12 + i * bw, H - 122, 92)
        text(d, (x0 + 104 + i * bw, H - 96), str(n), font(40, True), fill=(59, 42, 32), sw=0)
    # 오른쪽 아래: 짓기 버튼
    d.ellipse((W - 190, H - 190, W - 30, H - 30), fill=(255, 211, 77, 255), outline=(59, 42, 32, 255), width=5)
    icon("icon_build", W - 166, H - 166, 112)
    text(d, (W - 110, H - 58), "짓기", font(28, True), anchor="mm")
    return im


def circle_tiles(points, radius=3.5):
    s = set()
    for (pc, pr) in points:
        for r in range(N):
            for c in range(N):
                if math.hypot(c - pc, r - pr) <= radius:
                    s.add((c, r))
    return s


def main():
    os.makedirs(os.path.join(ROOT, "preview"), exist_ok=True)
    zones = MAP["zones"]
    door = (MAP["houseDoor"]["col"], MAP["houseDoor"]["row"])
    dogpos = next((a["col"], a["row"]) for a in MAP["animals"] if a["type"] == "dog")
    boars = [dict(key="char_boar", col=a["col"], row=a["row"], frame="idle", flip=(i % 2 == 0))
             for i, a in enumerate(MAP["animals"]) if a["type"] == "boar"]

    # ---------- 1) 섬 전체
    things = [dict(key="char_player", col=door[0], row=door[1], frame="idle"),
              dict(key="char_dog", col=dogpos[0], row=dogpos[1], frame="idle", flip=True)] + boars
    cv = render(None, things)
    land = [(c, r) for r in range(N) for c in range(N) if TERRAIN[r][c] != 0]
    xs = [center(c, r)[0] for c, r in land]
    ys = [center(c, r)[1] for c, r in land]
    x0, x1 = cv.ox + min(xs) - 220, cv.ox + max(xs) + 220
    y0, y1 = cv.oy + min(ys) - 330, cv.oy + max(ys) + 150
    full = cv.im.crop((int(x0), int(y0), int(x1), int(y1)))
    d = ImageDraw.Draw(full, "RGBA")
    ft, fs = font(54, True), font(34, True)
    for z in zones:
        tiles = [(c, r) for r in range(N) for c in range(N) if MAP["zone"][r][c] == z["id"]]
        mx = sum(center(c, r)[0] for c, r in tiles) / len(tiles) + cv.ox - x0
        my = sum(center(c, r)[1] for c, r in tiles) / len(tiles) + cv.oy - y0
        fx, fy = center(z["flagSpot"]["col"], z["flagSpot"]["row"])
        text(d, (fx + cv.ox - x0, fy + cv.oy - y0 - 46), "깃발 자리", fs, fill=(255, 235, 150), anchor="mm")
        text(d, (fx + cv.ox - x0, fy + cv.oy - y0 + 86), f'{z["id"]}구역 {z["name"]}', ft, anchor="mm", sw=6)
        for s in z["spawns"]:
            sx, sy = center(s["col"], s["row"])
            px, py = sx + cv.ox - x0, sy + cv.oy - y0
            d.ellipse((px - 26, py - 13, px + 26, py + 13), fill=(155, 123, 209, 170), outline=(60, 40, 90, 255), width=3)
            text(d, (px, py - 4), "좀", font(24, True), anchor="mm", sw=3)
    hx, hy = center(MAP["house"]["col"] + 0.5, MAP["house"]["row"] + 0.5)
    text(d, (hx + cv.ox - x0 + 190, hy + cv.oy - y0 - 40), "우리 집", fs, fill=(255, 235, 150), anchor="mm")
    full = full.resize((2000, int(full.height * 2000 / full.width)), Image.LANCZOS)
    full.convert("RGB").save(os.path.join(ROOT, "preview", "preview_map.png"))

    # ---------- 2) 낮 화면 예시 (zoom 1.6: 월드 1280x960 영역)
    walked = [door, (25, 28), (23, 28), (22, 29), (28, 26), (30, 25), (26, 24)]
    rev = circle_tiles(walked, 3.6)
    stump = (27, 29)
    things = [dict(key="char_player", col=23, row=28, frame="walk1", flip=True),
              dict(key="char_dog", col=dogpos[0], row=dogpos[1], frame="idle", flip=True)]
    cv = render(rev, things, stumps={stump} if any((o["col"], o["row"]) == stump for o in MAP["objects"]) else set())
    day = view(cv, 24.5, 27.5, 1280, 960, 1600, 1200)
    f1 = next(z for z in zones if z["id"] == 1)
    hud(day, "1일째 낮", False, 5, 4, [("icon_wood", 6), ("icon_stone", 3), ("icon_berry", 2), ("icon_meat", 0), ("icon_bone", 0)],
        "해변  안개 34%", 0.42)
    day.convert("RGB").save(os.path.join(ROOT, "preview", "preview_day.png"))

    # ---------- 3) 밤 화면 예시 (zoom 1.0: 월드 2048x1536 영역)
    rev = {(c, r) for r in range(N) for c in range(N) if MAP["zone"][r][c] == 1}
    rev |= circle_tiles([(c, r) for (c, r) in rev], 1.5)
    rev |= circle_tiles([(21, 22), (24, 21)], 3.6)
    occupied = {(o["col"], o["row"]) for o in MAP["objects"]}
    h = MAP["house"]
    fence = []
    for c in range(h["col"] - 3, h["col"] + 5):                 # 집 둘레 울타리(문 앞은 열어 둠)
        for r in range(h["row"] - 3, h["row"] + 5):
            edge = c in (h["col"] - 3, h["col"] + 4) or r in (h["row"] - 3, h["row"] + 4)
            gate = (r == h["row"] + 4 and c in (h["col"] + 1, h["col"] + 2)) or (c == h["col"] - 3 and r == h["row"])
            if edge and not gate and (c, r) not in occupied and TERRAIN[r][c] != 0:
                fence.append(dict(key="tower_fence", col=c, row=r))
    things = fence + [
        dict(key="tower_stone", col=h["col"] + 3, row=h["row"] + 3),
        dict(key="tower_stone", col=h["col"] - 2, row=h["row"] + 3),
        dict(key="tower_campfire_1", col=h["col"] + 1, row=h["row"] + 5),
        dict(key="tower_doghouse", col=h["col"] - 1, row=h["row"] + 3),
        dict(key="obj_flag", col=f1["flagSpot"]["col"], row=f1["flagSpot"]["row"]),
        dict(key="char_player", col=h["col"] + 2, row=h["row"] + 5, frame="attack"),
        dict(key="char_dog", col=h["col"] + 3, row=h["row"] + 5, frame="walk1"),
        dict(key="char_zombie", col=h["col"] + 4, row=h["row"] + 6, frame="walk1", flip=True),
        dict(key="char_zombie", col=h["col"] + 6, row=h["row"] + 5, frame="walk2", flip=True),
        dict(key="char_zombie", col=h["col"] - 5, row=h["row"] + 1, frame="walk1"),
        dict(key="char_zombie", col=h["col"] - 6, row=h["row"] + 3, frame="walk2"),
        dict(key="char_zombie", col=h["col"] - 4, row=h["row"] + 5, frame="walk1"),
        dict(key="char_zombie_boss", col=h["col"] - 7, row=h["row"] + 2, frame="walk1"),
        dict(key="proj_stone", col=h["col"] - 3.2, row=h["row"] + 2.2),
    ]
    cv = render(rev, things, night=True)
    night = view(cv, h["col"] + 0.5, h["row"] + 1.5, 2048, 1536, 1600, 1200)
    hud(night, "3일째 밤  대장이 온다!", True, 4, 3,
        [("icon_wood", 2), ("icon_stone", 1), ("icon_berry", 3), ("icon_meat", 1), ("icon_bone", 0)],
        "해변  깃발 세움", 0.3)
    night.convert("RGB").save(os.path.join(ROOT, "preview", "preview_night.png"))
    print("ok")


if __name__ == "__main__":
    main()
