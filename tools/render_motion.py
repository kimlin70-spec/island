#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
움직임과 효과 미리보기(움직이는 GIF). 게임이 아니라, 새 프레임과 효과가 함께 움직일 때의 느낌을 보는 용도.
실행: python tools/render_motion.py      결과: preview/preview_motion.gif

DEMO_SPEC.md 12장의 순서와 시간(manifest 의 anims)을 그대로 쓴다.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw

import layout as LY
import render_preview as R

A = R.A
FPS = 15
LOOP = 4800                         # ms. 모든 장면의 주기가 이 길이를 나눈다
CW, CH, COLS, ROWS = 190, 200, 4, 2
UP = 1.6                            # 마지막에 이만큼 키운다


def frame_at(key, anim, t):
    """애니메이션 시작 후 t ms 일 때의 프레임 이름(끝나면 마지막 프레임)."""
    fr = A[key]['anims'][anim]['frames']
    total = sum(ms for _, ms in fr)
    if A[key]['anims'][anim].get('loop'):
        t %= total
    acc = 0
    for name, ms in fr:
        acc += ms
        if t < acc:
            return name
    return fr[-1][0]


def anim_len(key, anim):
    return sum(ms for _, ms in A[key]['anims'][anim]['frames'])


def hit_time(key, anim):
    a = A[key]['anims'][anim]
    acc = 0
    for name, ms in a['frames']:
        if name == a['hit']:
            return acc
        acc += ms
    return 0


class Canvas:
    def __init__(self, bg):
        self.im = bg.copy()

    def put(self, key, x, y, frame=None, flip=False, alpha=1.0, scale=1.0, white=0.0, rot=0.0):
        m = A[key]
        im = R.img(key, frame, flip)
        ox = (m['originX'] if not flip else 1 - m['originX']) * im.width
        oy = m['originY'] * im.height
        if scale != 1.0 or rot:
            r = int(max(ox, im.width - ox, oy, im.height - oy)) + 2
            c = Image.new('RGBA', (2 * r, 2 * r), (0, 0, 0, 0))
            c.alpha_composite(im, (int(round(r - ox)), int(round(r - oy))))
            if scale != 1.0:
                c = c.resize((max(1, int(2 * r * scale)), max(1, int(2 * r * scale))), Image.LANCZOS)
            if rot:
                c = c.rotate(-rot, resample=Image.BICUBIC, center=(c.width / 2, c.height / 2))
            im, ox, oy = c, c.width / 2, c.height / 2
        if alpha < 1.0 or white > 0:
            a = np.asarray(im).astype(np.float32)
            if white > 0:
                a[..., :3] = a[..., :3] * (1 - white) + 255 * white
            a[..., 3] *= alpha
            im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        self.im.alpha_composite(im, (int(round(x - ox)), int(round(y - oy))))

    def put_tree_fall(self, key, x, y, ang, alpha):
        """나무를 발(기준점)을 축으로 넘어뜨린다."""
        m = A[key]
        im = R.img(key)
        ox, oy = m['originX'] * im.width, m['originY'] * im.height
        r = int(max(ox, im.width - ox, oy, im.height - oy)) + 2
        c = Image.new('RGBA', (2 * r, 2 * r), (0, 0, 0, 0))
        c.alpha_composite(im, (int(round(r - ox)), int(round(r - oy))))
        c = c.rotate(-ang, resample=Image.BICUBIC, center=(r, r))
        a = np.asarray(c).astype(np.float32)
        a[..., 3] *= alpha
        self.im.alpha_composite(Image.fromarray(a.astype(np.uint8)), (int(round(x - r)), int(round(y - r))))


