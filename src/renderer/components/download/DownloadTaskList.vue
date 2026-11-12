<!--
 * LyriseMusic - 下载任务列表组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：下载管理页任务表格（云盘页歌曲表风格）：列头（歌曲/状态/进度/操作）+ 任务行，
 *      空状态引导；任务操作直接调用 download store 的 action。
 -->
<script setup lang="ts">
defineOptions({ name: 'download-task-list' });

import Cover from '@/components/ui/Cover.vue';
import Button from '@/components/ui/Button.vue';
import { useDownloadStore } from '@/stores/download';
import type { DownloadTaskSnapshot } from '../../../shared/download';
import {
  iconCheck,
  iconCloudDownload,
  iconFolderOpen,
  iconPause,
  iconPlay,
  iconRotateCcw,
  iconTrash,
  iconX,
} from '@/icons';

const downloadStore = useDownloadStore();

const props = defineProps<{ tasks: DownloadTaskSnapshot[] }>();

/** 状态对应文案。 */
const statusTextMap: Record<string, string> = {
  pending: '等待中',
  running: '下载中',
  paused: '已暂停',
  completed: '已完成',
  error: '下载失败',
  canceled: '已取消',
};

/** 状态文案。 */
const statusText = (task: DownloadTaskSnapshot): string => {
  let text = statusTextMap[task.status] ?? '';
  if (task.status === 'error' && task.error) text += `：${task.error}`;
  return text;
};

/** 状态颜色类。 */
const statusClass = (task: DownloadTaskSnapshot) => ({
  'is-running': task.status === 'running',
  'is-paused': task.status === 'paused',
  'is-done': task.status === 'completed',
  'is-error': task.status === 'error',
  'is-waiting': task.status === 'pending' || task.status === 'canceled',
});

/** 进度百分比（0~100）。 */
const percent = (task: DownloadTaskSnapshot): number => Math.round(task.progress * 100);

/** 字节大小格式化。 */
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
};

/** 进度条是否高亮（运行中）。 */
const barClass = (task: DownloadTaskSnapshot) => ({
  'is-running': task.status === 'running',
  'is-error': task.status === 'error',
  'is-done': task.status === 'completed',
});
</script>

<template>
  <!-- 空状态 -->
  <div v-if="!props.tasks.length" class="dlm-empty">
    <div class="dlm-empty-icon">
      <Icon :icon="iconCloudDownload" width="32" height="32" />
    </div>
    <div class="dlm-empty-title">还没有下载任务</div>
    <div class="dlm-empty-sub">在歌曲上点击下载图标，即可保存到本地</div>
  </div>

  <!-- 任务表格 -->
  <div v-else class="dlm-table">
    <!-- 列头 -->
    <div class="dlm-table-head">
      <div class="dlm-col-song">歌曲</div>
      <div class="dlm-col-status">状态</div>
      <div class="dlm-col-progress">进度</div>
      <div class="dlm-col-actions">操作</div>
    </div>

    <!-- 任务行 -->
    <div v-for="task in props.tasks" :key="task.id" class="dlm-task">
      <!-- 歌曲：封面 + 标题/歌手 -->
      <div class="dlm-col-song dlm-task-song">
        <div class="dlm-cover">
          <Cover :url="task.song.coverUrl" :size="88" border-radius="8" class="w-full h-full" />
        </div>
        <div class="dlm-task-titles">
          <div class="dlm-task-title">{{ task.song.title }}</div>
          <div class="dlm-task-artist">{{ task.song.artist }}</div>
        </div>
      </div>

      <!-- 状态 -->
      <div class="dlm-col-status">
        <span class="dlm-status-chip" :class="statusClass(task)">
          <span
            v-if="task.status === 'running'"
            class="dlm-status-dot is-running"
            aria-hidden="true"
          />
          {{ statusText(task) }}
        </span>
      </div>

      <!-- 进度：进度条 + 百分比/大小 -->
      <div class="dlm-col-progress">
        <div class="dlm-progress">
          <div
            class="dlm-progress-bar"
            :class="barClass(task)"
            :style="{ width: `${percent(task)}%` }"
          ></div>
        </div>
        <div class="dlm-task-meta">
          <span class="truncate">{{ percent(task) }}%</span>
          <span class="shrink-0">
            {{ formatBytes(task.downloadedBytes) }}
            <template v-if="task.totalBytes > 0">/ {{ formatBytes(task.totalBytes) }}</template>
          </span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="dlm-col-actions dlm-task-actions">
        <!-- 暂停：等待/下载中可点，其余置灰（常驻显示） -->
        <Button
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="暂停"
          :disabled="!['pending', 'running'].includes(task.status)"
          @click="downloadStore.pause(task.id)"
        >
          <Icon :icon="iconPause" width="16" height="16" />
        </Button>
        <!-- 继续：已暂停可点，其余置灰（常驻显示） -->
        <Button
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="继续"
          :disabled="task.status !== 'paused'"
          @click="downloadStore.resume(task.id)"
        >
          <Icon :icon="iconPlay" width="16" height="16" />
        </Button>
        <!-- 失败：重试 -->
        <Button
          v-if="task.status === 'error'"
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="重试"
          @click="downloadStore.retry(task.id)"
        >
          <Icon :icon="iconRotateCcw" width="16" height="16" />
        </Button>
        <!-- 已完成：打开 -->
        <Button
          v-if="task.status === 'completed'"
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="打开"
          @click="downloadStore.openFile(task.id)"
        >
          <Icon :icon="iconPlay" width="16" height="16" />
        </Button>
        <!-- 已完成：定位 -->
        <Button
          v-if="task.status === 'completed'"
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="在文件夹中显示"
          @click="downloadStore.openFolder(task.id)"
        >
          <Icon :icon="iconFolderOpen" width="16" height="16" />
        </Button>
        <!-- 等待 / 运行 / 暂停：取消 -->
        <Button
          v-if="['pending', 'running', 'paused'].includes(task.status)"
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="取消"
          @click="downloadStore.cancel(task.id)"
        >
          <Icon :icon="iconX" width="16" height="16" />
        </Button>
        <!-- 失败 / 已取消 / 已完成：删除 -->
        <Button
          v-if="['error', 'canceled', 'completed'].includes(task.status)"
          variant="ghost"
          size="sm"
          class="task-icon-btn"
          tooltip="移除记录"
          @click="downloadStore.remove(task.id)"
        >
          <Icon :icon="iconTrash" width="16" height="16" />
        </Button>
        <!-- 已完成标记 -->
        <Icon
          v-if="task.status === 'completed'"
          :icon="iconCheck"
          width="16"
          height="16"
          class="text-green-500 shrink-0"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

