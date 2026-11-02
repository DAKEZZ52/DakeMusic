<!--
  DakeMusic 下载管理视图（页面壳，云盘页风格）
  作者：知之（DAKE知之）
  文件：Download.vue
  描述：收缩头部（SliverHeader）+ 顶部操作行（DownloadActionBar）+
       左侧下载统计（DownloadStatsPanel）+ 任务表格（DownloadTaskList，含列头）+
       下载设置分区卡（DownloadSettingsPanel）。本页为编排容器，各功能区均为独立组件。
  版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
-->
<script setup lang="ts">
defineOptions({ name: 'download' });
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import PageScrollContainer from '@/components/ui/PageScrollContainer.vue';
import SliverHeader from '@/components/music/DetailPageSliverHeader.vue';
import Button from '@/components/ui/Button.vue';
import DownloadActionBar from '@/components/download/DownloadActionBar.vue';
import DownloadStatsPanel from '@/components/download/DownloadStatsPanel.vue';
import DownloadTaskList from '@/components/download/DownloadTaskList.vue';
import DownloadSettingsPanel from '@/components/download/DownloadSettingsPanel.vue';
import { useDownloadStore } from '@/stores/download';
import { usePlayerStore } from '@/stores/player';
import { useThemeStore } from '@/stores/theme';
import { createThemedIconCoverUrl } from '@/utils/cover';
import {
  extractDominantColor,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  DEFAULT_ACCENT,
} from '@/utils/color';
import { iconCloudDownload, iconCheck, iconTrash } from '@/icons';

const downloadStore = useDownloadStore();
const playerStore = usePlayerStore();
const themeStore = useThemeStore();

/** 深色模式开关（html.dark），背景衍生色随明暗重算。 */
const isDark = ref(document.documentElement.classList.contains('dark'));
let darkObserver: MutationObserver | null = null;

/** 当前主题色：跟随正在播放歌曲的封面主色；无歌曲时回退苹果蓝。 */
const themeColor = ref<string>(DEFAULT_ACCENT);
let themeColorAbort: AbortController | null = null;

async function refreshThemeColor(coverUrl: string | undefined) {
  themeColorAbort?.abort();
  const controller = new AbortController();
  themeColorAbort = controller;
  if (!coverUrl) {
    themeColor.value = DEFAULT_ACCENT;
    return;
  }
  const color = await extractDominantColor(coverUrl, { signal: controller.signal });
  if (!controller.signal.aborted) {
    themeColor.value = color ?? DEFAULT_ACCENT;
  }
}

/** 依据主色计算下载页背景变量：近白/近黑底色轻微染色 + 主色光晕（跟随歌曲主题）。 */
const dlmThemeVars = computed<Record<string, string>>(() => {
  const rgb = hexToRgb(themeColor.value);
  if (!rgb) return {} as Record<string, string>;
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const dark = isDark.value;
  const clamp01v = (v: number) => Math.min(1, Math.max(0, v));
  const hue = (deg: number) => (((h + deg) % 360) + 360) % 360;
  const hexAt = (hh: number, ss: number, ll: number) => {
    const c = hslToRgb(hh, clamp01v(ss), clamp01v(ll));
    return rgbToHex(c.r, c.g, c.b);
  };
  const rgbaAt = (hh: number, ss: number, ll: number, alpha: number) => {
    const c = hslToRgb(hh, clamp01v(ss), clamp01v(ll));
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };

  // 页面背景：以主色轻微染色（浅色近白、深色近黑），光斑用主色柔化
  const bgSat = 0.42;
  const bgFrom = dark ? hexAt(h, bgSat, 0.07) : hexAt(h, bgSat * 0.72, 0.97);
  const bgTo = dark ? hexAt(h, bgSat * 0.8, 0.105) : hexAt(h, bgSat * 0.5, 0.925);
  const glowA = rgbaAt(h, Math.min(0.72, s + 0.06), dark ? 0.5 : 0.62, dark ? 0.22 : 0.16);
  const glowB = rgbaAt(hue(36), Math.min(0.6, s), dark ? 0.4 : 0.55, dark ? 0.13 : 0.1);

  return {
    '--dlm-bg-from': bgFrom,
    '--dlm-bg-to': bgTo,
    '--dlm-glow-a': glowA,
    '--dlm-glow-b': glowB,
  };
});

onMounted(() => {
  void downloadStore.init();

  // 跟随当前歌曲封面：封面变化时重新取色
  watch(
    () => playerStore.currentTrackSnapshot?.coverUrl,
    (url) => {
      void refreshThemeColor(url);
    },
    { immediate: true },
  );
  // 监听 html 的 dark 类变化，深色模式切换时重算衍生色
  darkObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark');
  });
  darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onUnmounted(() => {
  themeColorAbort?.abort();
  darkObserver?.disconnect();
});

