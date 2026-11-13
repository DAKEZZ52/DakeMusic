/**
 * LyriseMusic 简谱渲染（纯函数）
 * 文件：jianpu.ts
 * 描述：把 ScoreDoc 排成版面并画到 canvas 上。页面只负责编排，
 *      这里不碰 Vue、不碰 IPC，方便单测与复用（导出图片等）。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import type { ScoreChordMark, ScoreDoc, ScoreMeasure, ScoreNote } from '../../shared/scoreflow';

/** 可记谱时值（拍），从长到短。3 = 附点二分，1.5 = 附点四分，0.75 = 附点八分。 */
export const DUR_SET = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];

export const NOTE_FONT =
  "Bahnschrift,'DIN Alternate','HarmonyOS Sans SC','Microsoft YaHei',sans-serif";

/** 一个音在 canvas 上的点击热区。 */
export interface NoteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 小节下标。 */
  mi: number;
  /** 小节内的音符下标。 */
  ni: number;
  note: ScoreNote;
}

/** 小节在画布上的位置。 */
export interface ScoreBarBox {
  index: number;
  x: number;
  y: number;
  w: number;
}

/** 版面结果。 */
export interface ScoreLayout {
  /** scroll = 单行横向铺开（播放跟随），wrap = 按宽度换行（一屏看全）。 */
  mode: 'scroll' | 'wrap';
  /** 每行放哪些小节（按 measures 下标）。 */
  rows: number[][];
  bars: ScoreBarBox[];
  boxes: NoteBox[];
  width: number;
  height: number;
  barW: number;
  barsPerLine: number;
}

/** 画布主题（跟随播放器的浅/深色）。 */
export interface ScoreTheme {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  chord: string;
  lyric: string;
  rule: string;
}

export const LIGHT_THEME: ScoreTheme = {
  bg: '#ffffff',
  ink: '#1d1d1f',
  muted: '#8b93a1',
  accent: '#0071e3',
  chord: '#1f5fd0',
  lyric: '#3a3f47',
  rule: '#d8dde6',
};

export const DARK_THEME: ScoreTheme = {
  bg: '#1c1c1e',
  ink: '#f5f5f7',
  muted: '#9a9aa2',
  accent: '#4c9aff',
  chord: '#6ea8ff',
  lyric: '#d6d8de',
  rule: '#3a3a3e',
};

const PAD = 28;
const TOP = 62;
const ROW_H = 138;
const GAP = 18;
const NOTE_SIZE = 26;

const PITCH_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 调性决定用升号还是降号记谱。 */
export function pitchNames(keyRoot: number): string[] {
  return [1, 3, 6, 8, 10].includes(((keyRoot % 12) + 12) % 12) ? PITCH_FLAT : PITCH_SHARP;
}

