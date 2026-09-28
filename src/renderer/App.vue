<script setup lang="ts">
import { setupStartupPluginUpdateCheck } from '@/stores/pluginUpdates';
import startupSoundUrl from '/zhenzhu/startup.wav?url';
import TooltipScope from '@/components/ui/TooltipScope.vue';
import SettingsDialog from '@/components/app/SettingsDialog.vue';
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import ToastViewport from '@/components/app/ToastViewport.vue';
import RouteErrorBoundary from '@/components/app/RouteErrorBoundary.vue';
import { useSettingStore } from './stores/setting';
import { useUpdateStore } from './stores/update';
import { useThemeStore } from './stores/theme';
import { usePlaylistStore } from './stores/playlist';
import { useHistoryStore } from './stores/historyStore';
import { useToastStore } from './stores/toast';
import { useUserStore } from './stores/user';
import { waitForSqlitePersistHydration } from './stores/sqlitePersist';
import { normalizeQuality } from './stores/player/utils';
import { clearCloudAudioIndex, refreshCloudAudioIndex } from '@/services/cloudAudioIndex';
import { registerContentBlacklistIntegration } from '@/services/contentBlacklistIntegration';
import { useContentBlacklistStore } from './stores/contentBlacklist';
import { pageTransitionState } from '@/plugins/runtime/theme';
import { coverFallbackRevision } from '@/plugins/coverFallback';
import { resolveCoverColorUrls } from '@/utils/cover';
import { logger } from '@/utils/logger';
import { installWindowFrame } from '@/utils/windowFrame';
import {
  navigateToShareTarget,
  SHARE_RESOLVE_ROUTE_NAME,
  SHARE_COPIED_EVENT,
  type ShareCopiedEventDetail,
} from '@/utils/share';
import { extractShareTarget, getShareResourceLabel, type ShareTarget } from '../shared/share';

type PlayerStore = ReturnType<(typeof import('./stores/player'))['usePlayerStore']>;
type SyncGlobalShortcuts = (typeof import('@/utils/shortcuts'))['syncGlobalShortcuts'];

const AuthExpiredDialog = defineAsyncComponent(
  () => import('@/components/app/AuthExpiredDialog.vue'),
);
const KugouVerificationFlow = defineAsyncComponent(
  () => import('@/components/app/KugouVerificationFlow.vue'),
);
const UpdateDialog = defineAsyncComponent(() => import('@/components/app/UpdateDialog.vue'));
const LyricView = defineAsyncComponent(() => import('@/views/lyric/LyricPage.vue'));
const route = useRoute();
const router = useRouter();
const player = shallowRef<PlayerStore | null>(null);
const settings = useSettingStore();

// ===== 输入 dake 触发彩蛋（远程开关 + 上报 + 红色飘雪）=====
const dakeEggOpen = ref(false);
let dakeBuffer = '';
let dakeEggTimer: number | null = null;
const EGG_WORKER_URL = "https://dake-egg-log.983064062.workers.dev";

interface ConfettiPiece {
  id: number;
  x: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}
const dakeConfetti = ref<ConfettiPiece[]>([]);

const snowColors = ['#ff4d4d', '#ff6b6b', '#e60000', '#ff1a1a', '#ff8080', '#cc0000'];

// 检查远程开关
const checkEggEnabled = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${EGG_WORKER_URL}/status`, { method: "GET" });
    const data = await res.json();
    return data.enabled !== false;
  } catch {
    // 网络不通时默认开启，不影响本地彩蛋
    return true;
  }
};

// 上报触发记录
const reportEggTrigger = async () => {
  try {
    const deviceId = await (window as any).eggApi?.getDeviceId();
    if (!deviceId) return;
    await fetch(`${EGG_WORKER_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        triggerTime: new Date().toISOString()
      })
    });
    console.log("🌐 彩蛋触发已上报，设备ID：", deviceId);
  } catch (err) {
    console.warn("🌐 彩蛋上报失败（离线/网络异常），不影响播放", err);
  }
};

