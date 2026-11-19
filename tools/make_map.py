#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
섬 맵 만들기.   실행: python tools/make_map.py   결과: data/map.json

칸 좌표 (col, row). 화면(월드) 좌표는 칸 중심 기준
    x = (col - row) * 40,   y = (col + row) * 20
col+row 가 클수록 화면 아래쪽, col-row 가 클수록 화면 오른쪽이다.
"""
import json
import math
import os
import random
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 64
CEN = (N - 1) / 2.0
SEED = 21
WATER, SAND, GRASS, FOREST, DIRT, IRONSOIL = 0, 1, 2, 3, 4, 5
IRON_CENTER = (46, 31)          # 2단계: 동쪽 철광 지대
START = (37, 39)
SEED_CRATE = (43, 43)           # 3단계: 바닷가에 떠밀려 온 씨앗 상자(열 때까지 그 칸을 막는다)
PETS = {'dog': (44, 42), 'cat': (27, 41)}     # 3단계: 강아지는 상자 옆 바닷가, 고양이는 서쪽 돌밭


def radius(th):
    return 22 + 2.2 * math.sin(3 * th + 0.6) + 1.4 * math.sin(5 * th + 2.1) + 0.8 * math.sin(8 * th + 4.0)


def is_land(c, r):
    dx, dy = c - CEN, r - CEN
    return dx * dx + dy * dy < radius(math.atan2(dy, dx)) ** 2


def nb4(c, r):
    return ((c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1))


def main():
    rng = random.Random(SEED)
    land = [[is_land(c, r) for c in range(N)] for r in range(N)]
    inb = lambda c, r: 0 <= c < N and 0 <= r < N
    isl = lambda c, r: inb(c, r) and land[r][c]

    # 물까지의 거리(칸, 대각선 포함)
    dist = [[0] * N for _ in range(N)]
    q = deque()
    for r in range(N):
        for c in range(N):
            if land[r][c] and any(not isl(c + dc, r + dr) for dc in (-1, 0, 1) for dr in (-1, 0, 1)):
                dist[r][c] = 1
                q.append((c, r))
    while q:
        c, r = q.popleft()
        for dc in (-1, 0, 1):
            for dr in (-1, 0, 1):
                a, b = c + dc, r + dr
                if isl(a, b) and dist[b][a] == 0:
                    dist[b][a] = dist[r][c] + 1
                    q.append((a, b))

    terrain = [[WATER] * N for _ in range(N)]
    for r in range(N):
        for c in range(N):
            if not land[r][c]:
                continue
            u, v = c - r, (c + r) - (N - 1)
            beach = 2 + (2 if v > 8 else 0) + (1 if v > 18 else 0)
            if dist[r][c] <= beach:
                terrain[r][c] = SAND
            elif math.hypot(c - 22.5, r - 40.5) < 4.6 + 0.8 * math.sin(c * 1.3 + r * 0.7):
                terrain[r][c] = DIRT                                   # 서쪽 돌밭
            elif v < -7 + 2.5 * math.sin(u * 0.22 + 1.0) or math.hypot(c - 41, r - 23) < 4.6:
                terrain[r][c] = FOREST                                 # 북쪽 숲, 동쪽 작은 숲
            else:
                terrain[r][c] = GRASS

    d2 = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
    blocked = set()

    def reachable(blk):
        seen = {START}
        qq = deque([START])
        while qq:
            c, r = qq.popleft()
            for a, b in nb4(c, r):
                if isl(a, b) and (a, b) not in blk and (a, b) not in seen:
                    seen.add((a, b))
                    qq.append((a, b))
        return len(seen)

    n_land = sum(map(sum, land))
    objects = []
    sprites = dict(tree=['obj_tree_a1', 'obj_tree_a2', 'obj_tree_a3', 'obj_tree_b1', 'obj_tree_b2'],
                   pine=['obj_pine_1', 'obj_pine_2', 'obj_pine_3'], palm=['obj_palm_1', 'obj_palm_2'],
                   bush=['obj_bush_1', 'obj_bush_2'])

    def place(kind, c, r):
        if kind == 'rock':
            sp = rng.choice(['obj_rock_s', 'obj_rock_m', 'obj_rock_m', 'obj_rock_l'])
        elif kind == 'tree' and rng.random() < 0.10:
            sp = 'obj_tree_w1'
        else:
            sp = rng.choice(sprites[kind])
        trial = blocked | {(c, r)}
        if reachable(trial) != n_land - len(trial):
            return False
        blocked.add((c, r))
        objects.append(dict(kind=kind, sprite=sp, col=c, row=r))
        return True

    order = [(c, r) for r in range(N) for c in range(N) if land[r][c]]
    rng.shuffle(order)
    for (c, r) in order:
        if d2((c, r), START) < 3.6:
            continue
        t = terrain[r][c]
        u = rng.random()
        crowded = any((c + dc, r + dr) in blocked for dc in (-1, 0, 1) for dr in (-1, 0, 1))
        if t == FOREST:
            kind = 'tree' if u < 0.21 else 'pine' if u < 0.39 else 'rock' if u < 0.41 else 'bush' if u < 0.44 else None
        elif t == GRASS:
            kind = None if crowded else 'tree' if u < 0.055 else 'pine' if u < 0.068 else 'bush' if u < 0.10 else 'rock' if u < 0.112 else None
        elif t == DIRT:
            kind = 'rock' if u < 0.30 else 'pine' if u < 0.33 else None
        else:
            kind = None if (crowded or dist[r][c] <= 1) else 'palm' if u < 0.055 else 'rock' if u < 0.07 else None
        if kind:
            place(kind, c, r)
    objects.sort(key=lambda o: (o['col'] + o['row'], o['col']))

    # 좀비가 나오는 자리: 숲 속, 시작점에서 멀리, 서로 떨어져서
    free = [(c, r) for (c, r) in order if (c, r) not in blocked]
    cand = [t for t in free if terrain[t[1]][t[0]] == FOREST and d2(t, START) >= 16 and dist[t[1]][t[0]] >= 3]
    spawns = [min(cand, key=lambda t: d2(t, (CEN, CEN - 10)))]
    while len(spawns) < 10:
        spawns.append(max(cand, key=lambda t: min(d2(t, s) for s in spawns)))

    # 해적: 섬 남서쪽(화면 왼쪽 아래) 바다에 배, 그 앞 해변에 보트
    th = math.atan2(1.0, 0.16)
    dv = (math.cos(th), math.sin(th))
    R = radius(th)
    ship = (CEN + dv[0] * (R + 7.5), CEN + dv[1] * (R + 7.5))
    k = R + 3
    while not isl(int(round(CEN + dv[0] * k)), int(round(CEN + dv[1] * k))):
        k -= 0.25
    landing = (int(round(CEN + dv[0] * k)), int(round(CEN + dv[1] * k)))
    while landing in blocked:
        k -= 0.5
        landing = (int(round(CEN + dv[0] * k)), int(round(CEN + dv[1] * k)))
    boat = (CEN + dv[0] * (k + 1.7), CEN + dv[1] * (k + 1.7))

    # 2단계: 동쪽 철광 지대. 위에서 만든 것(사물, 좀비 자리, 해적 자리)은 그대로 두고,
    # 땅 색만 바꾼 뒤 별도의 난수로 철광석을 더한다.
    irng = random.Random(SEED + 500)
    for r in range(N):
        for c in range(N):
            if terrain[r][c] in (GRASS, FOREST) and \
                    math.hypot(c - IRON_CENTER[0], r - IRON_CENTER[1]) < 3.3 + 0.7 * math.sin(c * 1.1 + r * 0.9):
                terrain[r][c] = IRONSOIL
    cand = [(c, r) for r in range(N) for c in range(N) if terrain[r][c] == IRONSOIL and (c, r) not in blocked]
    irng.shuffle(cand)
    irons = []
    for (c, r) in cand:
        if len(irons) >= 10:
            break
        if any(abs(c - a) + abs(r - b) <= 1 for a, b in irons):     # 바로 옆(상하좌우)에 붙지 않게
            continue
        trial = blocked | {(c, r)}
        if reachable(trial) != n_land - len(trial):
            continue
        blocked.add((c, r))
        irons.append((c, r))
        objects.append(dict(kind='iron', sprite='obj_iron_2' if irng.random() < 0.4 else 'obj_iron_1', col=c, row=r))
    objects.sort(key=lambda o: (o['col'] + o['row'], o['col']))

    # 3단계: 위에서 만든 것은 그대로 두고, 씨앗 상자와 동물 자리만 더한다. 빈 땅인지, 상자가 길을 막지 않는지 확인한다.
    for name, (c, r) in [('seedCrate', SEED_CRATE)] + list(PETS.items()):
        assert isl(c, r) and (c, r) not in blocked and (c, r) != START, (name, c, r)
    assert reachable(blocked | {SEED_CRATE}) == n_land - len(blocked) - 1, 'seed crate blocks a path'

    data = dict(
        cols=N, rows=N, tileWidth=80, tileHeight=40,
        terrainLegend={"0": "water", "1": "sand", "2": "grass", "3": "forest", "4": "dirt", "5": "ironsoil"},
        terrain=terrain,
        playerStart=dict(col=START[0], row=START[1]),
        zombieSpawns=[dict(col=c, row=r) for c, r in spawns],
        pirates=dict(ship=dict(col=round(ship[0], 2), row=round(ship[1], 2)),
                     boat=dict(col=round(boat[0], 2), row=round(boat[1], 2)),
                     landing=dict(col=landing[0], row=landing[1])),
        seedCrate=dict(col=SEED_CRATE[0], row=SEED_CRATE[1]),
        pets={k: dict(col=c, row=r) for k, (c, r) in PETS.items()},
        objects=objects,
    )
    parts = []
    for key, v in data.items():
        if key == 'terrain':
            body = ",\n".join("    " + json.dumps(row, separators=(",", ":")) for row in v)
            parts.append(f'  "terrain": [\n{body}\n  ]')
        elif key in ('objects', 'zombieSpawns'):
            body = ",\n".join("    " + json.dumps(o, ensure_ascii=False, separators=(", ", ": ")) for o in v)
            parts.append(f'  "{key}": [\n{body}\n  ]')
        else:
            parts.append(f'  "{key}": {json.dumps(v, ensure_ascii=False, separators=(", ", ": "))}')
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    out = os.path.join(ROOT, 'data', 'map.json')
    with open(out, 'w', encoding='utf-8') as fp:
        fp.write("{\n" + ",\n".join(parts) + "\n}\n")
    json.load(open(out, encoding='utf-8'))

    from collections import Counter
    kinds = Counter(o['kind'] for o in objects)
    tk = Counter(terrain[r][c] for r in range(N) for c in range(N))
    near = Counter(o['kind'] for o in objects if d2((o['col'], o['row']), START) <= 12)
    print('land', n_land, 'terrain', dict(tk))
    print('objects', dict(kinds), '| 시작점 12칸 안:', dict(near))
    print('landing', landing, 'ship', data['pirates']['ship'], 'boat', data['pirates']['boat'],
          '| 시작점에서 상륙지까지', round(d2(landing, START), 1), '칸')
    print('spawns', spawns)
    print('free reachable', reachable(blocked), '=', n_land - len(blocked))


if __name__ == '__main__':
    main()
