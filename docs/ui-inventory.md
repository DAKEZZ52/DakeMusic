# LyriseMusic UI 清单（文件 · 行号 · 说明）

> 适用版本：**2.4.6** · 生成时间：2026-11-02 · 所有行号基于 `main` 分支 `f63ac0c`
> 行号会随代码变动漂移，建议优先用「文件 + 关键字」定位，行号只作参考。

---

## 0. 怎么用这份清单

1. **先看第 2 节**（外壳与布局）和第 6 节（设计令牌）——80% 的"改样式"需求都在这里。
2. 只改颜色/圆角/阴影 → 只动 `style.css` 的令牌，全站生效。
3. 改某一块的尺寸/间距 → 按第 3/4 节找到对应 `.vue`，改里面的 Tailwind 类名。
4. 改完保存即可，Vite HMR 自动生效，不需要重启。

---

## 1. 目录总览（`src/renderer/`）

| 目录 | 文件数 | 行数 | 职责 |
|---|---:|---:|---|
| `views/` | 89 | 49,589 | 页面（首页、发现、搜索、歌词、设置、语聊房…） |
| `components/` | 107 | 29,308 | 通用组件（卡片、列表、播放器控件、UI 基础件） |
| `stores/` | 46 | 17,221 | Pinia 状态（含主题色、设置） |
| `utils/` | 53 | 10,329 | 工具函数（颜色提取、窗口框、路由缓存等） |
| `layouts/` | 11 | 5,251 | **外壳**：侧栏、标题栏、播放栏、主布局 |
| `seatManager/` | 5 | 4,585 | 语聊房麦位管理 |
| `composables/` | 20 | 3,699 | 组合式函数 |
| `miniPlayer/` | 3 | 3,258 | 迷你播放器窗口 |
| `desktopLyric/` | 3 | 2,762 | 桌面歌词窗口 |
| `api/` | 17 | 2,535 | 接口封装 |
| `plugins/` | 8 | 1,801 | 插件系统（含标题栏动作注册） |
| `services/` `models/` `tasks/` `router/` `constants/` | — | ~1,700 | 服务、数据模型、任务、路由、常量 |

顶层文件：

| 文件 | 行数 | 说明 |
|---|---:|---|
| `style.css` | **1,183** | **全站设计令牌 + 基础样式 + 工具类**（最重要） |
| `App.vue` | 940 | 应用根组件（窗口框、主题、路由容器） |
| `icons.ts` | 246 | 图标注册表 |
| `main.ts` | 187 | 渲染进程入口 |

---

## 2. 外壳与布局（`src/renderer/layouts/`）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `Sidebar.vue` | **1,844** | 侧边栏：用户卡、导航分组、我的乐库、歌单区、创建歌单浮层 |
| `TitleBar.vue` | **1,317** | 标题栏：返回/刷新、**搜索框**、动作按钮、窗口按钮、搜索建议面板 |
| `PlayerBar.vue` | **902** | 底部播放栏：封面/信息、控制键、进度条、音效/音质入口 |
| `TitleBarMoreMenu.vue` | 339 | 「…」更多菜单（含动作固定/取消固定的图钉） |
| `MainLayout.vue` | 294 | 主框架：侧栏 + 内容 + 播放栏的 flex 结构 |
| `WindowControls.vue` | 113 | 最小化/最大化/关闭 |
| `OverlayHeader.vue` | 75 | 覆盖层顶栏（歌词页等） |
| `TitlebarActionButton.vue` | 53 | 标题栏动作按钮的通用壳 |

### 2.1 关键尺寸速查

| 改什么 | 文件 | 行号 | 现值 |
|---|---|---:|---|
| **侧边栏展开宽度** | `layouts/MainLayout.vue` | **192** | `230px` |
| **侧边栏折叠宽度** | 同上（同一行） | 192 | `80px` |
| **搜索框宽度** | `layouts/TitleBar.vue` `.tb-search` | **913–915** | `flex: 0 1 360px` / `max-width: 360px` |
| **搜索框高度** | `layouts/TitleBar.vue` `.tb-search-input-wrap` | **945–950** | `height: 30px`、`border-radius: 999px` |
| **标题栏高度** | `style.css` `.title-bar` | **834** | `max(84px, calc(73px / var(--window-zoom-factor,1)))` |
| **播放栏高度** | `layouts/PlayerBar.vue` | **282** | 类名 `h-24`（96px） |
| **播放栏圆角/描边** | 同上 | 282 | `rounded-xl border`（12px） |
| **窗口默认尺寸** | `src/main/windowSizing.ts` | **13–14** | `1150×750`（默认）/ `1100×650`（最小） |
| **窗口圆角（客户端裁剪）** | `style.css` | **1115** | `clip-path: inset(0 round var(--app-window-frame-radius, 8px))` |

