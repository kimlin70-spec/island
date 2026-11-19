# -*- coding: utf-8 -*-
"""
수채화 그림책풍으로 그리는 도구.

도형 목록(artlib) -> 벡터로 칠하기 -> 가장자리를 흔들고, 물감 얼룩과 가장자리 고임을 넣고,
끊어지는 연필선을 두른다 -> 저장 크기로 줄인다.
"""
import io
import math
import zlib

import cairosvg
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

import artlib as A

PAL = {
    'shadow': '#5b6fa3',
    'leafA_l': '#bcd892', 'leafA': '#8fbb78', 'leafA_d': '#679a70',
    'leafB_l': '#d6de92', 'leafB': '#aac474', 'leafB_d': '#82a667',
    'leafW_l': '#f8d49b', 'leafW': '#eba876', 'leafW_d': '#d58462',
    'pine_l': '#8dbba1', 'pine': '#669a86', 'pine_d': '#4c7d70',
    'trunk': '#9b7b63', 'trunk_d': '#7d604d',
    'palm_l': '#c0d88d', 'palm': '#93bd77', 'palm_d': '#6d9f6b', 'coconut': '#7d604d',
    'rock_l': '#e0dbd3', 'rock': '#c0b9b1', 'rock_d': '#a09993',
    'berry': '#d9655f', 'stump_top': '#e2caa5',
    'canvas_l': '#fcf6e8', 'canvas': '#eee0c5', 'canvas_d': '#dcc8a6', 'canvas_dd': '#a8947a', 'stripe': '#d97762',
    'door': '#6a5a5e', 'door_lit': '#ffdb85', 'rope': '#a8947a',
    'stone_l': '#d6d0c9', 'stone': '#b8b0ab', 'stone_d': '#989090',
    'wood_l': '#dcc097', 'wood': '#c09a70', 'wood_d': '#9a7656',
    'fire_o': '#f59a4a', 'fire_y': '#fbe08a',
    'skin': '#f7d8be', 'skin_d': '#e9bd9d', 'hair': '#5f4438', 'tee': '#dd6a55', 'tee_d': '#c0513f',
    'pants': '#63809f', 'pants_d': '#516b88', 'shoe': '#6b4c3e', 'ink': '#4a3d42', 'white': '#fffdf6', 'blush': '#ee9a8f',
    'zskin': '#b5d6a8', 'zskin_d': '#97bf8f', 'zhair': '#6b876a', 'zshirt': '#a493c7', 'zshirt_d': '#8676aa',
    'zpants': '#6b6f82', 'zpatch': '#c9bbe6',
    'pskin': '#efc7a8', 'pcoat': '#a9505a', 'pcoat_d': '#8a3f4a', 'ppants': '#525872', 'hat': '#3d3745',
    'bandana': '#cf5a63', 'pstripe': '#cf5a63', 'pwhite': '#fbf5e8', 'steel': '#cdd3d8', 'gold': '#e8bf5c', 'beard': '#74564a',
    'hull': '#8e6a58', 'hull_l': '#ae866c', 'hull_d': '#6b4f45', 'deck': '#d6b790', 'mast': '#74574a',
    'sail_l': '#fdf7e9', 'sail': '#efe5cc', 'sail_d': '#d9cbab', 'flag': '#3d3745', 'foam': '#ffffff', 'lamp': '#ffdb85',
    'heart': '#e0625c', 'heart_l': '#f4a59a', 'heart_e': '#d9d2c8', 'sun': '#f6cf5e', 'sun_d': '#eaa94a', 'moon': '#f7ebb4',
    'puff_d': '#dfe3e8', 'ok': '#5fe07a', 'no': '#f2605a',
    # 2단계: 철, 총, 방어 시설
    'metal_l': '#b3bbc6', 'metal': '#7c8591', 'metal_d': '#5a616d', 'brass': '#d9a94e',
    'iron_l': '#b7a8a3', 'iron': '#988986', 'iron_d': '#76696b', 'rust_l': '#eaa877', 'rust': '#d07d4f', 'rust_d': '#a65f43',
    'ore': '#4c4855', 'ore_hi': '#d5dde8', 'wire': '#6a6672', 'string': '#f4ecd8', 'fletch': '#d9655f',
    'smoke_l': '#f1f2f5', 'smoke': '#d7dbe3', 'smoke_d': '#b7becb',
    'pgun': '#4f7f86', 'pgun_d': '#3e676e', 'hatb': '#5c4739', 'patch': '#3d3745', 'leather': '#8a5d45',
    # 움직임과 효과
    'dirt_l': '#c9ae8c', 'dirt': '#a98d6c', 'dirt_d': '#8a7057', 'dirt_dd': '#5e4b3e',
    'swish': '#f7fbff', 'swish_d': '#cfe2f1', 'dust_l': '#f1ebdf', 'dust': '#e2d8c6', 'dust_d': '#c8bba4',
    'vanish_l': '#c4b6dd', 'vanish': '#9786b4', 'vanish_d': '#73648f', 'splash': '#cde9f1', 'splash_d': '#97c9dc',
    'goo': '#a9cf8f', 'goo_d': '#82ad6f', 'foot': '#c7b088', 'ember': '#ffb35c', 'pink': '#f4a0a0',
    # 3단계: 문, 농사, 반려동물
    'soil_l': '#d2ae84', 'soil': '#b68f67', 'soil_d': '#977252', 'soil_dd': '#6f5541',
    'wsoil_l': '#a5876b', 'wsoil': '#866850', 'wsoil_d': '#69503d',
    'carrot': '#f08a38', 'carrot_d': '#cc6a26', 'corn': '#f6d35e', 'corn_d': '#d9ab3b', 'husk': '#bfd27e', 'tassel': '#dcbd6c',
    'pumpkin_l': '#f9b766', 'pumpkin': '#ec8e3b', 'pumpkin_d': '#c76b28', 'stem': '#7f8f4f',
    'can_l': '#b9dcd3', 'can': '#82b9ac', 'can_d': '#60998c', 'packet': '#f7efde', 'packet_d': '#e0d2b6',
    'dog': '#fbf6ec', 'dog_d': '#e3d6c1', 'dogp': '#c98f5f', 'dogp_d': '#a7734a', 'collar': '#4f86c6', 'tongue': '#ef8b8b',
    'cat': '#f3a85f', 'cat_d': '#da8c47', 'cat_l': '#fde8cc', 'cat_s': '#c87336', 'zzz': '#8ea6d8', 'note': '#8a79b8',
}
PENCIL = np.array([84, 70, 64], np.float32) / 255
SHADOW_ALPHA = 0.30


