<!--
 * LyriseMusic - 本地音乐操作栏组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：本地音乐页顶部操作行（图一云盘页风格）：播放全部 / 添加文件夹 / 添加单曲。
 *      组件拆分子模块，样式与 DetailPageActionRow 全站一致。
 -->
<script setup lang="ts">
import { computed } from 'vue';
import { iconFolderOpen, iconMusic, iconPlay, iconSearch } from '@/icons';
import { useLocalMusicStore } from '@/stores/localMusic';
import LocalMetadataMatchDialog from './LocalMetadataMatchDialog.vue';
import { ref } from 'vue';

defineOptions({ name: 'LocalMusicActionBar' });

const localStore = useLocalMusicStore();

const playDisabled = computed(() => localStore.totalSongs === 0);
const matchOpen = ref(false);

const handlePlayAll = () => {
  void localStore.playAll();
};

const handleAddFolder = () => {
  void localStore.pickAndAddLibrary();
};

const handleAddFiles = () => {
  void localStore.addFiles();
};
</script>

<template>
  <div class="action-row-wrap flex flex-wrap gap-2">
    <!-- 主操作：播放全部 -->
    <button
      type="button"
      class="action-btn primary"
      :disabled="playDisabled"
      @click="handlePlayAll"
    >
      <div class="icon-wrap">
        <Icon :icon="iconPlay" width="16" height="16" />
      </div>
      <span>播放全部</span>
    </button>

    <!-- 添加文件夹 -->
    <button type="button" class="action-btn secondary" @click="handleAddFolder">
      <div class="icon-wrap">
        <Icon :icon="iconFolderOpen" width="16" height="16" />
      </div>
      <span>添加文件夹</span>
    </button>

    <!-- 添加单曲 -->
    <button type="button" class="action-btn secondary" @click="handleAddFiles">
      <div class="icon-wrap">
        <Icon :icon="iconMusic" width="16" height="16" />
      </div>
      <span>添加单曲</span>
    </button>

    <!-- 匹配信息：给本地文件补封面/歌手/专辑 -->
    <button
      type="button"
      class="action-btn secondary"
      :disabled="playDisabled"
      @click="matchOpen = true"
    >
      <div class="icon-wrap">
        <Icon :icon="iconSearch" width="16" height="16" />
      </div>
      <span>匹配信息</span>
    </button>

    <LocalMetadataMatchDialog v-model:open="matchOpen" />
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
