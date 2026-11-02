/**
 * DakeMusic 下载管理器模块
 * 作者：知之Dake
 * 文件：DownloadManager.ts
 * 描述：歌曲下载任务的全局管理——任务表、并发控制与等待队列、增删/暂停/继续/取消/重试、
 *      任务快照持久化（KV）与重启恢复、向渲染层广播事件
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 * 设计参考：lx-music-desktop（https://github.com/lyswhut/lx-music-desktop），Apache-2.0 License
 */
import type { BrowserWindow, Session } from 'electron';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getManagedNetworkSession } from '../networkPolicy';
import { getDownloadSettings, resolveSaveDir, updateDownloadSettings } from './downloadSettings';
import { buildBaseFileName, buildTempPath, inferExtName, resolveTargetPath } from './downloadPaths';
import { DownloadTask } from './DownloadTask';
import { MetadataWriter } from './MetadataWriter';
import { getKvStorage } from '../storage/kv';
import {
  DOWNLOAD_IPC_CHANNELS,
  type DownloadCreateRequest,
  type DownloadEvent,
  type DownloadSettings,
  type DownloadSongMeta,
  type DownloadTaskSnapshot,
} from '../../shared/download';

/** 任务快照在 KV 中的键。 */
const DOWNLOAD_TASKS_KEY = 'main:downloadTasks';

/** 管理器依赖。 */
export interface DownloadManagerDeps {
  getMainWindow: () => BrowserWindow | null;
}

export class DownloadManager {
  private readonly deps: DownloadManagerDeps;
  /** 任务 ID -> 任务执行体。 */
  private readonly tasks = new Map<string, DownloadTask>();
  /** 任务 ID -> 任务快照（权威状态）。 */
  private readonly snapshots = new Map<string, DownloadTaskSnapshot>();
  /** 下载使用的网络 session（自动应用代理）。 */
  private session: Session | null = null;
  /** 元数据写入器（下载完成后内嵌标题/歌手/专辑/封面/歌词）。 */
  private metadataWriter: MetadataWriter | null = null;
  private initialized = false;

  constructor(deps: DownloadManagerDeps) {
    this.deps = deps;
  }

  /** 初始化：等待 app ready，获取网络 session，并从持久化恢复任务。 */
  async init(): Promise<void> {
    if (this.initialized) return;
    await app.whenReady();
    this.initialized = true;
    this.session = await getManagedNetworkSession();
    this.metadataWriter = new MetadataWriter({ session: this.session });
    this.restore();
  }

