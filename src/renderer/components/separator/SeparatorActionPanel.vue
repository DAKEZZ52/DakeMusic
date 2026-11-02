<!--
 * DakeMusic - 人声分离输出选项组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：分离页「输出选项」分区卡：保存位置 / 模型位置（可打开/更改）+
 *      调性开关与目标调下拉；开始分离按钮在顶部操作行（SeparatorActionBar）。
 -->
<script setup lang="ts">
defineOptions({ name: 'separator-action-panel' });

import { computed } from 'vue';
import { iconFolderOpen, iconMusic } from '@/icons';
import Tooltip from '@/components/ui/Tooltip.vue';

const props = defineProps<{
  busy: 'idle' | 'separate' | 'save';
  enableKeyShift: boolean;
  selectedKey: number;
  keyOptions: { label: string; value: number }[];
  selectedModelDownloaded: boolean;
  saveDir: string;
  modelDir: string;
  downloadingModelId: string | null;
}>();

const emit = defineEmits<{
  (e: 'updateKeyShift', checked: boolean): void;
  (e: 'updateKey', value: number): void;
  (e: 'pickSaveDir'): void;
  (e: 'pickModelDir'): void;
  (e: 'revealDir', dir: string): void;
}>();

/** 是否忙碌（禁止交互）。 */
const isBusy = computed(() => props.busy !== 'idle');
/** 保存位置显示。 */
const saveDirText = computed(() => props.saveDir || '未设置（请点击更改）');
/** 模型位置显示。 */
const modelDirText = computed(() => props.modelDir || '未设置（请点击更改）');
</script>

<template>
  <div class="sep-action-card">
    <h2 class="sep-card-title">输出选项</h2>
    <div class="local-info-card">
      <!-- 保存位置 -->
      <div class="dir-row">
        <div class="dir-row-text">
          <div class="dir-label">保存位置</div>
          <Tooltip :content="saveDirText" overflow-only>
            <template #trigger>
              <div class="dir-path">{{ saveDirText }}</div>
            </template>
          </Tooltip>
        </div>
        <div class="dir-btns">
          <Tooltip content="在文件管理器中打开">
            <template #trigger>
              <button
                type="button"
                class="mini-btn"
                aria-label="在文件管理器中打开"
                :disabled="isBusy || !saveDir"
                @click="emit('revealDir', saveDir)"
              >
                <Icon :icon="iconFolderOpen" width="12" height="12" />
              </button>
            </template>
          </Tooltip>
          <button
            type="button"
            class="mini-btn primary"
            :disabled="isBusy"
            @click="emit('pickSaveDir')"
          >
            更改
          </button>
        </div>
      </div>

      <!-- 模型位置 -->
      <div class="dir-row">
        <div class="dir-row-text">
          <div class="dir-label">模型位置</div>
          <Tooltip :content="modelDirText" overflow-only>
            <template #trigger>
              <div class="dir-path">{{ modelDirText }}</div>
            </template>
          </Tooltip>
        </div>
        <div class="dir-btns">
          <Tooltip content="在文件管理器中打开">
            <template #trigger>
              <button
                type="button"
                class="mini-btn"
                aria-label="在文件管理器中打开"
                :disabled="isBusy || !modelDir"
                @click="emit('revealDir', modelDir)"
              >
                <Icon :icon="iconFolderOpen" width="12" height="12" />
              </button>
            </template>
          </Tooltip>
          <button
            type="button"
            class="mini-btn primary"
            :disabled="isBusy || !!downloadingModelId"
            @click="emit('pickModelDir')"
          >
            更改
          </button>
        </div>
      </div>

      <!-- 调性 -->
      <div class="sep-key-inline">
        <span class="sep-key-icon"><Icon :icon="iconMusic" /></span>
        <span class="sep-key-label">调性</span>
        <span v-if="!selectedModelDownloaded" class="sep-key-hint">请先在上方下载分离模型</span>
        <Tooltip :content="enableKeyShift ? '关闭变调' : '开启变调'">
          <template #trigger>
            <label class="sep-key-switch">
              <input
                type="checkbox"
                class="sep-key-checkbox"
                aria-label="启用变调"
                :checked="enableKeyShift"
                :disabled="isBusy"
                @change="emit('updateKeyShift', ($event.target as HTMLInputElement).checked)"
              />
              <span class="sep-key-slider" />
            </label>
          </template>
        </Tooltip>
        <select
          class="sep-key-select"
          :disabled="isBusy || !enableKeyShift"
          :value="selectedKey"
          @change="emit('updateKey', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="k in keyOptions" :key="k.label" :value="k.value">
            {{ k.label }}
          </option>
        </select>
      </div>
      <p class="sep-key-sub">开启后按所选调性整体变调输出（原调不做变调）。</p>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.sep-action-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分区卡标题（与来源/模型卡一致） */
.sep-card-title {
  margin: 0 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
}

.local-info-card {
  @apply rounded-2xl border border-[var(--border-subtle)];
  background-color: var(--bg-info-card);
  padding: 14px 16px;
}

/* 位置行 */
.dir-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.dir-row + .dir-row {
  border-top: 1px solid var(--border-subtle);
}

.dir-row-text {
  min-width: 0;
  flex: 1;
}

.dir-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-main);
}

.dir-path {
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  height: 28px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.15s ease;
  background-color: var(--bg-card);
  color: var(--color-text-main);
  border: 1px solid var(--border-subtle);
  user-select: none;
}

.mini-btn.primary {
  background-color: var(--color-primary);
  color: var(--color-on-primary);
  border-color: transparent;
}

.mini-btn:hover:not(:disabled):not(.primary) {
  filter: brightness(0.96);
}

.mini-btn.primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.mini-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* 调性：横排（图标 + 文字 + 提示 + 开关 + 下拉） */
.sep-key-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.sep-key-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-primary-text);
}

.sep-key-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-main);
  white-space: nowrap;
}

.sep-key-hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sep-key-sub {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

/* 开关 */
.sep-key-switch {
  flex-shrink: 0;
  position: relative;
  display: inline-block;
  width: 36px;
  height: 21px;
  cursor: pointer;
}

.sep-key-checkbox {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.sep-key-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.18);
  transition: background 0.2s ease;
}

.dark .sep-key-slider {
  background: rgba(255, 255, 255, 0.18);
}

.sep-key-slider::before {
  content: '';
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.sep-key-checkbox:checked + .sep-key-slider {
  background: var(--color-primary);
}

.sep-key-checkbox:checked + .sep-key-slider::before {
  transform: translateX(15px);
}

.sep-key-checkbox:disabled + .sep-key-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 目标调下拉 */
.sep-key-select {
  flex-shrink: 0;
  max-width: 116px;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-main);
  background-color: var(--bg-card);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.sep-key-select:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.sep-key-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
