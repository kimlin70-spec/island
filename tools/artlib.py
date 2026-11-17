# -*- coding: utf-8 -*-
"""
그림의 '도형 목록' 모음. 실제로 그리는 일(수채화 효과)은 wc.py 가 한다.

좌표는 원본(마스터) 크기 기준: 한 칸 = 128x64. 저장할 때 SCALE 만큼 줄여 한 칸 80x40 이 된다.
사물과 캐릭터는 발이 닿는 점이 (0,0), 위쪽이 -y 이다. 캐릭터는 오른쪽을 본다.

  ('P', 점들, 색이름, 옵션)                다각형
  ('E', (cx,cy,rx,ry,회전), 색이름, 옵션)   타원
  ('L', 점들, 두께, 색이름, 옵션)           선(끝이 둥근)
옵션: tag='shadow' 그림자 / ground=True 바닥에 붙는 것 / soft=True 부드러운 명암
"""
import math
import random

MHW, MHH = 64, 32          # 마스터 크기에서 한 칸의 반폭, 반높이
SCALE = 0.625              # 마스터 -> 저장 크기
TW, TH = 80, 40            # 저장 크기에서 한 칸


def iso(x, y, z=0.0):
    return ((x - y) * MHW, (x + y) * MHH - z)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def P(pts, key, **o):
    return ('P', [(float(x), float(y)) for x, y in pts], key, o)


def E(cx, cy, rx, ry, key, rot=0.0, **o):
    return ('E', (float(cx), float(cy), float(rx), float(ry), float(rot)), key, o)


def L(pts, w, key, **o):
    return ('L', [(float(x), float(y)) for x, y in pts], float(w), key, o)


def S(cx, cy, rx, ry, rot=0.0):
    return E(cx, cy, rx, ry, 'shadow', rot, tag='shadow')


def ell_pts(cx, cy, rx, ry, rot=0.0, n=28):
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + rx * math.cos(2 * math.pi * i / n) * ca - ry * math.sin(2 * math.pi * i / n) * sa,
             cy + rx * math.cos(2 * math.pi * i / n) * sa + ry * math.sin(2 * math.pi * i / n) * ca) for i in range(n)]


def bez3(p0, p1, p2, p3, n=14):
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append((m**3 * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t**3 * p3[0],
                    m**3 * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t**3 * p3[1]))
    return out


def bez2(p0, p1, p2, n=10):
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append((m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0],
                    m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]))
    return out


def ribbon(center, widths):
    left, right = [], []
    n = len(center)
    for i, (x, y) in enumerate(center):
        x0, y0 = center[max(0, i - 1)]
        x1, y1 = center[min(n - 1, i + 1)]
        dx, dy = x1 - x0, y1 - y0
        d = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / d, dx / d
        left.append((x + nx * widths[i], y + ny * widths[i]))
        right.append((x - nx * widths[i], y - ny * widths[i]))
    return left, right


def xform(prims, dx=0.0, dy=0.0, k=1.0, flip=False):
    """도형 목록을 옮기고(dx,dy), 키우고(k), 좌우로 뒤집는다."""
    f = -1.0 if flip else 1.0
    out = []
    for p in prims:
        if p[0] == 'P':
            out.append(('P', [(x * k * f + dx, y * k + dy) for x, y in p[1]], p[2], p[3]))
        elif p[0] == 'E':
            cx, cy, rx, ry, rot = p[1]
            out.append(('E', (cx * k * f + dx, cy * k + dy, rx * k, ry * k, rot * f), p[2], p[3]))
        else:
            out.append(('L', [(x * k * f + dx, y * k + dy) for x, y in p[1]], p[2] * k, p[3], p[4]))
    return out


def bbox(prims, pad=10):
    xs, ys = [], []
    for p in prims:
        if p[0] == 'P':
            xs += [x for x, _ in p[1]]
            ys += [y for _, y in p[1]]
        elif p[0] == 'E':
            cx, cy, rx, ry, rot = p[1]
            m = max(rx, ry)
            xs += [cx - m, cx + m]
            ys += [cy - m, cy + m]
        else:
            w = p[2]
            xs += [x - w for x, _ in p[1]] + [x + w for x, _ in p[1]]
            ys += [y - w for _, y in p[1]] + [y + w for _, y in p[1]]
    return (math.floor(min(xs)) - pad, math.floor(min(ys)) - pad, math.ceil(max(xs)) + pad, math.ceil(max(ys)) + pad)


# ------------------------------------------------------------------ 자연물
def leafkeys(tone):
    pre = {'a': 'leafA', 'b': 'leafB', 'w': 'leafW'}[tone]
    return (pre + '_l', pre, pre + '_d')


def tree(tone, seed):
    rng = random.Random(seed)
    k = leafkeys(tone)
    th = rng.uniform(52, 68)
    s = rng.uniform(0.9, 1.1)
    prims = [S(34, 8, 62 * s, 20 * s, 10)]
    prims += [P([(-9, 3), (9, 3), (6, -th - 20), (-6, -th - 20)], 'trunk'),
              P([(1, 3), (9, 3), (6, -th - 20), (1, -th - 20)], 'trunk_d', soft=True)]
    cy = -th - 50 * s
    lumps = [(0, 0, 46), (-34, 20, 30), (34, 22, 30), (-18, -22, 29), (22, -20, 29), (0, 26, 30)]
    rng.shuffle(lumps)
    for x, y, r in lumps:
        j = rng.uniform(0.92, 1.08)
        prims.append(E(x * s, cy + y * s, r * s * j, r * s * 0.96 * j, k[1]))
    for x, y, r in [(24, 26, 26), (40, 12, 17), (4, 38, 20)]:
        prims.append(E(x * s, cy + y * s, r * s, r * s, k[2], soft=True))
    for x, y, r in [(-18, -22, 23), (-36, 12, 14), (10, -30, 14)]:
        prims.append(E(x * s, cy + y * s, r * s, r * s, k[0], soft=True))
    return prims


def pine(seed):
    rng = random.Random(seed)
    s = rng.uniform(0.88, 1.12)
    prims = [S(34, 8, 54 * s, 17 * s, 10), P([(-6, 3), (6, 3), (6, -36), (-6, -36)], 'trunk_d')]
    for yb, hw, hh in [(-26, 50, 64), (-66, 41, 58), (-102, 31, 56)]:
        yb, hw, hh = yb * s, hw * s * rng.uniform(0.94, 1.06), hh * s
        prims.append(P([(0, yb - hh), (hw, yb), (-hw, yb)], 'pine'))
        prims.append(P([(0, yb - hh), (3, yb), (-hw, yb)], 'pine_l', soft=True))
        prims.append(P([(0, yb - hh), (hw, yb), (hw * 0.42, yb)], 'pine_d', soft=True))
    return prims


def palm(seed):
    rng = random.Random(seed)
    cl = bez3((-2, 2), (-10, -46), (-2, -92), (20, -134), 14)
    widths = [9 - 3.4 * i / 14 for i in range(15)]
    lf, rt = ribbon(cl, widths)
    prims = [S(30, 8, 46, 15, 10), P(lf + rt[::-1], 'trunk')]
    _, mid = ribbon(cl, [w * 0.15 for w in widths])
    prims.append(P(mid + rt[::-1], 'trunk_d', soft=True))
    T = (20, -136)

    def frond(ang, ln, droop, k1, k2):
        a = math.radians(ang)
        d = (math.cos(a), math.sin(a))
        c = bez2(T, (T[0] + d[0] * ln * 0.55, T[1] + d[1] * ln * 0.55 - droop * 0.7),
                 (T[0] + d[0] * ln, T[1] + d[1] * ln + droop), 9)
        w = [1.5 + 11 * math.sin(math.pi * i / 9) ** 0.8 for i in range(10)]
        a_side, b_side = ribbon(c, w)
        up, dn = (a_side, b_side) if d[0] >= 0 else (b_side, a_side)
        return [P(c + dn[::-1], k2), P(c + up[::-1], k1)]

    j = lambda: rng.uniform(-7, 7)
    for ang, ln, dr, k1, k2 in [(-98, 66, 4, 'palm', 'palm_d'), (-140, 76, 24, 'palm', 'palm_d'),
                                (-50, 78, 22, 'palm', 'palm_d'), (-172, 84, 46, 'palm_l', 'palm'),
                                (-12, 86, 46, 'palm_l', 'palm'), (150, 62, 60, 'palm_l', 'palm'),
                                (30, 64, 60, 'palm_l', 'palm')]:
        prims += frond(ang + j(), ln + j(), dr, k1, k2)
    prims += [E(T[0] - 6, T[1] + 8, 6, 6, 'coconut'), E(T[0] + 7, T[1] + 9, 6, 6, 'coconut')]
    return prims if rng.random() < 0.5 else xform(prims, flip=True)


def rock(size, seed):
    rng = random.Random(seed)
    s = {'s': 0.62, 'm': 0.82, 'l': 1.04}[size] * rng.uniform(0.94, 1.06)
    q = lambda pts: [(x * s, y * s) for x, y in pts]
    out = [(-44, 4), (-48, -22), (-28, -50), (4, -60), (34, -46), (48, -18), (40, 6), (4, 14)]
    out = [(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3)) for x, y in out]
    prims = [S(14 * s, 6 * s, 56 * s, 18 * s, 6), P(q(out), 'rock')]
    prims.append(P(q([out[2], out[3], out[4], (10, -30), (-22, -32)]), 'rock_l', soft=True))
    prims.append(P(q([out[4], out[5], out[6], out[7], (10, -30)]), 'rock_d', soft=True))
    if size == 'l':
        prims.append(E(-52 * s, 10 * s, 12 * s, 9 * s, 'rock_l'))
    return prims


def rubble():
    return [S(4, 3, 30, 10), E(-14, -2, 12, 8.5, 'rock'), E(12, 0, 13, 9, 'rock_d'), E(0, -9, 11, 8, 'rock_l'),
            E(24, 8, 6, 4.2, 'rock_l'), E(-26, 8, 5, 3.6, 'rock')]


def bush(seed):
    rng = random.Random(seed)
    k = leafkeys(rng.choice(('a', 'b')))
    prims = [S(18, 5, 44, 14, 8)]
    for x, y, r in [(0, -28, 25), (-24, -18, 20), (24, -18, 20), (0, -12, 23)]:
        prims.append(E(x, y, r, r * 0.92, k[1]))
    prims.append(E(18, -10, 18, 15, k[2], soft=True))
    prims.append(E(-14, -30, 14, 11, k[0], soft=True))
    for x, y in [(-18, -22), (-2, -36), (14, -26), (24, -12), (-6, -12)]:
        prims.append(E(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3), 4.2, 4.2, 'berry'))
    return prims


def stump():
    return [S(10, 4, 30, 10, 6), P([(-15, -18), (-17, 0), (-8, 6), (8, 6), (17, 0), (15, -18)], 'trunk'),
            P([(2, -18), (2, 6), (8, 6), (17, 0), (15, -18)], 'trunk_d', soft=True),
            E(0, -18, 15, 7.5, 'stump_top'), E(0, -18, 7, 3.5, 'trunk')]


# ------------------------------------------------------------------ 짓는 것
def tent(lit=False):
    """2x2칸. 기준점은 네 칸의 한가운데. 입구는 +col 쪽(화면 오른쪽 아래)."""
    h = 112
    A0, A1, B1 = iso(-1, 0.8), iso(1, 0.8), iso(1, -0.8)
    R0, R1 = iso(-1, 0, h), iso(1, 0, h)
    M = lerp(A1, B1, 0.5)
    prims = [E(70, 30, 120, 38, 'shadow', 8, tag='shadow')]
    prims.append(L([R0, iso(-1.55, 0)], 2.5, 'rope'))
    prims.append(P([A0, A1, R1, R0], 'canvas_l'))
    prims.append(P([lerp(A0, R0, .10), lerp(A1, R1, .10), lerp(A1, R1, .27), lerp(A0, R0, .27)], 'stripe'))
    prims.append(P([lerp(A0, R0, .33), lerp(A1, R1, .33), lerp(A1, R1, .37), lerp(A0, R0, .37)], 'stripe'))
    prims.append(P([A1, B1, R1], 'canvas_d'))
    d0, d1, dt = lerp(A1, B1, .27), lerp(A1, B1, .73), lerp(M, R1, .74)
    prims.append(P([d0, d1, dt], 'door_lit' if lit else 'door'))
    prims.append(P([d0, dt, lerp(lerp(A1, B1, .16), R1, .42)], 'canvas'))
    prims.append(L([R0, R1], 3.5, 'canvas_dd'))
    prims.append(L([R1, iso(1.6, 0)], 2.5, 'rope'))
    prims.append(L([lerp(A1, R1, .5), iso(1.25, 1.25)], 2.5, 'rope'))
    prims.append(P([R1, (R1[0], R1[1] - 30), (R1[0] + 22, R1[1] - 22), (R1[0], R1[1] - 14)], 'stripe'))
    prims.append(L([R1, (R1[0], R1[1] - 31)], 3, 'canvas_dd'))
    return prims


