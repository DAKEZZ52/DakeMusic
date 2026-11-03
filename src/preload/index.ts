import { contextBridge, ipcRenderer, webFrame } from 'electron';
import log from 'electron-log/renderer';
import type { ApiServerStatus } from '../shared/apiServer';
import type { AppInfoResult, UpdateDownloadResult, UpdateState } from '../shared/app';
import type { PlayMode } from '../shared/playback';
import type { TrackTransitionPlaybackInfo } from '../shared/trackTransition';
import type { SleepTimerAction, SleepTimerActionResult } from '../shared/sleepTimer';
import type { ShortcutRegistrationRequest, ShortcutRegistrationResult } from '../shared/shortcuts';
import type {
  DesktopLyricCommand,
  DesktopLyricClientRect,
  DesktopLyricSettings,
  DesktopLyricSnapshot,
  DesktopLyricSnapshotMessage,
  DesktopLyricSnapshotPatch,
  DesktopLyricWindowBoundsUpdate,
} from '../shared/desktopLyric';
import { isWaylandWindowingBackend } from '../shared/windowing';
import type {
  NowPlayingCommand,
  NowPlayingSnapshot,
  NowPlayingSnapshotPatch,
} from '../shared/nowPlaying';
import type {
  MiniPlayerCommand,
  MiniPlayerSnapshot,
  MiniPlayerSnapshotPatch,
} from '../shared/miniPlayer';
import {
  DOWNLOAD_IPC_CHANNELS,
  type DownloadCreateRequest,
  type DownloadEvent,
  type DownloadSettings,
  type DownloadTaskSnapshot,
} from '../shared/download';
import {
  SEPARATOR_IPC_CHANNELS,
  type SeparatorPcmInput,
  type SeparatorProgress,
  type SeparatorModelInfo,
  type SeparatorOutput,
  type SeparatorResult,
} from '../shared/separator';
import type { LocalMusicAddFilesResult, LocalMusicLibrary } from '../shared/localMusic';
import type {
  AudioEffectPlaybackOptions,
  DownloadCommunityAudioEffectRequest,
  DownloadCommunityAudioEffectResult,
  DspProviderRecord,
  ImportImpulseResponseResult,
  SpatialAudioEffectEntry,
} from '../shared/audio';
import type {
  AudioSpectrumFrame,
  AudioSpectrumOptions,
  AudioSpectrumStatus,
  AudioSpectrumSubscribeResult,
} from '../shared/audioSpectrum';
import type { LogSettings } from '../shared/logging';
import type { NetworkSettingsState, NetworkSettingsUpdateRequest } from '../shared/network';
import type {
  SettingsBackupExportRequest,
  SettingsBackupExportResult,
  SettingsBackupImportRequest,
  SettingsBackupImportResult,
  SettingsBackupInspectResult,
} from '../shared/settingsBackup';
import type { PlayerErrorPayload } from '../shared/playerError';
import type {
  PlayerAudioGraphParameterPatch,
  PlayerAudioGraphPlanPatch,
  PlayerAudioGraphSnapshot,
} from '../shared/playerAudioGraph';
import type { ResolvePlaylistRequest, ResolvePlaylistResponse } from '../shared/external';
import type {
  RecognizeCaptureRequest,
  RecognizeCaptureStatus,
  RecognizeInputDevice,
} from '../shared/recognize';
import type { ShareCaptureRect, ShareTarget } from '../shared/share';
import type {
  DiagnosticsAppProcessMetric,
  DiagnosticsMemorySnapshot,
  DiagnosticsNodeMemory,
  DiagnosticsResourceUsage,
  DiagnosticsResourceUsageEntry,
} from '../shared/diagnostics';
import type {
  CloudPickFilesResult,
  CloudPickMode,
  CloudReadUploadFileDataResult,
} from '../shared/cloud';
import type {
  StorageAppendQueueItemsPayload,
  StorageHistoryEntry,
  StorageHistoryGetEntriesPayload,
  StorageHistoryRecordPlayPayload,
  StorageHistoryRemoveEntriesPayload,
  StoragePlaybackSnapshot,
  StoragePlaybackQueueState,
  StorageQueueIdPayload,
  StorageReplaceQueuePayload,
  StorageRemoveQueueItemPayload,
  StorageReorderQueueItemsPayload,
  StorageResetResult,
  StorageSetQueueCurrentTrackPayload,
  StorageUpdateQueueMetaPayload,
} from '../shared/storage';

const ipcListenerMap = new Map<
  string,
  WeakMap<(...args: any[]) => void, (...args: any[]) => void>
>();
const RENDERER_CONSOLE_LOG_LEVEL = 'info';

log.transports.console.level = RENDERER_CONSOLE_LOG_LEVEL;

const getWrappedListener = (channel: string, func: (...args: any[]) => void) => {
  let channelMap = ipcListenerMap.get(channel);
  if (!channelMap) {
    channelMap = new WeakMap();
    ipcListenerMap.set(channel, channelMap);
  }

  const existing = channelMap.get(func);
  if (existing) return existing;

  const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) => func(...args);
  channelMap.set(func, wrapped);
  return wrapped;
};

const toMbFromKb = (kb: unknown) =>
  typeof kb === 'number' && Number.isFinite(kb) ? Math.round((kb / 1024) * 10) / 10 : null;

const toMbFromBytes = (bytes: unknown) =>
  typeof bytes === 'number' && Number.isFinite(bytes)
    ? Math.round((bytes / 1024 / 1024) * 10) / 10
    : null;

const getRendererProcessMemory = async () => {
  try {
    const info = (await process.getProcessMemoryInfo()) as unknown as Record<
      string,
      number | undefined
    >;
    const privateMb = toMbFromKb(info.private ?? info.privateBytes);
    const sharedMb = toMbFromKb(info.shared ?? info.sharedBytes);
    return {
      workingSetMb: toMbFromKb(info.workingSetSize),
      peakWorkingSetMb: toMbFromKb(info.peakWorkingSetSize),
      privateMb,
      sharedMb,
      residentSetMb: toMbFromKb(info.residentSet),
    };
  } catch {
    return null;
  }
};

const getPerformanceMemory = () => {
  const memory = (
    performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
        totalJSHeapSize?: number;
        jsHeapSizeLimit?: number;
      };
    }
  ).memory;
  if (!memory) return null;
  return {
    usedJsHeapMb: toMbFromBytes(memory.usedJSHeapSize),
    totalJsHeapMb: toMbFromBytes(memory.totalJSHeapSize),
    jsHeapLimitMb: toMbFromBytes(memory.jsHeapSizeLimit),
  };
};

