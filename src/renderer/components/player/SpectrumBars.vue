<script setup lang="ts">
/**
 * 音频频谱条（实验性）
 *
 * 数据来自主进程的 audio-spectrum 推送（原生播放引擎的 FFT 结果），
 * 纯 canvas 绘制，40 根柱子按对数刻度跳动。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ bars?: number; height?: number }>(), {
  bars: 40,
  height: 56,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

let unsubscribe: (() => void) | null = null;
let rafId = 0;
const levels = new Float32Array(props.bars);
const targets = new Float32Array(props.bars);
let accent = '#0a84ff';
let highlight = 'rgba(255,255,255,0.85)';

const readColors = () => {
  try {
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue('--color-primary').trim();
    if (primary) accent = primary;
    const onPrimary = styles.getPropertyValue('--color-on-primary').trim();
    if (onPrimary) highlight = onPrimary;
  } catch {
    // 取不到就用默认色
  }
};

const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) {
    rafId = requestAnimationFrame(draw);
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    rafId = requestAnimationFrame(draw);
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const count = props.bars;
  const gap = width > 640 ? 3 : 2;
  const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(1, highlight);

  for (let i = 0; i < count; i += 1) {
    const target = Math.min(1, Math.max(0, targets[i] ?? 0));
    // 上升快、回落慢，观感更自然
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.16);
    const value = Math.max(0.02, levels[i]);
    const barHeight = Math.max(2, value * height);
    const x = i * (barWidth + gap);
    const y = height - barHeight;
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.35 + value * 0.65;
    ctx.beginPath();
    const radius = Math.min(barWidth / 2, 3);
    ctx.roundRect(x, y, barWidth, barHeight, radius);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  rafId = requestAnimationFrame(draw);
};

onMounted(() => {
  readColors();
  rafId = requestAnimationFrame(draw);
  try {
    unsubscribe =
      window.electron?.audioSpectrum?.subscribe(
        { fps: 30, binCount: props.bars, scale: 'log', smoothing: 0.6 },
        (frame) => {
          if (!frame?.bins?.length) return;
          // 自动增益：小音量时也能看出跳动（否则只会看到一条平线）
          const gain = Math.min(6, Math.max(1, 0.08 / Math.max(0.004, frame.rms ?? 0)));
          for (let i = 0; i < props.bars; i += 1) {
            targets[i] = Math.min(1, (frame.bins[i] ?? 0) * gain);
          }
        },
        { pluginId: 'builtin.spectrum' },
      ) ?? null;
  } catch {
    unsubscribe = null;
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  unsubscribe?.();
  unsubscribe = null;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="spectrum-bars"
    :style="{ height: `${props.height}px` }"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.spectrum-bars {
  display: block;
  width: 100%;
  pointer-events: none;
}
</style>
