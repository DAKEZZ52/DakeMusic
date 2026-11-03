import os
from PIL import Image, ImageDraw, ImageFont

ROOT = r"E:\01-项目开发\DakeMusic"
BUILD = os.path.join(ROOT, "build")
ICON = os.path.join(BUILD, "icons", "icon.png")

# 从 logo 取品牌蓝
src = Image.open(ICON).convert("RGB")
w, h = src.size
# 采样 logo 里的品牌蓝：统计偏蓝像素，取出现最多的色
counts = {}
for y in range(0, h, 3):
    for x in range(0, w, 3):
        r, g, b = src.getpixel((x, y))
        if b > r + 30 and b > 120:
            key = (r // 8 * 8, g // 8 * 8, b // 8 * 8)
            counts[key] = counts.get(key, 0) + 1
brand = max(counts.items(), key=lambda kv: kv[1])[0] if counts else (72, 152, 248)
print("采样品牌色:", brand)

def darken(c, f):
    return tuple(max(0, int(v * f)) for v in c)

def lighten(c, f):
    return tuple(min(255, int(v + (255 - v) * f)) for v in c)

BRAND = brand                      # 品牌蓝
BRAND_DARK = darken(brand, 0.55)   # 深一档
BRAND_LIGHT = lighten(brand, 0.55)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
]

def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def text_center(draw, box, text, font, fill):
    x0, y0, x1, y1 = box
    bb = draw.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text(((x0 + x1 - tw) / 2 - bb[0], (y0 + y1 - th) / 2 - bb[1]), text, font=font, fill=fill)

# ---------- Header 150x57 ----------
header = Image.new("RGB", (150, 57), (255, 255, 255))
d = ImageDraw.Draw(header)
# 左侧品牌竖条
d.rectangle([0, 0, 4, 57], fill=BRAND)
# 文字：Dake(黑) MUSIC(蓝)
f1 = load_font(20)
f2 = load_font(15)
d.text((14, 12), "Dake", font=f1, fill=(24, 26, 32))
bb = d.textbbox((0, 0), "Dake", font=f1)
x = 14 + (bb[2] - bb[0]) + 6
d.text((x, 17), "MUSIC", font=f2, fill=BRAND)
# 细下划线
d.rectangle([14, 44, 14 + int((bb[2] - bb[0]) * 0.6), 45], fill=BRAND_LIGHT)
header.save(os.path.join(BUILD, "installerHeader.bmp"), "BMP")
print("header 已生成")

# ---------- Sidebar 164x314 ----------
SW, SH = 164, 314
side = Image.new("RGB", (SW, SH), BRAND)
px = side.load()
# 纵向渐变：品牌蓝 -> 深蓝
for y in range(SH):
    t = y / (SH - 1)
    for x in range(SW):
        # 斜向渐变，更有层次
        tt = min(1.0, (t * 0.75 + (x / SW) * 0.25))
        px[x, y] = (
            int(BRAND[0] * (1 - tt) + BRAND_DARK[0] * tt),
            int(BRAND[1] * (1 - tt) + BRAND_DARK[1] * tt),
            int(BRAND[2] * (1 - tt) + BRAND_DARK[2] * tt),
        )
d = ImageDraw.Draw(side, "RGBA")

# 光斑
for cx, cy, r, a in [(30, 60, 70, 26), (140, 240, 90, 22), (60, 300, 60, 18)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))

# 圆环
d.ellipse([SW // 2 - 46, 58, SW // 2 + 46, 150], outline=(255, 255, 255, 60), width=2)

# 文案
f_word = load_font(30)
f_sub = load_font(11)
text_center(d, (0, 150, SW, 200), "Dake", f_word, (255, 255, 255))
f_music = load_font(19)
text_center(d, (0, 188, SW, 218), "MUSIC", f_music, (255, 255, 255, 235))
d.rectangle([SW // 2 - 22, 228, SW // 2 + 22, 230], fill=(255, 255, 255, 200))
CJK_FONTS = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhl.ttc", r"C:\Windows\Fonts\simhei.ttf"]
f_cjk = None
for _p in CJK_FONTS:
    if os.path.exists(_p):
        try:
            f_cjk = ImageFont.truetype(_p, 11)
            break
        except Exception:
            pass
if f_cjk is not None:
    text_center(d, (0, 244, SW, 266), "为热爱而播", f_cjk, (255, 255, 255, 190))

side.save(os.path.join(BUILD, "installerSidebar.bmp"), "BMP")
side.save(os.path.join(BUILD, "uninstallerSidebar.bmp"), "BMP")
print("sidebar / uninstallerSidebar 已生成")

# ---------- ICO ----------
ico = Image.open(ICON).convert("RGBA")
ico.save(os.path.join(BUILD, "installerIcon.ico"), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
ico.save(os.path.join(BUILD, "uninstallerIcon.ico"), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("ico 已生成")

print("-brand-", BRAND)
