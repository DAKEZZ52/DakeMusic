#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-tray-icon.py — 生成托盘专用的小尺寸图标
==============================================
品牌字标（Lyrise 文字）缩到 16px 会糊成一团，托盘单独使用「L」字形：

  Windows  win_tray_icon.ico   白底圆角 + 深色 L（16/24/32/48）
  macOS    IconTemplate.png     纯黑 L + alpha（系统自动反色，22pt / 44px @2x）
  源图     tray_icon_source.png 512 白底圆角 + 深色 L（供参考与再生成）

主图标（icon.png / icon.ico / icon.icns）保持不变，仍是 Lyrise 字标。
"""
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')

INK = (28, 28, 30, 255)        # 与字标同色（近黑）
PAPER = (255, 255, 255, 255)   # 白底

SUPERSAMPLE = 8


def draw_l(size: int, color=INK, back=None, radius_ratio: float = 0.22) -> Image.Image:
    """画一个圆角方块（可选）+ 居中的 L 字形。"""
    big = size * SUPERSAMPLE
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    if back is not None:
        draw.rounded_rectangle(
            [0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=back
        )

    # L 字形：竖笔 + 横笔，笔画宽度约 19% 画布，留白 24%
    margin = big * 0.26
    stroke = big * 0.19
    left = margin
    top = margin
    bottom = big - margin
    right = big - margin

    draw.rectangle([left, top, left + stroke, bottom], fill=color)
    draw.rectangle([left, bottom - stroke, right, bottom], fill=color)

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(ICONS, exist_ok=True)

    # Windows：白底圆角 + 深色 L，每个尺寸单独渲染，避免缩放糊边
    sizes = [16, 24, 32, 48]
    frames = {size: draw_l(size, color=INK, back=PAPER) for size in sizes}
    base = frames[48]
    ico_path = os.path.join(ICONS, 'win_tray_icon.ico')
    base.save(ico_path, format='ICO', sizes=[(s, s) for s in sizes])
    print(f'  build/icons/win_tray_icon.ico      {os.path.getsize(ico_path) / 1024:.1f} KB  尺寸 {sizes}')

    # 托盘源图（512，白底 + 深色 L）
    source_path = os.path.join(ICONS, 'tray_icon_source.png')
    draw_l(512, color=INK, back=PAPER).save(source_path)
    print(f'  build/icons/tray_icon_source.png   {os.path.getsize(source_path) / 1024:.1f} KB  512×512')

    # macOS 模板：透明底 + 纯黑 L（系统按菜单栏主题自动反色）
    template = draw_l(44, color=(0, 0, 0, 255), back=None)
    template.save(os.path.join(ICONS, 'IconTemplate.png'))
    draw_l(88, color=(0, 0, 0, 255), back=None).save(
        os.path.join(ICONS, 'IconTemplate@2x.png')
    )
    print('  build/icons/IconTemplate.png       44×44（纯黑 + alpha）')
    print('  build/icons/IconTemplate@2x.png    88×88')

    # 预览图：16/24/32/48 并排放大，便于肉眼确认
    preview = Image.new('RGBA', (4 * 140, 150), (245, 245, 247, 255))
    for index, size in enumerate(sizes):
        tile = frames[size].resize((128, 128), Image.NEAREST)
        preview.paste(tile, (index * 140 + 6, 10), tile)
    preview.save(os.path.join(ICONS, '_tray-preview.png'))
    print('  预览：build/icons/_tray-preview.png')


if __name__ == '__main__':
    main()
