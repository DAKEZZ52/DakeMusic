<!--
 * DakeMusic - 本地音乐页
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：本地音乐主页面（图一云盘页风格）：收缩头部（SliverHeader）+
 *      操作行（LocalMusicActionBar）+ 顶部一栏合并卡（LocalMusicStatsPanel：
 *      本地统计 + 曲库管理）+ 全宽统一歌曲表（SongListHeader + SongList，
 *      搜索/排序）。
 *      所有本地歌曲合并为一张扁平列表；播放统一进入播放器队列
 *      （store.playQueue：写入播放列表队列后以本地路径直接解码播放）。
 *      本页为编排容器，各功能区均拆分为独立组件/复用全站组件。
 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useThemeStore } from '@/stores/theme';
import { useLocalMusicStore, localFileToSong } from '@/stores/localMusic';
import { createThemedIconCoverUrl } from '@/utils/cover';
import { filterSongsByQuery, sortSongs } from '@/utils/songList';
import SliverHeader from '@/components/music/DetailPageSliverHeader.vue';
import SongList from '@/components/music/SongList.vue';
import SongListHeader from '@/components/music/SongListHeader.vue';
import PageStickyHeader from '@/components/ui/PageStickyHeader.vue';
import PageScrollContainer from '@/components/ui/PageScrollContainer.vue';
import Button from '@/components/ui/Button.vue';
import { useStickyTabsLayout } from '@/composables/useStickyTabsLayout';
import LocalMusicActionBar from '@/components/localMusic/LocalMusicActionBar.vue';
import LocalMusicStatsPanel from '@/components/localMusic/LocalMusicStatsPanel.vue';
import { iconCurrentLocation, iconDisc, iconPlay, iconSearch } from '@/icons';
import type { SortField, SortOrder } from '@/components/music/SongListHeader.vue';
import type { Song } from '@/models/song';

defineOptions({ name: 'local-music' });

const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();
const themeStore = useThemeStore();

const searchQuery = ref('');
const sortField = ref<SortField | null>(null);
const sortOrder = ref<SortOrder>(null);
const sliverHeaderRef = ref<{ currentHeight?: number } | null>(null);
const songListRef = ref<{ scrollToActive?: () => void } | null>(null);
const { tabsTop } = useStickyTabsLayout(sliverHeaderRef);

const activeSongId = computed(() => playerStore.currentTrackId ?? undefined);
const localCoverUrl = computed(() => createThemedIconCoverUrl(themeStore.sourceColor, iconDisc));

/** 默认顺序：库在列表中的顺序 + 文件顺序（合并为统一播放列表）。
 *  复用 localFileToSong 统一构造（含 name/album 字段），与播放列表快照保持一致。 */
const defaultOrderedSongs = computed(() => {
  const songs: Song[] = [];
  for (const library of localStore.libraries) {
    songs.push(...library.files.map(localFileToSong));
  }
  return songs;
});

const sortedSongs = computed(() =>
  sortSongs(defaultOrderedSongs.value, sortField.value, sortOrder.value, {
    indexSource: defaultOrderedSongs.value,
  }),
);

const displayedSongs = computed(() => filterSongsByQuery(sortedSongs.value, searchQuery.value));

const handleSort = (field: SortField) => {
  if (sortField.value === field) {
    if (sortOrder.value === 'asc') {
      sortOrder.value = 'desc';
    } else if (sortOrder.value === 'desc') {
      sortField.value = null;
      sortOrder.value = null;
    }
  } else {
    sortField.value = field;
    sortOrder.value = 'asc';
  }
};

const handleSongDoubleTapPlay = (song: Song) => {
  void localStore.playSong(song);
};

const handleLocate = () => {
  songListRef.value?.scrollToActive?.();
};

const contextMenuItems = computed(() => [
  {
    id: 'remove-local-file',
    label: '从本地音乐移除',
    danger: true,
    onSelect: (song: Song) => {
      const filePath = String(song.audioUrl ?? '');
      if (filePath) void localStore.removeFile(filePath);
    },
  },
]);

onMounted(() => {
  void localStore.init();
});
</script>