class Bursts:
    """조각 효과: 시작 시각, 위치, 프레임 이름들, 개수 -> 시간에 따라 날아가며 사라진다."""
    def __init__(self):
        self.items = []

    def add(self, t0, x, y, names, n, seed, up=(200, 330), speed=(90, 190), life=(450, 700), grav=650, scale=1.0):
        rng = random.Random(seed)
        for _ in range(n):
            ang = math.radians(rng.uniform(*up))
            sp = rng.uniform(*speed)
            self.items.append(dict(t0=t0, x=x, y=y, vx=math.cos(ang) * sp, vy=math.sin(ang) * sp, name=rng.choice(names),
                                   life=rng.uniform(*life), spin=rng.uniform(-540, 540), grav=grav, scale=scale * rng.uniform(0.8, 1.2)))

    def draw(self, cv, t):
        for p in self.items:
            dt = (t - p['t0']) / 1000.0
            if dt < 0 or dt * 1000 > p['life']:
                continue
            x = p['x'] + p['vx'] * dt
            y = p['y'] + p['vy'] * dt + 0.5 * p['grav'] * dt * dt
            fade = min(1.0, (p['life'] - dt * 1000) / (p['life'] * 0.35))
            cv.put('fx_particles', x, y, p['name'], alpha=fade, scale=p['scale'], rot=p['spin'] * dt)


def fx_play(cv, key, anim, t, x, y, flip=False, scale=1.0, alpha=1.0):
    """t = 효과 시작 후 ms. 끝났으면 그리지 않는다."""
    if 0 <= t < anim_len(key, anim):
        cv.put(key, x, y, frame_at(key, anim, t), flip=flip, scale=scale, alpha=alpha)


# ------------------------------------------------------------------ 장면들. 각 함수는 (칸 왼쪽 위 x, y, 시각 t) 를 받는다
def scene_walk(cv, ox, oy, t, back):
    period = 2400
    u = (t % period) / period
    if back:
        x, y, anim = ox + 40 + 110 * u, oy + 168 - 55 * u, 'bwalk'
    else:
        x, y, anim = ox + 40 + 110 * u, oy + 118 + 55 * u, 'walk'
    tt = t % period
    # 디딜 때마다(walk1, walk2 가 시작될 때) 뒤꿈치에 작은 먼지
    for k in range(0, period, 166):
        age = tt - k
        if 0 <= age < 350:
            uu = k / period
            fx, fy = (ox + 40 + 110 * uu - 8, (oy + 168 - 55 * uu) if back else (oy + 118 + 55 * uu))
            fx_play(cv, 'fx_dust', 'play', age, fx, fy + 2, scale=0.42, alpha=0.8)
    cv.put('char_player', x, y, frame_at('char_player', anim, tt))


def scene_chop(cv, ox, oy, t, bursts, kind):
    """kind = 'tree' 나무 베기 / 'rock' 돌 캐기. 세 번째 타격에 넘어가거나 부서지고, 끝 무렵 다시 생긴다."""
    px, py = ox + 66, oy + 160
    tx, ty = ox + 124, oy + 162
    anim = 'axe' if kind == 'tree' else 'pick'
    starts = [300, 1100, 1900]
    obj = 'obj_tree_a2' if kind == 'tree' else 'obj_rock_m'
    hit = hit_time('char_player', anim)
    gone = starts[2] + hit
    frame = 'idle'
    for s in starts:
        if s <= t < s + anim_len('char_player', anim):
            frame = frame_at('char_player', anim, t - s)
    if t >= 4300:
        cv.put(obj, tx, ty, alpha=(t - 4300) / 500)
    elif t < gone:
        shake = 0
        for s in starts[:2]:
            dt = t - (s + hit)
            if 0 <= dt < 160:
                shake = 3 * math.sin(dt / 160 * math.pi * 3) * (1 - dt / 160)
        cv.put(obj, tx + shake, ty)
    else:
        dt = t - gone
        if kind == 'tree':
            cv.put('obj_stump', tx, ty)
            if dt < 520:
                cv.put_tree_fall(obj, tx, ty, 82 * (dt / 520) ** 1.6, 1.0 if dt < 300 else 1 - (dt - 300) / 220)
            fx_play(cv, 'fx_dust', 'play', dt - 380, tx + 62, ty + 4, scale=1.2)
        else:
            cv.put('obj_rubble', tx, ty)
            fx_play(cv, 'fx_dust', 'play', dt, tx, ty + 4, scale=1.1)
    cv.put('char_player', px, py, frame)
    for s in starts:
        sw = t - (s + hit)
        fx_play(cv, 'fx_swing', 'heavy', sw, px, py)
        fx_play(cv, 'fx_impact', 'play', sw, tx - 6, ty - (30 if kind == 'tree' else 16), scale=0.8)
    if kind == 'tree':
        fx_play(cv, 'fx_dust', 'play', -1, 0, 0)


