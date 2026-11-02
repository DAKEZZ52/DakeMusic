/**
 * MDX-Net 分离管线，复刻 audio-separator 的 MDX demix 流程：
 *   - 归一化（峰值 0.9）
 *   - 重叠切块（overlap 0.25）→ STFT → 前 3 频率 bin 清零 → ONNX 模型 → iSTFT
 *   - hanning 窗 overlap-add 归一化
 *   - 输出乘 compensate
 * Inst 模型直接输出伴奏，人声 = mix − 伴奏。
 *
 * 归一化在最后被撤销，使输出电平与原始一致（人声、伴奏同比缩放）。
 */

import type { InferenceSession, Tensor } from 'onnxruntime-node';
import * as ort from 'onnxruntime-node';
import type { ModelSpec } from './model';
import { STFT, type Spectrogram } from './stft';

const NORMALIZATION_PEAK = 0.9;
const OVERLAP = 0.25;

/** np.hanning（symmetric）：w[i] = 0.5*(1-cos(2π i/(M-1)))。 */
function npHanning(m: number): Float32Array {
  const w = new Float32Array(m);
  if (m === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < m; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (m - 1)));
  }
  return w;
}

export interface SeparationResult {
  /** 人声，每通道一个 PCM。 */
  vocals: Float32Array[];
  /** 伴奏，每通道一个 PCM。 */
  instrumental: Float32Array[];
}

/**
 * 对立体声 mix 执行分离。
 * @param mix 2 通道 PCM（单声道会复制成双声道）
 */
