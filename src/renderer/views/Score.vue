<!--
 * LyriseMusic 扒谱页
 * 文件：Score.vue
 * 作者：知之（DAKE知之）
 * 版权：© 2026 LyriseMusic. All rights reserved.
 * 描述：把当前播放的歌（或本地文件）交给本地 ScoreFlow 引擎，转成简谱：
 *      音符/时值/小节/和弦/歌词逐字对齐。左侧是谱面画布（可点选编辑），
 *      右侧是来源、选项、进度与统计。全部离线，不走云端。
 -->
<script setup lang="ts">
defineOptions({ name: 'score-page' });

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import PageScrollContainer from '@/components/ui/PageScrollContainer.vue';
import SliverHeader from '@/components/music/DetailPageSliverHeader.vue';
import { usePlayerStore } from '@/stores/player';
import { useThemeStore } from '@/stores/theme';
import { useToastStore } from '@/stores/toast';
import { iconDisc } from '@/icons';
import { createThemedIconCoverUrl } from '@/utils/cover';
import {
  DARK_THEME,
  LIGHT_THEME,
  deleteNote,
  drawScore,
  hitTest,
  layoutScore,
  noteAtTime,
  scoreStats,
  shiftDegree,
  shiftDuration,
  shiftOctave,
  type Playhead,
  type ScoreLayout,
  type ScoreTheme,
} from '@/utils/jianpu';
import type {
  ScoreDoc,
  ScoreEngineStatus,
  ScoreOptions,
  ScoreProgress,
} from '../../shared/scoreflow';
import type { ScoreNote } from '../../shared/scoreflow';
import type { Song } from '@/models/song';

const TARGET_RATE = 44100;

const playerStore = usePlayerStore();
const themeStore = useThemeStore();
const toast = useToastStore();

/* ───────────── 引擎 ───────────── */
const engine = ref<ScoreEngineStatus | null>(null);
const engineChecking = ref(true);

/* ───────────── 来源 ───────────── */
const sourceType = ref<'current' | 'file'>('current');
const selectedFileName = ref('');
let fileBuffer: ArrayBuffer | null = null;
const currentSong = computed(() => (playerStore.currentTrackSnapshot as Song | null) ?? null);
const currentTitle = computed(() => currentSong.value?.name || currentSong.value?.title || '');
const currentArtist = computed(() => currentSong.value?.artist || '');
const fallbackCover = computed(() => createThemedIconCoverUrl(themeStore.sourceColor, iconDisc));

/** 这份谱到底是从哪扒的：扒成功后锁定，之后切 tab 也不会改。 */
const transcribedFrom = ref<{ type: 'current' | 'file'; songId?: string; name: string } | null>(
  null,
);
const isFromFile = computed(() => transcribedFrom.value?.type === 'file');

/** 本地文件播放（扒本地文件时没有播放源，谱面就永远不动，所以内置一个）。 */
const localAudioRef = ref<HTMLAudioElement | null>(null);
const localAudioUrl = ref<string | null>(null);
const localTime = ref(0);
const localDuration = ref(0);
const localPlaying = ref(false);

/* ───────────── 选项 ───────────── */
const optSeparate = ref(true);
const optLyrics = ref(true);
const optGrid = ref<'0.5' | '0.25'>('0.5');
const optBpm = ref<string>('');
const optWhisper = ref<'tiny' | 'base' | 'small' | 'medium'>('small');

/* ───────────── 任务状态 ───────────── */
const busy = ref(false);
const progress = ref<ScoreProgress>({ stage: '', percent: 0 });
const elapsed = ref(0);
const errorMsg = ref('');
const doc = ref<ScoreDoc | null>(null);
const stats = computed(() => (doc.value ? scoreStats(doc.value) : null));

/** 谱面能否跟播放走：本地文件用自己的播放器，正在播放的歌用播放器时间轴。 */
const canFollow = computed(() => {
  const from = transcribedFrom.value;
  if (!from) return false;
  if (from.type === 'file') return !!localAudioUrl.value;
  return !!from.songId && playerStore.currentTrackId === from.songId;
});

