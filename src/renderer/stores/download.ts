/**
 * LyriseMusic 下载状态管理模块
 * 作者：知之Dake
 * 文件：download.ts
 * 描述：渲染层下载 store——复用播放地址解析（resolveAudioUrl）得到可下载地址，
 *      管理任务/设置状态、接收主进程事件并提供暂停/继续/取消等操作
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { defineStore } from 'pinia';
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  type DownloadEvent,
  type DownloadSettings,
  type DownloadSongMeta,
  type DownloadTaskSnapshot,
} from '../../shared/download';
import type { Song } from '../models/song';
import { fetchDownloadLyrics } from '../utils/downloadLyrics';
import { usePlayerStore } from './player';
import { useToastStore } from './toast';

interface DownloadState {
  /** 全部任务快照（主进程为权威来源）。 */
  tasks: DownloadTaskSnapshot[];
  /** 下载设置。 */
  settings: DownloadSettings;
  /** 是否已初始化（避免重复订阅事件）。 */
  started: boolean;
}

/** 将 Song 模型转换为下载所需的歌曲元信息。 */
export const toDownloadSongMeta = (song: Song): DownloadSongMeta => ({
  id: String(song.id ?? ''),
  title: song.name || song.title || '未知歌曲',
  artist: song.artist || '未知歌手',
  album: song.albumName || song.album || undefined,
  duration: song.duration ?? undefined,
  coverUrl: song.coverUrl || song.cover || undefined,
  hash: song.hash || undefined,
  mixSongId: song.mixSongId ?? undefined,
});

export const useDownloadStore = defineStore('download', {
  state: (): DownloadState => ({
    tasks: [],
    settings: { ...DEFAULT_DOWNLOAD_SETTINGS },
    started: false,
  }),

  getters: {
    /** 下载中（排队/运行）的任务数。 */
    activeCount(state): number {
      return state.tasks.filter((task) => task.status === 'pending' || task.status === 'running')
        .length;
    },
    /** 正在运行的任务数。 */
    runningCount(state): number {
      return state.tasks.filter((task) => task.status === 'running').length;
    },
  },

  actions: {
    /** 初始化：拉取任务与设置、订阅主进程事件。 */
    async init(): Promise<void> {
      if (this.started) return;
      this.started = true;
      await this.refresh();
      this.settings = await window.electron.download.getSettings();
      window.electron.download.onEvent((event: DownloadEvent) => this.handleEvent(event));
    },

    /** 从主进程重新拉取全部任务。 */
    async refresh(): Promise<void> {
      this.tasks = await window.electron.download.list();
    },

    /** 处理主进程广播的下载事件。 */
    handleEvent(event: DownloadEvent): void {
      if (event.type === 'snapshot') {
        const index = this.tasks.findIndex((task) => task.id === event.task.id);
        if (index >= 0) this.tasks[index] = event.task;
        else this.tasks.unshift(event.task);
      } else if (event.type === 'removed') {
        this.tasks = this.tasks.filter((task) => task.id !== event.id);
      } else if (event.type === 'list') {
        this.tasks = event.tasks;
      }
    },

    /**
     * 下载歌曲：复用播放地址解析（与"能播放即能下载"一致），
     * 拿到主地址与候选地址后交给主进程下载。
     */
    async downloadSong(song: Song): Promise<DownloadTaskSnapshot | null> {
      const toast = useToastStore();
      try {
        const player = usePlayerStore();
        const resolved = await player.resolveAudioUrl(song);
        if (!resolved?.url) {
          toast.warning('无法解析该歌曲的播放地址');
          return null;
        }

        // 构建歌曲元信息；若开启元数据写入，则顺带获取歌词（无副作用，不污染全局歌词状态）
        const meta = toDownloadSongMeta(song);
        if (this.settings.writeMetadata) {
          const lyrics = await fetchDownloadLyrics({
            hash: meta.hash,
            title: meta.title,
            artist: meta.artist,
            duration: meta.duration,
            mixSongId: meta.mixSongId,
          });
          if (lyrics) meta.lyrics = lyrics;
        }

        const created = await window.electron.download.create({
          song: meta,
          url: resolved.url,
          fallbackUrls: resolved.urls?.filter((url) => url && url !== resolved.url),
          quality: resolved.quality ?? undefined,
        });
        toast.actionSucceeded('已加入下载队列');
        return created;
      } catch {
        toast.actionFailed('下载失败');
        return null;
      }
    },

    /** 暂停任务。 */
    async pause(id: string): Promise<void> {
      await window.electron.download.pause(id);
    },

    /** 继续任务（断点续传）。 */
    async resume(id: string): Promise<void> {
      await window.electron.download.resume(id);
    },

    /** 取消任务。 */
    async cancel(id: string): Promise<void> {
      await window.electron.download.cancel(id);
    },

    /** 从列表移除任务（仅非运行状态）。 */
    async remove(id: string): Promise<void> {
      const ok = await window.electron.download.remove(id);
      if (!ok) useToastStore().actionFailed('任务正在下载，无法移除');
    },

    /** 失败重试。 */
    async retry(id: string): Promise<void> {
      await window.electron.download.retry(id);
    },

    /** 一键清除已完成 / 已取消任务。 */
    async clearFinished(): Promise<void> {
      const count = await window.electron.download.clearFinished();
      const toast = useToastStore();
      if (count > 0) toast.actionCompleted(`已清除 ${count} 个任务`);
    },

    /** 选择下载保存目录。 */
    async chooseSaveDir(): Promise<void> {
      const dir = await window.electron.download.chooseSaveDir();
      if (dir) {
        this.settings.saveDir = dir;
        useToastStore().actionSucceeded('下载目录已更新');
      }
    },

    /** 打开已下载文件。 */
    async openFile(id: string): Promise<void> {
      const ok = await window.electron.download.openFile(id);
      if (!ok) useToastStore().actionFailed('文件不存在');
    },

    /** 在文件管理器中定位。 */
    async openFolder(id: string): Promise<void> {
      const ok = await window.electron.download.openFolder(id);
      if (!ok) useToastStore().actionFailed('文件不存在');
    },

    /** 在系统文件管理器中打开下载保存目录。 */
    async openSaveDir(): Promise<void> {
      const ok = await window.electron.download.openSaveDir();
      if (!ok) useToastStore().actionFailed('无法打开下载目录');
    },

    /** 更新下载设置。 */
    async updateSettings(patch: Partial<DownloadSettings>): Promise<void> {
      this.settings = await window.electron.download.updateSettings(patch);
    },

    /**
     * 查询某歌曲当前未结束的下载任务（用于歌曲卡片显示下载状态）。
     */
    taskForSong(song: Song): DownloadTaskSnapshot | null {
      const hash = song.hash?.trim();
      const id = String(song.id ?? '').trim();
      return (
        this.tasks.find((task) => {
          if (['completed', 'canceled'].includes(task.status)) return false;
          const sameHash = hash && task.song.hash?.trim() === hash;
          const sameId = id && task.song.id === id;
          return Boolean(sameHash || sameId);
        }) ?? null
      );
    },
  },
});
