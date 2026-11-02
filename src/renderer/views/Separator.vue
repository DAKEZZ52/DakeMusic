<!--
 * DakeMusic 人声/伴奏分离页面（页面壳，云盘页风格）
 * 文件：Separator.vue
 * 作者：知之（DAKE知之）
 * 版权：© 2026 DakeMusic. All rights reserved.
 * 描述：收缩头部（SliverHeader）+ 顶部操作行（SeparatorActionBar）+
 *       左侧统计面板（SeparatorStatsPanel）+ 右栏分区卡
 *       （音频来源 / 分离模型 / 状态 / 调性）。集中管理业务状态
 *       （模型/来源/分离流程/路径/主题取色），各 UI 区块均为独立组件。
 -->
<script setup lang="ts">
defineOptions({ name: 'separator-page' });

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import PageScrollContainer from '@/components/ui/PageScrollContainer.vue';
import SliverHeader from '@/components/music/DetailPageSliverHeader.vue';
import SeparatorSourceSelector from '@/components/separator/SeparatorSourceSelector.vue';
import SeparatorModelSelector from '@/components/separator/SeparatorModelSelector.vue';
import SeparatorStatusPanel from '@/components/separator/SeparatorStatusPanel.vue';
import SeparatorActionPanel from '@/components/separator/SeparatorActionPanel.vue';
import SeparatorActionBar from '@/components/separator/SeparatorActionBar.vue';
import {
  extractDominantColor,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  DEFAULT_ACCENT,
} from '@/utils/color';
import { usePlayerStore } from '@/stores/player';
import { useThemeStore } from '@/stores/theme';
import { useToastStore } from '@/stores/toast';
import { createThemedIconCoverUrl } from '@/utils/cover';
import { iconScissors } from '@/icons';
import type { Song } from '@/models/song';
import type {
  SeparatorModelInfo,
  SeparatorProgress,
  SeparatorResult,
  SeparatorOutput,
} from '../../shared/separator';

const TARGET_RATE = 44100;

const playerStore = usePlayerStore();
const themeStore = useThemeStore();
const toastStore = useToastStore();

const models = ref<SeparatorModelInfo[]>([]);
const selectedModelId = ref<string>('');

const sourceType = ref<'current' | 'file'>('current');
const selectedFileName = ref<string>('');
let fileBuffer: ArrayBuffer | null = null;

/** 当前正在执行的步骤：idle 空闲，separate 分离中，save 保存中。 */
const busy = ref<'idle' | 'separate' | 'save'>('idle');
const progress = ref<SeparatorProgress>({ stage: 'download', percent: 0 });
/** 正在独立下载的模型 id（下载进度显示在模型行，与分离流程解耦）。 */
const downloadingModelId = ref<string | null>(null);
/** 模型下载进度（0..1）。 */
const downloadPercent = ref(0);
/** 已分离但尚未保存的结果（分离成功后自动保存，成功后置空）。 */
const result = ref<SeparatorResult | null>(null);
const output = ref<SeparatorOutput | null>(null);
const errorMsg = ref('');
/** 保存位置（分离前必须已设置；默认桌面/DAKESeparation，自动新建）。 */
const saveDir = ref<string>('');
/** 模型保存目录（默认用户数据目录 models，可在分离模型区更改并持久化）。 */
const modelDir = ref<string>('');
/**
 * 分离调性（变调半音数，0 = 原调）。
 * 以 C 为基准的 12 调：C=0、C#=1、…、B=11；「原调」不做变调。
 */
