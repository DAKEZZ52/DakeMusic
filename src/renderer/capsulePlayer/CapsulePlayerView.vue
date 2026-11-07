<script setup lang="ts">
/**
 * 迷你胶囊播放器
 *
 * 独立小窗（344×92），贴屏幕右下角：封面 + 歌名 + 上一首/播放/下一首 + 关闭。
 * 数据走迷你播放器已有的快照通道（主窗口持续推送），不依赖本窗口的 store。
 * 「唱歌模式」那套迷你窗保持原样，两者互不影响。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import CrossfadeCover from '@/components/ui/CrossfadeCover.vue';
import type { MiniPlayerSnapshot } from '../../shared/miniPlayer';
import { iconMusic, iconPause, iconPlay, iconSkipBack, iconSkipForward, iconX } from '@/icons';

const POLL_INTERVAL = 700;

const snapshot = ref<MiniPlayerSnapshot | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

const playback = computed(() => snapshot.value?.playback ?? null);
const title = computed(() => playback.value?.title || '未在播放');
const artist = computed(() => playback.value?.artist || 'DakeMusic');
const coverUrl = computed(() => playback.value?.coverUrl ?? '');
const isPlaying = computed(() => Boolean(playback.value?.isPlaying));

const progressPercent = computed(() => {
  const duration = Number(playback.value?.duration) || 0;
  const current = Number(playback.value?.currentTime) || 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
});

const refresh = async () => {
  try {
    snapshot.value = await window.electron.miniPlayer.getSnapshot();
  } catch {
    // 主窗口未就绪时静默跳过，下一次轮询会补上
  }
};

const command = (type: 'togglePlayback' | 'previousTrack' | 'nextTrack') => {
  window.electron?.miniPlayer?.command({ type } as never);
};

const closeCapsule = () => {
  void window.electron?.capsulePlayer?.close();
};

onMounted(() => {
  void refresh();
  timer = setInterval(refresh, POLL_INTERVAL);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<template>
  <div class="capsule-window">
    <div class="capsule-card">
      <div class="capsule-drag">
        <div class="capsule-cover">
          <CrossfadeCover
            v-if="coverUrl"
            :url="coverUrl"
            :size="120"
            :width="52"
            :height="52"
            :border-radius="10"
          />
          <div v-else class="capsule-cover-empty">
            <Icon :icon="iconMusic" width="20" height="20" />
          </div>
        </div>

        <div class="capsule-meta">
          <span class="capsule-title">{{ title }}</span>
          <span class="capsule-artist">{{ artist }}</span>
        </div>
      </div>

      <div class="capsule-actions">
        <button
          type="button"
          class="capsule-btn"
          aria-label="上一首"
          @click="command('previousTrack')"
        >
          <Icon :icon="iconSkipBack" width="18" height="18" />
        </button>
        <button
          type="button"
          class="capsule-btn capsule-btn-primary"
          :aria-label="isPlaying ? '暂停' : '播放'"
          @click="command('togglePlayback')"
        >
          <Icon :icon="isPlaying ? iconPause : iconPlay" width="18" height="18" />
        </button>
        <button type="button" class="capsule-btn" aria-label="下一首" @click="command('nextTrack')">
          <Icon :icon="iconSkipForward" width="18" height="18" />
        </button>
        <button
          type="button"
          class="capsule-btn capsule-btn-close"
          aria-label="关闭胶囊"
          @click="closeCapsule"
        >
          <Icon :icon="iconX" width="16" height="16" />
        </button>
      </div>

      <span class="capsule-progress">
        <span class="capsule-progress-bar" :style="{ width: `${progressPercent}%` }"></span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.capsule-window {
  width: 100vw;
  height: 100vh;
  padding: 6px;
  box-sizing: border-box;
  background: transparent;
  overflow: hidden;
}

.capsule-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  padding: 10px 10px 12px;
  box-sizing: border-box;
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(var(--surface-blur-md));
  -webkit-backdrop-filter: blur(var(--surface-blur-md));
  overflow: hidden;
}

.capsule-drag {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  -webkit-app-region: drag;
}

.capsule-cover {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--control-muted-bg);
}

.capsule-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.capsule-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.capsule-title {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.capsule-artist {
  font-size: 11px;
  line-height: 16px;
  color: var(--color-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.capsule-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.capsule-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.capsule-btn:hover {
  color: var(--text-main);
  background: color-mix(in srgb, var(--text-main) 8%, transparent);
}

.capsule-btn-primary {
  color: var(--color-primary-text);
}

.capsule-btn-close:hover {
  color: var(--color-danger, #e5484d);
}

.capsule-progress {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 6px;
  height: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--text-main) 10%, transparent);
  overflow: hidden;
  pointer-events: none;
}

.capsule-progress-bar {
  display: block;
  height: 100%;
  border-radius: 1px;
  background: var(--color-primary);
  transition: width 0.3s linear;
}
</style>
