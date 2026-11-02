import type {
  LocalAudioFile,
  LocalAudioMetadata,
  LocalAudioScanOptions,
  LocalAudioScanResult,
} from '../shared/localMusic';
import { LOCAL_AUDIO_EXTENSIONS } from '../shared/localMusic';
import { readAudioMetadata, resolveAudioTitleAndArtist } from './media/audioMetadata';
import { scanLocalFiles, type ScannedLocalFile } from './media/fileScanner';

/** 元数据解析并发池大小：I/O 密集任务，适度并发即可显著缩短大目录扫描时间。 */
const METADATA_CONCURRENCY = 6;

/** 简单 mapLimit：按 limit 并发执行 mapper，保持输入顺序返回结果。 */
const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

export const readLocalAudioFile = async (file: ScannedLocalFile): Promise<LocalAudioFile> => {
  let metadata: LocalAudioMetadata | undefined;
  try {
    metadata = await readAudioMetadata(file.path);
  } catch {
    metadata = undefined;
  }
  const { title, artist } = resolveAudioTitleAndArtist(file.name, metadata);
  return {
    name: file.name,
    path: file.path,
    size: file.size,
    modifiedAt: file.modifiedAt,
    extension: file.extension,
    relativePath: file.relativePath,
    title,
    artist,
    album: metadata?.album,
    duration: metadata?.duration,
  };
};

export const scanLocalAudioFiles = async (
  directoryPath: string,
  options: LocalAudioScanOptions = {},
): Promise<LocalAudioScanResult> => {
  const errors: string[] = [];
  const scan = await scanLocalFiles(directoryPath, {
    recursive: options.recursive ?? true,
    includeHidden: Boolean(options.includeHidden),
    limit: options.limit,
    maxDepth: options.maxDepth,
    maxFileSize: options.maxFileSize,
    extensions: LOCAL_AUDIO_EXTENSIONS,
    onError: (message) => errors.push(message),
  });
  const files: LocalAudioFile[] = [];
  // 元数据解析使用并发池（METADATA_CONCURRENCY=6），大幅缩短大目录扫描耗时；
  // 后续如需处理数万级曲库，可进一步升级为 worker_threads + 增量扫描。
  const parsed = await mapLimit(scan.files, METADATA_CONCURRENCY, readLocalAudioFile);
  files.push(...parsed);
  return {
    root: scan.root,
    files,
    errors: errors.length > 0 ? errors : undefined,
    limitReached: scan.limitReached,
  };
};
