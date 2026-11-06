<script setup lang="ts">
/**
 * 切歌浮卡
 *
 * 交互参考 Folia 的 app/overlays/NowPlayingToast（AGPL-3.0，仅借鉴「切歌时浮出一张卡」的点子，
 * 布局、动画、消失逻辑都是自己实现）。
 *
 * 什么时候出现：换歌时（不含首次加载），4.5 秒后自动收起，点一下立即收起。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import Cover from '@/components/ui/Cover.vue';
import { usePlayerStore } from '@/stores/player';
import { usePlayerControls } from '@/composables/usePlayerControls';

const player = usePlayerStore();
const { currentTrack } = usePlayerControls();

const visible = ref(false);
const shownTrackId = ref<string | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const track = computed(() => currentTrack.value);

/** 播放进度百分比：时长未知时按 0 处理 */
const progressPercent = computed(() => {
  const duration = Number(player.duration) || 0;
  const current = Number(player.currentTime) || 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
});

const clearHideTimer = () => {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = null;
};

const dismiss = () => {
  clearHideTimer();
  visible.value = false;
};

const trackKey = computed(() => {
  const current = track.value;
  if (!current) return '';
  return `${current.id ?? ''}|${current.name ?? ''}`;
});

watch(trackKey, (next) => {
  if (!next) {
    dismiss();
    return;
  }
  // 首次加载不弹（用户刚打开应用，不需要提示）
  if (shownTrackId.value === null) {
    shownTrackId.value = next;
    return;
  }
  if (shownTrackId.value === next) return;
  shownTrackId.value = next;

  clearHideTimer();
  visible.value = true;
  hideTimer = setTimeout(() => {
    visible.value = false;
    hideTimer = null;
  }, 4500);
});

onUnmounted(clearHideTimer);
</script>

<template>
  <Transition name="now-playing-fade">
    <div v-if="visible && track" class="now-playing-toast" role="status" aria-live="polite">
      <button type="button" class="now-playing-card" @click="dismiss">
        <Cover
          :url="track.coverUrl || track.cover"
          :size="96"
          :alt="track.name"
          class="now-playing-cover"
        />
        <span class="now-playing-text">
          <span class="now-playing-label">正在播放</span>
          <span class="now-playing-title">{{ track.name }}</span>
          <span class="now-playing-artist">{{ track.artist }}</span>
        </span>
        <span class="now-playing-close" aria-hidden="true">×</span>
      </button>
      <span class="now-playing-progress" aria-hidden="true">
        <span class="now-playing-progress-bar" :style="{ width: `${progressPercent}%` }"></span>
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.now-playing-toast {
  position: fixed;
  right: 20px;
  bottom: 108px;
  z-index: 2600;
  width: 288px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--floating-surface-bg, var(--bg-card));
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
  backdrop-filter: var(--floating-surface-filter, none);
  -webkit-backdrop-filter: var(--floating-surface-filter, none);
}

.now-playing-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px 10px 10px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.now-playing-cover {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
}

.now-playing-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.now-playing-label {
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
}

.now-playing-title {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.now-playing-artist {
  font-size: 11px;
  line-height: 16px;
  color: var(--color-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.now-playing-close {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  color: var(--color-text-secondary);
}

.now-playing-progress {
  display: block;
  height: 2px;
  background: color-mix(in srgb, var(--text-main) 10%, transparent);
}

.now-playing-progress-bar {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width 0.4s linear;
}

.now-playing-fade-enter-active,
.now-playing-fade-leave-active {
  transition:
    opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.now-playing-fade-enter-from,
.now-playing-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
