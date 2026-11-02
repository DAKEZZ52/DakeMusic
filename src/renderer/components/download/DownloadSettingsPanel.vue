<!--
 * DakeMusic - 下载设置组件
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：下载设置分区内容：保存目录（打开/更改）、同时下载数（步进 1~8）、
 *      写入歌曲信息开关，设置读写直接走 download store。
 *      只渲染内容区不画外壳，由页面壳与「下载统计」共用一个分区卡。
 -->
<script setup lang="ts">
defineOptions({ name: 'download-settings-panel' });

import { computed } from 'vue';
import Button from '@/components/ui/Button.vue';
import Switch from '@/components/ui/Switch.vue';
import { useDownloadStore } from '@/stores/download';

const downloadStore = useDownloadStore();

/** 下载目录显示（为空时使用默认目录）。 */
const saveDirText = computed(
  () => downloadStore.settings.saveDir || '默认下载目录（音乐文件夹 / DakeMusic）',
);

/** 并发数（用于步进按钮）。 */
const concurrency = computed(() => downloadStore.settings.maxConcurrency);

/** 调整并发数。 */
const changeConcurrency = (delta: number) => {
  const next = Math.min(8, Math.max(1, concurrency.value + delta));
  if (next !== concurrency.value) void downloadStore.updateSettings({ maxConcurrency: next });
};

/** 是否写入内嵌元数据（标题/歌手/专辑/封面/歌词）。 */
const writeMetadata = computed({
  get: () => downloadStore.settings.writeMetadata,
  set: (value: boolean) => {
    void downloadStore.updateSettings({ writeMetadata: value });
  },
});
</script>

<template>
  <div class="download-settings-block">
    <h2 class="dlm-section-title">下载设置</h2>
    <div class="dlm-settings">
      <!-- 保存目录 -->
      <div class="dlm-setting-row">
        <span class="dlm-setting-label">保存目录</span>
        <div class="dlm-setting-control">
          <span class="dlm-setting-path">{{ saveDirText }}</span>
          <Button variant="secondary" size="sm" @click="downloadStore.openSaveDir()">
            打开文件夹
          </Button>
          <Button variant="secondary" size="sm" @click="downloadStore.chooseSaveDir()">
            更改
          </Button>
        </div>
      </div>

      <!-- 并发数 -->
      <div class="dlm-setting-row">
        <span class="dlm-setting-label">同时下载数</span>
        <div class="dlm-setting-control">
          <Button
            variant="secondary"
            size="sm"
            :disabled="concurrency <= 1"
            @click="changeConcurrency(-1)"
          >
            -
          </Button>
          <span class="dlm-setting-value">{{ concurrency }}</span>
          <Button
            variant="secondary"
            size="sm"
            :disabled="concurrency >= 8"
            @click="changeConcurrency(1)"
          >
            +
          </Button>
        </div>
      </div>

      <!-- 写入元数据 -->
      <div class="dlm-setting-row">
        <div class="dlm-setting-text">
          <span class="dlm-setting-label">写入歌曲信息</span>
          <span class="dlm-setting-hint">下载后内嵌标题、歌手、专辑、封面与歌词</span>
        </div>
        <Switch v-model="writeMetadata" class="shrink-0" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "@/style.css";

.download-settings-block {
  display: flex;
  flex-direction: column;
}

/* === 下载设置 === */
.dlm-section-title {
  margin: 0 0 10px 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
}

.dlm-settings {
  display: flex;
  flex-direction: column;
}

.dlm-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.dlm-setting-row + .dlm-setting-row {
  border-top: 1px solid var(--border-subtle);
}

.dlm-setting-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-main);
  flex-shrink: 0;
}

.dlm-setting-control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dlm-setting-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.dlm-setting-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-main);
  width: 24px;
  text-align: center;
}

.dlm-setting-text {
  display: flex;
  flex-direction: column;
}

.dlm-setting-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 3px;
}
</style>
