# 交互参考记录

记录「借鉴了哪个项目的哪个交互」，以及实现方式。**只借鉴交互与设计思路，不复制代码**——原因是许可证：

| 项目 | 协议 | 能否复制代码 |
|---|---|---|
| Folia | AGPL-3.0 | ❌ 与 GPL-3.0-only 冲突 |
| DakeMusic | GPL-3.0 | 本项目 |

## 1. 音质链路面板

- **参考**：Folia `src/components/hifi/HifiSignalPathPanel.tsx`（把「音源 → 解码 → 重采样 → 输出」摊开，逐环标注）
- **实现**：`src/renderer/utils/signalPath.ts` + `src/renderer/components/player/SignalPathPanel.vue`
- **差异**：只显示真实拿得到的数据，拿不到的写「—」；结论优先（重采样 > 有损 > 无损独占）；没有波形图与链路动画
- **测试**：`tests/signal-path.test.ts`（12 例）

## 2. 切歌浮卡

- **参考**：Folia `src/components/app/overlays/NowPlayingToast.tsx`
- **实现**：`src/renderer/components/app/NowPlayingToast.vue`
- **差异**：首次加载不弹；4.5 秒自动收起；没有搬拖拽/吸附逻辑

## 3. 歌词页皮肤（6 套）

- **参考**：Folia `src/components/visualizer/` 的风格命名与视觉方向（nebbia 雾、machi 霓虹、sonnet 排版、hanabi、lumiere 等）
- **实现**：`src/renderer/views/lyric/ThemedLyricSkin.vue` + `MistMode/NeonMode/PaperMode/AuroraMode/FilmMode/SpaceMode.vue`
- **差异**：Folia 是 WebGL/Pixi 可视化，我们用纯 CSS（光晕 + 噪点 + 网格 + 暗角）做出同等气质；不含对方任何着色器或代码
- **浅色皮肤**：雾白、纸上会通过 `:has()` 把标题栏按钮切成深色，底栏压深保证对比

## 4. 主题预设画廊

- **参考**：Folia `src/components/modal/ThemePark.tsx`（成套外观的卡片画廊）
- **实现**：`src/renderer/data/themePresets.ts` + `src/renderer/composables/useThemePresets.ts` + `src/renderer/components/settings/ThemePresetGallery.vue`
- **差异**：10 套 = 强调色 + 顶部渐变 + 深浅模式；点选即生效，之后仍可在「主题色」里微调；没有做主题导入导出

## 5. 本地歌曲信息匹配

- **参考**：Folia `src/components/modal/LocalSongMetadataMatchDialog.tsx` + `DurationMatchBadge.tsx`（按时长接近度标注候选）
- **实现**：`src/renderer/components/localMusic/LocalMetadataMatchDialog.vue` + 主进程 `local-music:apply-metadata`
- **差异**：
  - 左栏搜本地文件、右栏搜线上曲目；按时长差与名称相似度排序，标注「时长一致 / 长 Ns / 短 Ns」
  - 写回走项目已有的 `MetadataWriter`（MP3 用 node-id3，其余走 taglib-wasm），只允许写「已在本地库中」的文件
  - 没有做批量匹配与自动匹配

## 记录规则

以后每借鉴一处，在这里加一条：参考项目、文件路径、我们对应的实现文件、差异说明。