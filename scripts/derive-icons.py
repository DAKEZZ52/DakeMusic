#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
derive-icons.py — 从主图标派生出各处需要的尺寸与容器
=========================================================
用户替换 build/icons/icon.png 后运行本脚本，自动补齐：
  build/icons/icon.icns        macOS 图标容器
  build/icons/tray_icon_source.png  托盘源图（供 gen-tray-icons.js 染色）
  site/assets/img/logo.png     网站 logo（favicon / 页头）
  site/assets/img/icon.png     下载页图标
  site/favicon.ico             浏览器标签图标
  site/assets/img/icon.svg     矢量占位（与 PNG 同视图，仅背景色块）

已经手工提供的文件不覆盖：icon.ico / win_tray_icon.ico / IconTemplate*.png
"""
import io
import os
import struct

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(BASE, 'build', 'icons')
SITE_IMG = os.path.join(BASE, 'site', 'assets', 'img')
SITE = os.path.join(BASE, 'site')

SOURCE = os.path.join(ICONS, 'icon.png')


def load_source() -> Image.Image:
    image = Image.open(SOURCE).convert('RGBA')
    if image.size != (1024, 1024):
        image = image.resize((1024, 1024), Image.LANCZOS)
    return image


def build_icns(image: Image.Image) -> bytes:
    """构造 macOS ICNS（内部为 PNG 数据块）。"""
    type_map = {16: b'icp4', 32: b'icp5', 64: b'icp6', 128: b'ic07', 256: b'ic08', 512: b'ic09', 1024: b'ic10'}
    chunks = []
    for size, chunk_type in type_map.items():
        buffer = io.BytesIO()
        image.resize((size, size), Image.LANCZOS).save(buffer, format='PNG')
        payload = buffer.getvalue()
        chunks.append(chunk_type + struct.pack('>I', len(payload) + 8) + payload)
    body = b''.join(chunks)
    return b'icns' + struct.pack('>I', len(body) + 8) + body


def main() -> None:
    icon = load_source()

    # macOS 容器
    icns_path = os.path.join(ICONS, 'icon.icns')
    with open(icns_path, 'wb') as handle:
        handle.write(build_icns(icon))
    print(f'  build/icons/icon.icns            {os.path.getsize(icns_path) / 1024:.1f} KB')

    # 托盘源图（256 便于染色脚本取形状）
    tray_path = os.path.join(ICONS, 'tray_icon_source.png')
    icon.resize((256, 256), Image.LANCZOS).save(tray_path)
    print(f'  build/icons/tray_icon_source.png {os.path.getsize(tray_path) / 1024:.1f} KB')

    os.makedirs(SITE_IMG, exist_ok=True)

    # 网站 logo（保留圆角白底，和桌面图标一致）
    logo_path = os.path.join(SITE_IMG, 'logo.png')
    icon.resize((256, 256), Image.LANCZOS).save(logo_path)
    print(f'  site/assets/img/logo.png         {os.path.getsize(logo_path) / 1024:.1f} KB')

    # 下载页图标
    site_icon = os.path.join(SITE_IMG, 'icon.png')
    icon.resize((256, 256), Image.LANCZOS).save(site_icon)
    print(f'  site/assets/img/icon.png         {os.path.getsize(site_icon) / 1024:.1f} KB')

    # 浏览器 favicon
    favicon_path = os.path.join(SITE, 'favicon.ico')
    icon.save(favicon_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'  site/favicon.ico                 {os.path.getsize(favicon_path) / 1024:.1f} KB')

    # 矢量占位：embedded PNG 的 SVG（保持页面引用不 404）
    svg_path = os.path.join(SITE_IMG, 'icon.svg')
    buffer = io.BytesIO()
    icon.resize((256, 256), Image.LANCZOS).save(buffer, format='PNG')
    import base64

    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    with open(svg_path, 'w', encoding='utf-8') as handle:
        handle.write(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n'
            f'  <image href="data:image/png;base64,{encoded}" width="256" height="256"/>\n'
            '</svg>\n'
        )
    print(f'  site/assets/img/icon.svg         {os.path.getsize(svg_path) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
