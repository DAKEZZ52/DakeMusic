/**
 * LyriseMusic - soundtouchjs 类型声明
 * 文件：soundtouchjs.d.ts
 * 描述：soundtouchjs 无自带类型声明，这里按实际用到的 API 子集声明。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
declare module 'soundtouchjs' {
  export interface FifoSampleBuffer {
    readonly frameCount: number;
    putSamples(samples: Float32Array, position: number, numFrames: number): void;
    receiveSamples(output: Float32Array, numFrames: number): void;
  }

  export class SoundTouch {
    pitchSemitones: number;
    tempo: number;
    rate: number;
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    process(): void;
    clear(): void;
  }
}
