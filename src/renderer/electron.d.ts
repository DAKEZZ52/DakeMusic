import type { ApiServerStatus } from '../shared/apiServer';
import type {
  AppInfoResult,
  UpdateDownloadResult,
  UpdateInstallResult,
  UpdateState,
} from '../shared/app';
import type { PlayMode } from '../shared/playback';
import type { TrackTransitionPlaybackInfo } from '../shared/trackTransition';
import type { SleepTimerAction, SleepTimerActionResult } from '../shared/sleepTimer';
import type {
  DownloadCreateRequest,
  DownloadEvent,
  DownloadSettings,
  DownloadTaskSnapshot,
} from '../shared/download';
import type {
  SeparatorPcmInput,
  SeparatorProgress,
  SeparatorModelInfo,
  SeparatorOutput,
  SeparatorResult,
} from '../shared/separator';
import type { LocalMusicAddFilesResult, LocalMusicLibrary } from '../shared/localMusic';
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
import type { DspProviderInspection } from '../shared/audio';
import type { ResolvePlaylistRequest, ResolvePlaylistResponse } from '../shared/external';
import type {
  RecognizeCaptureRequest,
  RecognizeCaptureStatus,
  RecognizeInputDevice,
} from '../shared/recognize';
import type { ShareCaptureRect, ShareTarget } from '../shared/share';
import type { DiagnosticsMemorySnapshot } from '../shared/diagnostics';
import type { CloudPickMode, CloudReadUploadFileDataResult } from '../shared/cloud';
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

type PlayerPacketCacheStats = {
  forwardBytes: number;
  backBytes: number;
  totalBytes: number;
  forwardSecs?: number;
  seekableRanges: Array<{ startSecs: number; endSecs: number }>;
  eof: boolean;
  pendingSeek: boolean;
  hasError: boolean;
};

type PlayerAudioOutputStats = {
  backend: string;
  sampleRate: number;
  engineSampleRate: number;
  channels: number;
  format: string;
  bufferMode: string;
  bufferFrames: number;
  bufferSecs: number;
  requestedBufferSecs?: number;
  deviceBufferSecs?: number;
  softwareBufferSecs?: number;
  aoBufferTargetSecs?: number;
  aoBufferCapacitySecs?: number;
  aoRequestFrames?: number;
  delaySecs: number;
  underruns: number;
};

type PlayerAoState = {
  paused?: boolean;
  reason?: string;
  bufferingState?: number;
  bufferedSecs?: number;
  targetSecs?: number;
  trackSeq?: number;
  generation?: number;
};

type PlayerStateChangePayload = {
  playing?: boolean;
  paused?: boolean;
  timePos?: number;
  trackSeq?: number;
  generation?: number;
};

type PlayerTimeUpdatePayload = {
  time?: number;
  trackSeq?: number;
  generation?: number;
};

type PlayerSeekStatePayload = {
  active: boolean;
  time?: number;
  trackSeq?: number;
  generation?: number;
};

type PlayerCoreStateChangePayload = {
  state?: string;
  reason?: string;
  trackSeq?: number;
  generation?: number;
};

