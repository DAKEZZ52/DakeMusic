/**
 * LyriseMusic 下载任务模块
 * 作者：知之Dake
 * 文件：DownloadTask.ts
 * 描述：单个歌曲下载任务的执行体——基于 Electron net 流式下载（走代理/重定向），
 *      支持 HTTP Range 断点续传、暂停/继续、失败自动重试（多候选 URL + 指数退避）、进度节流
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 * 设计参考：lx-music-desktop（https://github.com/lyswhut/lx-music-desktop），Apache-2.0 License
 */
import fs from 'node:fs';
import { net, type ClientRequest, type IncomingMessage, type Session } from 'electron';
import { attachProxyLoginHandler } from '../networkPolicy';
import type { DownloadSongMeta, DownloadTaskSnapshot } from '../../shared/download';

/** 下载任务给管理器的回调。 */
export interface DownloadTaskOptions {
  /** 单任务最大自动重试次数。 */
  maxRetries: number;
  /** 任务状态变化（进度/状态）回调，由管理器持久化并广播。 */
  onChange: (snapshot: DownloadTaskSnapshot) => void;
  /** 下载完成后是否写入内嵌元数据（标题/歌手/专辑/封面/歌词）。 */
  writeMetadata?: boolean;
  /**
   * 元数据写入回调，由管理器注入（内部调用 MetadataWriter）。
   * 仅在 writeMetadata 为 true、且文件 rename 完成后调用；其失败不影响下载完成状态。
   */
  applyMetadata?: (filePath: string, song: DownloadSongMeta) => Promise<void>;
}

/** 无数据时的卡死超时（毫秒），超时后中断并重试。 */
const STALL_TIMEOUT_MS = 30_000;
/** 进度回调最小间隔（毫秒）。 */
const EMIT_INTERVAL_MS = 250;
/** 磁盘写积压上限（字节），超过则判定为写入异常并中止。 */
const MAX_PENDING_WRITE_BYTES = 16 * 1024 * 1024;
/** 最大重定向次数。 */
const MAX_REDIRECTS = 5;

