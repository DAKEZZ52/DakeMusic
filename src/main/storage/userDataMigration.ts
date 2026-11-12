/**
 * LyriseMusic 用户数据目录迁移
 * 描述：品牌改名后，把旧版本（DakeMusic / EchoMusic）的用户目录整体搬到新目录，
 * 保证升级后设置、播放历史、缓存、日志全部原样保留。
 *
 * 必须在 app.ready 之前调用，且在 logger 初始化之前——此时 logger 还不可用，
 * 因此只用 console 记录，避免把日志写进尚未迁移的旧目录。
 */
import { app } from 'electron';
import { cpSync, existsSync, renameSync, rmSync } from 'fs';
import { join } from 'path';

/** 历史产品用过的用户目录名，按从新到旧排列 */
export const LEGACY_USER_DATA_DIR_NAMES = ['DakeMusic', 'EchoMusic'] as const;

/**
 * 把旧的用户目录迁移到当前 userData 路径。
 *
 * - 当前目录已存在：视为已迁移或全新安装，不做任何事
 * - 旧目录存在：优先 rename（同盘瞬间完成），失败则递归复制后删除旧目录
 * - 全部失败：保持旧目录不动，应用照常启动（只是数据留在旧目录）
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

  if (existsSync(currentPath)) return;

  for (const name of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyPath = join(appDataPath, name);
    if (!existsSync(legacyPath)) continue;

    try {
      renameSync(legacyPath, currentPath);
      console.log(`[UserData] 已迁移用户数据：${name} -> ${currentPath}`);
      return;
    } catch (renameError) {
      console.warn(`[UserData] 目录移动失败，改为复制：${name}`, renameError);
    }

    try {
      cpSync(legacyPath, currentPath, { recursive: true });
      rmSync(legacyPath, { recursive: true, force: true });
      console.log(`[UserData] 已复制并清理旧目录：${name}`);
      return;
    } catch (copyError) {
      console.error(`[UserData] 迁移失败，保留旧目录 ${name}:`, copyError);
      rmSync(currentPath, { recursive: true, force: true });
      return;
    }
  }
};
