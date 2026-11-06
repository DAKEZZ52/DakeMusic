# 交互参考记录

记录「借鉴了哪个项目的哪个交互」，以及实现方式。**只借鉴交互与设计思路，不复制代码**——原因是许可证：

| 项目 | 协议 | 能否复制代码 |
|---|---|---|
| Folia | AGPL-3.0 | ❌ 与 GPL-3.0-only 冲突 |
| DakeMusic | GPL-3.0 | 本项目 |

## 1. 音质链路面板

- **参考**：Folia `src/components/hifi/HifiSignalPathPanel.tsx`（把「音源 → 解码 → 重采样 → 输出」摊开，逐环标注）
- **实现**：`src/renderer/utils/signalPath.ts`（纯函数）+ `src/renderer/components/player/SignalPathPanel.vue`，挂在音质弹层里的「输出链路」折叠项
- **差异**：
  - 只显示真实拿得到的数据：音质、来源、采样率、格式、声道、驱动、缓冲；拿不到的写「—」，不猜
  - 结论优先（`buildVerdict`）：重采样 > 有损 > 无损独占，一句话告诉用户「听到的是不是原样」
  - 没有波形图、没有链路动画——数据量不够，画出来就是装饰
- **测试**：`tests/signal-path.test.ts`（12 例，覆盖文案、重采样判定、结论优先级）

## 2. 切歌浮卡

- **参考**：Folia `src/components/app/overlays/NowPlayingToast.tsx`
- **实现**：`src/renderer/components/app/NowPlayingToast.vue`，挂在 `App.vue`
- **差异**：
  - 首次加载不弹（避免一打开应用就冒卡）
  - 4.5 秒自动收起；点卡片立即收起；带进度条
  - 只用现有 `Cover` 组件与设计令牌，没有搬 Folia 的拖拽/吸附逻辑

## 记录规则

以后每借鉴一处，在这里加一条：参考项目、文件路径、我们对应的实现文件、差异说明。