/** 读取响应头（响应头可能为字符串或数组）。 */
const getHeader = (response: IncomingMessage, name: string): string => {
  const value = response.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

/** 解析 Content-Range 中的总大小，如 "bytes 0-1023/2048" -> 2048；无法解析返回 null。 */
const parseContentRangeTotal = (header: string): number | null => {
  const match = /bytes\s+\d*\s*-\s*\d*\/(\d+|\*)/.exec(header ?? '');
  if (!match || match[1] === '*') return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
};

export class DownloadTask {
  /** 任务快照（任务的全部可变状态）。 */
  private snap: DownloadTaskSnapshot;
  private readonly options: DownloadTaskOptions;
  private readonly session: Session;

  /** 当前网络请求。 */
  private request: ClientRequest | null = null;
  /** 当前文件句柄。 */
  private handle: fs.promises.FileHandle | null = null;

  /** 用户请求暂停。 */
  private wantPause = false;
  /** 用户请求取消。 */
  private wantCancel = false;
  /** start() 是否已结束（完成/暂停/取消/失败）。 */
  private settled = false;

  /** 无数据超时计时器。 */
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上次进度回调时间。 */
  private lastEmit = 0;
  /** 串行写队列，保证数据按顺序落盘。 */
  private writeQueue: Promise<void> = Promise.resolve();
  /** 尚未完成的写入字节（背压）。 */
  private pendingWriteBytes = 0;

  constructor(snapshot: DownloadTaskSnapshot, session: Session, options: DownloadTaskOptions) {
    this.snap = snapshot;
    this.session = session;
    this.options = options;
  }

  /** 当前快照。 */
  getSnapshot(): DownloadTaskSnapshot {
    return this.snap;
  }

  /**
   * 开始/继续下载。内部循环处理多候选 URL 与自动重试；
   * 结束时状态为 completed / paused / canceled / error 之一。
   */
  async start(): Promise<void> {
    try {
      await this.startInternal();
    } catch (error) {
      // 兜底：任何遗漏异常都转为失败状态，绝不向上抛出（避免未处理 rejection 杀死主进程）
      console.error('[Download] 任务执行异常：', error);
      try {
        this.finishWithError(error instanceof Error ? error : new Error(String(error)));
      } catch {
        // 极端情况下连失败状态都无法写入，仅记录
      }
    }
  }

  private async startInternal(): Promise<void> {
    this.wantPause = false;
    this.wantCancel = false;
    this.settled = false;

    const urls = this.snap.urls?.length ? this.snap.urls : [];
    if (!urls.length) {
      this.finishWithError(new Error('没有可用的下载地址'));
      return;
    }

    let totalAttempts = 0;
    while (!this.wantPause && !this.wantCancel) {
      const urlIndex = totalAttempts % urls.length;
      this.snap.urlIndex = urlIndex;
      try {
        await this.attempt(urls[urlIndex]);
        // attempt 正常完成即任务完成
        return;
      } catch (error) {
        await this.safeCloseHandle();
        if (this.wantCancel) {
          this.finishCanceled();
          return;
        }
        if (this.wantPause) {
          this.finishPaused();
          return;
        }

        totalAttempts += 1;
        // 每试完一整轮候选 URL，计一次重试
        this.snap.retryCount = Math.floor(totalAttempts / urls.length);
        if (this.snap.retryCount > this.options.maxRetries) {
          this.finishWithError(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        // 指数退避：1s、2s、4s…（上限 8s）
        const backoff = Math.min(8000, 1000 * 2 ** (this.snap.retryCount - 1));
        await this.delay(backoff);
      }
    }
  }

  /** 用户暂停：中断请求但保留临时文件，以便断点续传。 */
  pause(): void {
    if (this.settled) return;
    this.wantPause = true;
    this.clearStallTimer();
    this.request?.abort();
  }

  /** 将任务标记为排队等待（供管理器在并发槽不足时使用）。 */
  markQueued(): void {
    this.wantPause = false;
    this.wantCancel = false;
    this.snap.status = 'pending';
    this.snap.updatedAt = Date.now();
    this.emit(true);
  }

  /** 用户取消：中断请求并删除临时文件。 */
  cancel(): void {
    if (this.settled) return;
    this.wantCancel = true;
    this.clearStallTimer();
    this.request?.abort();
  }

  /** 单次下载尝试（支持断点续传）。 */
  private attempt(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let redirectCount = 0;

      // 断点起始字节：临时文件已存在的大小
      const startBytes = this.readTempSize();
      const request = net.request({
        url,
        method: 'GET',
        session: this.session,
        redirect: 'manual',
      });
      this.request = request;
      if (startBytes > 0) request.setHeader('Range', `bytes=${startBytes}-`);

      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        this.clearStallTimer();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      request.on('redirect', (statusCode) => {
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          rejectOnce(new Error('重定向次数过多'));
          request.abort();
          return;
        }
        if (statusCode < 300 || statusCode >= 400) {
          rejectOnce(new Error(`不支持的重定向状态码 ${statusCode}`));
          request.abort();
          return;
        }
        // Electron 要求在 redirect 回调内同步调用，否则会取消请求
        request.followRedirect();
      });

      request.on('response', (response) => {
        if (settled) return;
        this.handleResponse(response, startBytes, resolve, rejectOnce);
      });

      request.on('error', rejectOnce);
      request.on('abort', () => {
        if (this.wantCancel) rejectOnce(new Error('任务已取消'));
        else if (this.wantPause) rejectOnce(new Error('任务已暂停'));
        else rejectOnce(new Error('请求已中断'));
      });

      // 应用代理认证；启动无数据超时
      attachProxyLoginHandler(request);
      this.resetStallTimer();
      request.end();
    });
  }

  /** 处理响应：判定 200/206，建立文件句柄并流式写入。 */
  private handleResponse(
    response: IncomingMessage,
    requestedStart: number,
    resolve: () => void,
    rejectOnce: (error: unknown) => void,
  ): void {
    const status = response.statusCode;
    if (status !== 200 && status !== 206) {
      rejectOnce(new Error(`HTTP ${status}`));
      this.request?.abort();
      return;
    }

    // 206 表示服务器支持断点续传；200 表示从头下载
    const resuming = status === 206;
    let baseOffset = requestedStart;
    if (resuming) {
      const rangeTotal = parseContentRangeTotal(getHeader(response, 'content-range'));
      if (rangeTotal) this.snap.totalBytes = rangeTotal;
    } else {
      baseOffset = 0;
      const contentLength = Number(getHeader(response, 'content-length') || 0);
      if (contentLength > 0) this.snap.totalBytes = contentLength;
    }

    const tempPath = this.snap.tempPath;
    if (!tempPath) {
      rejectOnce(new Error('临时文件路径缺失'));
      return;
    }

    // 建立文件句柄：续传用 r+（追加），重新下载用 w（截断）
    const openHandle = resuming
      ? fs.promises.open(tempPath, 'r+')
      : fs.promises.open(tempPath, 'w');
    openHandle
      .then((handle) => {
        this.handle = handle;
        this.snap.downloadedBytes = baseOffset;
        this.snap.status = 'running';
        this.snap.error = undefined;
        console.info(
          `[Download] 开始下载：${this.snap.filePath ?? ''} (offset=${baseOffset}, urlIndex=${this.snap.urlIndex})`,
        );
        this.emit(true);
        this.pipeResponse(response, baseOffset, resolve, rejectOnce);
      })
      .catch(rejectOnce);
  }

  /** 将响应数据流式写入文件，并驱动进度与完成/失败。 */
  private pipeResponse(
    response: IncomingMessage,
    baseOffset: number,
    resolve: () => void,
    rejectOnce: (error: unknown) => void,
  ): void {
    let received = 0;
    let failed = false;

    response.on('data', (chunk: Buffer) => {
      if (failed) return;
      const chunkSize = chunk.byteLength;
      received += chunkSize;
      this.resetStallTimer();

      if (this.pendingWriteBytes + chunkSize > MAX_PENDING_WRITE_BYTES) {
        failed = true;
        rejectOnce(new Error('磁盘写入积压过大'));
        this.request?.abort();
        return;
      }

      this.pendingWriteBytes += chunkSize;
      this.writeQueue = this.writeQueue.then(async () => {
        try {
          if (this.handle) await this.handle.write(chunk);
        } finally {
          this.pendingWriteBytes -= chunkSize;
        }
      });
      this.writeQueue.catch((error) => {
        failed = true;
        rejectOnce(error);
      });

      this.snap.downloadedBytes = baseOffset + received;
      this.updateProgress();
      this.emit(false);
    });

    response.on('error', (error) => {
      failed = true;
      rejectOnce(error);
    });

    response.on('aborted', () => {
      failed = true;
      rejectOnce(new Error('响应被中断'));
    });

    response.on('end', () => {
      this.writeQueue.then(async () => {
        try {
          await this.safeCloseHandle();
          // 校验：若已知总大小，确认实际字节数与之相符
          if (this.snap.totalBytes > 0) {
            const actual = this.readTempSize();
            if (actual < this.snap.totalBytes) {
              rejectOnce(new Error('下载不完整，文件大小不符'));
              return;
            }
            this.snap.downloadedBytes = actual;
          }
          // 临时文件重命名为最终文件
          await fs.promises.rename(this.snap.tempPath as string, this.snap.filePath as string);

          // 写入内嵌元数据（标题/歌手/专辑/封面/歌词）；属附加增强，失败仅记录、不影响完成状态
          if (this.options.writeMetadata && this.options.applyMetadata && this.snap.filePath) {
            try {
              await this.options.applyMetadata(this.snap.filePath, this.snap.song);
            } catch (error) {
              console.error('[Download] 元数据写入失败：', error);
            }
          }

          this.snap.status = 'completed';
          this.snap.progress = 1;
          this.snap.updatedAt = Date.now();
          console.info(
            `[Download] 下载完成：${this.snap.filePath ?? ''} (${this.snap.downloadedBytes} bytes, retry=${this.snap.retryCount})`,
          );
          this.emit(true);
          this.settled = true;
          this.clearStallTimer();
          resolve();
        } catch (error) {
          rejectOnce(error);
        }
      }, rejectOnce);
    });
  }

  /** 读取临时文件当前大小（不存在时为 0）。 */
  private readTempSize(): number {
    try {
      const tempPath = this.snap.tempPath;
      if (!tempPath) return 0;
      return fs.statSync(tempPath).size;
    } catch {
      return 0;
    }
  }

  /** 依据已下载与总字节更新进度。 */
  private updateProgress(): void {
    if (this.snap.totalBytes > 0) {
      this.snap.progress = Math.min(1, this.snap.downloadedBytes / this.snap.totalBytes);
    }
    this.snap.updatedAt = Date.now();
  }

  /** 节流发送状态变化。 */
  private emit(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastEmit < EMIT_INTERVAL_MS) return;
    this.lastEmit = now;
    try {
      this.options.onChange({ ...this.snap, song: { ...this.snap.song } });
    } catch (error) {
      // 回调异常（如持久化/广播失败）不应影响任务状态机，也不应向上传播导致主进程退出
      console.error('[Download] 任务状态回调异常：', error);
    }
  }

  /** 标记为暂停。 */
  private finishPaused(): void {
    this.snap.status = 'paused';
    this.snap.updatedAt = Date.now();
    this.settled = true;
    this.clearStallTimer();
    this.emit(true);
  }

  /** 标记为取消并清理临时文件。 */
  private finishCanceled(): void {
    this.snap.status = 'canceled';
    this.snap.updatedAt = Date.now();
    this.settled = true;
    this.clearStallTimer();
    if (this.snap.tempPath) {
      fs.promises.unlink(this.snap.tempPath).catch(() => undefined);
    }
    this.emit(true);
  }

  /** 标记为失败。 */
  private finishWithError(error: Error): void {
    this.snap.status = 'error';
    this.snap.error = error.message || '下载失败';
    this.snap.updatedAt = Date.now();
    this.settled = true;
    this.clearStallTimer();
    console.info(
      `[Download] 下载失败：${this.snap.error} (urlIndex=${this.snap.urlIndex}, retry=${this.snap.retryCount})`,
    );
    this.emit(true);
  }

  /** 关闭文件句柄（若打开）。 */
  private async safeCloseHandle(): Promise<void> {
    const handle = this.handle;
    this.handle = null;
    if (handle) await handle.close().catch(() => undefined);
  }

  /** 重置无数据超时计时器。 */
  private resetStallTimer(): void {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      this.request?.abort();
    }, STALL_TIMEOUT_MS);
  }

  /** 清除无数据超时计时器。 */
  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  /** 可被暂停/取消中断的延时（退避等待）。 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (this.wantPause || this.wantCancel || Date.now() - start >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }
}
