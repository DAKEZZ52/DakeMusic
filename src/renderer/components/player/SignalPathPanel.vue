<script setup lang="ts">
/**
 * 音质链路面板
 *
 * 交互参考 Folia 的 hifi/SignalPath 面板（AGPL-3.0，仅借鉴「把链路摊开逐环标注」的思路，代码独立实现）。
 * 这里只显示真实拿得到的数据；拿不到的写「—」，不猜。
 */
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useSettingStore } from '@/stores/setting';
import { usePlayerControls } from '@/composables/usePlayerControls';
import {
  buildVerdict,
  formatBackend,
  formatBuffer,
  formatFormat,
  formatQualityLabel,
  formatSampleRate,
  isLosslessQuality,
  isResampled,
} from '@/utils/signalPath';

const player = usePlayerStore();
const settingStore = useSettingStore();
const { effectiveAudioQuality, isResolvedCloudSource } = usePlayerControls();

const output = computed(() => player.getAudioOutputStats?.() ?? null);

const qualityLabel = computed(() => formatQualityLabel(String(effectiveAudioQuality.value ?? '')));

const isLossless = computed(() => isLosslessQuality(String(effectiveAudioQuality.value ?? '')));

const sourceLabel = computed(() => (isResolvedCloudSource.value ? '云盘文件' : '曲库音源'));

const deviceLabel = computed(() => {
  const id = settingStore.outputDevice;
  const matched = settingStore.outputDevices?.find((item) => item.value === id);
  return matched?.label || (id === 'default' ? '系统默认设备' : String(id || '—'));
});

const isExclusive = computed(() => settingStore.outputDeviceType === 'wasapi');

const sampleRateText = computed(() => formatSampleRate(output.value));
const resampled = computed(() => isResampled(output.value));
const formatText = computed(() => formatFormat(output.value));
const backendText = computed(() => formatBackend(output.value, isExclusive.value));
const bufferText = computed(() => formatBuffer(output.value));

const verdict = computed(() =>
  buildVerdict({
    hasStats: Boolean(output.value),
    resampled: resampled.value,
    lossless: isLossless.value,
    exclusive: isExclusive.value,
  }),
);
</script>

<template>
  <div class="signal-path">
    <div class="signal-row">
      <span class="signal-key">音源</span>
      <span class="signal-value">{{ qualityLabel }} · {{ sourceLabel }}</span>
    </div>
    <div class="signal-row">
      <span class="signal-key">重采样</span>
      <span class="signal-value" :class="{ 'is-warn': resampled }">{{ sampleRateText }}</span>
    </div>
    <div class="signal-row">
      <span class="signal-key">输出格式</span>
      <span class="signal-value">{{ formatText }}</span>
    </div>
    <div class="signal-row">
      <span class="signal-key">输出设备</span>
      <span class="signal-value">{{ deviceLabel }}</span>
    </div>
    <div class="signal-row">
      <span class="signal-key">驱动</span>
      <span class="signal-value">{{ backendText }}</span>
    </div>
    <div class="signal-row">
      <span class="signal-key">缓冲</span>
      <span class="signal-value">{{ bufferText }}</span>
    </div>

    <div class="signal-verdict" :class="`is-${verdict.tone}`">{{ verdict.text }}</div>

    <p class="signal-foot">独占模式可绕过系统混音器；共享模式下由系统决定最终采样率。</p>
  </div>
</template>

<style scoped>
.signal-path {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 14px 10px;
}

.signal-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11px;
  line-height: 16px;
}

.signal-key {
  flex-shrink: 0;
  width: 52px;
  color: var(--color-text-secondary);
}

.signal-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
}

.signal-value.is-warn {
  color: var(--color-warning, #d97706);
}

.signal-verdict {
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 16px;
}

.signal-verdict.is-good {
  background: color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent);
  color: var(--color-success, #16a34a);
}

.signal-verdict.is-warn {
  background: color-mix(in srgb, var(--color-warning, #d97706) 12%, transparent);
  color: var(--color-warning, #d97706);
}

.signal-verdict.is-muted {
  background: color-mix(in srgb, var(--text-main) 6%, transparent);
  color: var(--color-text-secondary);
}

.signal-foot {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 14px;
  color: var(--color-text-secondary);
  opacity: 0.75;
}
</style>