---

## 3. 页面（`src/renderer/views/`）

### 3.1 顶层页面文件

| 文件 | 行数 | 页面 |
|---|---:|---|
| `History.vue` | 1,408 | 播放历史 |
| `Settings.vue` | 1,343 | 设置（分区见 3.2） |
| `Profile.vue` | 1,259 | 个人中心 |
| `Explore.vue` | 1,203 | 探索发现 |
| `Recognize.vue` | 1,143 | 听歌识曲 |
| `PersonalFm.vue` | 1,119 | 私人 FM |
| `Home.vue` | **1,007** | **首页**（英雄卡、风格推荐、歌单网格） |
| `Favorites.vue` | 869 | 我最爱 |
| `Login.vue` | 714 | 登录 |
| `Search.vue` | 697 | 搜索结果 |
| `Cloud.vue` | 693 | 音乐云盘 |
| `ShareResolve.vue` | 681 | 分享链接解析 |
| `Purchased.vue` | 604 | 已购音乐 |
| `Separator.vue` | 600 | 人声分离 |
| `Ranking.vue` | 476 | 排行榜 |
| `ErrorPage.vue` | 366 | 错误页 |
| `RecommendSongs.vue` | 268 | 每日推荐 |
| `LocalMusic.vue` | 266 | 本地音乐 |
| `Loading.vue` | 257 | 启动加载页 |
| `Download.vue` | 237 | 下载管理 |

### 3.2 页面子目录

| 目录 | 文件 | 行数 | 说明 |
|---|---:|---:|---|
| `views/chatroom/` | 5 | 8,276 | 语聊房（房间、麦位、聊天、悬浮窗） |
| `views/details/` | 5 | 6,336 | 详情页（歌单/专辑/歌手） |
| `views/lyric/` | 12 | 5,966 | 歌词页（多皮肤，皮肤设置见 `skins/skinSettings.css`） |
| `views/listenTogether/` | 1 | 1,881 | 一起听（样式 `listenTogether.css` 2,910 行） |
| `views/settings/` | 12 | ~2,800 | 设置分区组件（见下） |
| `views/search/` | 8 | ~1,200 | 搜索组件与样式 |

**设置页分区组件**（`views/settings/`）：
`AppearanceSettingsSection.vue`(694)、`ExperimentalSettingsSection.vue`(439)、`DesktopLyricSettingsSection.vue`(332)、`DataSettingsSection.vue`(314)、`AudioDeviceSettingsSection.vue`(140)、`AboutSettingsSection.vue`(119)、`settingsSection.css`(208)

---

## 4. 通用组件（`src/renderer/components/`）

| 子目录 | 文件 | 行数 | 内容 |
|---|---:|---:|---|
| `music/` | 27 | 12,011 | 歌曲/歌单/专辑/歌手卡片、列表行、批量操作 |
| `ui/` | 41 | 5,379 | 基础件：Button、Dialog、Popover、Switch、Tooltip、Scrollbar… |
| `player/` | 10 | 5,273 | 播放控件：进度条、音量、音质、音效、队列 |
| `app/` | 8 | 1,918 | 应用级组件（窗口背景、任务面板等） |
| `profile/` | 4 | 1,478 | 个人中心组件 |
| `separator/` | 5 | 1,418 | 人声分离相关 |
| `download/` | 4 | 812 | 下载任务 |
| `localMusic/` | 2 | 232 | 本地音乐 |

**最常改的卡片**：`components/music/` 下的 `AlbumCard.vue`、`PlaylistCard.vue`、`MvCard.vue`、`ArtistCard.vue`、`SongCard.vue`（圆角与阴影都用 `var(--shadow-card)`）。

