#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按旧版 DakeMusic 图标的版式重绘 Lyrise 字标：
  Lyrise（上，黑色） / MUSIC（下，更大，大写，纯黑） / 短下划线（纯黑）
全部使用 Lato Black，与原始设计同一字体，颜色统一为纯黑。
"""
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')
OUT = os.path.join(ICONS, 'icon.png')

SIZE = 1024
SUPERSAMPLE = 2
INK = (0, 0, 0, 255)
PAPER = (255, 255, 255, 255)
RING = (233, 238, 247, 255)   # 极淡的圆环，保留旧图的设计感

FONT_PATH = r'C:\Windows\Fonts\Lato-Black.ttf'


def build() -> Image.Image:
    scale = SUPERSAMPLE
    canvas_size = SIZE * scale
    image = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # 白底圆角
    draw.rounded_rectangle(
        [0, 0, canvas_size - 1, canvas_size - 1],
        radius=int(230 * scale),
        fill=PAPER,
    )

    # 淡圆环（外圈），模拟旧图的细线装饰
    ring_inset = int(78 * scale)
    draw.ellipse(
        [ring_inset, ring_inset, canvas_size - ring_inset, canvas_size - ring_inset],
        outline=RING,
        width=int(3 * scale),
    )

    def fit_font(text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
        size = start_size
        while size > 10:
            font = ImageFont.truetype(FONT_PATH, size * scale)
            if draw.textlength(text, font=font) <= max_width * scale:
                return font
            size -= 2
        return ImageFont.truetype(FONT_PATH, 10 * scale)

    cx = canvas_size // 2

    # Lyrise（上）：用基线定位，避免字体上下留白影响排版
    lyrise_font = fit_font('Lyrise', 660, 230)
    lyrise_bbox = lyrise_font.getbbox('Lyrise')
    lyrise_cap = lyrise_bbox[3] - lyrise_bbox[1]
    lyrise_top = int(300 * scale)
    lyrise_baseline = lyrise_top + lyrise_cap
    draw.text((cx, lyrise_baseline), 'Lyrise', font=lyrise_font, fill=INK, anchor='ms')

    # MUSIC（下，更大，大写）
    music_font = fit_font('MUSIC', 700, 240)
    music_bbox = music_font.getbbox('MUSIC')
    music_cap = music_bbox[3] - music_bbox[1]
    music_top = lyrise_top + lyrise_cap + int(74 * scale)
    music_baseline = music_top + music_cap
    draw.text((cx, music_baseline), 'MUSIC', font=music_font, fill=INK, anchor='ms')

    # 短下划线（纯黑），放在 MUSIC 视觉底部下方
    underline_y = music_baseline + int(58 * scale)
    underline_w = int(240 * scale)
    underline_h = int(10 * scale)
    draw.rounded_rectangle(
        [cx - underline_w // 2, underline_y, cx + underline_w // 2, underline_y + underline_h],
        radius=underline_h // 2,
        fill=INK,
    )

    return image.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    icon = build()
    icon.save(OUT)
    print(f'已重绘 build/icons/icon.png（{SIZE}×{SIZE}）')
    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(BASE, '_icon-new.png'))
    print('预览：_icon-new.png')


if __name__ == '__main__':
    main()