const KEY_OPTIONS: { label: string; value: number }[] = [
  { label: '原调', value: 0 },
  { label: 'C 调', value: 0 },
  { label: 'C# / Db 调', value: 1 },
  { label: 'D 调', value: 2 },
  { label: 'D# / Eb 调', value: 3 },
  { label: 'E 调', value: 4 },
  { label: 'F 调', value: 5 },
  { label: 'F# / Gb 调', value: 6 },
  { label: 'G 调', value: 7 },
  { label: 'G# / Ab 调', value: 8 },
  { label: 'A 调', value: 9 },
  { label: 'A# / Bb 调', value: 10 },
  { label: 'B 调', value: 11 },
];
/** 当前选中的调性（value 为半音偏移；「原调」与「C 调」均为 0，原调不触发变调）。 */
const selectedKey = ref<number>(0);
/** 是否启用变调（关闭时按原调分离）。 */
const enableKeyShift = ref(false);
/** 分离模型列表是否收起（默认展开）。 */
const modelsCollapsed = ref(false);

let disposeProgress: (() => void) | null = null;

/* ───────────── 跟随歌曲封面的动态主题色 ───────────── */

/** 当前歌曲封面主色（hex）；取色失败或无封面时回退苹果蓝。 */
const themeColor = ref<string>(DEFAULT_ACCENT);
/** 取色请求取消控制器：切歌时中止上一次取色，避免竞态。 */
let themeColorAbort: AbortController | null = null;
/** 当前是否深色模式（衍生色按浅/深分别计算）。 */
const isDark = ref(document.documentElement.classList.contains('dark'));
let darkObserver: MutationObserver | null = null;

/** 根据歌曲封面 URL 异步提取主色，写入 themeColor。 */
async function refreshThemeColor(coverUrl: string | undefined) {
  themeColorAbort?.abort();
  const controller = new AbortController();
  themeColorAbort = controller;
  if (!coverUrl) {
    themeColor.value = DEFAULT_ACCENT;
    return;
  }
  const color = await extractDominantColor(coverUrl, { signal: controller.signal });
  if (!controller.signal.aborted) {
    themeColor.value = color ?? DEFAULT_ACCENT;
  }
}

/** 依据主色计算分离页全部 CSS 变量（背景渐变/光斑/按钮/图标 accent）。 */
const sepThemeVars = computed<Record<string, string>>(() => {
  const rgb = hexToRgb(themeColor.value);
  if (!rgb) return {} as Record<string, string>;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const dark = isDark.value;
  const clamp01v = (v: number) => Math.min(1, Math.max(0, v));
  const hue = (deg: number) => (((h + deg) % 360) + 360) % 360;
  const hexAt = (hh: number, ss: number, ll: number) => {
    const c = hslToRgb(hh, clamp01v(ss), clamp01v(ll));
    return rgbToHex(c.r, c.g, c.b);
  };
  const rgbaAt = (hh: number, ss: number, ll: number, alpha: number) => {
    const c = hslToRgb(hh, clamp01v(ss), clamp01v(ll));
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };

  // 主 accent：保证按钮/图标上的文字对比度（深色模式可更亮）
  const accentSat = clamp01v(Math.min(0.9, Math.max(0.45, s)));
  const accentL = dark
    ? clamp01v(Math.min(0.72, Math.max(0.42, l)))
    : clamp01v(Math.min(0.5, Math.max(0.36, l)));
  const accent = hexAt(h, accentSat, accentL);
  const accentHover = hexAt(h, accentSat, Math.min(0.86, accentL + 0.1));
  const accentSoft = rgbaAt(h, accentSat, accentL, 0.16);
  // 「开始分离」按钮渐变：主色 → 亮一档
  const gradFrom = hexAt(hue(-8), Math.min(0.95, accentSat + 0.06), Math.min(0.64, accentL + 0.12));
  const gradTo = accent;
  const gradFromHover = hexAt(
    hue(-8),
    Math.min(0.95, accentSat + 0.06),
    Math.min(0.72, accentL + 0.18),
  );
  const gradToHover = accentHover;
  const accentShadow = rgbaAt(h, accentSat, accentL, 0.35);

  // 页面背景：以主色轻微染色（浅色近白、深色近黑），光斑用主色柔化，随歌曲封面主题联动
  const bgSat = 0.42;
  const bgFrom = dark ? hexAt(h, bgSat, 0.07) : hexAt(h, bgSat * 0.72, 0.97);
  const bgTo = dark ? hexAt(h, bgSat * 0.8, 0.105) : hexAt(h, bgSat * 0.5, 0.925);
  const glowA = rgbaAt(h, Math.min(0.72, s + 0.06), dark ? 0.5 : 0.62, dark ? 0.22 : 0.16);
  const glowB = rgbaAt(hue(36), Math.min(0.6, s), dark ? 0.4 : 0.55, dark ? 0.13 : 0.1);

  return {
    '--sep-accent': accent,
    '--sep-accent-hover': accentHover,
    '--sep-accent-soft': accentSoft,
    '--sep-accent-grad-from': gradFrom,
    '--sep-accent-grad-to': gradTo,
    '--sep-accent-grad-from-h': gradFromHover,
    '--sep-accent-grad-to-h': gradToHover,
    '--sep-accent-shadow': accentShadow,
    '--sep-bg-from': bgFrom,
    '--sep-bg-to': bgTo,
    '--sep-glow-a': glowA,
    '--sep-glow-b': glowB,
  };
});

