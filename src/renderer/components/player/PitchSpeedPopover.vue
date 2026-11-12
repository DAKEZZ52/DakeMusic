<script setup lang="ts">
/**
 * LyriseMusic 播放控制 - 升降调 / 倍速弹层
 * 文件：PitchSpeedPopover.vue
 * 描述：升降调支持 ABC 调快速定位（以 C 为基准的 12 个调 + 原调，点击即跳转），
 *       滑块范围为 -12 ~ +12 半音（一个八度）；倍速播放保持原交互。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { computed, ref } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui';
import Popover from '@/components/ui/Popover.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';
import { usePlayerStore } from '@/stores/player';
import { iconSpeedometer, iconInfo } from '@/icons';
import { usePlayerControls } from '@/composables/usePlayerControls';

const playerStore = usePlayerStore();
const {
  player,
  playbackRateDisplay,
  handlePlaybackRateSlider,
  resetPlaybackRate,
  setPlaybackRate,
} = usePlayerControls();

// ===== 升降调（酷狗风格：-5 ~ +5 快捷调，降号记谱） =====
/** 半音 → 调名字母（降号记谱，与酷狗一致：-5=G … 0=C … +5=F）。 */
const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

/** 快捷升降调按键：-5 ~ +5 半音（0=原调 C）。 */
const QUICK_PITCHES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((v) => ({
  value: v,
  label: PITCH_NAMES[((v % 12) + 12) % 12],
}));

/** 半音偏移 → 调名（0 → 原调；其余按取模映射，如 +3 → Eb、-2 → Bb）。 */
const pitchDisplay = computed(() => {
  const v = playerStore.pitch;
  if (v === 0) return '原调';
  return `${PITCH_NAMES[((v % 12) + 12) % 12]} (${v > 0 ? '+' : ''}${v})`;
});

/** 滑块：-12 ~ +12 半音（UI 值 0 ~ 24）。 */
const handlePitchSlider = (value: number[] | undefined) => {
  if (!value || value.length === 0) return;
  const semitones = value[0] - 12;
  playerStore.setPitch(semitones);
};

