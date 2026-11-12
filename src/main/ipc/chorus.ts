/**
 * LyriseMusic 语聊房 - 合唱伴奏读取
 * 描述：把本地歌曲文件读成 ArrayBuffer 交给渲染层解码（走 IPC，避免 file:// 的 CSP/CORS 限制）。
 *       只允许读取常见音频扩展名，且有大小上限。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ipcRegistry } from './registry';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus']);
const MAX_BYTES = 100 * 1024 * 1024;

export const registerChorusHandlers = () => {
  ipcRegistry.registerHandler('chorus:read-local-audio', async (_event, filePath: unknown) => {
    const target = String(filePath ?? '').trim();
    if (!target) throw new Error('伴奏路径为空');
    if (!path.isAbsolute(target)) throw new Error('伴奏路径必须是绝对路径');
    const ext = path.extname(target).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`不支持的音频格式：${ext || '未知'}`);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat || !stat.isFile()) throw new Error('伴奏文件不存在');
    if (stat.size > MAX_BYTES) throw new Error('伴奏文件超过 100MB');
    const buffer = await fs.readFile(target);
    return buffer;
  });
};