/** 高亮驱动的时间轴：本地文件走内嵌播放器，否则走播放器。 */
const playTime = computed(() =>
  isFromFile.value ? localTime.value : playerStore.currentTime || 0,
);

/* ───────────── 画布 ───────────── */
const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollerRef = ref<HTMLDivElement | null>(null);
const layout = ref<ScoreLayout | null>(null);
const selected = ref<{ mi: number; ni: number } | null>(null);
/** 播放中的音（跟随播放高亮）。 */
const playing = ref<Playhead | null>(null);
/** 是否跟随播放高亮（关掉后谱面不动，方便安静编辑）。 */
const followPlayback = ref(true);
/** 版面：scroll = 单行横向（默认，播放时横向滚过去），wrap = 换行看全。 */
const layoutMode = ref<'scroll' | 'wrap'>('scroll');
const editing = ref(false);
const canvasWidth = ref(900);
let resizeObserver: ResizeObserver | null = null;
let disposeProgress: (() => void) | null = null;

const isDark = computed(() => document.documentElement.classList.contains('dark'));
const theme = computed<ScoreTheme>(() => (isDark.value ? DARK_THEME : LIGHT_THEME));

/** 当前主题色（跟随封面）。 */
const accent = computed(() => themeStore.sourceColor || '#0071e3');

/* ───────────── 工具 ───────────── */
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const index = raw.lastIndexOf('Error: ');
  const reason = (index >= 0 ? raw.slice(index + 7) : raw).trim();
  return reason || raw;
}

function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 解码 + 重采样 + 混单声道。 */
async function decodeToMono(
  buffer: ArrayBuffer,
): Promise<{ mono: Float32Array; sampleRate: number; channels: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer.slice(0));
  let source: AudioBuffer = decoded;
  if (decoded.sampleRate !== TARGET_RATE) {
    const targetLen = Math.round((decoded.length * TARGET_RATE) / decoded.sampleRate);
    const offline = new OfflineAudioContext(decoded.numberOfChannels, targetLen, TARGET_RATE);
    const node = offline.createBufferSource();
    node.buffer = decoded;
    node.connect(offline.destination);
    node.start();
    source = await offline.startRendering();
  }
  void ctx.close();

  const channels = source.numberOfChannels;
  const mono = new Float32Array(source.length);
  for (let c = 0; c < channels; c += 1) {
    const data = source.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / channels;
  }
  return { mono, sampleRate: TARGET_RATE, channels };
}

/** 取来源音频：当前播放的歌，或用户选的文件。 */
async function getSourceBuffer(): Promise<{ buffer: ArrayBuffer; baseName: string }> {
  if (sourceType.value === 'file') {
    if (!fileBuffer) throw new Error('请先选择本地音频文件');
    return { buffer: fileBuffer, baseName: selectedFileName.value.replace(/\.[^.]+$/, '') };
  }
  const song = currentSong.value;
  if (!song) throw new Error('当前没有正在播放的歌曲');
  const resolved = await playerStore.resolveAudioUrl(song);
  if (!resolved?.url) throw new Error('无法解析该歌曲的播放地址');
  const res = await fetch(resolved.url);
  const buffer = await res.arrayBuffer();
  const title = song.name || song.title || 'audio';
  const baseName = song.artist ? `${title} - ${song.artist}` : title;
  return { buffer, baseName };
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

/* ───────────── 渲染 ───────────── */
/** canvas 尺寸守卫：Chrome 的 canvas 单边上限是 32767px，横向长谱要降 dpr。 */
function pickDpr(contentWidth: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  if (contentWidth * dpr <= 30000) return dpr;
  return Math.max(0.75, 30000 / contentWidth);
}

function renderCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !doc.value) return;
  const containerWidth = Math.max(360, canvasWidth.value);
  const next = layoutScore(doc.value, containerWidth, layoutMode.value);
  const dpr = pickDpr(next.width);
  canvas.width = Math.round(next.width * dpr);
  canvas.height = Math.round(next.height * dpr);
  canvas.style.width = `${Math.round(next.width)}px`;
  canvas.style.height = `${Math.round(next.height)}px`;
  layout.value = drawScore(
    canvas.getContext('2d') as CanvasRenderingContext2D,
    doc.value,
    next,
    theme.value,
    selected.value,
    dpr,
    // 播放高亮不画在 canvas 上：换一个音就重绘一两万像素宽的画布太浪费，
    // 用 DOM 覆盖层跟着走（见 playheadStyle）。
    null,
  );
}