def seed_of(name):
    return zlib.crc32(name.encode('utf-8')) % 90000 + 17


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def prim_svg(p, seam=0.6):
    o = p[-1]
    col = PAL[p[3] if p[0] == 'L' else p[2]]
    ops = f' opacity="{f(o["op"])}"' if 'op' in o else ''
    if p[0] == 'P':
        pts = " ".join(f"{f(x)},{f(y)}" for x, y in p[1])
        return f'<polygon points="{pts}" fill="{col}" stroke="{col}" stroke-width="{seam}" stroke-linejoin="round"{ops}/>'
    if p[0] == 'E':
        cx, cy, rx, ry, rot = p[1]
        t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ''
        return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{col}"{t}{ops}/>'
    pts = " ".join(f"{f(x)},{f(y)}" for x, y in p[1])
    return (f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{f(p[2])}" '
            f'stroke-linecap="round" stroke-linejoin="round"{ops}/>')


def render_svg(body, w, h):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'
    png = cairosvg.svg2png(bytestring=svg.encode('utf-8'), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def render_layers(prims, box):
    """도형 목록을 box=(x0,y0,x1,y1) 크기의 그림 세 장(바닥, 그림자, 몸체)으로."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    groups = {'ground': [], 'shadow': [], 'body': []}
    for p in prims:
        o = p[-1]
        layer = 'shadow' if o.get('tag') == 'shadow' else 'ground' if o.get('ground') else 'body'
        groups[layer].append(prim_svg(p))
    out = {}
    for name, parts in groups.items():
        out[name] = render_svg(f'<g transform="translate({-x0} {-y0})">{"".join(parts)}</g>', w, h) if parts else None
    return out


# ------------------------------------------------------------------ 잡음
def noise(h, w, wavelength, seed, octaves=1):
    rng = np.random.default_rng(seed)
    total = np.zeros((h, w), np.float32)
    amp, norm, wl = 1.0, 0.0, float(wavelength)
    for _ in range(octaves):
        gh, gw = int(h / wl) + 4, int(w / wl) + 4
        g = rng.random((gh, gw), dtype=np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((max(1, int(gw * wl)), max(1, int(gh * wl))), Image.BICUBIC)
        a = np.asarray(im, np.float32)[int(wl):int(wl) + h, int(wl):int(wl) + w] / 255.0
        total += (a - 0.5) * 2 * amp
        norm += amp
        amp *= 0.5
        wl = max(2.0, wl / 2)
    return total / norm


def aniso_noise(h, w, lx, ly, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((int(h / ly) + 4, int(w / lx) + 4), dtype=np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((int(g.shape[1] * lx), int(g.shape[0] * ly)), Image.BICUBIC)
    a = np.asarray(im, np.float32)[int(ly):int(ly) + h, int(lx):int(lx) + w] / 255.0
    return (a - 0.5) * 2


def displace(a, dx, dy):
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    coords = [ys + dy, xs + dx]
    return np.stack([ndi.map_coordinates(a[..., i], coords, order=1, mode='constant') for i in range(a.shape[2])], -1)


# ------------------------------------------------------------------ 수채화 효과
def watercolor(img, seed, pencil=1.0, wobble=1.0):
    a = np.asarray(img, np.float32) / 255.0
    h, w = a.shape[:2]
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    if wobble:
        dx = (noise(h, w, 28, seed) * 2.6 + noise(h, w, 9, seed + 1) * 0.9) * wobble
        dy = (noise(h, w, 28, seed + 2) * 2.6 + noise(h, w, 9, seed + 3) * 0.9) * wobble
        pm = displace(pm, dx, dy)
    for i in range(4):
        pm[..., i] = ndi.gaussian_filter(pm[..., i], 0.7)
    alpha = np.clip(pm[..., 3], 0, 1)
    rgb = pm[..., :3] / np.maximum(alpha[..., None], 1e-4)
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    rgb *= (1 + 0.075 * noise(h, w, 34, seed + 4) + 0.04 * noise(h, w, 8, seed + 5))[..., None]      # 물감 농도 얼룩
    pool = alpha * (1 - ndi.gaussian_filter(alpha, 3.4))                                              # 가장자리 고임
    rgb *= (1 - 0.6 * np.clip(pool * 2.2, 0, 1))[..., None]
    if pencil:
        gx, gy = ndi.sobel(lum * alpha, 1), ndi.sobel(lum * alpha, 0)
        inner = np.clip(np.hypot(gx, gy) * 1.6 - 0.18, 0, 1) * (ndi.gaussian_filter(alpha, 1.5) > 0.93)
        s = ndi.gaussian_filter(alpha, 1.05)
        band = np.clip(s * (1 - s) * 4.0, 0, 1) ** 1.6
        tex = 0.5 + 0.5 * noise(h, w, 13, seed + 6)
        pa = np.clip(band * (0.35 + 0.6 * tex) * 0.78 + inner * 0.22 * tex, 0, 1) * pencil
        rgb = rgb * (1 - pa[..., None]) + PENCIL * pa[..., None]
        alpha = np.maximum(alpha, pa * 0.9)
    out = np.dstack([np.clip(rgb, 0, 1), alpha])
    return Image.fromarray((out * 255).astype(np.uint8))


def paint(prims, box, seed, pencil=1.0, wobble=1.0, shadow_alpha=SHADOW_ALPHA):
    """도형 목록 -> 마스터 크기의 완성 그림 한 장(바닥 장식 + 그림자 + 몸체)."""
    layers = render_layers(prims, box)
    w, h = box[2] - box[0], box[3] - box[1]
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if layers['ground'] is not None:
        out.alpha_composite(watercolor(layers['ground'], seed + 50, pencil=0.0, wobble=wobble))
    if layers['shadow'] is not None:
        sh = np.asarray(layers['shadow'].filter(ImageFilter.GaussianBlur(5))).copy()
        sh[..., 3] = (sh[..., 3].astype(np.float32) * shadow_alpha).astype(np.uint8)
        out.alpha_composite(Image.fromarray(sh))
    if layers['body'] is not None:
        out.alpha_composite(watercolor(layers['body'], seed, pencil, wobble))
    return out


def shrink(img, scale=A.SCALE):
    w, h = img.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    return img.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')


def trim(img, anchor, pad=2):
    """빈 여백을 잘라 내고, 바뀐 기준점을 돌려준다."""
    a = np.asarray(img)[..., 3] > 6
    ys, xs = np.where(a)
    x0, x1 = max(0, xs.min() - pad), min(img.width, xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(img.height, ys.max() + 1 + pad)
    return img.crop((x0, y0, x1, y1)), (anchor[0] - x0, anchor[1] - y0)


def sprite(prims, name, box=None, pencil=1.0, wobble=1.0, keep_box=False, symmetric=False):
    """도형 목록 -> (저장 크기 그림, 기준점). 기준점은 도형 좌표의 (0,0)."""
    box = box or A.bbox(prims, 12)
    if symmetric:
        m = max(abs(box[0]), abs(box[2]))
        box = (-m, box[1], m, box[3])
    img = shrink(paint(prims, box, seed_of(name), pencil, wobble))
    k = img.width / (box[2] - box[0])
    anchor = (-box[0] * k, -box[1] * img.height / (box[3] - box[1]))
    if keep_box:
        return img, anchor
    return trim(img, anchor)


def frame_prims(spec):
    """한 프레임의 모든 도형(크기 계산용). spec = 도형 목록 또는 {'under','body','over','clip'}"""
    if isinstance(spec, dict):
        return spec['under'] + spec['body'] + spec['over']
    return spec


def sprite_layers(spec, name, box, pencil=1.0, wobble=1.0):
    """층으로 나뉜 프레임(땅에서 올라오는 좀비 등): 뒤층 -> 몸(clip 높이 아래는 지움) -> 앞층. 크기와 기준점은 box 그대로."""
    if not isinstance(spec, dict):
        return sprite(spec, name, box=box, keep_box=True, pencil=pencil, wobble=wobble)
    under, anchor = sprite(spec['under'], name + '_u', box=box, keep_box=True, pencil=pencil, wobble=wobble)
    body, _ = sprite(spec['body'], name, box=box, keep_box=True, pencil=pencil, wobble=wobble)
    over, _ = sprite(spec['over'], name + '_o', box=box, keep_box=True, pencil=pencil, wobble=wobble)
    a = np.asarray(body).copy()
    cut = int(round(anchor[1] + spec['clip'] * A.SCALE))
    a[max(0, cut):, :, 3] = 0
    out = under.copy()
    out.alpha_composite(Image.fromarray(a))
    out.alpha_composite(over)
    return out, anchor