export async function separate(
  mix: Float32Array[],
  spec: ModelSpec,
  session: InferenceSession,
  onProgress: (percent: number) => void,
): Promise<SeparationResult> {
  // 确保双声道
  const channels: Float32Array[] =
    mix.length === 1 ? [mix[0], mix[0].slice()] : [mix[0].slice(), mix[1].slice()];
  const n = channels[0].length;

  // 归一化
  let maxv = 0;
  for (let ch = 0; ch < 2; ch += 1) {
    const c = channels[ch];
    for (let i = 0; i < n; i += 1) {
      const a = Math.abs(c[i]);
      if (a > maxv) maxv = a;
    }
  }
  let restoreFactor = 1;
  if (maxv > NORMALIZATION_PEAK) {
    const factor = NORMALIZATION_PEAK / maxv;
    restoreFactor = 1 / factor;
    for (let ch = 0; ch < 2; ch += 1) {
      const c = channels[ch];
      for (let i = 0; i < n; i += 1) c[i] *= factor;
    }
  }

  // 以模型真实输入维度为准（shape: [batch, 4, dimF, dimT]），防止静态参数与模型失配
  // 导致 onnxruntime 报 "Got invalid dimensions"；hop 与 compensate 仍来自模型规格。
  const { hop, compensate } = spec;
  let { nFft, dimF, dimT } = spec;
  const metadata = (session as unknown as { inputMetadata?: unknown }).inputMetadata;
  if (Array.isArray(metadata) && metadata[0]) {
    const shape = (metadata[0] as { shape?: unknown }).shape;
    if (Array.isArray(shape) && shape.length >= 4) {
      const f = Number(shape[2]);
      const t = Number(shape[3]);
      if (Number.isFinite(f) && f > 0) {
        dimF = f;
        // MDX-Net 频点数 = n_fft / 2，按真实 dimF 反推 nFft，保证 STFT 频点数匹配
        nFft = f * 2;
      }
      if (Number.isFinite(t) && t > 0) dimT = t;
    }
  }
  const trim = nFft / 2;
  const chunkSize = hop * (dimT - 1);
  const genSize = chunkSize - 2 * trim;
  const step = Math.floor((1 - OVERLAP) * chunkSize);
  const pad = genSize + trim - (n % genSize);
  const mixtureLen = trim + n + pad;

  // mixture：头 trim 零 + mix + 尾 pad 零
  const mixture = [new Float32Array(mixtureLen), new Float32Array(mixtureLen)];
  for (let ch = 0; ch < 2; ch += 1) {
    mixture[ch].set(channels[ch], trim);
  }

  const result = [new Float32Array(mixtureLen), new Float32Array(mixtureLen)];
  const divider = [new Float32Array(mixtureLen), new Float32Array(mixtureLen)];

  const stft = new STFT(nFft, hop);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const totalChunks = Math.ceil(mixtureLen / step);
  let chunkIndex = 0;

  for (let i = 0; i < mixtureLen; i += step) {
    chunkIndex += 1;
    const start = i;
    const end = Math.min(i + chunkSize, mixtureLen);
    const actual = end - start;

    // 取块（不足补零到 chunkSize）
    const chunk: Float32Array[] = [new Float32Array(chunkSize), new Float32Array(chunkSize)];
    for (let ch = 0; ch < 2; ch += 1) {
      chunk[ch].set(mixture[ch].subarray(start, end), 0);
    }

    // 每块 STFT（内部 center reflect pad）
    const specs = [stft.forward(chunk[0]), stft.forward(chunk[1])];
    const nBins = stft.nBins;

    // 组装模型输入 (1,4,dimF,dimT)
    const inputData = new Float32Array(4 * dimF * dimT);
    for (let f = 0; f < dimF; f += 1) {
      for (let t = 0; t < dimT; t += 1) {
        const sIdx = t * nBins + f;
        const base = f * dimT + t;
        inputData[base] = specs[0].re[sIdx];
        inputData[dimF * dimT + base] = specs[0].im[sIdx];
        inputData[2 * dimF * dimT + base] = specs[1].re[sIdx];
        inputData[3 * dimF * dimT + base] = specs[1].im[sIdx];
      }
    }
    // 前 3 频率 bin 清零
    for (let f = 0; f < 3; f += 1) {
      for (let t = 0; t < dimT; t += 1) {
        const base = f * dimT + t;
        inputData[base] = 0;
        inputData[dimF * dimT + base] = 0;
        inputData[2 * dimF * dimT + base] = 0;
        inputData[3 * dimF * dimT + base] = 0;
      }
    }

    const inputTensor = new ort.Tensor('float32', inputData, [1, 4, dimF, dimT]) as Tensor;
    const feeds: Record<string, Tensor> = { [inputName]: inputTensor };
    const outMap = await session.run(feeds);
    const outData = outMap[outputName].data as Float32Array;

    // 解包为每通道 spectrogram（nBins，bin dimF 视为 0）
    const outSpecs: Spectrogram[] = [
      {
        nBins,
        frames: dimT,
        re: new Float32Array(nBins * dimT),
        im: new Float32Array(nBins * dimT),
      },
      {
        nBins,
        frames: dimT,
        re: new Float32Array(nBins * dimT),
        im: new Float32Array(nBins * dimT),
      },
    ];
    for (let f = 0; f < dimF; f += 1) {
      for (let t = 0; t < dimT; t += 1) {
        const base = f * dimT + t;
        const sIdx = t * nBins + f;
        outSpecs[0].re[sIdx] = outData[base];
        outSpecs[0].im[sIdx] = outData[dimF * dimT + base];
        outSpecs[1].re[sIdx] = outData[2 * dimF * dimT + base];
        outSpecs[1].im[sIdx] = outData[3 * dimF * dimT + base];
      }
    }

    // iSTFT 回 chunk 波形
    const wave = [stft.inverse(outSpecs[0], chunkSize), stft.inverse(outSpecs[1], chunkSize)];

    // 窗 + overlap-add
    const window = npHanning(actual);
    for (let ch = 0; ch < 2; ch += 1) {
      for (let k = 0; k < actual; k += 1) {
        const w = window[k];
        result[ch][start + k] += wave[ch][k] * w;
        divider[ch][start + k] += w;
      }
    }

    onProgress(chunkIndex / totalChunks);
  }

  // 归一化 + 去 trim + 裁剪到 n
  const source = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch += 1) {
    for (let k = 0; k < n; k += 1) {
      const pos = trim + k;
      let v = result[ch][pos];
      const d = divider[ch][pos];
      if (d > 1e-8) v /= d;
      source[ch][k] = v * compensate;
    }
  }

  // 撤销归一化
  if (restoreFactor !== 1) {
    for (let ch = 0; ch < 2; ch += 1) {
      for (let k = 0; k < n; k += 1) source[ch][k] *= restoreFactor;
    }
  }

  // 按模型的优先输出轨拆分：
  //   Inst 模型直接输出伴奏 → 人声 = 原始 mix − 伴奏
  //   Voc  模型直接输出人声 → 伴奏 = 原始 mix − 人声
  const vocals = [new Float32Array(n), new Float32Array(n)];
  const instrumental = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch += 1) {
    for (let k = 0; k < n; k += 1) {
      const direct = source[ch][k];
      const other = channels[ch][k] * restoreFactor - direct;
      if (spec.primaryStem === 'vocals') {
        vocals[ch][k] = direct;
        instrumental[ch][k] = other;
      } else {
        instrumental[ch][k] = direct;
        vocals[ch][k] = other;
      }
    }
  }

  return { vocals, instrumental };
}
