<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, watch } from 'vue';
import type { Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Avatar from '@/components/ui/Avatar.vue';
import Button from '@/components/ui/Button.vue';
import Cover from '@/components/ui/Cover.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Popover from '@/components/ui/Popover.vue';
import Scrollbar from '@/components/ui/Scrollbar.vue';
import Switch from '@/components/ui/Switch.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import ImportPlaylistDialog from '@/components/music/ImportPlaylistDialog.vue';
import PlaylistOrderDialog from '@/components/music/PlaylistOrderDialog.vue';
import SidebarUserCard from './components/SidebarUserCard.vue';
import SidebarPlaylistHeader from './components/SidebarPlaylistHeader.vue';
import type { PlaylistOrderTarget } from '@/services/playlistOrdering';
import {
  iconClock,
  iconCloud,
  iconCloudDownload,
  iconScissors,
  iconCompass,
  iconDisc,
  iconHeart,
  iconMessageCircle,
  iconPlaylistAdd,
  iconPulse,
  iconSearch,
  iconSettings,
  iconShoppingBag,
  iconSparkles,
  iconTrash,
  iconChevronDown,
  iconDotsVertical,
} from '@/icons';
import type { PlaylistMeta } from '@/models/playlist';
import { usePlaylistStore } from '@/stores/playlist';
import { orderByPlaylistPosition } from '@/utils/playlistOrder';
import { useUserStore } from '@/stores/user';
import { usePlaylistCoversStore } from '@/stores/playlistCovers';
import { useToastStore } from '@/stores/toast';
import { useSettingStore } from '@/stores/setting';
import { useImportTaskStore } from '@/stores/importTask';

defineOptions({
  inheritAttrs: false,
});

defineProps<{
  collapsed?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const attrs = useAttrs();
const userStore = useUserStore();
const playlistStore = usePlaylistStore();
const playlistCoversStore = usePlaylistCoversStore();
void playlistCoversStore.hydrate();
const toastStore = useToastStore();
const settingStore = useSettingStore();
const importTaskStore = useImportTaskStore();

const isMac = computed(() => window.electron.platform === 'darwin');
const isLoggedIn = computed(() => userStore.isLoggedIn);
const userInfo = computed(() => userStore.info);

// ---- 歌单操作状态 ----
const activePlaylistTab = ref(0);
const showCreateDialog = ref(false);
const showRemoveDialog = ref(false);
const showImportDialog = ref(false);
const showCreateMenu = ref(false);
const showPlaylistActions = ref(false);
const isCreatingPlaylist = ref(false);
const isRemovingPlaylist = ref(false);
const newPlaylistName = ref('');
const newPlaylistIsPrivate = ref(false);
const pendingRemovePlaylist = ref<PlaylistMeta | null>(null);

const likedPlaylistId = computed(() => String(playlistStore.likedPlaylistQueryId ?? ''));
const currentUserId = computed(() =>
  String(userInfo.value?.userid ?? userInfo.value?.userId ?? ''),
);
const currentUserIdNumber = computed<number | undefined>(() => {
  const value = userInfo.value?.userid ?? userInfo.value?.userId;
  return typeof value === 'number' && value > 0 ? value : undefined;
});

// iconMap 改为 computed，避免模板每次重新创建
const iconMap = computed(() => ({
  sparkles: iconSparkles,
  pulse: iconPulse,
  compass: iconCompass,
  search: iconSearch,
  clock: iconClock,
  cloud: iconCloud,
  download: iconCloudDownload,
  scissors: iconScissors,
  heart: iconHeart,
  'shopping-bag': iconShoppingBag,
  'message-circle': iconMessageCircle,
  disc: iconDisc,
})) as unknown as {
  readonly sparkles: typeof iconSparkles;
  readonly pulse: typeof iconPulse;
  readonly compass: typeof iconCompass;
  readonly search: typeof iconSearch;
  readonly clock: typeof iconClock;
  readonly cloud: typeof iconCloud;
  readonly download: typeof iconCloudDownload;
  readonly scissors: typeof iconScissors;
  readonly heart: typeof iconHeart;
  readonly 'shopping-bag': typeof iconShoppingBag;
  readonly 'message-circle': typeof iconMessageCircle;
  readonly disc: typeof iconDisc;
};

type BuiltinSidebarIcon = keyof typeof iconMap;

interface SidebarMenuItem {
  id: string;
  key: string;
  title: string;
  order: number;
  path?: string;
  pluginId?: string;
  pageId?: string;
  builtinIcon?: BuiltinSidebarIcon;
  pluginIcon?: string | Record<string, unknown>;
  before?: string;
  after?: string;
  disabled?: boolean | (() => boolean);
  visible?: boolean | (() => boolean);
  component?: Component;
  railComponent?: Component;
  onClick?: () => void | Promise<void>;
}

interface SidebarSection {
  id: string;
  title: string;
  order: number;
  collapsible: boolean;
  items: SidebarMenuItem[];
}

const builtinSidebarSections = [
  {
    id: 'discover',
    title: '发现音乐',
    order: 100,
    collapsible: true,
    items: [
      {
        id: 'home',
        key: 'home',
        title: '为您推荐',
        path: '/main/home',
        builtinIcon: 'sparkles' as const,
        order: 10,
      },
      {
        id: 'explore',
        key: 'explore',
        title: '探索发现',
        path: '/main/explore',
        builtinIcon: 'compass' as const,
        order: 20,
      },
    ],
  },
  {
    id: 'features',
    title: '功能',
    order: 150,
    collapsible: true,
    items: [
      {
        id: 'chatroom',
        key: 'chatroom',
        title: 'Chat Room',
        path: '/main/chatroom',
        builtinIcon: 'message-circle' as const,
        order: 10,
      },
      {
        id: 'download',
        key: 'download',
        title: '下载管理',
        path: '/main/download',
        builtinIcon: 'download' as const,
        order: 20,
      },
      {
        id: 'separator',
        key: 'separator',
        title: '人声分离',
        path: '/main/separator',
        builtinIcon: 'scissors' as const,
        order: 30,
      },
    ],
  },
  {
    id: 'library',
    title: '我的乐库',
    order: 200,
    collapsible: true,
    items: [
      {
        id: 'favorites',
        key: 'favorites',
        title: '我最喜爱',
        path: '/main/favorites',
        builtinIcon: 'heart' as const,
        order: 10,
      },
      {
        id: 'personal-fm',
        key: 'personal-fm',
        title: '私人 FM',
        path: '/main/personal-fm',
        builtinIcon: 'pulse' as const,
        order: 20,
      },
      {
        id: 'cloud',
        key: 'cloud',
        title: '音乐云盘',
        path: '/main/cloud',
        builtinIcon: 'cloud' as const,
        order: 30,
      },
      {
        id: 'history',
        key: 'history',
        title: '播放历史',
        path: '/main/history',
        builtinIcon: 'clock' as const,
        order: 40,
      },
      {
        id: 'purchased',
        key: 'purchased',
        title: '已购音乐',
        path: '/main/purchased',
        builtinIcon: 'shopping-bag' as const,
        order: 50,
      },
      {
        id: 'local',
        key: 'local',
        title: '本地音乐',
        path: '/main/local',
        builtinIcon: 'disc' as const,
        order: 60,
      },
    ],
  },
] satisfies SidebarSection[];

const sortMenuItems = (items: SidebarMenuItem[]) => {
  const sorted = items
    .slice()
    .sort(
      (left, right) =>
        left.order - right.order || left.title.localeCompare(right.title, 'zh-Hans-CN'),
    );

  const matchesAnchor = (item: SidebarMenuItem, anchor: string) => {
    return item.id === anchor || item.key === anchor || item.path === anchor;
  };

  const moveAroundAnchor = (
    list: SidebarMenuItem[],
    item: SidebarMenuItem,
    anchor: string,
    placement: 'before' | 'after',
  ) => {
    const from = list.findIndex((candidate) => candidate.key === item.key);
    const to = list.findIndex((candidate) => matchesAnchor(candidate, anchor));
    if (from < 0 || to < 0 || from === to) return;
    const [moving] = list.splice(from, 1);
    const nextTo = list.findIndex((candidate) => matchesAnchor(candidate, anchor));
    if (nextTo < 0) {
      list.splice(from, 0, moving);
      return;
    }
    list.splice(placement === 'before' ? nextTo : nextTo + 1, 0, moving);
  };

  for (const item of sorted.slice()) {
    if (item.before) moveAroundAnchor(sorted, item, item.before, 'before');
    if (item.after) moveAroundAnchor(sorted, item, item.after, 'after');
  }

  return sorted;
};

const resolveFlag = (value?: boolean | (() => boolean), fallback = false) => {
  if (typeof value === 'function') {
    try {
      return Boolean(value());
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
};

const allMenuGroups = computed(() => {
  const sections = new Map<string, SidebarSection>();
  for (const section of builtinSidebarSections) {
    sections.set(section.id, { ...section, items: [...section.items] });
  }

  return Array.from(sections.values())
    .map((section) => ({
      ...section,
      items: sortMenuItems(section.items).filter((item) => resolveFlag(item.visible, true)),
    }))
    .filter((section) => section.items.length > 0)
    .sort(
      (left, right) =>
        left.order - right.order || left.title.localeCompare(right.title, 'zh-Hans-CN'),
    );
});

const isSectionCollapsed = (section: SidebarSection) =>
  section.collapsible && (settingStore.sidebarSectionCollapsed[section.id] ?? false);

const visibleRailMenuGroups = computed(() =>
  allMenuGroups.value.filter((group) => !isSectionCollapsed(group)),
);

const toggleSection = (section: SidebarSection) => {
  if (!section.collapsible) return;
  settingStore.sidebarSectionCollapsed = {
    ...settingStore.sidebarSectionCollapsed,
    [section.id]: !isSectionCollapsed(section),
  };
};

// ---- 歌单排序 ----
const showPlaylistOrder = ref(false);
const playlistOrderTarget = ref<PlaylistOrderTarget>({ kind: 'playlists', type: 0, fixedIds: [] });

const openPlaylistOrder = () => {
  showPlaylistActions.value = false;
  playlistOrderTarget.value = {
    kind: 'playlists',
    type: activePlaylistTab.value === 0 ? 0 : 1,
    fixedIds: createdPlaylists.value.pinned.map((p) => String(p.listid ?? p.id)),
  };
  showPlaylistOrder.value = true;
};

// ---- 歌单身份识别 ----
const isValidIdentity = (value: unknown): value is string | number =>
  value !== undefined && value !== null && String(value) !== '';

const getPlaylistIdentityList = (playlist: PlaylistMeta): string[] => {
  return [
    playlist.id,
    playlist.listid,
    playlist.listCreateGid,
    playlist.globalCollectionId,
    playlist.listCreateListid,
  ]
    .filter(isValidIdentity)
    .map((value) => String(value));
};

const isLikedPlaylist = (playlist: PlaylistMeta): boolean => {
  const likedId = likedPlaylistId.value;
  if (!likedId) return false;
  return getPlaylistIdentityList(playlist).includes(likedId);
};

const isOwnerPlaylist = (playlist: PlaylistMeta): boolean => {
  const ownerId = String(playlist.listCreateUserid ?? '');
  const userId = currentUserId.value;
  return ownerId !== '' && userId !== '' && ownerId === userId;
};

const isDefaultPlaylist = (playlist: PlaylistMeta): boolean => {
  return playlist.source !== 2 && playlist.type === 0 && playlist.isDefault === true;
};

const canRemovePlaylist = (playlist: PlaylistMeta): boolean => !isDefaultPlaylist(playlist);

// ---- 歌单列表 ----
const createdPlaylists = computed(() => {
  const all = playlistStore.userPlaylists.filter(
    (playlist) => playlist.source !== 2 && isOwnerPlaylist(playlist),
  );
  const pinned: PlaylistMeta[] = [];
  const normal: PlaylistMeta[] = [];
  for (const playlist of all) {
    if (isDefaultPlaylist(playlist) || isLikedPlaylist(playlist)) {
      pinned.push(playlist);
    } else {
      normal.push(playlist);
    }
  }
  const sorted = orderByPlaylistPosition(normal, (playlist) => playlist.sortOrder);
  return { pinned, normal: sorted };
});

const favoritedPlaylists = computed(() => {
  const all = playlistStore.userPlaylists.filter(
    (playlist) => playlist.source !== 2 && !isLikedPlaylist(playlist) && !isOwnerPlaylist(playlist),
  );
  return orderByPlaylistPosition(all, (playlist) => playlist.sortOrder);
});

const visibleRailPlaylists = computed(() =>
  activePlaylistTab.value === 0
    ? [...createdPlaylists.value.pinned, ...createdPlaylists.value.normal]
    : favoritedPlaylists.value,
);

const activePlaylistRouteId = computed(() => {
  return route.name === 'playlist-detail' ? String(route.params.id ?? '') : '';
});

const activeAlbumRouteId = computed(() => {
  return route.name === 'album-detail' ? String(route.params.id ?? '') : '';
});

const navigateTo = (path: string) => {
  router.push(path);
};

const getPlaylistRouteId = (playlist: PlaylistMeta): string => {
  if (playlist.source === 2) {
    return String(playlist.listCreateListid ?? playlist.id);
  }
  if (isOwnerPlaylist(playlist)) {
    return String(playlist.globalCollectionId ?? playlist.id);
  }
  return String(playlist.listCreateGid ?? playlist.globalCollectionId ?? playlist.id);
};

const findPlaylistByRouteId = (routeId: string, source?: number): PlaylistMeta | undefined => {
  if (!routeId) return undefined;
  return playlistStore.userPlaylists.find((playlist) => {
    if (source !== undefined && playlist.source !== source) return false;
    return getPlaylistRouteId(playlist) === routeId;
  });
};

const isActivePlaylist = (playlist: PlaylistMeta): boolean => {
  if (playlist.source === 2) return false;
  return getPlaylistRouteId(playlist) === activePlaylistRouteId.value;
};

const navigateToPlaylist = (playlist: PlaylistMeta) => {
  if (playlist.source === 2) {
    const id = getPlaylistRouteId(playlist);
    if (route.name === 'album-detail' && activeAlbumRouteId.value === id) return;
    router.push({ name: 'album-detail', params: { id } });
    return;
  }

  const id = getPlaylistRouteId(playlist);
  if (route.name === 'playlist-detail' && activePlaylistRouteId.value === id) return;
  router.push({
    name: 'playlist-detail',
    params: { id },
    query: { type: isOwnerPlaylist(playlist) ? 'user' : 'special' },
  });
};

const refreshUserPlaylists = async () => {
  if (!isLoggedIn.value) return;
  try {
    await playlistStore.fetchUserPlaylists();
  } catch {
    toastStore.loadFailed('歌单');
  }
};

// ---- 创建歌单 ----
const openCreatePlaylistDialog = () => {
  if (!isLoggedIn.value || activePlaylistTab.value !== 0) return;
  newPlaylistName.value = '';
  newPlaylistIsPrivate.value = false;
  showCreateDialog.value = true;
};

const closeCreatePlaylistDialog = () => {
  if (isCreatingPlaylist.value) return;
  showCreateDialog.value = false;
};

const handleCreatePlaylist = async () => {
  const name = newPlaylistName.value.trim();
  const userId = currentUserIdNumber.value;
  if (!name || !userId || isCreatingPlaylist.value) return;

  isCreatingPlaylist.value = true;
  try {
    const success = await playlistStore.createPlaylist(name, newPlaylistIsPrivate.value, userId);
    if (!success) {
      toastStore.actionFailed('创建歌单');
      return;
    }
    activePlaylistTab.value = 0;
    showCreateDialog.value = false;
    newPlaylistName.value = '';
    newPlaylistIsPrivate.value = false;
    toastStore.actionSucceeded('创建歌单');
  } catch {
    toastStore.actionFailed('创建歌单');
  } finally {
    isCreatingPlaylist.value = false;
  }
};

// ---- 删除/取消收藏 ----
const openRemovePlaylistDialog = (playlist: PlaylistMeta) => {
  if (!canRemovePlaylist(playlist)) return;
  pendingRemovePlaylist.value = playlist;
  showRemoveDialog.value = true;
};

const closeRemovePlaylistDialog = () => {
  if (isRemovingPlaylist.value) return;
  showRemoveDialog.value = false;
  pendingRemovePlaylist.value = null;
};

const removeDialogTitle = computed(() => {
  const playlist = pendingRemovePlaylist.value;
  if (!playlist) return '删除歌单';
  return isOwnerPlaylist(playlist) ? '删除歌单' : '取消收藏';
});

const removeDialogConfirmText = computed(() => {
  const playlist = pendingRemovePlaylist.value;
  if (!playlist) return '删除';
  return isOwnerPlaylist(playlist) ? '删除' : '取消收藏';
});

const removeDialogDescription = computed(() => {
  const playlist = pendingRemovePlaylist.value;
  if (!playlist) return '确定要删除当前歌单吗？';
  const action = isOwnerPlaylist(playlist) ? '删除' : '取消收藏';
  return `确定要${action}「${playlist.name || '歌单'}」吗？`;
});

const handleRemovePlaylist = async () => {
  const playlist = pendingRemovePlaylist.value;
  if (!playlist || isRemovingPlaylist.value) return;

  const routeId = getPlaylistRouteId(playlist);
  const currentUserIdValue = currentUserIdNumber.value;
  const isOwned = isOwnerPlaylist(playlist);
  const shouldNavigateAway =
    isOwned && route.name === 'playlist-detail' && activePlaylistRouteId.value === routeId;

  isRemovingPlaylist.value = true;
  try {
    let success = false;
    if (playlist.source === 2) {
      success = await playlistStore.unfavoriteAlbum(
        playlist.listCreateListid ?? playlist.listid ?? playlist.id,
      );
    } else if (isOwned) {
      success = await playlistStore.deleteOwnedPlaylist(playlist.listid ?? playlist.id);
    } else {
      success = await playlistStore.unfavoritePlaylist(playlist, currentUserIdValue);
    }

    if (!success) {
      toastStore.actionFailed(isOwned ? '删除歌单' : '取消收藏');
      return;
    }

    showRemoveDialog.value = false;
    pendingRemovePlaylist.value = null;

    if (shouldNavigateAway) {
      try {
        await router.push('/main/home');
      } catch {
        toastStore.navigateFailed();
      }
    }
    toastStore.actionCompleted(isOwned ? '已删除歌单' : '已取消收藏');
  } catch {
    toastStore.actionFailed(isOwned ? '删除歌单' : '取消收藏');
  } finally {
    isRemovingPlaylist.value = false;
  }
};

// ---- 菜单 ----
const isMenuItemDisabled = (item?: SidebarMenuItem) => {
  if (!item) return true;
  if (resolveFlag(item.disabled, false)) return true;
  return !item.path && !item.onClick && !item.component && !item.railComponent;
};

const handleMenuClick = async (item: SidebarMenuItem) => {
  if (isMenuItemDisabled(item)) return;
  try {
    if (item.onClick) {
      await item.onClick();
      return;
    }
    if (item.path) navigateTo(item.path);
  } catch {
    toastStore.actionFailed(item.title);
  }
};

const isMenuItemActive = (item: SidebarMenuItem) => {
  if (item.pluginId && item.pageId && route.name === 'plugin-page') {
    return (
      String(route.params.pluginId ?? '') === item.pluginId &&
      String(route.params.pageId ?? '') === item.pageId
    );
  }
  return Boolean(item.path && route.path === item.path);
};

const syncCloudData = () => {
  if (isLoggedIn.value) {
    void playlistStore.fetchUserPlaylists();
  }
};

onMounted(() => {
  syncCloudData();
});

watch(isLoggedIn, (value) => {
  if (value) {
    syncCloudData();
  } else {
    playlistStore.userPlaylists = [];
  }
});

// 优化：用 computed getter 作为 watch 依赖，避免数组引用变化导致重复触发
const playlistRouteContext = computed(() => ({
  routeName: route.name,
  routeId: String(route.params.id ?? ''),
  playlistCount: playlistStore.userPlaylists.length,
  userId: currentUserId.value,
}));

watch(
  playlistRouteContext,
  ({ routeName, routeId }) => {
    if (routeName === 'playlist-detail' && routeId) {
      const matched = findPlaylistByRouteId(routeId) || findPlaylistByRouteId(routeId, 1);
      if (matched) {
        activePlaylistTab.value = isOwnerPlaylist(matched) ? 0 : 1;
      }
    }
  },
  { immediate: true },
);

// 任务面板触发重新打开导入弹窗
let lastOpenRequested = 0;
watch(
  () => importTaskStore.openRequested,
  (val) => {
    if (val !== lastOpenRequested && val > 0) {
      lastOpenRequested = val;
      showImportDialog.value = true;
    }
  },
);
</script>

<template>
  <aside
    v-bind="attrs"
    class="sidebar h-full flex flex-col bg-bg-sidebar border-r border-[var(--border-subtle)] select-none transition-all duration-300 relative overflow-hidden"
    :class="{ 'is-rail': collapsed }"
  >
    <div
      :class="['w-full shrink-0 relative', isMac ? 'h-12' : 'h-6']"
      :style="{ minHeight: 'var(--window-controls-left-height, 0px)' }"
    >
      <div class="drag-region"></div>
    </div>

    <template v-if="collapsed">
      <div class="sidebar-rail flex flex-col flex-1 min-h-0 no-drag">
        <div class="sidebar-rail-top">
          <Tooltip
            :content="isLoggedIn ? userInfo?.nickname || '个人主页' : '点击登录账号'"
            side="right"
          >
            <template #trigger>
              <Button
                variant="unstyled"
                size="none"
                class="sidebar-rail-avatar-btn"
                :aria-label="isLoggedIn ? userInfo?.nickname || '个人主页' : '点击登录账号'"
                @click="navigateTo(isLoggedIn ? '/main/profile' : '/login')"
              >
                <Avatar
                  :src="isLoggedIn ? userInfo?.pic : ''"
                  class="w-9 h-9 rounded-full"
                  error-class="opacity-30"
                />
              </Button>
            </template>
          </Tooltip>
        </div>

        <Scrollbar
          class="sidebar-content no-drag"
          :scrollbar-inset="3"
          :content-props="{ class: 'sidebar-rail-scroll-content' }"
        >
          <div v-if="visibleRailMenuGroups.length > 0" class="sidebar-rail-nav">
            <template v-for="group in visibleRailMenuGroups" :key="group.id">
              <div class="sidebar-rail-divider" aria-hidden="true"></div>
              <Tooltip
                v-for="item in group.items"
                :key="item.key"
                :content="item.title"
                side="right"
              >
                <template #trigger>
                  <component
                    :is="item.railComponent"
                    v-if="item.railComponent"
                    :item="item"
                    :section="group"
                    :collapsed="true"
                  />
                  <Button
                    v-else
                    variant="unstyled"
                    size="none"
                    :disabled="isMenuItemDisabled(item)"
                    :aria-label="item.title"
                    :class="[
                      'sidebar-rail-item',
                      isMenuItemDisabled(item)
                        ? 'is-disabled'
                        : isMenuItemActive(item)
                          ? 'is-active'
                          : '',
                    ]"
                    @click="handleMenuClick(item)"
                  >
                    <Icon
                      v-if="item.builtinIcon"
                      :icon="iconMap[item.builtinIcon]"
                      width="19"
                      height="19"
                    />
                  </Button>
                </template>
              </Tooltip>
            </template>
          </div>

          <div class="sidebar-rail-playlists">
            <div class="sidebar-rail-divider" aria-hidden="true"></div>
            <div
              class="sidebar-rail-tabs"
              :class="activePlaylistTab === 1 ? 'is-favorited' : 'is-created'"
            >
              <span class="sidebar-rail-tab-indicator" aria-hidden="true"></span>
              <Tooltip content="自建歌单" side="right">
                <template #trigger>
                  <Button
                    variant="unstyled"
                    size="none"
                    aria-label="自建歌单"
                    :class="['sidebar-rail-tab', activePlaylistTab === 0 ? 'is-active' : '']"
                    @click="activePlaylistTab = 0"
                  >
                    <Icon :icon="iconPlaylistAdd" width="15" height="15" />
                  </Button>
                </template>
              </Tooltip>
              <Tooltip content="收藏歌单" side="right">
                <template #trigger>
                  <Button
                    variant="unstyled"
                    size="none"
                    aria-label="收藏歌单"
                    :class="['sidebar-rail-tab', activePlaylistTab === 1 ? 'is-active' : '']"
                    @click="activePlaylistTab = 1"
                  >
                    <Icon :icon="iconHeart" width="15" height="15" />
                  </Button>
                </template>
              </Tooltip>
            </div>

            <div class="sidebar-rail-playlist-content">
              <div
                v-if="isLoggedIn && visibleRailPlaylists.length > 0"
                class="sidebar-rail-cover-list"
              >
                <Tooltip
                  v-for="playlist in visibleRailPlaylists"
                  :key="playlist.listid || playlist.id"
                  :content="playlist.name || '歌单'"
                  side="right"
                >
                  <template #trigger>
                    <button
                      type="button"
                      :aria-label="playlist.name || '歌单'"
                      :class="[
                        'sidebar-rail-cover-btn',
                        isActivePlaylist(playlist) ? 'is-active' : '',
                      ]"
                      @click="navigateToPlaylist(playlist)"
                    >
                      <Cover
                        :url="playlistCoversStore.coverFor(playlist, userStore.info?.userid)"
                        :size="96"
                        :width="32"
                        :height="32"
                        :borderRadius="8"
                        class="sidebar-rail-cover"
                      />
                    </button>
                  </template>
                </Tooltip>
              </div>
              <Tooltip v-else-if="!isLoggedIn" content="登录同步云端歌单" side="right">
                <template #trigger>
                  <div class="sidebar-rail-empty">
                    <Icon :icon="iconCloud" width="17" height="17" />
                  </div>
                </template>
              </Tooltip>
            </div>
          </div>
        </Scrollbar>

        <div class="sidebar-rail-bottom">
          <Popover
            v-model:open="showPlaylistActions"
            trigger="click"
            side="right"
            align="end"
            :side-offset="8"
            :show-arrow="false"
            content-class="sidebar-rail-more-menu"
          >
            <template #trigger>
              <Tooltip content="歌单操作" side="right">
                <template #trigger>
                  <Button
                    variant="unstyled"
                    size="none"
                    type="button"
                    class="sidebar-rail-item"
                    aria-label="歌单操作"
                  >
                    <Icon :icon="iconDotsVertical" width="18" height="18" />
                  </Button>
                </template>
              </Tooltip>
            </template>

            <div class="sidebar-rail-more-list">
              <div class="sidebar-sort-menu-title">歌单操作</div>
              <button
                type="button"
                class="sidebar-sort-menu-item"
                :disabled="!isLoggedIn"
                @click="
                  () => {
                    showPlaylistActions = false;
                    refreshUserPlaylists();
                  }
                "
              >
                刷新歌单
              </button>
              <button
                type="button"
                class="sidebar-sort-menu-item"
                :disabled="!isLoggedIn || activePlaylistTab !== 0"
                @click="
                  () => {
                    showPlaylistActions = false;
                    openCreatePlaylistDialog();
                  }
                "
              >
                新建空歌单
              </button>
              <button
                type="button"
                class="sidebar-sort-menu-item"
                :disabled="!isLoggedIn || activePlaylistTab !== 0"
                @click="
                  () => {
                    showPlaylistActions = false;
                    showImportDialog = true;
                  }
                "
              >
                导入外部歌单
              </button>
              <div class="sidebar-sort-menu-divider"></div>
              <button
                type="button"
                class="sidebar-sort-menu-item"
                :disabled="!isLoggedIn"
                @click="openPlaylistOrder"
              >
                自定义顺序…
              </button>
            </div>
          </Popover>

          <Tooltip content="设置" side="right">
            <template #trigger>
              <Button
                variant="unstyled"
                size="none"
                class="sidebar-rail-item"
                aria-label="设置"
                @click="router.push('/main/settings')"
              >
                <Icon :icon="iconSettings" width="19" height="19" />
              </Button>
            </template>
          </Tooltip>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="sidebar-full-panel flex flex-col flex-1 min-h-0">
        <SidebarUserCard />

        <div class="sidebar-body-scroll app-scrollbar no-drag">

        <div class="sidebar-nav-scroll no-drag">
          <div class="px-4">
            <div v-for="group in allMenuGroups" :key="group.id" class="mb-1.5 last:mb-0">
              <h2
                class="sidebar-section-header px-3.5 text-[11px] font-semibold text-text-main/60 uppercase tracking-[0.5px] mb-2 flex items-center gap-1 select-none"
                :class="group.collapsible ? 'cursor-pointer' : 'cursor-default'"
                @click="toggleSection(group)"
              >
                {{ group.title }}
                <Icon
                  v-if="group.collapsible"
                  :icon="iconChevronDown"
                  width="10"
                  height="10"
                  class="sidebar-collapse-arrow transition-transform duration-200 ml-auto"
                  :class="{ '-rotate-90': isSectionCollapsed(group) }"
                />
              </h2>
              <nav
                class="sidebar-section-body"
                :class="{ 'is-collapsed': isSectionCollapsed(group) }"
              >
                <div class="space-y-0.5">
                  <template v-for="item in group.items" :key="item.key">
                    <component
                      :is="item.component"
                      v-if="item.component"
                      :item="item"
                      :section="group"
                      :collapsed="false"
                    />
                    <Button
                      v-else
                      variant="unstyled"
                      size="none"
                      :disabled="isMenuItemDisabled(item)"
                      :class="[
                        'sidebar-nav-item w-full flex items-center gap-3.5 px-3.5 py-2 rounded-[14px] transition-all duration-200 group active:scale-[0.98]',
                        isMenuItemDisabled(item)
                          ? 'is-disabled cursor-not-allowed opacity-35 text-text-main/55'
                          : isMenuItemActive(item)
                            ? 'is-active cursor-pointer bg-primary/12 text-primary-text'
                            : 'cursor-pointer text-text-main/90',
                      ]"
                      @click="handleMenuClick(item)"
                    >
                      <Icon
                        v-if="item.builtinIcon"
                        :icon="iconMap[item.builtinIcon]"
                        width="18"
                        height="18"
                        :class="[
                          isMenuItemDisabled(item)
                            ? 'text-text-main opacity-40'
                            : isMenuItemActive(item)
                              ? 'text-primary-text'
                              : 'text-text-main opacity-60 group-hover:opacity-100',
                        ]"
                      />
                      <span
                        class="text-[14px]"
                        :class="[isMenuItemActive(item) ? 'font-semibold' : 'font-normal']"
                      >
                        {{ item.title }}
                      </span>
                    </Button>
                  </template>
                </div>
              </nav>
            </div>
          </div>
        </div>

        <SidebarPlaylistHeader
          :active-tab="activePlaylistTab"
          :is-logged-in="isLoggedIn"
          v-model:show-create-menu="showCreateMenu"
          @tab-change="activePlaylistTab = $event"
          @open-order="openPlaylistOrder"
          @refresh="refreshUserPlaylists"
          @create-playlist="openCreatePlaylistDialog"
          @import-playlist="showImportDialog = true"
        />

        <Scrollbar class="sidebar-playlist-scroll no-drag flex-1 min-h-0" :scrollbar-inset="3">
          <nav v-if="isLoggedIn" class="sidebar-scroll-inner space-y-0.5">
            <!-- 自建歌单 -->
            <template v-if="activePlaylistTab === 0">
              <div
                v-for="playlist in createdPlaylists.pinned"
                :key="playlist.listid || playlist.id"
                :class="[
                  'sidebar-library-item relative w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl group cursor-pointer active:scale-[0.98] transition-all',
                  isActivePlaylist(playlist)
                    ? 'is-active bg-primary/12 text-primary-text'
                    : 'text-text-main/90',
                ]"
                @click="navigateToPlaylist(playlist)"
              >
                <Cover
                  :url="playlistCoversStore.coverFor(playlist, userStore.info?.userid)"
                  :size="100"
                  :width="28"
                  :height="28"
                  :borderRadius="6"
                  class="shrink-0"
                />
                <div class="sidebar-playlist-label-wrap">
                  <span
                    :class="[
                      'text-[13px] truncate w-full font-medium tracking-tight',
                      isActivePlaylist(playlist) ? 'text-primary-text' : 'text-text-main/90',
                    ]"
                  >
                    {{ playlist.name }}
                  </span>
                </div>
              </div>

              <div
                v-if="createdPlaylists.pinned.length > 0 && createdPlaylists.normal.length > 0"
                class="sidebar-playlist-divider"
              ></div>

              <div
                v-for="playlist in createdPlaylists.normal"
                :key="playlist.listid || playlist.id"
                :class="[
                  'sidebar-library-item relative w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl group cursor-pointer active:scale-[0.98] transition-all',
                  isActivePlaylist(playlist)
                    ? 'is-active bg-primary/12 text-primary-text'
                    : 'text-text-main/90',
                ]"
                @click="navigateToPlaylist(playlist)"
              >
                <Cover
                  :url="playlistCoversStore.coverFor(playlist, userStore.info?.userid)"
                  :size="100"
                  :width="28"
                  :height="28"
                  :borderRadius="6"
                  class="shrink-0"
                />
                <div
                  :class="[
                    'sidebar-playlist-label-wrap',
                    canRemovePlaylist(playlist) ? 'has-action' : '',
                  ]"
                >
                  <span
                    :class="[
                      'text-[13px] truncate w-full font-medium tracking-tight',
                      isActivePlaylist(playlist) ? 'text-primary-text' : 'text-text-main/90',
                    ]"
                  >
                    {{ playlist.name }}
                  </span>
                </div>
                <Button
                  v-if="canRemovePlaylist(playlist)"
                  variant="unstyled"
                  size="none"
                  type="button"
                  class="sidebar-playlist-action"
                  :tooltip="isOwnerPlaylist(playlist) ? '删除歌单' : '取消收藏'"
                  @click.stop="openRemovePlaylistDialog(playlist)"
                >
                  <Icon :icon="iconTrash" width="14" height="14" />
                </Button>
              </div>

              <div
                v-if="createdPlaylists.pinned.length === 0 && createdPlaylists.normal.length === 0"
                class="py-8 text-center opacity-40 text-[12px] italic"
              >
                暂无自建歌单
              </div>
            </template>

            <!-- 收藏歌单 -->
            <template v-else>
              <div
                v-for="playlist in favoritedPlaylists"
                :key="playlist.listid || playlist.id"
                :class="[
                  'sidebar-library-item relative w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl group cursor-pointer active:scale-[0.98] transition-all',
                  isActivePlaylist(playlist)
                    ? 'is-active bg-primary/12 text-primary-text'
                    : 'text-text-main/90',
                ]"
                @click="navigateToPlaylist(playlist)"
              >
                <Cover
                  :url="playlistCoversStore.coverFor(playlist, userStore.info?.userid)"
                  :size="100"
                  :width="28"
                  :height="28"
                  :borderRadius="6"
                  class="shrink-0"
                />
                <div class="sidebar-playlist-label-wrap has-action">
                  <span
                    :class="[
                      'text-[13px] truncate w-full font-medium tracking-tight',
                      isActivePlaylist(playlist) ? 'text-primary-text' : 'text-text-main/90',
                    ]"
                  >
                    {{ playlist.name }}
                  </span>
                </div>
                <Button
                  v-if="canRemovePlaylist(playlist)"
                  variant="unstyled"
                  size="none"
                  type="button"
                  class="sidebar-playlist-action"
                  tooltip="取消收藏"
                  @click.stop="openRemovePlaylistDialog(playlist)"
                >
                  <Icon :icon="iconTrash" width="14" height="14" />
                </Button>
              </div>

              <div
                v-if="favoritedPlaylists.length === 0"
                class="py-8 text-center opacity-40 text-[12px] italic"
              >
                暂无收藏内容
              </div>
            </template>
          </nav>

          <div v-else class="sidebar-scroll-empty px-3.5 py-8 text-center">
            <span class="text-[12px] font-normal text-text-main opacity-50 italic">
              登录同步云端歌单
            </span>
          </div>
        </Scrollbar>
        </div>
      </div>
    </template>
  </aside>

  <Dialog
    v-model:open="showCreateDialog"
    title="新建歌单"
    description="输入歌单名称，可选设为隐私歌单。"
    contentClass="sidebar-dialog"
    showClose
    :close-on-interact-outside="!isCreatingPlaylist"
  >
    <div class="flex flex-col gap-4 pt-1">
      <Input
        v-model="newPlaylistName"
        placeholder="请输入歌单名称"
        :show-clear="!isCreatingPlaylist"
        input-class="h-12 rounded-[14px] px-4 pr-10 text-[14px] font-medium"
      />
      <div
        class="flex items-center justify-between rounded-[14px] bg-[var(--control-muted-bg)] px-4 py-3"
      >
        <div class="flex flex-col gap-1">
          <span class="text-[14px] font-medium text-text-main">设为隐私歌单</span>
          <span class="text-[12px] text-text-secondary/80">仅自己可见</span>
        </div>
        <Switch v-model="newPlaylistIsPrivate" :disabled="isCreatingPlaylist" />
      </div>
    </div>
    <template #footer>
      <Button
        variant="ghost"
        size="sm"
        :disabled="isCreatingPlaylist"
        @click="closeCreatePlaylistDialog"
      >
        取消
      </Button>
      <Button
        variant="primary"
        size="sm"
        :loading="isCreatingPlaylist"
        :disabled="!newPlaylistName.trim() || !currentUserIdNumber"
        @click="handleCreatePlaylist"
      >
        创建
      </Button>
    </template>
  </Dialog>

  <Dialog
    v-model:open="showRemoveDialog"
    :title="removeDialogTitle"
    :description="removeDialogDescription"
    contentClass="sidebar-dialog"
    showClose
    :close-on-interact-outside="!isRemovingPlaylist"
  >
    <template #footer>
      <Button
        variant="ghost"
        size="sm"
        :disabled="isRemovingPlaylist"
        @click="closeRemovePlaylistDialog"
      >
        取消
      </Button>
      <Button
        variant="danger"
        size="sm"
        :loading="isRemovingPlaylist"
        @click="handleRemovePlaylist"
      >
        {{ removeDialogConfirmText }}
      </Button>
    </template>
  </Dialog>

  <ImportPlaylistDialog v-model:open="showImportDialog" />
  <PlaylistOrderDialog
    v-if="showPlaylistOrder"
    v-model:open="showPlaylistOrder"
    :target="playlistOrderTarget"
  />
