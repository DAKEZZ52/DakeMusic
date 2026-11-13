/**
 * LyriseMusic 扒谱模块（共享类型）
 * 文件：scoreflow.ts
 * 描述：把音频转成简谱（音符/时值/小节/和弦/歌词逐字对齐），
 *      引擎是本地 Python 侧车（ScoreFlow），不走云端。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */

/** 简谱上的一个音（含休止）。 */
export interface ScoreNote {
  /** 全局浮点拍号（相对乐曲开头）。 */
  start_beat: number;
  /** 时值（拍）。 */
  dur_beats: number;
  /** 首调级数 1-7，0 表示休止。 */
  degree: number;
  /** -1 = ♭，+1 = ♯。 */
  accidental: number;
  /** 八度点个数（正数上加点，负数下加点）。 */
  octave: number;
  /** 原始音高（MIDI），回放与校对用。 */
  midi: number;
  /** 减时线数量。 */
  lines: number;
  /** 附点数。 */
  dots: number;
  /** 延长线数量。 */
  extend: number;
  /** 与下一个音连音。 */
  tie: boolean;
  /** 圆滑线。 */
  slur: boolean;
  /** 对应的歌词字。 */
  lyrics: string;
  confidence: number;
}

/** 挂在某拍上的和弦标记。 */
export interface ScoreChordMark {
  at_beat: number;
  symbol: string;
  degree_text: string;
  quality_text: string;
}

/** 一个小节。 */
export interface ScoreMeasure {
  index: number;
  start_beat: number;
  beats: number;
  notes: ScoreNote[];
  chord: ScoreChordMark | null;
  extra_chords?: ScoreChordMark[];
}

/** 和弦区间（原始，未按小节归并）。 */
export interface ScoreChordSpan {
  start: number;
  end: number;
  root: number;
  quality: string;
  bass: number | null;
  score: number;
  /** 展示用符号，例如 G7/B。 */
  symbol?: string;
}

/** 原始检测到的音符（未量化），卷帘用。 */
export interface ScoreRawNote {
  start: number;
  end: number;
  midi: number;
  velocity: number;
  confidence: number;
  lyrics?: string;
}

/** 逐字歌词时间戳。 */
export interface ScoreLyricToken {
  text: string;
  start: number;
  end: number;
}

/** 引擎与耗时信息。 */
export interface ScoreEngineInfo {
  stems?: string;
  melody?: string;
  beats?: string;
  chords?: string;
  key?: string;
  lyrics?: string;
  warnings?: string[];
  /** 歌词对齐统计。 */
  lyric_stats?: {
    attached?: number;
    notes?: number;
    tokens?: number;
    rate?: number;
    chars_placed?: number;
    chars_total?: number;
    char_rate?: number;
  };
}

/** 曲头信息。 */
export interface ScoreMeta {
  title: string;
  artist: string;
  source: string;
  duration: number;
  /** 主音 pitch class 0-11。 */
  key_root: number;
  key_mode: 'major' | 'minor' | string;
  /** 例如 1=Eb。 */
  key_name: string;
  bpm: number;
  beats_per_bar: number;
  beat_unit: number;
  /** 每个拍点的绝对时间（秒）。播放高亮靠它把"拍"换算成"秒"，比按 BPM 等距推算准。 */
  beat_times?: number[];
  engine: ScoreEngineInfo;
}

/** 完整谱面文档（score.json 的结构）。 */
export interface ScoreDoc {
  meta: ScoreMeta;
  measures: ScoreMeasure[];
  raw_notes: ScoreRawNote[];
  /** [秒, MIDI] 稀疏音高曲线。 */
  pitch_curve: [number, number][];
  chords: ScoreChordSpan[];
  lyric_tokens: ScoreLyricToken[];
}

/** 扒谱输入：渲染层解码好的 PCM。 */
export interface ScorePcmInput {
  /** 源声道数（仅记录；扒谱只用单声道）。 */
  channels: number;
  sampleRate: number;
  /**
   * 单声道 PCM（Float32，-1..1）。
   * 刻意用单个数组而不是数组的数组：preload 的 IPC 序列化对顶层 ArrayBuffer 视图是
   * 直接透传的，套在对象里会被 JSON 化——一首歌 800 万个采样点，JSON 化要几百毫秒
   * 且产生上百 MB 的中间字符串。
   */
  data: Float32Array;
  /** 输出命名的基础名（通常是歌名）。 */
  baseName: string;
}

/** 扒谱选项。 */
export interface ScoreOptions {
  title?: string;
  artist?: string;
  /** 跳过人声分离（快，和弦会退化）。 */
  noSeparate?: boolean;
  /** 跳过歌词识别。 */
  noLyrics?: boolean;
  /** 量化网格：0.25 十六分（细）/ 0.5 八分（干净）。 */
  grid?: number;
  /** 手动指定速度，覆盖自动检测。 */
  bpm?: number;
  /** 手动指定拍号。 */
  meter?: 3 | 4;
  /** 歌词模型：tiny/base/small/medium。 */
  whisper?: string;
}

/** 扒谱进度事件。 */
export interface ScoreProgress {
  /** 引擎给的阶段名（读取音频、分离人声与贝斯、识别音高与音符…）。 */
  stage: string;
  /** 0..1。 */
  percent: number;
  /** 已用秒数。 */
  elapsed?: number;
}

/** 引擎可用性。 */
export interface ScoreEngineStatus {
  available: boolean;
  /** Python 解释器或打包后的可执行文件路径。 */
  runtime: string;
  /** 引擎根目录。 */
  root: string;
  /** 版本号（探测失败为空）。 */
  version: string;
  /** 不可用时的原因。 */
  reason?: string;
}

/** 扒谱结果。 */
export interface ScoreResult {
  doc: ScoreDoc;
  /** 引擎原始输出目录（临时目录，含 score.json / score.svg）。 */
  outDir: string;
  /** 总耗时（秒）。 */
  elapsed: number;
}

/** 扒谱相关 IPC 通道常量。 */
export const SCOREFLOW_IPC_CHANNELS = {
  /** 探测引擎是否可用（入参无，返回 ScoreEngineStatus）。 */
  engineStatus: 'scoreflow:engineStatus',
  /** 开始扒谱（入参 { input, options }，返回 ScoreResult；进度经 progress 事件广播）。 */
  transcribe: 'scoreflow:transcribe',
  /** 取消进行中的扒谱（入参无，返回 boolean）。 */
  cancel: 'scoreflow:cancel',
  /** 导出谱面 JSON 到用户选择的位置（入参 { doc, suggestedName }，返回路径；取消返回 null）。 */
  exportJson: 'scoreflow:exportJson',
  /** 主进程 -> 渲染层的进度事件（入参 ScoreProgress）。 */
  progress: 'scoreflow:progress',
} as const;