FLAMES = [
    ([(0, -62), (9, -47), (17, -30), (16, -15), (8, -5), (-8, -5), (-16, -15), (-18, -28), (-10, -36), (-7, -48)],
     [(0, -38), (8, -25), (8, -13), (0, -7), (-8, -13), (-7, -25)]),
    ([(-5, -66), (6, -50), (18, -34), (17, -15), (8, -5), (-8, -5), (-16, -15), (-19, -30), (-13, -40), (-10, -52)],
     [(-2, -40), (7, -27), (9, -13), (0, -7), (-8, -13), (-8, -26)]),
    ([(5, -60), (12, -44), (16, -28), (15, -15), (8, -5), (-8, -5), (-17, -15), (-16, -30), (-7, -40), (0, -50)],
     [(2, -36), (9, -24), (8, -13), (0, -7), (-8, -13), (-6, -24)]),
]


def campfire(frame=0):
    prims = []
    stones = []
    for k in range(8):
        a = math.radians(k * 45 + 20)
        stones.append((30 * math.cos(a), 15 * math.sin(a), k))
    for x, y, k in stones:
        if y < 0:
            prims.append(E(x, y, 8, 6, 'stone_d' if k % 2 else 'stone'))

    def bar(ang, key):
        a = math.radians(ang)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(-26, -5), (26, -5), (26, 5), (-26, 5)]
        return P([(x * ca - y * sa, (x * sa + y * ca) * 0.6 - 3) for x, y in pts], key)

    prims += [bar(22, 'wood_d'), bar(-22, 'wood')]
    fo, fy = FLAMES[frame % 3]
    prims.append(P(fo, 'fire_o'))
    prims.append(P(fy, 'fire_y', soft=True))
    for x, y, k2 in stones:
        if y >= 0:
            prims.append(E(x, y, 8, 6, 'stone' if k2 % 2 else 'stone_l'))
    return prims


FENCE_DIRS = {1: (32, 16), 2: (-32, -16), 4: (-32, 16), 8: (32, -16)}


def fence(mask):
    """mask 비트: 1=+col 쪽 이웃, 2=-col, 4=+row, 8=-row 에 울타리가 있으면 그쪽으로 가로대를 잇는다."""
    prims = [S(8, 3, 14, 5, 0)]

    def rails(bit):
        dx, dy = FENCE_DIRS[bit]
        out = []
        for hgt in (17, 33):
            out.append(L([(0, -hgt + 2.5), (dx, dy - hgt + 2.5)], 6, 'wood_d'))
            out.append(L([(0, -hgt), (dx, dy - hgt)], 5, 'wood_l'))
        return out

    for bit in (2, 8):
        if mask & bit:
            prims += rails(bit)
    prims += [P([(-5.5, 2), (5.5, 2), (5.5, -44), (-5.5, -44)], 'wood'),
              P([(0.5, 2), (5.5, 2), (5.5, -44), (0.5, -44)], 'wood_d', soft=True),
              P([(-5.5, -44), (0, -50), (5.5, -44)], 'wood_l')]
    for bit in (1, 4):
        if mask & bit:
            prims += rails(bit)
    return prims


# ------------------------------------------------------------------ 도구(손에 든 모양)
def _frame(hand, ang):
    """손 위치와 방향(도, 0=오른쪽, -90=위)에서 (앞쪽 t, 옆쪽 n) 좌표를 화면 좌표로 바꾸는 함수."""
    a = math.radians(ang)
    t, n = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
    return lambda u, v: (hand[0] + t[0] * u + n[0] * v, hand[1] + t[1] * u + n[1] * v)


def tool_prims(kind, hand, ang, k=1.0):
    q = _frame(hand, ang)
    if kind == 'dagger':
        return [L([q(-5 * k, 0), q(2 * k, 0)], 4.5 * k, 'wood_d'), L([q(3 * k, -5 * k), q(3 * k, 5 * k)], 3 * k, 'wood_d'),
                P([q(4 * k, -3.2 * k), q(25 * k, 0), q(4 * k, 3.2 * k)], 'steel')]
    if kind == 'sword':
        return [L([q(-5 * k, 0), q(2 * k, 0)], 4.5 * k, 'wood_d'), L([q(3 * k, -6 * k), q(3 * k, 6 * k)], 3.2 * k, 'gold'),
                P([q(4 * k, -3 * k), q(26 * k, -4 * k), q(38 * k, 0), q(24 * k, 3 * k), q(4 * k, 3 * k)], 'steel')]
    handle = L([q(-7 * k, 0), q(31 * k, 0)], 4.6 * k, 'wood_d')
    if kind == 'axe':
        return [handle, P([q(20 * k, -2 * k), q(31 * k, -2 * k), q(36 * k, 15 * k), q(16 * k, 15 * k)], 'wood_l'),
                L([q(17 * k, 15 * k), q(35 * k, 15 * k)], 2.2 * k, 'wood')]
    if kind == 'pickaxe':
        head = [q(24 * k, -20 * k), q(30 * k, -9 * k), q(32 * k, 0), q(30 * k, 9 * k), q(24 * k, 20 * k),
                q(26.5 * k, 9 * k), q(27.5 * k, 0), q(26.5 * k, -9 * k)]
        return [handle, P(head, 'wood_l')]
    raise KeyError(kind)


# ------------------------------------------------------------------ 캐릭터
# 모든 캐릭터를 같은 뼈대로 그린다: 다리 2, 팔 2, 몸통, 머리, 손에 든 것. 오른쪽을 본다.
#   view 'f' = 앞모습(화면 아래쪽으로 갈 때), 'b' = 뒷모습(화면 위쪽으로 갈 때). 왼쪽은 게임에서 좌우로 뒤집는다.
#   pose 값: legs = (먼 다리 발 x, 먼 발 들림, 가까운 다리 발 x, 가까운 발 들림) — 엉덩이 아래에서 앞(+)/뒤(-)로
#            bob = 위아래(위가 -), lean = 앞뒤 기울기, near/far = 팔 각도(0 아래, 90 앞, 180 위), face, tool, rot(쓰러짐)
def _arm(shoulder, ang, K, sleeve, far=False):
    """ang: 0=아래로 늘어뜨림, 90=앞으로, 180=위로. sleeve: 소매 길이(0~1)."""
    a = math.radians(ang)
    d = (math.sin(a), math.cos(a))
    elbow = (shoulder[0] + d[0] * 22 * sleeve, shoulder[1] + d[1] * 22 * sleeve)
    hand = (shoulder[0] + d[0] * 22, shoulder[1] + d[1] * 22)
    prims = []
    if sleeve < 1:
        prims.append(L([shoulder, hand], 7.5, K['skin_d'] if far else K['skin']))
    prims.append(L([shoulder, elbow], 10, K['shirt_d']))
    prims.append(E(hand[0], hand[1], 4.4, 4.4, K['skin_d'] if far else K['skin']))
    return prims, hand


def _leg(hip, dx, lift, key, shoe):
    hx, hy = hip
    fx, fy = hx + dx, -3.0 - lift
    ddx, ddy = fx - hx, fy - hy
    d = math.hypot(ddx, ddy) or 1.0
    nx, ny = -ddy / d * 4.2, ddx / d * 4.2
    return [P([(hx + nx, hy + ny), (hx - nx, hy - ny), (fx - nx, fy - ny), (fx + nx, fy + ny)], key),
            E(fx + 1.5, fy + 2.2, 6.5, 3.6, shoe)]


def _legs(K, legs, view='f'):
    fdx, flift, ndx, nlift = legs
    far_hip, near_hip = ((-6, -24), (5, -24)) if view == 'f' else ((5, -24), (-6, -24))
    return _leg(far_hip, fdx, flift, K['pants_d'], K['shoe']) + _leg(near_hip, ndx, nlift, K['pants'], K['shoe'])


