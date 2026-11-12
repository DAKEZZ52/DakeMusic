<script setup lang="ts">
/**
 * LyriseMusic - 数据设置（备份与恢复 / 日志 / 清除数据）
 * 作者：知之（DAKE知之）
 * 说明：随插件系统剔除后精简为纯设置备份（本地文件）。
 */
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useSettingStore } from '@/stores/setting';
import { useToastStore } from '@/stores/toast';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import FontIcon from '@/components/ui/FontIcon.vue';
import Switch from '@/components/ui/Switch.vue';
import {
  sanitizePortableAppSettings,
  type SettingsBackupSummary,
} from '../../../../shared/settingsBackup';
import SettingsSectionShell from './SettingsSectionShell.vue';
import { sectionTitles } from '../constants';

const settingStore = useSettingStore();
const toastStore = useToastStore();

defineProps<{
  onClear: () => void;
}>();

const showExportDialog = ref(false);
const showRestoreSourceDialog = ref(false);
const showImportDialog = ref(false);
const exportSettings = ref(true);
const importSettings = ref(true);
const importToken = ref('');
const importSummary = ref<SettingsBackupSummary | null>(null);
const isExporting = ref(false);
const isInspecting = ref(false);
const isImporting = ref(false);

const canExport = computed(() => exportSettings.value);
const canImport = computed(
  () =>
    Boolean(importToken.value) && importSettings.value && importSummary.value?.includes.settings,
);

const formatBackupTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知时间' : date.toLocaleString('zh-CN');
};

const setRestorePreview = (token: string, summary: SettingsBackupSummary) => {
  importToken.value = token;
  importSummary.value = summary;
  importSettings.value = summary.includes.settings;
  showRestoreSourceDialog.value = false;
  showImportDialog.value = true;
};

const openExportDialog = () => {
  exportSettings.value = true;
  showExportDialog.value = true;
};

const handleExport = async () => {
  if (!canExport.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const settingsData = exportSettings.value
      ? sanitizePortableAppSettings(settingStore.$state)
      : undefined;
    const result = await window.electron.settingsBackup.export({
      settings: exportSettings.value,
      settingsData,
    });
    if (!result.ok) {
      if (!result.canceled) toastStore.warning(result.error || '创建备份失败');
      return;
    }
    showExportDialog.value = false;
    toastStore.success('备份已创建');
  } catch (error) {
    toastStore.warning(error instanceof Error ? error.message : '创建备份失败');
  } finally {
    isExporting.value = false;
  }
};

const openRestoreDialog = () => {
  showRestoreSourceDialog.value = true;
};

const handleChooseImport = async () => {
  if (isInspecting.value) return;
  isInspecting.value = true;
  try {
    const result = await window.electron.settingsBackup.inspect();
    if (!result.ok) {
      if (!result.canceled) toastStore.warning(result.error || '无法读取备份文件');
      return;
    }
    setRestorePreview(result.token, result.summary);
  } catch (error) {
    toastStore.warning(error instanceof Error ? error.message : '无法读取备份文件');
  } finally {
    isInspecting.value = false;
  }
};

const handleImport = async () => {
  if (!canImport.value || isImporting.value) return;
  isImporting.value = true;
  try {
    const result = await window.electron.settingsBackup.import({
      token: importToken.value,
      settings: importSettings.value,
    });
    if (!result.ok) {
      if ('canceled' in result && result.canceled) return;
      toastStore.warning(result.error || '从备份恢复失败', 6000);
      return;
    }
    showImportDialog.value = false;
    toastStore.success('恢复完成，正在重启 LyriseMusic…', 4000);
    window.setTimeout(() => {
      void window.electron.appInfo.relaunch();
    }, 450);
  } catch (error) {
    toastStore.warning(error instanceof Error ? error.message : '从备份恢复失败');
  } finally {
    isImporting.value = false;
  }
};
</script>

