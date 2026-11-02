/*
 * DakeMusic - 本地音乐库 IPC
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：本地音乐库的扫描、持久化与目录管理通道。
 *       - 持久化：库列表与曲目缓存写入 userData/local-music-libraries.json，
 *         再次启动无需重新全量扫描。
 *       - 扫描：复用 localMusic.ts 的扫描与元数据解析（并发池解析元数据）。
 */
import { app, dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ipcRegistry } from './registry';
import { readLocalAudioFile, scanLocalAudioFiles } from '../localMusic';
import type {
  LocalAudioFile,
  LocalMusicAddFilesResult,
  LocalMusicLibrary,
} from '../../shared/localMusic';
import { LOCAL_SINGLES_LIBRARY_ID } from '../../shared/localMusic';
import { LOCAL_AUDIO_EXTENSIONS } from '../../shared/localMusic';
import type { ScannedLocalFile } from '../media/fileScanner';

/** 库持久化文件（userData 下）。 */
const getLibrariesFilePath = () => path.join(app.getPath('userData'), 'local-music-libraries.json');

/** 由根路径派生稳定库 ID：规范化路径取 sha1 前 16 位。 */
export const createLibraryId = (root: string) => {
  const normalized = path.resolve(String(root || '').trim());
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16);
};

/** 读取持久化库列表；文件缺失或损坏时返回空数组。 */
export const readLocalMusicLibraries = async (): Promise<LocalMusicLibrary[]> => {
  try {
    const raw = await fs.readFile(getLibrariesFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is LocalMusicLibrary =>
          item && typeof item.id === 'string' && typeof item.root === 'string',
      )
      .map((item) => ({ ...item, kind: item.kind === 'files' ? 'files' : 'folder' }));
  } catch {
    return [];
  }
};

/** 写入持久化库列表。 */
export const writeLocalMusicLibraries = async (libraries: LocalMusicLibrary[]) => {
  await fs.writeFile(getLibrariesFilePath(), JSON.stringify(libraries, null, 2), 'utf8');
};

/** 校验目录存在且为文件夹，返回规范化绝对路径。 */
const resolveLibraryRoot = async (input: string) => {
  const target = String(input || '').trim();
  if (!target) throw new Error('文件夹路径为空');
  const realPath = await fs.realpath(path.resolve(target));
  const stats = await fs.stat(realPath);
  if (!stats.isDirectory()) throw new Error('路径不是文件夹');
  return realPath;
};

/** 扫描一个目录为完整本地音乐库（并发解析元数据）。 */
const buildLibrary = async (root: string, scannedAt: number): Promise<LocalMusicLibrary> => {
  const result = await scanLocalAudioFiles(root, { recursive: true, limit: 5000, maxDepth: 24 });
  return {
    id: createLibraryId(root),
    root,
    name: path.basename(root) || root,
    kind: 'folder',
    addedAt: scannedAt,
    scannedAt,
    files: result.files,
  };
};

/** 由单个文件路径解析出 LocalAudioFile（复用目录扫描的元数据解析逻辑）。 */
const readSingleFile = async (filePath: string): Promise<LocalAudioFile> => {
  const target = path.resolve(String(filePath || '').trim());
  const stats = await fs.stat(target);
  const extension = path.extname(target).replace(/^\./, '').toLowerCase();
  const scanned: ScannedLocalFile = {
    name: path.basename(target),
    path: target,
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    extension,
    relativePath: path.basename(target),
    kind: 'file',
  };
  return await readLocalAudioFile(scanned);
};

/** 获取（或创建）「我的单曲」单曲库。 */
const getOrCreateSinglesLibrary = async (
  libraries: LocalMusicLibrary[],
  now: number,
): Promise<LocalMusicLibrary> => {
  const existing = libraries.find((library) => library.id === LOCAL_SINGLES_LIBRARY_ID);
  if (existing) return existing;
  const library: LocalMusicLibrary = {
    id: LOCAL_SINGLES_LIBRARY_ID,
    root: '',
    name: '我的单曲',
    kind: 'files',
    addedAt: now,
    scannedAt: now,
    files: [],
  };
  libraries.push(library);
  return library;
};

