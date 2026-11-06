<script setup lang="ts">
/**
 * 播放栏槽位选择面板
 * 参考 Folia 的槽位切换交互思路（AGPL-3.0），代码独立实现。
 */
import { computed } from 'vue';
import {
  PLAYER_SLOT_OPTIONS,
  type PlayerSlotAction,
  type PlayerSlotOption,
} from '@/composables/usePlayerSlots';

const props = defineProps<{
  target: 'a' | 'b';
  current: PlayerSlotAction;
}>();

const emit = defineEmits<{
  (e: 'select', action: PlayerSlotAction): void;
  (e: 'switch-slot', slot: 'a' | 'b'): void;
  (e: 'reset'): void;
}>();

const options = computed<PlayerSlotOption[]>(() => PLAYER_SLOT_OPTIONS);
</script>

<template>
  <div class="slot-panel">
    <div class="slot-panel-head">
      <span class="slot-panel-title">播放栏按钮</span>
      <div class="slot-panel-tabs">
        <button
          type="button"
          class="slot-panel-tab"
          :class="{ active: props.target === 'a' }"
          @click="emit('switch-slot', 'a')"
        >
          位置 1
        </button>
        <button
          type="button"
          class="slot-panel-tab"
          :class="{ active: props.target === 'b' }"
          @click="emit('switch-slot', 'b')"
        >
          位置 2
        </button>
      </div>
    </div>

    <div class="slot-panel-list" role="listbox" aria-label="可放置的按钮">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        role="option"
        :aria-selected="option.id === props.current"
        class="slot-panel-item"
        :class="{ active: option.id === props.current }"
        @click="emit('select', option.id)"
      >
        <span class="slot-panel-label">{{ option.label }}</span>
        <span v-if="option.hint" class="slot-panel-hint">{{ option.hint }}</span>
        <span v-if="option.id === props.current" class="slot-panel-check" aria-hidden="true"
          >✓</span
        >
      </button>
    </div>

    <div class="slot-panel-foot">
      <span class="slot-panel-tip">右键播放栏按钮也可打开</span>
      <button type="button" class="slot-panel-reset" @click="emit('reset')">恢复默认</button>
    </div>
  </div>
</template>

<style scoped>
.slot-panel {
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  color: var(--text-main);
  background: var(--bg-card);
  border: 1px solid color-mix(in srgb, var(--text-main) 10%, transparent);
  border-radius: 14px;
  box-shadow: var(--shadow-card);
}

.slot-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px;
}

.slot-panel-title {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-main);
  opacity: 0.62;
}

.slot-panel-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--control-track-bg) 90%, transparent);
}

.slot-panel-tab {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  opacity: 0.6;
  transition:
    opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.slot-panel-tab:hover {
  opacity: 0.9;
}

.slot-panel-tab.active {
  opacity: 1;
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.slot-panel-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 288px;
  overflow-y: auto;
}

.slot-panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.slot-panel-item:hover {
  background: color-mix(in srgb, var(--text-main) 8%, transparent);
}

.slot-panel-item.active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.slot-panel-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.slot-panel-hint {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 16px;
  opacity: 0.42;
}

.slot-panel-check {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-primary);
}

.slot-panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 4px 0;
  border-top: 1px solid color-mix(in srgb, var(--text-main) 8%, transparent);
}

.slot-panel-tip {
  font-size: 11px;
  line-height: 16px;
  opacity: 0.42;
}

.slot-panel-reset {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.6;
}

.slot-panel-reset:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--text-main) 8%, transparent);
}
</style>
