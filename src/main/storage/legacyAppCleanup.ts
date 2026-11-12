/**
 * LyriseMusic 旧版应用清理
 * 描述：品牌改名后 appId 变化（com.dake.dakemusic → com.lyrise.music），Windows 会把
 * 旧版与新版当成两个软件。用户升级后旧版仍留在系统里，需要在首次启动时静默卸载。
 *
 * NSIS 安装器里遍历卸载项受 label 作用域限制，改在主进程完成：
 * electron-builder 的卸载项键名是生成的 GUID，只能按 DisplayName 前缀识别。
 */
import { execFile } from 'child_process';
import { app } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

/** 历史产品的显示名前缀（DisplayName 形如 "DakeMusic 2.4.8"） */
const LEGACY_DISPLAY_NAME_PREFIXES = ['DakeMusic', 'EchoMusic'] as const;

/** 清理完成标记，避免每次启动都扫描注册表 */
const CLEANUP_MARKER = '.legacy-app-cleaned';

export interface LegacyInstallEntry {
  displayName: string;
  uninstallString: string;
}

/** 通过 reg query 列出卸载项（含 DisplayName / UninstallString） */
export const findLegacyInstalls = (): Promise<LegacyInstallEntry[]> =>
  new Promise((resolve) => {
    const hiveRoots = [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    const found: LegacyInstallEntry[] = [];
    let pending = hiveRoots.length;

    const done = () => {
      pending -= 1;
      if (pending <= 0) resolve(found);
    };

    for (const root of hiveRoots) {
      execFile(
        'reg',
        ['query', root, '/s', '/f', 'DakeMusic', '/t', 'REG_SZ'],
        { windowsHide: true },
        (error, stdout) => {
          if (error || !stdout) {
            done();
            return;
          }
          let displayName = '';
          let uninstallString = '';
          for (const rawLine of stdout.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (/^DisplayName\s+REG_SZ\s+/i.test(line)) {
              displayName = line.replace(/^DisplayName\s+REG_SZ\s+/i, '').trim();
            } else if (/^UninstallString\s+REG_SZ\s+/i.test(line)) {
              uninstallString = line.replace(/^UninstallString\s+REG_SZ\s+/i, '').trim();
            }
          }
          const isLegacy = LEGACY_DISPLAY_NAME_PREFIXES.some((prefix) =>
            displayName.toLowerCase().startsWith(prefix.toLowerCase()),
          );
          if (isLegacy && uninstallString) {
            found.push({ displayName, uninstallString });
          }
          done();
        },
      );
    }
  });

const normalizeUninstallerPath = (value: string) => {
  const trimmed = value.trim();
  const quoted = /^"([^"]+)"/.exec(trimmed);
  if (quoted) return { file: quoted[1], args: trimmed.slice(quoted[0].length).trim() };
  const [file, ...rest] = trimmed.split(/\s+/);
  return { file, args: rest.join(' ') };
};

/** 静默卸载一个旧版安装 */
const uninstallLegacy = (entry: LegacyInstallEntry) =>
  new Promise<void>((resolve) => {
    const { file } = normalizeUninstallerPath(entry.uninstallString);
    if (!file || !existsSync(file)) {
      resolve();
      return;
    }
    execFile(file, ['/S'], { windowsHide: true, timeout: 60_000 }, () => resolve());
  });

/**
 * 首次启动时清理旧版安装。打包版才执行；带标记文件保证只跑一次。
 */
export const cleanupLegacyApps = async (): Promise<void> => {
  if (!app.isPackaged || process.platform !== 'win32') return;

  let markerPath: string;
  try {
    markerPath = join(app.getPath('userData'), CLEANUP_MARKER);
  } catch {
    return;
  }
  if (existsSync(markerPath)) return;

  try {
    const legacy = await findLegacyInstalls();
    for (const entry of legacy) {
      await uninstallLegacy(entry);
    }
    if (legacy.length > 0) {
      console.log(`[LegacyCleanup] 已卸载 ${legacy.length} 个旧版安装`);
    }
  } catch (error) {
    console.warn('[LegacyCleanup] 清理旧版安装失败:', error);
  }

  try {
    writeFileSync(markerPath, `${Date.now()}\n`, 'utf8');
  } catch {
    // 标记写入失败最多导致下次再扫一次
  }
};

/** 供测试/调试使用的注册表扫描（不卸载） */
export const listLegacyInstalls = findLegacyInstalls;