const getRendererNodeMemory = (): DiagnosticsNodeMemory | null => {
  try {
    if (typeof process.memoryUsage !== 'function') return null;
    const usage = process.memoryUsage();
    return {
      rssMb: toMbFromBytes(usage.rss),
      heapTotalMb: toMbFromBytes(usage.heapTotal),
      heapUsedMb: toMbFromBytes(usage.heapUsed),
      externalMb: toMbFromBytes(usage.external),
      arrayBuffersMb: toMbFromBytes(usage.arrayBuffers),
    };
  } catch {
    return null;
  }
};

const normalizeResourceUsageEntry = (value: unknown): DiagnosticsResourceUsageEntry => {
  const record =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : Object.create(null);
  return {
    count: typeof record.count === 'number' ? record.count : null,
    sizeMb: toMbFromBytes(record.size),
    liveSizeMb: toMbFromBytes(record.liveSize),
  };
};

const getResourceUsage = (): DiagnosticsResourceUsage | null => {
  try {
    const usage = webFrame.getResourceUsage() as unknown as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(usage).map(([key, value]) => [key, normalizeResourceUsageEntry(value)]),
    );
  } catch {
    return null;
  }
};

const toPlainIpcPayload = <T>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;

  const seen = new WeakSet<object>();
  return JSON.parse(
    JSON.stringify(value, (_key, nextValue) => {
      if (typeof nextValue === 'bigint') return nextValue.toString();
      if (typeof nextValue !== 'object' || nextValue === null) return nextValue;
      if (seen.has(nextValue)) return undefined;
      seen.add(nextValue);
      return nextValue;
    }),
  ) as T;
};

// 渲染层允许直接调用的通道白名单。
// 页面只能通过这里的通道访问主进程，未知通道一律丢弃并记录日志，
// 避免页面被注入后拿到全部已注册能力。
const RENDERER_CHANNEL_ALLOWLIST = new Set<string>([
  'window:zoom-set',
  'thumbar:update-play-state',
  'window-background:get',
  'window-background:set',
  'open-log-directory',
  'clear-app-data',
  'check-for-updates',
  'open-external',
  'open-disclaimer',
  'update-close-behavior',
  'update-theme',
  'update-remember-window-size',
  'update-power-save-blocker',
  'update-high-dpi-settings',
  'update-auto-launch',
  'update-start-minimized',
  'update-taskbar-cover-preview',
  'update-taskbar-progress',
  'update-devtools-enabled',
  'logging:update-settings',
  'settings:setStartupSound',
  'window-toggle',
  'quit-app',
  'window:lyric-visibility',
  'window-background:diagnostics',
]);

const isChannelAllowed = (channel: string): boolean => {
  if (RENDERER_CHANNEL_ALLOWLIST.has(channel)) return true;
  console.warn('[preload] blocked IPC channel:', channel);
  return false;
};
const invokeWithPlainPayload = <T = unknown>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args.map(toPlainIpcPayload)) as Promise<T>;

let audioSpectrumSubscriptionSeq = 0;

const sendWithPlainPayload = (channel: string, ...args: unknown[]) => {
  ipcRenderer.send(channel, ...args.map(toPlainIpcPayload));
};

