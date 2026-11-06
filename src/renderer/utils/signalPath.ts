/**
 * 音质链路的纯函数（可单测）
 *
 * 只做「把拿到的数据翻译成文案」这件事，不碰 DOM、不依赖组件。
 */

export interface OutputStatsLike {
  backend?: string;
  sampleRate?: number;
  engineSampleRate?: number;
  channels?: number;
  format?: string;
  bufferSecs?: number;
  underruns?: number;
}

const QUALITY_LABELS: Record<string, string> = {
  flac: 'SQ 无损',
  '320': 'HQ 320k',
  '128': '标准 128k',
  high: '较高',
  standard: '标准',
  low: '流畅',
};

export const formatQualityLabel = (quality?: string | null): string => {
  const key = String(quality ?? '');
  return QUALITY_LABELS[key] ?? (key || '—');
};

export const isLosslessQuality = (quality?: string | null): boolean =>
  String(quality ?? '') === 'flac';

/** 采样率：引擎与设备不同则显示箭头表示发生了重采样 */
export const formatSampleRate = (stats?: OutputStatsLike | null): string => {
  if (!stats) return '—';
  const engine = Number(stats.engineSampleRate) || 0;
  const device = Number(stats.sampleRate) || 0;
  if (!engine && !device) return '—';
  if (engine && device && engine !== device) {
    return `${(engine / 1000).toFixed(1)}k → ${(device / 1000).toFixed(1)}k`;
  }
  return `${((device || engine) / 1000).toFixed(1)} kHz`;
};

export const isResampled = (stats?: OutputStatsLike | null): boolean => {
  if (!stats) return false;
  const engine = Number(stats.engineSampleRate) || 0;
  const device = Number(stats.sampleRate) || 0;
  return Boolean(engine && device && engine !== device);
};

export const formatFormat = (stats?: OutputStatsLike | null): string => {
  if (!stats?.format) return '—';
  const channels = Number(stats.channels) || 0;
  const channelText =
    channels === 1 ? '单声道' : channels === 2 ? '立体声' : channels > 2 ? `${channels} 声道` : '';
  return [String(stats.format).toUpperCase(), channelText].filter(Boolean).join(' · ');
};

const BACKEND_LABELS: Record<string, string> = {
  wasapi: 'WASAPI',
  dsound: 'DirectSound',
  coreaudio: 'CoreAudio',
  alsa: 'ALSA',
  pulse: 'PulseAudio',
  pipewire: 'PipeWire',
};

export const formatBackend = (stats?: OutputStatsLike | null, exclusive = false): string => {
  const backend = String(stats?.backend ?? '').toLowerCase();
  const mode = exclusive ? '独占' : '共享';
  if (!backend) return mode === '独占' ? 'WASAPI 独占' : '共享模式';
  return `${BACKEND_LABELS[backend] ?? backend} · ${mode}`;
};

export const formatBuffer = (stats?: OutputStatsLike | null): string => {
  if (!stats) return '—';
  const ms = Math.round((Number(stats.bufferSecs) || 0) * 1000);
  const underruns = Number(stats.underruns) || 0;
  return [`${ms} ms`, underruns > 0 ? `欠载 ${underruns}` : '无欠载'].join(' · ');
};

export type VerdictTone = 'good' | 'warn' | 'muted';

export interface Verdict {
  tone: VerdictTone;
  text: string;
}

/** 结论：用户最关心的「我听到的是不是原样」 */
export const buildVerdict = (input: {
  hasStats: boolean;
  resampled: boolean;
  lossless: boolean;
  exclusive: boolean;
}): Verdict => {
  if (!input.hasStats) {
    return { tone: 'muted', text: '开始播放后显示实际输出参数' };
  }
  if (input.resampled) {
    return { tone: 'warn', text: '系统在输出前做了重采样，可能与音源不完全一致' };
  }
  if (!input.lossless) {
    return { tone: 'muted', text: '当前是有损音源，换成 SQ 可减少一层损失' };
  }
  if (input.exclusive) {
    return { tone: 'good', text: '无损音源 + 独占输出，链路没有被系统改动' };
  }
  return { tone: 'good', text: '无损音源，未检测到重采样' };
};
