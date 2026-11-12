<!--
 * LyriseMusic - 人声分离操作栏组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：人声分离页顶部操作行（云盘页风格）：开始分离主按钮。
 *      开始条件由页面壳计算传入，本组件只负责按钮展示与事件上抛。
 -->
<script setup lang="ts">
import { iconScissors } from '@/icons';

defineOptions({ name: 'SeparatorActionBar' });

defineProps<{
  /** 是否允许开始分离（空闲 + 模型已下载 + 已设置保存位置）。 */
  canStart: boolean;
  /** 分离中/保存中。 */
  isBusy: boolean;
}>();

const emit = defineEmits<{ (e: 'start'): void }>();
</script>

<template>
  <div class="action-row-wrap flex flex-wrap gap-2">
    <!-- 主操作：开始分离 -->
    <button type="button" class="action-btn primary" :disabled="!canStart" @click="emit('start')">
      <div class="icon-wrap">
        <Icon :icon="iconScissors" width="16" height="16" />
      </div>
      <span>{{ isBusy ? '正在分离…' : '开始分离' }}</span>
    </button>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.action-btn {
  @apply flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] font-semibold transition-all active:scale-95 select-none;
  background-color: var(--bg-info-card);
  color: var(--color-text-main);
}

.action-btn.primary {
  @apply bg-primary text-on-primary hover:bg-primary-hover;
}

.action-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.action-btn:hover:not(:disabled) {
  @apply brightness-95;
}

.icon-wrap {
  @apply flex items-center justify-center w-4 h-4;
}
</style>
