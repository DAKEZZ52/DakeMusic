/**
 * LyriseMusic - 设置备份 IPC 注册
 * 作者：知之（DAKE知之）
 * 说明：仅注册应用设置备份的导出 / 检查 / 导入通道，插件备份 API 已移除。
 */
import type {
  SettingsBackupExportRequest,
  SettingsBackupExportResult,
  SettingsBackupImportRequest,
  SettingsBackupImportResult,
  SettingsBackupInspectResult,
} from '../../shared/settingsBackup';
import {
  exportSettingsBackup,
  importSettingsBackup,
  inspectSettingsBackup,
} from '../settingsBackup';
import { ipcRegistry } from './registry';

export const registerSettingsBackupHandlers = () => {
  ipcRegistry.registerHandler(
    'settings-backup:export',
    (_event, request: SettingsBackupExportRequest): Promise<SettingsBackupExportResult> =>
      exportSettingsBackup(request),
  );
  ipcRegistry.registerHandler(
    'settings-backup:inspect',
    (): Promise<SettingsBackupInspectResult> => inspectSettingsBackup(),
  );
  ipcRegistry.registerHandler(
    'settings-backup:import',
    (_event, request: SettingsBackupImportRequest): Promise<SettingsBackupImportResult> =>
      importSettingsBackup(request),
  );
};