/** 播放高亮层的位置（相对画布，跟着横向滚动一起动）。 */
const playheadStyle = computed(() => {
  if (!playing.value || !layout.value) return { display: 'none' };
  const target = playing.value;
  const box = layout.value.boxes.find((b) => b.mi === target.mi && b.ni === target.ni);
  if (!box) return { display: 'none' };
  return {
    display: 'block',
    left: `${Math.round(box.x - 4)}px`,
    top: `${Math.round(box.y - 5)}px`,
    width: `${Math.round(box.w + 10)}px`,
    height: `${Math.round(box.h + 10)}px`,
  };
});

/** 切换版面：横向（跟随滚动）或换行（一屏看全）。 */
function switchMode(mode: 'scroll' | 'wrap') {
  if (layoutMode.value === mode) return;
  layoutMode.value = mode;
  void nextTick(() => {
    renderCanvas();
    if (mode === 'scroll') scrollToPlayhead(false);
  });
}

/** 把当前播放位置横向滚到视口的 1/4 处（和商业扒谱软件的手感一致）。 */
function scrollToPlayhead(smooth = true) {
  const scroller = scrollerRef.value;
  const current = layout.value?.bars;
  if (!scroller || !current || !playing.value || layoutMode.value !== 'scroll') return;
  const bar = current[playing.value.mi];
  if (!bar) return;
  const target = Math.max(0, bar.x - scroller.clientWidth * 0.22);
  scroller.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
}

function onCanvasClick(event: MouseEvent) {
  if (!editing.value || !layout.value) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = ((event.clientX - rect.left) * layout.value.width) / rect.width;
  const my = ((event.clientY - rect.top) * layout.value.height) / rect.height;
  selected.value = hitTest(layout.value, mx, my);
  renderCanvas();
}

/* ───────────── 编辑 ───────────── */
function withSelected(mutate: (note: ScoreNote) => void) {
  const sel = selectedNote.value;
  if (!sel) return;
  mutate(sel.note);
  renderCanvas();
}

const selectedNote = computed(() => {
  if (!selected.value || !doc.value) return null;
  const measure = doc.value.measures[selected.value.mi];
  const note = measure?.notes[selected.value.ni];
  return note ? { measure, note, mi: selected.value.mi, ni: selected.value.ni } : null;
});

function onKeydown(event: KeyboardEvent) {
  if (!editing.value || !selectedNote.value) return;
  const sel = selectedNote.value;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    withSelected((note) => (event.shiftKey ? shiftOctave(note, delta) : shiftDegree(note, delta)));
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    withSelected((note) => shiftDuration(note, delta));
  } else if (/^[0-7]$/.test(event.key)) {
    event.preventDefault();
    withSelected((note) => {
      note.degree = Number(event.key);
    });
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteNote(sel.measure, sel.ni);
    selected.value = null;
    renderCanvas();
  }
}

