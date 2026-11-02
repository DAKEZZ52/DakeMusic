/**
 * DakeMusic 下载路径模块
 * 作者：知之Dake
 * 文件：downloadPaths.ts
 * 描述：保存文件名的安全化与生成、扩展名推断（显式/URL/Content-Type/音质）、重名避让、临时文件路径
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DownloadSongMeta } from '../../shared/download';

/** Windows 与跨平台都不允许出现在文件名中的字符。 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
/** 控制字符与换行。 */
const CONTROL_CHARS = /[\x00-\x1f\x80-\x9f\r\n\t]/g;

/** Content-Type -> 文件扩展名 映射。 */
const CONTENT_TYPE_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/** 音质标识 -> 文件扩展名 兜底映射。 */
const QUALITY_EXT: Record<string, string> = {
  '128': 'mp3',
  '320': 'mp3',
  flac: 'flac',
  high: 'flac',
};

/** 清理文件名中的非法字符，返回可安全用于文件系统的片段。 */
export const sanitizeFilenamePart = (value: string): string =>
  (value ?? '')
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, ''); // Windows 不允许文件名以点结尾

/**
 * 推断文件扩展名（不含点），优先级：
 * 显式指定 > URL 路径后缀 > Content-Type > 音质 > 默认 mp3。
 */
export const inferExtName = (args: {
  explicit?: string;
  url?: string;
  contentType?: string;
  quality?: string;
}): string => {
  const explicit = args.explicit?.trim().replace(/^\.+/, '').toLowerCase();
  if (explicit && /^[a-z0-9]{2,5}$/.test(explicit)) return explicit;

  if (args.url) {
    try {
      const pathname = new URL(args.url).pathname;
      const dot = pathname.lastIndexOf('.');
      if (dot >= 0) {
        const ext = pathname.slice(dot + 1).toLowerCase();
        if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
      }
    } catch {
      // URL 无法解析时忽略，继续后续推断
    }
  }

  if (args.contentType) {
    const mime = args.contentType.split(';')[0].trim().toLowerCase();
    if (CONTENT_TYPE_EXT[mime]) return CONTENT_TYPE_EXT[mime];
  }

  if (args.quality && QUALITY_EXT[args.quality]) return QUALITY_EXT[args.quality];
  return 'mp3';
};

/** 生成不含扩展名的基础文件名："歌手 - 歌名"。 */
export const buildBaseFileName = (song: DownloadSongMeta): string => {
  const artist = sanitizeFilenamePart(song.artist);
  const title = sanitizeFilenamePart(song.title);
  let name = artist ? `${artist} - ${title}` : title;
  name = name.trim();
  if (!name) name = `未知歌曲_${sanitizeFilenamePart(String(song.id ?? '')) || Date.now()}`;
  // 限制文件名总长度，避免超长路径
  return name.slice(0, 150);
};

/** 判断文件/目录是否存在。 */
const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * 在保存目录中解析一个不冲突的最终文件路径；
 * 同名时依次追加 (1)、(2)…
 */
export const resolveTargetPath = async (
  saveDir: string,
  baseName: string,
  extName: string,
): Promise<string> => {
  let candidate = path.join(saveDir, `${baseName}.${extName}`);
  let index = 1;
  while (await pathExists(candidate)) {
    candidate = path.join(saveDir, `${baseName} (${index}).${extName}`);
    index += 1;
  }
  return candidate;
};

/**
 * 生成与目标文件对应的临时文件路径（下载中写入此文件，完成后再 rename）。
 * 断点续传依赖该路径在任务生命周期内保持稳定。
 */
export const buildTempPath = (targetPath: string): string => `${targetPath}.download`;
