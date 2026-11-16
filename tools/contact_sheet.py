#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""그림 전체를 한 장에 모아 보는 미리보기.   실행: python tools/contact_sheet.py  ->  preview/preview_assets.png"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
WIDTH = 1900
GROUPS = [('사물', 'object', (186, 208, 144)), ('시설', 'build', (186, 208, 144)), ('캐릭터 (가로로 이어진 프레임)', 'char', (186, 208, 144)),
          ('아이콘', 'icon', (251, 246, 234)), ('바닥 표시, 효과', 'overlay fx', (186, 208, 144)), ('빛 (밤 화면용)', 'light', (58, 62, 96))]


def font(size):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "C:/Windows/Fonts/malgun.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main(out='preview_assets.png'):
    man = json.load(open(os.path.join(ASSETS, 'manifest.json'), encoding='utf-8'))['assets']
    rows = []                                   # (종류, 제목 또는 [(key, image)], 배경색, 줄 높이)
    for title, kinds, bg in GROUPS:
        items = [(k, v) for k, v in man.items() if v['kind'] in kinds.split()]
        if not items:
            continue
        rows.append(('title', title, bg, 44))
        line, x, hmax = [], 16, 0
        for k, v in items:
            im = Image.open(os.path.join(ASSETS, v['file'])).convert('RGBA')
            if v['kind'] == 'light':
                im = im.resize((160, 160), Image.LANCZOS)
            w = max(im.width, int(len(k) * 8.2)) + 22
            if x + w > WIDTH and line:
                rows.append(('items', line, bg, hmax + 40))
                line, x, hmax = [], 16, 0
            line.append((k, im, x, w))
            x += w
            hmax = max(hmax, im.height)
        rows.append(('items', line, bg, hmax + 40))
    sheet = Image.new('RGBA', (WIDTH, sum(r[3] for r in rows)), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    y = 0
    for kind, content, bg, h in rows:
        d.rectangle((0, y, WIDTH, y + h), fill=bg + (255,))
        if kind == 'title':
            d.text((16, y + 8), content, fill=(40, 36, 30) if sum(bg) > 300 else (240, 236, 226), font=font(24))
        else:
            for k, im, x, w in content:
                sheet.alpha_composite(im, (x + (w - im.width) // 2, y + h - 30 - im.height))
                d.text((x + 4, y + h - 24), k, fill=(40, 36, 30) if sum(bg) > 300 else (240, 236, 226), font=font(14))
        y += h
    os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
    sheet.convert('RGB').save(os.path.join(ROOT, 'preview', out))
    print(out, sheet.size)


if __name__ == '__main__':
    main()
