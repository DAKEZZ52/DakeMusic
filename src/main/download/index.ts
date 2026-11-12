/**
 * LyriseMusic 下载 IPC 模块
 * 作者：知之Dake
 * 文件：index.ts
 * 描述：注册歌曲下载相关的 IPC 处理器（创建/列表/暂停/继续/取消/重试/删除、设置、选目录、打开文件）
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { dialog } from 'electron';
import { ipcRegistry } from '../ipc/registry';
import type { IpcContext } from '../ipc/types';
import { getDownloadManager } from './DownloadManager';
import {
  DOWNLOAD_IPC_CHANNELS,
  type DownloadCreateRequest,
  type DownloadSettings,
} from '../../shared/download';

/** 注册下载模块全部 IPC 处理器。 */
export const registerDownloadHandlers = (context: IpcContext): void => {
  const manager = getDownloadManager({ getMainWindow: context.getMainWindow });
  // 初始化（加载 session、恢复任务），不阻塞注册
  void manager.init();

  // 新建下载任务
  ipcRegistry.registerHandler(
    DOWNLOAD_IPC_CHANNELS.create,
    (_event, request: DownloadCreateRequest) => manager.createTask(request),
  );

  // 获取全部任务
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.list, () => manager.listTasks());

  // 暂停
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.pause, (_event, id: string) =>
    manager.pauseTask(id),
  );

  // 继续（断点续传）
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.resume, (_event, id: string) =>
    manager.resumeTask(id),
  );

  // 取消
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.cancel, (_event, id: string) =>
    manager.cancelTask(id),
  );

  // 从列表移除
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.remove, (_event, id: string) =>
    manager.removeTask(id),
  );

  // 失败重试
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.retry, (_event, id: string) =>
    manager.retryTask(id),
  );

  // 清除已完成 / 已取消
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.clearFinished, () => manager.clearFinished());

  // 读取设置
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.getSettings, () => manager.getSettings());

  // 更新设置
  ipcRegistry.registerHandler(
    DOWNLOAD_IPC_CHANNELS.updateSettings,
    (_event, patch: Partial<DownloadSettings>) => manager.saveSettings(patch),
  );

  // 弹出目录选择框
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.chooseSaveDir, async () => {
    const window = context.getMainWindow();
    const result = await dialog.showOpenDialog(window as Electron.BrowserWindow, {
      title: '选择下载保存目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return '';
    manager.saveSettings({ saveDir: result.filePaths[0] });
    return result.filePaths[0];
  });

  // 打开已下载文件
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.openFile, (_event, id: string) =>
    manager.openFile(id),
  );

  // 在文件管理器中定位
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.openFolder, (_event, id: string) =>
    manager.revealFile(id),
  );

  // 打开下载保存目录
  ipcRegistry.registerHandler(DOWNLOAD_IPC_CHANNELS.openSaveDir, () => manager.openSaveDir());
};
