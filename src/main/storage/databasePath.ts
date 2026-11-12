/**
 * LyriseMusic 本地数据库路径
 * 描述：确定存储库文件位置，并把历史版本沿用下来的旧文件名一次性迁移到新文件名。
 * 迁移成功后删除旧文件，用户目录里只保留 LyriseMusic 自己的文件名。
 */
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

export const DATABASE_FILENAME = 'lyrise.sqlite';
/** 历史版本用过的数据库文件名，按从新到旧排列，仅用于一次性迁移 */
export const LEGACY_DATABASE_FILENAMES = ['dakemusic.sqlite', 'echomusic.sqlite'] as const;

/** SQLite 主库与 WAL / SHM 伴生文件，必须一起处理才能保证数据一致 */
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

const existingFiles = (basePath: string) =>
  DATABASE_FILE_SUFFIXES.map((suffix) => `${basePath}${suffix}`).filter((file) => existsSync(file));

const removeLegacyFiles = (legacyPath: string) => {
  for (const file of existingFiles(legacyPath)) {
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
 * - 新库已存在：直接用新库，并清理残留的旧文件
 * - 只有旧库：拷贝成新库（含 WAL/SHM），删除旧文件，返回新库路径
 * - 拷贝失败：清掉半成品，回退旧库，避免新旧两份数据分叉
 */
export const resolveDatabasePath = (userDataPath: string): string => {
  const target = join(userDataPath, DATABASE_FILENAME);
  const legacyPaths = LEGACY_DATABASE_FILENAMES.map((name) => join(userDataPath, name));
  const existingLegacies = legacyPaths.filter((legacy) => existsSync(legacy));

  if (existingLegacies.length === 0) return target;

  // 新库已就绪：清掉旧文件，避免旧品牌文件名长期残留
  if (existsSync(target)) {
    for (const legacy of existingLegacies) removeLegacyFiles(legacy);
    return target;
  }

  const source = existingLegacies[0];
  const copied: string[] = [];
  try {
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

  // 迁移完成：删除全部旧文件名
  for (const legacy of existingLegacies) removeLegacyFiles(legacy);
  return target;
};
