#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
효과음 만들기. 녹음한 소리 없이 수식으로 합성한다(저작권 걱정 없음).   실행: python tools/make_sounds.py
결과: assets/sfx/<이름>.wav (32000Hz, 모노), assets/sfx/sounds.json, assets/manifest.json 의 "sounds"

필요한 것: pip install numpy scipy
소리를 바꾸고 싶으면 아래 함수 하나를 고치고 다시 돌린다. 마음에 드는 녹음 파일이 있으면 같은 이름의 wav 로 바꿔 넣어도 된다.
"""
import json
import os

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sfx')
SR = 32000
RNG = np.random.default_rng(1)


# ------------------------------------------------------------------ 기본 재료
def T(d):
    return np.arange(int(SR * d)) / SR


def silence(d):
    return np.zeros(int(SR * d))


def noise(d, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    return r.uniform(-1, 1, int(SR * d))


def brown(d, seed=None):
    x = np.cumsum(noise(d, seed))
    x = signal.sosfilt(signal.butter(1, 20, 'high', fs=SR, output='sos'), x)
    return x / (np.abs(x).max() + 1e-9)


def filt(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, kind, fs=SR, output='sos'), x)


lp = lambda x, f, o=2: filt(x, 'low', f, o)
hp = lambda x, f, o=2: filt(x, 'high', f, o)
bp = lambda x, f1, f2, o=2: filt(x, 'band', [f1, f2], o)


def dec(d, tau, attack=0.002):
    """빠르게 올라갔다가 tau(초)로 줄어드는 소리 크기"""
    t = T(d)
    return np.minimum(1, t / attack) * np.exp(-t / tau)


def adsr(d, a, r, s=1.0):
    t = T(d)
    e = np.minimum(1, t / max(a, 1e-4)) * s
    tail = np.clip((d - t) / max(r, 1e-4), 0, 1)
    return e * tail


def osc(freq, kind='sine', phase=0.0):
    """freq: 숫자 하나 또는 샘플마다의 주파수 배열"""
    ph = phase + 2 * np.pi * np.cumsum(np.asarray(freq, float)) / SR
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'tri':
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if kind == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    if kind == 'square':
        return np.sign(np.sin(ph))
    raise KeyError(kind)


def glide(d, *pts):
    """주파수 곡선: glide(0.3, (0, 200), (0.1, 400), (0.3, 300)) -> 샘플마다의 값(선형)"""
    t = T(d)
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


def tone(f, d, tau, kind='sine', attack=0.002):
    return osc(np.full(int(SR * d), f), kind) * dec(d, tau, attack)


def partials(f0, d, ratios, taus, amps, attack=0.001):
    """종, 쇠붙이처럼 배음이 정수배가 아닌 소리"""
    out = silence(d)
    for r, tau, a in zip(ratios, taus, amps):
        out += a * osc(np.full(len(out), f0 * r), 'sine', RNG.uniform(0, 6.28)) * dec(d, tau, attack)
    return out


def svf(x, fc, q=4.0):
    """시간에 따라 가운데 주파수가 바뀌는 띠 필터(fc: 숫자 또는 배열)"""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(fc, SR / 7) / SR)
    low = band = 0.0
    out = np.empty_like(x)
    k = 1.0 / q
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - k * band
        band += f[i] * high
        out[i] = band
    return out


def mix(d, *parts):
    """parts: (시작 시각, 소리, 크기)"""
    out = silence(d)
    for at, x, g in parts:
        i = int(at * SR)
        n = min(len(x), len(out) - i)
        if n > 0:
            out[i:i + n] += x[:n] * g
    return out


def grains(d, n, span, f1, f2, glen=(0.004, 0.02), seed=0, decay=True):
    """잘게 부서지는 소리(흙, 돌 부스러기, 바삭함): 짧은 잡음 조각 n 개"""
    r = np.random.default_rng(seed)
    out = silence(d)
    for k in range(n):
        at = r.uniform(0, span)
        g = r.uniform(*glen)
        x = bp(noise(g, int(r.integers(1e9))), f1, f2) * dec(g, g / 3)
        amp = r.uniform(0.4, 1.0) * ((1 - at / max(span, 1e-3)) * 0.7 + 0.3 if decay else 1)
        i = int(at * SR)
        out[i:i + len(x)] += x[:len(out) - i] * amp
    return out


def reverb(x, rt=0.8, wet=0.25, seed=3):
    n = int(SR * rt)
    ir = noise(rt, seed) * np.exp(-np.arange(n) / SR / (rt / 6.9))
    ir = lp(ir, 5000)
    y = signal.fftconvolve(np.concatenate([x, silence(rt)]), ir)[:len(x) + n]
    y = y / (np.abs(y).max() + 1e-9) * np.abs(x).max()
    out = np.concatenate([x, silence(rt)]) * (1 - wet) + y * wet
    return trim_tail(out)


def trim_tail(x, floor=1e-4):
    idx = np.where(np.abs(x) > floor * np.abs(x).max())[0]
    return x[:idx[-1] + 1] if len(idx) else x


def fades(x, fin=0.002, fout=0.012):
    a, b = int(SR * fin), int(SR * fout)
    x = x.copy()
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def level(x, db):
    """가장 큰 0.05초 구간의 RMS 를 db(dBFS)로 맞추고 너무 큰 꼭대기는 부드럽게 누른다."""
    w = int(SR * 0.05)
    p = np.convolve(x * x, np.ones(w) / w, 'same')
    rms = np.sqrt(p.max()) + 1e-9
    y = x * (10 ** (db / 20) / rms)
    return np.tanh(y * 1.1) / np.tanh(1.1) if np.abs(y).max() > 0.9 else y


def loopify(x, xf=0.5):
    """끝부분을 처음에 겹쳐서 이음매 없이 반복되게 한다(길이는 xf 만큼 줄어든다)."""
    n = int(SR * xf)
    body, tail = x[:-n].copy(), x[-n:]
    w = np.linspace(0, 1, n)
    body[:n] = body[:n] * np.sqrt(w) + tail * np.sqrt(1 - w)
    return body


def voice(f0, formants, d, breath=0.15, seed=0):
    """성대 울림(톱니파) + 숨소리를 입 모양(띠 필터 여러 개)에 통과시킨다. formants: [(가운데, 너비, 크기)]"""
    src = osc(f0, 'saw') + breath * noise(d, seed)
    out = silence(d)
    for fc, bw, g in formants:
        out += g * (svf(src, fc, q=max(1.0, np.mean(fc) / bw)) if np.ndim(fc) else bp(src, max(40, fc - bw / 2), fc + bw / 2))
    return out


def chirp_bird(d, f1, f2, seed=0):
    t = T(d)
    f = f1 + (f2 - f1) * (t / d) ** 0.7
    return osc(f, 'sine') * np.sin(np.pi * t / d) ** 1.5 * (0.8 + 0.2 * np.sin(2 * np.pi * 45 * t))


# ------------------------------------------------------------------ 소리들(이름: (만드는 함수, 반복, 설명))
def s_ui_click():
    return level(mix(0.07, (0, hp(noise(0.004), 2000) * dec(0.004, 0.001), 0.6), (0, tone(1800, 0.05, 0.012), 0.7),
                     (0, tone(900, 0.06, 0.02), 0.5)), -24)


def s_ui_error():
    n1 = lp(osc(np.full(int(SR * 0.13), 294), 'tri'), 1500) * adsr(0.13, 0.005, 0.05)
    n2 = lp(osc(np.full(int(SR * 0.18), 220), 'tri'), 1500) * adsr(0.18, 0.005, 0.08)
    return level(mix(0.34, (0, n1, 1), (0.15, n2, 1)), -21)


def s_hit_wood():
    d = 0.35
    thump = osc(glide(d, (0, 190), (0.12, 95), (d, 90))) * dec(d, 0.09)
    res = partials(380, d, (1, 1.63, 3.02), (0.06, 0.05, 0.03), (0.6, 0.4, 0.25))
    click = bp(noise(0.008), 800, 4000) * dec(0.008, 0.003)
    return level(reverb(mix(d, (0, thump, 1), (0, res, 0.8), (0, click, 0.9)), 0.3, 0.12), -14)


def s_hit_stone():
    d = 0.4
    clink = partials(2100, d, (1, 1.6, 2.32, 2.95), (0.12, 0.09, 0.06, 0.04), (1, 0.7, 0.5, 0.3))
    crack = bp(noise(0.012), 1500, 7000) * dec(0.012, 0.004)
    thud = tone(120, d, 0.05)
    return level(reverb(mix(d, (0, clink, 0.7), (0, crack, 1), (0, thud, 0.7)), 0.3, 0.12), -16)


def s_hit_iron():
    d = 0.8
    clang = partials(880, d, (1, 1.003, 1.6, 2.51, 3.6, 5.0), (0.5, 0.5, 0.35, 0.25, 0.15, 0.1), (0.8, 0.5, 0.6, 0.45, 0.3, 0.2))
    return level(reverb(mix(d, (0, clang, 0.7), (0, bp(noise(0.01), 2000, 8000) * dec(0.01, 0.003), 1), (0, tone(110, d, 0.05), 0.6)), 0.4, 0.15), -16)


def s_tree_fall():
    d = 1.7
    f = glide(0.55, (0, 72), (0.3, 60), (0.55, 52)) * (1 + 0.04 * lp(noise(0.55, 5), 30) * 8)
    creak = bp(osc(f, 'saw'), 300, 1800) * adsr(0.55, 0.12, 0.2)
    leaves = bp(noise(0.8, 6), 2000, 8000) * adsr(0.8, 0.25, 0.4) * (0.6 + 0.4 * np.abs(lp(noise(0.8, 7), 30)) * 6)
    crash = lp(brown(0.6, 8), 700) * dec(0.6, 0.18) + osc(glide(0.6, (0, 62), (0.6, 38))) * dec(0.6, 0.22)
    return level(reverb(mix(d, (0, creak, 0.7), (0.35, leaves, 0.35), (0.95, crash, 1.0), (0.95, grains(0.4, 14, 0.3, 300, 2500, seed=9), 0.6)),
                        0.6, 0.22), -13)


def s_rock_break():
    d = 0.7
    return level(reverb(mix(d, (0, bp(noise(0.012), 1000, 6000) * dec(0.012, 0.004), 1), (0, tone(90, 0.3, 0.08), 0.8),
                            (0.01, grains(0.55, 18, 0.45, 600, 3000, seed=11), 0.9)), 0.35, 0.15), -14)


def s_pickup():
    a = osc(glide(0.07, (0, 620), (0.07, 700))) * adsr(0.07, 0.004, 0.03)
    b = osc(glide(0.1, (0, 960), (0.1, 1040))) * adsr(0.1, 0.004, 0.06)
    return level(mix(0.18, (0, a, 1), (0.065, b, 0.9)), -19)


def s_swing():
    d = 0.24
    t = T(d)
    fc = np.interp(t, [0, 0.1, d], [500, 1900, 700])
    env = np.sin(np.pi * t / d) ** 2
    return level(fades(svf(noise(d, 21), fc, 2.5) * env), -20)


def s_hit_enemy():
    d = 0.26
    thud = osc(glide(d, (0, 140), (0.1, 65), (d, 60))) * dec(d, 0.08)
    smack = bp(noise(0.03, 23), 800, 3200) * dec(0.03, 0.008)          # 작은 스피커에서도 들리게
    return level(mix(d, (0, thud, 1), (0, lp(noise(0.04), 1200) * dec(0.04, 0.012), 0.7), (0, smack, 0.8),
                     (0.01, bp(noise(0.08), 300, 900) * dec(0.08, 0.03), 0.6)), -13)


def s_player_hurt():
    d = 0.36
    f0 = glide(0.24, (0, 215), (0.24, 160))
    uh = voice(f0, [(650, 260, 1.0), (1100, 300, 0.6), (2400, 400, 0.25)], 0.24, 0.1, 31) * adsr(0.24, 0.02, 0.12)
    return level(mix(d, (0, s_hit_enemy(), 0.9), (0.03, uh, 0.12)), -14)


def s_zombie_groan():
    d = 1.4
    t = T(d)
    f0 = 80 * (1 + 0.035 * np.sin(2 * np.pi * 5 * t) + 0.02 * lp(noise(d, 41), 8) * 10) * np.interp(t, [0, d], [1.05, 0.9])
    g = voice(f0, [(520, 180, 1.0), (880, 220, 0.7), (2400, 500, 0.2)], d, 0.25, 42)
    env = adsr(d, 0.3, 0.45) * (0.85 + 0.15 * np.sin(2 * np.pi * 3 * t))
    return level(reverb(lp(g * env, 3000), 0.5, 0.2), -17)


def s_zombie_die():
    d = 0.95
    t = T(0.55)
    g = voice(80 * np.interp(t, [0, 0.55], [1.1, 0.6]), [(500, 180, 1.0), (850, 220, 0.6)], 0.55, 0.3, 51) * adsr(0.55, 0.03, 0.25)
    tt = T(0.6)
    poof = svf(noise(0.6, 52), np.interp(tt, [0, 0.6], [2800, 350]), 1.5) * dec(0.6, 0.2, 0.02)
    return level(reverb(mix(d, (0, lp(g, 2500), 0.8), (0.25, poof, 0.9)), 0.4, 0.2), -16)


def s_zombie_rise():
    d = 1.0
    rumble = lp(brown(d, 61), 220) * adsr(d, 0.3, 0.4)
    return level(mix(d, (0, rumble, 0.7), (0.05, grains(0.9, 26, 0.8, 300, 1500, (0.006, 0.03), seed=62, decay=False), 0.9)), -17)


def s_gun_shot():
    d = 0.45
    crack = lp(noise(0.12, 71), 5000) * dec(0.12, 0.025, 0.0005)
    body = bp(noise(0.25, 72), 150, 1000) * dec(0.25, 0.07, 0.001)
    boom = osc(glide(0.3, (0, 85), (0.3, 42))) * dec(0.3, 0.12)
    return level(reverb(mix(d, (0, crack, 1), (0, body, 0.8), (0, boom, 0.9)), 0.9, 0.3), -11)


def s_arrow_shot():
    d = 0.4
    n = int(SR / 196)
    buf = noise(n / SR, 81)
    buf -= buf.mean()
    out = np.zeros(int(SR * 0.3))
    for i in range(len(out)):                                  # 줄 튕기는 소리(Karplus-Strong)
        out[i] = buf[i % n]
        buf[i % n] = 0.5 * (buf[i % n] + buf[(i + 1) % n]) * 0.994
    return level(mix(d, (0, hp(out, 80) * dec(0.3, 0.08), 0.8), (0.02, s_swing(), 0.6)), -17)


def s_construct():
    def knock(f):
        return mix(0.12, (0, partials(f, 0.12, (1, 2.0, 4.6), (0.05, 0.035, 0.02), (1, 0.5, 0.3)), 1),
                   (0, bp(noise(0.004), 1000, 5000) * dec(0.004, 0.0015), 1))
    return level(reverb(mix(0.34, (0, knock(260), 1), (0.11, knock(300), 0.85)), 0.3, 0.1), -15)


def s_collapse():
    d = 0.7
    return level(reverb(mix(d, (0, bp(noise(0.02, 91), 1000, 5000) * dec(0.02, 0.006), 1), (0.005, grains(0.35, 14, 0.3, 2000, 6000, seed=92), 0.7),
                            (0, osc(glide(0.3, (0, 100), (0.3, 60))) * dec(0.3, 0.09), 0.8),
                            (0, partials(330, 0.3, (1, 1.7, 2.9), (0.06, 0.04, 0.03), (0.5, 0.3, 0.2)), 0.6)), 0.35, 0.15), -14)


def bell(f, d, tau=0.35):
    return partials(f, d, (1, 2.0, 3.0, 4.07), (tau, tau * 0.6, tau * 0.4, tau * 0.25), (1, 0.35, 0.15, 0.08), attack=0.003)


def s_craft():
    d = 0.95
    return level(reverb(mix(d, (0, bell(1047, 0.6), 1), (0.12, bell(1568, 0.6), 0.9), (0.24, bell(2093, 0.6), 0.7),
                            (0.24, hp(noise(0.3, 101), 6000) * dec(0.3, 0.08), 0.15)), 0.5, 0.2), -19)


def s_dusk():
    d = 2.2
    b = partials(392, d, (1, 2.0, 2.76, 4.07), (1.6, 1.0, 0.6, 0.4), (1, 0.4, 0.25, 0.12), 0.004)
    pad = osc(np.full(int(SR * d), 98)) * adsr(d, 0.6, 1.0) * 0.5
    return level(reverb(mix(d, (0, b, 1), (0, pad, 0.5)), 1.0, 0.3), -20)


def s_night_start():
    d = 3.0
    t = T(d)
    drone = (np.sin(2 * np.pi * 55 * t) + 0.7 * np.sin(2 * np.pi * 82.6 * t) + 0.5 * np.sin(2 * np.pi * 110.4 * t)) * adsr(d, 1.0, 1.3)
    gong = partials(196, d, (1, 1.48, 2.0, 2.76, 3.9), (2.5, 1.6, 1.2, 0.8, 0.5), (1, 0.6, 0.5, 0.3, 0.15), 0.01)
    swell = bp(noise(d, 141), 200, 900) * adsr(d, 1.2, 1.4) * 0.5
    tt = T(1.6)
    howl = osc(np.interp(tt, [0, 0.5, 1.6], [380, 560, 470]) * (1 + 0.012 * np.sin(2 * np.pi * 5 * tt))) * np.sin(np.pi * tt / 1.6) ** 2
    return level(reverb(mix(d, (0, drone, 0.4), (0, gong, 0.8), (0, swell, 0.35), (0.7, lp(howl, 1500), 0.18)), 1.4, 0.4), -18)


def s_morning():
    d = 2.4
    parts = [(0.12 * i, bell(f, 1.2, 0.5), 1 - 0.1 * i) for i, f in enumerate((523, 659, 784, 1047))]
    for k, at in enumerate((0.75, 0.95, 1.5, 1.62)):
        parts.append((at, chirp_bird(0.07, 2800 + 300 * (k % 2), 4300, k), 0.25))
    return level(reverb(mix(d, *parts), 0.8, 0.25), -18)


def s_heal():
    d = 0.6
    return level(reverb(mix(d, (0, tone(1320, 0.2, 0.08), 1), (0.07, tone(1760, 0.2, 0.08), 0.9), (0.14, tone(2349, 0.25, 0.1), 0.8),
                            (0.05, hp(noise(0.35, 111), 5000) * dec(0.35, 0.12), 0.12)), 0.4, 0.2), -20)


def s_game_over():
    d = 1.9
    parts = []
    for i, f in enumerate((392, 330, 262)):
        n = 0.45 if i < 2 else 0.9
        tt = T(n)
        v = osc(f * (1 + (0.01 * np.sin(2 * np.pi * 5 * tt) if i == 2 else 0)), 'tri') * adsr(n, 0.01, n * 0.6)
        parts.append((0.3 * i, lp(v, 2000), 1))
    return level(reverb(mix(d, *parts), 0.6, 0.25), -18)


def s_victory():
    d = 1.9

    def brass(f, n):
        v = sum(osc(np.full(int(SR * n), f * (1 + dt)), 'saw') for dt in (-0.003, 0.003))
        return lp(v, 2600) * adsr(n, 0.02, n * 0.5)
    parts = [(0, brass(523, 0.13), 0.8), (0.12, brass(659, 0.13), 0.8), (0.24, brass(784, 0.15), 0.8)]
    parts += [(0.4, brass(f, 1.2), 0.5) for f in (523, 659, 784, 1047)]
    return level(reverb(mix(d, *parts), 0.6, 0.22), -17)


def s_tent():
    d = 0.5
    am = np.abs(lp(noise(d, 121), 25)) * 8
    return level(fades(bp(noise(d, 122), 1500, 6000) * np.clip(am, 0, 1) * adsr(d, 0.05, 0.2), 0.01, 0.05), -21)


def s_fire_loop():
    d = 4.5
    r = np.random.default_rng(131)
    out = lp(brown(d, 132), 300) * 0.5 + bp(noise(d, 133), 2000, 6000) * 0.04
    for _ in range(int(9 * d)):                                       # 탁탁 튀는 소리
        at, g = r.uniform(0, d - 0.02), r.uniform(0.2, 1.0)
        x = hp(noise(0.003, int(r.integers(1e9))), 2000) * dec(0.003, 0.001) if r.random() < 0.7 else tone(r.uniform(900, 1500), 0.012, 0.004)
        i = int(at * SR)
        out[i:i + len(x)] += x * g
    return level(loopify(out, 0.5), -27)


def s_ship_bell():
    d = 2.4
    def strike():
        return mix(1.8, (0, partials(620, 1.8, (1, 2.0, 2.6, 3.0, 4.2), (1.5, 0.9, 0.6, 0.5, 0.3), (1, 0.4, 0.35, 0.2, 0.1), 0.002), 1),
                   (0, bp(noise(0.01), 2000, 8000) * dec(0.01, 0.003), 1))
    return level(reverb(mix(d, (0, strike(), 1), (0.5, strike(), 0.9)), 0.9, 0.3), -16)


def creak(d, f_from, f_to, seed):
    t = T(d)
    f = np.interp(t, [0, d], [f_from, f_to]) * (1 + 0.06 * lp(noise(d, seed), 20) * 8)
    return bp(osc(f, 'saw'), 600, 2200) * adsr(d, 0.04, 0.12)


def s_gate_open():
    return level(mix(0.55, (0, bp(noise(0.006), 1500, 6000) * dec(0.006, 0.002), 0.6), (0.02, creak(0.5, 110, 165, 141), 1)), -19)


def s_gate_close():
    knock = mix(0.15, (0, partials(240, 0.15, (1, 2.1, 4.3), (0.05, 0.03, 0.02), (1, 0.5, 0.3)), 1),
                (0, bp(noise(0.004), 1000, 5000) * dec(0.004, 0.0015), 1))
    return level(mix(0.5, (0, creak(0.26, 160, 100, 151), 0.8), (0.27, knock, 1)), -17)


def s_till():
    d = 0.32
    return level(mix(d, (0, bp(noise(0.1, 161), 300, 2500) * dec(0.1, 0.03), 1), (0.01, grains(0.2, 9, 0.12, 900, 3000, seed=162), 0.6),
                     (0, tone(110, 0.15, 0.05), 0.7)), -17)


def s_plant():
    d = 0.26
    return level(mix(d, (0, lp(noise(0.06, 171), 800) * dec(0.06, 0.02), 1), (0, tone(140, 0.1, 0.035), 0.7),
                     (0.03, grains(0.15, 5, 0.1, 1500, 4000, seed=172), 0.3)), -21)


def s_water_pour():
    d = 0.9
    t = T(d)
    am = 0.55 + 0.45 * np.clip(lp(noise(d, 181), 40) * 9, -1, 1)
    stream = bp(noise(d, 182), 1200, 5000) * am * adsr(d, 0.08, 0.22)
    parts = [(0, stream, 0.8)]
    r = np.random.default_rng(183)
    for _ in range(10):
        n = r.uniform(0.012, 0.022)
        parts.append((r.uniform(0.05, 0.7), osc(glide(n, (0, r.uniform(600, 900)), (n, r.uniform(1300, 1900)))) * np.sin(np.pi * T(n) / n), 0.25))
    return level(mix(d, *parts), -21)


def s_harvest():
    d = 0.42
    pop = osc(glide(0.06, (0, 240), (0.04, 520), (0.06, 540))) * dec(0.06, 0.03)
    rustle = bp(noise(0.25, 191), 2000, 6000) * np.clip(np.abs(lp(noise(0.25, 192), 30)) * 8, 0, 1) * adsr(0.25, 0.03, 0.12)
    return level(mix(d, (0, pop, 1), (0.02, rustle, 0.4), (0.08, tone(1568, 0.25, 0.08), 0.15)), -18)


def s_eat():
    d = 0.5
    parts = []
    for k, at in enumerate((0, 0.15, 0.3)):
        parts += [(at, grains(0.06, 7, 0.04, 1000, 5000, (0.003, 0.012), seed=200 + k), 0.9), (at, tone(150, 0.06, 0.02), 0.4)]
    return level(mix(d, *parts), -18)


def s_dog_bark():
    d = 0.26
    f0 = glide(0.2, (0, 300), (0.035, 470), (0.2, 250))
    v = voice(f0, [(520, 200, 1.0), (1150, 300, 0.7), (2600, 600, 0.25)], 0.2, 0.35, 211) * adsr(0.2, 0.008, 0.12)
    huff = bp(noise(0.03, 212), 500, 3000) * dec(0.03, 0.01)
    return level(mix(d, (0, huff, 0.4), (0.005, lp(v, 4000), 1)), -15)


def s_cat_meow():
    d = 0.75
    t = T(d)
    f0 = np.interp(t, [0, 0.25, 0.6, d], [520, 780, 600, 560]) * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    src = osc(f0, 'saw') * 0.7 + osc(f0 * 2, 'sine') * 0.2 + 0.05 * noise(d, 221)
    f1 = np.interp(t, [0, 0.12, 0.35, 0.6, d], [350, 380, 850, 600, 420])
    f2 = np.interp(t, [0, 0.12, 0.35, 0.6, d], [2300, 2200, 1500, 1100, 900])
    v = svf(src, f1, 5) + 0.6 * svf(src, f2, 6) + 0.2 * svf(src, np.full(len(t), 3000.0), 4)
    env = adsr(d, 0.06, 0.18) * np.interp(t, [0, 0.1, d], [0.5, 1, 1])
    return level(lp(v * env, 5000), -17)


def s_rain_loop():
    d = 4.5
    r = np.random.default_rng(231)
    wash = lp(hp(noise(d, 232), 400), 8000) * (0.75 + 0.25 * np.sin(2 * np.pi * T(d) / d * 2))
    out = wash * 0.25 + lp(brown(d, 233), 250) * 0.15
    for _ in range(int(70 * d)):
        at, g = r.uniform(0, d - 0.01), r.uniform(0.1, 0.6)
        x = bp(noise(0.002, int(r.integers(1e9))), 2000, 7000) * dec(0.002, 0.0008)
        i = int(at * SR)
        out[i:i + len(x)] += x * g
    return level(loopify(out, 0.5), -25)


def s_wind_loop():
    d = 6.5
    t = T(d)
    fc = 420 + 180 * np.sin(2 * np.pi * 0.13 * t) + 90 * np.sin(2 * np.pi * 0.31 * t + 1)
    w = svf(noise(d, 241), fc, 3.0) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.17 * t) ** 2)
    whistle = svf(noise(d, 242), 1400 + 150 * np.sin(2 * np.pi * 0.21 * t), 12) * 0.08
    return level(loopify(w + whistle, 0.5), -27)


def s_amb_day():
    d = 8.5
    wind = s_wind_loop()
    base = np.resize(wind, int(SR * d)) * 0.25
    parts = [(0, base, 1)]
    r = np.random.default_rng(251)
    for at in (0.6, 2.4, 4.1, 5.9, 7.0):                               # 새소리(이음매에 걸리지 않게)
        for k in range(int(r.integers(2, 5))):
            n = r.uniform(0.04, 0.09)
            parts.append((at + k * r.uniform(0.09, 0.14), chirp_bird(n, r.uniform(2400, 3300), r.uniform(3600, 4600), k), 0.22))
    return level(loopify(mix(d, *parts), 0.5), -29)


def s_amb_night():
    d = 6.0
    t = T(d)

    def cricket(fc, period, offset, n_pulse=3):
        g = np.zeros(len(t))
        for start in np.arange(offset, d, period):
            for k in range(n_pulse):
                a, b = int((start + k * 0.03) * SR), int((start + k * 0.03 + 0.018) * SR)
                if b < len(g):
                    g[a:b] = np.sin(np.linspace(0, np.pi, b - a))
        return np.sin(2 * np.pi * fc * t) * g
    c = cricket(4300, 0.5, 0.05) + 0.7 * cricket(4700, 0.6, 0.27, 4)      # 0.5초, 0.6초 주기 -> 6초에 딱 맞아 이음매가 없다
    wind = np.resize(s_wind_loop(), len(t)) * 0.1
    return level(c * 0.6 + wind, -29)


def s_hungry():
    """배고픔 경고: 꾸르륵(작은 스피커에서도 들리게 200~500Hz 대역)"""
    d = 1.0
    t = T(d)
    am = np.clip(lp(noise(d, 281), 12) * 14, 0, 1) ** 1.5
    gurgle = svf(noise(d, 282), 260 + 140 * np.sin(2 * np.pi * 3.3 * t) + 60 * lp(noise(d, 283), 6) * 10, 7) * am
    growl = bp(osc(glide(0.6, (0, 75), (0.3, 110), (0.6, 85)), 'saw'), 150, 600) * adsr(0.6, 0.08, 0.25)
    return level(fades(mix(d, (0, gurgle, 1), (0.2, growl, 0.5)), 0.02, 0.1), -19)


def s_step():
    return level(mix(0.12, (0, lp(noise(0.05, 261), 900) * dec(0.05, 0.015), 1), (0, tone(110, 0.08, 0.025), 0.6)), -27)


def s_step_snow():
    return level(mix(0.18, (0, grains(0.16, 11, 0.1, 1500, 5000, (0.004, 0.015), seed=271), 1),
                     (0, lp(noise(0.08, 272), 1200) * dec(0.08, 0.03), 0.4)), -25)



# ---- 17장: 지하
def s_dig_dirt():
    """곡괭이로 흙벽을 찍을 때: 둔탁한 퍽 + 흙 부스러기(작은 스피커에서도 들리게 300~3000Hz 를 살린다)"""
    d = 0.42
    thud = bp(noise(0.08, 291), 250, 1400) * dec(0.08, 0.022)
    body = mix(0.16, (0, tone(92, 0.16, 0.05), 0.3), (0, tone(185, 0.12, 0.035), 0.8), (0, tone(290, 0.08, 0.02), 0.6))
    crumble = grains(0.3, 22, 0.26, 600, 3600, (0.004, 0.02), seed=292)
    return level(mix(d, (0, thud, 1.3), (0, body, 0.6), (0.025, crumble, 1.4)), -15)


def s_ladder():
    """사다리 한 칸: 나무 똑 + 짧은 삐걱"""
    knock = mix(0.12, (0, partials(410, 0.12, (1, 2.4, 4.1), (0.04, 0.025, 0.015), (1, 0.45, 0.25)), 1),
                (0, bp(noise(0.004, 301), 1500, 6000) * dec(0.004, 0.0015), 0.7))
    return level(mix(0.3, (0, knock, 1), (0.05, creak(0.2, 180, 150, 302), 0.35)), -21)


def s_amb_underground():
    """지하 배경(반복): 낮은 웅웅거림 + 가끔 물방울"""
    d = 8.0
    t = T(d)
    rumble = lp(brown(d, 311), 140) * (0.75 + 0.25 * np.sin(2 * np.pi * t / d * 2))     # 8초에 두 번 -> 이음매 없음
    air = bp(noise(d, 312), 260, 700) * (0.8 + 0.2 * np.sin(2 * np.pi * t / d * 4)) * 0.22
    parts = [(0, rumble * 0.55 + air, 1)]
    for at, f0 in ((1.1, 980), (3.05, 1240), (4.7, 860), (6.35, 1120)):                 # 물방울(이음매에서 먼 곳)
        n = 0.09
        drip = osc(glide(n, (0, f0), (0.016, f0 * 1.7), (n, f0 * 1.75))) * dec(n, 0.03, 0.001)
        parts.append((at, reverb(drip, 0.7, 0.45, seed=313), 0.6))
    return level(loopify(mix(d, *parts), 0.5), -28)

SOUNDS = {
    # 화면 UI
    'ui_click': (s_ui_click, False, '버튼, 카드를 누를 때'),
    'ui_error': (s_ui_error, False, '재료가 부족할 때, 할 수 없는 일을 눌렀을 때'),
    # 캐기
    'hit_wood': (s_hit_wood, False, '나무를 칠 때(도끼, 단검)'),
    'hit_stone': (s_hit_stone, False, '돌을 칠 때(곡괭이)'),
    'hit_iron': (s_hit_iron, False, '철광석을 칠 때'),
    'tree_fall': (s_tree_fall, False, '나무가 넘어갈 때'),
    'rock_break': (s_rock_break, False, '돌, 철광석이 부서질 때'),
    'pickup': (s_pickup, False, '재료나 아이템을 얻을 때'),
    # 싸움
    'swing': (s_swing, False, '휘두를 때(주인공, 해적)'),
    'hit_enemy': (s_hit_enemy, False, '적이 맞을 때(단검, 화살, 총알, 개)'),
    'player_hurt': (s_player_hurt, False, '주인공이 맞을 때'),
    'zombie_groan': (s_zombie_groan, False, '좀비가 나타났을 때, 가끔 신음'),
    'zombie_die': (s_zombie_die, False, '좀비가 쓰러질 때'),
    'zombie_rise': (s_zombie_rise, False, '좀비가 땅에서 올라올 때'),
    'gun_shot': (s_gun_shot, False, '총(주인공, 총 타워, 총잡이 해적)'),
    'arrow_shot': (s_arrow_shot, False, '망루가 화살을 쏠 때'),
    # 짓기와 만들기
    'construct': (s_construct, False, '시설을 지을 때'),
    'collapse': (s_collapse, False, '시설이 부서질 때'),
    'craft': (s_craft, False, '도구를 만들었을 때'),
    # 하루
    'dusk': (s_dusk, False, '저녁이 시작될 때("곧 밤이 됩니다")'),
    'night_start': (s_night_start, False, '밤이 시작될 때'),
    'morning': (s_morning, False, '아침이 될 때'),
    'heal': (s_heal, False, '하트가 찰 때'),
    'game_over': (s_game_over, False, '쓰러졌을 때'),
    'victory': (s_victory, False, '첫 밤을 넘긴 결과 창'),
    'tent': (s_tent, False, '텐트에 들어가고 나올 때'),
    'fire_loop': (s_fire_loop, True, '모닥불 곁(반복, 거리에 따라 크기)'),
    'ship_bell': (s_ship_bell, False, '해적선이 나타날 때'),
    # 3단계: 문, 농사, 동물
    'gate_open': (s_gate_open, False, '문이 열릴 때'),
    'gate_close': (s_gate_close, False, '문이 닫힐 때'),
    'till': (s_till, False, '괭이로 밭을 갈 때'),
    'plant': (s_plant, False, '씨앗을 심을 때'),
    'water_pour': (s_water_pour, False, '물을 줄 때'),
    'harvest': (s_harvest, False, '작물을 거둘 때'),
    'eat': (s_eat, False, '먹을 때'),
    'hungry': (s_hungry, False, '배가 고플 때(배부름이 1 남았을 때, 굶을 때)'),
    'dog_bark': (s_dog_bark, False, '강아지가 짖을 때'),
    'cat_meow': (s_cat_meow, False, '고양이가 울 때'),
    # 날씨와 배경
    'rain_loop': (s_rain_loop, True, '비(반복)'),
    'wind_loop': (s_wind_loop, True, '눈 오는 날의 바람(반복)'),
    'amb_day': (s_amb_day, True, '낮 배경(반복, 새소리)'),
    'amb_night': (s_amb_night, True, '밤 배경(반복, 풀벌레)'),
    'step': (s_step, False, '발소리(풀, 모래)'),
    'step_snow': (s_step_snow, False, '발소리(눈)'),
    # 17장: 지하
    'dig_dirt': (s_dig_dirt, False, '흙벽을 찍을 때(지하 파기 한 번)'),
    'ladder': (s_ladder, False, '사다리를 오르내릴 때(두 프레임에 한 번)'),
    'amb_underground': (s_amb_underground, True, '지하 배경(반복, 낮은 울림과 물방울)'),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, (fn, loop, note) in SOUNDS.items():
        x = fn()
        x = x if loop else fades(trim_tail(x), 0.0015, 0.015)
        x = np.clip(x, -0.98, 0.98)
        wavfile.write(os.path.join(OUT, name + '.wav'), SR, (x * 32767).astype(np.int16))
        meta[name] = dict(file=f'sfx/{name}.wav', duration=round(len(x) / SR, 3), loop=loop, note=note)
    json.dump(meta, open(os.path.join(OUT, 'sounds.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    man_path = os.path.join(ROOT, 'assets', 'manifest.json')
    if os.path.exists(man_path):                                    # 그림 목록에도 넣어 둔다
        man = json.load(open(man_path, encoding='utf-8'))
        man['sounds'] = meta
        json.dump(man, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    size = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(len(meta), 'sounds,', round(size / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