  /** 获取全部任务快照（按创建时间倒序）。 */
  listTasks(): DownloadTaskSnapshot[] {
    return [...this.snapshots.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 读取下载设置。 */
  getSettings(): DownloadSettings {
    return getDownloadSettings();
  }

  /** 更新下载设置；并发数变化后立即尝试调度。 */
  saveSettings(patch: Partial<DownloadSettings>): DownloadSettings {
    const next = updateDownloadSettings(patch);
    this.pump();
    return next;
  }

  /**
   * 创建下载任务。
   * 同一歌曲（hash 或 id）存在未完成任务时直接返回已有任务，避免重复下载。
   */
  async createTask(request: DownloadCreateRequest): Promise<DownloadTaskSnapshot> {
    if (!this.session) await this.init();

    const duplicate = this.findActiveDuplicate(request);
    if (duplicate) return duplicate;

    const settings = getDownloadSettings();
    const saveDir = resolveSaveDir(settings);
    await fs.promises.mkdir(saveDir, { recursive: true });

    const baseName = buildBaseFileName(request.song);
    const extName = inferExtName({
      explicit: request.extName,
      url: request.url,
      quality: request.quality,
    });
    const filePath = await resolveTargetPath(saveDir, baseName, extName);
    const tempPath = buildTempPath(filePath);

    const now = Date.now();
    const id = this.generateId();
    const snapshot: DownloadTaskSnapshot = {
      id,
      status: 'pending',
      song: { ...request.song },
      quality: request.quality,
      extName,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      filePath,
      tempPath,
      urls: [request.url, ...(request.fallbackUrls ?? [])].filter(Boolean),
      urlIndex: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const task = new DownloadTask(snapshot, this.session as Session, {
      maxRetries: settings.maxRetries,
      onChange: this.handleChange,
      writeMetadata: settings.writeMetadata,
      applyMetadata: this.applyMetadata,
    });
    this.tasks.set(id, task);
    this.snapshots.set(id, snapshot);

    this.persist();
    this.broadcast({ type: 'snapshot', task: snapshot });
    this.pump();
    return snapshot;
  }

  /** 暂停任务。 */
  pauseTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.pause();
    return true;
  }

  /** 继续任务（并发槽不足时排队等待）。 */
  resumeTask(id: string): boolean {
    return this.enqueue(id);
  }

  /** 对失败任务重试。 */
  retryTask(id: string): boolean {
    return this.enqueue(id);
  }

  /** 取消任务（中断并清理临时文件）。 */
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.cancel();
    return true;
  }

  /** 从列表移除任务（仅非运行状态）；同时清理临时文件。 */
  async removeTask(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) return false;
    if (snapshot.status === 'running' || snapshot.status === 'pending') return false;

    // 清理可能残留的临时文件
    if (snapshot.tempPath) {
      await fs.promises.unlink(snapshot.tempPath).catch(() => undefined);
    }
    this.tasks.delete(id);
    this.snapshots.delete(id);
    this.persist();
    this.broadcast({ type: 'removed', id });
    return true;
  }

  /** 一键清除已完成 / 已取消的任务。 */
  async clearFinished(): Promise<number> {
    const removable = [...this.snapshots.values()].filter(
      (snapshot) => snapshot.status === 'completed' || snapshot.status === 'canceled',
    );
    for (const snapshot of removable) {
      this.tasks.delete(snapshot.id);
      this.snapshots.delete(snapshot.id);
    }
    if (removable.length) {
      this.persist();
      this.broadcast({ type: 'list', tasks: this.listTasks() });
    }
    return removable.length;
  }

  /** 让任务进入排队（继续/重试共用）；并发槽空闲时立即开始。 */
  private enqueue(id: string): boolean {
    const task = this.tasks.get(id);
    const snapshot = this.snapshots.get(id);
    if (!task || !snapshot) return false;
    if (snapshot.status === 'running' || snapshot.status === 'pending') return true;
    task.markQueued();
    this.pump();
    return true;
  }

  /**
   * 调度：在并发上限内启动 pending 任务。
   */
  private pump(): void {
    if (!this.initialized) return;
    const max = getDownloadSettings().maxConcurrency;
    let slots =
      max - [...this.snapshots.values()].filter((snapshot) => snapshot.status === 'running').length;
    if (slots <= 0) return;

    for (const snapshot of this.snapshots.values()) {
      if (slots <= 0) break;
      if (snapshot.status !== 'pending') continue;
      const task = this.tasks.get(snapshot.id);
      if (!task) continue;
      slots -= 1;
      // 任务启动异常兜底：start() 即使意外 reject 也不得成为未处理 rejection
      void task.start().catch((error) => {
        console.error('[Download] 任务启动失败：', error);
      });
    }
  }

  /** 任务执行体的状态回调：更新快照、持久化、广播，并在终态时调度后续任务。 */
  private handleChange = (snapshot: DownloadTaskSnapshot): void => {
    this.snapshots.set(snapshot.id, snapshot);
    try {
      this.persist();
    } catch (error) {
      console.error('[Download] 任务快照持久化失败：', error);
    }
    try {
      this.broadcast({ type: 'snapshot', task: snapshot });
    } catch (error) {
      console.error('[Download] 任务状态广播失败：', error);
    }
    if (['completed', 'error', 'paused', 'canceled'].includes(snapshot.status)) {
      this.pump();
    }
  };