</template>

<style scoped>
@reference "@/style.css";

.sidebar {
  width: 230px;
  transition: width 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar.is-rail {
  width: 80px;
}

:deep(.sidebar-scroll) {
  min-height: 0;
}

:deep(.sidebar-rail-scroll-content) {
  min-height: 0;
  padding: 0 8px;
}

.sidebar-rail {
  position: relative;
  z-index: 1;
  padding: 0 0 10px;
  align-items: center;
  animation: sidebar-rail-enter 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.sidebar-full-panel {
  position: relative;
  z-index: 1;
  animation: sidebar-full-enter 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-height: 0;
}

/* 展开模式：导航区（固定，不滚动，占内容高度） */
.sidebar-nav-scroll {
  flex-shrink: 0;
}

/* 展开模式：歌单区（占剩余空间，歌单多时独立滚动，底部留白避免贴近播放栏） */
.sidebar-playlist-scroll {
  flex: 1;
  min-height: 0;
  padding-bottom: 4px;
}

.sidebar-playlist-header {
  padding-top: 6px;
  padding-bottom: 6px;
}

.sidebar-rail-top,
.sidebar-rail-bottom,
.sidebar-rail-tabs,
.sidebar-rail-divider {
  flex-shrink: 0;
}

.sidebar-rail-top {
  width: 100%;
  display: flex;
  justify-content: center;
  padding-bottom: 8px;
}

.sidebar-rail-avatar-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--control-bg);
  box-shadow: inset 0 0 0 1px var(--control-border);
}

