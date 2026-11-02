/**
 * DakeMusic - 文件关联处理
 * 当用户双击 .flac/.mp3 等文件时，Windows 会把文件路径作为命令行参数传给应用。
 * 本模块负责从 argv 中提取音频文件路径，并发送给渲染层播放。
 */
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import log from './logger';

const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.wma',
  '.ape',
  '.alac',
  '.aiff',
  '.aif',
  '.dsf',
  '.dff',
  '.wv',
  '.webm',
  '.caf',
]);

/** 从 argv 中提取存在的音频文件路径（跳过 flags 和内部参数）。 */
export function extractAudioFilesFromArgv(argv: string[]): string[] {
  const files: string[] = [];
  for (const arg of argv) {
    if (!arg || arg.startsWith('-') || arg.startsWith('--')) continue;
    // 跳过 dakemusic:// 协议 URL
    if (arg.includes('://')) continue;
    // 跳过 electron/vite 内部路径（含 node_modules、dist、electron.exe 本身）
    if (/[\\/](node_modules|dist|dist-electron)[\\/]/.test(arg)) continue;
    if (/electron\.exe$/i.test(arg)) continue;
    // 检查文件是否存在且是音频格式
    try {
      if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
        const ext = path.extname(arg).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          files.push(path.resolve(arg));
        }
      }
    } catch {
      // 忽略无法访问的路径
    }
  }
  return files;
}

/** 把音频文件路径发送给渲染层播放。 */
export function sendAudioFilesToRenderer(
  getMainWindow: () => BrowserWindow | null,
  files: string[],
): boolean {
  if (files.length === 0) return false;
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return false;
  log.info(`[FileAssociation] 打开文件: ${files.join(', ')}`);
  win.webContents.send('app:open-audio-files', files);
  return true;
}

/** 启动时处理 argv 中的音频文件。 */
export function openAudioFilesFromArgv(
  getMainWindow: () => BrowserWindow | null,
  argv: string[],
): boolean {
  const files = extractAudioFilesFromArgv(argv);
  if (files.length === 0) return false;
  // 如果窗口还没加载完，等一下再发
  const win = getMainWindow();
  if (!win || win.webContents.isLoading()) {
    win?.webContents.once('did-finish-load', () => {
      sendAudioFilesToRenderer(getMainWindow, files);
    });
    return true;
  }
  return sendAudioFilesToRenderer(getMainWindow, files);
}
