/**
 * OBS 浏览器源
 *
 * 给 OBS 的「浏览器源」提供一个本机地址：http://127.0.0.1:<port>/overlay
 * - 只监听 127.0.0.1，不对外网开放
 * - GET /overlay  返回浮层页面（dist/obs-overlay.html）
 * - GET /state    返回当前播放状态（JSON）
 * - GET /events   SSE 流，每秒推送一次状态
 *
 * 数据源复用迷你播放器的快照（主窗口持续同步），不额外增加渲染层负担。
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ipcRegistry } from './ipc/registry';
import { getMiniPlayerSnapshot } from './miniPlayer';
import {
  beginMainSpectrumConsumer,
  endMainSpectrumConsumer,
  readMainSpectrumFrame,
} from './audioSpectrum';
import log from './logger';

const DEFAULT_PORT = 37650;
const PORT_ATTEMPTS = 10;
const PUSH_INTERVAL_MS = 1000;

export interface ObsOverlayState {
  version: 1;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  current: number;
  /** 队列里的下一首（?next=1 时浮层会显示） */
  next: { title: string; artist: string; cover: string } | null;
  /** `?spectrum=1` 时推送的频谱（32 个 0..1） */
  spectrum?: number[];
  updatedAt: number;
}

export interface ObsOverlayStatus {
  running: boolean;
  port: number;
  url: string;
}

let server: http.Server | null = null;
let activePort = 0;
let pushTimer: ReturnType<typeof setInterval> | null = null;
const clients = new Set<http.ServerResponse>();
let spectrumClients = 0;
let latestSpectrum: number[] = [];

const overlayFile = () => join(__dirname, '../../dist/obs-overlay.html');

const resolveNextTrack = (): ObsOverlayState['next'] => {
  const queue = getMiniPlayerSnapshot()?.queue;
  if (!queue || !Array.isArray(queue.tracks) || queue.tracks.length === 0) return null;
  const index = queue.currentTrackId
    ? queue.tracks.findIndex((item) => item.trackId === queue.currentTrackId)
    : -1;
  const next = index >= 0 ? queue.tracks[index + 1] : null;
  if (!next) return null;
  return {
    title: next.title ?? '',
    artist: next.artist ?? '',
    cover: next.coverUrl ?? '',
  };
};

const buildState = (): ObsOverlayState => {
  const snapshot = getMiniPlayerSnapshot();
  const playback = snapshot?.playback ?? null;
  return {
    version: 1,
    playing: Boolean(playback?.isPlaying),
    title: playback?.title ?? '',
    artist: playback?.artist ?? '',
    album: playback?.album ?? '',
    cover: playback?.coverUrl ?? '',
    duration: Number(playback?.duration) || 0,
    current: Number(playback?.currentTime) || 0,
    next: resolveNextTrack(),
    updatedAt: Date.now(),
  };
};

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
};

const downsampleSpectrum = (bins: number[], target = 32): number[] => {
  if (!bins.length) return [];
  if (bins.length <= target) return bins.slice();
  const step = bins.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end && j < bins.length; j += 1) sum += bins[j] ?? 0;
    out.push(sum / (end - start));
  }
  return out;
};

const broadcast = async () => {
  if (clients.size === 0) return;
  if (spectrumClients > 0) {
    try {
      const frame = await readMainSpectrumFrame();
      if (frame?.bins?.length) {
        const gain = Math.min(6, Math.max(1, 0.08 / Math.max(0.004, frame.rms ?? 0)));
        const scaled = downsampleSpectrum(frame.bins).map((value) =>
          Math.min(1, Math.max(0, value * gain)),
        );
        // 归一化：让最高的一根接近满格，避免小音量时几乎看不到
        const peak = Math.max(...scaled, 0.02);
        latestSpectrum = scaled.map((value) => Math.min(1, value / peak));
      }
    } catch {
      // 取不到就沿用上一帧
    }
  }
  const state = spectrumClients > 0 ? { ...buildState(), spectrum: latestSpectrum } : buildState();
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
};