const isWayland = isWaylandWindowingBackend();

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isWayland,
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      if (!isChannelAllowed(channel)) return;
      sendWithPlainPayload(channel, ...args);
    },
    invoke: (channel: string, ...args: any[]) => {
      if (!isChannelAllowed(channel)) {
        return Promise.reject(new Error(`blocked IPC channel: ${channel}`));
      }
      return invokeWithPlainPayload(channel, ...args);
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      const wrapped = getWrappedListener(channel, func);
      ipcRenderer.on(channel, wrapped);
    },
    off: (channel: string, func: (...args: any[]) => void) => {
      const wrapped = ipcListenerMap.get(channel)?.get(func);
      if (wrapped) {
        ipcRenderer.removeListener(channel, wrapped);
      }
    },
  },
  shortcuts: {
    register: (payload: ShortcutRegistrationRequest) =>
      invokeWithPlainPayload<ShortcutRegistrationResult>('shortcuts:register', payload),
    refresh: () => ipcRenderer.invoke('shortcuts:refresh') as Promise<ShortcutRegistrationResult>,
    setLocalEditableActive: (active: boolean) =>
      ipcRenderer.invoke('shortcuts:set-local-editable-active', active),
    onTrigger: (func: (command: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: string) => func(command);
      ipcRenderer.on('shortcut-trigger', listener);
      return () => ipcRenderer.removeListener('shortcut-trigger', listener);
    },
  },
  windowControl: (action: 'minimize' | 'maximize' | 'close' | 'fullscreen' | 'attention') =>
    ipcRenderer.send('window-control', action),
  appInfo: {
    get: () => ipcRenderer.invoke('app:get-info') as Promise<AppInfoResult>,
    getChangelog: () => ipcRenderer.invoke('app:get-changelog') as Promise<string>,
    relaunch: () => ipcRenderer.invoke('app:relaunch') as Promise<boolean>,
    onOpenSettings: (func: () => void) => {
      const listener = () => func();
      ipcRenderer.on('app:open-settings', listener);
      return () => ipcRenderer.removeListener('app:open-settings', listener);
    },
  },
  share: {
    copy: (text: string) => ipcRenderer.invoke('share:copy', text) as Promise<boolean>,
    readClipboard: () => ipcRenderer.invoke('share:read-clipboard') as Promise<string>,
    captureRectToClipboard: (rect: ShareCaptureRect) =>
      invokeWithPlainPayload<boolean>('share:capture-rect-to-clipboard', rect),
    onOpen: (func: (target: ShareTarget) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, target: ShareTarget) => func(target);
      ipcRenderer.on('share:open', listener);
      return () => ipcRenderer.removeListener('share:open', listener);
    },
  },
  fonts: {
    getAll: () => ipcRenderer.invoke('get-all-fonts') as Promise<string[]>,
  },
  audioEffects: {
    importImpulseResponse: () =>
      ipcRenderer.invoke('audio:import-impulse-response') as Promise<ImportImpulseResponseResult>,
    downloadCommunityAudioEffect: (payload: DownloadCommunityAudioEffectRequest) =>
      invokeWithPlainPayload<DownloadCommunityAudioEffectResult>(
        'audio:download-community-audio-effect',
        payload,
      ),
    deleteAudioEffect: (filePath: string) =>
      ipcRenderer.invoke('audio:delete-audio-effect', filePath) as Promise<boolean>,
    reconcileAudioEffects: (files: SpatialAudioEffectEntry[]) =>
      invokeWithPlainPayload<SpatialAudioEffectEntry[]>('audio:reconcile-audio-effects', files),
  },
  updater: {
    download: () => ipcRenderer.send('update:download'),
    cancelDownload: () => ipcRenderer.send('update:cancel-download'),
    install: (silent?: boolean) => ipcRenderer.invoke('update:install', { silent: !!silent }),
    getState: () => ipcRenderer.invoke('update:get-state') as Promise<UpdateState>,
    onDownloadStatus: (func: (result: UpdateDownloadResult) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: UpdateDownloadResult) =>
        func(result);
      ipcRenderer.on('update-download-status', listener);
      return () => ipcRenderer.removeListener('update-download-status', listener);
    },
  },
  apiServer: {
    start: () => ipcRenderer.invoke('api-server:start'),
    status: () => ipcRenderer.invoke('api-server:status') as Promise<ApiServerStatus>,
    identity: () =>
      ipcRenderer.invoke('device:identity') as Promise<{
        guid: string;
        mac: string;
        serverDev: string;
        mid: string;
      }>,
  },
  download: {
    create: (payload: DownloadCreateRequest) =>
      invokeWithPlainPayload<DownloadTaskSnapshot>(DOWNLOAD_IPC_CHANNELS.create, payload),
    list: () => invokeWithPlainPayload<DownloadTaskSnapshot[]>(DOWNLOAD_IPC_CHANNELS.list),
    pause: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.pause, id),
    resume: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.resume, id),
    cancel: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.cancel, id),
    remove: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.remove, id),
    retry: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.retry, id),
    clearFinished: () => invokeWithPlainPayload<number>(DOWNLOAD_IPC_CHANNELS.clearFinished),
    getSettings: () => invokeWithPlainPayload<DownloadSettings>(DOWNLOAD_IPC_CHANNELS.getSettings),
    updateSettings: (patch: Partial<DownloadSettings>) =>
      invokeWithPlainPayload<DownloadSettings>(DOWNLOAD_IPC_CHANNELS.updateSettings, patch),
    chooseSaveDir: () => invokeWithPlainPayload<string>(DOWNLOAD_IPC_CHANNELS.chooseSaveDir),
    openFile: (id: string) => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.openFile, id),
    openFolder: (id: string) =>
      invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.openFolder, id),
    openSaveDir: () => invokeWithPlainPayload<boolean>(DOWNLOAD_IPC_CHANNELS.openSaveDir),
    onEvent: (func: (event: DownloadEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: DownloadEvent) => func(event);
      ipcRenderer.on(DOWNLOAD_IPC_CHANNELS.event, listener);
      return () => ipcRenderer.removeListener(DOWNLOAD_IPC_CHANNELS.event, listener);
    },
  },
  // 本地音乐库：扫描本地文件夹建库、持久化缓存与曲库管理。
  localMusic: {
    listLibraries: () => invokeWithPlainPayload<LocalMusicLibrary[]>('local-music:list-libraries'),
    pickFolder: () => invokeWithPlainPayload<string | null>('local-music:pick-folder'),
    addLibrary: (root: string) =>
      invokeWithPlainPayload<LocalMusicLibrary>('local-music:add-library', root),
    removeLibrary: (id: string) =>
      invokeWithPlainPayload<boolean>('local-music:remove-library', id),
    rescanLibrary: (id: string) =>
      invokeWithPlainPayload<LocalMusicLibrary>('local-music:rescan-library', id),
    addFiles: () => invokeWithPlainPayload<LocalMusicAddFilesResult>('local-music:add-files'),
    removeFiles: (filePaths: string[]) =>
      invokeWithPlainPayload<boolean>('local-music:remove-files', filePaths),
    fileExists: (filePath: string) =>
      invokeWithPlainPayload<boolean>('local-music:file-exists', filePath),
  },
  // 人声分离：模型可独立下载（在分离模型区单独触发）；分离后自动写入已设置的保存位置。
  separator: {
    listModels: () =>
      invokeWithPlainPayload<SeparatorModelInfo[]>(SEPARATOR_IPC_CHANNELS.listModels),
    downloadModel: (modelId: string) =>
      invokeWithPlainPayload<boolean>(SEPARATOR_IPC_CHANNELS.downloadModel, { modelId }),
    start: (modelId: string, input: SeparatorPcmInput) =>
      // 不走 invokeWithPlainPayload：其 JSON 序列化会把 Float32Array 压成
      // 只有索引键、没有 length 的普通对象，主进程将收到「音频数据为空」。
      // Electron IPC 结构化克隆原生支持 TypedArray，直接 invoke 即可原样传输。
      ipcRenderer.invoke(SEPARATOR_IPC_CHANNELS.start, {
        modelId,
        input,
      }) as Promise<SeparatorResult>,
    save: (cacheId: string, dir: string) =>
      invokeWithPlainPayload<SeparatorOutput>(SEPARATOR_IPC_CHANNELS.save, {
        cacheId,
        dir,
      }),
    getDefaultSaveDir: () =>
      invokeWithPlainPayload<string>(SEPARATOR_IPC_CHANNELS.getDefaultSaveDir),
    pickSaveDir: () => invokeWithPlainPayload<string | null>(SEPARATOR_IPC_CHANNELS.pickSaveDir),
    getModelDir: () => invokeWithPlainPayload<string>(SEPARATOR_IPC_CHANNELS.getModelDir),
    pickModelDir: () => invokeWithPlainPayload<string | null>(SEPARATOR_IPC_CHANNELS.pickModelDir),
    revealDir: (dir: string) =>
      invokeWithPlainPayload<boolean>(SEPARATOR_IPC_CHANNELS.revealDir, { dir }),
    onProgress: (func: (progress: SeparatorProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: SeparatorProgress) =>
        func(progress);
      ipcRenderer.on(SEPARATOR_IPC_CHANNELS.progress, listener);
      return () => ipcRenderer.removeListener(SEPARATOR_IPC_CHANNELS.progress, listener);
    },
  },
  diagnostics: {
    getMemory: async (label?: string): Promise<DiagnosticsMemorySnapshot> => ({
      capturedAt: Date.now(),
      label,
      rendererPid: process.pid,
      renderer: await getRendererProcessMemory(),
      rendererNode: getRendererNodeMemory(),
      performance: getPerformanceMemory(),
      resources: getResourceUsage(),
      appProcesses: (await ipcRenderer.invoke(
        'diagnostics:get-app-memory',
      )) as DiagnosticsAppProcessMetric[],
    }),
  },
  api: {
    request: (config: {
      method: string;
      url: string;
      params?: Record<string, any>;
      data?: any;
      headers?: Record<string, string>;
    }) => {
      const data = config?.data;
      // 二进制 body（如听歌识曲 PCM）经 JSON 序列化会被破坏，需保留原始引用。
      // ArrayBuffer.isView 与 toString tag 在 contextBridge 跨上下文场景下比
      // `instanceof` 更可靠；命中后仅对其余字段做普通序列化，data 走结构化克隆透传。
      const isBinary =
        !!data &&
        typeof data === 'object' &&
        (ArrayBuffer.isView(data) ||
          data instanceof ArrayBuffer ||
          Object.prototype.toString.call(data) === '[object ArrayBuffer]');
      if (isBinary) {
        const { data: _binary, ...rest } = config;
        void _binary;
        return ipcRenderer.invoke('api:request', { ...toPlainIpcPayload(rest), data });
      }
      return invokeWithPlainPayload('api:request', config);
    },
  },
  cloud: {
    pickUploadFiles: (mode: CloudPickMode, multi?: boolean) =>
      ipcRenderer.invoke(
        'cloud:pick-upload-files',
        mode,
        multi ?? true,
      ) as Promise<CloudPickFilesResult>,
    readUploadFileData: (filePath: string) =>
      ipcRenderer.invoke(
        'cloud:read-upload-file-data',
        filePath,
      ) as Promise<CloudReadUploadFileDataResult>,
    clearUploadFiles: () => ipcRenderer.invoke('cloud:clear-upload-files') as Promise<{ ok: true }>,
  },
  tray: {
    syncPlayback: (payload: { isPlaying?: boolean; playMode?: PlayMode; volume?: number }) =>
      sendWithPlainPayload('tray:sync-playback', payload),
    onSetPlayMode: (func: (playMode: PlayMode) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, playMode: PlayMode) => func(playMode);
      ipcRenderer.on('tray:set-play-mode', listener);
      return () => ipcRenderer.removeListener('tray:set-play-mode', listener);
    },
  },
  power: {
    executeSleepTimerAction: (action: Exclude<SleepTimerAction, 'pause'>) =>
      ipcRenderer.invoke('sleep-timer:execute-action', action) as Promise<SleepTimerActionResult>,
    onResume: (func: () => void) => {
      const listener = () => func();
      ipcRenderer.on('power:resume', listener);
      return () => ipcRenderer.removeListener('power:resume', listener);
    },
  },
  desktopLyric: {
    getSnapshot: () =>
      ipcRenderer.invoke('desktop-lyric:get-snapshot') as Promise<DesktopLyricSnapshot>,
    getSessionNonce: () =>
      ipcRenderer.invoke('desktop-lyric:get-session-nonce') as Promise<string | null>,
    getWindow: () =>
      ipcRenderer.invoke('desktop-lyric:get-window') as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>,
    getHover: () => ipcRenderer.invoke('desktop-lyric:get-hover') as Promise<boolean>,
    show: () => ipcRenderer.invoke('desktop-lyric:show') as Promise<DesktopLyricSnapshot>,
    hide: () => ipcRenderer.invoke('desktop-lyric:hide') as Promise<DesktopLyricSnapshot>,
    toggleLock: () =>
      ipcRenderer.invoke('desktop-lyric:toggle-lock') as Promise<DesktopLyricSnapshot>,
    updateSettings: (payload: Partial<DesktopLyricSettings>) =>
      invokeWithPlainPayload<DesktopLyricSnapshot>('desktop-lyric:update-settings', payload),
    updateWindow: (payload: DesktopLyricWindowBoundsUpdate) =>
      invokeWithPlainPayload<{ x: number; y: number; width: number; height: number }>(
        'desktop-lyric:update-window',
        payload,
      ),
    startDrag: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:start-drag', sessionId) as Promise<boolean>,
    move: (sessionId: string, x: number, y: number) =>
      ipcRenderer.send('desktop-lyric:move', sessionId, x, y),
    startResize: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:start-resize', sessionId) as Promise<boolean>,
    resize: (sessionId: string, payload: Required<DesktopLyricWindowBoundsUpdate>) =>
      sendWithPlainPayload('desktop-lyric:resize', sessionId, payload),
    endDrag: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:end-drag', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>,
    endResize: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:end-resize', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>,
    cancelResize: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:cancel-resize', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>,
    cancelDrag: (sessionId: string) =>
      ipcRenderer.invoke('desktop-lyric:cancel-drag', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>,
    onCancelDrag: (
      func: (bounds: { x: number; y: number; width: number; height: number } | null) => void,
    ) => {
      const listener = (_event: Electron.IpcRendererEvent, bounds: unknown) =>
        func(bounds as { x: number; y: number; width: number; height: number } | null);
      ipcRenderer.on('desktop-lyric:cancel-drag', listener);
      return () => ipcRenderer.removeListener('desktop-lyric:cancel-drag', listener);
    },
    onCancelResize: (
      func: (bounds: { x: number; y: number; width: number; height: number } | null) => void,
    ) => {
      const listener = (_event: Electron.IpcRendererEvent, bounds: unknown) =>
        func(bounds as { x: number; y: number; width: number; height: number } | null);
      ipcRenderer.on('desktop-lyric:cancel-resize', listener);
      return () => ipcRenderer.removeListener('desktop-lyric:cancel-resize', listener);
    },
    syncSnapshot: (payload: DesktopLyricSnapshotPatch) =>
      sendWithPlainPayload('desktop-lyric:sync-snapshot', payload),
    onSnapshot: (func: (snapshot: DesktopLyricSnapshotMessage) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        snapshotPayload: DesktopLyricSnapshotMessage,
      ) => func(snapshotPayload);
      ipcRenderer.on('desktop-lyric:snapshot', listener);
      return () => ipcRenderer.removeListener('desktop-lyric:snapshot', listener);
    },
    setIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.send('desktop-lyric:set-ignore-mouse-events', ignore),
    setUnlockButtonBounds: (payload: DesktopLyricClientRect | null) =>
      sendWithPlainPayload('desktop-lyric:set-unlock-button-bounds', payload),
    onHover: (func: (hovered: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, hovered: boolean) => func(hovered);
      ipcRenderer.on('desktop-lyric:hover', listener);
      return () => ipcRenderer.removeListener('desktop-lyric:hover', listener);
    },
    command: (command: DesktopLyricCommand) => ipcRenderer.send('desktop-lyric:command', command),
  },
  nowPlaying: {
    getSnapshot: () =>
      ipcRenderer.invoke('now-playing:get-snapshot') as Promise<NowPlayingSnapshot>,
    syncSnapshot: (payload: NowPlayingSnapshotPatch) =>
      sendWithPlainPayload('now-playing:sync-snapshot', payload),
    onSnapshot: (func: (snapshot: NowPlayingSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshotPayload: NowPlayingSnapshot) =>
        func(snapshotPayload);
      ipcRenderer.on('now-playing:snapshot', listener);
      return () => ipcRenderer.removeListener('now-playing:snapshot', listener);
    },
    command: (command: NowPlayingCommand) => ipcRenderer.send('now-playing:command', command),
    onCommand: (func: (command: NowPlayingCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: NowPlayingCommand) =>
        func(command);
      ipcRenderer.on('now-playing:command', listener);
      return () => ipcRenderer.removeListener('now-playing:command', listener);
    },
  },
  miniPlayer: {
    getSnapshot: () =>
      ipcRenderer.invoke('mini-player:get-snapshot') as Promise<MiniPlayerSnapshot>,
    show: () => ipcRenderer.invoke('mini-player:show') as Promise<MiniPlayerSnapshot>,
    hide: () => ipcRenderer.invoke('mini-player:hide') as Promise<MiniPlayerSnapshot>,
    toggle: () => ipcRenderer.invoke('mini-player:toggle') as Promise<MiniPlayerSnapshot>,
    syncSnapshot: (payload: MiniPlayerSnapshotPatch) =>
      sendWithPlainPayload('mini-player:sync-snapshot', payload),
    setExpanded: (expanded: boolean) =>
      ipcRenderer.invoke('mini-player:set-expanded', expanded) as Promise<MiniPlayerSnapshot>,
    setAlwaysOnTop: (alwaysOnTop: boolean) =>
      ipcRenderer.invoke(
        'mini-player:set-always-on-top',
        alwaysOnTop,
      ) as Promise<MiniPlayerSnapshot>,
    getBounds: () =>
      ipcRenderer.invoke('mini-player:get-bounds') as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>,
    startDrag: (sessionId: string) =>
      ipcRenderer.invoke('mini-player:start-drag', sessionId) as Promise<boolean>,
    move: (sessionId: string, x: number, y: number) =>
      ipcRenderer.send('mini-player:move', sessionId, x, y),
    endDrag: (sessionId: string) =>
      ipcRenderer.invoke('mini-player:end-drag', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>,
    cancelDrag: (sessionId: string) =>
      ipcRenderer.invoke('mini-player:cancel-drag', sessionId) as Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>,
    applyExpandBounds: () =>
      ipcRenderer.invoke('mini-player:apply-expand-bounds') as Promise<MiniPlayerSnapshot>,
    onSnapshot: (func: (snapshot: MiniPlayerSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshotPayload: MiniPlayerSnapshot) =>
        func(snapshotPayload);
      ipcRenderer.on('mini-player:snapshot', listener);
      return () => ipcRenderer.removeListener('mini-player:snapshot', listener);
    },
    command: (command: MiniPlayerCommand) => ipcRenderer.send('mini-player:command', command),
    onCommand: (func: (command: MiniPlayerCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: MiniPlayerCommand) =>
        func(command);
      ipcRenderer.on('mini-player:command', listener);
      return () => ipcRenderer.removeListener('mini-player:command', listener);
    },
    notifyLyricVisibility: (visible: boolean) =>
      ipcRenderer.send('mini-player:lyric-visibility', visible),
    onLyricVisibility: (func: (visible: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => func(visible);
      ipcRenderer.on('mini-player:lyric-visibility', listener);
      return () => ipcRenderer.removeListener('mini-player:lyric-visibility', listener);
    },
  },
  log: log.functions,
  logging: {
    get: () => ipcRenderer.invoke('logging:get-settings') as Promise<LogSettings>,
    update: (settings: Partial<LogSettings>) =>
      invokeWithPlainPayload<LogSettings>('logging:update-settings', settings),
  },
  network: {
    get: () => ipcRenderer.invoke('network:get-settings') as Promise<NetworkSettingsState>,
    update: (request: NetworkSettingsUpdateRequest) =>
      invokeWithPlainPayload<NetworkSettingsState>('network:update-settings', request),
  },
  settingsBackup: {
    export: (request: SettingsBackupExportRequest) =>
      invokeWithPlainPayload<SettingsBackupExportResult>('settings-backup:export', request),
    inspect: () =>
      ipcRenderer.invoke('settings-backup:inspect') as Promise<SettingsBackupInspectResult>,
    import: (request: SettingsBackupImportRequest) =>
      invokeWithPlainPayload<SettingsBackupImportResult>('settings-backup:import', request),
  },
  player: {
    beginSourceChange: () => ipcRenderer.invoke('player:begin-source-change'),
    load: (url: string, requestId?: number) => ipcRenderer.invoke('player:load', url, requestId),
    loadMkvTrack: (url: string, trackId: number, requestId?: number) =>
      ipcRenderer.invoke('player:load-mkv-track', url, trackId, requestId),
    switchSource: (url: string, trackId?: number | null) =>
      ipcRenderer.invoke('player:switch-source', url, trackId),
    beginNextSourcePreparation: () => ipcRenderer.invoke('player:begin-next-source-preparation'),
    cancelNextSourcePreparation: (requestId: number) =>
      ipcRenderer.invoke('player:cancel-next-source-preparation', requestId),
    prepareNextSource: (
      url: string,
      requestId: number,
      trackId?: number | null,
      normalizationGainDb?: number,
    ) =>
      ipcRenderer.invoke(
        'player:prepare-next-source',
        url,
        requestId,
        trackId,
        normalizationGainDb,
      ),
    clearPreparedNextSource: () => ipcRenderer.invoke('player:clear-prepared-next-source'),
    commitPreparedNextSource: (transitionMs?: number) =>
      ipcRenderer.invoke('player:commit-prepared-next-source', transitionMs),
    getTrackList: (url?: string) => ipcRenderer.invoke('player:get-track-list', url),
    play: (requestId?: number) => ipcRenderer.invoke('player:play', requestId),
    pause: () => ipcRenderer.invoke('player:pause'),
    stop: () => ipcRenderer.invoke('player:stop'),
    seek: (time: number) => ipcRenderer.invoke('player:seek', time),
    setVolume: (volume: number) => ipcRenderer.invoke('player:set-volume', volume),
    setSpeed: (speed: number) => ipcRenderer.invoke('player:set-speed', speed),
    setPitch: (semitones: number) => ipcRenderer.invoke('player:set-pitch', semitones),
    setEqualizer: (gains: number[]) => invokeWithPlainPayload('player:set-equalizer', gains),
    setAudioEffect: (options: AudioEffectPlaybackOptions | null) =>
      invokeWithPlainPayload('player:set-audio-effect', options),
    selectDspProvider: (mode: 'headphone' | 'speaker' = 'speaker') =>
      ipcRenderer.invoke('player:select-dsp-provider', mode) as Promise<DspProviderRecord | null>,
    listDspProviders: () =>
      ipcRenderer.invoke('player:list-dsp-providers') as Promise<DspProviderRecord[]>,
    inspectDspProvider: (path: string) => ipcRenderer.invoke('player:inspect-dsp-provider', path),
    deleteDspProvider: (providerId: string) =>
      ipcRenderer.invoke('player:delete-dsp-provider', providerId),
    getAudioGraph: () =>
      ipcRenderer.invoke('player:get-audio-graph') as Promise<PlayerAudioGraphSnapshot | null>,
    setAudioGraphParameter: (patch: PlayerAudioGraphParameterPatch) =>
      invokeWithPlainPayload('player:set-audio-graph-parameter', patch),
    setAudioGraphPlan: (plan: PlayerAudioGraphPlanPatch) =>
      invokeWithPlainPayload('player:set-audio-graph-plan', plan),
    setAudioOutput: (deviceName: string, exclusive: boolean) =>
      ipcRenderer.invoke('player:set-audio-output', deviceName, exclusive),
    getAudioDevices: () =>
      ipcRenderer.invoke('player:get-audio-devices') as Promise<
        Array<{ name: string; description: string; isDefault?: boolean }>
      >,
    setNormalizationGain: (gainDb: number) =>
      ipcRenderer.invoke('player:set-normalization-gain', gainDb),
    fade: (from: number, to: number, durationMs: number) =>
      ipcRenderer.invoke('player:fade', from, to, durationMs),
    cancelFade: () => ipcRenderer.invoke('player:cancel-fade'),
    pauseWithFade: (savedVolume: number, durationMs: number) =>
      ipcRenderer.invoke('player:pause-with-fade', savedVolume, durationMs),
    playWithFade: (targetVolume: number, durationMs: number, requestId?: number) =>
      ipcRenderer.invoke('player:play-with-fade', targetVolume, durationMs, requestId),
    getState: () => ipcRenderer.invoke('player:get-state'),
    available: () => ipcRenderer.invoke('player:available') as Promise<boolean>,
    restart: () => ipcRenderer.invoke('player:restart') as Promise<boolean>,
    setPauseOnDeviceDisconnect: (enabled: boolean) =>
      ipcRenderer.invoke('player:set-pause-on-device-disconnect', enabled),
    setMediaTitle: (title: string) => ipcRenderer.invoke('player:set-media-title', title),
    setLoopFile: (loop: boolean) => ipcRenderer.invoke('player:set-loop-file', loop),
    setStallTimeout: (seconds: number) => ipcRenderer.invoke('player:set-stall-timeout', seconds),
    setTransitionSettings: (options: { mode?: string; fadeSecs?: number }) =>
      invokeWithPlainPayload('player:set-transition-settings', options),
    getTransitionSettings: () => ipcRenderer.invoke('player:get-transition-settings'),
    getTransitionDiagnostics: () => ipcRenderer.invoke('player:get-transition-diagnostics'),
    onTimeUpdate: (
      func: (payload: number | { time?: number; trackSeq?: number; generation?: number }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: number | { time?: number; trackSeq?: number; generation?: number },
      ) => func(payload);
      ipcRenderer.on('player:time-update', listener);
      return () => ipcRenderer.removeListener('player:time-update', listener);
    },
    onSeeked: (func: (time: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, time: number) => func(time);
      ipcRenderer.on('player:seeked', listener);
      return () => ipcRenderer.removeListener('player:seeked', listener);
    },
    onSeekStateChange: (
      func: (payload: {
        active: boolean;
        time?: number;
        trackSeq?: number;
        generation?: number;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { active: boolean; time?: number; trackSeq?: number; generation?: number },
      ) => func(payload);
      ipcRenderer.on('player:seek-state-change', listener);
      return () => ipcRenderer.removeListener('player:seek-state-change', listener);
    },
    onPlaybackRestart: (func: (payload?: { time?: number; reason?: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload?: { time?: number; reason?: string },
      ) => func(payload);
      ipcRenderer.on('player:playback-restart', listener);
      return () => ipcRenderer.removeListener('player:playback-restart', listener);
    },
    onDurationChange: (func: (duration: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, duration: number) => func(duration);
      ipcRenderer.on('player:duration-change', listener);
      return () => ipcRenderer.removeListener('player:duration-change', listener);
    },
    onFileLoaded: (
      func: (payload?: {
        path?: string;
        seq?: number;
        trackSeq?: number;
        generation?: number;
        startTime?: number;
        transition?: TrackTransitionPlaybackInfo;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload?: {
          path?: string;
          seq?: number;
          trackSeq?: number;
          generation?: number;
          startTime?: number;
          transition?: TrackTransitionPlaybackInfo;
        },
      ) => func(payload);
      ipcRenderer.on('player:file-loaded', listener);
      return () => ipcRenderer.removeListener('player:file-loaded', listener);
    },
    onStateChange: (
      func: (state: {
        playing?: boolean;
        paused?: boolean;
        timePos?: number;
        trackSeq?: number;
        generation?: number;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: {
          playing?: boolean;
          paused?: boolean;
          timePos?: number;
          trackSeq?: number;
          generation?: number;
        },
      ) => func(state);
      ipcRenderer.on('player:state-change', listener);
      return () => ipcRenderer.removeListener('player:state-change', listener);
    },
    onCoreStateChange: (
      func: (payload: {
        state?: string;
        reason?: string;
        trackSeq?: number;
        generation?: number;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { state?: string; reason?: string; trackSeq?: number; generation?: number },
      ) => func(payload);
      ipcRenderer.on('player:core-state-change', listener);
      return () => ipcRenderer.removeListener('player:core-state-change', listener);
    },
    onAoStateChange: (
      func: (payload: {
        paused?: boolean;
        reason?: string;
        bufferingState?: number;
        bufferedSecs?: number;
        targetSecs?: number;
        trackSeq?: number;
        generation?: number;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: {
          paused?: boolean;
          reason?: string;
          bufferingState?: number;
          bufferedSecs?: number;
          targetSecs?: number;
          trackSeq?: number;
          generation?: number;
        },
      ) => func(payload);
      ipcRenderer.on('player:ao-state-change', listener);
      return () => ipcRenderer.removeListener('player:ao-state-change', listener);
    },
    onPlaybackEnd: (
      func: (reason: string, context?: { trackSeq?: number; generation?: number }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        reason: string,
        context?: { trackSeq?: number; generation?: number },
      ) => func(reason, context);
      ipcRenderer.on('player:playback-end', listener);
      return () => ipcRenderer.removeListener('player:playback-end', listener);
    },
    onStall: (func: (position: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, position: number) => func(position);
      ipcRenderer.on('player:stall', listener);
      return () => ipcRenderer.removeListener('player:stall', listener);
    },
    onError: (func: (payload: PlayerErrorPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlayerErrorPayload) =>
        func(payload);
      ipcRenderer.on('player:error', listener);
      return () => ipcRenderer.removeListener('player:error', listener);
    },
    onAudioDeviceListChanged: (
      func: (payload: {
        devices: Array<{ name: string; description: string; isDefault?: boolean }>;
        deviceChangeKind?: string;
        disconnectedDevices?: Array<{ name: string; description: string; isDefault?: boolean }>;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: {
          devices: Array<{ name: string; description: string; isDefault?: boolean }>;
          deviceChangeKind?: string;
          disconnectedDevices?: Array<{ name: string; description: string; isDefault?: boolean }>;
        },
      ) => func(payload);
      ipcRenderer.on('player:audio-device-list-changed', listener);
      return () => ipcRenderer.removeListener('player:audio-device-list-changed', listener);
    },
    onPacketCacheStats: (
      func: (payload?: {
        forwardBytes: number;
        backBytes: number;
        totalBytes: number;
        forwardSecs?: number;
        seekableRanges: Array<{ startSecs: number; endSecs: number }>;
        eof: boolean;
        pendingSeek: boolean;
        hasError: boolean;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload?: {
          forwardBytes: number;
          backBytes: number;
          totalBytes: number;
          forwardSecs?: number;
          seekableRanges: Array<{ startSecs: number; endSecs: number }>;
          eof: boolean;
          pendingSeek: boolean;
          hasError: boolean;
        },
      ) => func(payload);
      ipcRenderer.on('player:packet-cache-stats', listener);
      return () => ipcRenderer.removeListener('player:packet-cache-stats', listener);
    },
    onAudioOutputStats: (
      func: (payload?: {
        backend: string;
        sampleRate: number;
        engineSampleRate: number;
        channels: number;
        format: string;
        bufferFrames: number;
        bufferSecs: number;
        requestedBufferSecs?: number;
        deviceBufferSecs?: number;
        softwareBufferSecs?: number;
        delaySecs: number;
        underruns: number;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload?: {
          backend: string;
          sampleRate: number;
          engineSampleRate: number;
          channels: number;
          format: string;
          bufferFrames: number;
          bufferSecs: number;
          requestedBufferSecs?: number;
          deviceBufferSecs?: number;
          softwareBufferSecs?: number;
          delaySecs: number;
          underruns: number;
        },
      ) => func(payload);
      ipcRenderer.on('player:audio-output-stats', listener);
      return () => ipcRenderer.removeListener('player:audio-output-stats', listener);
    },
    onAudioGraphChange: (func: (payload?: PlayerAudioGraphSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload?: PlayerAudioGraphSnapshot) =>
        func(payload);
      ipcRenderer.on('player:audio-graph-change', listener);
      return () => ipcRenderer.removeListener('player:audio-graph-change', listener);
    },
  },
  audioSpectrum: {
    getStatus: () =>
      ipcRenderer.invoke('audio-spectrum:get-status') as Promise<AudioSpectrumStatus>,
    getSnapshot: () =>
      ipcRenderer.invoke('audio-spectrum:get-snapshot') as Promise<AudioSpectrumFrame | null>,
    subscribe: (
      options: AudioSpectrumOptions,
      func: (frame: AudioSpectrumFrame) => void,
      metadata?: { pluginId?: string },
    ) => {
      const subscriptionId = `audio-spectrum-${Date.now()}-${++audioSpectrumSubscriptionSeq}`;
      const listener = (
        _event: Electron.IpcRendererEvent,
        frameSubscriptionId: string,
        frame: AudioSpectrumFrame,
      ) => {
        if (frameSubscriptionId === subscriptionId) func(frame);
      };
      ipcRenderer.on('audio-spectrum:frame', listener);
      void invokeWithPlainPayload<AudioSpectrumSubscribeResult>('audio-spectrum:subscribe', {
        subscriptionId,
        pluginId: metadata?.pluginId,
        options,
      }).catch(() => {
        ipcRenderer.removeListener('audio-spectrum:frame', listener);
      });
      return () => {
        ipcRenderer.removeListener('audio-spectrum:frame', listener);
        void invokeWithPlainPayload<AudioSpectrumStatus>('audio-spectrum:unsubscribe', {
          subscriptionId,
        }).catch(() => {});
      };
    },
  },
  recognize: {
    listInputDevices: () =>
      ipcRenderer.invoke('recognize:list-input-devices') as Promise<RecognizeInputDevice[]>,
    startAudioCapture: (request: RecognizeCaptureRequest) =>
      ipcRenderer.invoke(
        'recognize:start-audio-capture',
        request,
      ) as Promise<RecognizeCaptureStatus>,
    stopAudioCapture: () =>
      ipcRenderer.invoke('recognize:stop-audio-capture') as Promise<Uint8Array>,
    cancelAudioCapture: () => ipcRenderer.invoke('recognize:cancel-audio-capture'),
  },
  external: {
    resolvePlaylist: (req: ResolvePlaylistRequest) =>
      invokeWithPlainPayload<ResolvePlaylistResponse>('external:resolve-playlist', req),
  },
  storage: {
    getPlaybackSnapshot: () =>
      ipcRenderer.invoke('storage:playback:get-snapshot') as Promise<StoragePlaybackSnapshot>,
    getPlaybackQueue: (payload: StorageQueueIdPayload) =>
      invokeWithPlainPayload(
        'storage:playback:get-queue',
        payload,
      ) as Promise<StoragePlaybackQueueState | null>,
    replacePlaybackQueue: (payload: StorageReplaceQueuePayload) =>
      invokeWithPlainPayload(
        'storage:playback:replace-queue',
        payload,
      ) as Promise<StorageResetResult>,
    appendPlaybackQueueItems: (payload: StorageAppendQueueItemsPayload) =>
      invokeWithPlainPayload(
        'storage:playback:append-items',
        payload,
      ) as Promise<StorageResetResult>,
    updatePlaybackQueueMeta: (payload: StorageUpdateQueueMetaPayload) =>
      invokeWithPlainPayload(
        'storage:playback:update-queue-meta',
        payload,
      ) as Promise<StorageResetResult>,
    clearPlaybackQueue: (payload: StorageUpdateQueueMetaPayload) =>
      invokeWithPlainPayload(
        'storage:playback:clear-queue',
        payload,
      ) as Promise<StorageResetResult>,
    removePlaybackQueue: (payload: StorageQueueIdPayload) =>
      invokeWithPlainPayload(
        'storage:playback:remove-queue',
        payload,
      ) as Promise<StoragePlaybackSnapshot>,
    removePlaybackQueueItem: (payload: StorageRemoveQueueItemPayload) =>
      invokeWithPlainPayload(
        'storage:playback:remove-item',
        payload,
      ) as Promise<StorageResetResult>,
    reorderPlaybackQueueItems: (payload: StorageReorderQueueItemsPayload) =>
      invokeWithPlainPayload(
        'storage:playback:reorder-items',
        payload,
      ) as Promise<StorageResetResult>,
    setQueueCurrentTrack: (payload: StorageSetQueueCurrentTrackPayload) =>
      invokeWithPlainPayload(
        'storage:playback:set-current-track',
        payload,
      ) as Promise<StorageResetResult>,
    setActiveQueue: (queueId: string) =>
      ipcRenderer.invoke(
        'storage:playback:set-active-queue',
        queueId,
      ) as Promise<StorageResetResult>,
    getHistoryEntries: (payload?: StorageHistoryGetEntriesPayload) =>
      invokeWithPlainPayload<StorageHistoryEntry[]>('storage:history:get-entries', payload ?? {}),
    recordHistoryPlay: (payload: StorageHistoryRecordPlayPayload) =>
      invokeWithPlainPayload<StorageHistoryEntry | null>('storage:history:record-play', payload),
    removeHistoryEntries: (payload: StorageHistoryRemoveEntriesPayload) =>
      invokeWithPlainPayload<StorageResetResult>('storage:history:remove-entries', payload),
    clearHistory: () => ipcRenderer.invoke('storage:history:clear') as Promise<StorageResetResult>,
    getKv: <T = unknown>(key: string) =>
      ipcRenderer.invoke('storage:kv:get', key) as Promise<T | null>,
    setKv: (key: string, value: unknown) =>
      invokeWithPlainPayload<StorageResetResult>('storage:kv:set', key, value),
    deleteKv: (key: string) =>
      ipcRenderer.invoke('storage:kv:delete', key) as Promise<StorageResetResult>,
    resetAll: () => ipcRenderer.invoke('storage:reset-all') as Promise<StorageResetResult>,
  },
  mediaControls: {
    updateMetadata: (payload: {
      title: string;
      artist: string;
      album: string;
      coverUrl?: string;
      durationMs?: number;
    }) => invokeWithPlainPayload('media-control:update-metadata', payload),
    updateState: (payload: { status: string }) =>
      invokeWithPlainPayload('media-control:update-state', payload),
    updateTimeline: (payload: { currentTimeMs: number; totalTimeMs: number }) =>
      invokeWithPlainPayload('media-control:update-timeline', payload),
    updateSkipIntervals: (payload: { forwardMs: number; backwardMs: number }) =>
      invokeWithPlainPayload('media-control:update-skip-intervals', payload),
    available: () => ipcRenderer.invoke('media-control:available') as Promise<boolean>,
    onEvent: (func: (event: { type: string; positionMs?: number; offsetMs?: number }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { type: string; positionMs?: number; offsetMs?: number },
      ) => func(data);
      ipcRenderer.on('media-control:event', listener);
      return () => ipcRenderer.removeListener('media-control:event', listener);
    },
  },
});

// 主窗口首屏在 Vue 和异步设置恢复之前使用已保存的主题。
const initialThemeArgument = process.argv.find((arg) => arg.startsWith('--echo-initial-dark='));
if (initialThemeArgument) {
  contextBridge.exposeInMainWorld('echoInitialDark', initialThemeArgument.endsWith('=true'));
}

const initialBackgroundArgument = process.argv.find((arg) =>
  arg.startsWith('--echo-window-background='),
);
if (initialBackgroundArgument) {
  contextBridge.exposeInMainWorld(
    'echoWindowBackground',
    JSON.parse(initialBackgroundArgument.slice('--echo-window-background='.length)),
  );
}

// Native titlebar geometry is expressed in DIPs while DOM layout uses zoomed CSS pixels.
const macTitlebar = typeof process !== 'undefined' && process.platform === 'darwin';
let nativeFullscreen = false;
const controlsOverlay = (
  navigator as Navigator & {
    windowControlsOverlay?: EventTarget & { visible: boolean; getTitlebarAreaRect(): DOMRect };
  }
).windowControlsOverlay;
let lastTitlebarArea: { x: number; width: number } | null = null;
const syncWindowZoomGeometry = () => {
  const root = document.documentElement;
  if (!root) return;
  const factor = webFrame.getZoomFactor();
  root.style.setProperty('--window-zoom-factor', String(factor));
  // Electron can briefly report an empty WCO rectangle while the transparent
  // window is being recomposed. Keep the last valid safe area for that frame so
  // the app's right-side actions cannot move underneath the native close button.
  const overlayVisible = controlsOverlay?.visible === true;
  const reportedRect =
    !nativeFullscreen && overlayVisible ? controlsOverlay.getTitlebarAreaRect() : null;
  if (reportedRect && reportedRect.width > 0 && Number.isFinite(reportedRect.x)) {
    lastTitlebarArea = { x: reportedRect.x, width: reportedRect.width };
  }
  // Fullscreen returns an empty rectangle; never reserve an entire viewport for it.
  const fullscreen = nativeFullscreen || Boolean(document.fullscreenElement);
  const rect =
    !fullscreen && overlayVisible
      ? reportedRect && reportedRect.width > 0
        ? reportedRect
        : lastTitlebarArea
      : null;
  const inset = rect && rect.width > 0 ? Math.max(0, window.innerWidth - rect.x - rect.width) : 0;
  // macOS keeps the 14/14 traffic-light anchor aligned with the collapsed sidebar.
  // Reserve its 80x46 DIP strip centrally; WCO may report a wider safe area.
  const leftInset = Math.max(
    rect && rect.width > 0 ? Math.max(0, rect.x) : 0,
    macTitlebar && !fullscreen ? 80 / factor : 0,
  );
  root.style.setProperty('--window-controls-inset', `${inset}px`);
  root.style.setProperty('--window-controls-left-inset', `${leftInset}px`);
  root.style.setProperty(
    '--window-controls-left-height',
    leftInset > 0 ? (macTitlebar ? `${46 / factor}px` : `max(46px, ${35 / factor}px)`) : '0px',
  );
};
ipcRenderer.on('window:fullscreen-changed', (_event, fullscreen: boolean) => {
  nativeFullscreen = fullscreen;
  syncWindowZoomGeometry();
});
ipcRenderer.on('window:exit-html-fullscreen', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
});
document.addEventListener('fullscreenchange', () => {
  syncWindowZoomGeometry();
  // Native window and HTML fullscreen notifications may precede WCO layout updates.
  requestAnimationFrame(syncWindowZoomGeometry);
});
ipcRenderer.on('window:zoom-changed', syncWindowZoomGeometry);
// setTitleBarOverlay() and transparent-window composition update asynchronously
// on Linux. Re-read the WCO safe area after the background preference changes.
ipcRenderer.on('window-background:changed', () => {
  syncWindowZoomGeometry();
  window.requestAnimationFrame(syncWindowZoomGeometry);
});
controlsOverlay?.addEventListener('geometrychange', syncWindowZoomGeometry);
window.addEventListener('resize', syncWindowZoomGeometry);
window.addEventListener('DOMContentLoaded', syncWindowZoomGeometry, { once: true });

// ===== 彩蛋远程控制 + 上报 =====
contextBridge.exposeInMainWorld('eggApi', {
  getDeviceId: () => ipcRenderer.invoke('egg:getDeviceId'),
});
