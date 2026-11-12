<!--
 * LyriseMusic - 下载管理操作栏组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：下载管理页顶部操作行（云盘页风格）：清除已完成。
 *      下载目录入口统一收在「下载设置」分区卡内，避免重复。
 *      样式与 DetailPageActionRow / LocalMusicActionBar 全站一致。
 -->
<script setup lang="ts">
import { computed } from 'vue';
import { iconTrash } from '@/icons';
import { useDownloadStore } from '@/stores/download';

defineOptions({ name: 'DownloadActionBar' });

const downloadStore = useDownloadStore();

/** 存在已完成任务时才能清除。 */
const clearDisabled = computed(() => !downloadStore.tasks.some((t) => t.status === 'completed'));

const handleClearFinished = () => {
  void downloadStore.clearFinished();
};
</script>

<template>
  <div class="action-row-wrap flex flex-wrap gap-2">
    <!-- 主操作：清除已完成 -->
    <button
      type="button"
      class="action-btn primary"
      :disabled="clearDisabled"
      @click="handleClearFinished"
    >
      <div class="icon-wrap">
        <Icon :icon="iconTrash" width="16" height="16" />
      </div>
      <span>清除已完成</span>
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

.action-btn:hover {
  @apply brightness-95;
}

.icon-wrap {
  @apply flex items-center justify-center w-4 h-4;
}
</style>