/* ───────────── 状态与操作 ───────────── */

const isBusy = computed(() => busy.value !== 'idle');
/** 可分离条件：空闲 + 模型已下载 + 已设置保存位置。 */
const canSeparate = computed(
  () => busy.value === 'idle' && selectedModelDownloaded.value && !!saveDir.value,
);

/** 当前选中的模型是否已下载（未下载时「开始分离」不可用，须先在模型区下载）。 */
const selectedModelDownloaded = computed(
  () => models.value.find((m) => m.id === selectedModelId.value)?.downloaded ?? false,
);

const stageLabel = computed(() => {
  if (busy.value === 'save') return '正在保存文件';
  if (progress.value.stage === 'separate') return '正在分离人声与伴奏';
  return '正在保存文件';
});
const progressPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(progress.value.percent * 100))),
);

const currentSong = (): Song | null => (playerStore.currentTrackSnapshot as Song | null) ?? null;

/** 当前歌曲封面图 URL（歌曲行封面缩略图用）。 */
const currentSongCover = computed(() => {
  const song = currentSong();
  return song?.coverUrl || '';
});

const currentSongTitle = (): string => {
  const song = currentSong();
  if (!song) return '';
  return song.name || song.title || '未命名歌曲';
};

const currentSongArtist = (): string => {
  const song = currentSong();
  if (!song) return '';
  const names = song.singers?.map((s) => s.name).filter(Boolean) ?? [];
  if (names.length) return names.join('、');
  return song.artist ?? '';
};

/** 头部封面：主题色剪刀图标。 */
const separatorCoverUrl = computed(() =>
  createThemedIconCoverUrl(themeStore.sourceColor, iconScissors),
);

/** 去掉 Electron IPC 的包装前缀，只保留可读的错误原因。 */
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const index = raw.lastIndexOf('Error: ');
  const reason = (index >= 0 ? raw.slice(index + 7) : raw).trim();
  return reason || raw;
}

/** 解码并重采样到 44100。 */
async function decodeResample(
  arrayBuffer: ArrayBuffer,
): Promise<{ data: Float32Array[]; channels: number; sampleRate: number }> {
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
  let buffer: AudioBuffer = audio;

  if (audio.sampleRate !== TARGET_RATE) {
    const targetLen = Math.round((audio.length * TARGET_RATE) / audio.sampleRate);
    const offline = new OfflineAudioContext(audio.numberOfChannels, targetLen, TARGET_RATE);
    const node = offline.createBufferSource();
    node.buffer = audio;
    node.connect(offline.destination);
    node.start();
    buffer = await offline.startRendering();
  }
  void ctx.close();

  const data: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    data.push(buffer.getChannelData(ch).slice());
  }
  return {
    data,
    channels: buffer.numberOfChannels,
    sampleRate: TARGET_RATE,
  };
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  selectedFileName.value = file.name;
  errorMsg.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    fileBuffer = reader.result as ArrayBuffer;
  };
  reader.readAsArrayBuffer(file);
}

