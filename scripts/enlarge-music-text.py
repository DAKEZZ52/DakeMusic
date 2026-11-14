#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""放大字标里的 Music 并压成纯黑（其余部分保持不变）。"""
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')
SOURCE = os.path.join(ICONS, 'icon.png')

INK = (0, 0, 0, 255)          # 纯黑
PAPER = (255, 255, 255, 255)

# 原布局（已测量）：Music 在 y=675-723，x=389-627，高 49
# 目标：高约 76（≈ Lyrise 216 的 35%，与旧版 Dake / MUSIC 的比例接近）
TARGET_HEIGHT = 76
CENTER_X = 512
TARGET_TOP = 668


def find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        r'C:\Windows\Fonts\arialbd.ttf',
        r'C:\Windows\Fonts\segoeuib.ttf',
        r'C:\Windows\Fonts\Helvetica.ttf',
        r'C:\Windows\Fonts\ariblk.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit('找不到可用的粗体字体')


def draw_tracked(draw, text, font, center_x, baseline_y, tracking, fill):
    """带字距的居中绘制。"""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = center_x - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, baseline_y), ch, font=font, fill=fill, anchor='ls')
        x += w + tracking


def main():
    icon = Image.open(SOURCE).convert('RGBA')
    draw = ImageDraw.Draw(icon)

    # 1. 擦掉原来的 Music（区域留够余量，背景是纯白）
    draw.rectangle([260, 655, 764, 800], fill=PAPER)

    # 2. 找一个能让大写高度接近目标值的字号
    size = 100
    font = find_font(size)
    bbox = font.getbbox('M')
    cap_height = bbox[3] - bbox[1]
    size = int(size * TARGET_HEIGHT / cap_height)
    font = find_font(size)
    bbox = font.getbbox('M')
    cap_height = bbox[3] - bbox[1]

    # 3. 绘制：字距随字号等比放大（原 18 / 64 ≈ 0.28）
    tracking = int(size * 0.22)
    baseline = TARGET_TOP + cap_height
    draw_tracked(draw, 'Music', font, CENTER_X, baseline, tracking, INK)

    icon.save(SOURCE)
    width = draw.textlength('Music', font=font) + tracking * 4
    print(f'Music 已放大：字号 {size}px，大写高 {cap_height}px，宽约 {int(width)}px，纯黑')
    print(f'  位置：顶部 {TARGET_TOP}，基线 {baseline}')


if __name__ == '__main__':
    main()
