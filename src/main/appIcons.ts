/**
 * DakeMusic - 应用默认图标解析模块
 * 作者：知之（DAKE知之）
 * 说明：仅解析托盘 / 窗口 / 各平台默认图标路径，插件自定义图标功能已随插件系统移除。
 */
import { app, type BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';

const resolveDefaultIconPath = (iconName: string) => {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', iconName)
    : join(process.cwd(), 'build/icons', iconName);
  return existsSync(iconPath) ? iconPath : '';
};

const getDefaultTrayIconName = () =>
  process.platform === 'darwin' ? 'IconTemplate.png' : 'win_tray_icon.ico';

export const resolveTrayIconPath = () => resolveDefaultIconPath(getDefaultTrayIconName());

export const resolveWindowIconPath = () => {
  const iconName =
    process.platform === 'win32'
      ? 'icon.ico'
      : process.platform === 'darwin'
        ? 'icon_macos.png'
        : 'icon.png';
  return resolveDefaultIconPath(iconName);
};

export const applyWindowAppIcon = (mainWindow: BrowserWindow | null) => {
  if (process.platform === 'darwin') return; // macOS 默认图标由 .app 元数据提供
  const iconPath = resolveWindowIconPath();
  if (!iconPath) return;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIcon(iconPath);
    }
  } catch {
    // 忽略窗口图标设置失败
  }
};