  /**
   * 元数据写入回调：由下载任务在文件 rename 完成后调用。
   * 失败会向上抛出，由 DownloadTask 捕获并仅记录（不改变已完成状态）。
   */
  private applyMetadata = async (filePath: string, song: DownloadSongMeta): Promise<void> => {
    if (!this.metadataWriter) {
      this.metadataWriter = new MetadataWriter({ session: this.session });
    }
    await this.metadataWriter.write(filePath, song);
  };

  /** 查找同一歌曲的未完成任务（去重）。 */
  private findActiveDuplicate(request: DownloadCreateRequest): DownloadTaskSnapshot | null {
    const targetHash = request.song.hash?.trim();
    const targetId = String(request.song.id ?? '').trim();
    for (const snapshot of this.snapshots.values()) {
      if (['completed', 'canceled'].includes(snapshot.status)) continue;
      const sameHash = targetHash && snapshot.song.hash?.trim() === targetHash;
      const sameId = targetId && String(snapshot.song.id ?? '') === targetId;
      if (sameHash || sameId) return snapshot;
    }
    return null;
  }

  /** 从持久化恢复任务。 */
  private restore(): void {
    const saved = getKvStorage().get<DownloadTaskSnapshot[]>(DOWNLOAD_TASKS_KEY);
    if (!Array.isArray(saved)) return;

    for (const persisted of saved) {
      if (!persisted?.id || !persisted.song) continue;
      // 重启后中断的运行/排队任务转为"已暂停"，由用户手动继续
      if (persisted.status === 'running' || persisted.status === 'pending') {
        persisted.status = 'paused';
      }
      // 丢弃无效的临时文件信息：若临时文件不存在则无法续传（保留任务，继续时会重新下载）
      this.snapshots.set(persisted.id, persisted);
      if (persisted.status !== 'completed') {
        const task = new DownloadTask(persisted, this.session as Session, {
          maxRetries: getDownloadSettings().maxRetries,
          onChange: this.handleChange,
          writeMetadata: getDownloadSettings().writeMetadata,
          applyMetadata: this.applyMetadata,
        });
        this.tasks.set(persisted.id, task);
      }
    }
  }

  /** 持久化全部任务快照。 */
  private persist(): void {
    const tasks = this.listTasks();
    getKvStorage().set(DOWNLOAD_TASKS_KEY, tasks);
  }

  /** 向主窗口广播下载事件。 */
  private broadcast(event: DownloadEvent): void {
    const window = this.deps.getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(DOWNLOAD_IPC_CHANNELS.event, event);
    }
  }

  /** 生成任务 ID。 */
  private generateId(): string {
    return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** 提供给 IPC：在文件管理器中定位已下载文件。 */
  async revealFile(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot?.filePath) return false;
    if (!fs.existsSync(snapshot.filePath)) return false;
    const { shell } = await import('electron');
    shell.showItemInFolder(path.resolve(snapshot.filePath));
    return true;
  }

  /** 提供给 IPC：用系统默认程序打开已下载文件。 */
  async openFile(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot?.filePath) return false;
    if (!fs.existsSync(snapshot.filePath)) return false;
    const { shell } = await import('electron');
    await shell.openPath(path.resolve(snapshot.filePath));
    return true;
  }

  /** 提供给 IPC：在系统文件管理器中打开下载保存目录。 */
  async openSaveDir(): Promise<boolean> {
    const saveDir = resolveSaveDir(getDownloadSettings());
    await fs.promises.mkdir(saveDir, { recursive: true });
    const { shell } = await import('electron');
    const error = await shell.openPath(path.resolve(saveDir));
    return !error;
  }
}

let manager: DownloadManager | null = null;

/** 获取下载管理器单例。 */
export const getDownloadManager = (deps?: DownloadManagerDeps): DownloadManager => {
  if (!manager) {
    if (!deps) throw new Error('DownloadManager 首次创建需要提供依赖');
    manager = new DownloadManager(deps);
  }
  return manager;
};
