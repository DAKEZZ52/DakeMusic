import { spawn } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import log from '../logger';

/**
 * Windows 11 22H2+ 原生圆角。
 *
 * 本项目主窗口是 frameless（frame: false），系统不会自动给圆角；
 * 通过 DWM 的 DWMWA_WINDOW_CORNER_PREFERENCE(=33) 设为 DWMWCP_ROUND(=2) 即可拿到
 * 系统级 8px 圆角，且不需要透明窗口（不影响毛玻璃/主题背景）。
 *
 * 这里不引入原生依赖，直接用一次性的 PowerShell 调用 dwmapi，失败时静默降级为直角。
 */
export function applyWindowsRoundedCorners(win: BrowserWindow): void {
  if (process.platform !== 'win32') return;

  let hwndText = '';
  try {
    const handle = win.getNativeWindowHandle();
    // x64: 8 字节指针；ia32: 4 字节
    hwndText =
      handle.length >= 8
        ? handle.readBigUInt64LE(0).toString()
        : handle.readUInt32LE(0).toString();
  } catch (error) {
    log.warn('[Window] 读取窗口句柄失败，跳过圆角设置', error);
    return;
  }

  if (!hwndText || hwndText === '0') return;

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace Native -Name Dwm -MemberDefinition @'
[DllImport("dwmapi.dll")]
public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
'@
$hwnd = [IntPtr]${hwndText}
$value = 2
[Native.Dwm]::DwmSetWindowAttribute($hwnd, 33, [ref]$value, 4) | Out-Null
`;

  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { stdio: 'ignore', windowsHide: true },
    );
    child.on('error', (error) => {
      log.warn('[Window] 设置系统圆角失败（已降级为直角）', error);
    });
    child.unref();
  } catch (error) {
    log.warn('[Window] 启动圆角设置进程失败', error);
  }
}
