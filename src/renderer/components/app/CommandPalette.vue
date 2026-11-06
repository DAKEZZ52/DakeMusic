<script setup lang="ts">
/**
 * 命令面板
 * 交互参考 Folia（AGPL-3.0）的命令面板思路，实现独立。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { IconifyIcon } from '@iconify/types';
import { usePlayerStore } from '@/stores/player';
import {
  closePalette,
  paletteOpen,
  paletteQuery,
  resetPalette,
  togglePalette,
} from '@/composables/useCommandPalette';
import {
  iconCloudDownload,
  iconCompass,
  iconHeart,
  iconHome,
  iconFolderOpen,
  iconCloud,
  iconPause,
  iconPlaylistAdd,
  iconTrophy,
  iconRepeat,
  iconSearch,
  iconSettings,
  iconScissors,
  iconSkipBack,
  iconSkipForward,
  iconClock,
  iconUsers,
  iconShoppingBag,
  iconVolumeX,
} from '@/icons';

interface Command {
  id: string;
  title: string;
  group: '播放' | '前往' | '搜索';
  icon: IconifyIcon;
  keywords?: string;
  run: () => void | Promise<void>;
}

const router = useRouter();
const player = usePlayerStore();

const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

const go = (path: string) => () => {
  void router.push(path);
  closePalette();
};

const baseCommands: Command[] = [
  {
    id: 'play-pause',
    title: '播放 / 暂停',
    group: '播放',
    icon: iconPause,
    keywords: 'play pause 空格',
    run: () => player.togglePlay(),
  },
  {
    id: 'next',
    title: '下一首',
    group: '播放',
    icon: iconSkipForward,
    keywords: 'next 切歌',
    run: () => player.next(),
  },
  {
    id: 'prev',
    title: '上一首',
    group: '播放',
    icon: iconSkipBack,
    keywords: 'prev previous 后退',
    run: () => player.prev(),
  },
  {
    id: 'mute',
    title: '切换静音',
    group: '播放',
    icon: iconVolumeX,
    keywords: 'mute 音量',
    run: () => player.toggleMute(),
  },
  {
    id: 'go-home',
    title: '首页 · 为你推荐',
    group: '前往',
    icon: iconHome,
    keywords: 'home 推荐',
    run: go('/main'),
  },
  {
    id: 'go-search',
    title: '搜索',
    group: '前往',
    icon: iconSearch,
    keywords: 'search 找歌',
    run: go('/main/search'),
  },
  {
    id: 'go-explore',
    title: '探索发现',
    group: '前往',
    icon: iconCompass,
    keywords: 'explore 发现',
    run: go('/main/explore'),
  },
  {
    id: 'go-ranking',
    title: '排行榜',
    group: '前往',
    icon: iconTrophy,
    keywords: 'ranking 榜单',
    run: go('/main/ranking'),
  },
  {
    id: 'go-fm',
    title: '私人 FM',
    group: '前往',
    icon: iconRepeat,
    keywords: 'fm 电台',
    run: go('/main/personal-fm'),
  },
  {
    id: 'go-favorites',
    title: '我最喜爱',
    group: '前往',
    icon: iconHeart,
    keywords: 'favorite 收藏 喜欢',
    run: go('/main/favorites'),
  },
  {
    id: 'go-history',
    title: '播放历史',
    group: '前往',
    icon: iconClock,
    keywords: 'history 历史',
    run: go('/main/history'),
  },
  {
    id: 'go-cloud',
    title: '音乐云盘',
    group: '前往',
    icon: iconCloud,
    keywords: 'cloud 云盘',
    run: go('/main/cloud'),
  },
  {
    id: 'go-download',
    title: '下载管理',
    group: '前往',
    icon: iconCloudDownload,
    keywords: 'download 下载',
    run: go('/main/download'),
  },
  {
    id: 'go-local',
    title: '本地音乐',
    group: '前往',
    icon: iconFolderOpen,
    keywords: 'local 本地',
    run: go('/main/local'),
  },
  {
    id: 'go-separator',
    title: '人声分离',
    group: '前往',
    icon: iconScissors,
    keywords: 'separator 分离 伴奏',
    run: go('/main/separator'),
  },
  {
    id: 'go-purchased',
    title: '已购音乐',
    group: '前往',
    icon: iconShoppingBag,
    keywords: 'purchased 购买',
    run: go('/main/purchased'),
  },
  {
    id: 'go-chatroom',
    title: '语聊房',
    group: '前往',
    icon: iconUsers,
    keywords: 'chatroom 房间 语音',
    run: go('/main/chatroom'),
  },
  {
    id: 'go-settings',
    title: '设置',
    group: '前往',
    icon: iconSettings,
    keywords: 'settings 偏好',
    run: go('/main/settings'),
  },
];

const searchCommand = computed<Command | null>(() => {
  const keyword = paletteQuery.value.trim();
  if (!keyword) return null;
  return {
    id: 'search-keyword',
    title: `搜索「${keyword}」`,
    group: '搜索',
    icon: iconPlaylistAdd,
    run: () => {
      void router.push({ path: '/main/search', query: { q: keyword } });
      closePalette();
    },
  };
});

const matches = (command: Command, keyword: string) => {
  if (!keyword) return true;
  const haystack = `${command.title} ${command.keywords ?? ''}`.toLowerCase();
  return haystack.includes(keyword);
};

const filtered = computed<Command[]>(() => {
  const keyword = paletteQuery.value.trim().toLowerCase();
  const hits = baseCommands.filter((command) => matches(command, keyword));
  const extra = searchCommand.value ? [searchCommand.value] : [];
  return [...extra, ...hits];
});

const groups = computed(() => {
  const order: Array<Command['group']> = ['搜索', '播放', '前往'];
  return order
    .map((group) => ({ group, items: filtered.value.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
});

const flatCommands = computed(() => groups.value.flatMap((entry) => entry.items));

const activeCommand = computed<Command | null>(() => flatCommands.value[activeIndex.value] ?? null);

watch(paletteQuery, () => {
  activeIndex.value = 0;
  void nextTick(() => scrollActiveIntoView());
});

watch(paletteOpen, (open) => {
  if (!open) return;
  activeIndex.value = 0;
  void nextTick(() => inputRef.value?.focus());
});

const scrollActiveIntoView = () => {
  const el = listRef.value?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`);
  el?.scrollIntoView({ block: 'nearest' });
};

const move = (delta: number) => {
  const total = flatCommands.value.length;
  if (!total) return;
  activeIndex.value = (activeIndex.value + delta + total) % total;
  scrollActiveIntoView();
};

const runActive = () => {
  const command = activeCommand.value;
  if (!command) return;
  closePalette();
  void command.run();
};

const onKeydown = (event: KeyboardEvent) => {
  if (!paletteOpen.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    runActive();
  }
};

const onGlobalKeydown = (event: KeyboardEvent) => {
  const withModifier = event.metaKey || event.ctrlKey;
  if (withModifier && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    togglePalette();
  }
};

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  resetPalette();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="palette-fade">
      <div
        v-if="paletteOpen"
        class="palette-overlay"
        role="presentation"
        @pointerdown.self="closePalette"
      >
        <div
          class="palette"
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          @keydown="onKeydown"
        >
          <div class="palette-input-row">
            <Icon :icon="iconSearch" width="18" height="18" class="palette-input-icon" />
            <input
              ref="inputRef"
              v-model="paletteQuery"
              class="palette-input"
              type="text"
              placeholder="搜索歌曲，或输入动作名称…"
              aria-label="搜索命令"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="palette-kbd">Esc</kbd>
          </div>

          <div ref="listRef" class="palette-list" role="listbox" aria-label="命令列表">
            <template v-for="entry in groups" :key="entry.group">
              <div class="palette-group">{{ entry.group }}</div>
              <button
                v-for="command in entry.items"
                :key="command.id"
                type="button"
                role="option"
                :aria-selected="activeCommand?.id === command.id"
                :data-index="flatCommands.findIndex((item) => item.id === command.id)"
                class="palette-item"
                :class="{ active: activeCommand?.id === command.id }"
                @pointerenter="
                  activeIndex = flatCommands.findIndex((item) => item.id === command.id)
                "
                @click="
                  closePalette();
                  void command.run();
                "
              >
                <Icon :icon="command.icon" width="17" height="17" class="palette-item-icon" />
                <span class="palette-item-title">{{ command.title }}</span>
              </button>
            </template>

            <div v-if="!flatCommands.length" class="palette-empty">没有匹配的命令</div>
          </div>

          <div class="palette-foot">
            <span><kbd class="palette-kbd">↑</kbd> <kbd class="palette-kbd">↓</kbd> 选择</span>
            <span><kbd class="palette-kbd">↵</kbd> 执行</span>
            <span class="palette-hint">Ctrl / ⌘ + K 打开</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: color-mix(in srgb, #000000 42%, transparent);
  backdrop-filter: blur(var(--surface-blur-sm));
  -webkit-backdrop-filter: blur(var(--surface-blur-sm));
}

.palette {
  width: 100%;
  max-width: 560px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid color-mix(in srgb, var(--text-main) 12%, transparent);
  box-shadow: var(--shadow-dialog);
  color: var(--text-main);
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--text-main) 8%, transparent);
}

.palette-input-icon {
  flex-shrink: 0;
  opacity: 0.5;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 15px;
  line-height: 22px;
}

.palette-input::placeholder {
  color: var(--text-main);
  opacity: 0.4;
}

.palette-kbd {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-main);
  opacity: 0.55;
  background: color-mix(in srgb, var(--text-main) 10%, transparent);
}

.palette-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.palette-group {
  padding: 8px 10px 4px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-main);
  opacity: 0.45;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
}

.palette-item.active {
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
}

.palette-item-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.palette-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.palette-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-main);
  opacity: 0.45;
}

.palette-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 14px;
  border-top: 1px solid color-mix(in srgb, var(--text-main) 8%, transparent);
  font-size: 11px;
  line-height: 16px;
  color: var(--text-main);
  opacity: 0.55;
}

.palette-hint {
  margin-left: auto;
}

.palette-fade-enter-active,
.palette-fade-leave-active {
  transition: opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.palette-fade-enter-from,
.palette-fade-leave-to {
  opacity: 0;
}
</style>
