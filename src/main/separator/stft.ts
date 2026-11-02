/**
 * STFT / iSTFT，精确复刻 torch.stft / torch.istft：
 *   - 窗：hann_window(periodic=True)
 *   - center=True，pad_mode='reflect'
 *   - onesided（输出 n_fft//2+1 个频率 bin）
 *
 * 频谱以扁平 Float32Array 存储，frame-major：[frame * nBins + bin]。
 */

import { forwardFft, inverseFft } from './fft';

export interface Spectrogram {
  nBins: number;
  frames: number;
  re: Float32Array;
  im: Float32Array;
}

/** periodic Hann 窗。 */
export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  }
  return w;
}

/** reflect 索引（torch pad_mode='reflect'，period = 2*(n-1)）。 */
function reflectIndex(p: number, n: number): number {
  if (n === 1) return 0;
  const period = 2 * (n - 1);
  let q = p % period;
  if (q < 0) q += period;
  if (q >= n) q = period - q;
  return q;
}

export class STFT {
  readonly nFft: number;
  readonly hop: number;
  readonly nBins: number;
  readonly window: Float32Array;
  private bufRe: Float32Array;
  private bufIm: Float32Array;

  constructor(nFft: number, hop: number) {
    this.nFft = nFft;
    this.hop = hop;
    this.nBins = nFft / 2 + 1;
    this.window = hannWindow(nFft);
    this.bufRe = new Float32Array(nFft);
    this.bufIm = new Float32Array(nFft);
  }

  /** 单通道 STFT。 */
  forward(wave: Float32Array): Spectrogram {
    const { nFft, hop, nBins, window } = this;
    const n = wave.length;
    const trim = nFft / 2;
    const paddedLen = n + 2 * trim;
    const frames = Math.floor((paddedLen - nFft) / hop) + 1;
    const re = new Float32Array(frames * nBins);
    const im = new Float32Array(frames * nBins);

    for (let frame = 0; frame < frames; frame += 1) {
      const start = frame * hop; // 在 padded 坐标系
      for (let k = 0; k < nFft; k += 1) {
        const src = reflectIndex(start + k - trim, n);
        this.bufRe[k] = wave[src] * window[k];
        this.bufIm[k] = 0;
      }
      forwardFft(this.bufRe, this.bufIm);
      const outBase = frame * nBins;
      for (let bin = 0; bin < nBins; bin += 1) {
        re[outBase + bin] = this.bufRe[bin];
        im[outBase + bin] = this.bufIm[bin];
      }
    }

    return { nBins, frames, re, im };
  }

  /**
   * 单通道 iSTFT（overlap-add，window² 归一化）。
   * @param length 原始波形长度（去 center pad 后裁剪/补零到该长度）。
   */
  inverse(spec: Spectrogram, length: number): Float32Array {
    const { nFft, hop, nBins, window } = this;
    const { frames } = spec;
    const paddedLen = (frames - 1) * hop + nFft;
    const y = new Float32Array(paddedLen);
    const norm = new Float32Array(paddedLen);

    for (let frame = 0; frame < frames; frame += 1) {
      const specBase = frame * nBins;
      // onesided → full
      for (let bin = 0; bin < nBins; bin += 1) {
        this.bufRe[bin] = spec.re[specBase + bin];
        this.bufIm[bin] = spec.im[specBase + bin];
      }
      for (let bin = nBins; bin < nFft; bin += 1) {
        const mirror = nFft - bin;
        this.bufRe[bin] = spec.re[specBase + mirror];
        this.bufIm[bin] = -spec.im[specBase + mirror];
      }
      inverseFft(this.bufRe, this.bufIm);
      const start = frame * hop;
      for (let k = 0; k < nFft; k += 1) {
        const pos = start + k;
        y[pos] += this.bufRe[k] * window[k];
        norm[pos] += window[k] * window[k];
      }
    }

    for (let i = 0; i < paddedLen; i += 1) {
      if (norm[i] > 1e-8) y[i] /= norm[i];
    }

    // 去 center pad
    const trim = nFft / 2;
    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const src = trim + i;
      out[i] = src < paddedLen ? y[src] : 0;
    }
    return out;
  }
}
