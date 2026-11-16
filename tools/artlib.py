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
def _legs(K, step):
    far, near = [-10, 0], [1, 0]
    if step == 1:
        far, near = [-5, 3], [-3, 0]
    elif step == 2:
        far, near = [-14, 0], [6, 3]
    prims = [S(4, 2, 22, 8)]
    for (x, lift), key in ((far, K['pants_d']), (near, K['pants'])):
        prims.append(P([(x, -22), (x + 8, -22), (x + 8, -2 - lift), (x, -2 - lift)], key))
        prims.append(E(x + 5, -1 - lift, 6.5, 3.6, K['shoe']))
    return prims


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


SURVIVOR = dict(skin='skin', skin_d='skin_d', shirt='tee', shirt_d='tee_d', pants='pants', pants_d='pants_d', shoe='shoe')
POSES = {
    #          다리, 몸 들썩임, 가까운 팔, 먼 팔, 도구, 도구 방향
    'idle':    (0, 0, 8, -8, None, 0),
    'walk1':   (1, -2, -28, 26, None, 0),
    'walk2':   (2, -2, 28, -26, None, 0),
    'dagger1': (0, 0, 58, -14, 'dagger', -62),
    'dagger2': (1, -1, 92, -20, 'dagger', 4),
    'axe1':    (0, 0, 152, -14, 'axe', -118),
    'axe2':    (1, -1, 78, -20, 'axe', 34),
    'pick1':   (0, 0, 152, -14, 'pickaxe', -118),
    'pick2':   (1, -1, 78, -20, 'pickaxe', 34),
}


def survivor(pose='idle'):
    step, bob, a_near, a_far, tool, tang = POSES[pose]
    K = SURVIVOR
    lean = 3 if pose.endswith('2') and tool else 0
    far_arm, _ = _arm((-14 + lean, -50 + bob), a_far, K, 0.42, far=True)
    prims = far_arm + _legs(K, step)
    prims += [E(lean * 0.5, -40 + bob, 16, 23, 'tee'), E(5 + lean * 0.5, -36 + bob, 9, 17, 'tee_d', soft=True),
              L([(-6 + lean, -59 + bob), (1 + lean, -56 + bob), (8 + lean, -59 + bob)], 2.2, 'tee_d')]
    hx, hy = 1 + lean, -74 + bob
    prims += [E(hx, hy, 17, 16.5, 'skin'),
              P([(hx - 18, hy), (hx - 18, hy - 10), (hx - 11, hy - 18), (hx + 1, hy - 20), (hx + 12, hy - 17), (hx + 18, hy - 8),
                 (hx + 18, hy), (hx + 12, hy - 6), (hx + 3, hy - 8), (hx - 7, hy - 5)], 'hair'),
              E(hx - 5, hy + 3, 2.1, 2.8, 'ink'), E(hx + 8, hy + 3, 2.1, 2.8, 'ink'),
              E(hx - 11, hy + 9, 3.4, 2.2, 'blush', op=0.7), E(hx + 14, hy + 9, 3.4, 2.2, 'blush', op=0.7)]
    near_arm, hand = _arm((15 + lean, -50 + bob), a_near, K, 0.42)
    if tool:
        prims += tool_prims(tool, hand, tang)
    return prims + near_arm


ZOMBIE = dict(skin='zskin', skin_d='zskin_d', shirt='zshirt', shirt_d='zshirt_d', pants='zpants', pants_d='zpants', shoe='ink')
ZPOSES = {'walk1': (1, -1, 86, 78, False), 'walk2': (2, -1, 94, 86, False), 'attack': (1, -2, 128, 118, True)}


def zombie(pose='walk1'):
    step, bob, a_near, a_far, bite = ZPOSES[pose]
    K = ZOMBIE
    far_arm, _ = _arm((-12, -50 + bob), a_far, K, 0.8, far=True)
    prims = far_arm + _legs(K, step)
    prims += [E(0, -40 + bob, 16, 23, 'zshirt'), E(5, -36 + bob, 9, 17, 'zshirt_d', soft=True),
              P([(-9, -40 + bob), (-1, -40 + bob), (-1, -32 + bob), (-9, -32 + bob)], 'zpatch')]
    hx, hy = 2, -74 + bob
    prims += [E(hx, hy, 17, 16.5, 'zskin'),
              P([(hx - 13, hy - 12), (hx - 10, hy - 24), (hx - 4, hy - 14)], 'zhair'), P([(hx - 3, hy - 15), (hx + 2, hy - 27), (hx + 7, hy - 14)], 'zhair'),
              P([(hx + 7, hy - 13), (hx + 14, hy - 22), (hx + 15, hy - 9)], 'zhair'),
              E(hx - 5, hy + 1, 5, 5, 'white'), E(hx - 4, hy + 1.5, 1.8, 1.8, 'ink'),
              E(hx + 9, hy + 2, 3.6, 3.6, 'white'), E(hx + 10, hy + 2.5, 1.4, 1.4, 'ink')]
    if bite:
        prims.append(E(hx + 3, hy + 11, 5, 3.6, 'ink'))
    else:
        prims.append(L([(hx - 4, hy + 11), (hx + 1, hy + 13), (hx + 7, hy + 11)], 2, 'ink'))
    near_arm, _ = _arm((13, -50 + bob), a_near, K, 0.8)
    return prims + near_arm