/* ───────────── 扒谱 ───────────── */
async function startTranscribe() {
  if (busy.value) return;
  errorMsg.value = '';
  if (!engine.value?.available) {
    errorMsg.value = engine.value?.reason || '引擎不可用';
    return;
  }

  busy.value = true;
  progress.value = { stage: '准备音频', percent: 0.01 };
  elapsed.value = 0;
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    elapsed.value = (Date.now() - startedAt) / 1000;
  }, 500);

  try {
    const { buffer, baseName } = await getSourceBuffer();
    progress.value = { stage: '解码音频', percent: 0.03 };
    const { mono, sampleRate, channels } = await decodeToMono(buffer);

    const fromFile = sourceType.value === 'file';
    const options: ScoreOptions = {
      // 扒本地文件时标题要用文件名，不能用"正在播放"那首 —— 之前这里写反了，
      // 结果谱面标题显示的是播放器里当前那首歌，看起来像被切走了。
      title: fromFile ? baseName : currentTitle.value || baseName,
      artist: fromFile ? '' : currentArtist.value,
      noSeparate: !optSeparate.value,
      noLyrics: !optLyrics.value,
      grid: Number(optGrid.value),
      whisper: optWhisper.value,
    };
    const bpmValue = Number(optBpm.value);
    if (Number.isFinite(bpmValue) && bpmValue > 0) options.bpm = bpmValue;

    const result = await window.electron.scoreflow.transcribe(
      { channels, sampleRate, data: mono, baseName },
      options,
    );
    doc.value = result.doc;
    selected.value = null;
    playing.value = null;
    transcribedFrom.value = fromFile
      ? { type: 'file', name: selectedFileName.value || baseName }
      : {
          type: 'current',
          songId: currentSong.value?.id ? String(currentSong.value.id) : undefined,
          name: currentTitle.value || baseName,
        };
    // 本地文件没有播放源，谱面就永远不会动 —— 建一个 blob 让页面自己放
    if (fromFile) {
      if (localAudioUrl.value) URL.revokeObjectURL(localAudioUrl.value);
      localAudioUrl.value = URL.createObjectURL(
        new Blob([buffer], { type: 'application/octet-stream' }),
      );
      localTime.value = 0;
      localDuration.value = 0;
      localPlaying.value = false;
    }
    await nextTick();
    renderCanvas();
    toast.success(
      `扒谱完成：${stats.value?.notes ?? 0} 个音、${stats.value?.chords ?? 0} 段和弦，用时 ${fmtElapsed(
        result.elapsed,
      )}`,
    );
  } catch (error) {
    errorMsg.value = readableError(error);
  } finally {
    window.clearInterval(timer);
    busy.value = false;
  }
}

async function cancelTranscribe() {
  await window.electron.scoreflow.cancel();
}

async function exportJson() {
  if (!doc.value) return;
  try {
    const path = await window.electron.scoreflow.exportJson(doc.value, doc.value.meta.title);
    if (path) toast.success(`已导出到 ${path}`);
  } catch (error) {
    toast.danger(readableError(error));
  }
}

/* ───────────── 生命周期 ───────────── */
watch(isDark, () => renderCanvas());

/** 播放位置变化 -> 高亮当前音。高亮是 DOM 层，这里不重绘画布。 */
watch(playTime, (time) => {
  if (!doc.value) return;
  if (!followPlayback.value || !canFollow.value) {
    if (playing.value) playing.value = null;
    return;
  }
  const next = noteAtTime(doc.value, time);
  const changed =
    (next?.mi ?? -1) !== (playing.value?.mi ?? -1) ||
    (next?.ni ?? -1) !== (playing.value?.ni ?? -1);
  if (!changed) return;
  playing.value = next;
  scrollToPlayhead();
});

// 切歌后这份谱就不该再跟着走了
watch(
  () => playerStore.currentTrackId,
  () => {
    if (!canFollow.value && playing.value) playing.value = null;
  },
);

watch(followPlayback, (on) => {
  if (!on) playing.value = null;
});

/** 当前播放位置的拍数（显示用）。 */
const playheadBeat = computed(() => {
  const d = doc.value;
  if (!d) return 0;
  const times = d.meta.beat_times;
  const t = playTime.value;
  if (!times || times.length < 2) return (t * (d.meta.bpm || 100)) / 60;
  // 二分找所在拍
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const step = times[hi] - times[lo];
  return lo + (step > 0 ? (t - times[lo]) / step : 0);
});

