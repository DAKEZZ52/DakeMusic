<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSettingStore } from '@/stores/setting';
import { useToastStore } from '@/stores/toast';
import Switch from '@/components/ui/Switch.vue';
import Button from '@/components/ui/Button.vue';
import { Icon } from '@iconify/vue';
import SettingsSectionShell from './SettingsSectionShell.vue';
import { sectionTitles } from '../constants';

const settingStore = useSettingStore();
const toastStore = useToastStore();

const busy = ref(false);
const running = ref(false);
const activePort = ref(0);
const url = computed(() => (running.value ? `http://127.0.0.1:${activePort.value}/overlay` : ''));

const syncStatus = async () => {
  try {
    const status = await window.electron?.obsOverlay?.status();
    running.value = Boolean(status?.running);
    activePort.value = Number(status?.port) || 0;
  } catch {
    running.value = false;
    activePort.value = 0;
  }
};

const start = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await window.electron?.obsOverlay?.start(settingStore.obsOverlayPort);
    if (result?.ok) {
      settingStore.obsOverlayEnabled = true;
      settingStore.obsOverlayPort = result.port;
      running.value = true;
      activePort.value = result.port;
      toastStore.success(`OBS 浏览器源已开启：${result.url}`);
    } else {
      settingStore.obsOverlayEnabled = false;
      running.value = false;
      toastStore.warning(result?.error || '启动失败');
    }
  } finally {
    busy.value = false;
  }
};

const stop = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    await window.electron?.obsOverlay?.stop();
    settingStore.obsOverlayEnabled = false;
    running.value = false;
    activePort.value = 0;
  } finally {
    busy.value = false;
  }
};

const toggle = (value: boolean) => {
  if (value) void start();
  else void stop();
};

const readUrl = (style: 'card' | 'minimal') => (running.value ? `${url.value}?style=${style}` : '');

const copy = async (text: string) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toastStore.success('地址已复制');
  } catch {
    toastStore.warning('复制失败，请手动选择');
  }
};

onMounted(syncStatus);
watch(
  () => settingStore.obsOverlayEnabled,
  () => void syncStatus(),
);
</script>

<template>
  <SettingsSectionShell id="interface" :title="sectionTitles.interface.label">
    <template #icon>
      <Icon
        v-if="sectionTitles.interface.icon"
        :icon="sectionTitles.interface.icon"
        width="20"
        height="20"
        class="text-primary-text"
      />
    </template>

    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">音质音效徽标</h3>
        <p class="text-sm text-text-secondary">在播放器音质按钮上显示当前实际音质或音效标识</p>
      </div>
      <Switch v-model="settingStore.showAudioQualityBadge" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">桌面歌词状态</h3>
        <p class="text-sm text-text-secondary">在播放器桌面歌词图标上显示开启或关闭状态角标</p>
      </div>
      <Switch v-model="settingStore.showDesktopLyricStatus" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">播放列表计数</h3>
        <p class="text-sm text-text-secondary">在播放器播放列表图标上显示计数</p>
      </div>
      <Switch v-model="settingStore.showPlaylistCount" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">搜索框默认推荐词</h3>
        <p class="text-sm text-text-secondary">在搜索框显示默认推荐词，可能有广告</p>
      </div>
      <Switch v-model="settingStore.searchDefaultEnabled" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <div class="space-y-1">
        <h3 class="font-semibold">侧边栏折叠</h3>
        <p class="text-sm text-text-secondary">启用后可通过快捷键或标题栏按钮折叠侧边栏</p>
      </div>
      <Switch v-model="settingStore.sidebarCollapseEnabled" />
    </div>

    <div class="settings-divider"></div>
    <!-- OBS 浏览器源 -->
    <div class="settings-item items-start">
      <div class="space-y-1 min-w-0">
        <h3 class="font-semibold">OBS 浏览器源</h3>
        <p class="text-sm text-text-secondary">
          直播时把「正在播放」浮层叠在画面上。只在本机 127.0.0.1 提供，不对外网开放。
        </p>
        <div v-if="running" class="obs-lines">
          <div class="obs-line">
            <span class="obs-tag">卡片</span>
            <code class="obs-url">{{ readUrl('card') }}</code>
            <Button variant="ghost" size="sm" @click="copy(readUrl('card'))">复制</Button>
          </div>
          <div class="obs-line">
            <span class="obs-tag">极简</span>
            <code class="obs-url">{{ readUrl('minimal') }}</code>
            <Button variant="ghost" size="sm" @click="copy(readUrl('minimal'))">复制</Button>
          </div>
          <p class="obs-hint">
            OBS → 来源 → + → 浏览器 → 粘贴地址；宽高建议 1280×720，勾选「关闭源时关闭页面」即可。
          </p>
        </div>
      </div>
      <Switch
        :model-value="settingStore.obsOverlayEnabled"
        :disabled="busy"
        @update:model-value="toggle"
      />
    </div>
  </SettingsSectionShell>
</template>

<style scoped>
.obs-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.obs-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.obs-tag {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--color-text-secondary);
  background: var(--control-hover-bg);
}

.obs-url {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.obs-hint {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 17px;
  color: var(--color-text-secondary);
  opacity: 0.85;
}
</style>