const triggerDakeEgg = async () => {
  if (dakeEggOpen.value) return;

  // 先检查远程开关
  const enabled = await checkEggEnabled();
  if (!enabled) {
    console.log("🥚 彩蛋已被远程关闭");
    return;
  }

  dakeEggOpen.value = true;

  // 异步上报，不阻塞彩蛋播放
  void reportEggTrigger();

  // 飘雪（红色 · 高密度 · 慢速）
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < 180; i++) {
    pieces.push({
      id: Date.now() + i,
      x: Math.random() * 100,
      size: Math.random() * 7 + 3,
      color: snowColors[Math.floor(Math.random() * snowColors.length)],
      delay: Math.random() * 4,
      duration: Math.random() * 6 + 9,
    });
  }
  dakeConfetti.value = pieces;
};

const closeDakeEgg = () => {
  dakeEggOpen.value = false;
  dakeConfetti.value = [];
};

const handleDakeKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (/^[a-z]$/.test(key)) {
    dakeBuffer = (dakeBuffer + key).slice(-9);
    if (dakeBuffer === 'dakemusic') {
      dakeBuffer = '';
      void triggerDakeEgg();
    }
  }
};

const updateStore = useUpdateStore();
const themeStore = useThemeStore();
const playlistStore = usePlaylistStore();
const historyStore = useHistoryStore();
const toastStore = useToastStore();
const userStore = useUserStore();
const contentBlacklistStore = useContentBlacklistStore();
const onWindowBackgroundChanged = () => {
  void settings.initWindowBackground();
};
let disposeWindowFrame: (() => void) | null = null;
let disposeShortcuts: (() => void) | null = null;
let disposeDesktopLyricSync: (() => void) | null = null;
let disposeMiniPlayerSync: (() => void) | null = null;
let disposeNowPlayingSync: (() => void) | null = null;
let disposeTrayPlayModeSync: (() => void) | null = null;
let disposePowerResumeSync: (() => void) | null = null;
let disposePluginRuntimeReload: (() => void) | null = null;
let disposeTaskBridges: (() => void) | null = null;
let disposeShareOpen: (() => void) | null = null;
let disposeContentBlacklistIntegration: (() => void) | null = null;
let syncGlobalShortcutsFn: SyncGlobalShortcuts | null = null;
let silentUpdateCheckTimer: number | null = null;
let clipboardShareCheckTimer: number | null = null;
let cloudAudioIndexWarmupTimer: number | null = null;
let lastHandledClipboardText = '';
let isCheckingClipboardShare = false;
let colorSchemeMediaQuery: MediaQueryList | null = null;

