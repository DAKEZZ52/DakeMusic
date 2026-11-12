/**
 * LyriseMusic 本地音乐库状态管理模块
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：渲染层本地音乐 store——管理已添加的本地文件夹曲库与单曲库
 *      （列表/曲目缓存/扫描状态），并将本地文件转换为 Song 模型。
 *      播放统一走「替换播放器队列并播放」：先写入播放列表队列
 *      （播放条队列可见、可切歌），再以 preResolved 直接指定本地路径
 *      交给原生 FFmpeg 引擎解码，绕过在线音源解析。
 */
import { defineStore } from 'pinia';
import type { LocalAudioFile, LocalMusicLibrary } from '../../shared/localMusic';
import { LOCAL_SINGLES_LIBRARY_ID } from '../../shared/localMusic';
import type { Song } from '../models/song';
import { usePlayerStore } from './player';
import { usePlaylistStore } from './playlist';
import { useToastStore } from './toast';

interface LocalMusicState {
  /** 已添加的本地音乐库（主进程持久化为权威来源）。 */
  libraries: LocalMusicLibrary[];
  /** 初始化拉取是否完成。 */
  loaded: boolean;
  /** 正在扫描中的库 ID 集合。 */
  scanningIds: string[];
}

/** 本地文件 → Song 模型：audioUrl 直接指向本地文件路径，由原生 FFmpeg 引擎解码播放。 */
export const localFileToSong = (file: LocalAudioFile): Song => {
  // 歌名：优先 ID3 标签标题，否则回退到文件名（去扩展名）。
  // SongCard 列表显示用 song.name，歌单/专辑页用 song.title，两个字段都填。
  const title = file.title || file.name.replace(/\.[^.]+$/, '');
  return {
    id: `local:${file.path}`,
    name: title,
    title,
    artist: file.artist || '未知歌手',
    albumName: file.album,
    album: file.album,
    duration: file.duration ?? 0,
    coverUrl: '',
    audioUrl: file.path,
    hash: file.path,
    mixSongId: 0,
    source: 'local',
  };
};

/** 单个库 → 播放列表。 */
export const libraryToSongs = (library: LocalMusicLibrary): Song[] =>
  library.files.map(localFileToSong);

/** 格式化时长（秒 → m:ss）。 */
export const formatLocalDuration = (seconds?: number): string => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