def scene_gun(cv, ox, oy, t, bursts):
    """총으로 좀비를 두 번 맞혀 쓰러뜨리고, 좀비가 다시 땅에서 올라온다."""
    px, py = ox + 46, oy + 160
    zx, zy = ox + 150, oy + 160
    shots = [500, 1700]
    pframe = 'idle'
    for s in shots:
        if s <= t < s + anim_len('char_player', 'gun'):
            pframe = frame_at('char_player', 'gun', t - s)
    cv.put('char_player', px, py, pframe)
    fire = [s + hit_time('char_player', 'gun') for s in shots]
    mz = A['char_player']['muzzle']['gun2']
    for f in fire:
        dt = t - f
        if 0 <= dt < 70:
            cv.put('fx_muzzle', px + mz[0], py + mz[1])
        fx_play(cv, 'fx_smoke_puff', 'play', dt, px + mz[0] + 6, py + mz[1] - 4, scale=0.8, alpha=0.9)
        if 0 <= dt < 110:
            u = dt / 110
            cv.put('proj_bullet', px + mz[0] + (zx - 6 - px - mz[0]) * u, py + mz[1] + (zy - 38 - py - mz[1]) * u)
    hit1, hit2 = fire[0] + 110, fire[1] + 110
    # 좀비
    die_len = anim_len('char_zombie', 'die')
    if t < hit1:
        cv.put('char_zombie', zx, zy, frame_at('char_zombie', 'idle', t), flip=True)
    elif t < hit1 + 220:
        dt = t - hit1
        cv.put('char_zombie', zx + 6 * math.sin(min(1, dt / 120) * math.pi / 2), zy, 'hurt', flip=True, white=0.85 if dt < 60 else 0)
    elif t < hit2:
        cv.put('char_zombie', zx + 6, zy, frame_at('char_zombie', 'idle', t), flip=True)
    elif t < hit2 + die_len + 500:
        dt = t - hit2
        fade = 1.0 if dt < die_len else max(0.0, 1 - (dt - die_len) / 500)
        cv.put('char_zombie', zx + 6, zy, frame_at('char_zombie', 'die', dt), flip=True, alpha=fade, white=0.85 if dt < 60 else 0)
        fx_play(cv, 'fx_vanish', 'play', dt - die_len + 150, zx - 20, zy + 2)
    elif t >= 3700:
        dt = t - 3700
        if dt < anim_len('char_zombie', 'rise'):
            cv.put('char_zombie', zx, zy, frame_at('char_zombie', 'rise', dt), flip=True)
        else:
            cv.put('char_zombie', zx, zy, frame_at('char_zombie', 'idle', dt), flip=True)
    for h in (hit1, hit2):
        fx_play(cv, 'fx_impact', 'play', t - h, zx - 8, zy - 40, scale=0.7)


