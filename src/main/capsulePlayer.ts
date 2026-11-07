/**
 * 迷你胶囊播放器（独立小窗）
 *
 * 与已有的「唱歌模式」迷你窗（miniPlayer.ts）相互独立：
 * 唱歌模式那套组件与行为完全不动，这里是第二种形态——贴边一条胶囊。
 */
import { BrowserWindow, app, screen } from 'electron';
import { join } from 'path';
import { ipcRegistry } from './ipc/registry';
import log from './logger';
import { hardenWebContents } from './security';

const CAPSULE_WIDTH = 344;
const CAPSULE_HEIGHT = 92;
const EDGE_MARGIN = 24;

let capsuleWindow: BrowserWindow | null = null;

const resolveBounds = () => {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    x: Math.round(area.x + area.width - CAPSULE_WIDTH - EDGE_MARGIN),
    y: Math.round(area.y + area.height - CAPSULE_HEIGHT - EDGE_MARGIN),
  };
};

const loadCapsule = async (win: BrowserWindow) => {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  hardenWebContents(win.webContents, { devOrigin: devUrl ? new URL(devUrl).origin : null });
  if (devUrl) {
    const target = new URL(devUrl);
    target.hash = '/capsule-player';
    await win.loadURL(target.toString());
    return;
  }
  await win.loadFile(join(__dirname, '../../dist/index.html'), { hash: '/capsule-player' });
};

const createCapsule = async (): Promise<BrowserWindow> => {
  const win = new BrowserWindow({
    title: 'DakeMusic 迷你胶囊',
    ...(!app.isPackaged ? { icon: join(process.cwd(), 'build/icons/icon.png') } : {}),
    ...resolveBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    if (capsuleWindow === win) capsuleWindow = null;
  });

  await loadCapsule(win);
  capsuleWindow = win;
  return win;
};

export const isCapsulePlayerOpen = () => Boolean(capsuleWindow && !capsuleWindow.isDestroyed());

export const closeCapsulePlayer = () => {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return false;
  capsuleWindow.close();
  capsuleWindow = null;
  return true;
};

/** 打开/收起胶囊；已存在则直接聚焦 */
export const toggleCapsulePlayer = async (force?: boolean): Promise<boolean> => {
  const wantOpen = force ?? !isCapsulePlayerOpen();
  if (!wantOpen) return closeCapsulePlayer();
  if (isCapsulePlayerOpen()) {
    capsuleWindow?.showInactive();
    return true;
  }
  try {
    await createCapsule();
    return true;
  } catch (error) {
    log.error('[Capsule] 创建失败', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export const cleanupCapsulePlayer = () => {
  if (capsuleWindow && !capsuleWindow.isDestroyed()) capsuleWindow.destroy();
  capsuleWindow = null;
};

export const registerCapsulePlayerHandlers = () => {
  ipcRegistry.registerHandler('capsule-player:toggle', () => toggleCapsulePlayer());
  ipcRegistry.registerHandler('capsule-player:close', () => closeCapsulePlayer());
  ipcRegistry.registerHandler('capsule-player:is-open', () => isCapsulePlayerOpen());
};
