/**
 * LyriseMusic 人声/伴奏分离模块 - 音高移位
 * 文件：pitchShift.ts
 * 描述：保持时长的音高移位（变调/升降 Key），供分离输出按所选调生成。
 *       底层使用 soundtouchjs（SoundTouch 算法，按立体声帧 interleave 处理）：
 *         pitchSemitones = 半音偏移，tempo = 1 保持时长。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */

import { SoundTouch } from 'soundtouchjs';

/** 单次喂入的帧数（每帧 = 立体声 2 个样本）。 */
const CHUNK_FRAMES = 8192;
/** 单次回收输出的最大帧数。 */
const DRAIN_FRAMES = 8192;

/**
 * 音高移位（保持时长）：semitones > 0 升调、< 0 降调、0 原样拷贝。
 * @param channels 每通道一个 PCM（Float32，-1..1）
 * @param semitones 半音数（±12 内合理，支持任意整数）
 */
export function pitchShift(channels: Float32Array[], semitones: number): Float32Array[] {
  if (!Number.isFinite(semitones) || semitones === 0) {
    return channels.map((c) => c.slice());
  }
  const n = channels[0].length;
  const mono = channels.length === 1;

  // SoundTouch 按立体声帧（L/R interleave）处理：单声道复制到双声道
  const inter = new Float32Array(n * 2);
  if (mono) {
    const c = channels[0];
    for (let i = 0; i < n; i += 1) {
      inter[2 * i] = c[i];
      inter[2 * i + 1] = c[i];
    }
  } else {
    const l = channels[0];
    const r = channels[1];
    for (let i = 0; i < n; i += 1) {
      inter[2 * i] = l[i];
      inter[2 * i + 1] = r[i];
    }
  }

  const outInter = processSoundTouch(inter, semitones, n);

  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    l[i] = outInter[2 * i];
    r[i] = outInter[2 * i + 1];
  }
  return mono ? [l] : [l, r];
}

/** 单实例流式处理：分块喂入并持续回收输出，最后按输入帧数裁剪。 */
function processSoundTouch(inter: Float32Array, semitones: number, frames: number): Float32Array {
  const touch = new SoundTouch();
  touch.pitchSemitones = semitones;
  touch.tempo = 1; // 时长不变
  touch.rate = 1;

  const chunks: Float32Array[] = [];
  const buf = new Float32Array(DRAIN_FRAMES * 2);

  const drain = () => {
    for (;;) {
      const available = touch.outputBuffer.frameCount;
      if (available <= 0) break;
      const want = Math.min(available, DRAIN_FRAMES);
      touch.outputBuffer.receiveSamples(buf, want);
      chunks.push(buf.slice(0, want * 2));
    }
  };

  let i = 0;
  while (i < frames) {
    const end = Math.min(i + CHUNK_FRAMES, frames);
    touch.inputBuffer.putSamples(inter.subarray(i * 2, end * 2), 0, end - i);
    i = end;
    touch.process();
    drain();
  }
  // 输入耗尽后继续处理，把管线内余量排空
  for (let k = 0; k < 4; k += 1) {
    touch.process();
    drain();
  }

  // 拼接（SoundTouch 存在固定延迟窗口，输出帧数可能略少于输入）
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const validFrames = Math.min(total, frames * 2) / 2;
  const out = new Float32Array(frames * 2);
  let offset = 0;
  for (const c of chunks) {
    const len = Math.min(c.length, frames * 2 - offset);
    out.set(c.subarray(0, len), offset);
    offset += len;
    if (offset >= frames * 2) break;
  }

  // 输出略短时，尾部做短淡出并补零，避免静音突变产生爆音
  const valid = validFrames > 4 ? Math.floor(validFrames) : 0;
  if (valid > 0 && valid < frames) {
    const fadeFrames = Math.min(2048, valid);
    for (let f = valid - fadeFrames; f < valid; f += 1) {
      const g = (valid - f) / fadeFrames;
      out[2 * f] *= g;
      out[2 * f + 1] *= g;
    }
  }
  return out;
}

/** 以 C 为基准的 12 个调 → 半音偏移（C=0、C#=1、…、B=11）。 */
export const KEY_SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};
