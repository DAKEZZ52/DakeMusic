<!--
 * DakeMusic - 下载统计面板
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：下载统计四格（全部任务/下载中/已完成/失败），只渲染数据区不画外壳，
 *      由页面壳与「下载设置」共用一个分区卡。只读 store 数据。
 -->
<script setup lang="ts">
import { computed } from 'vue';
import { useDownloadStore } from '@/stores/download';

defineOptions({ name: 'DownloadStatsPanel' });

const downloadStore = useDownloadStore();

const total = computed(() => downloadStore.tasks.length);
const running = computed(
  () => downloadStore.tasks.filter((t) => t.status === 'running' || t.status === 'pending').length,
);
const done = computed(() => downloadStore.tasks.filter((t) => t.status === 'completed').length);
const failed = computed(() => downloadStore.tasks.filter((t) => t.status === 'error').length);
</script>

<template>
  <div class="stats-row">
    <div class="stat-cell">
      <div class="stat-value">{{ total }}</div>
      <div class="stat-label">全部任务</div>
    </div>
    <div class="stat-cell">
      <div class="stat-value">{{ running }}</div>
      <div class="stat-label">下载中</div>
    </div>
    <div class="stat-cell">
      <div class="stat-value">{{ done }}</div>
      <div class="stat-label">已完成</div>
    </div>
    <div class="stat-cell">
      <div class="stat-value">{{ failed }}</div>
      <div class="stat-label">失败</div>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.stats-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text-main);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
</style>