/** 当前拍所处的和弦（顶部显示）。 */
const currentChordText = computed(() => {
  const d = doc.value;
  if (!d || !d.chords?.length) return '';
  const t = playTime.value;
  const span = d.chords.find((c) => t >= c.start && t < c.end);
  if (!span) return '';
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return span.symbol || names[span.root % 12];
});

/** 内嵌播放器（扒本地文件时用）。 */
function toggleLocal() {
  const el = localAudioRef.value;
  if (!el) return;
  if (el.paused) void el.play().catch(() => undefined);
  else el.pause();
}

function onLocalSeek(event: MouseEvent) {
  const el = localAudioRef.value;
  const bar = event.currentTarget as HTMLElement;
  if (!el || !localDuration.value) return;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  el.currentTime = ratio * localDuration.value;
  localTime.value = el.currentTime;
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

onMounted(async () => {
  const api = window.electron?.scoreflow;
  if (!api) {
    engineChecking.value = false;
    engine.value = {
      available: false,
      runtime: '',
      root: '',
      version: '',
      reason: '未在 LyriseMusic 中运行，扒谱引擎不可用',
    };
    return;
  }
  disposeProgress = api.onProgress((next) => {
    progress.value = next;
    if (next.elapsed) elapsed.value = next.elapsed;
  });
  document.addEventListener('keydown', onKeydown);
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width > 0 && Math.abs(width - canvasWidth.value) > 2) {
      canvasWidth.value = width;
      renderCanvas();
    }
  });
  if (scrollerRef.value) resizeObserver.observe(scrollerRef.value);

  engineChecking.value = true;
  try {
    engine.value = await api.engineStatus();
  } catch (error) {
    engine.value = {
      available: false,
      runtime: '',
      root: '',
      version: '',
      reason: readableError(error),
    };
  }
  engineChecking.value = false;
});

onUnmounted(() => {
  disposeProgress?.();
  document.removeEventListener('keydown', onKeydown);
  resizeObserver?.disconnect();
  localAudioRef.value?.pause();
  if (localAudioUrl.value) URL.revokeObjectURL(localAudioUrl.value);
  if (busy.value) void window.electron?.scoreflow?.cancel();
});
</script>