.sidebar-rail-avatar-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.sidebar-rail-nav,
.sidebar-rail-bottom {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.sidebar-rail-playlists {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 4px;
}

.sidebar-rail-tabs {
  width: 100%;
  height: 30px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 3px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-text-main) 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text-main) 4%, transparent);
}

.sidebar-rail-tab-indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 8px) / 2);
  border-radius: 9px;
  background: var(--color-bg-sidebar);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 10%, transparent);
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar-rail-tabs.is-favorited .sidebar-rail-tab-indicator {
  transform: translateX(calc(100% + 2px));
}

.sidebar-rail-tab {
  position: relative;
  z-index: 1;
  height: 24px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: color-mix(in srgb, var(--color-text-main) 56%, transparent);
  background: transparent;
  transition:
    color 0.18s ease,
    transform 0.18s ease;
}

.sidebar-rail-tab:hover {
  color: var(--color-text-main);
}

.sidebar-rail-tab.is-active {
  color: var(--color-primary-text);
}

.sidebar-rail-playlist-content {
  padding-bottom: 12px;
}

.sidebar-rail-cover-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.sidebar-rail-cover-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.18s ease;
}

.sidebar-rail-cover-btn:hover {
  background: color-mix(in srgb, var(--color-text-main) 7%, transparent);
}

