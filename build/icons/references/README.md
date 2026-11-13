# Icon References

这个目录存放**不参与运行时加载、也不参与打包配置**的图标参考素材，方便后续继续迭代应用图标与托盘图标设计。当前品牌与资源由脚本 `work/gen_project_icons.py` 与 `work/gen_references.py` 生成。

## 当前文件

| 文件 | 说明 |
|---|---|
| `icon.svg` | 通用应用图标矢量参考稿（白底圆角 + 字标 / 直线 / Music） |
| `icon_macos.svg` | macOS 图标矢量参考稿（内容缩到 84%，留安全边距） |
| `icon_macos.png` | macOS 图标位图源稿 512×512 |
| `mac_tray_icon_template.svg` | macOS 托盘模板矢量稿（透明底 + 纯黑 `Ly`） |
| `mac_tray_icon_template.png` | macOS 托盘模板位图 88×88 |
| `win_tray_icon_dark.ico` | Windows 托盘深色字形版（浅色任务栏用），16/24/32/48 |
| `win_tray_icon_light.ico` | Windows 托盘浅色字形版（深色任务栏用），16/24/32/48 |
| `tray_glyph_preview.png` | 托盘字形在浅色 / 深色背景下的对照预览 |

## 当前项目实际使用的图标

- `build/icons/icon.png`（1024）
- `build/icons/icon.ico`（16–256，七帧独立渲染）
- `build/icons/icon.icns`（16–1024）
- `build/icons/icon_macos.png`（512）
- `build/icons/IconTemplate.png` / `IconTemplate@2x.png`（macOS 托盘模板）
- `build/icons/win_tray_icon.ico`（Windows 托盘）
- `build/icons/tray_icon_source.png`（托盘源图）

## 约定

- 图标主体：白底圆角方形（圆角 22.5%），内容为 `Lyrise` / 直线 / `Music` 三级字标，颜色 `#1A1C20`。
- 小尺寸（≤128）自动降级为 `Ly`，避免字标在 16–64px 下糊成一团。
- 托盘图标一律走单色字形（深色 / 浅色两套），不使用彩色图标。
- 本目录文件仅作设计参考，改完请同步重新生成 `build/icons/` 下的实际资源。
