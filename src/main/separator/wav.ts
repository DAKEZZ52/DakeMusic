/**
 * WAV（PCM）编码器，支持 16 / 24 bit、立体声。
 * 输出为 Buffer，可直接写盘。
 */

export type WavBitDepth = 16 | 24;

function clampSample(v: number): number {
  if (v > 1) return 1;
  if (v < -1) return -1;
  return v;
}

/**
 * @param channels 每个通道的 PCM（Float32，范围 -1..1）
 * @param sampleRate 采样率
 * @param bitDepth 位深
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: WavBitDepth = 24,
): Buffer {
  const numChannels = channels.length;
  const length = channels[0].length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  // data chunk（fmt 块 16 字节结束于 35，data 标识紧跟 36）
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < length; i += 1) {
      for (let ch = 0; ch < numChannels; ch += 1) {
        const s = clampSample(channels[ch][i]);
        buffer.writeInt16LE(Math.round(s * 32767), offset);
        offset += 2;
      }
    }
  } else {
    // 24 bit
    for (let i = 0; i < length; i += 1) {
      for (let ch = 0; ch < numChannels; ch += 1) {
        const s = clampSample(channels[ch][i]);
        let int = Math.round(s * 8388607);
        if (int < 0) int += 0x1000000;
        buffer.writeUInt8(int & 0xff, offset);
        buffer.writeUInt8((int >> 8) & 0xff, offset + 1);
        buffer.writeUInt8((int >> 16) & 0xff, offset + 2);
        offset += 3;
      }
    }
  }

  return buffer;
}