<template>
  <PageScrollContainer>
    <SliverHeader
      typeLabel="SCORE"
      title="扒谱"
      :coverUrl="fallbackCover"
      :hasDetails="true"
      :expandedHeight="150"
      :collapsedHeight="56"
    >
      <template #details>
        <div class="flex flex-col gap-2">
          <div class="text-[13px] font-semibold text-text-secondary">
            把歌声转成简谱：音符、时值、小节、和弦、歌词逐字对齐，全部在本机跑。
          </div>
        </div>
      </template>
    </SliverHeader>

    <div class="score-page">
      <!-- 引擎状态 -->
      <div class="engine-row">
        <span
          class="dot"
          :class="{ ok: engine?.available, bad: !engine?.available && !engineChecking }"
        />
        <span v-if="engineChecking" class="engine-text">正在探测扒谱引擎…</span>
        <span v-else-if="engine?.available" class="engine-text">
          引擎就绪 · {{ engine.version }} · 本机运行不走云端
        </span>
        <span v-else class="engine-text bad">{{ engine?.reason || '引擎不可用' }}</span>
      </div>

      <div class="score-body">
        <!-- 谱面 -->
        <section class="sheet">
          <div class="sheet-head">
            <div class="sheet-title">
              {{ doc?.meta.title || '还没有谱面' }}
              <span v-if="doc" class="sheet-sub">
                {{ doc.meta.key_name }} · {{ doc.meta.beats_per_bar }}/{{ doc.meta.beat_unit }} ·
                ♩={{ Math.round(doc.meta.bpm) }}
              </span>
              <span
                v-if="doc && transcribedFrom"
                class="src-tag"
                :class="isFromFile ? 'file' : 'live'"
              >
                {{ isFromFile ? '本地文件' : '正在播放' }} · {{ transcribedFrom.name }}
              </span>
            </div>
            <div class="sheet-actions">
              <span v-if="doc && currentChordText" class="now-chord">
                {{ currentChordText }}
                <em>第 {{ Math.floor(playheadBeat / doc.meta.beats_per_bar) + 1 }} 小节</em>
              </span>
              <div v-if="doc" class="seg tiny">
                <button :class="{ on: layoutMode === 'scroll' }" @click="switchMode('scroll')">
                  横向
                </button>
                <button :class="{ on: layoutMode === 'wrap' }" @click="switchMode('wrap')">
                  换行
                </button>
              </div>
              <button v-if="doc" class="ghost" :class="{ on: editing }" @click="editing = !editing">
                {{ editing ? '完成编辑' : '编辑' }}
              </button>
              <button v-if="doc" class="ghost" @click="exportJson">导出 JSON</button>
            </div>
          </div>

          <div v-if="localAudioUrl && doc" class="local-player">
            <button class="lp-btn" @click="toggleLocal">{{ localPlaying ? '❚❚' : '▶' }}</button>
            <span class="lp-time">{{ fmtClock(localTime) }}</span>
            <div class="lp-seek" @click="onLocalSeek">
              <i :style="{ width: `${localDuration ? (localTime / localDuration) * 100 : 0}%` }" />
            </div>
            <span class="lp-time muted">{{ fmtClock(localDuration) }}</span>
            <span class="lp-hint">本地文件试听 · 谱面跟着走</span>
          </div>
          <audio
            ref="localAudioRef"
            :src="localAudioUrl || undefined"
            preload="metadata"
            @timeupdate="localTime = localAudioRef?.currentTime ?? 0"
            @loadedmetadata="localDuration = localAudioRef?.duration ?? 0"
            @play="localPlaying = true"
            @pause="localPlaying = false"
            @ended="localPlaying = false"
          />

          <div ref="scrollerRef" class="sheet-scroll" :class="{ wrap: layoutMode === 'wrap' }">
            <div v-if="doc" class="sheet-stage">
              <canvas
                ref="canvasRef"
                class="sheet-canvas"
                :class="{ editing }"
                @click="onCanvasClick"
              />
              <i class="playhead" :style="playheadStyle" />
            </div>
            <div v-else class="sheet-empty">
              <div class="empty-icon">{{ '♪' }}</div>
              <p class="empty-title">把一首歌变成能读的简谱</p>
              <p class="empty-hint">
                点「开始扒谱」后，本地引擎会分离人声、识别音高与和弦、对齐歌词，全程不联网。
              </p>
            </div>
          </div>

          <div v-if="editing" class="edit-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> 音级</span>
            <span><kbd>Shift</kbd> + <kbd>↑</kbd><kbd>↓</kbd> 八度</span>
            <span><kbd>←</kbd><kbd>→</kbd> 时值</span>
            <span><kbd>1</kbd>–<kbd>7</kbd> 直接改</span>
            <span><kbd>0</kbd> 休止</span>
            <span><kbd>Del</kbd> 删除</span>
          </div>
        </section>

        <!-- 侧栏 -->
        <aside class="side">
          <div class="card">
            <h4>音频来源</h4>
            <div class="seg">
              <button :class="{ on: sourceType === 'current' }" @click="sourceType = 'current'">
                当前播放
              </button>
              <button :class="{ on: sourceType === 'file' }" @click="sourceType = 'file'">
                本地文件
              </button>
            </div>
            <div v-if="sourceType === 'current'" class="source-cur">
              <img class="cover" :src="fallbackCover" alt="" />
              <div class="meta">
                <div class="name">{{ currentTitle || '没有正在播放的歌' }}</div>
                <div class="sub">{{ currentArtist || '—' }}</div>
              </div>
            </div>
            <label v-else class="file-pick">
              <input type="file" accept="audio/*" @change="onFilePicked" />
              <span>{{ selectedFileName || '选择音频文件' }}</span>
            </label>
          </div>

          <div class="card">
            <h4>扒谱选项</h4>
            <label class="opt">
              <input v-model="optSeparate" type="checkbox" />
              <span>分离人声（和弦更准，慢一些）</span>
            </label>
            <label class="opt">
              <input v-model="optLyrics" type="checkbox" />
              <span>识别并逐字对齐歌词</span>
            </label>
            <div class="field">
              <span class="label">量化粒度</span>
              <div class="seg small">
                <button :class="{ on: optGrid === '0.5' }" @click="optGrid = '0.5'">
                  八分（干净）
                </button>
                <button :class="{ on: optGrid === '0.25' }" @click="optGrid = '0.25'">
                  十六分（细）
                </button>
              </div>
            </div>
            <div class="field">
              <span class="label">速度（可选）</span>
              <input
                v-model="optBpm"
                class="text-input"
                type="number"
                placeholder="自动检测"
                min="30"
                max="220"
              />
            </div>
            <div v-if="optLyrics" class="field">
              <span class="label">歌词模型</span>
              <select v-model="optWhisper" class="text-input">
                <option value="tiny">tiny（最快）</option>
                <option value="base">base</option>
                <option value="small">small（推荐）</option>
                <option value="medium">medium（准，慢）</option>
              </select>
            </div>
          </div>

          <div class="card">
            <h4>状态</h4>
            <label v-if="doc" class="opt follow">
              <input v-model="followPlayback" type="checkbox" :disabled="!canFollow" />
              <span>{{ canFollow ? '跟随播放高亮' : '当前无法跟随' }}</span>
            </label>
            <div v-if="busy" class="progress-wrap">
              <div class="progress-text">{{ progress.stage || '处理中' }}</div>
              <div class="progress-bar">
                <i :style="{ width: `${Math.round(progress.percent * 100)}%` }" />
              </div>
              <div class="progress-meta">
                {{ Math.round(progress.percent * 100) }}% · 已用 {{ fmtElapsed(elapsed) }}
              </div>
            </div>
            <div v-else-if="errorMsg" class="error-text">{{ errorMsg }}</div>
            <div v-else-if="stats" class="stats">
              <div>
                <b>{{ stats.notes }}</b
                ><span>音符</span>
              </div>
              <div>
                <b>{{ stats.chords }}</b
                ><span>和弦</span>
              </div>
              <div>
                <b>{{ stats.bars }}</b
                ><span>小节</span>
              </div>
              <div>
                <b>{{ Math.round(stats.lyricRate * 100) }}%</b><span>歌词挂载</span>
              </div>
            </div>
            <div v-else class="idle-text">等待开始</div>

            <div class="actions">
              <button
                v-if="!busy"
                class="primary"
                :disabled="!engine?.available"
                @click="startTranscribe"
              >
                <span class="play-icon">▶</span> 开始扒谱
              </button>
              <button v-else class="danger" @click="cancelTranscribe">取消</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </PageScrollContainer>