---

## 5. 样式文件

### 5.1 `src/renderer/style.css`（1,183 行）分段

| 行号 | 区块 | 说明 |
|---:|---|---|
| **5–148** | `:root {` | **浅色主题令牌**（表面、文字、描边、控件、阴影、状态色、品牌色） |
| **150–196** | `.dark {` | **深色主题覆盖**（同一批令牌的深色值） |
| **198–218** | `@theme {` | **Tailwind v4 映射**：令牌 → `bg-primary` / `text-text-main` 等工具类 |
| **220–391** | `@layer base` | 基础样式（字体栈、滚动条、窗口框、标签栏） |
| **392–1125** | `@layer utilities` | 工具类（`.app-icon-button`、`.app-scrollbar`、`.song-search-input` 等） |
| 774–846 | 氛围渐变 | 顶部主题色渐变层（峰值/中段不透明度） |
| 919–… | `.main-layout` | 主框架定位与层级 |
| 1132 | `.sidebar` | 侧栏背景（磨砂） |
| 1146 | `.player-bar` | 播放栏背景（磨砂） |

### 5.2 其它样式文件

| 文件 | 行数 |
|---|---:|
| `views/listenTogether/listenTogether.css` | 2,910 |
| `views/search/searchView.css` | 328 |
| `views/settings/settingsSection.css` | 208 |
| `views/lyric/skins/skinSettings.css` | 147 |

> 其余组件样式都写在各自 SFC 的 `<style scoped>` 里（用 `@apply` 复用 Tailwind）。

---

## 6. 设计令牌清单（`style.css`）

| 令牌组 | 首次出现行 | 数量 | 作用 |
|---|---:|---:|---|
| `--surface-*` | **6** | 24 | 各表面底色与不透明度（侧栏/主体/卡片/浮层/弹窗/播放栏） |
| `--page-*` | 20 | 12 | 页面切换动效（时长、缓动、位移、缩放） |
| `--text-*` | **57** | 4 | 主文字、次文字 |
| `--border-*` | **59** | 4 | 描边（light / subtle / strong） |
| `--control-*` | **62** | 23 | 控件底色、悬停、选中、复选框、滑块轨道 |
| `--scrollbar-*` | 75 | 6 | 滚动条拇指颜色 |
| `--shadow-*` | **89** | 12 | 阴影层级（card / card-hover / elevated / dialog / cover / control） |
| `--state-*` | **95** | 7 | 危险/警告/成功 + 各自浅底 |
| `--color-brand*` | **104** | 7 | 品牌蓝（非主题色场景的回退色） |
| `--color-primary*` | 116 | 22 | 主题色体系（运行时会按封面动态覆盖） |

**常用令牌现值（浅色）**

| 令牌 | 行号 | 值 |
|---|---:|---|
| `--surface-sidebar-base` | 6 | `#ffffff` |
| `--surface-main-base` | 7 | `#f5f5f7` |
| `--text-main` | 57 | `#1d1d1f` |
| `--text-secondary` | 58 | `#4b5563` |
| `--border-light` | 59 | `#e5e5ea` |
| `--shadow-card` | 91 | `0 8px 18px rgba(15,23,42,.08)` |
| `--shadow-card-hover` | 92 | `0 12px 28px rgba(15,23,42,.12), 0 0 24px var(--color-primary-light)` |
| `--color-brand` | 104 | `#0071e3` |

**深色主题对应值**：`--surface-main-base` 在 152（`#26262a`）、`--text-main` 在 160（`#f5f5f7`）、`--shadow-card` 在 190。

---

## 7. 深色模式与主题色机制

- **深色开关**：根节点 `.dark` 类；令牌在 `style.css:150–196` 覆盖。
- **动态主题色**：`utils/color.ts` 从封面图取色，运行时写 `--color-primary*` 等（约 300–340 行），所以界面主色会随歌曲变化。
- **氛围渐变**：`style.css:774–846`，峰值 `0.32`（780 行）、中段 `0.127`（781 行）；深色峰值 `0.3`（818 行）。
- **`@theme` 映射**：`198–218`，决定 `bg-primary`、`text-text-main` 这些工具类解析到哪个值。

