/**
 * DakeMusic 本地数据库路径
 * 描述：确定存储库文件位置，并把旧版沿用下来的旧文件名一次性迁移到新文件名。
 * 迁移成功后删除旧文件，用户目录里只保留 DakeMusic 自己的文件名。
 */
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

export const DATABASE_FILENAME = 'dakemusic.sqlite';
/** 旧版沿用下来的数据库文件名，仅用于一次性迁移 */
export const LEGACY_DATABASE_FILENAME = 'echomusic.sqlite';

/** SQLite 主库与 WAL / SHM 伴生文件，必须一起处理才能保证数据一致 */
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

/**
 * 返回实际要打开的数据库路径。
 *
 * - 新库已存在：直接用新库（迁移已经做过，或全新安装）
 * - 只有旧库：拷贝成新库（含 WAL/SHM），删除旧文件，返回新库路径
 * - 拷贝失败：清掉半成品，回退旧库，避免新旧两份数据分叉
 */
const legacyFiles = (legacy: string) =>
  DATABASE_FILE_SUFFIXES.map((suffix) => `${legacy}${suffix}`).filter((file) => existsSync(file));

const removeLegacyFiles = (legacy: string) => {
  for (const file of legacyFiles(legacy)) {
    try {
      unlinkSync(file);
    } catch {
      // 删除失败不影响新库使用，下次启动会再次尝试
    }
  }
};

export const resolveDatabasePath = (userDataPath: string): string => {
  const target = join(userDataPath, DATABASE_FILENAME);
  const legacy = join(userDataPath, LEGACY_DATABASE_FILENAME);
  if (!existsSync(legacy)) return target;
  // 新库已就绪：清掉上次迁移没删掉的旧文件，避免旧品牌文件长期残留
  if (existsSync(target)) {
    removeLegacyFiles(legacy);
    return target;
  }

  const copied: string[] = [];
  try {
    for (const suffix of DATABASE_FILE_SUFFIXES) {
      const from = `${legacy}${suffix}`;
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
    return legacy;
  }

  // 迁移完成：删掉旧文件名，避免用户目录里残留旧品牌文件
  removeLegacyFiles(legacy);
  return target;
};
