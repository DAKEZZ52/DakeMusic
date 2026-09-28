import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDisableGpuAccelerationSetting, getHighDpiSettings } from './storage/settings';

// Windows 音频/媒体会话初始化前先固定应用身份，避免系统把后续会话识别成临时客户端。
if (process.platform === 'win32') {
  app.setAppUserModelId('com.dake.dakemusic');
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

void import('./app');
