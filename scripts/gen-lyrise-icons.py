#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-lyrise-icons.py — 生成 LyriseMusic 全套品牌图标
=====================================================
图形：三条竖直琴弦 + 底部弧形基座 + 上方上升弧线（Lyre + rise）

输出：
  build/icons/icon.png                 1024×1024（Windows/Linux 主图标）
  build/icons/icon.ico                 多尺寸 ICO（16–256）
  build/icons/icon.icns                macOS 图标容器
  build/icons/icon_macos.png           512×512
  build/icons/IconTemplate.png         macOS 托盘模板（单色 22pt → 44px）
  build/icons/IconTemplate@2x.png      同上 @2x
  build/icons/tray_icon_source.png     托盘源图（黑白方块 + 镂空字形）
  build/icons/win_tray_icon.ico        Windows 托盘（16–256）
  site/assets/img/logo.png             网站 logo 256×256

用法：python scripts/gen-lyrise-icons.py
"""
import os
import struct
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')
SITE_IMG = os.path.join(BASE, 'site', 'assets', 'img')

BRAND = (0x4A, 0x9E, 0xFF, 255)          # 品牌蓝
BRAND_LIGHT = (0x8C, 0xC4, 0xFF, 255)    # 浅蓝
BACKGROUND = (0xFA, 0xFC, 0xFF, 255)     # 近白背景

SUPERSAMPLE = 4  # 超采样倍数，缩小后边缘平滑


def px_offset(size: int, ratio: float) -> float:
    return size * ratio


def draw_glyph(size: int, scale: float = 1.0, offset: tuple = (0, 0)) -> Image.Image:
    """在透明画布上绘制竖琴图形（竖线 + 底部弧 + 上升弧）。"""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    unit = size / 1024.0 * scale
    ox, oy = offset

    def px(value: float) -> float:
        return value * unit

    stroke = max(2, int(px(28)))
    string_xs = [px(384) + ox, px(512) + ox, px(640) + ox]
    string_top = px(300) + oy
    string_bottom = px(610) + oy

    # 三条竖直琴弦（圆头）
    for x in string_xs:
        draw.line([(x, string_top), (x, string_bottom)], fill=BRAND, width=stroke)
        radius = stroke / 2
        draw.ellipse([x - radius, string_top - radius, x + radius, string_top + radius], fill=BRAND)
        draw.ellipse(
            [x - radius, string_bottom - radius, x + radius, string_bottom + radius], fill=BRAND
        )

    # 底部基座：下凸弧，与三条弦的底端相接
    pad = px(78)
    draw.arc(
        [string_xs[0], string_bottom - pad, string_xs[-1], string_bottom + pad],
        start=0,
        end=180,
        fill=BRAND,
        width=stroke,
    )

    # 上方上升弧线（rise）：从左中扫向右上
    rise = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    rise_draw = ImageDraw.Draw(rise)
    rise_width = max(2, int(px(22)))
    rise_draw.arc(
        [px(352) + ox, px(60) + oy, px(832) + ox, px(330) + oy],
        start=196,
        end=334,
        fill=BRAND_LIGHT,
        width=rise_width,
    )
    canvas = Image.alpha_composite(canvas, rise)
    return canvas


def compose_icon(size: int, rounded: bool = True) -> Image.Image:
    """白底圆角方形 + 居中图形。"""
    big = size * SUPERSAMPLE
    background = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(background)
    radius = int(big * 0.22)
    if rounded:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=BACKGROUND)
    else:
        draw.rectangle([0, 0, big - 1, big - 1], fill=BACKGROUND)

    glyph = draw_glyph(big, scale=1.0, offset=(0, px_offset(big, 0.055)))
    background = Image.alpha_composite(background, glyph)
    return background.resize((size, size), Image.LANCZOS)


def compose_transparent_glyph(size: int) -> Image.Image:
    """透明底图形，用于 macOS 图标与网站 logo。"""
    big = size * SUPERSAMPLE
    glyph = draw_glyph(big, scale=0.98, offset=(0, px_offset(big, 0.055)))
    # 轻微内缩，保证留白
    padded = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    inset = int(big * 0.04)
    padded.paste(glyph, (inset, inset), glyph)
    return padded.resize((size, size), Image.LANCZOS)


def compose_tray_glyph(size: int, color=(0, 0, 0, 255)) -> Image.Image:
    """托盘用单色图形：三条竖线 + 基座，线条加粗以适应 16px。"""
    big = size * SUPERSAMPLE
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    unit = big / 1024.0
    stroke = max(3, int(64 * unit)) if size <= 32 else max(4, int(42 * unit))

    xs = [int(300 * unit), int(512 * unit), int(724 * unit)]
    top = int(250 * unit)
    bottom = int(700 * unit)
    for x in xs:
        draw.line([(x, top), (x, bottom)], fill=color, width=stroke)
        r = stroke / 2
        draw.ellipse([x - r, top - r, x + r, top + r], fill=color)
        draw.ellipse([x - r, bottom - r, x + r, bottom + r], fill=color)

    draw.arc(
        [xs[0] - int(40 * unit), int(700 * unit), xs[-1] + int(40 * unit), int(820 * unit)],
        start=15,
        end=165,
        fill=color,
        width=stroke,
    )
    return canvas.resize((size, size), Image.LANCZOS)


def build_icns(images: dict) -> bytes:
    """构造 macOS ICNS 容器（内含 PNG 数据块）。"""
    type_map = {
        16: b'icp4',
        32: b'icp5',
        64: b'icp6',
        128: b'ic07',
        256: b'ic08',
        512: b'ic09',
        1024: b'ic10',
    }
    chunks = []
    import io

    for size, image in images.items():
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        payload = buffer.getvalue()
        chunk_type = type_map[size]
        chunks.append(chunk_type + struct.pack('>I', len(payload) + 8) + payload)
    body = b''.join(chunks)
    return b'icns' + struct.pack('>I', len(body) + 8) + body


def main() -> None:
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(SITE_IMG, exist_ok=True)

    # 主图标
    icon_1024 = compose_icon(1024)
    icon_1024.save(os.path.join(ICONS, 'icon.png'))

    # Windows ICO
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    icon_1024.save(
        os.path.join(ICONS, 'icon.ico'),
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
    )

    # macOS ICNS
    icns_images = {s: compose_icon(s) for s in (16, 32, 64, 128, 256, 512, 1024)}
    with open(os.path.join(ICONS, 'icon.icns'), 'wb') as handle:
        handle.write(build_icns(icns_images))

    # macOS 通用图标
    compose_icon(512).save(os.path.join(ICONS, 'icon_macos.png'))

    # macOS 托盘模板（纯黑 + alpha）
    template = compose_tray_glyph(44)
    template.save(os.path.join(ICONS, 'IconTemplate.png'))
    compose_tray_glyph(88).save(os.path.join(ICONS, 'IconTemplate@2x.png'))

    # Windows 托盘（蓝色方块 + 白色字形，沿用 gen-tray-icons 的视觉语言）
    tray_source = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    bg = ImageDraw.Draw(tray_source)
    bg.rounded_rectangle([0, 0, 511, 511], radius=112, fill=BRAND)
    white_glyph = compose_tray_glyph(512, color=(255, 255, 255, 255))
    tray_source = Image.alpha_composite(tray_source, white_glyph)
    tray_source.save(os.path.join(ICONS, 'tray_icon_source.png'))
    tray_source.save(
        os.path.join(ICONS, 'win_tray_icon.ico'),
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
    )

    # 网站 logo
    compose_transparent_glyph(256).save(os.path.join(SITE_IMG, 'logo.png'))

    print('已生成：')
    for name in sorted(os.listdir(ICONS)):
        path = os.path.join(ICONS, name)
        if os.path.isfile(path):
            print(f'  build/icons/{name:28} {os.path.getsize(path) / 1024:.1f} KB')
    print(f'  site/assets/img/logo.png        {os.path.getsize(os.path.join(SITE_IMG, "logo.png")) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
