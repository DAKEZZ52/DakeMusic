<script setup lang="ts">
/**
 * DakeMusic 人声分离 - 音频来源选择组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：iOS 风格分段控件（当前播放歌曲 / 本地文件）与来源行展示，
 *      纯展示组件，交互通过事件上抛由页面壳统一处理。
 */
defineOptions({ name: 'separator-source-selector' });

import { computed } from 'vue';
import { iconMusic, iconUpload, iconTriangleAlert, iconChevronRight } from '@/icons';

/** 来源类型：current=当前播放歌曲，file=本地文件。 */
const props = defineProps<{
  sourceType: 'current' | 'file';
  /** 分离中禁止切换来源。 */
  isBusy: boolean;
  /** 当前播放歌曲标题（无歌曲时为空）。 */
  currentTitle: string;
  /** 当前播放歌曲歌手（可为空）。 */
  currentArtist: string;
  /** 当前播放歌曲封面（可为空）。 */
  currentCover: string;
  /** 已选择的本地文件名（未选择时为空）。 */
  selectedFileName: string;
}>();

const emit = defineEmits<{
  (e: 'select', type: 'current' | 'file'): void;
  (e: 'filePicked', event: Event): void;
}>();

/** 分段控件滑块偏移（0=当前歌曲，1=本地文件）。 */
const sourceIndex = computed(() => (props.sourceType === 'current' ? 0 : 1));
</script>

<template>
  <div class="sep-source-block">
    <h2 class="sep-card-title"></h2>
    <div class="local-info-card">
      <!-- 音频来源：iOS 分段控件 -->
      <div class="sep-segmented" role="radiogroup" aria-label="音频来源">
        <span
          class="sep-seg-thumb"
          aria-hidden="true"
          :style="{ transform: `translateX(${sourceIndex * 100}%)` }"
        />
        <button
          type="button"
          role="radio"
          class="sep-seg-item"
          :class="{ 'is-active': sourceType === 'current' }"
          :aria-checked="sourceType === 'current'"
          :disabled="isBusy"
          @click="emit('select', 'current')"
        >
          <span class="sep-seg-icon"><Icon :icon="iconMusic" /></span>
          当前播放歌曲
        </button>
        <button
          type="button"
          role="radio"
          class="sep-seg-item"
          :class="{ 'is-active': sourceType === 'file' }"
          :aria-checked="sourceType === 'file'"
          :disabled="isBusy"
          @click="emit('select', 'file')"
        >
          <span class="sep-seg-icon"><Icon :icon="iconUpload" /></span>
          本地文件
        </button>
      </div>

      <!-- 来源行：当前歌曲（带封面缩略图）/ 本地文件 -->
      <div class="sep-rows">
        <template v-if="sourceType === 'current'">
          <div v-if="currentTitle" class="sep-row">
            <span class="sep-cover">
              <img v-if="currentCover" :src="currentCover" alt="" />
              <span v-else class="sep-cover-fallback"><Icon :icon="iconMusic" /></span>
            </span>
            <div class="sep-row-text">
              <div class="sep-row-title">{{ currentTitle }}</div>
              <div v-if="currentArtist" class="sep-row-sub">{{ currentArtist }}</div>
              <div v-else class="sep-row-sub">待分离歌曲</div>
            </div>
          </div>
          <div v-else class="sep-row is-warning">
            <span class="sep-row-icon sep-icon-warning">
              <Icon :icon="iconTriangleAlert" />
            </span>
            <div class="sep-row-text">
              <div class="sep-row-title">当前没有正在播放的歌曲</div>
              <div class="sep-row-sub">先在播放器里播放一首歌，或切换到「本地文件」。</div>
            </div>
          </div>
        </template>

        <label v-else class="sep-row is-clickable" :class="{ 'is-disabled': isBusy }">
          <span class="sep-row-icon sep-icon-blue"><Icon :icon="iconUpload" /></span>
          <div class="sep-row-text">
            <div class="sep-row-title">{{ selectedFileName || '选择音频文件' }}</div>
            <div class="sep-row-sub">
              {{ selectedFileName ? '点此重新选择' : '支持 MP3 / FLAC / WAV / M4A' }}
            </div>
          </div>
          <span class="sep-row-chevron"><Icon :icon="iconChevronRight" /></span>
          <input
            type="file"
            class="sep-file-input"
            accept="audio/*"
            @change="emit('filePicked', $event)"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.sep-source-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分区卡标题（云盘页分区风格） */
.sep-card-title {
  margin: 0 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
}

/* 分区卡片（云盘页 local-info-card 风格） */
.local-info-card {
  @apply rounded-2xl border border-[var(--border-subtle)];
  background-color: var(--bg-info-card);
  padding: 4px;
}

/* === iOS 分段控件 === */
.sep-segmented {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 2px;
  border-radius: 9px;
  /* 玻璃内的浅灰滑槽（半透明黑），比玻璃本体略沉以衬托滑块 */
  background: rgba(17, 24, 39, 0.07);
  user-select: none;
}

/* 深色模式下滑槽更沉，选中滑块仍然清晰可辨 */
.dark .sep-segmented {
  background: rgba(255, 255, 255, 0.1);
}

.sep-seg-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  border-radius: 7px;
  /* 选中滑块用歌曲主题色实底 */
  background: var(--sep-accent, #0071e3);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.18),
    0 0 0 0.5px rgba(0, 0, 0, 0.06);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  pointer-events: none;
}

.dark .sep-seg-thumb {
  background: var(--sep-accent, #0071e3);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.4),
    0 0 0 0.5px rgba(255, 255, 255, 0.08);
}

.sep-seg-item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: none;
  border-radius: 7px;
  background: transparent;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
}

.sep-seg-item.is-active {
  color: #ffffff;
  font-weight: 600;
}

.sep-seg-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sep-seg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

/* === 来源封面缩略图 === */
.sep-cover {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(17, 24, 39, 0.08);
  box-shadow: 0 1px 3px rgba(31, 38, 135, 0.16);
}

.sep-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sep-cover-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 18px;
  color: var(--color-text-secondary);
}

.dark .sep-cover {
  background: rgba(255, 255, 255, 0.09);
}

/* === 分组列表行 === */
.sep-rows {
  padding: 4px 0 0;
}

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

.sep-icon-blue {
  background: linear-gradient(
    180deg,
    var(--sep-accent-grad-from, #4a9df8),
    var(--sep-accent-grad-to, #0071e3)
  );
}

.sep-icon-warning {
  background: linear-gradient(180deg, #ffb340, #f59e0b);
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

.sep-row-chevron {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: color-mix(in srgb, var(--color-text-secondary) 75%, transparent);
}

.sep-file-input {
  display: none;
}
</style>