/** 获取来源音频的 ArrayBuffer 与基础名。 */
async function getSourceBuffer(): Promise<{ buffer: ArrayBuffer; baseName: string }> {
  if (sourceType.value === 'file') {
    if (!fileBuffer) throw new Error('请先选择本地音频文件');
    return {
      buffer: fileBuffer,
      baseName: selectedFileName.value.replace(/\.[^.]+$/, ''),
    };
  }
  const song = currentSong();
  if (!song) throw new Error('当前没有正在播放的歌曲');
  const resolved = await playerStore.resolveAudioUrl(song);
  if (!resolved?.url) throw new Error('无法解析该歌曲的播放地址');
  const res = await fetch(resolved.url);
  const buffer = await res.arrayBuffer();
  const artist = currentSongArtist();
  const title = currentSongTitle() || 'audio';
  const baseName = artist ? `${title} - ${artist}` : title;
  return { buffer, baseName };
}

function selectSource(type: 'current' | 'file') {
  if (busy.value !== 'idle' || sourceType.value === type) return;
  sourceType.value = type;
  errorMsg.value = '';
}

function selectModel(id: string) {
  if (busy.value !== 'idle' || selectedModelId.value === id) return;
  selectedModelId.value = id;
  errorMsg.value = '';
}

/** 独立下载模型（在分离模型区点击下载，进度显示在模型行，不阻塞其他操作）。 */
async function downloadModel(model: SeparatorModelInfo) {
  if (busy.value !== 'idle' || downloadingModelId.value) return;
  downloadingModelId.value = model.id;
  downloadPercent.value = 0;
  errorMsg.value = '';
  try {
    await window.electron.separator.downloadModel(model.id);
    toastStore.success('模型下载完成');
    models.value = await window.electron.separator.listModels();
  } catch (err) {
    errorMsg.value = readableError(err);
  } finally {
    downloadingModelId.value = null;
    downloadPercent.value = 0;
  }
}

/** 分离：推理完成后自动写入已设置的保存位置（不再单独弹窗选目录）。 */
async function start() {
  if (busy.value !== 'idle') return;
  if (!selectedModelId.value) {
    toastStore.warning('请选择分离模型');
    return;
  }
  if (!saveDir.value) {
    toastStore.warning('请先设置保存位置');
    return;
  }
  if (sourceType.value === 'file' && !fileBuffer) {
    toastStore.warning('请先选择本地音频文件');
    return;
  }
  if (sourceType.value === 'current' && !currentSong()) {
    toastStore.warning('当前没有正在播放的歌曲');
    return;
  }

  busy.value = 'separate';
  errorMsg.value = '';
  output.value = null;
  progress.value = { stage: 'download', percent: 0 };

  try {
    const { buffer, baseName } = await getSourceBuffer();
    const decoded = await decodeResample(buffer);
    result.value = await window.electron.separator.start(selectedModelId.value, {
      channels: decoded.channels,
      sampleRate: decoded.sampleRate,
      data: decoded.data,
      baseName,
      // 变调：开启且选了非原调 C 之外的目标调时，按所选调半音偏移输出
      keyShift: enableKeyShift.value ? selectedKey.value : 0,
    });

    // 分离完成，自动保存到保存位置
    busy.value = 'save';
    progress.value = { stage: 'save', percent: 0 };
    output.value = await window.electron.separator.save(result.value.cacheId, saveDir.value);
    result.value = null;
    toastStore.success(`分离完成，已保存到「${saveDir.value}」`);
  } catch (err) {
    // 保存失败时保留 result，方便用户重试自动保存
    errorMsg.value = readableError(err);
  } finally {
    busy.value = 'idle';
  }
}