def scene_melee(cv, ox, oy, t):
    """좀비가 때리고(주인공이 맞음) 주인공이 단검으로 되받아친다. 2.4초 주기."""
    tt = t % 2400
    px, py = ox + 66, oy + 160
    zx, zy = ox + 122, oy + 160
    za, pa = 200, 1200
    z_hit = za + hit_time('char_zombie', 'attack')
    p_hit = pa + hit_time('char_player', 'dagger')
    # 주인공
    if z_hit <= tt < z_hit + 220:
        dt = tt - z_hit
        cv.put('char_player', px - 5 * math.sin(min(1, dt / 120) * math.pi / 2), py, 'hurt', white=0.85 if dt < 60 else 0)
    elif pa <= tt < pa + anim_len('char_player', 'dagger'):
        cv.put('char_player', px, py, frame_at('char_player', 'dagger', tt - pa))
    else:
        cv.put('char_player', px, py, frame_at('char_player', 'idle', tt))
    # 좀비
    if za <= tt < za + anim_len('char_zombie', 'attack'):
        cv.put('char_zombie', zx, zy, frame_at('char_zombie', 'attack', tt - za), flip=True)
    elif p_hit <= tt < p_hit + 200:
        dt = tt - p_hit
        cv.put('char_zombie', zx + 5 * math.sin(min(1, dt / 120) * math.pi / 2), zy, 'hurt', flip=True, white=0.85 if dt < 60 else 0)
    else:
        cv.put('char_zombie', zx, zy, frame_at('char_zombie', 'walk', tt), flip=True)
    fx_play(cv, 'fx_swing', 'swing', tt - p_hit, px, py)
    fx_play(cv, 'fx_impact', 'play', tt - z_hit, px + 6, py - 40, scale=0.6)
    fx_play(cv, 'fx_impact', 'play', tt - p_hit, zx - 6, zy - 40, scale=0.6)


def scene_pirate(cv, ox, oy, t):
    tt = t % 1200
    x, y = ox + 80, oy + 162
    s = 300
    if s <= tt < s + anim_len('char_pirate_1', 'attack'):
        cv.put('char_pirate_1', x, y, frame_at('char_pirate_1', 'attack', tt - s))
    else:
        cv.put('char_pirate_1', x, y, frame_at('char_pirate_1', 'idle', tt))
    fx_play(cv, 'fx_swing', 'heavy', tt - s - hit_time('char_pirate_1', 'attack'), x, y)
    cv.put('char_pirate_2', ox + 150, oy + 120, frame_at('char_pirate_2', 'walk', t), flip=True)


def scene_gunner(cv, ox, oy, t):
    tt = t % 2400
    x, y = ox + 60, oy + 162
    if tt < 500:
        fr = 'aim'
    elif tt < 700:
        fr = 'shoot'
    elif tt < 700 + anim_len('char_pirate_3', 'reload'):
        fr = frame_at('char_pirate_3', 'reload', tt - 700)
    else:
        fr = 'idle'
    cv.put('char_pirate_3', x, y, fr)
    mz = A['char_pirate_3']['muzzle']['shoot']
    dt = tt - 500
    if 0 <= dt < 70:
        cv.put('fx_muzzle', x + mz[0], y + mz[1], rot=-10)
    fx_play(cv, 'fx_smoke_puff', 'play', dt, x + mz[0] + 8, y + mz[1] - 6, scale=0.85, alpha=0.9)
    if 0 <= dt < 180:
        cv.put('proj_bullet', x + mz[0] + 60 * dt / 180, y + mz[1] - 10 * dt / 180, rot=-10)


TITLES = ['걷기 (앞모습)', '걷기 (뒷모습)', '나무 베기', '돌 캐기', '총 · 쓰러짐 · 올라옴', '맞기 · 단검 반격', '해적 칼', '총잡이 장전']


