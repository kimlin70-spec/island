#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
섬의 바닥을 수채화처럼 한 장으로 칠해서 조각으로 저장한다.
실행: python tools/make_ground.py     결과: assets/ground/ground_<행>_<열>.jpg
                                      눈 덮인 바닥(3단계 날씨): assets/ground/ground_snow_<행>_<열>.jpg

칸 경계가 보이지 않게, 땅 종류의 경계를 둥글고 구불구불하게 만든다.
맵(data/map.json)을 바꾸면 이 스크립트를 다시 돌려야 한다.
"""
import gc
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import layout as LY
from wc import noise, aniso_noise, render_svg, f

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPER = np.array([247, 241, 227], np.float32) / 255
COL = {
    0: ((166, 213, 217), (104, 168, 198)),      # 물: 얕은 곳 -> 깊은 곳
    1: ((242, 227, 190), (232, 209, 164)),      # 모래
    2: ((190, 211, 146), (167, 197, 128)),      # 풀
    3: ((150, 187, 126), (131, 170, 115)),      # 숲 바닥
    4: ((216, 203, 176), (198, 183, 154)),      # 돌밭
    5: ((216, 186, 162), (196, 160, 138)),      # 철광 지대(붉은 흙)
}


def decorations(tmap, W, H):
    """풀잎 붓자국, 작은 꽃, 자갈."""
    parts = []
    N = tmap.shape[0]
    for r in range(N):
        for c in range(N):
            k = tmap[r, c]
            if k == 0:
                continue
            wx, wy = LY.t2w(c, r)
            sx, sy = wx - LY.GROUND_X0, wy - LY.GROUND_Y0
            if k in (1, 4, 5):
                n = 1 if k == 1 else 3
                for i in range(n):
                    if LY.h01(c, r, 40 + i) < (0.10 if k == 1 else 0.45):
                        ox, oy = (LY.h01(c, r, 50 + i) - 0.5) * 56, (LY.h01(c, r, 60 + i) - 0.5) * 24
                        col = '#cfb992' if k == 1 else ('#b9b0a2' if i % 2 else '#a79d8f') if k == 4 else ('#b47d60' if i % 2 else '#8f8186')
                        parts.append(f'<ellipse cx="{f(sx+ox)}" cy="{f(sy+oy)}" rx="{3.2 if k == 1 else 4}" ry="{2 if k == 1 else 2.6}" fill="{col}" opacity="0.85"/>')
                continue
            dark = '#7fa56c' if k == 2 else '#6a9463'
            for i in range(3):
                if LY.h01(c, r, 10 + i) < 0.34:
                    ox, oy = (LY.h01(c, r, 20 + i) - 0.5) * 56, (LY.h01(c, r, 30 + i) - 0.5) * 25
                    x, y = sx + ox, sy + oy
                    parts.append(f'<path d="M {f(x-3)},{f(y)} q 0.6,-5 -1.2,-7.5 M {f(x)},{f(y)} q 0,-5.6 0.6,-8.8 M {f(x+3)},{f(y)} q 0,-4.4 2.5,-6.2" '
                                 f'fill="none" stroke="{dark}" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>')
            if k == 2 and LY.h01(c, r, 40) < 0.13:
                for i, col in enumerate(('#fffdf6', '#f5d36b', '#eea0a8')):
                    ox, oy = (LY.h01(c, r, 50 + i) - 0.5) * 50, (LY.h01(c, r, 60 + i) - 0.5) * 21
                    parts.append(f'<circle cx="{f(sx+ox)}" cy="{f(sy+oy)}" r="2.6" fill="{col}"/>')
    return render_svg("".join(parts), W, H)


def snow_cover(out, water, d_land, H, W):
    """눈 덮인 바닥: 땅은 눈으로 덮고(군데군데 땅이 보인다), 물가는 덜 쌓이고, 물은 조금 차갑게."""
    base = 0.62 + 0.42 * noise(H, W, 90, 71) + 0.16 * noise(H, W, 20, 72)
    cover = np.clip((base - 0.33) / 0.13, 0, 1) * np.clip((d_land - 5.0) / 18.0, 0, 1)
    cover[water] = 0
    shade = (0.5 + 0.5 * noise(H, W, 150, 73))[..., None] * 0.65
    snow = np.array([0.975, 0.98, 1.0], np.float32) * (1 - shade) + np.array([0.83, 0.865, 0.94], np.float32) * shade
    edge = (cover * (1 - cover) * 4)[..., None]
    res = out * np.array([0.88, 0.92, 0.99], np.float32)
    res = res * (1 - cover[..., None]) + snow * cover[..., None]
    res *= 1 - np.array([0.10, 0.08, 0.04], np.float32) * edge            # 눈 가장자리에 옅은 푸른 선
    res[water] = out[water] * np.array([0.9, 0.94, 1.0], np.float32)
    res *= (1 + 0.02 * noise(H, W, 1.7, 74))[..., None]
    return res


def main():
    m = json.load(open(os.path.join(ROOT, 'data', 'map.json'), encoding='utf-8'))
    tmap = np.array(m['terrain'], np.uint8)
    H, W = LY.GROUND_H, LY.GROUND_W

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    X = xs + LY.GROUND_X0 + noise(H, W, 94, 1) * 8.8 + noise(H, W, 29, 2) * 4.4
    Y = ys + LY.GROUND_Y0 + noise(H, W, 94, 3) * 4.4 + noise(H, W, 29, 4) * 2.5
    del xs, ys
    cf = (X / LY.HW + Y / LY.HH) / 2            # 칸 좌표(소수). 칸 중심이 정수
    rf = (Y / LY.HH - X / LY.HW) / 2
    del X, Y
    gc.collect()

    # 칸 경계를 둥글게: 종류별 '소속도'를 부드럽게 만든 뒤 가장 큰 쪽으로 정한다
    kind = np.zeros((H, W), np.uint8)
    best = np.full((H, W), -1.0, np.float32)
    for k in range(6):
        ind = ndi.gaussian_filter((tmap == k).astype(np.float32), 0.66)
        mk = ndi.map_coordinates(ind, [rf, cf], order=1, mode='constant', cval=1.0 if k == 0 else 0.0).astype(np.float32)
        upd = mk > best
        kind[upd] = k
        best[upd] = mk[upd]
        del mk, upd
    del cf, rf, best
    gc.collect()
    print('kinds done')

    edges = np.zeros((H, W), bool)
    edges[:, 1:] |= kind[:, 1:] != kind[:, :-1]
    edges[1:, :] |= kind[1:, :] != kind[:-1, :]
    d_edge = ndi.distance_transform_edt(~edges).astype(np.float32)
    del edges
    water = kind == 0
    d_water = ndi.distance_transform_edt(water).astype(np.float32)
    d_land = ndi.distance_transform_edt(~water).astype(np.float32)          # 땅에서 물까지의 거리(눈 바닥용)
    print('distances done')

    t_var = np.clip(0.5 + 0.55 * noise(H, W, 262, 5) + 0.3 * noise(H, W, 56, 6), 0, 1)
    out = np.zeros((H, W, 3), np.float32)
    for k, (ca, cb) in COL.items():
        mk = kind == k
        if not mk.any():
            continue
        ca, cb = np.array(ca, np.float32) / 255, np.array(cb, np.float32) / 255
        t = (np.clip(d_water[mk] / 390.0, 0, 1) ** 0.75) if k == 0 else t_var[mk]
        col = ca * (1 - t[:, None]) + cb * t[:, None]
        col *= (1 - 0.13 * np.exp(-d_edge[mk] / 2.8))[:, None]            # 가장자리에 고인 물감
        if k == 0:
            d = d_water[mk]
            streak = aniso_noise(H, W, 119, 5.6, 7)[mk]
            col += np.clip(streak - 0.25, 0, 1)[:, None] * 0.20           # 가로로 쓸린 붓자국
            gap = (np.clip(1 - d / 4.4, 0, 1) ** 0.7)[:, None]            # 물가에 칠하지 않고 남긴 종이
            col = col * (1 - gap) + PAPER * gap
            col *= (1 - 0.10 * np.exp(-((d - 7.5) / 2.8) ** 2))[:, None]
        elif k in (2, 3):
            dabs = np.clip(noise(H, W, 14, 8 + k)[mk] - 0.35, 0, 1) * 1.8
            col *= (1 - 0.045 * np.clip(dabs, 0, 1))[:, None]
        out[mk] = col
        del mk, col, t
    del d_edge, d_water, t_var
    gc.collect()
    print('colors done')

    deco = np.asarray(decorations(tmap, W, H), np.float32) / 255.0
    a = deco[..., 3:4]
    out = out * (1 - a) + deco[..., :3] * a
    del deco, a
    gc.collect()

    out *= (1 + 0.024 * noise(H, W, 1.7, 41) + 0.024 * noise(H, W, 7, 42) + 0.016 * aniso_noise(H, W, 38, 1.9, 43))[..., None]   # 종이 결
    img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
    snow_img = Image.fromarray((np.clip(snow_cover(out, water, d_land, H, W), 0, 1) * 255).astype(np.uint8))
    del out, d_land
    gc.collect()

    gdir = os.path.join(ROOT, 'assets', 'ground')
    os.makedirs(gdir, exist_ok=True)
    for old in os.listdir(gdir):
        os.remove(os.path.join(gdir, old))
    # 조각은 1024px 크기로 자르되 1022px 간격으로 놓는다. 조각마다 가장자리 1px은 이웃 조각과 겹치는 여유분이고,
    # 게임에서는 안쪽 1022x1022만 그린다(setCrop). 이렇게 해야 카메라가 소수 좌표에 있을 때
    # 조각 가장자리에 반대편 가장자리 색이 섞여 가는 줄이 생기는 것을 막을 수 있다.
    M = (LY.CHUNK - LY.STEP) // 2
    nx, ny = (W - LY.CHUNK) // LY.STEP + 1, (H - LY.CHUNK) // LY.STEP + 1
    chunks, snow_chunks = [], []
    for gy in range(ny):
        for gx in range(nx):
            name = f'ground_{gy}_{gx}'
            x0, y0 = gx * LY.STEP, gy * LY.STEP
            img.crop((x0, y0, x0 + LY.CHUNK, y0 + LY.CHUNK)).save(os.path.join(gdir, name + '.jpg'), quality=90, subsampling=0)
            chunks.append(dict(key=name, file=f'ground/{name}.jpg', x=LY.GROUND_X0 + x0, y=LY.GROUND_Y0 + y0))
            sname = f'ground_snow_{gy}_{gx}'
            snow_img.crop((x0, y0, x0 + LY.CHUNK, y0 + LY.CHUNK)).save(os.path.join(gdir, sname + '.jpg'), quality=88, subsampling=0)
            snow_chunks.append(dict(key=sname, file=f'ground/{sname}.jpg', x=LY.GROUND_X0 + x0, y=LY.GROUND_Y0 + y0))
    meta = dict(x=LY.GROUND_X0 + M, y=LY.GROUND_Y0 + M, width=nx * LY.STEP, height=ny * LY.STEP,
                chunkSize=LY.CHUNK, chunkStep=LY.STEP, chunkMargin=M, chunks=chunks, snowChunks=snow_chunks)
    json.dump(meta, open(os.path.join(gdir, 'ground.json'), 'w', encoding='utf-8'), indent=1)
    size = sum(os.path.getsize(os.path.join(gdir, n)) for n in os.listdir(gdir))
    print(len(chunks), 'chunks,', round(size / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