/** 重新选择保存位置（弹目录选择框；取消保持原位置不变）。 */
async function pickSaveDir() {
  if (busy.value !== 'idle') return;
  const dir = await window.electron.separator.pickSaveDir();
  if (!dir) return;
  saveDir.value = dir;
  errorMsg.value = '';
  toastStore.info(`保存位置：${dir}`);
}

/** 重新选择模型保存目录（弹目录选择框；取消保持原目录不变；更改后刷新模型下载状态）。 */
async function pickModelDir() {
  if (busy.value !== 'idle' || downloadingModelId.value) return;
  const dir = await window.electron.separator.pickModelDir();
  if (!dir) return;
  modelDir.value = dir;
  errorMsg.value = '';
  // 目录变更后重新判断各模型是否已下载（旧目录模型不会自动搬移）
  models.value = await window.electron.separator.listModels();
  toastStore.info(`模型保存位置：${dir}`);
}

/** 在文件管理器中打开指定目录（查看保存位置/模型保存位置）。 */
async function revealDir(dir: string) {
  if (!dir || busy.value !== 'idle') return;
  try {
    await window.electron.separator.revealDir(dir);
  } catch (err) {
    toastStore.danger(readableError(err));
  }
}

onMounted(async () => {
  models.value = await window.electron.separator.listModels();
  const first = models.value[0];
  if (first) selectedModelId.value = first.id;
  disposeProgress = window.electron.separator.onProgress((p) => {
    progress.value = p;
    // 模型独立下载的进度（stage=download）同步到模型行上的百分比
    if (p.stage === 'download') downloadPercent.value = p.percent;
  });

  // 默认保存位置：桌面/DAKESeparation（不存在则自动新建）
  try {
    saveDir.value = await window.electron.separator.getDefaultSaveDir();
  } catch {
    saveDir.value = '';
  }

  // 模型保存目录（默认用户数据目录 models；可在分离模型区更改并持久化）
  try {
    modelDir.value = await window.electron.separator.getModelDir();
  } catch {
    modelDir.value = '';
  }

  // 跟随当前歌曲封面：封面变化时重新取色
  watch(
    () => playerStore.currentTrackSnapshot?.coverUrl,
    (url) => {
      void refreshThemeColor(url);
    },
    { immediate: true },
  );
  // 监听 html 的 dark 类变化，深色模式切换时重算衍生色
  darkObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark');
  });
  darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onUnmounted(() => {
  disposeProgress?.();
  themeColorAbort?.abort();
  darkObserver?.disconnect();
});
</script>

