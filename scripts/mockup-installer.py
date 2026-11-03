import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"E:\01-项目开发\_ui-reviews\installer-mockup.png"
ICON = r"E:\01-项目开发\DakeMusic\build\icons\icon.png"

BRAND = (72, 152, 248)
BRAND_DARK = (28, 86, 168)
TEXT = (24, 26, 32)
TEXT_SUB = (110, 116, 128)
BORDER = (224, 228, 235)
BG = (250, 251, 253)
WHITE = (255, 255, 255)

S = 2  # 2x 再缩
W, H = 640 * S, 430 * S

FONTS = {
    "bold": [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\segoeuib.ttf"],
    "reg": [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\segoeui.ttf"],
}

def font(kind, size):
    for p in FONTS[kind]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size * S)
            except Exception:
                pass
    return ImageFont.load_default()

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")

LEFT_W = 190 * S

# ---- 左侧品牌区 ----
side = Image.new("RGB", (LEFT_W, H), BRAND)
px = side.load()
for y in range(H):
    for x in range(LEFT_W):
        t = min(1.0, y / H * 0.8 + x / LEFT_W * 0.2)
        px[x, y] = (
            int(BRAND[0] * (1 - t) + BRAND_DARK[0] * t),
            int(BRAND[1] * (1 - t) + BRAND_DARK[1] * t),
            int(BRAND[2] * (1 - t) + BRAND_DARK[2] * t),
        )
sd = ImageDraw.Draw(side, "RGBA")
for cx, cy, r, a in [(40 * S, 90 * S, 90 * S, 30), (160 * S, 330 * S, 110 * S, 24)]:
    sd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))
sd.ellipse([LEFT_W // 2 - 52 * S, 60 * S, LEFT_W // 2 + 52 * S, 164 * S], outline=(255, 255, 255, 70), width=2 * S)

def center_text(draw, box, text, f, fill):
    x0, y0, x1, y1 = box
    bb = draw.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text(((x0 + x1 - tw) / 2 - bb[0], (y0 + y1 - th) / 2 - bb[1]), text, font=f, fill=fill)

center_text(sd, (0, 150 * S, LEFT_W, 200 * S), "Dake", font("bold", 34), WHITE)
center_text(sd, (0, 196 * S, LEFT_W, 224 * S), "MUSIC", font("bold", 21), (255, 255, 255, 240))
sd.rectangle([LEFT_W // 2 - 26 * S, 236 * S, LEFT_W // 2 + 26 * S, 238 * S], fill=(255, 255, 255, 210))
center_text(sd, (0, 252 * S, LEFT_W, 274 * S), "为热爱而播", font("reg", 13), (255, 255, 255, 200))

img.paste(side, (0, 0))

# ---- 右侧内容 ----
RX = LEFT_W + 36 * S
y = 40 * S

d.text((RX, y), "安装 DakeMusic", font=font("bold", 22), fill=TEXT)
y += 38 * S
d.text((RX, y), "版本 2.4.7 · 网易云风格安装向导", font=font("reg", 12), fill=TEXT_SUB)
y += 40 * S

# 路径行
d.text((RX, y), "安装位置", font=font("reg", 12), fill=TEXT_SUB)
y += 22 * S
field_w = W - RX - 36 * S
d.rounded_rectangle([RX, y, RX + field_w, y + 40 * S], radius=8 * S, fill=WHITE, outline=BORDER, width=1 * S)
d.text((RX + 14 * S, y + 12 * S), r"D:\个人应用\DakeMusic", font=font("reg", 13), fill=TEXT)
d.text((RX + field_w - 66 * S, y + 12 * S), "更改", font=font("bold", 12), fill=BRAND)
y += 54 * S

d.text((RX, y), "所需空间 419.7 MB · 可用空间 173.7 GB", font=font("reg", 11), fill=TEXT_SUB)
y += 34 * S

# 勾选项
def checkbox(x, yy, label, checked=True):
    d.rounded_rectangle([x, yy, x + 18 * S, yy + 18 * S], radius=5 * S,
                        fill=BRAND if checked else WHITE,
                        outline=BRAND if checked else BORDER, width=1 * S)
    if checked:
        d.line([x + 4 * S, yy + 9 * S, x + 8 * S, yy + 14 * S], fill=WHITE, width=2 * S)
        d.line([x + 8 * S, yy + 14 * S, x + 14 * S, yy + 5 * S], fill=WHITE, width=2 * S)
    d.text((x + 26 * S, yy + 1 * S), label, font=font("reg", 13), fill=TEXT)

checkbox(RX, y, "创建桌面快捷方式")
checkbox(RX + 200 * S, y, "添加到开始菜单")
y += 32 * S
checkbox(RX, y, "安装完成后运行 DakeMusic")
y += 48 * S

# 品牌色胶囊按钮
btn_w, btn_h = 200 * S, 46 * S
bx = W - btn_w - 36 * S
by = H - btn_h - 34 * S
d.rounded_rectangle([bx, by, bx + btn_w, by + btn_h], radius=btn_h // 2, fill=BRAND)
d.rounded_rectangle([bx, by, bx + btn_w, by + btn_h // 2], radius=btn_h // 2, fill=(255, 255, 255, 18))
bb = d.textbbox((0, 0), "立即安装", font=font("bold", 15))
d.text((bx + (btn_w - (bb[2] - bb[0])) / 2 - bb[0], by + (btn_h - (bb[3] - bb[1])) / 2 - bb[1]),
       "立即安装", font=font("bold", 15), fill=WHITE)

# 取消（文字按钮）
cb = d.textbbox((0, 0), "取消", font=font("reg", 13))
d.text((bx - 26 * S - (cb[2] - cb[0]), by + (btn_h - (cb[3] - cb[1])) / 2 - cb[1]),
       "取消", font=font("reg", 13), fill=TEXT_SUB)

img = img.resize((W // S, H // S), Image.LANCZOS)
img.save(OUT)
print("saved", OUT, img.size)