export function registerLocalMusicHandlers(): void {
  ipcRegistry.registerHandler('local-music:list-libraries', async () => {
    return await readLocalMusicLibraries();
  });

  ipcRegistry.registerHandler('local-music:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择本地音乐文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return await resolveLibraryRoot(result.filePaths[0]);
  });

  ipcRegistry.registerHandler('local-music:add-library', async (_event, root: string) => {
    const realRoot = await resolveLibraryRoot(root);
    const libraries = await readLocalMusicLibraries();
    const existing = libraries.find((library) => library.root === realRoot);
    if (existing) {
      // 已存在同根库：直接返回现有库，避免重复扫描。
      return existing;
    }
    const scannedAt = Date.now();
    const library = await buildLibrary(realRoot, scannedAt);
    libraries.push(library);
    await writeLocalMusicLibraries(libraries);
    return library;
  });

  ipcRegistry.registerHandler('local-music:remove-library', async (_event, id: string) => {
    const libraries = await readLocalMusicLibraries();
    const next = libraries.filter((library) => library.id !== String(id || ''));
    if (next.length === libraries.length) return false;
    await writeLocalMusicLibraries(next);
    return true;
  });

  ipcRegistry.registerHandler('local-music:rescan-library', async (_event, id: string) => {
    const libraries = await readLocalMusicLibraries();
    const target = libraries.find((library) => library.id === String(id || ''));
    if (!target) throw new Error('本地音乐库不存在');
    const scannedAt = Date.now();
    // 单曲库没有可重扫的目录：重新解析元数据并清理已不存在的文件。
    // 旧版本持久化的曲目可能缺 title/artist/album，重扫后补全标签信息。
    if (target.kind === 'files') {
      const kept: LocalAudioFile[] = [];
      for (const file of target.files) {
        try {
          await fs.access(file.path);
          const refreshed = await readSingleFile(file.path).catch(() => file);
          kept.push(refreshed);
        } catch {
          // 文件已不存在：从单曲库剔除。
        }
      }
      const rebuilt = { ...target, scannedAt, files: kept };
      const next = libraries.map((library) => (library.id === target.id ? rebuilt : library));
      await writeLocalMusicLibraries(next);
      return rebuilt;
    }
    const rebuilt = await buildLibrary(target.root, scannedAt);
    const next = libraries.map((library) => (library.id === target.id ? rebuilt : library));
    await writeLocalMusicLibraries(next);
    return rebuilt;
  });

  ipcRegistry.registerHandler(
    'local-music:add-files',
    async (): Promise<LocalMusicAddFilesResult> => {
      const result = await dialog.showOpenDialog({
        title: '添加本地单曲',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: '音频文件',
            extensions: LOCAL_AUDIO_EXTENSIONS,
          },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, library: null, addedCount: 0, skippedCount: 0 };
      }

      const libraries = await readLocalMusicLibraries();
      const now = Date.now();
      const singles = await getOrCreateSinglesLibrary(libraries, now);
      const existingPaths = new Set(singles.files.map((file) => file.path));
      const added: LocalAudioFile[] = [];
      let skippedCount = 0;

      for (const filePath of result.filePaths) {
        try {
          const parsed = await readSingleFile(filePath);
          if (existingPaths.has(parsed.path)) {
            skippedCount += 1;
            continue;
          }
          added.push(parsed);
          existingPaths.add(parsed.path);
        } catch {
          skippedCount += 1;
        }
      }

      if (added.length === 0) {
        await writeLocalMusicLibraries(libraries);
        return {
          canceled: false,
          library: singles,
          addedCount: 0,
          skippedCount: result.filePaths.length,
        };
      }

      const updated: LocalMusicLibrary = {
        ...singles,
        files: [...singles.files, ...added],
        scannedAt: now,
      };
      const next = libraries.map((library) =>
        library.id === LOCAL_SINGLES_LIBRARY_ID ? updated : library,
      );
      await writeLocalMusicLibraries(next);
      return { canceled: false, library: updated, addedCount: added.length, skippedCount };
    },
  );

  ipcRegistry.registerHandler(
    'local-music:remove-files',
    async (_event, filePaths: string[]): Promise<boolean> => {
      const targetPaths = new Set(
        (Array.isArray(filePaths) ? filePaths : [])
          .map((item) => path.resolve(String(item || '').trim()))
          .filter(Boolean),
      );
      if (targetPaths.size === 0) return false;
      const libraries = await readLocalMusicLibraries();
      let changed = false;
      const next = libraries.map((library) => {
        const files = library.files.filter((file) => !targetPaths.has(file.path));
        if (files.length !== library.files.length) changed = true;
        return files.length === library.files.length
          ? library
          : { ...library, files, scannedAt: Date.now() };
      });
      if (!changed) return false;
      await writeLocalMusicLibraries(next);
      return true;
    },
  );

  ipcRegistry.registerHandler(
    'local-music:file-exists',
    async (_event, filePath: string): Promise<boolean> => {
      try {
        await fs.access(String(filePath || '').trim());
        return true;
      } catch {
        return false;
      }
    },
  );
}

/** 供渲染层/其他模块读取单文件元数据（如本地封面后续扩展）。 */
export type { LocalAudioFile };