</template>

<style scoped>
.score-page {
  padding: 8px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.engine-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.engine-row .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--state-warning, #c98a12);
}
.engine-row .dot.ok {
  background: var(--state-success, #0f7b4f);
}
.engine-row .dot.bad {
  background: var(--state-danger, #c2410c);
}
.engine-text.bad {
  color: var(--state-danger, #c2410c);
}

.score-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1080px) {
  .score-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.sheet {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 12px 14px 14px;
  box-shadow: var(--shadow-card);
  min-width: 0;
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.sheet-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}
.sheet-sub {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}
.src-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.src-tag.live {
  background: var(--green-soft, #e8f6ef);
  color: var(--state-success, #0f7b4f);
}
.src-tag.file {
  background: var(--control-bg, #eef1f6);
  color: var(--text-secondary);
}

/* 本地文件试听条 */
.local-player {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--control-bg, #f7f9fc);
}
.lp-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0;
  background: v-bind(accent);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  flex: none;
}
.lp-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-main);
  min-width: 34px;
}
.lp-time.muted {
  color: var(--text-secondary);
}
.lp-seek {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border-light);
  cursor: pointer;
  overflow: hidden;
}
.lp-seek > i {
  display: block;
  height: 100%;
  background: v-bind(accent);
  border-radius: 2px;
}
.lp-hint {
  font-size: 10px;
  color: var(--text-secondary);
  flex: none;
}
audio {
  display: none;
}
.sheet-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.ghost {
  border: 1px solid var(--border-light);
  background: var(--control-bg, #fff);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  cursor: pointer;
}
.ghost:hover {
  background: var(--control-hover);
}
.ghost.on {
  border-color: v-bind(accent);
  color: v-bind(accent);
}

.now-chord {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: v-bind(accent);
}
.now-chord em {
  font-style: normal;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-secondary);
}

.sheet-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.sheet-scroll.wrap {
  overflow-x: hidden;
  overflow-y: visible;
}
.sheet-stage {
  position: relative;
  width: max-content;
}
.sheet-canvas {
  display: block;
}
.sheet-canvas.editing {
  cursor: pointer;
}

/* 播放高亮：DOM 层，canvas 只负责静态谱面 */
.playhead {
  position: absolute;
  display: none;
  border-radius: 6px;
  background: color-mix(in srgb, v-bind(accent) 14%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, v-bind(accent) 55%, transparent);
  pointer-events: none;
  transition:
    left 0.18s ease,
    top 0.18s ease,
    width 0.18s ease;
}
@media (prefers-reduced-motion: reduce) {
  .playhead {
    transition: none;
  }
}

.sheet-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 320px;
  color: var(--text-secondary);
}
.empty-icon {
  font-size: 34px;
  opacity: 0.35;
}
.empty-title {
  font-size: 14px;
  color: var(--text-main);
}
.empty-hint {
  font-size: 12px;
  max-width: 380px;
  text-align: center;
  line-height: 1.7;
  opacity: 0.8;
}

.edit-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}
.edit-hint kbd {
  background: var(--control-bg, #eee);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 10px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
}
.card h4 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.seg {
  display: flex;
  gap: 4px;
  background: var(--control-bg, #f2f2f5);
  border-radius: 9px;
  padding: 3px;
}
.seg button {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.seg button.on {
  background: var(--surface-card, #fff);
  color: var(--text-main);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}
.seg.small button {
  font-size: 11px;
  padding: 4px 6px;
}

.source-cur {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.cover {
  width: 40px;
  height: 40px;
  border-radius: 9px;
  object-fit: cover;
}
.source-cur .name {
  font-size: 13px;
  color: var(--text-main);
}
.source-cur .sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.file-pick {
  display: block;
  margin-top: 10px;
  border: 1px dashed var(--border-light);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.file-pick input {
  display: none;
}

.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-main);
  padding: 5px 0;
  cursor: pointer;
}
.field {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field .label {
  font-size: 11px;
  color: var(--text-secondary);
}
.text-input {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--control-bg, #fff);
  color: var(--text-main);
  padding: 6px 8px;
  font-size: 12px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-main);
  margin-bottom: 8px;
}
.progress-bar {
  height: 5px;
  border-radius: 3px;
  background: var(--control-bg, #eee);
  overflow: hidden;
}
.progress-bar > i {
  display: block;
  height: 100%;
  background: v-bind(accent);
  border-radius: 3px;
  transition: width 0.25s;
}
.progress-meta {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stats div {
  background: var(--control-bg, #f7f7f9);
  border-radius: 9px;
  padding: 8px;
  text-align: center;
}
.stats b {
  display: block;
  font-size: 16px;
  color: var(--text-main);
}
.stats span {
  font-size: 10px;
  color: var(--text-secondary);
}

.error-text {
  font-size: 12px;
  color: var(--state-danger, #c2410c);
  line-height: 1.6;
}
.idle-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.actions {
  margin-top: 12px;
}
.primary,
.danger {
  width: 100%;
  border: 0;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: v-bind(accent);
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.danger {
  background: var(--state-danger, #c2410c);
}
.play-icon {
  font-size: 10px;
  margin-right: 4px;
}
</style>
