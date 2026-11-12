/**
 * LyriseMusic 用户数据目录迁移
 * 描述：品牌改名后，把旧版本（DakeMusic / EchoMusic）的用户目录整体搬到新目录，
 * 保证升级后设置、播放历史、缓存、日志全部原样保留。
 *
 * 目录名以 Electron 的 app name 为准（package.json 的 name），因此历史目录是
 * `dake-music` / `echomusic` 这类小写连字符名，早期手工改名可能留下首字母大写形式，
 * 两种情况都要覆盖。
 *
 * 必须在 app.ready 之前调用，且早于 logger 初始化——此时 logger 还不可用，
 * 因此只用 console 记录，避免把日志写进尚未迁移的旧目录。
 */
import { app } from 'electron';
import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

/** 历史产品用过的用户目录名，按从新到旧排列 */
export const LEGACY_USER_DATA_DIR_NAMES = [
  'dake-music',
  'echomusic',
  'DakeMusic',
  'EchoMusic',
] as const;

/** 迁移完成标记，避免每次启动都重新合并 */
const MIGRATION_MARKER = '.lyrise-data-migrated';

/**
 * 把旧的用户目录迁移到当前 userData 路径。
 *
 * - 已迁移过（存在标记）：直接返回
 * - 当前目录不存在：优先 rename（同盘瞬间完成），失败则递归复制
 * - 当前目录已存在（例如新版本先启动过一次）：合并复制，不覆盖已有文件
 * - 全部失败：保持旧目录不动，应用照常启动
 */
export const migrateLegacyUserData = (): void => {
  if (!app.isPackaged) return;

  let currentPath: string;
  let appDataPath: string;
  try {
    currentPath = app.getPath('userData');
    appDataPath = app.getPath('appData');
  } catch (error) {
    console.warn('[UserData] 无法解析用户数据路径，跳过迁移:', error);
    return;
  }

  const markerPath = join(currentPath, MIGRATION_MARKER);
  if (existsSync(markerPath)) return;

  let migratedFrom: string | null = null;

  for (const name of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyPath = join(appDataPath, name);
    if (!existsSync(legacyPath)) continue;

    if (!existsSync(currentPath)) {
      try {
        renameSync(legacyPath, currentPath);
        migratedFrom = name;
        break;
      } catch (renameError) {
        console.warn(`[UserData] 目录移动失败，改为复制：${name}`, renameError);
      }
    }

    try {
      cpSync(legacyPath, currentPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      // 复制完成后清理旧目录，避免用户磁盘上长期留着旧品牌文件夹
      try {
        rmSync(legacyPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`[UserData] 旧目录清理失败（不影响使用）: ${name}`, cleanupError);
      }
      migratedFrom = name;
      break;
    } catch (copyError) {
      console.error(`[UserData] 迁移失败，保留旧目录 ${name}:`, copyError);
    }
  }

  if (!migratedFrom) return;

  try {
    writeFileSync(markerPath, `${migratedFrom}\n`, 'utf8');
  } catch (error) {
    console.warn('[UserData] 写入迁移标记失败:', error);
  }
  console.log(`[UserData] 已从 ${migratedFrom} 迁移用户数据到 ${currentPath}`);
};
