from PIL import Image, ImageDraw, ImageFont
import os

# 打开原图
img_path = r"C:\Users\Dake\Desktop\QQ截图20261004022328.png"
img = Image.open(img_path)

# 确保是正方形
size = min(img.size)
left = (img.width - size) // 2
top = (img.height - size) // 2
img = img.crop((left, top, left + size, top + size))

# 创建渐变遮罩（底部变暗）
overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

# 底部渐变遮罩
for y in range(img.height):
    # 从中间往下逐渐变暗
    if y > img.height * 0.5:
        alpha = int((y - img.height * 0.5) / (img.height * 0.5) * 180)
        draw.line([(0, y), (img.width, y)], fill=(0, 0, 0, alpha))

# 合成遮罩
img = img.convert('RGBA')
img = Image.alpha_composite(img, overlay)
draw = ImageDraw.Draw(img)

# 文字
main_text = "情敌贝多芬"
sub_text = "DakeMusic Small Room"

# 字体大小根据图片尺寸
main_font_size = int(size * 0.1)  # 10% 图片宽度
sub_font_size = int(size * 0.04)  # 4% 图片宽度

# 尝试加载字体
try:
    # 粗黑体 - 主标题
    main_font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", main_font_size)
    # 细宋体 - 副标题
    sub_font = ImageFont.truetype("C:/Windows/Fonts/simsun.ttc", sub_font_size)
except:
    try:
        main_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", main_font_size)
        sub_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", sub_font_size)
    except:
        main_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

# 计算文字位置（底部居中）
main_bbox = draw.textbbox((0, 0), main_text, font=main_font)
main_w = main_bbox[2] - main_bbox[0]
main_h = main_bbox[3] - main_bbox[1]

sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
sub_w = sub_bbox[2] - sub_bbox[0]
sub_h = sub_bbox[3] - sub_bbox[1]

# 底部位置
bottom_margin = int(size * 0.08)
main_x = (size - main_w) // 2
main_y = size - bottom_margin - main_h - sub_h - int(size * 0.02)

sub_x = (size - sub_w) // 2
sub_y = main_y + main_h + int(size * 0.02)

# 画主标题（白色，带阴影）
# 阴影
for dx, dy in [(2, 2), (-2, -2), (2, -2), (-2, 2)]:
    draw.text((main_x + dx, main_y + dy), main_text, font=main_font, fill=(0, 0, 0, 150))
draw.text((main_x, main_y), main_text, font=main_font, fill=(255, 255, 255, 255))

# 画副标题（浅白色）
for dx, dy in [(1, 1), (-1, -1)]:
    draw.text((sub_x + dx, sub_y + dy), sub_text, font=sub_font, fill=(0, 0, 0, 120))
draw.text((sub_x, sub_y), sub_text, font=sub_font, fill=(255, 255, 255, 220))

# 保存为 PNG
output_path = r"C:\Users\Dake\Desktop\DakeMusic\public\dakemusic-default-room-cover.png"
img = img.convert('RGB')
img.save(output_path, 'PNG')

print(f"封面已生成: {output_path}")
print(f"尺寸: {img.size}")
print(f"主标题: {main_text}")
print(f"副标题: {sub_text}")