.sidebar-rail-cover-btn.is-active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 26%, transparent);
}

.sidebar-rail-cover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.sidebar-rail-empty {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: color-mix(in srgb, var(--color-text-main) 36%, transparent);
  background: color-mix(in srgb, var(--color-text-main) 5%, transparent);
}

.sidebar-rail-bottom {
  padding-top: 8px;
}

.sidebar-rail-item {
  width: 38px;
  height: 38px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: color-mix(in srgb, var(--color-text-main) 66%, transparent);
  background: transparent;
  transition: all 0.18s ease;
}

.sidebar-rail-item:hover {
  color: var(--color-text-main);
  background: color-mix(in srgb, var(--color-text-main) 7%, transparent);
}

.sidebar-rail-item.is-active {
  color: #5ac8fa;
  background: color-mix(in srgb, #0a84ff 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #0a84ff 12%, transparent);
}

.sidebar-rail-item.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sidebar-rail-divider {
  width: 28px;
  height: 1px;
  margin: 6px auto;
  border-radius: 1px;
  background: color-mix(in srgb, var(--color-text-main) 13%, transparent);
}

:deep(.sidebar-rail-more-menu) {
  padding: 6px;
  border-radius: 12px;
  min-width: 156px;
}

.sidebar-rail-more-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

@keyframes sidebar-rail-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes sidebar-full-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.sidebar-scroll-inner,
.sidebar-scroll-empty {
  padding: 0 16px 24px;
}

.sidebar-playlist-tab {
  @apply shrink-0 whitespace-nowrap text-left text-[11px] font-semibold tracking-[0.1px] leading-none transition-colors duration-200;
}

.sidebar-user-divider {
  @apply mx-1.5 h-[22px] w-px shrink-0 rounded-full bg-text-main/14;
}

:global(.dark) .sidebar-user-divider {
  background-color: color-mix(in srgb, var(--color-text-main) 18%, transparent);
}

.sidebar-tab-divider {
  @apply shrink-0 mx-px w-px h-3 rounded-full bg-text-main/22;
}

:global(.dark) .sidebar-tab-divider {
  background-color: color-mix(in srgb, var(--color-text-main) 36%, transparent);
}

.sidebar-nav-item,
.sidebar-library-item,
.sidebar-user-link,
.sidebar-settings-btn,
.sidebar-section-action,
.sidebar-playlist-action {
  background-color: transparent;
}

.user-info-card {
  min-width: 0;
}

.sidebar-user-link {
  min-width: 0;
}

.sidebar-settings-btn {
  @apply h-9 w-9 shrink-0 flex items-center justify-center;
}

.sidebar-nav-item:not(.is-active):not(.is-disabled):hover,
.sidebar-library-item:not(.is-active):hover {
  background-color: color-mix(in srgb, var(--color-text-main) 7%, transparent);
}

.sidebar-user-link:hover {
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.sidebar-settings-btn:hover,
.sidebar-icon-btn:hover {
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.sidebar-section-action-slot {
  @apply h-6 w-6 shrink-0;
}

.sidebar-section-action {
  @apply h-6 w-6 min-w-0 shrink-0 rounded-md flex items-center justify-center;
  @apply text-text-main opacity-60 transition-all disabled:opacity-30;
}

.sidebar-playlist-label-wrap {
  @apply flex flex-col items-start min-w-0 flex-1 transition-[padding] duration-200;
}

.sidebar-playlist-label-wrap.has-action {
  @apply group-hover:pr-8;
}

.sidebar-playlist-action {
  @apply absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 min-w-0 rounded-lg flex items-center justify-center text-text-main/55;
  @apply opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:text-red-500 transition-all;
}

.sidebar-playlist-action:hover {
  background-color: color-mix(in srgb, var(--color-text-main) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text-main) 4%, transparent);
}

:deep(.sidebar-dialog) {
  width: min(420px, 92vw);
}

:deep(.sidebar-create-menu) {
  padding: 8px;
  border-radius: 16px;
  min-width: 248px;
}

.sidebar-create-menu-list {
  @apply flex flex-col gap-0.5;
}

.sidebar-create-menu-title {
  @apply px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider;
  color: color-mix(in srgb, var(--color-text-main) 50%, transparent);
}

.sidebar-create-menu-item {
  @apply w-full flex items-center gap-3 px-2 py-2 rounded-[12px] transition-all;
}

.sidebar-create-menu-item:hover {
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.sidebar-create-menu-item:active {
  transform: scale(0.985);
}

.sidebar-create-menu-icon {
  @apply inline-flex items-center justify-center w-8 h-8 rounded-[10px] shrink-0 transition-colors;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary-text);
}

.sidebar-create-menu-item:hover .sidebar-create-menu-icon {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.sidebar-create-menu-title-row {
  @apply text-[13px] font-medium text-text-main leading-tight;
}

.sidebar-create-menu-desc {
  @apply text-[11px] text-text-secondary/75 leading-tight mt-0.5;
}

.sidebar-section-body {
  overflow: hidden;
  max-height: 500px;
  transition:
    max-height 0.25s ease,
    opacity 0.2s ease;
  opacity: 1;
}

.sidebar-section-body.is-collapsed {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}

.sidebar-section-header {
  user-select: none;
  -webkit-user-select: none;
}

.sidebar-collapse-arrow {
  opacity: 0.5;
}

.sidebar-playlist-divider {
  height: 1px;
  margin: 6px 14px;
  background: var(--border-subtle);
  border-radius: 1px;
}

:deep(.sidebar-sort-menu) {
  padding: 6px;
  border-radius: 12px;
  min-width: 140px;
}

.sidebar-sort-menu-title {
  padding: 4px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  color: color-mix(in srgb, var(--color-text-main) 50%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-sort-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.sidebar-sort-menu-item:hover {
  color: var(--color-text-main);
  background: color-mix(in srgb, var(--color-text-main) 6%, transparent);
}

.sidebar-sort-menu-item.is-active {
  color: var(--color-primary-text);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  font-weight: 600;
}

.sidebar-sort-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--color-text-main) 10%, transparent);
}

.sidebar-sort-menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================================
   Apple 风格 · 侧边栏导航按钮
   毛玻璃胶囊 + iOS 蓝选中态 + 浮起/按压效果
   ============================================================ */
.sidebar-nav-item {
  position: relative;
  border-radius: 13px;
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  backdrop-filter: blur(14px) saturate(1.4);
  transition:
    background 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.18s ease;
}

/* 悬停：毛玻璃浮起 + 微光 */
.sidebar-nav-item:not(.is-active):not(.is-disabled):hover {
  background: rgba(255, 255, 255, 0.38);
  box-shadow:
    0 3px 14px rgba(30, 42, 80, 0.07),
    inset 0 0 0 1px rgba(255, 255, 255, 0.55);
  transform: translateY(-1px);
  color: var(--color-text-main);
}

.sidebar-nav-item:not(.is-active):not(.is-disabled):hover .icon,
.sidebar-nav-item:not(.is-active):not(.is-disabled):hover svg {
  opacity: 1;
}

/* 选中：浅蓝胶囊高亮 */
.sidebar-nav-item.is-active {
  background: linear-gradient(180deg, rgba(10, 132, 255, 0.15), rgba(10, 132, 255, 0.06));
  box-shadow:
    0 5px 18px rgba(10, 132, 255, 0.1),
    inset 0 0 0 1px rgba(10, 132, 255, 0.3);
  color: #0a84ff;
}

.sidebar-nav-item.is-active svg {
  color: #0a84ff;
}

/* 按压：轻微回缩 */
.sidebar-nav-item:active {
  transform: scale(0.96);
}

/* 深色主题适配 */
:global(.dark) .sidebar-nav-item:not(.is-active):not(.is-disabled):hover {
  background: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 3px 14px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

:global(.dark) .sidebar-nav-item.is-active {
  background: linear-gradient(180deg, rgba(10, 132, 255, 0.12), rgba(10, 132, 255, 0.05));
  box-shadow:
    0 5px 18px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px rgba(10, 132, 255, 0.35);
  color: #5ac8fa;
}

:global(.dark) .sidebar-nav-item.is-active svg {
  color: #5ac8fa;
}

/* ==========================================================================
   侧栏统一滚动：整个面板一起滚，歌单区不再单独滚动
   （之前歌单区 flex:1 抢占剩余空间，窗口矮时歌单会被压没）
   ========================================================================== */
.sidebar-full-panel {
  overflow: hidden;
}

.sidebar-body-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 歌单区改为按内容高度排列，交给外层滚动 */
.sidebar-playlist-scroll {
  flex: 0 0 auto;
  min-height: 0;
  padding-bottom: 12px;
}

/* 关闭 Scrollbar 组件自身的滚动与自定义滚动条 */
.sidebar-playlist-scroll :deep(.scrollbar-wrap) {
  overflow: visible !important;
  height: auto !important;
  max-height: none !important;
}

.sidebar-playlist-scroll :deep(.scrollbar) {
  display: none !important;
}
</style>