export const useLocalMusicStore = defineStore('localMusic', {
  state: (): LocalMusicState => ({
    libraries: [],
    loaded: false,
    scanningIds: [],
  }),

  getters: {
    /** 全部曲目总数。 */
    totalSongs(state): number {
      return state.libraries.reduce((sum, library) => sum + library.files.length, 0);
    },
    /** 文件夹库数量。 */
    folderCount(state): number {
      return state.libraries.filter((library) => library.kind === 'folder').length;
    },
    /** 是否处于扫描中。 */
    isScanning(state): boolean {
      return state.scanningIds.length > 0;
    },
    /** 单曲库（「我的单曲」，kind=files）。 */
    singlesLibrary(state): LocalMusicLibrary | undefined {
      return state.libraries.find((library) => library.id === LOCAL_SINGLES_LIBRARY_ID);
    },
    /** 最近一次扫描时间（毫秒时间戳）；无曲库时返回 0。 */
    latestScannedAt(state): number {
      return state.libraries.reduce((max, library) => Math.max(max, library.scannedAt), 0);
    },
    /** 合并全部库曲目为统一播放列表（图一扁平列表的数据源）。 */
    allSongs(state): Song[] {
      const songs: Song[] = [];
      for (const library of state.libraries) {
        songs.push(...library.files.map(localFileToSong));
      }
      return songs;
    },
  },

  actions: {
    /** 初始化：拉取持久化库列表。 */
    async init(): Promise<void> {
      if (this.loaded) return;
      this.loaded = true;
      await this.loadLibraries();
    },

    /** 从主进程重新拉取库列表。 */
    async loadLibraries(): Promise<void> {
      this.libraries = await window.electron.localMusic.listLibraries();
    },

    /** 选择本地文件夹并添加为音乐库；用户取消时静默返回 null。 */
    async pickAndAddLibrary(): Promise<LocalMusicLibrary | null> {
      const toast = useToastStore();
      const folder = await window.electron.localMusic.pickFolder();
      if (!folder) return null;
      this.scanningIds = [...this.scanningIds, `pending:${folder}`];
      try {
        const library = await window.electron.localMusic.addLibrary(folder);
        await this.loadLibraries();
        toast.success(`已添加本地音乐库：${library.name}（${library.files.length} 首）`);
        return library;
      } catch (error) {
        const message = error instanceof Error ? error.message : '扫描失败';
        toast.warning(`添加本地音乐库失败：${message}`);
        return null;
      } finally {
        this.scanningIds = this.scanningIds.filter((id) => id !== `pending:${folder}`);
      }
    },

    /** 添加单曲（多选音频文件 → 挂载到「我的单曲」库）。 */
    async addFiles(): Promise<boolean> {
      const toast = useToastStore();
      const result = await window.electron.localMusic.addFiles();
      if (result.canceled) return false;
      await this.loadLibraries();
      if (result.addedCount > 0) {
        toast.success(`已添加 ${result.addedCount} 首单曲`);
      } else {
        toast.warning(
          result.skippedCount > 0
            ? `没有新增单曲（${result.skippedCount} 首已存在或解析失败）`
            : '没有选择可添加的音频文件',
        );
      }
      return result.addedCount > 0;
    },

    /** 移除本地音乐库（仅移除曲库记录，不删除源文件）。 */
    async removeLibrary(id: string): Promise<void> {
      const toast = useToastStore();
      const removed = await window.electron.localMusic.removeLibrary(id);
      if (removed) {
        this.libraries = this.libraries.filter((library) => library.id !== id);
        toast.success('已移除本地音乐库');
      }
    },

    /** 重新扫描指定库（单曲库仅清理已不存在的文件）。 */
    async rescanLibrary(id: string): Promise<void> {
      const toast = useToastStore();
      if (this.scanningIds.includes(id)) return;
      this.scanningIds = [...this.scanningIds, id];
      try {
        const library = await window.electron.localMusic.rescanLibrary(id);
        const index = this.libraries.findIndex((item) => item.id === id);
        if (index >= 0) this.libraries[index] = library;
        toast.success(`扫描完成：${library.name}（${library.files.length} 首）`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '扫描失败';
        toast.warning(`重新扫描失败：${message}`);
      } finally {
        this.scanningIds = this.scanningIds.filter((item) => item !== id);
      }
    },

    /**
     * 替换播放器队列并播放本地歌曲：先写入播放列表队列（播放条队列可见、
     * 可切歌），再以 preResolved 指定本地文件路径直接解码播放。
     */
    async playQueue(requestedSong?: Song): Promise<void> {
      const songs = this.allSongs;
      if (songs.length === 0) {
        useToastStore().warning('本地音乐暂无歌曲');
        return;
      }
      const playlistStore = usePlaylistStore();
      const playerStore = usePlayerStore();
      const queueOptions = {
        queueId: 'queue:local',
        title: '本地音乐',
        subtitle: '我的本地珍藏',
        type: 'local' as const,
        dynamic: false,
      };
      playlistStore.setPlaybackQueueWithOptions(songs, 0, queueOptions);
      const target = requestedSong ?? songs[0];
      await playerStore.playTrack(String(target.id), songs, {
        sourceQueueId: 'queue:local',
        preResolved: {
          url: target.audioUrl,
          quality: null,
          effect: 'none',
          loudness: null,
          sourceKind: 'local',
        },
      });
    },

    /** 播放全部本地歌曲。 */
    playAll(): void {
      void this.playQueue();
    },

    /** 从指定单曲开始播放整个本地队列。 */
    playSong(song: Song): void {
      void this.playQueue(song);
    },

    /** 从本地音乐库移除单曲（按文件路径；仅移除曲库记录，不删除源文件）。 */
    async removeFile(filePath: string): Promise<void> {
      const toast = useToastStore();
      const removed = await window.electron.localMusic.removeFiles([filePath]);
      if (removed) {
        this.libraries = this.libraries.map((library) => ({
          ...library,
          files: library.files.filter((item) => item.path !== filePath),
        }));
        toast.success('已移除该单曲');
      }
    },
  },
});