def main():
    world = R.ground()
    sx, sy = LY.t2w(30, 41)
    x0, y0 = int(sx - R.G['x']) - 120, int(sy - R.G['y']) - 160
    bg = world.crop((x0, y0, x0 + CW * COLS, y0 + CH * ROWS)).convert('RGBA')
    d = ImageDraw.Draw(bg, 'RGBA')
    for i in range(1, COLS):
        d.line([(i * CW, 0), (i * CW, CH * ROWS)], fill=(255, 255, 255, 120), width=2)
    d.line([(0, CH), (CW * COLS, CH)], fill=(255, 255, 255, 120), width=2)
    bursts = Bursts()
    # 조각 효과는 미리 정해 둔다(같은 시각에 같은 모양)
    for k, s in enumerate([300, 1100, 1900]):
        h = s + hit_time('char_player', 'axe')
        bursts.add(h, 2 * CW + 118, 132, ['wood1', 'wood2', 'leaf1', 'leaf2'], 6, 10 + k)
        h2 = s + hit_time('char_player', 'pick')
        bursts.add(h2, 3 * CW + 118, 146, ['stone1', 'stone2', 'dust'], 6, 20 + k)
    fall = 1900 + hit_time('char_player', 'axe')
    bursts.add(fall + 380, 2 * CW + 170, 150, ['leaf1', 'leaf2', 'leaf3'], 9, 31, up=(190, 350), speed=(60, 160), life=(600, 900), grav=300)
    bursts.add(1900 + hit_time('char_player', 'pick'), 3 * CW + 124, 150, ['stone1', 'stone2', 'stone1'], 8, 32, speed=(120, 240))
    gun_hits = [s + hit_time('char_player', 'gun') + 110 for s in (500, 1700)]
    for k, h in enumerate(gun_hits):
        bursts.add(h, 150 - 10, CH + 120, ['goo'], 5, 40 + k)
    bursts.add(3700, 150, CH + 162, ['dirt', 'dirt', 'dust'], 8, 50, speed=(80, 170), scale=0.7)
    for rep in (0, 2400):
        bursts.add(rep + 200 + hit_time('char_zombie', 'attack'), CW + 72, CH + 120, ['dust'], 3, 60)
        bursts.add(rep + 1200 + hit_time('char_player', 'dagger'), CW + 116, CH + 120, ['goo'], 4, 61)

    frames = []
    n = int(LOOP / 1000 * FPS)
    for k in range(n):
        t = k * 1000 / FPS
        cv = Canvas(bg)
        scene_walk(cv, 0, 0, t, back=False)
        scene_walk(cv, CW, 0, t, back=True)
        scene_chop(cv, 2 * CW, 0, t, bursts, 'tree')
        scene_chop(cv, 3 * CW, 0, t, bursts, 'rock')
        scene_gun(cv, 0, CH, t, bursts)
        scene_melee(cv, CW, CH, t)
        scene_pirate(cv, 2 * CW, CH, t)
        scene_gunner(cv, 3 * CW, CH, t)
        bursts.draw(cv, t)
        big = cv.im.resize((int(cv.im.width * UP), int(cv.im.height * UP)), Image.LANCZOS)
        dd = ImageDraw.Draw(big, 'RGBA')
        for i, title in enumerate(TITLES):
            cx, cy = (i % COLS) * CW * UP + 12, (i // COLS) * CH * UP + 10
            dd.rounded_rectangle((cx, cy, cx + dd.textlength(title, font=R.font(22)) + 20, cy + 36), 12, fill=(251, 246, 234, 230))
            dd.text((cx + 10, cy + 4), title, font=R.font(22), fill=R.INK)
        frames.append(big.convert('RGB'))
    # 모든 장면의 색이 들어가도록 여러 프레임을 모은 그림으로 공통 팔레트를 만든다(프레임마다 바꾸면 배경이 깜빡인다)
    picks = frames[::6]
    w, h = picks[0].width // 2, picks[0].height // 2
    mosaic = Image.new('RGB', (w * len(picks), h))
    for i, f in enumerate(picks):
        mosaic.paste(f.resize((w, h), Image.BILINEAR), (i * w, 0))
    pal = mosaic.quantize(colors=255, method=Image.FASTOCTREE)
    q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    out = os.path.join(R.ROOT, 'preview', 'preview_motion.gif')
    q[0].save(out, save_all=True, append_images=q[1:], duration=int(1000 / FPS), loop=0, optimize=True, disposal=1)
    frames[int(1340 / 1000 * FPS)].save(os.path.join(R.ROOT, 'preview', 'preview_motion.png'))
    print('preview_motion.gif', len(frames), 'frames', os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
