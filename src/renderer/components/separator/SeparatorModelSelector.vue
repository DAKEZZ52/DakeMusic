<script setup lang="ts">
/**
 * DakeMusic 人声分离 - 分离模型选择组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：MDX-Net 分离模型列表（可收起），每行展示模型名称/描述/下载状态
 *      （已下载 / 下载中进度 / 独立下载按钮），纯展示组件。
 */
defineOptions({ name: 'separator-model-selector' });

import { computed } from 'vue';
import { iconScissors, iconCloudDownload, iconCheckMark, iconChevronDown } from '@/icons';
import type { SeparatorModelInfo } from '../../../shared/separator';
import Tooltip from '@/components/ui/Tooltip.vue';

const props = defineProps<{
  models: SeparatorModelInfo[];
  selectedModelId: string;
  /** 正在独立下载的模型 id（进度显示在模型行）。 */
  downloadingModelId: string | null;
  /** 模型下载进度（0..1）。 */
  downloadPercent: number;
  /** 模型列表是否收起。 */
  modelsCollapsed: boolean;
  isBusy: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectModel', id: string): void;
  (e: 'downloadModel', model: SeparatorModelInfo): void;
  (e: 'toggleCollapse'): void;
}>();

/** 已下载模型数（卡头统计）。 */
const downloadedCount = computed(() => props.models.filter((m) => m.downloaded).length);
</script>

<template>
  <div class="sep-model-block">
    <!-- 分离模型分区卡（可收起，默认展开） -->
    <div class="local-info-card">
      <div class="sep-section-head">
        <h2 class="sep-section-title">分离模型</h2>
        <div class="sep-head-group">
          <span class="sep-model-count"
            >{{ models.length }} 个模型 · {{ downloadedCount }} 已下载</span
          >
          <Tooltip :content="modelsCollapsed ? '展开模型列表' : '收起模型列表'">
            <template #trigger>
              <button
                type="button"
                class="sep-collapse-btn"
                :aria-expanded="!modelsCollapsed"
                :aria-label="modelsCollapsed ? '展开模型列表' : '收起模型列表'"
                @click="emit('toggleCollapse')"
              >
                <span class="sep-collapse-icon" :class="{ 'is-collapsed': modelsCollapsed }">
                  <Icon :icon="iconChevronDown" />
                </span>
              </button>
            </template>
          </Tooltip>
        </div>
      </div>
      <div v-if="!modelsCollapsed" class="sep-model-list" role="radiogroup" aria-label="分离模型">
        <button
          v-for="model in models"
          :key="model.id"
          type="button"
          role="radio"
          class="sep-row is-clickable"
          :class="{
            'is-selected': selectedModelId === model.id,
            'is-disabled': isBusy,
          }"
          :aria-checked="selectedModelId === model.id"
          @click="emit('selectModel', model.id)"
        >
          <span class="sep-row-icon sep-icon-purple"><Icon :icon="iconScissors" /></span>
          <div class="sep-row-text">
            <div class="sep-row-title">{{ model.name }}</div>
            <div class="sep-row-sub">MDX-Net 分离模型 · 44.1 kHz</div>
          </div>
          <!-- 已下载 -->
          <span v-if="model.downloaded" class="sep-badge is-success">已下载</span>
          <!-- 独立下载：进度显示在模型行 -->
          <span v-else-if="downloadingModelId === model.id" class="sep-badge is-downloading">
            <span class="sep-badge-spinner" aria-hidden="true" />
            {{ Math.round(downloadPercent * 100) }}% 下载中
          </span>
          <!-- 未下载：提供独立的下载按钮，与「开始分离」解耦 -->
          <button
            v-else
            type="button"
            class="sep-download-btn"
            :disabled="isBusy || !!downloadingModelId"
            @click="emit('downloadModel', model)"
          >
            <span class="sep-badge-icon"><Icon :icon="iconCloudDownload" /></span>
            下载
          </button>
          <span class="sep-check" :class="{ 'is-on': selectedModelId === model.id }">
            <Icon :icon="iconCheckMark" />
          </span>
        </button>
        <div v-if="models.length === 0" class="sep-row">
          <div class="sep-row-text">
            <div class="sep-row-title">模型列表加载中</div>
          </div>
        </div>
      </div>
      <p v-if="!modelsCollapsed" class="sep-footnote">
        模型需先下载（约 64MB），下载后缓存到本地，无需重复下载。
      </p>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.sep-model-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分区卡片（云盘页 local-info-card 风格） */
