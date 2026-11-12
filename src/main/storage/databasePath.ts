/**
 * LyriseMusic 本地数据库路径
 * 描述：确定存储库文件位置，并把历史版本沿用下来的旧文件名一次性迁移到新文件名。
 * 迁移成功后删除旧文件，用户目录里只保留 LyriseMusic 自己的文件名。
 */
import { copyFileSync, existsSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

export const DATABASE_FILENAME = 'lyrise.sqlite';
/** 历史版本用过的数据库文件名，按从新到旧排列，仅用于一次性迁移 */
export const LEGACY_DATABASE_FILENAMES = ['dakemusic.sqlite', 'echomusic.sqlite'] as const;

/** SQLite 主库与 WAL / SHM 伴生文件，必须一起处理才能保证数据一致 */
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

/** 小于该体积的主库视为"刚创建还没写入数据"，允许被旧库覆盖 */
const EMPTY_DATABASE_BYTES = 128 * 1024;

const fileSize = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const existingFiles = (basePath: string) =>
  DATABASE_FILE_SUFFIXES.map((suffix) => `${basePath}${suffix}`).filter((file) => existsSync(file));

const removeFiles = (basePath: string) => {
  for (const file of existingFiles(basePath)) {
    try {
      unlinkSync(file);
    } catch {
      // 删除失败不影响新库使用，下次启动会再次尝试
    }
  }
};

/**
 * 返回实际要打开的数据库路径。
 *
 * - 没有旧库：直接用新库
 * - 新库不存在：把旧库（含 WAL/SHM）复制成新库，删掉旧文件
 * - 新库存在但明显是空库（例如新版本先启动过一次）：以旧库为准覆盖
 * - 新库已有真实数据：保留新库，只清理旧文件
 * - 复制失败：清掉半成品，回退旧库，避免新旧两份数据分叉
 */
export const resolveDatabasePath = (userDataPath: string): string => {
  const target = join(userDataPath, DATABASE_FILENAME);
  const existingLegacies = LEGACY_DATABASE_FILENAMES.map((name) => join(userDataPath, name)).filter(
    (legacy) => existsSync(legacy),
  );

  if (existingLegacies.length === 0) return target;

  // 取体积最大的旧库（升级路径上可能同时存在 dakemusic 与 echomusic 两代文件）
  const source = existingLegacies.reduce((best, candidate) =>
    fileSize(candidate) > fileSize(best) ? candidate : best,
  );

  const targetExists = existsSync(target);
  const targetIsEmpty = !targetExists || fileSize(target) < EMPTY_DATABASE_BYTES;
  const sourceHasData = fileSize(source) > fileSize(target);

  if (!targetExists || (targetIsEmpty && sourceHasData)) {
    const copied: string[] = [];
    try {
      // 覆盖前先清掉目标库的伴生文件，避免 WAL 与新主库不匹配
      if (targetExists) removeFiles(target);
      for (const suffix of DATABASE_FILE_SUFFIXES) {
        const from = `${source}${suffix}`;
        if (!existsSync(from)) continue;
        const to = `${target}${suffix}`;
        copyFileSync(from, to);
        copied.push(to);
      }
    } catch {
      for (const file of copied) {
        try {
          unlinkSync(file);
        } catch {
          // 清理失败不影响继续使用旧库
        }
      }
      return source;
    }
  }

  // 迁移完成：删除全部旧文件名
  for (const legacy of existingLegacies) removeFiles(legacy);
  return target;
};