const isMiniPlayerWindow = () => {
  const hashPath = window.location.hash.replace(/^#/, '').split(/[?#]/)[0];
  return (
    route.name === 'mini-player' || route.path === '/mini-player' || hashPath === '/mini-player'
  );
};
const isMiniPlayerRoute = computed(isMiniPlayerWindow);
watch(
  () => Boolean(player.value?.isLyricViewOpen),
  (visible) => {
    if (!isMiniPlayerRoute.value && window.electron?.platform !== 'darwin')
      window.electron?.ipcRenderer?.send('window:lyric-visibility', visible);
  },
  { immediate: true },
);
const suppressRootTransition = ref(false);
const pendingShareTarget = ref<ShareTarget | null>(null);
const rootPageTransitionName = computed(() =>
  isMiniPlayerRoute.value || suppressRootTransition.value || !pageTransitionState.enabled
    ? undefined
    : pageTransitionState.name,
);
const rootPageTransitionMode = computed(() =>
  suppressRootTransition.value || pageTransitionState.mode === 'default'
    ? undefined
    : pageTransitionState.mode,
);
const rootPageTransitionAppear = computed(
  () =>
    !isMiniPlayerRoute.value &&
    !suppressRootTransition.value &&
    pageTransitionState.enabled &&
    pageTransitionState.appear,
);
const rootPageTransitionKey = computed(() => route.matched[0]?.path ?? route.fullPath);
const currentCoverColorUrls = computed(() =>
  resolveCoverColorUrls(player.value?.currentTrackSnapshot?.coverUrl, 300, { scope: 'theme' }),
);
const currentUserKey = computed(() =>
  String(userStore.info?.userid ?? userStore.info?.userId ?? ''),
);
let loadedCloudUserKey = '';

const updateTheme = () => {
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  themeStore.onThemeChange();
};

const applyGlobalFont = () => {
  document.documentElement.style.fontFamily = settings.buildGlobalFontFamily();
};

const syncTrayPlayback = () => {
  const activePlayer = player.value;
  if (!activePlayer) return;
  window.electron?.tray?.syncPlayback({
    isPlaying: activePlayer.isPlaying,
    playMode: activePlayer.playMode,
    volume: activePlayer.volume,
  });
};

const clearCloudAudioIndexWarmupTimer = () => {
  if (cloudAudioIndexWarmupTimer === null) return;
  window.clearTimeout(cloudAudioIndexWarmupTimer);
  cloudAudioIndexWarmupTimer = null;
};

const scheduleCloudAudioIndexWarmup = () => {
  clearCloudAudioIndexWarmupTimer();
  if (!userStore.isLoggedIn) return;
  cloudAudioIndexWarmupTimer = window.setTimeout(() => {
    cloudAudioIndexWarmupTimer = null;
    void refreshCloudAudioIndex(false).catch((error) => {
      logger.debug('App', 'Warm cloud audio index failed:', error);
    });
  }, 1500);
};

const openShareTarget = (target: ShareTarget) => {
  if (route.name === 'loading') {
    pendingShareTarget.value = target;
    return;
  }
  if (!navigateToShareTarget(router, target)) {
    logger.warn('App', 'Invalid share target skipped', target);
    void router.push({
      name: SHARE_RESOLVE_ROUTE_NAME,
      query: {
        type: target.type,
        id: target.id,
        reason: 'invalid',
      },
    });
  }
};

const normalizeClipboardText = (value: unknown) => String(value ?? '').trim();

const handleShareCopied = (event: Event) => {
  const detail = (event as CustomEvent<ShareCopiedEventDetail>).detail;
  const text = normalizeClipboardText(detail?.text);
  if (detail?.target?.type && detail.target.id && text) {
    lastHandledClipboardText = text;
  }
};

const checkClipboardShareTarget = async () => {
  if (isMiniPlayerRoute.value || isCheckingClipboardShare) return;
  const readClipboard = window.electron?.share?.readClipboard;
  if (!readClipboard) return;

  isCheckingClipboardShare = true;
  try {
    const text = await readClipboard();
    const normalizedText = normalizeClipboardText(text);
    const target = extractShareTarget(text);
    if (!target) {
      lastHandledClipboardText = '';
      return;
    }

    if (normalizedText && normalizedText === lastHandledClipboardText) return;
    lastHandledClipboardText = normalizedText;

    const label = getShareResourceLabel(target.type);
    toastStore.showAction(`检测到 DakeMusic ${label}分享`, {
      label: '打开',
      handler: () => openShareTarget(target),
    });
  } catch (error) {
    logger.debug('App', 'Failed to inspect clipboard share link', error);
  } finally {
    isCheckingClipboardShare = false;
  }
};

const scheduleClipboardShareCheck = () => {
  if (clipboardShareCheckTimer !== null) {
    window.clearTimeout(clipboardShareCheckTimer);
  }
  clipboardShareCheckTimer = window.setTimeout(() => {
    clipboardShareCheckTimer = null;
    void checkClipboardShareTarget();
  }, 350);
};

const flushPendingShareTarget = () => {
  if (route.name === 'loading' || !pendingShareTarget.value) return;
  const target = pendingShareTarget.value;
  pendingShareTarget.value = null;
  openShareTarget(target);
};

const playStartupSound = async () => {
  const soundUrl = startupSoundUrl;
  const audio = new Audio();
  audio.volume = 0.9;
  audio.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onCanPlay);
        audio.removeEventListener('error', onError);
      };
      const onCanPlay = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(audio.error || new Error('启动音加载失败'));
      };
      audio.addEventListener('canplaythrough', onCanPlay, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.src = soundUrl;
      audio.load();
    });

    await audio.play();
    logger.debug('App', '启动音播放成功');
  } catch (err) {
    logger.debug('App', '启动音播放失败（已静默）:', err);
  }
};

