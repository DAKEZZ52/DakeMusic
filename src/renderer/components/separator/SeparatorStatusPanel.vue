<script setup lang="ts">
/**
 * DakeMusic 人声分离 - 状态面板组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：分离/保存进度面板、已保存结果面板、错误提示面板，
 *      纯展示组件（按传入状态渲染对应面板）。
 */
defineOptions({ name: 'separator-status-panel' });

import { iconCheckMark, iconTriangleAlert } from '@/icons';
import type { SeparatorOutput } from '../../../shared/separator';

defineProps<{
  /** idle 空闲，separate 分离中，save 保存中。 */
  busy: 'idle' | 'separate' | 'save';
  progressPercent: number;
  stageLabel: string;
  output: SeparatorOutput | null;
  errorMsg: string;
}>();
</script>

<template>
  <div class="sep-status-block">
    <!-- 分离 / 保存进度 -->
    <section v-if="busy !== 'idle'" class="sep-panel">
      <div class="sep-panel-head">
        <span class="sep-panel-title">{{ stageLabel }}…</span>
        <span class="sep-panel-value">{{ progressPercent }}%</span>
      </div>
      <div class="sep-progress">
        <div class="sep-progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="sep-panel-hint">
        {{
          busy === 'separate' ? '分离耗时取决于歌曲长度，期间请勿关闭应用。' : '正在写入 WAV 文件…'
        }}
      </p>
    </section>

    <!-- 已保存 -->
    <section v-if="output && busy === 'idle'" class="sep-panel is-success">
      <div class="sep-panel-head">
        <span class="sep-panel-title">
          <span class="sep-panel-icon"><Icon :icon="iconCheckMark" /></span>
          已保存到本地
        </span>
      </div>
      <div class="sep-output-list">
        <div class="sep-output-item">
          <span class="sep-output-tag">人声</span>
          <span class="sep-output-path">{{ output.vocalPath }}</span>
        </div>
        <div class="sep-output-item">
          <span class="sep-output-tag">伴奏</span>
          <span class="sep-output-path">{{ output.instrumentalPath }}</span>
        </div>
      </div>
    </section>

    <!-- 错误 -->
    <section v-if="errorMsg" class="sep-panel is-danger">
      <div class="sep-panel-head">
        <span class="sep-panel-title">
          <span class="sep-panel-icon"><Icon :icon="iconTriangleAlert" /></span>
          {{ errorMsg }}
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.sep-status-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* === 进度 / 结果 / 错误面板（玻璃内的浅色块，不再自带卡片边框） === */
.sep-panel {
  padding: 14px;
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.05);
}

.dark .sep-panel {
  background: rgba(255, 255, 255, 0.06);
}

.sep-panel.is-success {
  border-color: color-mix(in srgb, var(--state-success) 30%, transparent);
}

.sep-panel.is-success .sep-panel-title {
  color: var(--state-success);
}

.sep-panel.is-danger {
  border-color: color-mix(in srgb, var(--state-danger) 34%, transparent);
}

.sep-panel.is-danger .sep-panel-title {
  color: var(--state-danger);
}

.sep-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sep-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-main);
  line-height: 1.45;
}

.sep-panel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  font-size: 15px;
}

.sep-panel-value {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.sep-panel-hint {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.sep-progress {
  height: 6px;
  margin-top: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(17, 24, 39, 0.08);
}

.dark .sep-progress {
  background: rgba(255, 255, 255, 0.1);
}

.sep-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--sep-accent);
  transition: width 0.25s ease;
}

.sep-output-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.sep-output-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.sep-output-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sep-accent);
  background: var(--sep-accent-soft);
}

.sep-output-path {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  word-break: break-all;
}
</style>