---

## 8. Tailwind 间距换算（改类名时对照）

| 类 | 值 | 类 | 值 |
|---|---|---|---|
| `p-0.5` | 2px | `gap-3` | 12px |
| `p-1` | 4px | `gap-3.5` | 14px |
| `p-1.5` | 6px | `gap-4` | 16px |
| `p-2` | 8px | `px-3.5` | 14px |
| `p-3` | 12px | `pl-7.5` | 30px |
| `p-4` | 16px | `h-24` | 96px |

圆角：`rounded`(4px) `rounded-lg`(8px) `rounded-xl`(12px) `rounded-[14px]`(14px) `rounded-2xl`(16px) `rounded-full`(胶囊)

---

## 9. 改动注意事项

1. **标题栏搜索框别超过约 410px**：`TitleBar.vue:126` 的容量算法按 410px 预留导航宽度，搜索更宽会把「听歌识曲/任务中心」挤进「…」菜单。而且该容量**只在窗口尺寸变化时重算**，改完若不生效，拖一下窗口边缘即可。
2. **窗口圆角**：系统 DWM 圆角（8px）与客户端裁剪二选一，由 `main/ipc/window.ts` 的 `radius` + `clientCornerRadius` 决定；客户端裁剪需要透明窗口，否则四角会露出不透明底色。
3. **不要随便加 `!important`**：组件是 `<style scoped>` + `@apply`，全局覆盖会与 scoped 选择器打架，优先改组件内的类名。
4. **卡片阴影统一走变量**：`--shadow-card` / `--shadow-card-hover`，改这两个变量即可全站卡片换阴影。
5. **圆角有硬编码残留**：卡片里仍散落 `rounded-[14px]`/`[16px]`/`[20px]`（约 40 处），统一圆角需要逐个改这些类名。

---

## 10. 常见修改配方

| 想改 | 操作 |
|---|---|
| 侧栏变宽 | `layouts/MainLayout.vue:192` 改 `230px` |
| 搜索框变宽/变高 | `layouts/TitleBar.vue:914`（宽度）、`:950`（高度） |
| 播放栏变矮 | `layouts/PlayerBar.vue:282` 把 `h-24` 改 `h-20` |
| 全站主色 | `style.css:104`（品牌色）与 `198` 的 `--color-primary`；但**动态主题色会覆盖**，需在设置里关闭"主题色跟随封面" |
| 全站底色 | `style.css:7`（浅）/ `152`（深） |
| 卡片阴影 | `style.css:91–92`（浅）/ `190`（深） |
| 侧栏导航行高 | `layouts/Sidebar.vue:988` 的 `py-2` |
| 歌单行高 | `layouts/Sidebar.vue:1043/1079` 的 `py-1.5` |
| 歌单区头部缩进 | `layouts/components/SidebarPlaylistHeader.vue:29` 的 `pl-7.5` |
| 首页英雄卡 | `views/Home.vue`（搜 `hero` 关键字） |

---

## 浮层模糊刻度（P2 统一）

以前全站有 **12 种不同的 `backdrop-filter: blur()` 取值**（6/8/10/12/14/18/20/22/24/26/28px），同一个应用里浮层质感不一致。

现在收敛成 4 档，定义在 `style.css` 的 `:root`：

| 令牌 | 值 | 用在哪 |
|---|---|---|
| `--surface-blur-sm` | 8px | 小浮层、按钮浮起、验证码面板 |
| `--surface-blur-md` | 14px | 菜单、气泡、侧栏浮层、麦位卡 |
| `--surface-blur-lg` | 22px | 弹窗、顶栏、聊天面板 |
| `--surface-blur-xl` | 28px | 全屏遮罩、房间弹窗 |

规则：

- 新写浮层**只准用这 4 个令牌**，不要再写死像素
- 装饰性大模糊（如歌词背景 `blur(64px)`）不用令牌，属于美术效果
- `@supports (backdrop-filter: blur(1px))` 里的字面量不要替换成变量（特性检测不认 `var()`）

当前统计：`backdrop-filter` 共 50 处，其中 49 处走令牌，1 处装饰性模糊保持字面量。