const resetPitch = () => {
  playerStore.setPitch(0);
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

/** 当前调字母（0=原调时不显示；升降调生效时在触发按钮上展示，如 Eb、C#）。 */
const pitchLetter = computed(() => {
  const v = playerStore.pitch;
  if (v === 0) return null;
  return PITCH_NAMES[((v % 12) + 12) % 12];
});

/** 升降调说明展开/收起。 */
const showHelp = ref(false);
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
        <span class="relative inline-flex w-[26px] h-[26px] items-center justify-center">
          <Icon :icon="iconSpeedometer" width="26" height="26" />
          <Badge
            v-if="pitchLetter !== null"
            :count="pitchLetter"
            class="absolute top-2px"
            :style="{ right: '-16px' }"
          />
        </span>
      </Button>
    </template>

    <div class="space-y-4">
      <!-- 升降调（上）：ABC 调快速定位 -->
      <div class="space-y-3">
        <div class="relative flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold opacity-50 shrink-0">升降调</span>
          <Button
            variant="unstyled"
            size="none"
            class="absolute left-1/2 -translate-x-1/2 text-[13px] font-extrabold px-1.5 py-0.5 rounded-md transition-colors shrink-0"
            :class="playerStore.pitch === 0 ? 'opacity-40' : 'hover:bg-[var(--control-hover-bg)]'"
            @click="resetPitch"
            >{{ pitchDisplay }}</Button
          >
          <div class="flex items-center gap-0.5 shrink-0">
            <Button
              variant="unstyled"
              size="none"
              class="flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors bg-[var(--control-hover-bg)] opacity-70 hover:opacity-100"
              aria-label="查看升降调说明"
              @click="showHelp = true"
            >
              <Icon :icon="iconInfo" width="14" height="14" />
              <span class="text-[10px] font-semibold">说明</span>
            </Button>
          </div>
        </div>
        <div class="relative flex items-center gap-2">
          <span class="text-[10px] font-semibold opacity-40 shrink-0">-12</span>
          <div class="relative flex-1">
            <SliderRoot
              class="relative flex items-center select-none touch-none cursor-pointer flex-1 h-5"
              :model-value="[playerStore.pitch + 12]"
              :min="0"
              :max="24"
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
          </div>
          <span class="text-[10px] font-semibold opacity-40 shrink-0">+12</span>
        </div>
        <!-- 快捷升降调（酷狗风格）：-5 ~ +5 半音，0=原调 C -->
        <div class="flex items-center justify-between gap-0.5">
          <Button
            v-for="q in QUICK_PITCHES"
            :key="q.value"
            variant="unstyled"
            size="none"
            class="text-[11px] font-semibold px-1 py-1 rounded-md transition-colors"
            :class="
              playerStore.pitch === q.value
                ? 'bg-[var(--row-selected-bg)]'
                : 'opacity-50 hover:bg-[var(--row-hover-bg)] hover:opacity-100'
            "
            @click="playerStore.setPitch(q.value)"
            >{{ q.label }}</Button
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

  <!-- 升降调说明弹窗 -->
  <Dialog
    v-model:open="showHelp"
    title="升降调说明"
    :show-close="true"
    content-class="pitch-help-dialog"
  >
    <div class="pitch-help-body space-y-3.5">
      <!-- 什么是升降调 -->
      <section>
        <h4 class="pitch-help-h">什么是升降调</h4>
        <p class="pitch-help-p">
          把整首歌音高整体平移 N 个半音：0 为原调，+N 更明亮、更有张力，-N 更低沉、更柔和；±12
          半音等于高/低一个八度并回到同名调。
        </p>
      </section>

      <!-- 半音基础 -->
      <section>
        <h4 class="pitch-help-h">半音与调名</h4>
        <p class="pitch-help-p">
          半音是十二平均律里的最小音程，钢琴相邻两键（含黑键）即一个半音，12
          个半音为一个八度。升号「#」表示高半音，降号「b」表示低半音；C#=Db、D#=Eb、A#=Bb
          为同音异名，记法不同、音高相同。
        </p>
      </section>

      <!-- 快捷调对应表 -->
      <section>
        <h4 class="pitch-help-h">快捷调对应（-5 ~ +5）</h4>
        <div class="pitch-help-table">
          <div v-for="q in QUICK_PITCHES" :key="q.value" class="pitch-help-col">
            <span class="pitch-help-cell">{{ q.value > 0 ? `+${q.value}` : q.value }}</span>
            <span class="pitch-help-cell pitch-help-cell-key">{{ q.label }}</span>
          </div>
        </div>
      </section>

      <!-- 使用建议 -->
      <section>
        <h4 class="pitch-help-h">使用建议</h4>
        <ul class="pitch-help-list">
          <li>常用 ±1~5 半音微调，贴合自己音域；男女互唱一般升/降约 3~5 半音。</li>
          <li>升降幅度越大音色越明显失真，想要自然音色尽量控制在 ±5 以内。</li>
          <li>倍速只改变播放速度、升降只改变音高，两者相互独立，可叠加使用。</li>
        </ul>
      </section>
    </div>
  </Dialog>
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

/* 升降调说明弹窗 */
.pitch-help-dialog {
  width: min(440px, 92vw);
}

.pitch-help-body {
  padding-right: 4px;
}

.pitch-help-h {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.pitch-help-p {
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.78;
  white-space: pre-line;
}

.pitch-help-table {
  display: grid;
  grid-template-columns: repeat(11, 1fr);
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--control-hover-bg);
}

.pitch-help-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
}

.pitch-help-col:last-child {
  /* 11 列最后一列（+5/F）不需要额外处理，保持居中 */
}

.pitch-help-cell {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.pitch-help-cell-key {
  opacity: 0.55;
  font-weight: 600;
}

.pitch-help-list {
  list-style: disc;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
  opacity: 0.78;
}
</style>
