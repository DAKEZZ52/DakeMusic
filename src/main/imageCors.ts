import { session } from 'electron';
import log from './logger';

/**
 * 封面取色需要 canvas 读取跨域图片。
 *
 * 以前的做法是给窗口设置 `webSecurity: false`，但那等于关掉整个渲染进程的
 * 同源策略。改成只在图片响应上补 `Access-Control-Allow-Origin`：
 * `<img crossOrigin="anonymous">` 拿到该响应头后 canvas 就不会被污染，
 * 其它资源（脚本、iframe、fetch）仍然受同源策略保护。
 */
const IMAGE_CORS_FILTER = {
  urls: ['http://*/*', 'https://*/*'],
  resourceTypes: ['image'],
};

const WINDOW_SESSION_PARTITIONS = ['persist:mini-player', 'persist:desktop-lyric'];

const allowCrossOriginImageRead = (target: Electron.Session, label: string): void => {
  try {
    target.webRequest.onHeadersReceived(IMAGE_CORS_FILTER, (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders ?? {}) };
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders });
    });
  } catch (error) {
    log.warn(`[CORS] Failed to install image header rule for ${label}`, error);
  }
};

export const installImageCorsHeaders = (): void => {
  allowCrossOriginImageRead(session.defaultSession, 'default');
  for (const partition of WINDOW_SESSION_PARTITIONS) {
    allowCrossOriginImageRead(session.fromPartition(partition), partition);
  }
};
