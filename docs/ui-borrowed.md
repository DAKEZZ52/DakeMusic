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

## 2. 命令面板（Ctrl / ⌘ + K）

- **参考**：Folia `src/components/command-palette/`（109 个文件：命令工厂、按使用频率排序、队列视图）
- **实现**：`src/renderer/composables/useCommandPalette.ts` + `src/renderer/components/app/CommandPalette.vue`（挂在 `App.vue`）
- **差异**：
  - 只做 MVP：一个输入框、两段分组（播放 / 前往）、18 个命令
  - 没做「按使用频率排序」「最近使用」「队列视图」——这些是 Folia 的 109 个文件所在
  - 关键词直接拼中文/英文别名（如「下载 / download」），不做模糊评分算法
  - 输入框有内容但没匹配命令时，自动出现一条「搜索「xxx」」，回车跳到搜索页并带上 `?q=`
- **未借鉴**：命令频率统计、命令面板里的队列管理、capsule 框架
