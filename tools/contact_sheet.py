#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""에셋 전체를 한 장에 모아 보는 미리보기. 실행: python tools/contact_sheet.py"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")


def font(size):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
              "C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main(kinds=None, out="preview_assets.png", scale=1.0, cols=8, bg=(120, 190, 120)):
    man = json.load(open(os.path.join(ASSETS, "manifest.json"), encoding="utf-8"))["assets"]
    items = [(k, v) for k, v in man.items() if not kinds or v["kind"] in kinds]
    cell_w = int(max(v["w"] for _, v in items) * scale) + 24
    cell_h = int(max(v["h"] for _, v in items) * scale) + 44
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), bg + (255,))
    d = ImageDraw.Draw(sheet)
    ft = font(15)
    for i, (k, v) in enumerate(items):
        im = Image.open(os.path.join(ASSETS, v["file"])).convert("RGBA")
        if scale != 1.0:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        cx, cy = (i % cols) * cell_w, (i // cols) * cell_h
        x = cx + (cell_w - im.width) // 2
        y = cy + cell_h - 30 - im.height
        sheet.alpha_composite(im, (x, y))
        d.text((cx + 6, cy + cell_h - 24), k, fill=(20, 30, 20), font=ft)
    os.makedirs(os.path.join(ROOT, "preview"), exist_ok=True)
    sheet.convert("RGB").save(os.path.join(ROOT, "preview", out))
    print(out, sheet.size)


if __name__ == "__main__":
    main()
