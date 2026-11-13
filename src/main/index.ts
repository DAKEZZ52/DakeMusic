import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDisableGpuAccelerationSetting, getHighDpiSettings } from './storage/settings';
import { migrateLegacyUserData } from './storage/userDataMigration';

// 开发模式：把 userData 指到项目内，避免 %AppData% 下的权限/锁文件问题。
// 打包版保持默认 %AppData%\LyriseMusic 不变。
if (!app.isPackaged) {
  const devUserData = path.join(app.getAppPath(), '.dev-userdata');
  if (!fs.existsSync(devUserData)) {
    fs.mkdirSync(devUserData, { recursive: true });
  }
  app.setPath('userData', devUserData);
} else {
  // 品牌改名：把 DakeMusic / EchoMusic 时期的用户数据整体搬到新目录
  migrateLegacyUserData();
}

// Windows 音频/媒体会话初始化前先固定应用身份，避免系统把后续会话识别成临时客户端。
if (process.platform === 'win32') {
  app.setAppUserModelId('com.lyrise.music');
}

// 禁用 Chromium 备用 renderer 预热，减少启动后空闲 renderer 常驻。
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
}

// 必须在 app.ready 之前读取并应用 GPU 加速设置
if (getDisableGpuAccelerationSetting()) {
  app.disableHardwareAcceleration();
}

// 高 DPI 支持：在 app.ready 前让 Chromium 使用指定设备缩放因子。
const highDpiSettings = getHighDpiSettings();
if (highDpiSettings.enabled) {
  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', String(highDpiSettings.dpiScale));
}

// ===== 彩蛋设备唯一ID（一台设备永久固定）=====
const deviceIdFilePath = path.join(app.getPath('userData'), 'device-id.json');
let deviceId: string;
if (fs.existsSync(deviceIdFilePath)) {
  try {
    deviceId = JSON.parse(fs.readFileSync(deviceIdFilePath, 'utf-8')).id;
  } catch {
    deviceId = uuidv4();
    fs.writeFileSync(deviceIdFilePath, JSON.stringify({ id: deviceId }), 'utf-8');
  }
} else {
  deviceId = uuidv4();
  fs.writeFileSync(deviceIdFilePath, JSON.stringify({ id: deviceId }), 'utf-8');
}
ipcMain.handle('egg:getDeviceId', () => deviceId);

// 品牌改名后旧版仍留在系统里：首次启动延迟静默卸载，不阻塞启动。
if (app.isPackaged) {
  setTimeout(() => {
    void import('./storage/legacyAppCleanup')
      .then((module) => module.cleanupLegacyApps())
      .catch(() => {});
  }, 15_000).unref?.();
}

// 远程功能开关：启动时拉一次，之后每 10 分钟刷新（离线时沿用上次状态，默认全开）。
void import('./remoteFlags').then((module) => module.startRemoteFlags()).catch(() => {});

void import('./app');
