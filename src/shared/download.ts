/**
 * LyriseMusic 下载模块（共享类型）
 * 作者：知之Dake
 * 文件：download.ts
 * 描述：歌曲下载任务的状态机、任务快照、创建请求、下载设置与 IPC 通道常量（主进程与渲染层共用）
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */

/**
 * 下载任务状态：
 * pending   已入队、等待空闲下载槽
 * running   正在下载
 * paused    用户手动暂停（可断点续传）
 * completed 下载完成
 * error     下载失败（已耗尽重试次数，可手动重试）
 * canceled  已取消（任务与临时文件将被清理）
 */
export type DownloadStatus = 'pending' | 'running' | 'paused' | 'completed' | 'error' | 'canceled';

/** 下载歌曲的元信息，用于界面展示、文件命名与持久化。 */
export interface DownloadSongMeta {
  /** 歌曲 ID（与播放内核 currentTrackId 口径一致）。 */
  id: string;
  /** 歌名。 */
  title: string;
  /** 歌手（多个用 / 连接）。 */
  artist: string;
  /** 专辑名。 */
  album?: string;
  /** 时长（秒）。 */
  duration?: number;
  /** 封面 URL。 */
  coverUrl?: string;
  /** 酷狗文件 hash。 */
  hash?: string;
  /** 酷狗 mixSongId。 */
  mixSongId?: string | number;
  /** 歌词文本（LRC 格式，用于写入文件内嵌歌词）。 */
  lyrics?: string;
}

/** 渲染层发起下载的请求体（URL 由渲染层复用播放解析得到，保证"下载即可播"）。 */
export interface DownloadCreateRequest {
  /** 歌曲元信息。 */
  song: DownloadSongMeta;
  /** 可下载的主 URL（通常为带时效 token 的临时地址）。 */
  url: string;
  /** 备选 URL（主地址失败时依次尝试）。 */
  fallbackUrls?: string[];
  /** 音质标识，如 128 / 320 / flac / high。 */
  quality?: string;
  /** 期望的文件扩展名（不含点），如 mp3 / flac；缺省时由 URL 与 Content-Type 推断。 */
  extName?: string;
}

/** 下载任务的只读快照，用于渲染层列表与持久化。 */
export interface DownloadTaskSnapshot {
  /** 任务 ID（下载管理器生成）。 */
  id: string;
  /** 当前状态。 */
  status: DownloadStatus;
  /** 歌曲元信息。 */
  song: DownloadSongMeta;
  /** 音质标识。 */
  quality?: string;
  /** 文件扩展名（不含点）。 */
  extName: string;
  /** 下载进度 0~1。 */
  progress: number;
  /** 已下载字节数。 */
  downloadedBytes: number;
  /** 文件总字节数（未知时为 0）。 */
  totalBytes: number;
  /** 最终保存路径（完成后可用）。 */
  filePath?: string;
  /** 临时文件路径（下载中，断点续传依赖）。 */
  tempPath?: string;
  /** 全部待尝试的 URL（主地址 + 备选）。 */
  urls?: string[];
  /** 当前使用的 URL 下标。 */
  urlIndex?: number;
  /** 失败原因（status=error 时）。 */
  error?: string;
  /** 已重试次数。 */
  retryCount: number;
  /** 创建时间（毫秒）。 */
  createdAt: number;
  /** 最近更新时间（毫秒）。 */
  updatedAt: number;
}

/** 下载设置。 */
export interface DownloadSettings {
  /** 保存目录（空字符串表示使用默认 音乐目录/LyriseMusic）。 */
  saveDir: string;
  /** 最大并发下载数。 */
  maxConcurrency: number;
  /** 单个任务失败后最大自动重试次数。 */
  maxRetries: number;
  /** 下载完成后是否写入标题/歌手/专辑/封面/歌词等元数据。 */
  writeMetadata: boolean;
}

/** 默认下载设置。 */
export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  saveDir: '',
  maxConcurrency: 3,
  maxRetries: 3,
  writeMetadata: false,
};

/** 下载相关 IPC 通道常量。 */
export const DOWNLOAD_IPC_CHANNELS = {
  /** 新建下载任务（入参 DownloadCreateRequest）。 */
  create: 'download:create',
  /** 获取全部任务快照。 */
  list: 'download:list',
  /** 暂停任务。 */
  pause: 'download:pause',
  /** 继续（断点续传）任务。 */
  resume: 'download:resume',
  /** 取消任务（清理临时文件）。 */
  cancel: 'download:cancel',
  /** 从列表移除任务（已完成/失败/取消的任务）。 */
  remove: 'download:remove',
  /** 对失败任务手动重试。 */
  retry: 'download:retry',
  /** 一键清除已完成 / 已取消的任务。 */
  clearFinished: 'download:clearFinished',
  /** 获取下载设置。 */
  getSettings: 'download:getSettings',
  /** 更新下载设置。 */
  updateSettings: 'download:updateSettings',
  /** 弹出目录选择框。 */
  chooseSaveDir: 'download:chooseSaveDir',
  /** 在系统中打开已下载文件。 */
  openFile: 'download:openFile',
  /** 在文件管理器中定位文件。 */
  openFolder: 'download:openFolder',
  /** 在系统文件管理器中打开下载保存目录。 */
  openSaveDir: 'download:openSaveDir',
  /** 主进程 -> 渲染层的任务事件（入参 DownloadEvent）。 */
  event: 'download:event',
} as const;

/** 主进程推送给渲染层的下载事件。 */
export type DownloadEvent =
  | { type: 'snapshot'; task: DownloadTaskSnapshot }
  | { type: 'removed'; id: string }
  | { type: 'list'; tasks: DownloadTaskSnapshot[] };

/** 对下载设置做边界规整，返回安全可用的值。 */
export const normalizeDownloadSettings = (
  input?: Partial<DownloadSettings> | null,
): DownloadSettings => {
  const merged = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(input ?? {}) };
  const maxConcurrency = Number(merged.maxConcurrency);
  const maxRetries = Number(merged.maxRetries);
  return {
    saveDir: typeof merged.saveDir === 'string' ? merged.saveDir : '',
    maxConcurrency: Number.isFinite(maxConcurrency)
      ? Math.min(8, Math.max(1, Math.round(maxConcurrency)))
      : DEFAULT_DOWNLOAD_SETTINGS.maxConcurrency,
    maxRetries: Number.isFinite(maxRetries)
      ? Math.min(10, Math.max(0, Math.round(maxRetries)))
      : DEFAULT_DOWNLOAD_SETTINGS.maxRetries,
    writeMetadata: Boolean(merged.writeMetadata),
  };
};
