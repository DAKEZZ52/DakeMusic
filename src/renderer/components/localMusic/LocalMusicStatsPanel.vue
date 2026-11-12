<!--
 * LyriseMusic - 本地音乐统计与管理面板
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：本地音乐页顶部一栏合并卡（与下载页 dlm-merge-card 同风格）：
 *      本地统计（文件夹数/曲目数/最近扫描）+ 曲库管理清单（重扫/移除）。
 *      组件拆分子模块，只读 store 数据，不承载列表渲染。
 -->
<script setup lang="ts">
import { iconFolderOpen, iconMusic, iconRefreshCw, iconTrash } from '@/icons';
import { useLocalMusicStore } from '@/stores/localMusic';
import Tooltip from '@/components/ui/Tooltip.vue';
import type { LocalMusicLibrary } from '../../../shared/localMusic';

defineOptions({ name: 'LocalMusicStatsPanel' });

const localStore = useLocalMusicStore();

const formatScanned = (timestamp: number): string => {
  if (!timestamp) return '暂无扫描记录';
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const handleRescan = (library: LocalMusicLibrary) => {
  void localStore.rescanLibrary(library.id);
};

const handleRemove = (library: LocalMusicLibrary) => {
  const ok = window.confirm(
    `确认移除本地音乐库「${library.name}」？仅移除曲库记录，源文件不会被删除。`,
  );
  if (ok) void localStore.removeLibrary(library.id);
};
</script>

<template>
  <div class="local-merge-card">
    <!-- 本地统计区 -->
    <section class="local-merge-section">
      <div class="text-[13px] font-semibold text-text-main">本地统计</div>
      <div class="mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5">
        <div class="stat-cell">
          <div class="stat-value">{{ localStore.folderCount }}</div>
          <div class="stat-label">音乐文件夹</div>
        </div>
        <div class="stat-cell">
          <div class="stat-value">{{ localStore.totalSongs }}</div>
          <div class="stat-label">本地歌曲</div>
        </div>
      </div>
      <div class="mt-2 text-[11px] font-medium text-text-secondary/80">
        最近扫描：{{ formatScanned(localStore.latestScannedAt) }}
      </div>
    </section>

    <div class="local-merge-divider" aria-hidden="true" />

    <!-- 曲库管理区 -->
    <section class="local-merge-section">
      <div class="text-[13px] font-semibold text-text-main">曲库管理</div>
      <ul v-if="localStore.libraries.length > 0" class="mt-2 flex flex-col gap-1">
        <li
          v-for="library in localStore.libraries"
          :key="library.id"
          class="library-row flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--control-hover-bg)]"
        >
          <div
            class="library-icon flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary-text shrink-0"
          >
            <Icon
              :icon="library.kind === 'files' ? iconMusic : iconFolderOpen"
              width="14"
              height="14"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="truncate text-[12px] font-semibold text-text-main">{{ library.name }}</div>
            <div class="text-[10px] font-medium text-text-secondary/70">
              {{ library.files.length }} 首
            </div>
          </div>
          <Tooltip content="重新扫描">
            <template #trigger>
              <button
                type="button"
                class="row-action-btn"
                aria-label="重新扫描"
                :disabled="localStore.scanningIds.includes(library.id)"
                @click.stop="handleRescan(library)"
              >
                <Icon :icon="iconRefreshCw" width="13" height="13" />
              </button>
            </template>
          </Tooltip>
          <Tooltip content="移除曲库">
            <template #trigger>
              <button
                type="button"
                class="row-action-btn"
                aria-label="移除曲库"
                @click.stop="handleRemove(library)"
              >
                <Icon :icon="iconTrash" width="13" height="13" />
              </button>
            </template>
          </Tooltip>
        </li>
      </ul>
      <div v-else class="mt-2 text-[11px] font-medium text-text-secondary/70">
        暂无曲库，点击右上角「添加文件夹」或「添加单曲」开始。
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.local-merge-card {
  @apply rounded-2xl border border-[var(--border-subtle)];
  background-color: var(--bg-info-card);
  padding: 12px 16px;
}

.local-merge-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 10px 0 10px;
}

.stat-cell {
  @apply flex flex-col;
}

.stat-value {
  @apply text-[17px] font-bold text-text-main leading-none;
}

.stat-label {
  @apply mt-0.5 text-[10px] font-medium text-text-secondary/75;
}

.row-action-btn {
  @apply flex items-center justify-center w-6 h-6 rounded-md text-text-secondary/70 transition-all hover:text-text-main hover:bg-[var(--control-hover-bg)] active:scale-90;
}

.row-action-btn:disabled {
  opacity: 0.35;
  pointer-events: none;
}
</style>