onMounted(async () => {
  window.addEventListener('keydown', handleDakeKeydown);

  if (settings.enableStartupSound) {
    void playStartupSound();
  }
  if (!isMiniPlayerRoute.value) disposeWindowFrame = installWindowFrame();
  await router.isReady();

  disposeShareOpen = window.electron?.share?.onOpen(openShareTarget) ?? null;
  window.addEventListener('focus', scheduleClipboardShareCheck);
  window.addEventListener(SHARE_COPIED_EVENT, handleShareCopied);

  const { onPluginRuntimeReloadRequested, refreshPlugins } = await import('@/plugins/runtime');

  disposePluginRuntimeReload = onPluginRuntimeReloadRequested(() => {
    void refreshPlugins(
      isMiniPlayerRoute.value ? { miniPlayer: true, reloadActive: true } : { reloadActive: true },
    );
  });

  if (isMiniPlayerRoute.value) {
    void refreshPlugins({ miniPlayer: true });
    return;
  }

  disposeContentBlacklistIntegration = registerContentBlacklistIntegration();

  const [
    { usePlayerStore },
    { initShortcutSync, syncGlobalShortcuts },
    { initDesktopLyricSync },
    { initMiniPlayerSync },
    { initNowPlayingSync },
    { setupTaskBridges },
  ] = await Promise.all([
    import('./stores/player'),
    import('@/utils/shortcuts'),
    import('@/desktopLyric/sync'),
    import('@/miniPlayer/sync'),
    import('@/nowPlaying/sync'),
    import('@/tasks/taskBridges'),
  ]);
  const activePlayer = usePlayerStore();
  player.value = activePlayer;
  syncGlobalShortcutsFn = syncGlobalShortcuts;

  await waitForSqlitePersistHydration();
  if (userStore.isLoggedIn) {
    void userStore.fetchUserInfoOnce();
  }
  settings.defaultAudioQuality = normalizeQuality(settings.defaultAudioQuality);
  settings.ensureShortcutDefaults();
  await settings.hydrateLogSettings();
  await Promise.all([
    playlistStore.hydratePlaybackStateFromStorage(),
    playlistStore.hydratePersonalFmPreferences(),
    historyStore.hydrate(),
  ]);
  activePlayer.init();

  if (settings.autoPlayOnLaunch && activePlayer.currentTrackId && !activePlayer.isPlaying) {
    window.setTimeout(() => {
      if (activePlayer.currentTrackId && !activePlayer.isPlaying) {
        void activePlayer.togglePlay();
      }
    }, 300);
  }

  updateTheme();
  applyGlobalFont();
  themeStore.applyCurrent();
  void initDesktopLyricSync().then((dispose) => {
    disposeDesktopLyricSync = dispose;
  });
  void initNowPlayingSync().then((dispose) => {
    disposeNowPlayingSync = dispose;
  });
  void initMiniPlayerSync().then((dispose) => {
    disposeMiniPlayerSync = dispose;
  });
  window.electron.ipcRenderer.on('window-background:changed', onWindowBackgroundChanged);
  await settings.initWindowBackground();
  settings.syncTheme();
  settings.syncCloseBehavior();
  settings.syncRememberWindowSize();
  settings.syncTaskbarCoverPreview();
  settings.syncTaskbarProgress();
  settings.syncPreventSleep(activePlayer.isPlaying);
  settings.syncLogSettings();
  disposeShortcuts = initShortcutSync();
  disposeTrayPlayModeSync =
    window.electron?.tray?.onSetPlayMode((playMode) => {
      activePlayer.setPlayMode(playMode);
    }) ?? null;
  disposePowerResumeSync =
    window.electron?.power?.onResume(() => {
      void activePlayer.refreshOutputDevices();
    }) ?? null;
  syncTrayPlayback();
  void updateStore.init();
  disposeTaskBridges = setupTaskBridges();
  setupStartupPluginUpdateCheck();
  if (settings.autoCheckUpdate) {
    silentUpdateCheckTimer = window.setTimeout(() => {
      updateStore.check(true);
    }, 4000);
  }
  void refreshPlugins();
  scheduleClipboardShareCheck();
  colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  colorSchemeMediaQuery.addEventListener('change', updateTheme);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleDakeKeydown);
  if (dakeEggTimer) window.clearTimeout(dakeEggTimer);
  disposeWindowFrame?.();
  window.electron.ipcRenderer.off('window-background:changed', onWindowBackgroundChanged);
  window.removeEventListener('focus', scheduleClipboardShareCheck);
  window.removeEventListener(SHARE_COPIED_EVENT, handleShareCopied);
  if (silentUpdateCheckTimer !== null) {
    window.clearTimeout(silentUpdateCheckTimer);
    silentUpdateCheckTimer = null;
  }
  if (clipboardShareCheckTimer !== null) {
    window.clearTimeout(clipboardShareCheckTimer);
    clipboardShareCheckTimer = null;
  }
  clearCloudAudioIndexWarmupTimer();
  updateStore.dispose();
  disposeShortcuts?.();
  disposeShortcuts = null;
  disposeDesktopLyricSync?.();
  disposeDesktopLyricSync = null;
  disposeMiniPlayerSync?.();
  disposeMiniPlayerSync = null;
  disposeNowPlayingSync?.();
  disposeNowPlayingSync = null;
  disposeTrayPlayModeSync?.();
  disposeTrayPlayModeSync = null;
  disposePowerResumeSync?.();
  disposePowerResumeSync = null;
  disposePluginRuntimeReload?.();
  disposePluginRuntimeReload = null;
  disposeShareOpen?.();
  disposeShareOpen = null;
  disposeContentBlacklistIntegration?.();
  disposeContentBlacklistIntegration = null;
  disposeTaskBridges?.();
  disposeTaskBridges = null;
  colorSchemeMediaQuery?.removeEventListener('change', updateTheme);
  colorSchemeMediaQuery = null;
});