<template>
  <SettingsSectionShell id="data" :title="sectionTitles.data.label">
    <template #icon>
      <Icon
        v-if="sectionTitles.data.icon"
        :icon="sectionTitles.data.icon"
        width="20"
        height="20"
        class="text-primary-text"
      />
      <FontIcon v-else :size="20" class="text-primary-text" />
    </template>

    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">备份与恢复</h3>
        <p class="text-sm text-text-secondary">备份应用设置，或在其他设备恢复</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button variant="unstyled" size="none" class="settings-action" @click="openExportDialog">
          创建备份
        </Button>
        <Button variant="unstyled" size="none" class="settings-action" @click="openRestoreDialog">
          恢复备份
        </Button>
      </div>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">查看运行日志</h3>
        <p class="text-sm text-text-secondary">打开本地日志目录以供排查问题</p>
      </div>
      <Button
        variant="unstyled"
        size="none"
        class="settings-action"
        @click="settingStore.openLogDirectory()"
      >
        立即查看
      </Button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">清除应用数据</h3>
        <p class="text-sm text-text-secondary">移除所有持久化设置及缓存信息</p>
      </div>
      <Button
        variant="unstyled"
        size="none"
        class="settings-action settings-action-danger"
        @click="onClear"
      >
        立即清除
      </Button>
    </div>
  </SettingsSectionShell>

  <Dialog
    v-model:open="showExportDialog"
    title="创建备份"
    description="选择要写入备份文件的内容。账号登录状态、设备身份和本机文件路径不会被备份。"
    content-class="backup-dialog"
    :close-on-interact-outside="!isExporting"
    :close-on-escape="!isExporting"
  >
    <div class="backup-options">
      <div class="backup-option">
        <div class="min-w-0">
          <div class="backup-option-title">应用设置</div>
          <div class="backup-option-description">外观、播放、歌词、快捷键、网络等偏好</div>
        </div>
        <Switch v-model="exportSettings" class="shrink-0" :disabled="isExporting" />
      </div>
    </div>
    <p class="backup-warning">备份内容未加密，任何拿到数据的人都可能读取其中的设置内容。</p>
    <template #footer>
      <Button variant="outline" size="sm" :disabled="isExporting" @click="showExportDialog = false">
        取消
      </Button>
      <Button size="sm" :disabled="!canExport" :loading="isExporting" @click="handleExport">
        创建备份
      </Button>
    </template>
  </Dialog>

  <Dialog
    v-model:open="showRestoreSourceDialog"
    title="选择备份"
    description="从本机选择一个 LyriseMusic 备份文件"
    content-class="backup-dialog"
    :close-on-interact-outside="!isInspecting"
    :close-on-escape="!isInspecting"
  >
    <template #footer>
      <Button
        variant="outline"
        size="sm"
        :disabled="isInspecting"
        @click="showRestoreSourceDialog = false"
      >
        取消
      </Button>
      <Button
        size="sm"
        :disabled="isInspecting"
        :loading="isInspecting"
        @click="handleChooseImport"
      >
        选择本地备份
      </Button>
    </template>
  </Dialog>

  <Dialog
    v-model:open="showImportDialog"
    title="从备份恢复"
    description="恢复会覆盖所选项目的同名设置，并在完成后自动重启 LyriseMusic。"
    content-class="backup-dialog"
    :close-on-interact-outside="!isImporting"
    :close-on-escape="!isImporting"
  >
    <div v-if="importSummary" class="backup-meta">
      <span>备份版本：LyriseMusic {{ importSummary.appVersion || '未知' }}</span>
      <span>创建时间：{{ formatBackupTime(importSummary.createdAt) }}</span>
    </div>
    <div class="backup-options">
      <div v-if="importSummary?.includes.settings" class="backup-option">
        <div class="min-w-0">
          <div class="backup-option-title">应用设置</div>
          <div class="backup-option-description">{{ importSummary.settingCount }} 项可迁移设置</div>
        </div>
        <Switch v-model="importSettings" class="shrink-0" :disabled="isImporting" />
      </div>
    </div>
    <template #footer>
      <Button variant="outline" size="sm" :disabled="isImporting" @click="showImportDialog = false">
        取消
      </Button>
      <Button size="sm" :disabled="!canImport" :loading="isImporting" @click="handleImport">
        恢复并重启
      </Button>
    </template>
  </Dialog>
</template>

<style scoped src="../settingsSection.css"></style>
<style scoped>
@reference "@/style.css";

:global(.dialog-content.backup-dialog) {
  min-height: min(280px, calc(100vh - 240px));
  max-height: calc(100vh - 180px);
}

.backup-options {
  @apply space-y-3;
}

.backup-option {
  @apply flex items-center justify-between gap-5 rounded-xl border px-4 py-3;
  background: var(--control-muted-bg);
  border-color: var(--control-border);
}

.backup-option-title {
  @apply text-[13px] font-semibold text-text-main;
}

.backup-option-description {
  @apply mt-1 truncate text-[11px] text-text-secondary;
}

.backup-meta {
  @apply mb-3 flex flex-col gap-1 rounded-xl border px-4 py-3 text-[11px] text-text-secondary;
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 20%, var(--control-border));
}

.backup-warning {
  @apply mt-3 text-[11px] leading-5 text-text-secondary;
}
</style>