PIRATE = {
    1: dict(skin='pskin', skin_d='pskin', shirt='pcoat', shirt_d='pcoat_d', pants='ppants', pants_d='ppants', shoe='ink'),
    2: dict(skin='pskin', skin_d='pskin', shirt='pwhite', shirt_d='pstripe', pants='ppants', pants_d='ppants', shoe='ink'),
}
PPOSES = {'walk1': (1, -2, 40, -20, -70), 'walk2': (2, -2, 52, 16, -62), 'attack': (1, -1, 140, -20, -130)}


def pirate(var=1, pose='walk1'):
    step, bob, a_near, a_far, sang = PPOSES[pose]
    K = PIRATE[var]
    far_arm, _ = _arm((-14, -50 + bob), a_far, K, 1.0 if var == 1 else 0.42, far=True)
    prims = far_arm + _legs(K, step)
    hx, hy = 1, -74 + bob
    if var == 1:      # 선장
        prims += [E(0, -40 + bob, 17, 23, 'pcoat'), E(5, -36 + bob, 9, 17, 'pcoat_d', soft=True),
                  L([(-15, -33 + bob), (0, -30 + bob), (16, -33 + bob)], 4, 'gold'),
                  E(hx, hy, 17, 16.5, 'pskin'),
                  P([(hx - 14, hy + 6), (hx - 11, hy + 16), (hx, hy + 19), (hx + 11, hy + 16), (hx + 15, hy + 6), (hx + 7, hy + 10),
                     (hx, hy + 11), (hx - 7, hy + 10)], 'beard'),
                  E(hx + 8, hy + 2, 2.1, 2.8, 'ink'), E(hx - 5, hy + 2, 3.6, 3.6, 'hat'),
                  L([(hx - 17, hy - 4), (hx - 5, hy + 2), (hx + 17, hy - 6)], 1.6, 'hat'),
                  P([(hx - 28, hy - 8), (hx - 14, hy - 24), (hx, hy - 29), (hx + 14, hy - 24), (hx + 28, hy - 8), (hx + 14, hy - 13),
                     (hx, hy - 15), (hx - 14, hy - 13)], 'hat'),
                  E(hx, hy - 21, 3.4, 3.4, 'white')]
    else:             # 선원
        prims += [E(0, -40 + bob, 16, 23, 'pwhite')]
        for y in (-54, -44, -34, -24):
            w = 16 * math.sqrt(max(0.0, 1 - ((y + 40) / 23.0) ** 2)) - 1.5
            prims.append(L([(-w, y + bob), (w, y + bob)], 4.2, 'pstripe'))
        prims += [E(hx, hy, 17, 16.5, 'pskin'),
                  P([(hx - 18, hy - 1), (hx - 17, hy - 12), (hx - 9, hy - 18), (hx + 2, hy - 19), (hx + 12, hy - 16), (hx + 18, hy - 7),
                     (hx + 18, hy - 2), (hx + 7, hy - 6), (hx - 7, hy - 5)], 'bandana'),
                  P([(hx - 18, hy - 4), (hx - 28, hy), (hx - 24, hy + 6), (hx - 17, hy)], 'bandana'),
                  E(hx - 5, hy + 3, 2.1, 2.8, 'ink'), E(hx + 8, hy + 3, 2.1, 2.8, 'ink'),
                  L([(hx - 3, hy + 11), (hx + 2, hy + 13), (hx + 7, hy + 11)], 2, 'ink')]
    near_arm, hand = _arm((15, -50 + bob), a_near, K, 1.0 if var == 1 else 0.42)
    return prims + tool_prims('sword', hand, sang) + near_arm


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