watch(
  () => route.name,
  (toName, fromName) => {
    suppressRootTransition.value = fromName === 'loading' && toName !== 'loading';
    flushPendingShareTarget();
  },
);

watch(
  () => [settings.customBackgroundImage, settings.customBackgroundTextColor] as const,
  ([img, color]) => {
    document.documentElement.classList.remove('custom-bg-text-dark', 'custom-bg-text-light');
    if (img && color === 'dark') document.documentElement.classList.add('custom-bg-text-dark');
    if (img && color === 'light') document.documentElement.classList.add('custom-bg-text-light');
  },
  { immediate: true },
);
watch(
  () => settings.theme,
  () => {
    if (!isMiniPlayerRoute.value) updateTheme();
  },
);
watch(
  () => settings.floatingSurfaceFrosted,
  (enabled) => {
    document.documentElement.classList.toggle('floating-surfaces-frosted', enabled === true);
  },
  { immediate: true },
);
watch(
  () => settings.globalFont,
  () => {
    if (!isMiniPlayerRoute.value) applyGlobalFont();
  },
);
watch(
  () => settings.rememberWindowSize,
  () => {
    if (!isMiniPlayerRoute.value) settings.syncRememberWindowSize();
  },
);
watch(
  () => settings.preventSleep,
  () => {
    if (!isMiniPlayerRoute.value) settings.syncPreventSleep(player.value?.isPlaying ?? false);
  },
);
watch(
  () => player.value?.isPlaying ?? false,
  (isPlaying) => {
    if (isMiniPlayerRoute.value) return;
    settings.syncPreventSleep(isPlaying);
    syncTrayPlayback();
  },
);
watch(
  () => [userStore.isLoggedIn, currentUserKey.value] as const,
  ([loggedIn, userKey]) => {
    contentBlacklistStore.reset();
    if (loggedIn) {
      if (userKey && loadedCloudUserKey && loadedCloudUserKey !== userKey) {
        playlistStore.resetUserCollections();
      }
      if (userKey) {
        loadedCloudUserKey = userKey;
      }
      scheduleCloudAudioIndexWarmup();
    } else {
      loadedCloudUserKey = '';
      playlistStore.resetUserCollections();
      clearCloudAudioIndexWarmupTimer();
      clearCloudAudioIndex();
    }
  },
  { immediate: true },
);
watch(
  () => player.value?.playMode,
  () => {
    if (!isMiniPlayerRoute.value) syncTrayPlayback();
  },
);
watch(
  () => player.value?.volume,
  () => {
    if (!isMiniPlayerRoute.value) syncTrayPlayback();
  },
);
watch(
  () => [
    settings.globalShortcutsEnabled,
    settings.globalShortcutBindings,
    settings.shortcutEnabled,
    settings.shortcutBindings,
  ],
  () => {
    if (!isMiniPlayerRoute.value) void syncGlobalShortcutsFn?.();
  },
  { deep: true },
);