/** 任务列表（store 已按时间倒序）。 */
const tasks = computed(() => downloadStore.tasks);

/** 头部封面：主题色云下载图标。 */
const downloadCoverUrl = computed(() =>
  createThemedIconCoverUrl(themeStore.sourceColor, iconCloudDownload),
);

/** 已完成任务数（用于收缩头统计）。 */
const doneCount = computed(
  () => downloadStore.tasks.filter((t) => t.status === 'completed').length,
);
</script>

<template>
  <PageScrollContainer class="download-view-container">
    <div class="download-view bg-bg-main min-h-full" :style="dlmThemeVars">
      <SliverHeader
        typeLabel="DOWNLOAD"
        title="下载管理"
        :coverUrl="downloadCoverUrl"
        :hasDetails="true"
        :expandedHeight="150"
        :collapsedHeight="56"
      >
        <template #details>
          <div class="flex flex-col gap-2">
            <div class="text-[13px] font-semibold text-text-secondary">
              管理全部下载任务，支持暂停、继续、重试与下载目录设置，随时查看进度。
            </div>
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-text-secondary/80"
            >
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconCloudDownload" width="12" height="12" />
                <span>{{ tasks.length }} 个任务</span>
              </div>
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconCheck" width="12" height="12" />
                <span>{{ doneCount }} 已完成</span>
              </div>
            </div>
          </div>
        </template>

        <template #actions>
          <DownloadActionBar />
        </template>

        <template #collapsed-actions>
          <Button
            variant="unstyled"
            size="none"
            @click="downloadStore.clearFinished()"
            class="p-2 rounded-lg hover:bg-[var(--control-hover-bg)] text-primary-text"
            tooltip="清除已完成"
          >
            <Icon :icon="iconTrash" width="20" height="20" />
          </Button>
        </template>
      </SliverHeader>

      <div class="px-6 pt-6 pb-1">
        <!-- 统计 + 下载设置 共用一张分区卡（上统计、下设置、中间分隔线） -->
        <div class="dlm-merge-card">
          <DownloadStatsPanel />
          <div class="dlm-merge-divider" aria-hidden="true" />
          <DownloadSettingsPanel />
        </div>

        <!-- 任务表格 -->
        <div class="mt-6">
          <div class="flex items-center justify-between h-12">
            <div class="flex items-center gap-2 text-[14px] font-semibold text-text-main">
              <span>任务</span>
              <span class="text-[11px] font-medium text-text-secondary/70">
                {{ tasks.length }} 个
              </span>
            </div>
          </div>

          <DownloadTaskList :tasks="tasks" />
        </div>
      </div>
    </div>
  </PageScrollContainer>
</template>

<style scoped>
@reference "@/style.css";

/* 页面背景：跟随歌曲主题的光晕（dlmThemeVars 注入），不透明主底由 bg-bg-main 承担 */
.download-view {
  --dlm-bg-from: #f6f6f8;
  --dlm-bg-to: #ececf1;
  --dlm-glow-a: rgba(255, 255, 255, 0.8);
  --dlm-glow-b: rgba(255, 255, 255, 0.55);
  position: relative;
  background:
    radial-gradient(640px 440px at 12% 6%, var(--dlm-glow-a), transparent 62%),
    radial-gradient(740px 540px at 88% 18%, var(--dlm-glow-b), transparent 62%),
    radial-gradient(540px 440px at 58% 104%, rgba(0, 0, 0, 0.035), transparent 62%);
}

.dark .download-view {
  --dlm-bg-from: #101014;
  --dlm-bg-to: #17171d;
  --dlm-glow-a: rgba(255, 255, 255, 0.06);
  --dlm-glow-b: rgba(255, 255, 255, 0.045);
  background:
    radial-gradient(640px 440px at 12% 6%, var(--dlm-glow-a), transparent 62%),
    radial-gradient(740px 540px at 88% 18%, var(--dlm-glow-b), transparent 62%),
    radial-gradient(540px 440px at 58% 104%, rgba(0, 0, 0, 0.32), transparent 62%);
}

/* 统计 + 下载设置 合并分区卡 */
.dlm-merge-card {
  @apply rounded-2xl border border-[var(--border-subtle)];
  background-color: var(--bg-info-card);
  padding: 16px 20px;
}

.dlm-merge-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 18px 0 16px;
}
</style>