/* === 空状态 === */
.dlm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 0 80px;
  text-align: center;
}

.dlm-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: rgba(17, 24, 39, 0.06);
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.dark .dlm-empty-icon {
  background: rgba(255, 255, 255, 0.08);
}

.dlm-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-main);
}

.dlm-empty-sub {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* === 任务表格 === */
.dlm-table {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 列头（对齐云盘页歌曲表列头样式） */
.dlm-table-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 190px 224px;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-main);
  border-bottom: 1px solid var(--border-subtle);
}

/* 列通用样式 */
.dlm-col-song {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dlm-col-status {
  min-width: 0;
  display: flex;
  align-items: center;
}

.dlm-col-progress {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding-right: 16px;
}

.dlm-col-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* 任务行（玻璃上的行，hover 高亮） */
.dlm-task {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 190px 224px;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 12px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.2s ease;
}

.dlm-task:hover {
  background: rgba(17, 24, 39, 0.04);
}

.dark .dlm-task:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dlm-task-song {
  min-width: 0;
}

.dlm-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(31, 38, 135, 0.16);
}

.dlm-task-titles {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dlm-task-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dlm-task-artist {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态徽标 */
.dlm-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-text-secondary);
  background: rgba(17, 24, 39, 0.06);
}

.dark .dlm-status-chip {
  background: rgba(255, 255, 255, 0.08);
}

.dlm-status-chip.is-running {
  color: var(--color-primary-text);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.dlm-status-chip.is-paused {
  color: var(--color-text-secondary);
}

.dlm-status-chip.is-done {
  color: var(--state-success);
  background: var(--state-success-bg-soft);
}

.dlm-status-chip.is-error {
  color: var(--state-danger);
  background: var(--state-danger-bg-soft, rgba(239, 68, 68, 0.1));
}

/* 下载中呼吸点 */
.dlm-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: dlm-pulse 1.1s ease-in-out infinite;
}

@keyframes dlm-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.8);
  }
}

/* 进度条轨道 */
.dlm-progress {
  height: 4px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.08);
  overflow: hidden;
}

.dark .dlm-progress {
  background: rgba(255, 255, 255, 0.1);
}

/* 进度条填充 */
.dlm-progress-bar {
  height: 100%;
  border-radius: 999px;
  background: var(--text-secondary);
  transition: width 0.25s ease;
}

.dlm-progress-bar.is-running {
  background: var(--color-primary);
}

.dlm-progress-bar.is-done {
  background: #22c55e;
}

.dlm-progress-bar.is-error {
  background: #ef4444;
}

/* 进度百分比与大小 */
.dlm-task-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* 操作按钮 */
.dlm-task-actions {
  gap: 4px;
  flex-shrink: 0;
}

/* 图标操作按钮：固定尺寸 + 浅色圆底，保证肉眼可见 */
.task-icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: rgba(17, 24, 39, 0.06);
  border-radius: 10px;
}

.task-icon-btn:hover:not(:disabled) {
  color: var(--color-primary-text);
  background: rgba(17, 24, 39, 0.12);
}

.task-icon-btn:disabled {
  opacity: 0.35;
}

.dark .task-icon-btn {
  background: rgba(255, 255, 255, 0.08);
}

.dark .task-icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}
</style>
