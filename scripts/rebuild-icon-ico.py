#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按尺寸分层重建 icon.ico：小尺寸用「L」，中等用「Lyrise」单词，大尺寸用完整文字标。"""
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')
SOURCE = os.path.join(ICONS, 'icon.png')

LYRISE_BOX = (212, 320, 811, 536)   # 「Lyrise」整词区域（已测量）
L_BOX = (212, 320, 313, 536)        # 首字母「L」（到横笔末端，不含 y）

src = Image.open(SOURCE).convert('RGBA')


def crop_center(box, pad=1.18):
    piece = src.crop(box)
    width, height = piece.size
    side = int(max(width, height) * pad)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(piece, ((side - width) // 2, (side - height) // 2), piece)
    return canvas


l_square = crop_center(L_BOX)
word_square = crop_center(LYRISE_BOX, 1.10)


def draw_bold_l(size, ink=(28, 28, 30, 255)):
    """小尺寸专用的粗笔 L：文字标的笔画缩到 16px 会糊成一条线，这里按比例重画。"""
    big = size * 8
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    margin = big * 0.24
    stroke = big * 0.20
    draw.rectangle([margin, margin, margin + stroke, big - margin], fill=ink)
    draw.rectangle([margin, big - margin - stroke, big - margin, big - margin], fill=ink)
    return canvas.resize((size, size), Image.LANCZOS)


def frame(size):
    if size <= 24:
        return draw_bold_l(size)
    if size <= 48:
        return word_square.resize((size, size), Image.LANCZOS)
    return src.resize((size, size), Image.LANCZOS)


def main():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = {size: frame(size) for size in sizes}

    ico_path = os.path.join(ICONS, 'icon.ico')
    if os.path.exists(ico_path):
        os.remove(ico_path)
    frames[256].save(ico_path, format='ICO', sizes=[(s, s) for s in sizes])
    print('icon.ico 已重做：16/24 = L，32/48 = Lyrise，64+ = 完整文字标')

    preview = Image.new('RGBA', (len(sizes) * 120, 130), (245, 245, 247, 255))
    for index, size in enumerate(sizes):
        tile = frames[size].resize((104, 104), Image.NEAREST)
        background = Image.new('RGBA', (104, 104), (255, 255, 255, 255))
        background.paste(tile, (0, 0), tile)
        preview.paste(background, (index * 120 + 8, 13))
    preview.save(os.path.join(BASE, '_ico-preview.png'))
    print('预览：_ico-preview.png')


if __name__ == '__main__':
    main()
