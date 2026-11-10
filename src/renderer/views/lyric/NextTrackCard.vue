<script setup lang="ts">
/**
 * 歌词页「下一首」预告卡
 *
 * 当前歌快放完时（默认最后 20 秒）淡入，显示队列里的下一首，点一下直接切歌。
 * 数据取自迷你播放器的快照（主窗口持续同步的队列），不额外维护队列状态。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Cover from '@/components/ui/Cover.vue';
import { usePlayerStore } from '@/stores/player';
import type { MiniPlayerSnapshot } from '../../../shared/miniPlayer';

const props = withDefaults(defineProps<{ threshold?: number }>(), { threshold: 20 });

const player = usePlayerStore();
const snapshot = ref<MiniPlayerSnapshot | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
let dismissedFor = '';

const nextTrack = computed(() => {
  const queue = snapshot.value?.queue;
  if (!queue?.tracks?.length) return null;
  const index = queue.currentTrackId
    ? queue.tracks.findIndex((item) => item.trackId === queue.currentTrackId)
    : -1;
  return index >= 0 ? (queue.tracks[index + 1] ?? null) : null;
});

const remaining = computed(() => {
  const duration = Number(snapshot.value?.playback?.duration) || 0;
  const current = Number(snapshot.value?.playback?.currentTime) || 0;
  return duration > 0 ? duration - current : Number.POSITIVE_INFINITY;
});

const visible = computed(() => {
  const track = nextTrack.value;
  if (!track) return false;
  if (dismissedFor && dismissedFor === track.trackId) return false;
  return remaining.value <= props.threshold && remaining.value > 0;
});

const refresh = async () => {
  try {
    snapshot.value = await window.electron.miniPlayer.getSnapshot();
  } catch {
    // 主窗口未就绪时静默忽略
  }
};

const skip = () => {
  dismissedFor = nextTrack.value?.trackId ?? '';
  void player.next();
};

onMounted(() => {
  void refresh();
  timer = setInterval(refresh, 2000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<template>
  <Transition name="next-fade">
    <button
      v-if="visible && nextTrack"
      type="button"
      class="next-card"
      aria-label="切换到下一首"
      @click="skip"
    >
      <Cover
        :url="nextTrack.coverUrl ?? ''"
        :size="80"
        :width="40"
        :height="40"
        :border-radius="8"
        class="next-cover"
      />
      <span class="next-meta">
        <span class="next-label">下一首</span>
        <span class="next-title">{{ nextTrack.title }}</span>
        <span class="next-artist">{{ nextTrack.artist }}</span>
      </span>
    </button>
  </Transition>
</template>

<style scoped>
.next-card {
  position: absolute;
  right: 28px;
  bottom: 104px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 280px;
  padding: 8px 14px 8px 8px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(20, 22, 28, 0.82);
  color: #fff;
  text-align: left;
  cursor: pointer;
  backdrop-filter: blur(var(--surface-blur-md, 18px));
  -webkit-backdrop-filter: blur(var(--surface-blur-md, 18px));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  transition:
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.2s ease;
  z-index: 20;
}

.next-card:hover {
  transform: translateY(-2px);
  background: rgba(30, 33, 40, 0.9);
}

.next-cover {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
}

.next-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.next-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);
}

.next-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 17px;
  max-width: 200px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.next-artist {
  font-size: 11px;
  line-height: 15px;
  color: rgba(255, 255, 255, 0.6);
  max-width: 200px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.next-fade-enter-active,
.next-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.next-fade-enter-from,
.next-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
