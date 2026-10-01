<script setup lang="ts">
import { computed } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui';
import Popover from '@/components/ui/Popover.vue';
import Button from '@/components/ui/Button.vue';
import { usePlayerStore } from '@/stores/player';
import { iconSpeedometer } from '@/icons';
import { usePlayerControls } from '@/composables/usePlayerControls';

const playerStore = usePlayerStore();
const {
  player,
  playbackRateDisplay,
  handlePlaybackRateSlider,
  resetPlaybackRate,
  setPlaybackRate,
} = usePlayerControls();

// 升降调
const pitchDisplay = computed(() => {
  const v = playerStore.pitch;
  if (v === 0) return '原调';
  return v > 0 ? `+${v}` : `${v}`;
});

const handlePitchSlider = (value: number[] | undefined) => {
  if (!value || value.length === 0) return;
  const semitones = value[0] - 6;
  playerStore.setPitch(semitones);
};

const resetPitch = () => {
  playerStore.setPitch(0);
};

const setPitch = (semitones: number) => {
  playerStore.setPitch(semitones);
};

interface Props {
  variant?: 'lyric' | 'bar';
  side?: 'top' | 'bottom';
}

withDefaults(defineProps<Props>(), {
  variant: 'bar',
  side: 'top',
});

const isActive = computed(() => playerStore.pitch !== 0 || player.playbackRate !== 1);
</script>

<template>
  <Popover
    trigger="hover"
    :side="side"
    align="center"
    :side-offset="8"
    :show-arrow="true"
    content-class="pitch-speed-popover"
  >
    <template #trigger>
      <Button
        variant="unstyled"
        size="none"
        type="button"
        class="p-2 transition-all"
        :class="
          isActive
            ? variant === 'lyric'
              ? 'text-black dark:text-white hover:scale-110 active:scale-90'
              : 'text-primary-text hover:scale-110 active:scale-90'
            : variant === 'lyric'
              ? 'text-black/40 dark:text-white/40 hover:scale-110 active:scale-90'
              : 'text-text-main/50 hover:text-primary-text hover:scale-110 active:scale-90'
        "
        aria-label="升降调与倍速"
      >
        <Icon :icon="iconSpeedometer" width="20" height="20" />
      </Button>
    </template>

    <div class="space-y-4">
      <!-- 升降调（上） -->
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold opacity-50 shrink-0">升降调</span>
          <span class="text-[10px] opacity-30 text-center flex-1 leading-tight whitespace-normal">我曾是小孩，如今已成巨人</span>
          <Button
            variant="unstyled"
            size="none"
            class="text-[13px] font-extrabold px-1.5 py-0.5 rounded-md transition-colors shrink-0"
            :class="playerStore.pitch === 0 ? 'opacity-40' : 'hover:bg-[var(--control-hover-bg)]'"
            @click="resetPitch"
            >{{ pitchDisplay }}</Button
          >
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold opacity-40 shrink-0">-6</span>
          <SliderRoot
            class="relative flex items-center select-none touch-none cursor-pointer flex-1 h-5"
            :model-value="[playerStore.pitch + 6]"
            :min="0"
            :max="12"
            :step="1"
            orientation="horizontal"
            @update:model-value="handlePitchSlider"
          >
            <SliderTrack class="pitch-track relative grow rounded-full h-[3px] cursor-pointer">
              <SliderRange class="pitch-range absolute h-full rounded-full" />
            </SliderTrack>
            <SliderThumb
              class="pitch-thumb block w-3 h-3 cursor-pointer border rounded-full shadow-md focus-visible:outline-none"
            />
          </SliderRoot>
          <span class="text-[10px] font-semibold opacity-40 shrink-0">+6</span>
        </div>
        <div class="flex items-center justify-between">
          <Button
            v-for="p in [-6, -3, -1, 0, 1, 3, 6]"
            :key="p"
            variant="unstyled"
            size="none"
            class="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
            :class="
              playerStore.pitch === p
                ? 'bg-[var(--row-selected-bg)]'
                : 'opacity-50 hover:bg-[var(--row-hover-bg)] hover:opacity-100'
            "
            @click="setPitch(p)"
            >{{ p === 0 ? '0' : p > 0 ? `+${p}` : p }}</Button
          >
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-[var(--border-subtle)]"></div>

      <!-- 倍速播放（下） -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold opacity-50">倍速播放</span>
          <Button
            variant="unstyled"
            size="none"
            class="text-[13px] font-extrabold px-1.5 py-0.5 rounded-md transition-colors"
            :class="player.playbackRate === 1 ? 'opacity-40' : 'hover:bg-[var(--control-hover-bg)]'"
            @click="resetPlaybackRate"
            >{{ playbackRateDisplay }}</Button
          >
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold opacity-40 shrink-0">0.1</span>
          <SliderRoot
            class="relative flex items-center select-none touch-none cursor-pointer flex-1 h-5"
            :model-value="[Math.round(player.playbackRate * 10)]"
            :min="1"
            :max="50"
            :step="1"
            orientation="horizontal"
            @update:model-value="handlePlaybackRateSlider"
          >
            <SliderTrack class="speed-track relative grow rounded-full h-[3px] cursor-pointer">
              <SliderRange class="speed-range absolute h-full rounded-full" />
            </SliderTrack>
            <SliderThumb
              class="speed-thumb block w-3 h-3 cursor-pointer border rounded-full shadow-md focus-visible:outline-none"
            />
          </SliderRoot>
          <span class="text-[10px] font-semibold opacity-40 shrink-0">5x</span>
        </div>
        <div class="flex items-center justify-between">
          <Button
            v-for="r in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]"
            :key="r"
            variant="unstyled"
            size="none"
            class="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
            :class="
              Math.abs(player.playbackRate - r) < 0.01
                ? 'bg-[var(--row-selected-bg)]'
                : 'opacity-50 hover:bg-[var(--row-hover-bg)] hover:opacity-100'
            "
            @click="setPlaybackRate(r)"
            >{{ r === Math.floor(r) ? r.toFixed(1) : r }}x</Button
          >
        </div>
      </div>
    </div>
  </Popover>
</template>

<style>
.pitch-speed-popover.echo-popover-content {
  width: 320px;
  padding: 14px 16px 12px;
  border-color: var(--border-subtle);
}

.pitch-track,
.speed-track {
  background: var(--control-track-bg);
}

.pitch-range,
.speed-range {
  background: var(--color-primary);
}

.pitch-thumb,
.speed-thumb {
  background: var(--control-thumb-bg);
  border-color: var(--control-border);
  box-shadow: var(--shadow-control);
}
</style>