.local-info-card {
  @apply rounded-2xl border border-[var(--border-subtle)];
  background-color: var(--bg-info-card);
  padding: 4px;
}

/* === 分区标题（含收起按钮） === */
.sep-section-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
}

.sep-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 6px 0;
}

.sep-head-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sep-model-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.sep-section-head .sep-section-title {
  margin: 0;
}

.sep-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.sep-collapse-btn:hover {
  background: rgba(17, 24, 39, 0.05);
  color: var(--color-text-main);
}

.dark .sep-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.sep-collapse-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 16px;
  transition: transform 0.22s ease;
}

.sep-collapse-icon.is-collapsed {
  transform: rotate(-90deg);
}

/* === 模型列表容器 === */
.sep-model-list {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}

/* === 分组列表行（模型行复用） === */
.sep-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 12px 14px;
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
}

.sep-row + .sep-row {
  border-top: 1px solid rgba(17, 24, 39, 0.07);
}

.dark .sep-row + .sep-row {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.sep-row.is-clickable {
  cursor: pointer;
  transition: background-color 0.18s ease;
}

.sep-row.is-clickable:hover {
  background: rgba(17, 24, 39, 0.04);
}

.dark .sep-row.is-clickable:hover {
  background: rgba(255, 255, 255, 0.06);
}

.sep-row.is-selected {
  /* 玻璃上选中态：苹果蓝浅底略加深，保证透光下仍清晰 */
  background: rgba(0, 113, 227, 0.16);
}

.sep-row.is-disabled {
  pointer-events: none;
  opacity: 0.5;
}

.sep-row:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--sep-accent) 60%, transparent);
  outline-offset: -2px;
}

.sep-row-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  font-size: 16px;
  color: #ffffff;
  /* 玻璃上图标略微浮起 */
  box-shadow: 0 1px 3px rgba(31, 38, 135, 0.18);
}

.sep-icon-purple {
  /* 与歌曲来源图标统一为歌曲主题色渐变，贴合播放器整体风格 */
  background: linear-gradient(
    180deg,
    var(--sep-accent-grad-from, #4a9df8),
    var(--sep-accent-grad-to, #0071e3)
  );
}

.sep-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sep-row-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sep-row-sub {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === 下载状态徽标 === */
.sep-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: rgba(17, 24, 39, 0.07);
}

.dark .sep-badge {
  background: rgba(255, 255, 255, 0.09);
}

.sep-badge.is-success {
  color: var(--state-success);
  background: var(--state-success-bg-soft);
}

/* 模型下载中徽标（独立下载，显示百分比） */
.sep-badge.is-downloading {
  color: var(--sep-accent);
  background: var(--sep-accent-soft);
}

/* 模型下载中的转圈动画 */
.sep-badge-spinner {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--sep-accent) 25%, transparent);
  border-top-color: var(--sep-accent);
  animation: sep-spin 0.7s linear infinite;
}

@keyframes sep-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 模型下载按钮（未下载时显示，与「开始分离」解耦） */
.sep-download-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--sep-accent);
  background: var(--sep-accent-soft);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    opacity 0.18s ease;
}

.sep-download-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sep-accent) 22%, transparent);
}

.sep-download-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sep-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 11px;
  height: 11px;
  font-size: 11px;
}

/* === 选中对勾 === */
.sep-check {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 16px;
  color: var(--sep-accent);
  opacity: 0;
  transform: scale(0.86);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.sep-check.is-on {
  opacity: 1;
  transform: scale(1);
}

/* === 脚注 === */
.sep-footnote {
  margin: 8px 4px 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
</style>
