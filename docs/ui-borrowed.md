# 交互参考记录

记录我们「借鉴了哪个项目的哪个交互」，以及实现方式。**只借鉴交互与设计思路，不复制代码**——原因是许可证：

| 项目 | 协议 | 能否复制代码 |
|---|---|---|
| Folia | AGPL-3.0 | ❌ 与 GPL-3.0-only 冲突 |
| DakeMusic | GPL-3.0 | 本项目 |

## 1. 播放栏可自定义槽位

- **参考**：Folia `src/components/floating-player/PlayerControlSlotPicker.tsx`（右键槽位原地换按钮）
- **实现**：`src/renderer/composables/usePlayerSlots.ts` + `src/renderer/components/player/PlayerSlotPanel.vue` + `PlayerBar.vue`
- **差异**：
  - Folia 是两个必填槽位 + 原地小浮层；我们用「末尾 ⋯ 面板 + 右键打开」，面板里带「位置 1 / 位置 2」切换
  - 默认值保持原样（音质 + 音效），不改变任何既有行为
  - 可选项 12 个（音质/音效/变速/桌面歌词/队列/收藏/下载/睡眠定时/评论/MV/加入歌单/留空）
  - 持久化到 `localStorage` 的 `dakemusic_player_slots_v1`
- **未借鉴**：Folia 的胶囊玻璃样式函数、槽位推荐算法（`slotSuggestionCandidateTracker`）

## 记录规则

以后每借鉴一处，在这里加一条：参考项目、文件路径、我们对应的实现文件、差异说明。