def rotate(prims, deg, pivot=(0.0, 0.0)):
    """도형 목록을 pivot 둘레로 돌린다(도, 화면에서 시계 방향이 +)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    px, py = pivot
    f = lambda x, y: (px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c)
    out = []
    for p in prims:
        if p[0] == 'P':
            out.append(('P', [f(x, y) for x, y in p[1]], p[2], p[3]))
        elif p[0] == 'E':
            cx, cy, rx, ry, r = p[1]
            nx, ny = f(cx, cy)
            out.append(('E', (nx, ny, rx, ry, r + deg), p[2], p[3]))
        else:
            out.append(('L', [f(x, y) for x, y in p[1]], p[2], p[3], p[4]))
    return out


STAND = (0, 0, 0, 0)
STEP = (-5, 0, 7, 0)                 # 한 발 내딛고 때리는 자세


def pose(**kw):
    p = dict(legs=STAND, bob=0, lean=0, near=8, far=-8, face='open', view='f', tool=None, rot=0)
    p.update(kw)
    return p


# 걷기 4장: walk1(디딤) -> walk3(지나감) -> walk2(디딤) -> walk4(지나감). 가까운 다리가 앞으로 나가면 가까운 팔은 뒤로.
WALK = {'walk1': dict(legs=(-8, 0, 8, 0), bob=0, near=-28, far=26),
        'walk3': dict(legs=(2, 5, -2, 0), bob=-2, near=-6, far=6),
        'walk2': dict(legs=(9, 0, -10, 0), bob=0, near=28, far=-26),
        'walk4': dict(legs=(-1, 0, 2, 5), bob=-2, near=6, far=-6)}


def _eyes(hx, hy, face, spots, size=(2.1, 2.8)):
    out = []
    for i, (ex, ey) in enumerate(spots):
        x, y = hx + ex, hy + ey
        if face in ('open', 'bite'):
            out.append(E(x, y, size[0], size[1], 'ink'))
        elif face == 'blink':
            out.append(L([(x - 2.6, y + 0.4), (x, y + 1.6), (x + 2.6, y + 0.4)], 1.8, 'ink'))
        elif face == 'hurt':
            dd = 1 if i == 0 else -1
            out.append(L([(x - 2.6 * dd, y - 2.4), (x + 1.4 * dd, y), (x - 2.6 * dd, y + 2.4)], 1.8, 'ink'))
        elif face == 'ko':
            out += [L([(x - 2.4, y - 2.4), (x + 2.4, y + 2.4)], 1.7, 'ink'), L([(x + 2.4, y - 2.4), (x - 2.4, y + 2.4)], 1.7, 'ink')]
    return out


def _mouth(hx, hy, face, x=2.0, y=11.0):
    if face in ('hurt', 'bite'):
        return [E(hx + x, hy + y + 0.5, 3.2, 2.6, 'ink')]
    if face == 'ko':
        return [L([(hx + x - 4, hy + y + 1), (hx + x - 1.5, hy + y - 0.5), (hx + x + 1.5, hy + y + 1), (hx + x + 4, hy + y - 0.5)], 1.6, 'ink')]
    return [L([(hx + x - 5, hy + y), (hx + x, hy + y + 2), (hx + x + 5, hy + y)], 2, 'ink')]


def _back_hair(hx, hy, key):
    return P([(hx - 18, hy + 5), (hx - 18, hy - 9), (hx - 11, hy - 18), (hx + 1, hy - 20), (hx + 12, hy - 17), (hx + 18, hy - 8),
              (hx + 18, hy + 5), (hx + 11, hy + 10), (hx + 1, hy + 12), (hx - 10, hy + 10)], key)


# ---- 주인공
SURVIVOR = dict(skin='skin', skin_d='skin_d', shirt='tee', shirt_d='tee_d', pants='pants', pants_d='pants_d', shoe='shoe')
GUN_LEN = 78                                         # 주인공 총 길이(해적 총은 92)


def _player_head(hx, hy, view, face):
    if view == 'b':
        return [E(hx, hy, 17, 16.5, 'skin'), E(hx - 17, hy + 3, 3.6, 4.6, 'skin_d'), _back_hair(hx, hy, 'hair'),
                L([(hx - 5, hy - 9), (hx + 1, hy - 4), (hx + 7, hy - 8)], 1.6, 'ink', op=0.3)]
    out = [E(hx, hy, 17, 16.5, 'skin'),
           P([(hx - 18, hy), (hx - 18, hy - 10), (hx - 11, hy - 18), (hx + 1, hy - 20), (hx + 12, hy - 17), (hx + 18, hy - 8),
              (hx + 18, hy), (hx + 12, hy - 6), (hx + 3, hy - 8), (hx - 7, hy - 5)], 'hair')]
    out += _eyes(hx, hy, face, ((-5, 3), (8, 3)))
    out += [E(hx - 11, hy + 9, 3.4, 2.2, 'blush', op=0.7), E(hx + 14, hy + 9, 3.4, 2.2, 'blush', op=0.7)]
    if face in ('hurt', 'ko'):
        out += _mouth(hx, hy, face, 2.5, 11)
    return out


def _player_torso(bx, by, view):
    out = [E(bx, -40 + by, 16, 23, 'tee'), E(5 + bx, -36 + by, 9, 17, 'tee_d', soft=True)]
    if view == 'f':
        out.append(L([(-6 + bx, -59 + by), (1 + bx, -56 + by), (8 + bx, -59 + by)], 2.2, 'tee_d'))
    else:
        out.append(L([(-7 + bx, -58 + by), (8 + bx, -58 + by)], 2.2, 'tee_d', op=0.6))
    return out


# ---- 좀비
ZOMBIE = dict(skin='zskin', skin_d='zskin_d', shirt='zshirt', shirt_d='zshirt_d', pants='zpants', pants_d='zpants', shoe='ink')


def _zombie_head(hx, hy, view, face):
    tufts = [P([(hx - 13, hy - 12), (hx - 10, hy - 24), (hx - 4, hy - 14)], 'zhair'),
             P([(hx - 3, hy - 15), (hx + 2, hy - 27), (hx + 7, hy - 14)], 'zhair'),
             P([(hx + 7, hy - 13), (hx + 14, hy - 22), (hx + 15, hy - 9)], 'zhair')]
    if view == 'b':
        return [E(hx, hy, 17, 16.5, 'zskin'), E(hx + 4, hy + 2, 12, 11, 'zskin_d', soft=True), E(hx - 17, hy + 3, 3.6, 4.6, 'zskin_d')] + tufts
    out = [E(hx, hy, 17, 16.5, 'zskin')] + tufts
    if face in ('open', 'bite'):
        out += [E(hx - 5, hy + 1, 5, 5, 'white'), E(hx - 4, hy + 1.5, 1.8, 1.8, 'ink'), E(hx + 9, hy + 2, 3.6, 3.6, 'white'),
                E(hx + 10, hy + 2.5, 1.4, 1.4, 'ink')]
    else:
        out += [E(hx - 5, hy + 1, 5, 5, 'white'), E(hx + 9, hy + 2, 3.6, 3.6, 'white')]
        out += _eyes(hx, hy, face, ((-5, 1), (9, 2)))
    out += _mouth(hx, hy, face, 2, 11)
    return out


def _zombie_torso(bx, by, view):
    out = [E(bx, -40 + by, 16, 23, 'zshirt'), E(5 + bx, -36 + by, 9, 17, 'zshirt_d', soft=True)]
    if view == 'f':
        out.append(P([(-9 + bx, -40 + by), (-1 + bx, -40 + by), (-1 + bx, -32 + by), (-9 + bx, -32 + by)], 'zpatch'))
    else:
        out.append(P([(1 + bx, -48 + by), (9 + bx, -46 + by), (8 + bx, -39 + by), (0 + bx, -41 + by)], 'zpatch'))
    return out


# ---- 해적(1 선장, 2 선원, 3 총잡이)
PIRATE = {
    1: dict(skin='pskin', skin_d='pskin', shirt='pcoat', shirt_d='pcoat_d', pants='ppants', pants_d='ppants', shoe='ink'),
    2: dict(skin='pskin', skin_d='pskin', shirt='pwhite', shirt_d='pstripe', pants='ppants', pants_d='ppants', shoe='ink'),
}
GUNNER = dict(skin='pskin', skin_d='pskin', shirt='pgun', shirt_d='pgun_d', pants='ppants', pants_d='ppants', shoe='ink')
PIRATE_GUN_LEN = 92


def _captain_head(hx, hy, view, face):
    hat = [P([(hx - 28, hy - 8), (hx - 14, hy - 24), (hx, hy - 29), (hx + 14, hy - 24), (hx + 28, hy - 8), (hx + 14, hy - 13),
              (hx, hy - 15), (hx - 14, hy - 13)], 'hat')]
    if view == 'b':
        return [E(hx, hy, 17, 16.5, 'pskin'), P([(hx - 17, hy - 6), (hx + 17, hy - 6), (hx + 16, hy + 9), (hx + 6, hy + 14), (hx - 7, hy + 14),
                                                (hx - 16, hy + 9)], 'beard')] + hat
    out = [E(hx, hy, 17, 16.5, 'pskin'),
           P([(hx - 14, hy + 6), (hx - 11, hy + 16), (hx, hy + 19), (hx + 11, hy + 16), (hx + 15, hy + 6), (hx + 7, hy + 10),
              (hx, hy + 11), (hx - 7, hy + 10)], 'beard')]
    out += _eyes(hx, hy, face, ((8, 2),))
    out += [E(hx - 5, hy + 2, 3.6, 3.6, 'hat'), L([(hx - 17, hy - 4), (hx - 5, hy + 2), (hx + 17, hy - 6)], 1.6, 'hat')]
    if face in ('hurt', 'ko'):
        out += _mouth(hx, hy, face, 3, 10)
    return out + hat + [E(hx, hy - 21, 3.4, 3.4, 'white')]


def _captain_torso(bx, by, view):
    out = [E(bx, -40 + by, 17, 23, 'pcoat'), E(5 + bx, -36 + by, 9, 17, 'pcoat_d', soft=True)]
    if view == 'f':
        out.append(L([(-15 + bx, -33 + by), (bx, -30 + by), (16 + bx, -33 + by)], 4, 'gold'))
    else:
        out += [L([(-15 + bx, -33 + by), (16 + bx, -33 + by)], 4, 'gold'), L([(bx + 1, -29 + by), (bx + 2, -18 + by)], 2.2, 'pcoat_d')]
    return out


def _crew_head(hx, hy, view, face):
    if view == 'b':
        return [E(hx, hy, 17, 16.5, 'pskin'), E(hx - 17, hy + 3, 3.6, 4.6, 'pskin'),
                P([(hx - 18, hy + 1), (hx - 17, hy - 12), (hx - 9, hy - 18), (hx + 2, hy - 19), (hx + 12, hy - 16), (hx + 18, hy - 7),
                   (hx + 18, hy + 1), (hx + 6, hy + 2), (hx - 6, hy + 3)], 'bandana'),
                P([(hx - 4, hy + 1), (hx - 12, hy + 12), (hx - 5, hy + 14), (hx, hy + 3)], 'bandana'),
                P([(hx + 1, hy + 1), (hx + 7, hy + 13), (hx + 12, hy + 9), (hx + 5, hy + 1)], 'bandana')]
    out = [E(hx, hy, 17, 16.5, 'pskin'),
           P([(hx - 18, hy - 1), (hx - 17, hy - 12), (hx - 9, hy - 18), (hx + 2, hy - 19), (hx + 12, hy - 16), (hx + 18, hy - 7),
              (hx + 18, hy - 2), (hx + 7, hy - 6), (hx - 7, hy - 5)], 'bandana'),
           P([(hx - 18, hy - 4), (hx - 28, hy), (hx - 24, hy + 6), (hx - 17, hy)], 'bandana')]
    out += _eyes(hx, hy, face, ((-5, 3), (8, 3)))
    return out + _mouth(hx, hy, face, 2, 11)


def _crew_torso(bx, by, view):
    out = [E(bx, -40 + by, 16, 23, 'pwhite')]
    for y in (-54, -44, -34, -24):
        w = 16 * math.sqrt(max(0.0, 1 - ((y + 40) / 23.0) ** 2)) - 1.5
        out.append(L([(-w + bx, y + by), (w + bx, y + by)], 4.2, 'pstripe'))
    return out


def _gunner_head(hx, hy, view, face):
    hat = [E(hx, hy - 11, 29, 7.5, 'hatb', -5),
           P([(hx - 15, hy - 12), (hx - 13, hy - 25), (hx - 4, hy - 31), (hx + 8, hy - 30), (hx + 15, hy - 22), (hx + 15, hy - 13)], 'hatb'),
           L([(hx - 15, hy - 15), (hx + 15, hy - 16)], 3.4, 'rust')]
    if view == 'b':
        return [E(hx, hy, 17, 16.5, 'pskin'), P([(hx - 17, hy - 6), (hx + 17, hy - 6), (hx + 15, hy + 10), (hx, hy + 13), (hx - 15, hy + 10)],
                                                'beard'), L([(hx - 16, hy - 4), (hx + 17, hy - 2)], 1.6, 'patch')] + hat
    out = [E(hx, hy, 17, 16.5, 'pskin')]
    out += _eyes(hx, hy, face, ((-5, 3),))
    out += [E(hx + 8, hy + 2, 4.6, 4.2, 'patch'), L([(hx - 16, hy - 5), (hx + 8, hy + 2), (hx + 17, hy - 3)], 1.6, 'patch')]
    out += _mouth(hx, hy, face, 3, 11.5)
    out.append(P([(hx - 15, hy + 6), (hx - 9, hy + 15), (hx + 1, hy + 18), (hx + 11, hy + 15), (hx + 15, hy + 7), (hx + 8, hy + 10),
                  (hx, hy + 10.5), (hx - 8, hy + 10)], 'beard', op=0.55))
    return out + hat


def _gunner_torso(bx, by, view):
    out = [E(bx, -40 + by, 17, 23, 'pgun'), E(5 + bx, -36 + by, 9, 17, 'pgun_d', soft=True)]
    if view == 'f':
        out += [P([(bx - 6, -61 + by), (bx + 7, -61 + by), (bx + 1, -50 + by)], 'pwhite'),
                L([(bx - 13, -50 + by), (bx + 14, -26 + by)], 4.2, 'leather')]
    else:
        out.append(L([(bx + 13, -50 + by), (bx - 13, -27 + by)], 4.2, 'leather'))
    out += [L([(bx - 16, -27 + by), (bx + 16, -27 + by)], 4.4, 'ink'),
            P([(bx + 9, -24 + by), (bx + 19, -20 + by), (bx + 21, -13 + by), (bx + 16, -15 + by), (bx + 9, -19 + by)], 'canvas_l')]
    if view == 'f':
        out.append(E(bx + 3, -27 + by, 3.2, 2.6, 'gold'))
    return out


# ---- 손에 든 것
def _held(p, hand, gun_len):
    """돌려주는 값: (도형, 그리는 층) 층: under = 몸 뒤(뒷모습), mid = 몸과 머리 사이, over = 머리 위"""
    t, view = p['tool'], p['view']
    if not t:
        return [], 'over'
    kind = t[0]
    front_or_under = 'over' if view == 'f' else 'under'
    if kind in ('dagger', 'axe', 'pickaxe', 'sword'):
        return tool_prims(kind, hand, t[1]), front_or_under
    if kind == 'gun':
        bx, by = t[1]
        return musket((bx + p['lean'], by + p['bob']), t[2], gun_len)[0], front_or_under
    if kind == 'sling':                      # 개머리를 손에 쥐고 총신을 어깨에 걸침
        return musket(hand, t[1], gun_len)[0], 'mid'
    if kind == 'back':                       # 등에 비스듬히 멘 총(뒷모습)
        bx, by = t[1]
        return musket((bx + p['lean'], by + p['bob']), t[2], gun_len)[0], 'over'
    if kind == 'reload':                     # 총을 세워 들고 꽂을대로 장전
        bx, by = t[1]
        prims, tip = musket((bx + p['lean'], by + p['bob']), t[2], gun_len)
        a = math.radians(t[2])
        d = (math.cos(a), math.sin(a))
        prims.append(L([(tip[0] - d[0] * 8, tip[1] - d[1] * 8), (tip[0] + d[0] * t[3], tip[1] + d[1] * t[3])], 2.2, 'metal_l'))
        return prims, 'over'
    raise KeyError(kind)


def figure(kit, p):
    K = kit['K']
    view, bob, lean = p['view'], p['bob'], p['lean']
    near_sh, far_sh = ((15 + lean, -50 + bob), (-14 + lean, -50 + bob)) if view == 'f' else ((-14 + lean, -50 + bob), (15 + lean, -50 + bob))
    far_arm, far_hand = _arm(far_sh, p['far'], K, kit['sleeve'], far=True)
    near_arm, near_hand = _arm(near_sh, p['near'], K, kit['sleeve'])
    held, layer = _held(p, near_hand if view == 'f' else far_hand, kit.get('gun', 0))
    body = far_arm + (held if layer == 'under' else []) + _legs(K, p['legs'], view) + kit['torso'](lean * 0.5, bob, view) + \
        (held if layer == 'mid' else []) + kit['head'](1 + lean, -74 + bob, view, p['face']) + (held if layer == 'over' else []) + near_arm
    if not p['rot']:
        return [S(4, 2, 22, 8)] + body
    body = rotate(body, p['rot'])
    x0, y0, x1, y1 = bbox(body, 0)
    body = xform(body, 0, 4 - y1)                       # 쓰러진 몸이 땅에 닿게
    cx = (x0 + x1) / 2
    return [S(cx + 6, 3, (x1 - x0) * 0.5 + 6, 9)] + body


def muzzle_of(kit, p):
    """총구 끝(마스터 좌표, 발 기준, 오른쪽을 볼 때)"""
    bx, by = p['tool'][1]
    return musket((bx + p['lean'], by + p['bob']), p['tool'][2], kit['gun'])[1]


KITS = {
    'player': dict(K=SURVIVOR, sleeve=0.42, head=_player_head, torso=_player_torso, gun=GUN_LEN),
    'zombie': dict(K=ZOMBIE, sleeve=0.8, head=_zombie_head, torso=_zombie_torso),
    'captain': dict(K=PIRATE[1], sleeve=1.0, head=_captain_head, torso=_captain_torso),
    'crew': dict(K=PIRATE[2], sleeve=0.42, head=_crew_head, torso=_crew_torso),
    'gunner': dict(K=GUNNER, sleeve=1.0, head=_gunner_head, torso=_gunner_torso, gun=PIRATE_GUN_LEN),
}


def _with_back(poses, names, **override):
    """앞모습 자세를 뒷모습으로 복사(b + 이름)."""
    for n in names:
        q = dict(poses[n])
        q.update(view='b', **override)
        poses['b' + n] = q


def _swing(tool, up, hit, follow, view='f'):
    """도구 휘두르기 3장: 들어 올림, 내리침, 따라 내려감. 앞모습은 가까운 팔, 뒷모습은 먼 팔이 도구를 든다."""
    arm = 'near' if view == 'f' else 'far'
    other = 'far' if view == 'f' else 'near'
    (a1, t1), (a2, t2), (a3, t3) = up, hit, follow
    return [pose(view=view, tool=(tool, t1), **{arm: a1, other: -14 if view == 'f' else -10}),
            pose(view=view, legs=STEP, bob=-1, lean=3, tool=(tool, t2), **{arm: a2, other: -20 if view == 'f' else -16}),
            pose(view=view, legs=STEP, bob=1, lean=4, tool=(tool, t3), **{arm: a3, other: -24 if view == 'f' else -18})]


# 프레임 순서: 예전부터 있던 이름이 앞(번호가 바뀌지 않게), 새 이름은 뒤에 붙인다.
POSES = {'idle': pose(), 'walk1': pose(**WALK['walk1']), 'walk2': pose(**WALK['walk2'])}
d1, d2, d3 = _swing('dagger', (58, -62), (92, 4), (62, 48))
x1, x2, x3 = _swing('axe', (152, -118), (78, 34), (44, 80))
k1, k2, k3 = _swing('pickaxe', (152, -118), (78, 34), (44, 80))
d2.update(bob=-1, lean=3)
d3.update(bob=0, lean=2)
POSES.update(dagger1=d1, dagger2=d2, axe1=x1, axe2=x2, pick1=k1, pick2=k2,
             gun1=pose(near=107, far=95, tool=('gun', (-4, -57), -1)),
             gun2=pose(legs=(-3, 0, 2, 0), bob=-1, lean=-2, near=113, far=95, tool=('gun', (-8, -56), -10)),
             idle2=pose(bob=-1, near=11, far=-11), blink=pose(face='blink'),
             walk3=pose(**WALK['walk3']), walk4=pose(**WALK['walk4']),
             dagger3=d3, axe3=x3, pick3=k3,
             hurt=pose(bob=1, lean=-3, near=34, far=-36, face='hurt'),
             down=pose(near=160, far=150, face='ko', rot=-80))
_with_back(POSES, ['idle', 'idle2'])
POSES['bidle'], POSES['bidle2'] = POSES.pop('bidle'), POSES.pop('bidle2')
for n in ('walk1', 'walk2', 'walk3', 'walk4'):
    POSES['b' + n] = pose(view='b', **WALK[n])
for name, tool, key in (('dagger', 'dagger', 'bdagger'), ('axe', 'axe', 'baxe'), ('pick', 'pickaxe', 'bpick')):
    big = tool != 'dagger'
    s = _swing(tool, (176 if big else 172, -128 if big else -120), (128 if big else 132, -40 if big else -44),
               (88 if big else 96, 24 if big else 14), view='b')
    for i, q in enumerate(s, 1):
        POSES[f'{key}{i}'] = q
POSES['bgun1'] = pose(view='b', near=96, far=118, tool=('gun', (0, -60), -34))
POSES['bgun2'] = pose(view='b', lean=-2, bob=-1, near=100, far=122, tool=('gun', (-3, -59), -42))


def survivor(name='idle'):
    return figure(KITS['player'], POSES[name])


def survivor_muzzle(name):
    return muzzle_of(KITS['player'], POSES[name])


# 좀비: 팔을 앞으로 뻗고 다리를 끌며 걷는다
ZPOSES = {
    'walk1': pose(legs=(-5, 0, 6, 0), near=86, far=78),
    'walk2': pose(legs=(6, 0, -7, 0), near=94, far=86),
    'attack': pose(legs=STEP, lean=5, near=104, far=96, face='bite'),
    'walk3': pose(legs=(1, 3, -1, 0), bob=-1, near=90, far=82),
    'walk4': pose(legs=(-1, 0, 1, 3), bob=-1, near=90, far=82),
    'idle': pose(near=72, far=64),
    'idle2': pose(bob=1, lean=1, near=78, far=68),
    'attack0': pose(lean=-3, near=158, far=148),
    'hurt': pose(bob=1, lean=-3, near=60, far=50, face='hurt'),
    'die1': pose(lean=-4, near=150, far=138, face='ko'),
    'die2': pose(near=150, far=138, face='ko', rot=-42),
    'die3': pose(near=160, far=150, face='ko', rot=-80),
    'rise1': 60, 'rise2': 34, 'rise3': 10,          # 땅에서 올라오기: 땅 아래로 묻힌 깊이
}
for n in ('walk1', 'walk2', 'walk3', 'walk4', 'attack0', 'attack'):
    ZPOSES['b' + n] = dict(ZPOSES[n], view='b')
ZPOSES['battack0'], ZPOSES['battack'] = ZPOSES.pop('battack0'), ZPOSES.pop('battack')


def _mound(k):
    outer, inner = (27 * k, 9.5 * k), (20 * k, 6.5 * k)
    ring = lambda a0, a1, n=14: [(math.cos(math.radians(a0 + (a1 - a0) * i / n)), math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    front = [(outer[0] * c, outer[1] * s) for c, s in ring(0, 180)] + [(inner[0] * c, inner[1] * s) for c, s in ring(180, 0)]
    under = [E(0, 0, outer[0], outer[1], 'dirt_l'), E(0, 0.5, inner[0], inner[1], 'dirt_dd')]
    over = [P(front, 'dirt'), E(-25 * k, 4, 6.5, 4.6, 'dirt_d'), E(23 * k, 5, 7, 5, 'dirt'), E(-9 * k, 9 * k + 1, 5, 3.4, 'dirt_l'),
            E(12 * k, 9 * k + 1, 4, 3, 'dirt_d')]
    return under, over


def zombie(name='walk1'):
    p = ZPOSES[name]
    if isinstance(p, (int, float)):               # 땅에서 올라오는 프레임: 층 세 장과 자르는 높이
        body = [q for q in figure(KITS['zombie'], pose(near=166, far=156)) if q[-1].get('tag') != 'shadow']
        under, over = _mound({60: 1.0, 34: 0.95, 10: 0.85}[p])
        return dict(under=under, body=xform(body, 0, p), over=over, clip=1.0)
    return figure(KITS['zombie'], p)


# 해적(선장, 선원): 칼을 든다
PPOSES = {'walk1': pose(**dict(WALK['walk1'], near=40, far=-20), tool=('sword', -70)),
          'walk2': pose(**dict(WALK['walk2'], near=52, far=16), tool=('sword', -62))}
pa0, pa1, pa2 = _swing('sword', (150, -140), (92, 6), (50, 64))
PPOSES.update(attack=pa1, walk3=pose(**dict(WALK['walk3'], near=46, far=-2), tool=('sword', -66)),
              walk4=pose(**dict(WALK['walk4'], near=46, far=-2), tool=('sword', -66)),
              idle=pose(near=30, far=-8, tool=('sword', 64)), idle2=pose(bob=-1, near=34, far=-10, tool=('sword', 60)),
              attack0=pa0, attack2=pa2,
              hurt=pose(bob=1, lean=-3, near=40, far=-36, face='hurt', tool=('sword', 70)),
              die1=pose(lean=-4, near=150, far=140, face='ko'),
              die2=pose(near=150, far=140, face='ko', rot=-42),
              die3=pose(near=160, far=150, face='ko', rot=-80))
for n in ('walk1', 'walk2', 'walk3', 'walk4'):
    q = dict(PPOSES[n])
    q.update(view='b', near=q['far'], far=q['near'])
    PPOSES['b' + n] = q
pb0, pb1, _ = _swing('sword', (176, -128), (128, -40), (88, 24), view='b')
PPOSES['battack0'], PPOSES['battack'] = pb0, pb1


def pirate(var=1, name='walk1'):
    return figure(KITS['captain' if var == 1 else 'crew'], PPOSES[name])


# 총잡이 해적
GPOSES = {'walk1': pose(**dict(WALK['walk1'], near=52, far=-24), tool=('sling', -148)),
          'walk2': pose(**dict(WALK['walk2'], near=62, far=18), tool=('sling', -146)),
          'aim': pose(near=107, far=95, tool=('gun', (-4, -57), -1)),
          'shoot': pose(legs=(-3, 0, 2, 0), bob=-1, lean=-2, near=113, far=95, tool=('gun', (-8, -56), -10)),
          'walk3': pose(**dict(WALK['walk3'], near=56, far=-4), tool=('sling', -147)),
          'walk4': pose(**dict(WALK['walk4'], near=56, far=-4), tool=('sling', -147)),
          'idle': pose(near=30, far=-10, tool=('sling', -140)),
          'idle2': pose(bob=-1, near=33, far=-12, tool=('sling', -140)),
          'reload1': pose(near=158, far=40, tool=('reload', (-2, -40), -50, 26)),
          'reload2': pose(bob=1, near=150, far=46, tool=('reload', (-2, -40), -50, 9)),
          'hurt': pose(bob=1, lean=-3, near=40, far=-36, face='hurt', tool=('sling', -130)),
          'die1': pose(lean=-4, near=150, far=140, face='ko'),
          'die2': pose(near=150, far=140, face='ko', rot=-42),
          'die3': pose(near=160, far=150, face='ko', rot=-80)}
for n in ('walk1', 'walk2', 'walk3', 'walk4'):
    q = dict(WALK[n])
    GPOSES['b' + n] = pose(view='b', tool=('back', (12, -26), -126), **q)


def gunner(name='walk1'):
    return figure(KITS['gunner'], GPOSES[name])


def gunner_muzzle(name):
    return muzzle_of(KITS['gunner'], GPOSES[name])


# ------------------------------------------------------------------ 배
def hull_points(length, x0, wmax, hd, sheer, n=16):
    dl, dr, wl = [], [], []
    for i in range(n + 1):
        t = i / n
        x = x0 + length * t
        w = wmax * min(1.0, (t + 0.03) * 5.5) ** 0.5 * max(0.0, 1 - t ** 3) ** 0.6
        z = hd + sheer * (2 * t - 1) ** 2
        dl.append(iso(x, w, z))
        dr.append(iso(x, -w, z))
        xw = x - 0.07 * length * t ** 2.4 + 0.03 * length * (1 - t) ** 2
        wl.append(iso(xw, w * 0.82, 0))
    return dl, dr, wl


def ship():
    dl, dr, wl = hull_points(3.7, -1.75, 0.66, 46, 16)
    up = lambda pts, h: [(x, y - h) for x, y in pts]
    prims = [E(30, 30, 218, 60, 'shadow', 26.5, tag='shadow')]
    prims.append(L([(x - 3, y + 4) for x, y in wl], 7, 'foam', ground=True))
    prims.append(P(up(dr, 12) + dr[::-1], 'hull_d'))
    prims.append(P(dl + wl[::-1], 'hull'))
    band0 = [lerp(w, d, 0.52) for w, d in zip(wl, dl)]
    band1 = [lerp(w, d, 0.74) for w, d in zip(wl, dl)]
    prims.append(P(band1 + band0[::-1], 'hull_l'))
    prims.append(L([lerp(w, d, 0.2) for w, d in zip(wl, dl)][1:-1], 3, 'hull_d'))
    prims.append(P(dl + dr[::-1], 'deck'))
    cabin = [iso(-1.55, 0.36, 50), iso(-0.85, 0.36, 50), iso(-0.85, -0.36, 50), iso(-1.55, -0.36, 50)]
    prims.append(P([iso(-1.55, 0.36, 50), iso(-0.85, 0.36, 50), iso(-0.85, 0.36, 86), iso(-1.55, 0.36, 86)], 'hull_l'))
    prims.append(P([iso(-0.85, 0.36, 50), iso(-0.85, -0.36, 50), iso(-0.85, -0.36, 86), iso(-0.85, 0.36, 86)], 'hull'))
    prims.append(P([(x, y - 36) for x, y in cabin], 'deck'))
    prims.append(P([iso(-0.85, 0.2, 60), iso(-0.85, -0.2, 60), iso(-0.85, -0.2, 78), iso(-0.85, 0.2, 78)], 'lamp'))

    def mast(xt, H, yw, panels):
        base = iso(xt, 0, 52)
        out = [L([base, (base[0], base[1] - H)], 7, 'mast')]
        for z0, z1, k in panels:
            b = 14 * k
            TL, TR = iso(xt, yw * k, 52 + z1), iso(xt, -yw * k, 52 + z1)
            BL, BR = iso(xt, yw * k * 1.06, 52 + z0), iso(xt, -yw * k * 1.06, 52 + z0)
            left = bez2(TL, (lerp(TL, BL, .5)[0] + b, lerp(TL, BL, .5)[1] + b * 0.5), BL, 6)
            right = bez2(TR, (lerp(TR, BR, .5)[0] + b, lerp(TR, BR, .5)[1] + b * 0.5), BR, 6)
            for j, key in enumerate(('sail_l', 'sail', 'sail_d')):
                a0 = [lerp(l, r, j / 3) for l, r in zip(left, right)]
                a1 = [lerp(l, r, (j + 1) / 3) for l, r in zip(left, right)]
                out.append(P(a0 + a1[::-1], key))
            out.append(L([TL, TR], 5, 'mast'))
        return out, (base[0], base[1] - H)

    m1, _ = mast(-0.35, 262, 0.98, [(34, 126, 1.0), (140, 216, 0.74)])
    m2, top = mast(0.95, 232, 0.9, [(30, 112, 0.94), (124, 190, 0.7)])
    prims += m1 + m2
    prims.append(P([top, (top[0] + 46, top[1] + 8), (top[0] + 40, top[1] + 30), (top[0], top[1] + 24)], 'flag'))
    prims.append(E(top[0] + 21, top[1] + 15, 6, 6, 'white'))
    bow = iso(1.95, 0, 62)
    prims.append(L([iso(1.6, 0, 58), (bow[0] + 44, bow[1] - 4)], 6, 'mast'))
    prims.append(P(up(dl, 12) + dl[::-1], 'hull_l'))
    return prims


SHIP_LAMP = iso(-0.85, 0.0, 69)      # 선실 창(밤에 불빛을 둘 자리), 마스터 좌표


def rowboat():
    dl, dr, wl = hull_points(1.25, -0.6, 0.3, 15, 4, 10)
    up = lambda pts, h: [(x, y - h) for x, y in pts]
    prims = [E(8, 9, 70, 20, 'shadow', 26.5, tag='shadow')]
    prims.append(L([(x - 2, y + 3) for x, y in wl], 5, 'foam', ground=True))
    prims.append(P(up(dr, 6) + dr[::-1], 'hull_d'))
    prims.append(P(dl + wl[::-1], 'hull'))
    prims.append(P(dl + dr[::-1], 'deck'))
    prims.append(L([iso(-0.1, 0.3, 17), iso(-0.1, -0.3, 17)], 6, 'hull_l'))
    prims.append(P(up(dl, 6) + dl[::-1], 'hull_l'))
    prims.append(L([iso(0.1, 0.25, 20), iso(0.5, 0.95, 6)], 3.5, 'mast'))
    return prims


# ------------------------------------------------------------------ 아이콘(가운데 (0,0), 대략 ±52 안)
def _log(x0, y0, x1, y1, r=13):
    return [L([(x0, y0), (x1, y1)], r * 2, 'wood'), L([(x0 + 4, y0 - r * 0.45), (x1 - 8, y1 - r * 0.45)], 4, 'wood_l'),
            E(x1, y1, r * 0.7, r, 'wood_l', -15), E(x1, y1, r * 0.32, r * 0.5, 'wood', -15)]


def heart(key):
    pts = bez3((0, 34), (-44, 6), (-40, -32), (-17, -32)) + bez3((-17, -32), (-7, -32), (-2, -26), (0, -20))[1:] + \
        bez3((0, -20), (2, -26), (7, -32), (17, -32))[1:] + bez3((17, -32), (40, -32), (44, 6), (0, 34))[1:]
    return [P(pts, key)]


def star(R, r, n=5, rot=-90):
    return [(( R if i % 2 == 0 else r) * math.cos(math.radians(rot + i * 180 / n)),
             (R if i % 2 == 0 else r) * math.sin(math.radians(rot + i * 180 / n))) for i in range(n * 2)]


def crescent(R=36.0, r=31.0, off=(15.0, -11.0), n=72):
    """초승달: 큰 원에서 비껴 놓은 작은 원을 뺀 모양."""
    a0 = math.atan2(off[1], off[0])
    ang = [a0 + 2 * math.pi * i / n for i in range(n + 1)]
    outer = [(R * math.cos(t), R * math.sin(t)) for t in ang]
    outer = [p for p in outer if math.hypot(p[0] - off[0], p[1] - off[1]) >= r]
    inner = [(off[0] + r * math.cos(t), off[1] + r * math.sin(t)) for t in ang]
    inner = [p for p in inner if math.hypot(p[0], p[1]) <= R]
    return [(x - 6, y + 4) for x, y in outer + inner[::-1]]


def icon(name):
    if name == 'wood':
        return _log(-34, -6, 26, -24) + _log(-30, 22, 30, 4)
    if name == 'stone':
        return [p for p in xform(rock('l', 5), 2, 28, 0.9) if p[-1].get('tag') != 'shadow']
    if name == 'heart':
        return heart('heart') + [E(-18, -14, 8, 5.5, 'heart_l', -30, soft=True)]
    if name == 'heart_empty':
        return heart('heart_e')
    if name == 'dagger':
        return tool_prims('dagger', (-22, 22), -45, 2.4)
    if name == 'axe':
        return tool_prims('axe', (-22, 30), -52, 2.1)
    if name == 'pickaxe':
        return tool_prims('pickaxe', (-20, 32), -58, 2.0)
    if name == 'tshirt':
        body = [(-22, -30), (-9, -36), (0, -30), (9, -36), (22, -30), (44, -14), (33, 2), (22, -5), (22, 38), (-22, 38), (-22, -5), (-33, 2), (-44, -14)]
        return [P(body, 'tee'), P([(8, -30), (22, -30), (22, 38), (10, 38)], 'tee_d', soft=True),
                L([(-9, -35), (0, -27), (9, -35)], 3, 'tee_d')]
    if name == 'fence':
        return xform([p for p in fence(1) if p[-1].get('tag') != 'shadow'], -30, 14, 1.25) + \
            xform([p for p in fence(2) if p[-1].get('tag') != 'shadow'], 10, 34, 1.25)
    if name == 'tent':
        return [p for p in xform(tent(), -2, 18, 0.42) if p[-1].get('tag') != 'shadow']
    if name == 'campfire':
        return xform(campfire(0), 0, 34, 1.25)
    if name == 'sun':
        prims = []
        for a in range(0, 360, 45):
            x, y = math.cos(math.radians(a)), math.sin(math.radians(a))
            prims.append(L([(x * 34, y * 34), (x * 46, y * 46)], 7, 'sun_d'))
        return prims + [E(0, 0, 25, 25, 'sun')]
    if name == 'moon':
        return [P(crescent(), 'moon'), P([(x + 26, y - 24) for x, y in star(8, 3.4)], 'moon'),
                P([(x + 38, y + 2) for x, y in star(5.5, 2.4)], 'moon')]
    if name == 'craft':      # 망치
        q = _frame((-24, 30), -50)
        return [L([q(-6, 0), q(58, 0)], 9, 'wood_d'),
                P([q(46, -22), q(66, -22), q(66, 20), (q(46, 20))], 'rock'), P([q(46, 6), q(66, 6), q(66, 20), q(46, 20)], 'rock_d', soft=True)]
    if name == 'remove':
        return [E(0, 0, 40, 40, 'heart'), L([(-16, -16), (16, 16)], 10, 'white'), L([(16, -16), (-16, 16)], 10, 'white')]
    if name == 'sleep':
        z = lambda x, y, s: L([(x, y), (x + s, y), (x, y + s), (x + s, y + s)], max(3, s * 0.22), 'ink')
        return [z(-34, 4, 26), z(0, -18, 20), z(24, -36, 14)]
    raise KeyError(name)


def poof():
    return [E(0, 0, 22, 20, 'white'), E(-20, 5, 15, 14, 'white'), E(20, 5, 15, 14, 'white'), E(-9, -13, 15, 14, 'white'),
            E(11, -13, 15, 14, 'white'), E(6, 12, 18, 10, 'puff_d', soft=True)]


def hit():
    return [P(star(30, 12, 8, -90), 'sun'), P(star(15, 7, 8, -67), 'white', soft=True)]


def diamond(k=1.0):
    return [(0, -MHH * k), (MHW * k, 0), (0, MHH * k), (-MHW * k, 0)]


def fit(prims, size=100.0, enlarge=False):
    """도형 묶음을 가운데로 옮기고 size 안에 들어가게 줄인다(아이콘용)."""
    x0, y0, x1, y1 = bbox(prims, 0)
    w, h = x1 - x0, y1 - y0
    k = size / max(w, h)
    if not enlarge:
        k = min(1.0, k)
    return xform(prims, -(x0 + x1) / 2 * k, -(y0 + y1) / 2 * k, k)



# ================================================================== 2단계: 철, 총, 방어 시설
def musket(butt, ang, length=88.0, k=1.0):
    """수발식 장총. butt = 개머리판 끝, ang = 총구 방향(도, 0 = 오른쪽). 돌려주는 값: (도형, 총구 끝 위치)"""
    q = _frame(butt, ang)
    Lg = length * k
    stock = [q(0, -5 * k), q(20 * k, -2.6 * k), q(30 * k, -2.2 * k), q(30 * k, 3.2 * k), q(20 * k, 4.2 * k), q(0, 9.5 * k)]
    prims = [P(stock, 'wood'), L([q(2 * k, 7.5 * k), q(21 * k, 3.4 * k)], 2.2 * k, 'wood_d')]
    prims.append(P([q(28 * k, -1.6 * k), q(Lg * 0.82, -1.2 * k), q(Lg * 0.82, 2.4 * k), q(28 * k, 3.2 * k)], 'wood'))
    prims.append(L([q(24 * k, -2.2 * k), q(Lg, -2.2 * k)], 3.8 * k, 'metal_d'))
    prims.append(L([q(27 * k, -3.3 * k), q(Lg - 3 * k, -3.3 * k)], 1.3 * k, 'metal_l'))
    prims.append(P([q(25 * k, -1.2 * k), q(34 * k, -1.2 * k), q(34 * k, 2.6 * k), q(25 * k, 2.6 * k)], 'brass'))
    prims.append(L([q(29 * k, -2 * k), q(27 * k, -6.5 * k), q(30.5 * k, -7.5 * k)], 2.1 * k, 'metal_d'))
    prims.append(L([q(31 * k, 3.2 * k), q(33 * k, 6.8 * k), q(37.5 * k, 6.8 * k), q(38.5 * k, 3.2 * k)], 1.6 * k, 'brass'))
    prims.append(L([q(Lg - 1.5 * k, -2.2 * k), q(Lg, -2.2 * k)], 5 * k, 'metal'))
    return prims, q(Lg + 1.5 * k, -2.2 * k)


# ---- 3D 도우미
# 방향을 바꿔 가며 그려야 하는 것(포탑)은 간단한 3D 모양으로 만들어서 비스듬히 내려다본 모습으로 투영한다.
#   (p, q, z): p = 화면 오른쪽, q = 화면 아래쪽(세로를 반으로 줄이기 전), z = 높이
#   화면 좌표 = (p, q/2 - z).   칸 좌표 (x=col, y=row, z) 는 v3() 로 바꾼다.
VIEWER = (0.0, 0.866, 0.5)          # 보는 사람 쪽(이쪽을 향한 면이 보인다)


def v3(x, y, z=0.0):
    """칸 좌표(소수 가능) -> (p, q, z). 방향(벡터)에도 그대로 쓴다."""
    return ((x - y) * MHW, (x + y) * MHW, z)


def pr(a):
    return (a[0], a[1] * 0.5 - a[2])


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vmul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def vnorm(a):
    d = math.sqrt(vdot(a, a)) or 1.0
    return (a[0] / d, a[1] / d, a[2] / d)


def vlerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def near(pts):
    """보는 사람에게 가까운 정도. 클수록 앞에 있다."""
    return sum(vdot(p, VIEWER) for p in pts) / len(pts)


def hull(pts):
    """볼록 껍질(화면 좌표 점들)"""
    pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(pts) < 3:
        return pts
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for pt in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], pt) <= 0:
            lo.pop()
        lo.append(pt)
    for pt in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], pt) <= 0:
            up.pop()
        up.append(pt)
    return lo[:-1] + up[:-1]


def ring3(c, axis, r, n=18):
    a = vnorm(axis)
    t = (0.0, 0.0, 1.0) if abs(a[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = vnorm(vcross(a, t))
    e2 = vcross(a, e1)
    return [vadd(c, vadd(vmul(e1, r * math.cos(2 * math.pi * i / n)), vmul(e2, r * math.sin(2 * math.pi * i / n)))) for i in range(n)]


def cyl(a, b, ra, rb, key, cap=None, hi=None):
    """a에서 b까지의 원기둥 하나(도형 목록). cap: 보이는 쪽 끝면 색, hi: 위쪽 반짝임 선 색"""
    axis = vsub(b, a)
    ca, cb = ring3(a, axis, ra), ring3(b, axis, rb)
    out = [P(hull([pr(p) for p in ca + cb]), key)]
    if hi:
        ax = vnorm(axis)
        up = vsub((0.0, 0.0, 1.0), vmul(ax, ax[2]))
        up = vnorm(vadd(vnorm(up) if vdot(up, up) > 1e-6 else (0.0, -1.0, 0.0), (-0.25, 0.0, 0.0)))
        out.append(L([pr(vadd(a, vmul(up, ra * 0.55))), pr(vadd(b, vmul(up, rb * 0.55)))], max(1.2, min(ra, rb) * 0.45), hi))
    if cap:
        ax = vnorm(axis)
        ring = cb if vdot(ax, VIEWER) > 0 else ca
        out.append(P([pr(p) for p in ring], cap))
    return out


def box3(c, hx, hy, hz, top, sides):
    """가운데 c, 세 방향의 '반 길이 벡터' hx, hy, hz 인 상자. 보이는 면만 그린다.
    sides = (밝은 면, 보통 면, 어두운 면) 색. 빛은 화면 왼쪽 위에서 온다."""
    light = vnorm((-1.0, -0.35, 0.0))
    faces = []
    for vec, (u, w) in ((hz, (hx, hy)), (hx, (hy, hz)), (hy, (hz, hx))):
        for sgn in (1, -1):
            n = vmul(vec, sgn)
            nn = vnorm(n)
            if vdot(nn, VIEWER) <= 1e-6:
                continue
            fc = vadd(c, n)
            cs = [vadd(fc, vadd(vmul(u, i), vmul(w, j))) for i, j in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
            if abs(nn[2]) > 0.7:
                key = top
            else:
                b = vdot(nn, light)
                key = sides[0] if b > 0.35 else sides[1] if b > -0.35 else sides[2]
            faces.append((near(cs), P([pr(p) for p in cs], key)))
    return [p for _, p in sorted(faces, key=lambda t: t[0])]


def line3(pts, w, key, **o):
    return L([pr(p) for p in pts], w, key, **o)


# ---- 포탑(16방향). phi: 향하는 방향(라디안). 0 = 화면 오른쪽, pi/2 = 화면 아래쪽(보는 사람 쪽)
TURRET_DIRS = 16


def turret_phi(i):
    return 2 * math.pi * i / TURRET_DIRS


def _axes(phi):
    c, s = math.cos(phi), math.sin(phi)
    U, V = (c, s, 0.0), (-s, c, 0.0)
    return lambda u, v=0.0, z=0.0: (U[0] * u + V[0] * v, U[1] * u + V[1] * v, z), U, V


BOW_K = 1.45                       # 쇠뇌 크기
BOW_TIP = (46.0 * BOW_K, 0.0, 10.5 * BOW_K)   # 쇠뇌 화살 끝(포탑 좌표 u, v, z)
GUN_TIP = (55.0, 0.0, 12.0)        # 총 타워 총구 끝


def crossbow(phi, loaded=True):
    """망루 위의 큰 쇠뇌. 기준점 = 회전축 꼭대기(0,0,0)."""
    at0, U, V = _axes(phi)
    k = BOW_K
    at = lambda u, v=0.0, z=0.0: at0(u * k, v * k, z * k)
    U, V = vmul(U, k), vmul(V, k)
    prims = cyl((0, 0, -9), (0, 0, 2), 8, 8, 'metal_d', cap='metal')
    prims += box3(at(0, 0, 5), vmul(U, 26), vmul(V, 4.6), (0, 0, 3.4 * k), 'wood_l', ('wood_l', 'wood', 'wood_d'))
    tip = 2.0 if loaded else 13.0
    arm = [at(20 - (20 - tip) * t * t, 37 * t, 8.5) for t in [i / 8 for i in range(-8, 9)]]
    prims.append(line3(arm, 6 * k, 'wood_d'))
    prims.append(line3([at(20, -5, 8.5), at(20, 5, 8.5)], 8 * k, 'metal_d'))
    string = [arm[0], at(-12, 0, 9), arm[-1]] if loaded else [arm[0], arm[-1]]
    prims.append(line3(string, 2.2, 'string'))
    if loaded:
        prims.append(line3([at(-12, 0, 10.5), at(36, 0, 10.5)], 3.2 * k, 'wood_l'))
        prims.append(P([pr(at(35, -4, 10.5)), pr(at(46, 0, 10.5)), pr(at(35, 4, 10.5))], 'steel'))
        prims.append(P([pr(at(-12, 0, 10.5)), pr(at(-3, 0, 10.5)), pr(at(-9, 0, 17))], 'fletch'))
    return prims


def swivel_gun(phi):
    """총 타워 위의 회전포. 기준점 = 회전축 꼭대기(0,0,0)."""
    at, U, V = _axes(phi)
    items = [(-1e9, cyl((0, 0, -10), (0, 0, 2), 6.5, 6.5, 'metal_d', cap='metal'))]
    bar = cyl(at(-17, 0, 12), at(52, 0, 12), 6.6, 4.2, 'metal', cap='ink', hi='metal_l')
    bar += cyl(at(48, 0, 12), at(54, 0, 12), 5.6, 5.6, 'metal_d', cap='ink')
    bar += cyl(at(14, 0, 12), at(18, 0, 12), 6.2, 6.0, 'metal_d')
    bar += cyl(at(-19, 0, 12), at(-14, 0, 12), 7.8, 7.8, 'metal_d')
    items.append((near([at(14, 0, 12)]), bar))
    for side in (-1, 1):
        arm = [at(0, 9.5 * side, 0), at(0, 9.5 * side, 13)]
        items.append((near(arm), [line3(arm, 4.5, 'metal_d')]))
    items.append((near([at(0, 0, 0)]) - 0.5, [line3([at(0, -9.5, 0.5), at(0, 9.5, 0.5)], 4.5, 'metal_d')]))
    handle = [at(-20, 0, 11), at(-39, 0, 6)]
    items.append((near(handle), [line3(handle, 5, 'wood_d'), E(*pr(at(-40, 0, 6)), 3.8, 3.8, 'wood_d')]))
    out = []
    for _, ps in sorted(items, key=lambda t: t[0]):
        out += ps
    return out


def turret_tip(kind, i):
    """i번째 방향 프레임에서 화살/총알이 나가는 곳(마스터 화면 좌표, 회전축 꼭대기 기준)"""
    at, _, _ = _axes(turret_phi(i))
    return pr(at(*(BOW_TIP if kind == 'bow' else GUN_TIP)))


def screen_angle(i):
    """i번째 방향이 화면에서 가리키는 각도(도, 0 = 오른쪽, 90 = 아래쪽)"""
    phi = turret_phi(i)
    return math.degrees(math.atan2(0.5 * math.sin(phi), math.cos(phi)))


# ---- 망루(1x1칸). 쇠뇌는 따로 그려서 회전축 꼭대기에 올린다.
WT_PLAT = 128                       # 발판 높이
WT_PIVOT = WT_PLAT + 40             # 회전축 꼭대기 높이
WT_LAMP = v3(0.60, -0.60, WT_PLAT + 19)    # 등불 가운데(밤에 빛을 둘 자리)


def watchtower():
    prims = [S(46, 12, 76, 25, 10)]
    C = {'back': (-0.34, -0.34), 'left': (-0.34, 0.34), 'right': (0.34, -0.34), 'front': (0.34, 0.34)}
    leg = lambda n: (v3(C[n][0] * 1.13, C[n][1] * 1.13, 0), v3(C[n][0] * 0.94, C[n][1] * 0.94, WT_PLAT))

    def log(a, b, w=10.5):
        pa, pb = pr(a), pr(b)
        return [L([pa, pb], w, 'wood'), L([(pa[0] + w * 0.27, pa[1]), (pb[0] + w * 0.27, pb[1])], w * 0.38, 'wood_d', soft=True)]

    for n in ('back', 'left', 'right'):
        prims += log(*leg(n))
    for a, b in (('left', 'front'), ('front', 'right')):
        A0, A1 = leg(a)
        B0, B1 = leg(b)
        prims += [line3([vlerp(A0, A1, 0.10), vlerp(B0, B1, 0.86)], 5, 'wood_d'),
                  line3([vlerp(B0, B1, 0.10), vlerp(A0, A1, 0.86)], 5, 'wood_d'),
                  line3([vlerp(A0, A1, 0.48), vlerp(B0, B1, 0.48)], 5.5, 'wood')]
    prims += log(*leg('front'))
    prims += box3(v3(0, 0, WT_PLAT + 5), v3(0.47, 0, 0), v3(0, 0.47, 0), (0, 0, 5), 'wood_l', ('wood_l', 'wood', 'wood_d'))
    for i in range(1, 4):                       # 발판 널빤지 줄
        t = -0.47 + 0.94 * i / 4
        prims.append(line3([v3(t, -0.47, WT_PLAT + 10), v3(t, 0.47, WT_PLAT + 10)], 1.6, 'wood_d', op=0.6))
    # 사다리(왼쪽 앞면)
    for x in (-0.04, 0.20):
        prims.append(line3([v3(x, 0.70, 0), v3(x, 0.50, WT_PLAT + 8)], 4.5, 'wood_d'))
    for k in range(1, 9):
        t = k / 9
        prims.append(line3([v3(-0.04, 0.70 - 0.20 * t, (WT_PLAT + 8) * t), v3(0.20, 0.70 - 0.20 * t, (WT_PLAT + 8) * t)], 3, 'wood'))
    # 난간
    R = 0.42
    cn = {'back': v3(-R, -R), 'left': v3(-R, R), 'right': v3(R, -R), 'front': v3(R, R)}
    z0 = WT_PLAT + 10
    rail = lambda a, b, z, w: line3([vadd(cn[a], (0, 0, z)), vadd(cn[b], (0, 0, z))], w, 'wood')
    prims += [rail('left', 'back', z0 + 12, 4), rail('back', 'right', z0 + 12, 4),
              rail('left', 'back', z0 + 21, 4.5), rail('back', 'right', z0 + 21, 4.5)]
    # 깃발(뒤 모서리)
    fp = vadd(cn['back'], (0, 0, z0))
    top = vadd(cn['back'], (0, 0, z0 + 66))
    prims.append(line3([fp, top], 3.5, 'mast'))
    tp = pr(top)
    prims.append(P([tp, (tp[0] + 34, tp[1] + 7), (tp[0], tp[1] + 17)], 'stripe'))
    for n in ('back', 'left', 'right'):
        prims.append(line3([vadd(cn[n], (0, 0, z0 - 2)), vadd(cn[n], (0, 0, z0 + 24))], 5, 'wood_d'))
    # 회전축 기둥
    prims += cyl((0, 0, z0), (0, 0, WT_PIVOT - 7), 6, 6, 'wood_d', cap='wood')
    prims += [rail('left', 'front', z0 + 12, 4), rail('front', 'right', z0 + 12, 4),
              rail('left', 'front', z0 + 21, 4.5), rail('front', 'right', z0 + 21, 4.5),
              line3([vadd(cn['front'], (0, 0, z0 - 2)), vadd(cn['front'], (0, 0, z0 + 24))], 5, 'wood_d')]
    # 등불(오른쪽 모서리에 매단다)
    arm0, arm1 = vadd(cn['right'], (0, 0, z0 + 20)), v3(0.60, -0.60, z0 + 20)
    prims.append(line3([arm0, arm1], 3, 'wood_d'))
    prims.append(line3([arm1, vadd(arm1, (0, 0, -6))], 1.6, 'ink'))
    prims += _lantern(vadd(arm1, (0, 0, -11)))
    return prims


def _lantern(c):
    x, y = pr(c)
    return [P([(x - 5, y - 6), (x + 5, y - 6), (x + 6, y + 6), (x - 6, y + 6)], 'lamp'),
            L([(x - 6, y + 6), (x + 6, y + 6)], 2.2, 'ink'), L([(x - 5, y - 6), (x + 5, y - 6)], 2.2, 'ink'),
            P([(x - 4, y - 6), (x, y - 10), (x + 4, y - 6)], 'ink')]


# ---- 총 타워(1x1칸, 둥근 돌탑). 회전포는 따로 그려서 올린다.
GT_TOP = 104                        # 몸통 높이
GT_RIM = GT_TOP + 18                # 성가퀴 윗면
GT_PIVOT = 140                      # 회전축 꼭대기 높이
GT_R, GT_R2, GT_RIN = 36.0, 40.0, 31.0
GT_LAMP = (math.cos(math.radians(14)) * (GT_R + 15), math.sin(math.radians(14)) * (GT_R + 15), GT_TOP - 26)


def _arc(r, t0, t1, z, n=24):
    return [pr((r * math.cos(math.radians(t)), r * math.sin(math.radians(t)), z)) for t in [t0 + (t1 - t0) * i / n for i in range(n + 1)]]


def guntower():
    R, R2, Rin = GT_R, GT_R2, GT_RIN
    rt = lambda z: R * (1 - 0.04 * z / GT_TOP)
    prims = [S(36, 12, 64, 21, 8)]
    prims.append(P(_arc(R, 0, 180, 0) + _arc(rt(GT_TOP), 180, 0, GT_TOP), 'stone'))
    prims.append(P(_arc(R, 0, 64, 0) + _arc(rt(GT_TOP), 64, 0, GT_TOP), 'stone_d', soft=True))
    prims.append(P(_arc(R, 124, 164, 0) + _arc(rt(GT_TOP), 164, 124, GT_TOP), 'stone_l', soft=True))
    for i, z in enumerate(range(17, GT_TOP, 17)):
        prims.append(L(_arc(rt(z), 5, 175, z), 2.2, 'stone_d'))
    for i, z in enumerate(range(0, GT_TOP - 8, 17)):
        for t in range(20 + (14 if i % 2 else 0), 172, 28):
            a = (rt(z) * math.cos(math.radians(t)), rt(z) * math.sin(math.radians(t)), z + 1)
            b = (a[0], a[1], z + 16)
            prims.append(L([pr(a), pr(b)], 1.8, 'stone_d'))
    # 문(왼쪽 앞), 좁은 창(오른쪽 앞)
    door = _arc(R + 0.5, 110, 140, 0, 8)
    door += [pr(((R + 0.5) * math.cos(math.radians(t)), (R + 0.5) * math.sin(math.radians(t)), 30 + 11 * math.sin(math.pi * (140 - t) / 30)))
             for t in [140 - 30 * k / 10 for k in range(11)]]
    prims.append(P(door, 'door'))
    prims.append(L(door[9:] + [door[0]], 2.6, 'wood_d'))
    slit = [pr((R * math.cos(math.radians(t)), R * math.sin(math.radians(t)), z)) for t, z in ((46, 56), (54, 56), (54, 80), (46, 80))]
    prims.append(P(slit, 'ink'))
    # 쇠띠와 성가퀴
    prims.append(L(_arc(rt(GT_TOP) + 1, 0, 180, GT_TOP), 6, 'stone_d'))
    prims.append(P(_arc(R2, 0, 180, GT_TOP) + _arc(R2, 180, 0, GT_RIM), 'stone'))
    prims.append(P(_arc(R2, 0, 62, GT_TOP) + _arc(R2, 62, 0, GT_RIM), 'stone_d', soft=True))
    prims.append(L(_arc(R2, 4, 176, GT_TOP + 9), 2, 'stone_d'))
    prims.append(P(_arc(R2, 0, 360, GT_RIM, 48), 'stone_l'))
    prims.append(P(_arc(Rin, 0, 360, GT_RIM, 48), 'stone_d'))
    prims.append(P(_arc(Rin - 7, 0, 360, GT_RIM - 5, 40), 'wood'))
    for t in (-14, 0, 14):
        prims.append(L([pr((t, -(Rin - 9) * 0.9, GT_RIM - 5)), pr((t, (Rin - 9) * 0.9, GT_RIM - 5))], 1.5, 'wood_d', op=0.6))
    prims.append(P(_arc(R2, 0, 180, GT_RIM, 24) + _arc(Rin, 180, 0, GT_RIM, 24), 'stone_l'))
    back, front = [], []
    for k in range(8):
        tc = 22.5 + 45 * k
        t0, t1 = tc - 12, tc + 12
        top = P(_arc(R2, t0, t1, GT_RIM + 13, 6) + _arc(Rin + 1, t1, t0, GT_RIM + 13, 6), 'stone_l')
        if 0 < tc < 180:
            front += [P(_arc(R2, t0, t1, GT_RIM, 6) + _arc(R2, t1, t0, GT_RIM + 13, 6), 'stone_d' if tc < 70 else 'stone'), top]
        else:
            back += [P(_arc(Rin + 1, t0, t1, GT_RIM, 6) + _arc(Rin + 1, t1, t0, GT_RIM + 13, 6), 'stone_d'), top]
    prims += back
    prims += cyl((0, 0, GT_RIM - 5), (0, 0, GT_PIVOT - 9), 7, 6, 'metal_d', cap='metal')
    prims += front
    # 등불(오른쪽 벽에 매단다)
    wall = (math.cos(math.radians(14)) * R, math.sin(math.radians(14)) * R, GT_TOP - 12)
    tip = (GT_LAMP[0], GT_LAMP[1], GT_TOP - 12)
    prims.append(line3([wall, tip], 3, 'metal_d'))
    prims.append(line3([tip, vadd(tip, (0, 0, -8))], 1.6, 'ink'))
    prims += _lantern(vadd(tip, (0, 0, -14)))
    return prims


# ---- 철조망(울타리처럼 이웃과 이어진다)
WIRE_DIRS = {1: v3(0.5, 0), 2: v3(-0.5, 0), 4: v3(0, 0.5), 8: v3(0, -0.5)}


def wire(mask):
    prims = [S(6, 3, 12, 4, 0)]

    def run(bit):
        d = WIRE_DIRS[bit]
        out = []
        for t in (0.26, 0.70):
            ring = [pr(p) for p in ring3(vadd(vmul(d, t), (0, 0, 11)), d, 9.5, 20)]
            out.append(L(ring + [ring[0]], 1.9, 'wire'))
        for h in (25, 38):
            a, b = (0.0, -h), (pr(d)[0], pr(d)[1] - h)
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 3)
            out.append(L(bez2(a, m, b, 6), 2.1, 'wire'))
            for tt in (0.35, 0.75):
                bx, by = lerp(a, b, tt)
                by += 3 * (1 - (2 * tt - 1) ** 2)
                out += [L([(bx - 3, by - 3), (bx + 3, by + 3)], 1.6, 'wire'), L([(bx + 3, by - 3), (bx - 3, by + 3)], 1.6, 'wire')]
        return out

    for bit in (2, 8):
        if mask & bit:
            prims += run(bit)
    if mask == 0:
        for t in (-0.35, 0.0, 0.35):
            ring = [pr(p) for p in ring3(vadd(vmul(v3(0.5, 0), t), (0, 0, 11)), v3(0.5, 0), 9.5, 20)]
            prims.append(L(ring + [ring[0]], 1.9, 'wire'))
    prims += [L([(0, 2), (0, -44)], 5, 'metal_d'), L([(-1.3, 0), (-1.3, -42)], 1.4, 'metal_l'),
              L([(0, -44), (4, -47), (2, -50)], 2.2, 'metal_d')]
    for bit in (1, 4):
        if mask & bit:
            prims += run(bit)
    return prims


# ---- 철광석
def iron_ore(seed, big=False):
    rng = random.Random(seed)
    s = (1.0 if big else 0.84) * rng.uniform(0.96, 1.04)
    q = lambda pts: [(x * s, y * s) for x, y in pts]
    out = [(-46, 4), (-50, -20), (-34, -50), (-6, -64), (26, -56), (46, -30), (44, 2), (8, 14)]
    out = [(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3)) for x, y in out]
    prims = [S(14 * s, 6 * s, 58 * s, 19 * s, 6), P(q(out), 'iron')]
    prims.append(P(q([out[1], out[2], out[3], (-4, -34), (-30, -20)]), 'iron_l', soft=True))
    prims.append(P(q([out[4], out[5], out[6], out[7], (6, -24)]), 'iron_d', soft=True))
    for vein in ([(-38, -24), (-24, -34), (-10, -31)], [(8, -46), (22, -38), (36, -40)], [(-14, -6), (2, -13), (20, -5)]):
        prims.append(L(q(vein), 7, 'rust'))
        prims.append(L(q([(x - 1, y - 1.6) for x, y in vein[:2]]), 2.4, 'rust_l', soft=True))
    for x, y, r in ((-22, -42, 5.5), (16, -26, 5), (31, -14, 4.2), (-2, -52, 4), (-30, -8, 3.6)):
        prims.append(E(x * s, y * s, r * s, r * 0.82 * s, 'ore'))
        prims.append(E((x - 1.4) * s, (y - 1.4) * s, r * 0.38 * s, r * 0.3 * s, 'ore_hi'))
    if big:
        prims += [E(-54 * s, 10 * s, 13 * s, 9.5 * s, 'iron'), E(-56 * s, 7 * s, 6 * s, 4 * s, 'rust'),
                  E(-50 * s, 12 * s, 2.6 * s, 2.2 * s, 'ore')]
    return prims


# ---- 날아가는 것, 효과
def arrow():
    """오른쪽을 향한 화살. 기준점 = 가운데"""
    return xform([L([(-27, 0), (18, 0)], 3.4, 'wood'),
                  P([(-30, -1), (-21, -1), (-15, -7), (-24, -7)], 'white'), P([(-30, 1), (-21, 1), (-15, 7), (-24, 7)], 'white'),
                  L([(-13, -2.2), (-13, 2.2)], 2.6, 'fletch'),
                  P([(14, -6.5), (35, 0), (14, 6.5), (18, 0)], 'metal_d')], k=1.3)


def bullet():
    """오른쪽으로 날아가는 총알과 꼬리. 기준점 = 총알"""
    return [P([(-34, -1.6), (-2, -4.6), (-2, 4.6), (-34, 1.6)], 'smoke', op=0.75), E(0, 0, 5.4, 5.4, 'metal_d'),
            E(-1.6, -1.6, 1.9, 1.6, 'metal_l')]


def muzzle_flash():
    """오른쪽을 향한 총구 불꽃. 기준점 = 총구(왼쪽 끝)"""
    outer = [(0, -6), (9, -14), (12, -6), (24, -12), (20, -3), (36, 0), (20, 3), (24, 12), (12, 6), (9, 14), (0, 6)]
    inner = [(1, -4), (10, -7), (24, 0), (10, 7), (1, 4)]
    return xform([P(outer, 'fire_o'), P(inner, 'fire_y'), E(5, 0, 5, 3.8, 'white')], k=1.6)


def smoke():
    return [E(0, 0, 20, 17, 'smoke'), E(-17, 5, 13, 11, 'smoke'), E(16, 5, 13, 11, 'smoke'), E(-7, -12, 12, 11, 'smoke_l'),
            E(9, -11, 12, 10, 'smoke'), E(5, 10, 16, 8, 'smoke_d', soft=True)]



# ================================================================== 움직임과 효과(타격감)
def swing_arc(pivot, r, a0, a1, w, part=(0.0, 1.0), op=1.0):
    """휘두른 자리에 남는 흰 궤적(초승달). a0 -> a1(도, 화면 기준 0=오른쪽 -90=위)로 휘두른다. 앞쪽 끝이 굵다."""
    n = 22
    t0, t1 = part
    outer, inner = [], []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        a = math.radians(a0 + (a1 - a0) * t)
        th = w * (math.sin(math.pi * min(1.0, t * 1.12)) ** 0.7 if t < 0.89 else (1 - t) / 0.11 * 0.95)
        outer.append((pivot[0] + r * math.cos(a), pivot[1] + r * math.sin(a)))
        inner.append((pivot[0] + (r - th) * math.cos(a), pivot[1] + (r - th) * math.sin(a)))
    kw = {'op': op} if op < 1 else {}
    edge = [(pivot[0] + (r - 2) * math.cos(math.radians(a0 + (a1 - a0) * (t0 + (t1 - t0) * i / n))),
             pivot[1] + (r - 2) * math.sin(math.radians(a0 + (a1 - a0) * (t0 + (t1 - t0) * i / n)))) for i in range(n + 1)]
    return [P(outer + inner[::-1], 'swish', **kw), L(edge[int(n * 0.35):], 1.6, 'swish_d', **kw)]


# 캐릭터 발 기준(오른쪽을 볼 때)의 궤적. 이름: (돌리는 중심, 반지름, 시작 각, 끝 각, 굵기)
SWINGS = {'swing': ((16, -50), 46, -40, 48, 11), 'heavy': ((16, -50), 56, -100, 42, 15),
          'bswing': ((17, -51), 47, -112, 4, 11), 'bheavy': ((18, -51), 56, -120, 20, 15)}


def swing_frames(name):
    pv, r, a0, a1, w = SWINGS[name]
    return [swing_arc(pv, r, a0, a1, w * 0.75, (0.0, 0.55)), swing_arc(pv, r, a0, a1, w),
            swing_arc(pv, r, a0, a1, w * 0.55, (0.35, 1.0), op=0.6)]


def impact_frames():
    ring = lambda r, w, key, op=1.0: L(ell_pts(0, 0, r, r, 0, 30) + [ell_pts(0, 0, r, r, 0, 30)[0]], w, key, **({'op': op} if op < 1 else {}))
    sparks = [L([(math.cos(math.radians(a)) * 20, math.sin(math.radians(a)) * 20),
                 (math.cos(math.radians(a)) * 31, math.sin(math.radians(a)) * 31)], 3.4, 'sun') for a in (-135, -45, 45, 135)]
    return [[P(star(16, 7, 8, -90), 'white'), E(0, 0, 6, 6, 'white')],
            [P(star(32, 12, 8, -90), 'sun'), P(star(18, 8, 8, -67), 'white')],
            [ring(30, 4, 'white')] + sparks,
            [ring(38, 2.6, 'white', 0.55)]]


def dust_frames(key='dust', light='dust_l', dark='dust_d'):
    """땅에서 피어오르는 먼지(기준점 = 바닥 가운데)"""
    sets = [
        [(-8, -6, 9, 7, key), (7, -5, 10, 7, key), (0, -11, 9, 8, light)],
        [(-16, -8, 12, 9, key), (15, -8, 12, 9, key), (0, -16, 13, 11, light), (-6, -4, 10, 6, dark), (8, -4, 9, 6, dark)],
        [(-24, -12, 14, 11, key), (22, -12, 14, 11, key), (-6, -24, 15, 12, light), (10, -20, 12, 10, key), (0, -6, 16, 7, dark)],
        [(-30, -16, 13, 10, key), (28, -16, 13, 10, key), (-8, -32, 13, 11, light), (12, -28, 11, 9, key), (0, -10, 14, 6, dark)],
        [(-34, -20, 10, 8, key), (30, -20, 10, 8, light), (-6, -38, 10, 8, light), (14, -34, 8, 7, key)],
    ]
    ops = [1, 1, 1, 0.7, 0.4]
    return [[E(x, y, rx, ry, k, **({'op': o} if o < 1 else {})) for x, y, rx, ry, k in fs] for fs, o in zip(sets, ops)]


def vanish_frames():
    sets = [
        [(-10, -6, 12, 8, 'vanish'), (9, -6, 12, 8, 'vanish'), (0, -12, 12, 10, 'vanish_l')],
        [(-12, -12, 13, 11, 'vanish'), (11, -12, 13, 11, 'vanish'), (0, -26, 14, 13, 'vanish_l'), (0, -6, 16, 6, 'vanish_d')],
        [(-8, -22, 12, 13, 'vanish'), (9, -30, 11, 12, 'vanish'), (-2, -44, 12, 12, 'vanish_l'), (0, -8, 14, 5, 'vanish_d')],
        [(-10, -40, 9, 10, 'vanish_l'), (10, -50, 8, 9, 'vanish_l'), (-2, -62, 9, 9, 'vanish')],
        [(-6, -62, 6, 7, 'vanish_l'), (8, -74, 5, 6, 'vanish_l'), (-1, -84, 5, 5, 'vanish_l')],
    ]
    ops = [1, 1, 0.9, 0.7, 0.45]
    return [[E(x, y, rx, ry, k, **({'op': o} if o < 1 else {})) for x, y, rx, ry, k in fs] for fs, o in zip(sets, ops)]


def sparkle_frames():
    st = lambda x, y, R, r, key, op=1.0: P([(px + x, py + y) for px, py in star(R, r, 4, -90)], key, **({'op': op} if op < 1 else {}))
    return [[st(0, 0, 10, 3, 'white')],
            [st(0, 0, 20, 5, 'sun'), st(16, -14, 8, 2.5, 'white'), st(-15, 10, 6, 2, 'sun')],
            [st(-3, 2, 14, 4, 'sun'), st(18, -18, 12, 3, 'white'), st(-20, 12, 10, 3, 'sun'), st(8, 18, 7, 2, 'white')],
            [st(22, -24, 7, 2, 'white', 0.6), st(-24, 16, 6, 2, 'sun', 0.6)]]


def splash_frames():
    ring = lambda rx, ry, w, key, op=1.0: L(ell_pts(0, 0, rx, ry, 0, 28) + [ell_pts(0, 0, rx, ry, 0, 28)[0]], w, key, **({'op': op} if op < 1 else {}))
    return [[E(0, 0, 16, 5, 'foam'), P([(-14, 0), (-10, -12), (-6, -4), (-2, -16), (2, -5), (6, -14), (10, -3), (14, 0)], 'splash')],
            [E(0, 0, 22, 6, 'foam'), P([(-20, 0), (-16, -22), (-10, -6), (-4, -30), (2, -8), (8, -26), (14, -5), (20, 0)], 'splash'),
             E(-18, -30, 3, 3, 'splash_d'), E(12, -36, 3, 3, 'splash_d'), E(22, -20, 2.5, 2.5, 'splash_d')],
            [ring(28, 8, 3, 'foam'), E(-24, -10, 3, 3, 'splash_d'), E(20, -14, 3, 3, 'splash_d'), E(6, -20, 2.5, 2.5, 'splash_d')],
            [ring(36, 10, 2.5, 'foam', 0.6)]]


def smoke_puff_frames():
    return [[E(0, 0, 10, 9, 'smoke'), E(6, -4, 7, 6, 'smoke_l')],
            [E(-4, 0, 14, 12, 'smoke'), E(10, -4, 11, 10, 'smoke'), E(2, -10, 10, 9, 'smoke_l'), E(4, 6, 12, 6, 'smoke_d', soft=True)],
            [E(-8, -4, 17, 14, 'smoke', op=0.85), E(14, -8, 14, 12, 'smoke', op=0.85), E(2, -18, 13, 11, 'smoke_l', op=0.85),
             E(4, 6, 16, 7, 'smoke_d', soft=True, op=0.8)],
            [E(-10, -10, 18, 15, 'smoke_l', op=0.45), E(16, -14, 15, 12, 'smoke', op=0.45), E(2, -26, 13, 11, 'smoke_l', op=0.45)]]


def _leaf(key, dark, k=1.0):
    pts = bez2((-11, 0), (0, -9), (11, 0), 6) + bez2((11, 0), (0, 9), (-11, 0), 6)[1:]
    return [P([(x * k, y * k) for x, y in pts], key), L([(-9 * k, 0), (9 * k, 0)], 1.3, dark)]


PARTICLES = ['wood1', 'wood2', 'leaf1', 'leaf2', 'leaf3', 'stone1', 'stone2', 'iron', 'spark', 'ember', 'goo', 'dirt', 'dust', 'heart']


def particle(name):
    """작게 튀는 조각(가운데 기준). 게임에서 여러 개를 흩뿌려 쓴다."""
    if name == 'wood1':
        return [P([(-9, -4), (5, -6), (10, 1), (-2, 5), (-8, 3)], 'wood_l'), L([(-7, 1), (6, -2)], 1.4, 'wood_d')]
    if name == 'wood2':
        return [P([(-13, -1), (10, -3.5), (13, 0), (-10, 3)], 'wood'), L([(-9, -0.5), (9, -2)], 1.2, 'wood_l')]
    if name == 'leaf1':
        return rotate(_leaf('leafA', 'leafA_d'), -25)
    if name == 'leaf2':
        return rotate(_leaf('leafB', 'leafB_d', 0.9), 20)
    if name == 'leaf3':
        return rotate(_leaf('leafW', 'leafW_d'), -10)
    if name == 'stone1':
        return [P([(-8, -5), (4, -8), (10, -1), (5, 6), (-6, 5)], 'rock'), P([(-8, -5), (4, -8), (2, -1), (-5, 0)], 'rock_l', soft=True)]
    if name == 'stone2':
        return [P([(-6, 3), (0, -7), (7, 4)], 'rock_d'), P([(-6, 3), (0, -7), (0, 2)], 'rock', soft=True)]
    if name == 'iron':
        return [P([(-8, -4), (3, -8), (9, 0), (3, 6), (-7, 4)], 'iron'), E(1, -1, 4, 3, 'rust'), E(-4, 2, 2, 1.8, 'ore')]
    if name == 'spark':
        return [P(star(10, 2.6, 4, -90), 'fire_y'), E(0, 0, 2.6, 2.6, 'white')]
    if name == 'ember':
        return [E(0, 0, 5, 5, 'ember'), E(0, 0, 2.6, 2.6, 'fire_y')]
    if name == 'goo':
        return [P(bez2((0, -9), (8, 2), (0, 7), 6) + bez2((0, 7), (-8, 2), (0, -9), 6)[1:], 'goo'), E(-2, 1, 1.8, 2.4, 'white')]
    if name == 'dirt':
        return [E(0, 0, 7, 5.5, 'dirt'), E(2, 2, 5, 3.4, 'dirt_d', soft=True)]
    if name == 'dust':
        return [E(0, 0, 9, 7, 'dust_l'), E(3, 2, 6, 4, 'dust')]
    if name == 'heart':
        return xform(heart('pink'), 0, 0, 0.3)
    raise KeyError(name)


def footprint():
    return [E(-7, -2, 5.2, 2.6, 'foot', -18, op=0.75), E(6, 3, 5.2, 2.6, 'foot', -18, op=0.75)]


def arrow_stuck():
    """땅에 꽂힌 화살(오른쪽 아래를 향해 꽂힘). 기준점 = 꽂힌 자리"""
    return xform([E(1, 1, 6, 2.4, 'dirt_d', op=0.8), L([(0, 0), (-21, -15)], 3.4, 'wood'),
                  P([(-23, -16), (-30, -24), (-21, -24), (-15, -18)], 'white'), P([(-23, -16), (-31, -15), (-24, -10), (-17, -13)], 'white'),
                  L([(-14, -10), (-12, -8)], 2.6, 'fletch')], k=1.3)