const requestHandler: http.RequestListener = async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/state') {
    sendJson(res, 200, buildState());
    return;
  }

  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const wantsSpectrum = url.searchParams.get('spectrum') === '1';
    if (wantsSpectrum) {
      spectrumClients += 1;
      beginMainSpectrumConsumer({ fps: 30, binCount: 48, scale: 'linear', smoothing: 0.6 });
    }
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify(buildState())}\n\n`);
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
      if (wantsSpectrum) {
        spectrumClients = Math.max(0, spectrumClients - 1);
        if (spectrumClients === 0) endMainSpectrumConsumer();
      }
    });
    return;
  }

  if (pathname === '/' || pathname === '/overlay' || pathname === '/obs-overlay') {
    try {
      const html = await readFile(overlayFile(), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    } catch (error) {
      log.warn('[ObsOverlay] 读取浮层页面失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('overlay page not found');
    }
    return;
  }

  sendJson(res, 404, { error: 'not found' });
};

const listen = (port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    const instance = http.createServer(requestHandler);
    instance.once('error', (error: NodeJS.ErrnoException) => {
      instance.close();
      reject(error);
    });
    instance.listen(port, '127.0.0.1', () => {
      server = instance;
      resolve(port);
    });
  });

/** 启动浮层服务；端口被占用时自动顺延 */
export const startObsOverlay = async (
  requestedPort = DEFAULT_PORT,
): Promise<ObsOverlayStatus & { ok: boolean; error?: string }> => {
  if (server) {
    return {
      ok: true,
      running: true,
      port: activePort,
      url: `http://127.0.0.1:${activePort}/overlay`,
    };
  }

  const base =
    Number.isFinite(requestedPort) && requestedPort > 1024
      ? Math.floor(requestedPort)
      : DEFAULT_PORT;
  for (let offset = 0; offset < PORT_ATTEMPTS; offset += 1) {
    const tryPort = base + offset;
    try {
      activePort = await listen(tryPort);
      pushTimer = setInterval(() => void broadcast(), PUSH_INTERVAL_MS);
      log.info('[ObsOverlay] 已启动', {
        port: activePort,
        url: `http://127.0.0.1:${activePort}/overlay`,
      });
      return {
        ok: true,
        running: true,
        port: activePort,
        url: `http://127.0.0.1:${activePort}/overlay`,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'EADDRINUSE') {
        log.warn('[ObsOverlay] 启动失败', {
          port: tryPort,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ok: false,
          running: false,
          port: 0,
          url: '',
          error: error instanceof Error ? error.message : '启动失败',
        };
      }
    }
  }

  return { ok: false, running: false, port: 0, url: '', error: '端口被占用，尝试 10 个端口均失败' };
};

export const stopObsOverlay = (): ObsOverlayStatus => {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  for (const client of clients) {
    try {
      client.end();
    } catch {
      // 忽略：连接可能已断开
    }
  }
  clients.clear();
  if (server) {
    server.close();
    server = null;
    log.info('[ObsOverlay] 已停止');
  }
  activePort = 0;
  return { running: false, port: 0, url: '' };
};

export const getObsOverlayStatus = (): ObsOverlayStatus =>
  server
    ? { running: true, port: activePort, url: `http://127.0.0.1:${activePort}/overlay` }
    : { running: false, port: 0, url: '' };

export const cleanupObsOverlay = () => {
  stopObsOverlay();
};

export const registerObsOverlayHandlers = () => {
  ipcRegistry.registerHandler('obs-overlay:start', (_event, port?: number) =>
    startObsOverlay(typeof port === 'number' ? port : DEFAULT_PORT),
  );
  ipcRegistry.registerHandler('obs-overlay:stop', () => stopObsOverlay());
  ipcRegistry.registerHandler('obs-overlay:status', () => getObsOverlayStatus());
};
