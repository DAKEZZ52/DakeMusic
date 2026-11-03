<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import { computed } from 'vue';
import { iconFullscreen, iconMinus, iconPictureInPicture, iconSquare, iconX } from '@/icons';
import { useSettingStore } from '@/stores/setting';
withDefaults(defineProps<{ showMiniPlayer?: boolean }>(), { showMiniPlayer: false });
const settings = useSettingStore();
const openMiniPlayer = () => {
  void window.electron.miniPlayer.show();
};
const toggleFullscreen = () => window.electron.windowControl('fullscreen');
const minimizeWindow = () => window.electron.windowControl('minimize');
const toggleMaximize = () => window.electron.windowControl('maximize');
const closeWindow = () => window.electron.windowControl('close');
const isMac = window.electron.platform === 'darwin';
// Windows/Linux 自绘窗口控制（原生 WCO 已禁用），macOS 用系统红绿灯不渲染
const showCustomControls = computed(() => !isMac);
</script>

<template>
  <div class="window-actions no-drag">
    <Button
      v-if="showMiniPlayer"
      variant="unstyled"
      size="none"
      class="window-action window-action-soft"
      tooltip="唱歌模式"
      aria-label="打开唱歌模式"
      @click="openMiniPlayer"
    >
      <Icon :icon="iconPictureInPicture" width="20" height="20" />
    </Button>
    <Button
      v-if="!isMac && settings.showFullscreenButton"
      variant="unstyled"
      size="none"
      class="window-action window-action-soft"
      tooltip="全屏 (F11)"
      aria-label="切换全屏"
      @click="toggleFullscreen"
    >
      <Icon :icon="iconFullscreen" width="20" height="20" />
    </Button>
    <template v-if="showCustomControls">
      <Button
        variant="unstyled"
        size="none"
        class="window-action"
        tooltip="最小化"
        aria-label="最小化窗口"
        @click="minimizeWindow"
      >
        <Icon :icon="iconMinus" width="20" height="20" />
      </Button>
      <Button
        variant="unstyled"
        size="none"
        class="window-action"
        tooltip="最大化"
        aria-label="最大化窗口"
        @click="toggleMaximize"
      >
        <Icon :icon="iconSquare" width="20" height="20" />
      </Button>
      <Button
        variant="unstyled"
        size="none"
        class="window-action window-close-action"
        tooltip="关闭窗口"
        aria-label="关闭窗口"
        @click="closeWindow"
      >
        <Icon :icon="iconX" width="20" height="20" />
      </Button>
    </template>
  </div>
</template>

<style scoped>
.window-actions {
  display: flex;
  align-items: center;
  height: 100%;
  position: relative;
  z-index: 10;
}
.window-action {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 默认态与顶栏其他按钮（.titlebar-action / .more-trigger）一致：主文字色，hover 提亮。
     歌词页通过 --window-action-color / --window-action-hover-color 覆盖为白色系。 */
  color: var(--window-action-color, var(--color-text-main));
  background: transparent;
  transition:
    color 0.2s,
    background-color 0.2s;
}
.window-action:hover {
  color: var(--window-action-hover-color, var(--color-text-main));
  background: color-mix(in srgb, var(--color-text-main) 8%, transparent);
}
/* 关闭按钮 hover：Windows 惯例红色背景 */
.window-close-action:hover {
  color: #ffffff;
  background: #e81123;
}
/* 窗口控制图标：纤细线条小尺寸（同参考图），不加粗不放大 */
.window-action svg {
  width: 20px;
  height: 20px;
}
</style>
