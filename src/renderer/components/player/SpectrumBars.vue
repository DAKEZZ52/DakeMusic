<script setup lang="ts">
/**
 * 音频频谱（实验性）
 *
 * 数据来自主进程的 audio-spectrum 推送（原生播放引擎的 FFT 结果），canvas 绘制。
 * 四种样式：柱状 / 点阵 / 波形 / 对称，可在设置里切换。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

export type SpectrumStyle = 'bars' | 'dots' | 'wave' | 'mirror';

const props = withDefaults(
  defineProps<{ bars?: number; height?: number; styleName?: SpectrumStyle }>(),
  {
    bars: 40,
    height: 56,
    styleName: 'bars',
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);

let unsubscribe: (() => void) | null = null;
let rafId = 0;
const levels = new Float32Array(64);
const targets = new Float32Array(64);
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

const stepLevels = () => {
  for (let i = 0; i < props.bars; i += 1) {
    const target = Math.min(1, Math.max(0, targets[i] ?? 0));
    // 上升快、回落慢，观感更自然
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.16);
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
  stepLevels();

  const count = props.bars;
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(1, highlight);

  if (props.styleName === 'dots') {
    const gap = width / count;
    const radius = Math.min(3.2, Math.max(1.6, gap * 0.28));
    for (let i = 0; i < count; i += 1) {
      const value = Math.max(0.03, levels[i]);
      const cx = gap * (i + 0.5);
      const cy = height - value * (height - radius * 2) - radius;
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.3 + value * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (props.styleName === 'wave') {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const value = Math.max(0.02, levels[i]);
      points.push({ x: (width / (count - 1)) * i, y: height - value * (height - 6) - 3 });
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.bezierCurveTo(midX, prev.y, midX, cur.y, cur.x, cur.y);
    }
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, accent);
    fill.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.bezierCurveTo(midX, prev.y, midX, cur.y, cur.x, cur.y);
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (props.styleName === 'mirror') {
    const gap = width > 640 ? 3 : 2;
    const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
    const center = height / 2;
    for (let i = 0; i < count; i += 1) {
      const value = Math.max(0.02, levels[i]);
      const barHeight = Math.max(2, value * (center - 4));
      const x = i * (barWidth + gap);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.3 + value * 0.7;
      ctx.beginPath();
      const radius = Math.min(barWidth / 2, 3);
      ctx.roundRect(x, center - barHeight, barWidth, barHeight, radius);
      ctx.roundRect(x, center, barWidth, barHeight, radius);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const gap = width > 640 ? 3 : 2;
    const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
    for (let i = 0; i < count; i += 1) {
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
  }

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