<template>
  <PageScrollContainer class="local-music-view-container">
    <div class="local-music-view bg-bg-main min-h-full">
      <SliverHeader
        ref="sliverHeaderRef"
        typeLabel="LOCAL"
        title="本地音乐"
        :coverUrl="localCoverUrl"
        :hasDetails="true"
        :expandedHeight="150"
        :collapsedHeight="56"
      >
        <template #details>
          <div class="flex flex-col gap-2">
            <div class="text-[13px] font-semibold text-text-secondary">
              浏览与管理本地音乐文件，支持文件夹导入与单曲添加，随时畅听。
            </div>
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-text-secondary/80"
            >
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconPlay" width="12" height="12" />
                <span>{{ localStore.totalSongs }}</span>
              </div>
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconDisc" width="12" height="12" />
                <span>{{ localStore.folderCount }} 个文件夹</span>
              </div>
            </div>
          </div>
        </template>

        <template #actions>
          <div class="mt-4">
            <LocalMusicActionBar />
          </div>
        </template>

        <template #collapsed-actions>
          <Button
            variant="unstyled"
            size="none"
            @click="localStore.playAll()"
            class="p-2 rounded-lg hover:bg-[var(--control-hover-bg)] text-primary-text"
          >
            <Icon :icon="iconPlay" width="20" height="20" />
          </Button>
        </template>
      </SliverHeader>

      <div class="px-6 pt-6 pb-1">
        <!-- 顶部一栏：本地统计 + 曲库管理合并卡 -->
        <LocalMusicStatsPanel />

        <!-- 全宽统一歌曲表 -->
        <div class="mt-6">
          <PageStickyHeader
            class="song-list-sticky sticky z-110 bg-bg-main"
            :style="{ top: `${tabsTop}px` }"
          >
            <div class="flex items-center justify-between h-14">
              <div class="flex items-center gap-2 text-[14px] font-semibold text-text-main">
                <span>歌曲</span>
                <span class="text-[11px] font-medium text-text-secondary/70">
                  {{ localStore.totalSongs }} 首
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="relative">
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="搜索歌曲..."
                    class="song-search-input w-52 h-9 pl-8 pr-3 rounded-lg text-text-main placeholder:text-text-main/50 outline-none text-[12px] transition-all"
                  />
                  <Icon
                    class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-main/60"
                    :icon="iconSearch"
                    width="14"
                    height="14"
                  />
                </div>
                <Button
                  variant="unstyled"
                  size="none"
                  @click="handleLocate"
                  class="song-locate-btn p-2 rounded-lg"
                  tooltip="定位当前播放"
                >
                  <Icon :icon="iconCurrentLocation" width="16" height="16" />
                </Button>
              </div>
            </div>

            <SongListHeader
              :sortField="sortField"
              :sortOrder="sortOrder"
              :showCover="true"
              paddingClass=""
              @sort="handleSort"
            />
          </PageStickyHeader>

          <div class="pb-12">
            <div
              v-if="!localStore.loaded && localStore.libraries.length === 0"
              class="flex flex-col items-center justify-center py-24 text-center"
            >
              <div class="text-[13px] font-semibold text-text-secondary/70">
                正在读取本地曲库...
              </div>
            </div>
            <div
              v-else-if="localStore.libraries.length === 0"
              class="local-empty flex flex-col items-center justify-center py-24 text-center"
            >
              <div
                class="w-16 h-16 rounded-[18px] bg-primary/10 text-primary-text flex items-center justify-center mb-4"
              >
                <Icon :icon="iconDisc" width="28" height="28" />
              </div>
              <div class="text-[18px] font-semibold text-text-main">本地暂无歌曲</div>
              <div class="mt-2 text-[13px] font-medium text-text-secondary/75">
                添加本地文件夹或单曲后会展示在这里
              </div>
            </div>
            <div
              v-else-if="localStore.totalSongs === 0"
              class="local-empty flex flex-col items-center justify-center py-24 text-center"
            >
              <div
                class="w-16 h-16 rounded-[18px] bg-primary/10 text-primary-text flex items-center justify-center mb-4"
              >
                <Icon :icon="iconDisc" width="28" height="28" />
              </div>
              <div class="text-[18px] font-semibold text-text-main">曲库中暂无歌曲</div>
              <div class="mt-2 text-[13px] font-medium text-text-secondary/75">
                当前曲库文件夹中没有可播放的音频文件
              </div>
            </div>
            <SongList
              v-else
              ref="songListRef"
              :loading="localStore.scanningIds.length > 0"
              :songs="displayedSongs"
              :contextSongs="defaultOrderedSongs"
              :searchQuery="searchQuery"
              :disableInternalFilter="true"
              :activeId="activeSongId"
              :showCover="true"
              :contextMenuItems="contextMenuItems"
              :onSongDoubleTapPlay="handleSongDoubleTapPlay"
            />
          </div>
        </div>
      </div>
    </div>
  </PageScrollContainer>
</template>

<style scoped>
@reference "@/style.css";

.song-search-input {
  border: 1px solid var(--border-subtle);
  background-color: var(--bg-info-card);
}

.song-search-input:focus {
  border-color: var(--color-primary);
  background-color: var(--bg-card);
}
</style>
