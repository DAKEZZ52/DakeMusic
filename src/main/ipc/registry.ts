import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import log, { isDiagnosticModeActive } from '../logger';

type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any;
type IpcListener = (event: IpcMainEvent, ...args: any[]) => void;

interface IpcHandlerOptions {
  /** Expected rejections are returned to the caller without noisy production logs. */
  isExpectedError?: (error: unknown) => boolean;
}

// IPC 同步占用计时阈值：handler/listener 占用主线程同步执行超过此值即告警，
// 用于定位是哪个通道在阻塞主进程（如切歌时的地址解析、媒体控制等）。
const IPC_SYNC_WARN_MS = 50;

/** 开发服务器同源（打包后为 null） */
const DEV_ORIGIN = (() => {
  const url = process.env.VITE_DEV_SERVER_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
})();

/**
 * 只接受来自应用自身页面的 IPC。
 *
 * 允许：应用目录下的 file:// 页面、开发服务器同源页面、about:blank（打印/临时页）。
 * 拒绝：任意 https 页面、data: / blob: 页面、其它目录的 file:// 页面。
 *
 * 这层校验的意义：即使渲染进程被注入了第三方脚本，它也只能在「应用自己的页面」里
 * 调用 IPC；一旦页面被导航走或被塞进外部 frame，通道直接失效。
 */
const isTrustedFrameUrl = (rawUrl: string): boolean => {
  if (!rawUrl) return false;
  if (rawUrl.startsWith('about:')) return true;

  if (rawUrl.startsWith('file://')) {
    try {
      // Windows 下 file:///E:/... 的 pathname 带前导斜杠，app.getAppPath() 不带，先统一
      const normalize = (value: string) =>
        value
          .replace(/\\/g, '/')
          .replace(/^\/([A-Za-z]:)/, '$1')
          .toLowerCase();
      const pathname = normalize(decodeURIComponent(new URL(rawUrl).pathname));
      const appRoot = normalize(app.getAppPath());
      if (pathname.startsWith(appRoot)) return true;
      // 打包后真实路径是 .../app.asar/dist/index.html，appRoot 指向 app.asar
      return pathname.includes('/app.asar/');
    } catch {
      return false;
    }
  }

  if (DEV_ORIGIN && rawUrl.startsWith(DEV_ORIGIN)) return true;
  return false;
};

const isTrustedSender = (event: IpcMainInvokeEvent | IpcMainEvent): boolean => {
  const frame = event.senderFrame;
  // senderFrame 为 null 说明发起者已销毁，直接拒绝
  if (!frame) return false;
  return isTrustedFrameUrl(frame.url);
};

class IpcRegistry {
  private handlers = new Map<string, IpcHandler>();
  private listeners = new Map<string, IpcListener[]>();

  registerHandler(channel: string, handler: IpcHandler, options?: IpcHandlerOptions): void {
    if (this.handlers.has(channel)) {
      console.warn(`[IPC] Handler for channel "${channel}" already registered, replacing`);
      ipcMain.removeHandler(channel);
    }
    this.handlers.set(channel, handler);
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedSender(event)) {
        log.warn('[IPC] 已拒绝不可信来源的调用', {
          channel,
          url: event.senderFrame?.url ?? '',
        });
        throw new Error(`IPC_FORBIDDEN:${channel}`);
      }
      // 计时仅在诊断模式开启时进行（平时一次布尔判断，近乎零开销）。
      // 测的是 handler 同步执行（返回前/首个 await 让出前）占用主线程的时长；
      // 异步等待（网络/工作线程）不计入，因为那不阻塞主线程。
      const profiling = isDiagnosticModeActive();
      const start = profiling ? performance.now() : 0;
      try {
        const result = handler(event, ...args);
        if (profiling) {
          const syncMs = performance.now() - start;
          if (syncMs >= IPC_SYNC_WARN_MS) {
            log.warn(`[IPCProfiler] handler "${channel}" 同步占用主线程 ~${Math.round(syncMs)}ms`);
          }
        }
        return await result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (options?.isExpectedError?.(error)) {
          if (isDiagnosticModeActive()) {
            log.debug('[IPC] Handler rejected', { channel, error: errorMessage });
          }
        } else {
          log.error('[IPC] Handler failed', {
            channel,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : '',
          });
        }
        throw error;
      }
    });
  }

  registerListener(channel: string, listener: IpcListener): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    // 包裹计时：listener 是同步执行的，整段都占用主线程。仅诊断模式开启时计时。
    const wrapped: IpcListener = (event, ...args) => {
      if (!isTrustedSender(event)) {
        log.warn('[IPC] 已拒绝不可信来源的调用', {
          channel,
          url: event.senderFrame?.url ?? '',
        });
        return;
      }
      const profiling = isDiagnosticModeActive();
      const start = profiling ? performance.now() : 0;
      try {
        listener(event, ...args);
      } finally {
        if (profiling) {
          const syncMs = performance.now() - start;
          if (syncMs >= IPC_SYNC_WARN_MS) {
            log.warn(`[IPCProfiler] listener "${channel}" 同步占用主线程 ~${Math.round(syncMs)}ms`);
          }
        }
      }
    };
    this.listeners.get(channel)!.push(wrapped);
    ipcMain.on(channel, wrapped);
  }

  unregisterAll(): void {
    // Remove all handlers
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
    this.handlers.clear();

    // Remove all listeners
    for (const [channel, listeners] of this.listeners.entries()) {
      for (const listener of listeners) {
        ipcMain.removeListener(channel, listener);
      }
    }
    this.listeners.clear();
  }

  getRegisteredChannels(): string[] {
    return [...this.handlers.keys(), ...this.listeners.keys()];
  }
}

export const ipcRegistry = new IpcRegistry();