<template>
  <PageScrollContainer class="separator-view-container">
    <div class="sep-view bg-bg-main min-h-full" :style="sepThemeVars">
      <SliverHeader
        typeLabel="SEPARATE"
        title="人声分离"
        :coverUrl="separatorCoverUrl"
        :hasDetails="true"
        :expandedHeight="150"
        :collapsedHeight="56"
      >
        <template #details>
          <div class="flex flex-col gap-2">
            <div class="text-[13px] font-semibold text-text-secondary">
              基于 MDX-Net 把歌曲拆成人声与伴奏，导出 24bit 无损 WAV，支持调性变调。
            </div>
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-text-secondary/80"
            >
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconScissors" width="12" height="12" />
                <span>{{ models.length }} 个模型</span>
              </div>
              <div class="inline-flex items-center gap-1.5">
                <Icon :icon="iconScissors" width="12" height="12" />
                <span>{{ models.filter((m) => m.downloaded).length }} 已下载</span>
              </div>
            </div>
          </div>
        </template>

        <template #actions>
          <SeparatorActionBar :can-start="canSeparate" :is-busy="isBusy" @start="start" />
        </template>

        <template #collapsed-actions>
          <button type="button" class="sep-collapsed-start" :disabled="!canSeparate" @click="start">
            <Icon :icon="iconScissors" width="16" height="16" />
            <span>{{ isBusy ? '分离中' : '开始分离' }}</span>
          </button>
        </template>
      </SliverHeader>

      <div class="px-6 pt-2.5 pb-1">
        <div class="flex flex-col gap-5 pb-12">
          <!-- 音频来源 -->
          <SeparatorSourceSelector
            :source-type="sourceType"
            :is-busy="isBusy"
            :current-title="currentSongTitle()"
            :current-artist="currentSongArtist()"
            :current-cover="currentSongCover"
            :selected-file-name="selectedFileName"
            @select="selectSource"
            @file-picked="onFilePicked"
          />

          <!-- 分离模型：可收起列表 + 独立下载 -->
          <SeparatorModelSelector
            :models="models"
            :selected-model-id="selectedModelId"
            :downloading-model-id="downloadingModelId"
            :download-percent="downloadPercent"
            :models-collapsed="modelsCollapsed"
            :is-busy="isBusy"
            @select-model="selectModel"
            @download-model="downloadModel"
            @toggle-collapse="modelsCollapsed = !modelsCollapsed"
          />

          <!-- 进度 / 已保存 / 错误面板 -->
          <SeparatorStatusPanel
            :busy="busy"
            :progress-percent="progressPercent"
            :stage-label="stageLabel"
            :output="output"
            :error-msg="errorMsg"
          />

          <!-- 输出选项：保存/模型位置 + 调性 -->
          <SeparatorActionPanel
            :busy="busy"
            :enable-key-shift="enableKeyShift"
            :selected-key="selectedKey"
            :key-options="KEY_OPTIONS"
            :selected-model-downloaded="selectedModelDownloaded"
            :save-dir="saveDir"
            :model-dir="modelDir"
            :downloading-model-id="downloadingModelId"
            @update-key-shift="enableKeyShift = $event"
            @update-key="selectedKey = $event"
            @pick-save-dir="pickSaveDir"
            @pick-model-dir="pickModelDir"
            @reveal-dir="revealDir"
          />
        </div>
      </div>
    </div>
  </PageScrollContainer>
</template>

<style scoped>
@reference "@/style.css";

.sep-view {
  /* 分离页 accent 跟随当前歌曲封面主色（内联 sepThemeVars 覆盖），未取到色时回退苹果蓝 */
  --sep-accent: #0071e3;
  --sep-accent-hover: #0077ed;
  --sep-accent-soft: rgba(0, 113, 227, 0.12);
  --sep-bg-from: #f6f6f8;
  --sep-bg-to: #ececf1;
  --sep-glow-a: rgba(255, 255, 255, 0.8);
  --sep-glow-b: rgba(255, 255, 255, 0.55);
  position: relative;
  /* 背景跟随主题：主布局的顶部主题渐变氛围层（layout-accent-gradient）透出 */
  background:
    radial-gradient(640px 440px at 12% 6%, var(--sep-glow-a), transparent 62%),
    radial-gradient(740px 540px at 88% 18%, var(--sep-glow-b), transparent 62%),
    radial-gradient(540px 440px at 58% 104%, rgba(0, 0, 0, 0.035), transparent 62%);
}

/* 深色模式：暗底轻微染色 + 低亮度主色光晕 */
.dark .sep-view {
  --sep-bg-from: #101014;
  --sep-bg-to: #17171d;
  --sep-glow-a: rgba(255, 255, 255, 0.06);
  --sep-glow-b: rgba(255, 255, 255, 0.045);
  background:
    radial-gradient(640px 440px at 12% 6%, var(--sep-glow-a), transparent 62%),
    radial-gradient(740px 540px at 88% 18%, var(--sep-glow-b), transparent 62%),
    radial-gradient(540px 440px at 58% 104%, rgba(0, 0, 0, 0.32), transparent 62%);
}

/* 收缩态下的开始分离小按钮 */
.sep-collapsed-start {
  @apply flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all active:scale-95 select-none;
  background-color: var(--bg-info-card);
  color: var(--color-primary-text);
}

.sep-collapsed-start:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.sep-collapsed-start:hover:not(:disabled) {
  @apply brightness-95;
}
</style>
