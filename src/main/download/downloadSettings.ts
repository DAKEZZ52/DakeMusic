/**
 * LyriseMusic 下载设置模块
 * 作者：知之Dake
 * 文件：downloadSettings.ts
 * 描述：下载设置的读取、规整与持久化（KV），以及默认保存目录的解析
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { app } from 'electron';
import path from 'node:path';
import { getKvStorage } from '../storage/kv';
import { normalizeDownloadSettings, type DownloadSettings } from '../../shared/download';

/** 下载设置在 KV 中的键。 */
const DOWNLOAD_SETTINGS_KEY = 'main:downloadSettings';

/** 默认下载目录名（位于系统"音乐"目录下）。 */
const DEFAULT_DOWNLOAD_DIR_NAME = 'LyriseMusic';

/** 读取下载设置（缺失或损坏时回退默认值）。 */
export const getDownloadSettings = (): DownloadSettings => {
  const saved = getKvStorage().get<Partial<DownloadSettings>>(DOWNLOAD_SETTINGS_KEY);
  return normalizeDownloadSettings(saved ?? undefined);
};

/** 局部更新下载设置并持久化，返回更新后的完整设置。 */
export const updateDownloadSettings = (patch: Partial<DownloadSettings>): DownloadSettings => {
  const next = normalizeDownloadSettings({ ...getDownloadSettings(), ...patch });
  getKvStorage().set(DOWNLOAD_SETTINGS_KEY, next);
  return next;
};

/** 获取默认保存目录（系统"音乐"目录下的 LyriseMusic 文件夹）。 */
export const getDefaultSaveDir = (): string =>
  path.join(app.getPath('music'), DEFAULT_DOWNLOAD_DIR_NAME);

/**
 * 解析当前生效的保存目录：
 * 用户自定义目录优先；为空或目录不可用时回退到默认目录。
 */
export const resolveSaveDir = (settings: DownloadSettings = getDownloadSettings()): string => {
  const custom = settings.saveDir?.trim();
  return custom ? custom : getDefaultSaveDir();
};
