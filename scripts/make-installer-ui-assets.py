import os
from PIL import Image, ImageDraw, ImageFont

BUILD = r"E:\01-项目开发\DakeMusic\build"
BRAND = (72, 152, 248)
BRAND_DARK = (26, 82, 160)

FJ = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\segoeuib.ttf"]
FR = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\segoeui.ttf"]

def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def ctext(d, box, text, f, fill):
    x0, y0, x1, y1 = box
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((x0 + x1 - tw) / 2 - bb[0], (y0 + y1 - th) / 2 - bb[1]), text, font=f, fill=fill)

# ---------- 左侧品牌块 190x336 ----------
W, H = 190, 336
img = Image.new("RGB", (W, H), BRAND)
px = img.load()
for y in range(H):
    for x in range(W):
        t = min(1.0, y / H * 0.8 + x / W * 0.2)
        px[x, y] = (
            int(BRAND[0] * (1 - t) + BRAND_DARK[0] * t),
            int(BRAND[1] * (1 - t) + BRAND_DARK[1] * t),
            int(BRAND[2] * (1 - t) + BRAND_DARK[2] * t),
        )
d = ImageDraw.Draw(img, "RGBA")
for cx, cy, r, a in [(20, 40, 80, 28), (170, 300, 90, 22)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))
d.ellipse([W // 2 - 46, 40, W // 2 + 46, 132], outline=(255, 255, 255, 60), width=2)
ctext(d, (0, 120, W, 165), "Dake", font(FJ, 30), (255, 255, 255))
ctext(d, (0, 160, W, 184), "MUSIC", font(FJ, 18), (255, 255, 255, 240))
d.rectangle([W // 2 - 22, 196, W // 2 + 22, 198], fill=(255, 255, 255, 210))
ctext(d, (0, 208, W, 228), "为热爱而播", font(FR, 11), (255, 255, 255, 200))
img.save(os.path.join(BUILD, "installerPanel.bmp"), "BMP")
print("panel", img.size)

# ---------- 胶囊按钮 176x40 ----------
BW, BH = 176, 40
btn = Image.new("RGB", (BW, BH), (255, 255, 255))
d = ImageDraw.Draw(btn)
d.rounded_rectangle([0, 0, BW - 1, BH - 1], radius=BH // 2, fill=BRAND)
f = font(FJ, 15)
bb = d.textbbox((0, 0), "立即安装", font=f)
d.text(((BW - (bb[2] - bb[0])) / 2 - bb[0], (BH - (bb[3] - bb[1])) / 2 - bb[1]),
       "立即安装", font=f, fill=(255, 255, 255))
btn.save(os.path.join(BUILD, "installerButton.bmp"), "BMP")
print("button", btn.size)