watch(
  () => [player.value?.currentTrackSnapshot?.coverUrl, coverFallbackRevision.value],
  () => {
    if (isMiniPlayerRoute.value) return;
    const coverColorUrls = currentCoverColorUrls.value;
    if (themeStore.accentMode === 'cover') {
      void themeStore.refreshFromCover(coverColorUrls);
      return;
    }
    void themeStore.refreshCoverColor(coverColorUrls);
  },
  { immediate: true },
);

watch(
  () => themeStore.accentMode,
  (mode) => {
    if (isMiniPlayerRoute.value) return;
    if (mode !== 'cover') return;
    void themeStore.refreshFromCover(currentCoverColorUrls.value);
  },
);
</script>

<template>
  <TooltipScope>
    <!-- 自定义背景图层 -->
    <div
      v-if="settings.customBackgroundImage && !isMiniPlayerRoute"
      class="custom-background-layer"
      :style="{
        backgroundImage: `url(${settings.customBackgroundImage})`,
        '--bg-overlay': (settings.customBackgroundOverlay / 100).toString(),
      }"
    ></div>
    <RouterView v-slot="{ Component, route }">
      <Transition
        :name="rootPageTransitionName"
        :mode="rootPageTransitionMode"
        :appear="rootPageTransitionAppear"
      >
        <RouteErrorBoundary :key="rootPageTransitionKey" :route="route">
          <component :is="Component" />
        </RouteErrorBoundary>
      </Transition>
    </RouterView>
    <Teleport v-if="!isMiniPlayerRoute" to="body">
      <Transition
        name="lyric-overlay"
        @before-enter="(el) => el.removeAttribute('data-leaving')"
        @before-leave="(el) => el.setAttribute('data-leaving', '')"
      >
        <div v-if="player?.isLyricViewOpen" class="lyric-overlay-host">
          <LyricView />
        </div>
      </Transition>
    </Teleport>
    <AuthExpiredDialog v-if="!isMiniPlayerRoute" />
    <KugouVerificationFlow v-if="!isMiniPlayerRoute" />
    <ToastViewport v-if="!isMiniPlayerRoute" :lyric-view-open="Boolean(player?.isLyricViewOpen)" />
    <UpdateDialog v-if="!isMiniPlayerRoute" dismiss-label="稍后" />
    <SettingsDialog v-if="!isMiniPlayerRoute" />
  </TooltipScope>

  <!-- 输入 dake 彩蛋（远程开关 + 上报 + 红色飘雪） -->
  <Teleport to="body">
    <div v-if="dakeEggOpen" class="dake-egg-overlay">
      <div
        v-for="piece in dakeConfetti"
        :key="piece.id"
        class="dake-snowflake"
        :style="{
          left: piece.x + 'vw',
          width: piece.size + 'px',
          height: piece.size + 'px',
          backgroundColor: piece.color,
          color: piece.color,
          animationDelay: piece.delay + 's',
          animationDuration: piece.duration + 's',
        }"
      ></div>
      <div class="dake-egg-popup">
        <img
          src="/zhenzhu/dakekf.gif"
          alt="开发者彩蛋"
          class="dake-egg-media"
        />
        <div class="dake-egg-popup-title">恭喜你触发，开发者彩蛋！</div>
        <div class="dake-egg-popup-text">联系开发者，请发送设备IP！</div>
        <div class="dake-egg-popup-text">路径:设置>实验>用户>设备IP</div>
        <div class="dake-egg-popup-qq">QQ：983064062</div>
        <button class="dake-egg-confirm" @click="closeDakeEgg">确定</button>
      </div>
    </div>
  </Teleport>