export interface IElectronAPI {
  platform: string;
  isWayland?: boolean;
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<any>;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
    off: (channel: string, func: (...args: unknown[]) => void) => void;
  };
  shortcuts: {
    register: (payload: ShortcutRegistrationRequest) => Promise<ShortcutRegistrationResult>;
    refresh: () => Promise<ShortcutRegistrationResult>;
    setLocalEditableActive: (active: boolean) => Promise<void>;
    onTrigger: (func: (command: string) => void) => () => void;
  };
  windowControl: (action: 'minimize' | 'maximize' | 'close' | 'fullscreen' | 'attention') => void;
  appInfo: {
    get: () => Promise<AppInfoResult>;
    getChangelog: () => Promise<string>;
    relaunch: () => Promise<boolean>;
    onOpenSettings: (func: () => void) => () => void;
  };
  share?: {
    copy: (text: string) => Promise<boolean>;
    readClipboard: () => Promise<string>;
    captureRectToClipboard: (rect: ShareCaptureRect) => Promise<boolean>;
    onOpen: (func: (target: ShareTarget) => void) => () => void;
  };
  fonts: {
    getAll: () => Promise<string[]>;
  };
  audioEffects: {
    importImpulseResponse: () => Promise<ImportImpulseResponseResult>;
    downloadCommunityAudioEffect: (
      payload: DownloadCommunityAudioEffectRequest,
    ) => Promise<DownloadCommunityAudioEffectResult>;
    deleteAudioEffect: (filePath: string) => Promise<boolean>;
    reconcileAudioEffects: (files: SpatialAudioEffectEntry[]) => Promise<SpatialAudioEffectEntry[]>;
  };
  updater: {
    download: () => void;
    cancelDownload: () => void;
    install: (silent?: boolean) => Promise<UpdateInstallResult>;
    getState: () => Promise<UpdateState>;
    onDownloadStatus: (func: (result: UpdateDownloadResult) => void) => () => void;
  };
  apiServer: {
    start: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<ApiServerStatus>;
    identity: () => Promise<{ guid: string; mac: string; serverDev: string; mid: string }>;
  };
  download: {
    create: (payload: DownloadCreateRequest) => Promise<DownloadTaskSnapshot>;
    list: () => Promise<DownloadTaskSnapshot[]>;
    pause: (id: string) => Promise<boolean>;
    resume: (id: string) => Promise<boolean>;
    cancel: (id: string) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
    retry: (id: string) => Promise<boolean>;
    clearFinished: () => Promise<number>;
    getSettings: () => Promise<DownloadSettings>;
    updateSettings: (patch: Partial<DownloadSettings>) => Promise<DownloadSettings>;
    chooseSaveDir: () => Promise<string>;
    openFile: (id: string) => Promise<boolean>;
    openFolder: (id: string) => Promise<boolean>;
    openSaveDir: () => Promise<boolean>;
    onEvent: (func: (event: DownloadEvent) => void) => () => void;
  };
  separator: {
    listModels: () => Promise<SeparatorModelInfo[]>;
    downloadModel: (modelId: string) => Promise<boolean>;
    start: (modelId: string, input: SeparatorPcmInput) => Promise<SeparatorResult>;
    save: (cacheId: string, dir: string) => Promise<SeparatorOutput>;
    getDefaultSaveDir: () => Promise<string>;
    pickSaveDir: () => Promise<string | null>;
    getModelDir: () => Promise<string>;
    pickModelDir: () => Promise<string | null>;
    revealDir: (dir: string) => Promise<boolean>;
    onProgress: (func: (progress: SeparatorProgress) => void) => () => void;
  };
  localMusic: {
    listLibraries: () => Promise<LocalMusicLibrary[]>;
    pickFolder: () => Promise<string | null>;
    addLibrary: (root: string) => Promise<LocalMusicLibrary>;
    removeLibrary: (id: string) => Promise<boolean>;
    rescanLibrary: (id: string) => Promise<LocalMusicLibrary>;
    addFiles: () => Promise<LocalMusicAddFilesResult>;
    applyMetadata: (
      filePath: string,
      song: Record<string, unknown>,
    ) => Promise<{
      ok: boolean;
      error?: string;
      file?: LocalAudioFile;
      library?: LocalMusicLibrary;
    }>;
    removeFiles: (filePaths: string[]) => Promise<boolean>;
    fileExists: (filePath: string) => Promise<boolean>;
  };
  diagnostics?: {
    getMemory: (label?: string) => Promise<DiagnosticsMemorySnapshot>;
  };
  api: {
    request: (config: {
      method: string;
      url: string;
      params?: Record<string, any>;
      data?: any;
      headers?: Record<string, string>;
    }) => Promise<{
      status: number;
      body: any;
      cookie?: string[];
      headers?: Record<string, string>;
    }>;
  };
  cloud: {
    pickUploadFiles: (
      mode: CloudPickMode,
      multi?: boolean,
    ) => Promise<{
      canceled: boolean;
      files: {
        name: string;
        path: string;
        size: number;
        extension: string;
        modifiedAt: number;
        title?: string;
        artist?: string;
        duration?: number;
      }[];
      errors?: string[];
    }>;
    readUploadFileData: (filePath: string) => Promise<CloudReadUploadFileDataResult>;
    clearUploadFiles: () => Promise<{ ok: true }>;
  };
  tray: {
    syncPlayback: (payload: { isPlaying?: boolean; playMode?: PlayMode; volume?: number }) => void;
    onSetPlayMode: (func: (playMode: PlayMode) => void) => () => void;
  };
  power: {
    executeSleepTimerAction: (
      action: Exclude<SleepTimerAction, 'pause'>,
    ) => Promise<SleepTimerActionResult>;
    onResume: (func: () => void) => () => void;
  };
  desktopLyric: {
    getSnapshot: () => Promise<DesktopLyricSnapshot>;
    getSessionNonce: () => Promise<string | null>;
    getWindow: () => Promise<{ x: number; y: number; width: number; height: number }>;
    getHover: () => Promise<boolean>;
    show: () => Promise<DesktopLyricSnapshot>;
    hide: () => Promise<DesktopLyricSnapshot>;
    toggleLock: () => Promise<DesktopLyricSnapshot>;
    updateSettings: (payload: Partial<DesktopLyricSettings>) => Promise<DesktopLyricSnapshot>;
    updateWindow: (
      payload: DesktopLyricWindowBoundsUpdate,
    ) => Promise<{ x: number; y: number; width: number; height: number }>;
    startDrag: (sessionId: string) => Promise<boolean>;
    move: (sessionId: string, x: number, y: number) => void;
    startResize: (sessionId: string) => Promise<boolean>;
    resize: (sessionId: string, payload: Required<DesktopLyricWindowBoundsUpdate>) => void;
    endDrag: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    endResize: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    cancelResize: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    cancelDrag: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    onCancelDrag: (
      func: (bounds: { x: number; y: number; width: number; height: number } | null) => void,
    ) => () => void;
    onCancelResize: (
      func: (bounds: { x: number; y: number; width: number; height: number } | null) => void,
    ) => () => void;
    syncSnapshot: (payload: DesktopLyricSnapshotPatch) => void;
    onSnapshot: (func: (snapshot: DesktopLyricSnapshotMessage) => void) => () => void;
    setIgnoreMouseEvents: (ignore: boolean) => void;
    setUnlockButtonBounds: (payload: DesktopLyricClientRect | null) => void;
    onHover: (func: (hovered: boolean) => void) => () => void;
    command: (command: DesktopLyricCommand) => void;
  };
  nowPlaying: {
    getSnapshot: () => Promise<NowPlayingSnapshot>;
    syncSnapshot: (payload: NowPlayingSnapshotPatch) => void;
    onSnapshot: (func: (snapshot: NowPlayingSnapshot) => void) => () => void;
    command: (command: NowPlayingCommand) => void;
    onCommand: (func: (command: NowPlayingCommand) => void) => () => void;
  };
  obsOverlay: {
    start: (port?: number) => Promise<{
      ok: boolean;
      running: boolean;
      port: number;
      url: string;
      error?: string;
    }>;
    stop: () => Promise<{ running: boolean; port: number; url: string }>;
    status: () => Promise<{ running: boolean; port: number; url: string }>;
  };
  miniPlayer: {
    getSnapshot: () => Promise<MiniPlayerSnapshot>;
    show: () => Promise<MiniPlayerSnapshot>;
    hide: () => Promise<MiniPlayerSnapshot>;
    toggle: () => Promise<MiniPlayerSnapshot>;
    syncSnapshot: (payload: MiniPlayerSnapshotPatch) => void;
    setExpanded: (expanded: boolean) => Promise<MiniPlayerSnapshot>;
    setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<MiniPlayerSnapshot>;
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    startDrag: (sessionId: string) => Promise<boolean>;
    move: (sessionId: string, x: number, y: number) => void;
    endDrag: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    cancelDrag: (
      sessionId: string,
    ) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    applyExpandBounds: () => Promise<MiniPlayerSnapshot>;
    onSnapshot: (func: (snapshot: MiniPlayerSnapshot) => void) => () => void;
    command: (command: MiniPlayerCommand) => void;
    onCommand: (func: (command: MiniPlayerCommand) => void) => () => void;
    notifyLyricVisibility?: (visible: boolean) => void;
    onLyricVisibility?: (func: (visible: boolean) => void) => () => void;
  };
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    verbose: (...args: unknown[]) => void;
  };
  logging?: {
    get: () => Promise<LogSettings>;
    update: (settings: Partial<LogSettings>) => Promise<LogSettings>;
  };
  network?: {
    get: () => Promise<NetworkSettingsState>;
    update: (request: NetworkSettingsUpdateRequest) => Promise<NetworkSettingsState>;
  };
  settingsBackup: {
    export: (request: SettingsBackupExportRequest) => Promise<SettingsBackupExportResult>;
    inspect: () => Promise<SettingsBackupInspectResult>;
    import: (request: SettingsBackupImportRequest) => Promise<SettingsBackupImportResult>;
  };
  audioSpectrum?: {
    getStatus: () => Promise<AudioSpectrumStatus>;
    getSnapshot: () => Promise<AudioSpectrumFrame | null>;
    subscribe: (
      options: AudioSpectrumOptions,
      func: (frame: AudioSpectrumFrame) => void,
      metadata?: { pluginId?: string },
    ) => () => void;
  };
  recognize: {
    listInputDevices: () => Promise<RecognizeInputDevice[]>;
    startAudioCapture: (request: RecognizeCaptureRequest) => Promise<RecognizeCaptureStatus>;
    stopAudioCapture: () => Promise<Uint8Array>;
    cancelAudioCapture: () => Promise<void>;
  };
  external: {
    resolvePlaylist: (req: ResolvePlaylistRequest) => Promise<ResolvePlaylistResponse>;
  };
  storage?: {
    getPlaybackSnapshot: () => Promise<StoragePlaybackSnapshot>;
    getPlaybackQueue: (payload: StorageQueueIdPayload) => Promise<StoragePlaybackQueueState | null>;
    replacePlaybackQueue: (payload: StorageReplaceQueuePayload) => Promise<StorageResetResult>;
    appendPlaybackQueueItems: (
      payload: StorageAppendQueueItemsPayload,
    ) => Promise<StorageResetResult>;
    updatePlaybackQueueMeta: (
      payload: StorageUpdateQueueMetaPayload,
    ) => Promise<StorageResetResult>;
    clearPlaybackQueue: (payload: StorageUpdateQueueMetaPayload) => Promise<StorageResetResult>;
    removePlaybackQueue: (payload: StorageQueueIdPayload) => Promise<StoragePlaybackSnapshot>;
    removePlaybackQueueItem: (
      payload: StorageRemoveQueueItemPayload,
    ) => Promise<StorageResetResult>;
    reorderPlaybackQueueItems: (
      payload: StorageReorderQueueItemsPayload,
    ) => Promise<StorageResetResult>;
    setQueueCurrentTrack: (
      payload: StorageSetQueueCurrentTrackPayload,
    ) => Promise<StorageResetResult>;
    setActiveQueue: (queueId: string) => Promise<StorageResetResult>;
    getHistoryEntries: (
      payload?: StorageHistoryGetEntriesPayload,
    ) => Promise<StorageHistoryEntry[]>;
    recordHistoryPlay: (
      payload: StorageHistoryRecordPlayPayload,
    ) => Promise<StorageHistoryEntry | null>;
    removeHistoryEntries: (
      payload: StorageHistoryRemoveEntriesPayload,
    ) => Promise<StorageResetResult>;
    clearHistory: () => Promise<StorageResetResult>;
    getKv: <T = unknown>(key: string) => Promise<T | null>;
    setKv: (key: string, value: unknown) => Promise<StorageResetResult>;
    deleteKv: (key: string) => Promise<StorageResetResult>;
    resetAll: () => Promise<StorageResetResult>;
  };
  mediaControls: {
    updateMetadata: (payload: {
      title: string;
      artist: string;
      album: string;
      coverUrl?: string;
      durationMs?: number;
    }) => Promise<void>;
    updateState: (payload: { status: string }) => Promise<void>;
    updateTimeline: (payload: { currentTimeMs: number; totalTimeMs: number }) => Promise<void>;
    updateSkipIntervals: (payload: { forwardMs: number; backwardMs: number }) => Promise<void>;
    available: () => Promise<boolean>;
    onEvent: (
      func: (event: { type: string; positionMs?: number; offsetMs?: number }) => void,
    ) => () => void;
  };
  player: {
    beginSourceChange: () => Promise<number>;
    load: (url: string, requestId?: number) => Promise<{ seq: number; duration: number } | null>;
    loadMkvTrack: (
      url: string,
      trackId: number,
      requestId?: number,
    ) => Promise<{ seq: number; duration: number } | null>;
    switchSource: (
      url: string,
      trackId?: number | null,
    ) => Promise<[number, number, number] | null>;
    beginNextSourcePreparation: () => Promise<number | null>;
    cancelNextSourcePreparation: (requestId: number) => Promise<boolean>;
    prepareNextSource: (
      url: string,
      requestId: number,
      trackId?: number | null,
      normalizationGainDb?: number,
    ) => Promise<number | null>;
    clearPreparedNextSource: () => Promise<void>;
    commitPreparedNextSource: (transitionMs?: number) => Promise<boolean>;
    getTrackList: (url?: string) => Promise<
      Array<{
        id: number;
        type: string;
        codec?: string;
        selected?: boolean;
        title?: string;
        lang?: string;
      }>
    >;
    play: (requestId?: number) => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    seek: (time: number) => Promise<void>;
    setVolume: (volume: number) => Promise<void>;
    setSpeed: (speed: number) => Promise<void>;
    setEqualizer: (gains: number[]) => Promise<void>;
    setAudioEffect: (options: AudioEffectPlaybackOptions | null) => Promise<void>;
    selectDspProvider: (mode?: 'headphone' | 'speaker') => Promise<DspProviderRecord | null>;
    listDspProviders: () => Promise<DspProviderRecord[]>;
    inspectDspProvider: (path: string) => Promise<DspProviderInspection>;
    deleteDspProvider: (providerId: string) => Promise<void>;
    getAudioGraph: () => Promise<PlayerAudioGraphSnapshot | null>;
    setAudioGraphParameter: (patch: PlayerAudioGraphParameterPatch) => Promise<void>;
    setAudioGraphPlan: (plan: PlayerAudioGraphPlanPatch) => Promise<void>;
    setAudioOutput: (deviceName: string, exclusive: boolean) => Promise<void>;
    getAudioDevices: () => Promise<
      Array<{ name: string; description: string; isDefault?: boolean }>
    >;
    setNormalizationGain: (gainDb: number) => Promise<void>;
    fade: (from: number, to: number, durationMs: number) => Promise<void>;
    cancelFade: () => Promise<void>;
    pauseWithFade: (savedVolume: number, durationMs: number) => Promise<void>;
    playWithFade: (targetVolume: number, durationMs: number, requestId?: number) => Promise<void>;
    getState: () => Promise<{
      playing: boolean;
      paused: boolean;
      duration: number;
      timePos: number;
      volume: number;
      speed: number;
      idle: boolean;
      path: string;
      audioDevice: string;
    } | null>;
    available: () => Promise<boolean>;
    restart: () => Promise<boolean>;
    setPauseOnDeviceDisconnect: (enabled: boolean) => Promise<void>;
    setMediaTitle: (title: string) => Promise<void>;
    setLoopFile: (loop: boolean) => Promise<void>;
    setStallTimeout: (seconds: number) => Promise<void>;
    setTransitionSettings: (options: {
      mode?: string;
      fadeSecs?: number;
    }) => Promise<{ mode: string; fadeSecs: number; prefetchLeadSecs: number } | null>;
    getTransitionSettings: () => Promise<{
      mode: string;
      fadeSecs: number;
      prefetchLeadSecs: number;
    } | null>;
    getTransitionDiagnostics: () => Promise<string | null>;
    onTimeUpdate: (func: (payload: number | PlayerTimeUpdatePayload) => void) => () => void;
    onSeeked: (func: (time: number) => void) => () => void;
    onSeekStateChange: (func: (payload: PlayerSeekStatePayload) => void) => () => void;
    onPlaybackRestart: (func: (payload?: { time?: number; reason?: string }) => void) => () => void;
    onDurationChange: (func: (duration: number) => void) => () => void;
    onFileLoaded: (
      func: (payload?: {
        path?: string;
        seq?: number;
        trackSeq?: number;
        generation?: number;
        /** Start position of the new track (song transitions enter at a cue point). */
        startTime?: number;
        transition?: TrackTransitionPlaybackInfo;
      }) => void,
    ) => () => void;
    onStateChange: (func: (state: PlayerStateChangePayload) => void) => () => void;
    onCoreStateChange: (func: (payload: PlayerCoreStateChangePayload) => void) => () => void;
    onAoStateChange: (func: (payload: PlayerAoState) => void) => () => void;
    onPlaybackEnd: (
      func: (reason: string, context?: { trackSeq?: number; generation?: number }) => void,
    ) => () => void;
    onStall: (func: (position: number) => void) => () => void;
    onError: (func: (payload: PlayerErrorPayload) => void) => () => void;
    onAudioDeviceListChanged: (
      func: (payload: {
        devices: Array<{ name: string; description: string; isDefault?: boolean }>;
        deviceChangeKind?: string;
        disconnectedDevices?: Array<{ name: string; description: string; isDefault?: boolean }>;
      }) => void,
    ) => () => void;
    onPacketCacheStats: (func: (payload?: PlayerPacketCacheStats) => void) => () => void;
    onAudioOutputStats: (func: (payload?: PlayerAudioOutputStats) => void) => () => void;
    onAudioGraphChange: (func: (payload?: PlayerAudioGraphSnapshot) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

export {};
