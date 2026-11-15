#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
섬 생존 데모 - 맵 생성기

실행:  python tools/make_map.py
결과:  data/map_demo.json

좌표: terrain[row][col]. 화면에서는
    x = (col - row) * 64,  y = (col + row) * 32   (칸 중심)
즉 col+row 가 클수록 화면 아래쪽(가까운 쪽)이다.
"""
import json
import math
import os
import random
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 40                     # 가로, 세로 칸 수
SEED = 7
WATER, SAND, GRASS, FOREST, DIRT = 0, 1, 2, 3, 4
CEN = (N - 1) / 2

ZONES = [
    dict(id=1, key="beach", name="해변", flagCost=dict(wood=5, stone=3)),
    dict(id=2, key="meadow", name="풀밭", flagCost=dict(wood=10, stone=6)),
    dict(id=3, key="forest", name="숲", flagCost=dict(wood=15, stone=10)),
]


def is_land(c, r):
    dx, dy = c - CEN, r - CEN
    th = math.atan2(dy, dx)
    R = 15.0 + 1.3 * math.sin(3 * th + 0.6) + 0.9 * math.sin(5 * th + 2.1) + 0.5 * math.sin(8 * th + 4.0)
    return dx * dx + dy * dy < R * R


def zone_of(c, r):
    s = (c + r) - (N - 1)                       # 화면 세로 방향(+ 가 아래쪽)
    wob = 1.6 * math.sin((c - r) * 0.45 + 1.0)
    if s >= 6 + wob:
        return 1
    if s <= -6 + wob:
        return 3
    return 2


def neighbors4(c, r):
    return ((c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1))


def main():
    rng = random.Random(SEED)
    land = [[is_land(c, r) for c in range(N)] for r in range(N)]
    # 외딴 1칸 정리
    for r in range(N):
        for c in range(N):
            if land[r][c]:
                k = sum(1 for (a, b) in neighbors4(c, r) if 0 <= a < N and 0 <= b < N and land[b][a])
                if k <= 1:
                    land[r][c] = False

    zone = [[zone_of(c, r) if land[r][c] else 0 for c in range(N)] for r in range(N)]

    def near_water(c, r, d=1):
        for dr in range(-d, d + 1):
            for dc in range(-d, d + 1):
                a, b = c + dc, r + dr
                if not (0 <= a < N and 0 <= b < N) or not land[b][a]:
                    return True
        return False

    terrain = [[WATER] * N for _ in range(N)]
    for r in range(N):
        for c in range(N):
            if not land[r][c]:
                continue
            z = zone[r][c]
            if z == 1 or near_water(c, r, 1):
                terrain[r][c] = SAND
            elif z == 2:
                terrain[r][c] = GRASS
            else:
                terrain[r][c] = FOREST

    # 집(2x2). 해변 구역 가운데쯤.
    house = dict(col=25, row=25, w=2, h=2)
    house_tiles = {(house["col"] + i, house["row"] + j) for i in range(2) for j in range(2)}
    door = (house["col"] + 1, house["row"] + 2)          # 문 앞 칸
    for r in range(house["row"] - 1, house["row"] + 3):
        for c in range(house["col"] - 1, house["col"] + 3):
            if land[r][c]:
                terrain[r][c] = DIRT
    hc = (house["col"] + 0.5, house["row"] + 0.5)

    def dist(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    zone_tiles = {z["id"]: [(c, r) for r in range(N) for c in range(N) if zone[r][c] == z["id"]] for z in ZONES}

    blocked = set(house_tiles)
    reserved = {door}
    for dc in range(-1, 2):
        for dr in range(-1, 2):
            reserved.add((door[0] + dc, door[1] + dr))
    for r in range(house["row"] - 3, house["row"] + 5):       # 집 주변 3칸은 비워 둔다(짓는 자리)
        for c in range(house["col"] - 3, house["col"] + 5):
            reserved.add((c, r))

    # 깃발 자리: 구역 중심 근처(물가 제외, 집에서 3칸 이상)
    for z in ZONES:
        tiles = zone_tiles[z["id"]]
        cx = sum(t[0] for t in tiles) / len(tiles)
        cy = sum(t[1] for t in tiles) / len(tiles)
        if z["id"] == 1:
            cx, cy = hc[0] - 4.5, hc[1] + 1.5          # 집에서 보이는 왼쪽 앞
        cand = [t for t in tiles if not near_water(t[0], t[1], 2) and t not in reserved and dist(t, hc) >= 3.5]
        spot = min(cand, key=lambda t: dist(t, (cx, cy)))
        z["flagSpot"] = dict(col=spot[0], row=spot[1])
        for dc in range(-2, 3):                  # 깃발 자리 주변 2칸은 비워 둔다(잘 보이게)
            for dr in range(-2, 3):
                reserved.add((spot[0] + dc, spot[1] + dr))

    # 좀비가 나오는 자리: 구역 안에서 집과 멀고 서로 떨어진 4곳
    for z in ZONES:
        cand = [t for t in zone_tiles[z["id"]] if dist(t, hc) >= 9 and not near_water(t[0], t[1], 1)
                and t not in reserved]
        picks = [max(cand, key=lambda t: dist(t, hc))]
        while len(picks) < 4:
            picks.append(max(cand, key=lambda t: min(dist(t, p) for p in picks) + 0.15 * dist(t, hc)))
        z["spawns"] = [dict(col=p[0], row=p[1]) for p in picks]
        for p in picks:
            reserved.add(p)

    # 사물 배치(길이 막히지 않게 확인하면서)
    def reachable(blk):
        seen = {door}
        q = deque([door])
        while q:
            c, r = q.popleft()
            for a, b in neighbors4(c, r):
                if 0 <= a < N and 0 <= b < N and land[b][a] and (a, b) not in blk and (a, b) not in seen:
                    seen.add((a, b))
                    q.append((a, b))
        return seen

    total_free = lambda blk: sum(1 for r in range(N) for c in range(N) if land[r][c] and (c, r) not in blk)

    anchors = [(z["flagSpot"]["col"], z["flagSpot"]["row"], 2, 7) for z in ZONES]
    anchors.append((hc[0], hc[1], 3, 8))

    def hides_important(t):
        """t 에 키 큰 나무를 심으면 화면에서 깃발 자리/집을 가리는가(화면 앞쪽 = col+row 가 큰 쪽)."""
        for ac, ar, side, depth in anchors:
            dc, dr = t[0] - ac, t[1] - ar
            if 0 < dc + dr <= depth and abs(dc - dr) <= side:
                return True
        return False

    plan = {
        1: [("palm", 11), ("rock", 6), ("bush", 4)],
        2: [("tree", 13), ("pine", 3), ("bush", 10), ("rock", 7)],
        3: [("tree", 20), ("pine", 24), ("rock", 9), ("bush", 6)],
    }
    objects = []
    occupied = set()
    for zid, items in plan.items():
        tiles = [t for t in zone_tiles[zid] if t not in reserved]
        for typ, count in items:
            placed, tries = 0, 0
            while placed < count and tries < 4000:
                tries += 1
                t = rng.choice(tiles)
                if t in occupied or t in blocked:
                    continue
                if typ == "palm" and not (near_water(t[0], t[1], 3) or rng.random() < 0.25):
                    continue
                if typ in ("tree", "pine") and terrain[t[1]][t[0]] not in (GRASS, FOREST):
                    continue                     # 나무는 모래 위에 두지 않는다
                if typ in ("tree", "pine", "palm") and hides_important(t):
                    continue                     # 키 큰 나무가 깃발 자리나 집 앞을 가리지 않게
                # 같은 종류끼리 너무 붙지 않게(숲은 예외)
                if zid != 3 and any(abs(o["col"] - t[0]) + abs(o["row"] - t[1]) <= 1 for o in objects):
                    continue
                trial = blocked | {t}
                if len(reachable(trial)) != total_free(trial):
                    continue
                blocked.add(t)
                occupied.add(t)
                objects.append(dict(type=typ, col=t[0], row=t[1]))
                placed += 1
    objects.sort(key=lambda o: (o["col"] + o["row"], o["col"]))

    # 동물
    animals = []

    def free_tile(zid, pred):
        tiles = [t for t in zone_tiles[zid] if t not in blocked and t not in reserved and pred(t)]
        t = rng.choice(tiles)
        reserved.add(t)
        return t

    t = free_tile(1, lambda t: 4 <= dist(t, hc) <= 6 and t[0] > hc[0])
    animals.append(dict(type="dog", col=t[0], row=t[1]))
    for zid, n in ((2, 5), (3, 4)):
        for _ in range(n):
            t = free_tile(zid, lambda t: not near_water(t[0], t[1], 1))
            animals.append(dict(type="boar", col=t[0], row=t[1]))

    data = dict(
        cols=N, rows=N,
        tileWidth=128, tileHeight=64,
        terrainLegend={"0": "water", "1": "sand", "2": "grass", "3": "forest", "4": "dirt"},
        terrain=terrain,
        zone=zone,
        zones=ZONES,
        house=house,
        houseDoor=dict(col=door[0], row=door[1]),
        playerStart=dict(col=door[0], row=door[1]),
        objects=objects,
        animals=animals,
    )

    # 한 줄에 한 행씩 보기 좋게 저장
    def rows(m):
        return "[\n" + ",\n".join("    " + json.dumps(row, separators=(",", ":")) for row in m) + "\n  ]"

    parts = []
    for k, v in data.items():
        if k in ("terrain", "zone"):
            parts.append(f'  "{k}": {rows(v)}')
        elif k in ("objects", "animals"):
            body = ",\n".join("    " + json.dumps(o, ensure_ascii=False, separators=(", ", ": ")) for o in v)
            parts.append(f'  "{k}": [\n{body}\n  ]')
        elif k == "zones":
            body = ",\n".join("    " + json.dumps(o, ensure_ascii=False, separators=(", ", ": ")) for o in v)
            parts.append(f'  "{k}": [\n{body}\n  ]')
        else:
            parts.append(f'  "{k}": {json.dumps(v, ensure_ascii=False, separators=(", ", ": "))}')
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    out = os.path.join(ROOT, "data", "map_demo.json")
    with open(out, "w", encoding="utf-8") as fp:
        fp.write("{\n" + ",\n".join(parts) + "\n}\n")
    json.load(open(out, encoding="utf-8"))            # 형식 검사

    n_land = sum(map(sum, land))
    print("land tiles:", n_land, {z["name"]: len(zone_tiles[z["id"]]) for z in ZONES})
    print("objects:", len(objects), "animals:", len(animals))
    for z in ZONES:
        print(z["name"], "flag", z["flagSpot"], "spawns", z["spawns"])
    free = total_free(blocked)
    print("free land:", free, "reachable from door:", len(reachable(blocked)))


if __name__ == "__main__":
    main()