</template>

<style>
.lyric-overlay-host {
  position: fixed;
  inset: 0;
  z-index: 1300;
}

.lyric-overlay-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
  backface-visibility: hidden;
}

.lyric-overlay-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.6, 1),
    opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
  will-change: transform, opacity;
  backface-visibility: hidden;
}

.lyric-overlay-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.lyric-overlay-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

html,
body,
#app {
  background-color: transparent !important;
}
.main-layout,
.main-content,
.content-panel {
  background-color: transparent !important;
}
.sidebar,
.app-sidebar,
.nav-sidebar,
aside[class*='sidebar'],
.player-bar,
footer[class*='player'] {
  background-color: rgba(255, 255, 255, 0.78) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.dark .sidebar,
.dark .app-sidebar,
.dark .nav-sidebar,
.dark aside[class*='sidebar'],
.dark .player-bar,
.dark footer[class*='player'] {
  background-color: rgba(30, 30, 35, 0.78) !important;
}

.custom-background-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
}
.custom-background-layer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, var(--bg-overlay, 0.4));
  pointer-events: none;
}

.custom-bg-text-dark {
  --color-text-main: #1a1a1a !important;
  --color-text-secondary: #525252 !important;
}
.custom-bg-text-light {
  --color-text-main: #f5f5f5 !important;
  --color-text-secondary: #a3a3a3 !important;
}

/* ===== 输入 dake 彩蛋 ===== */
.dake-egg-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 99999;
  overflow: hidden;
}
.dake-snowflake {
  position: absolute;
  top: -20px;
  border-radius: 50%;
  opacity: 0.9;
  pointer-events: none;
  box-shadow: 0 0 5px currentColor, 0 0 10px currentColor;
  animation: dake-snow-fall linear forwards;
}
@keyframes dake-snow-fall {
  0% {
    transform: translate3d(0, 0, 0) rotate(0deg);
    opacity: 0;
  }
  12% {
    opacity: 0.95;
  }
  100% {
    transform: translate3d(30px, 115vh, 0) rotate(360deg);
    opacity: 0.4;
  }
}
.dake-egg-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 20, 30, 0.95);
  border: 2px solid rgba(255, 215, 0, 0.6);
  border-radius: 16px;
  padding: 24px 32px;
  text-align: center;
  z-index: 100000;
  box-shadow: 0 0 40px rgba(255, 215, 0, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: dake-popup-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  pointer-events: auto;
  max-width: 90vw;
}
@keyframes dake-popup-in {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.dake-egg-media {
  max-width: 100%;
  max-height: 50vh;
  border-radius: 8px;
  margin-bottom: 16px;
  display: block;
}
.dake-egg-popup-title {
  font-size: 24px;
  font-weight: 900;
  color: #ffd700;
  margin-bottom: 12px;
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
}
.dake-egg-popup-text {
  font-size: 14px;
  color: #e0e0e0;
  margin-bottom: 8px;
}
.dake-egg-popup-qq {
  font-size: 20px;
  font-weight: 700;
  color: #00d4ff;
  letter-spacing: 2px;
  text-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
}
.dake-egg-confirm {
  margin-top: 20px;
  padding: 10px 48px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ff4d4d, #e60000);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  letter-spacing: 4px;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px rgba(230, 0, 0, 0.4);
}
.dake-egg-confirm:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(230, 0, 0, 0.55);
}
.dake-egg-confirm:active {
  transform: translateY(0);
}
</style>