/** MIDI -> 音名（带八度）。 */
export function noteName(midi: number, keyRoot = 0): string {
  if (!midi) return '--';
  const m = Math.round(midi);
  const names = pitchNames(keyRoot);
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** 时值 -> (减时线, 附点, 延长线)。和 Python 侧 _notation() 保持同一张表。 */
export function notationOf(dur: number): { lines: number; dots: number; extend: number } {
  const near = DUR_SET.reduce((a, b) => (Math.abs(b - dur) < Math.abs(a - dur) ? b : a), 4);
  const table: Record<number, [number, number, number]> = {
    4: [0, 0, 3],
    3: [0, 1, 1],
    2: [0, 0, 1],
    1.5: [0, 1, 0],
    1: [0, 0, 0],
    0.75: [1, 1, 0],
    0.5: [1, 0, 0],
    0.25: [2, 0, 0],
  };
  const [lines, dots, extend] = table[near] ?? [0, 0, 0];
  return { lines, dots, extend };
}

/**
 * 版面。
 *
 * - `scroll`（默认）：单行把所有小节横向铺开，宽度按每小节的音符数自适应
 *   （稀疏小节窄、密集小节宽）。播放时靠容器横向滚动跟随，和商业扒谱软件一样。
 * - `wrap`：按可用宽度换行，适合"一屏看全"或打印。
 */
export function layoutScore(
  doc: ScoreDoc,
  width: number,
  mode: 'scroll' | 'wrap' = 'scroll',
): ScoreLayout {
  const measures = doc.measures ?? [];

  if (mode === 'scroll') {
    const bars: ScoreBarBox[] = [];
    let x = PAD;
    measures.forEach((measure, index) => {
      // 每小节至少 170px，再按音符数量加宽，封顶 460px（避免一两个超密小节撑爆版面）
      const w = Math.min(460, Math.max(170, 56 + measure.notes.length * 38));
      bars.push({ index, x, y: TOP, w });
      x += w;
    });
    const total = Math.max(width, x + PAD);
    return {
      mode,
      rows: measures.length ? [measures.map((_, i) => i)] : [],
      bars,
      boxes: [],
      width: total,
      height: TOP + ROW_H + 24,
      barW: 240,
      barsPerLine: measures.length,
    };
  }

  const density =
    measures.reduce((sum, measure) => sum + measure.notes.length, 0) / Math.max(1, measures.length);
  let barsPerLine = 4;
  if (density > 7) barsPerLine = 2;
  else if (density > 4.5) barsPerLine = 3;

  const barW = (width - PAD * 2 - GAP * (barsPerLine - 1)) / Math.max(1, barsPerLine);
  const rows: number[][] = [];
  const bars: ScoreBarBox[] = [];
  for (let i = 0; i < measures.length; i += 1) {
    const rowIndex = Math.floor(i / barsPerLine);
    const colIndex = i % barsPerLine;
    if (colIndex === 0) rows.push([]);
    rows[rowIndex].push(i);
    bars.push({
      index: i,
      x: PAD + colIndex * (barW + GAP),
      y: TOP + rowIndex * ROW_H,
      w: barW,
    });
  }
  const height = TOP + Math.max(1, rows.length) * ROW_H + 24;
  return { mode, rows, bars, boxes: [], width, height, barW, barsPerLine };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 播放中的高亮位置。 */
export interface Playhead {
  mi: number;
  ni: number;
}

/** 拍 -> 秒。优先用引擎给的拍点表，缺失时退回按 BPM 等距。 */
export function beatToSeconds(doc: ScoreDoc, beat: number): number {
  const times = doc.meta.beat_times;
  const bpm = doc.meta.bpm || 100;
  if (!times || times.length < 2) return (beat * 60) / bpm;
  const index = Math.floor(beat);
  const frac = beat - index;
  if (index < 0) return times[0] + (beat * 60) / bpm;
  if (index + 1 < times.length) {
    return times[index] + frac * (times[index + 1] - times[index]);
  }
  const tail = 60 / bpm;
  return times[times.length - 1] + (beat - (times.length - 1)) * tail;
}

/** 给定播放时间，找出正在唱的音（没有就返回 null）。 */
export function noteAtTime(doc: ScoreDoc, seconds: number): Playhead | null {
  const measures = doc.measures ?? [];
  for (let mi = 0; mi < measures.length; mi += 1) {
    const measure = measures[mi];
    // 小节按拍连续排列，先做一次廉价剪枝
    const measureStart = beatToSeconds(doc, measure.start_beat);
    const measureEnd = beatToSeconds(doc, measure.start_beat + measure.beats);
    if (seconds < measureStart - 0.05 || seconds > measureEnd + 0.05) continue;
    for (let ni = 0; ni < measure.notes.length; ni += 1) {
      const note = measure.notes[ni];
      const start = beatToSeconds(doc, note.start_beat);
      const end = beatToSeconds(doc, note.start_beat + note.dur_beats);
      if (seconds >= start - 0.02 && seconds < end) return { mi, ni };
    }
  }
  return null;
}

/** 画一个简谱音符（数字 + 八度点 + 减时线 + 附点 + 延长线 + 连音线 + 歌词）。 */
function drawNote(
  ctx: CanvasRenderingContext2D,
  note: ScoreNote,
  x: number,
  numY: number,
  underY: number,
  lyricY: number,
  theme: ScoreTheme,
): void {
  const cw = NOTE_SIZE * 0.62;
  const cx = x + cw / 2;
  const color = note.degree === 0 ? theme.muted : theme.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (note.accidental) {
    ctx.fillStyle = theme.accent;
    ctx.font = `16px ${NOTE_FONT}`;
    ctx.fillText(note.accidental > 0 ? '♯' : '♭', x - 11, numY);
  }
  ctx.fillStyle = color;
  ctx.font = `500 ${NOTE_SIZE}px ${NOTE_FONT}`;
  ctx.fillText(String(note.degree ?? 0), x, numY);

  for (let k = 0; k < Math.abs(note.octave || 0); k += 1) {
    const cy = note.octave > 0 ? numY - NOTE_SIZE - 5 - k * 6 : underY + 10 + k * 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (let k = 0; k < Math.min(note.lines || 0, 2); k += 1) {
    const yy = underY + k * 5.5;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + cw, yy);
    ctx.stroke();
  }

  if (note.dots) {
    ctx.beginPath();
    ctx.arc(x + cw + 5, numY - 6, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  for (let k = 0; k < (note.extend || 0); k += 1) {
    ctx.fillStyle = color;
    ctx.font = `${NOTE_SIZE}px ${NOTE_FONT}`;
    ctx.fillText('－', x + cw + 6 + k * cw, numY);
  }

  if (note.tie) {
    ctx.strokeStyle = theme.rule;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + cw, numY - NOTE_SIZE - 2);
    ctx.quadraticCurveTo(x + cw + 22, numY - NOTE_SIZE - 11, x + cw + 44, numY - NOTE_SIZE - 2);
    ctx.stroke();
  }

  if (note.lyrics) {
    ctx.fillStyle = theme.lyric;
    ctx.font = `15px ${NOTE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(note.lyrics, cx, lyricY);
    ctx.textAlign = 'left';
  }
}

/** 画整张谱（就地往 layout.boxes 里填点击热区）。 */
export function drawScore(
  ctx: CanvasRenderingContext2D,
  doc: ScoreDoc,
  layout: ScoreLayout,
  theme: ScoreTheme,
  selected: { mi: number; ni: number } | null,
  dpr: number,
  playing: Playhead | null = null,
): ScoreLayout {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const beatCount = Math.max(1, doc.meta.beats_per_bar || 4);

  // 曲头（scroll 模式下画在第一个小节左上方，跟着内容一起滚）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.ink;
  ctx.font = `500 14px ${NOTE_FONT}`;
  const info = `${doc.meta.key_name}　${beatCount}/${doc.meta.beat_unit || 4}　♩=${Math.round(
    doc.meta.bpm || 0,
  )}`;
  ctx.fillText(info, PAD, 32);
  if (layout.mode === 'wrap') {
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.font = `11px ${NOTE_FONT}`;
    ctx.fillText('歌词：自动匹配 · 逐字对齐', layout.width - PAD, 30);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, TOP - 10);
  ctx.lineTo(layout.mode === 'scroll' ? layout.width - PAD : layout.width - PAD, TOP - 10);
  ctx.stroke();

  layout.boxes = [];
  layout.bars.forEach((bar) => {
    const measure = doc.measures[bar.index];
    if (!measure) return;
    const y0 = bar.y;
    const chordY = y0 + 34;
    const numY = y0 + 82;
    const underY = numY + 9;
    const lyricY = y0 + 122;
    const bx = bar.x;
    const barW = bar.w;

    // 小节线
    ctx.strokeStyle = theme.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + barW, y0 + 2);
    ctx.lineTo(bx + barW, y0 + ROW_H - 44);
    ctx.stroke();
    // 每行第一个小节（或整首第一个）画左边界线 + 调号
    const isRowStart =
      bar.index === 0 || (layout.mode === 'wrap' && bar.index % layout.barsPerLine === 0);
    if (isRowStart) {
      ctx.beginPath();
      ctx.moveTo(bx, y0 + 2);
      ctx.lineTo(bx, y0 + ROW_H - 44);
      ctx.stroke();
      ctx.fillStyle = theme.muted;
      ctx.font = `10px ${NOTE_FONT}`;
      ctx.fillText(doc.meta.key_name, bx + 4, y0 + 13);
    }

    // 和弦标记
    const marks: ScoreChordMark[] = [];
    if (measure.chord) marks.push(measure.chord);
    if (measure.extra_chords) marks.push(...measure.extra_chords);
    for (const mark of marks) {
      const rel = Math.min(Math.max((mark.at_beat - measure.start_beat) / beatCount, 0), 0.92);
      const cx = bx + rel * barW + 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.chord;
      ctx.font = `600 14px ${NOTE_FONT}`;
      ctx.fillText(mark.symbol, cx, chordY);
      if (mark.degree_text) {
        ctx.fillStyle = theme.muted;
        ctx.font = `9px ${NOTE_FONT}`;
        ctx.fillText(mark.degree_text, cx + mark.symbol.length * 8 + 4, chordY - 3);
      }
    }

    // 音符
    const mi = bar.index;
    measure.notes.forEach((note, ni) => {
      const rel = (note.start_beat - measure.start_beat) / beatCount;
      const x = bx + rel * barW;
      drawNote(ctx, note, x, numY, underY, lyricY, theme);
      layout.boxes.push({
        x,
        y: numY - NOTE_SIZE * 0.78,
        w: NOTE_SIZE * 0.62,
        h: NOTE_SIZE * 1.15,
        mi,
        ni,
        note,
      });
      if (selected && selected.mi === mi && selected.ni === ni) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.6;
        roundRect(ctx, x - 5, numY - NOTE_SIZE - 8, NOTE_SIZE * 0.62 + 16, NOTE_SIZE + 22, 6);
        ctx.stroke();
      } else if (playing && playing.mi === mi && playing.ni === ni) {
        // 播放中的音：浅色底 + 描边，不抢编辑选中框的注意力
        ctx.fillStyle = `${theme.accent}1f`;
        roundRect(ctx, x - 5, numY - NOTE_SIZE - 8, NOTE_SIZE * 0.62 + 16, NOTE_SIZE + 22, 6);
        ctx.fill();
        ctx.strokeStyle = `${theme.accent}88`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });
  });

  return layout;
}

/** 找点击位置命中的音。 */
export function hitTest(
  layout: ScoreLayout,
  mx: number,
  my: number,
): { mi: number; ni: number } | null {
  let best: NoteBox | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const box of layout.boxes) {
    if (mx < box.x - 8 || mx > box.x + box.w + 16) continue;
    if (my < box.y - 8 || my > box.y + box.h + 12) continue;
    const dist = Math.hypot(mx - (box.x + box.w / 2), my - (box.y + box.h / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = box;
    }
  }
  return best ? { mi: best.mi, ni: best.ni } : null;
}

/** 改音级（1-7 循环）。 */
export function shiftDegree(note: ScoreNote, delta: number): void {
  let degree = (note.degree || 1) + delta;
  if (degree > 7) degree = 1;
  if (degree < 1) degree = 7;
  note.degree = degree;
}

/** 改八度点。 */
export function shiftOctave(note: ScoreNote, delta: number): void {
  note.octave = Math.max(-3, Math.min(3, (note.octave || 0) + delta));
}

/** 在时值表里移动（-1 变短，+1 变长）。 */
export function shiftDuration(note: ScoreNote, delta: number): void {
  let index = DUR_SET.indexOf(note.dur_beats);
  if (index < 0) {
    index = DUR_SET.reduce(
      (best, value, i) =>
        Math.abs(DUR_SET[best] - note.dur_beats) < Math.abs(value - note.dur_beats) ? best : i,
      3,
    );
  }
  const next = Math.max(0, Math.min(DUR_SET.length - 1, index - delta));
  note.dur_beats = DUR_SET[next];
  const notation = notationOf(note.dur_beats);
  note.lines = notation.lines;
  note.dots = notation.dots;
  note.extend = notation.extend;
}

/** 删除一个音，时值并给前一个音（保持小节总长）。 */
export function deleteNote(measure: ScoreMeasure, ni: number): void {
  const note = measure.notes[ni];
  if (!note) return;
  const dur = note.dur_beats;
  measure.notes.splice(ni, 1);
  const prev = measure.notes[ni - 1];
  if (prev) {
    prev.dur_beats += dur;
    const notation = notationOf(prev.dur_beats);
    prev.lines = notation.lines;
    prev.dots = notation.dots;
    prev.extend = notation.extend;
  }
}

/** 统计。 */
export function scoreStats(doc: ScoreDoc): {
  notes: number;
  withLyrics: number;
  chords: number;
  bars: number;
  lyricRate: number;
} {
  let notes = 0;
  let withLyrics = 0;
  for (const measure of doc.measures ?? []) {
    for (const note of measure.notes) {
      if (note.degree === 0) continue;
      notes += 1;
      if (note.lyrics) withLyrics += 1;
    }
  }
  return {
    notes,
    withLyrics,
    chords: doc.chords?.length ?? 0,
    bars: doc.measures?.length ?? 0,
    lyricRate: notes ? withLyrics / notes : 0,
  };
}
