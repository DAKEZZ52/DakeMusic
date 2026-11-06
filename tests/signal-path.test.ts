import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVerdict,
  formatBackend,
  formatBuffer,
  formatFormat,
  formatQualityLabel,
  formatSampleRate,
  isLosslessQuality,
  isResampled,
} from '../src/renderer/utils/signalPath.ts';

test('音质文案：常见取值都有中文标签', () => {
  assert.equal(formatQualityLabel('flac'), 'SQ 无损');
  assert.equal(formatQualityLabel('320'), 'HQ 320k');
  assert.equal(formatQualityLabel('128'), '标准 128k');
  assert.equal(formatQualityLabel(''), '—');
  assert.equal(formatQualityLabel('unknown-x'), 'unknown-x');
});

test('无损判断只认 flac', () => {
  assert.equal(isLosslessQuality('flac'), true);
  assert.equal(isLosslessQuality('320'), false);
  assert.equal(isLosslessQuality(undefined), false);
});

test('采样率：一致时显示单值，不一致时显示箭头', () => {
  assert.equal(formatSampleRate(null), '—');
  assert.equal(formatSampleRate({ sampleRate: 44100, engineSampleRate: 44100 }), '44.1 kHz');
  assert.equal(formatSampleRate({ sampleRate: 48000, engineSampleRate: 44100 }), '44.1k → 48.0k');
  assert.equal(formatSampleRate({ sampleRate: 0, engineSampleRate: 0 }), '—');
});

test('重采样检测：只有两侧都已知且不同才算', () => {
  assert.equal(isResampled(null), false);
  assert.equal(isResampled({ sampleRate: 48000, engineSampleRate: 48000 }), false);
  assert.equal(isResampled({ sampleRate: 48000, engineSampleRate: 44100 }), true);
  assert.equal(isResampled({ sampleRate: 48000 }), false);
});

test('输出格式：拼接声道文案', () => {
  assert.equal(formatFormat(null), '—');
  assert.equal(formatFormat({ format: 'f32', channels: 2 }), 'F32 · 立体声');
  assert.equal(formatFormat({ format: 's16', channels: 1 }), 'S16 · 单声道');
  assert.equal(formatFormat({ format: 's16', channels: 6 }), 'S16 · 6 声道');
  assert.equal(formatFormat({ format: 'f32' }), 'F32');
});

test('驱动文案：未知后端也能显示，并带上独占/共享', () => {
  assert.equal(formatBackend(null, false), '共享模式');
  assert.equal(formatBackend(null, true), 'WASAPI 独占');
  assert.equal(formatBackend({ backend: 'wasapi' }, false), 'WASAPI · 共享');
  assert.equal(formatBackend({ backend: 'alsa' }, true), 'ALSA · 独占');
  assert.equal(formatBackend({ backend: 'weird' }, false), 'weird · 共享');
});

test('缓冲文案：欠载数为 0 时显示「无欠载」', () => {
  assert.equal(formatBuffer(null), '—');
  assert.equal(formatBuffer({ bufferSecs: 0.2, underruns: 0 }), '200 ms · 无欠载');
  assert.equal(formatBuffer({ bufferSecs: 0.15, underruns: 3 }), '150 ms · 欠载 3');
});

test('结论：没有数据时提示先播放', () => {
  const verdict = buildVerdict({
    hasStats: false,
    resampled: false,
    lossless: true,
    exclusive: false,
  });
  assert.equal(verdict.tone, 'muted');
  assert.match(verdict.text, /开始播放/);
});

test('结论：重采样优先级最高（即使是无损）', () => {
  const verdict = buildVerdict({
    hasStats: true,
    resampled: true,
    lossless: true,
    exclusive: false,
  });
  assert.equal(verdict.tone, 'warn');
  assert.match(verdict.text, /重采样/);
});

test('结论：有损音源给出换 SQ 的建议', () => {
  const verdict = buildVerdict({
    hasStats: true,
    resampled: false,
    lossless: false,
    exclusive: false,
  });
  assert.equal(verdict.tone, 'muted');
  assert.match(verdict.text, /SQ/);
});

test('结论：无损 + 独占 = 链路未被改动', () => {
  const verdict = buildVerdict({
    hasStats: true,
    resampled: false,
    lossless: true,
    exclusive: true,
  });
  assert.equal(verdict.tone, 'good');
  assert.match(verdict.text, /独占输出/);
});

test('结论：无损 + 共享但无重采样 = 正常', () => {
  const verdict = buildVerdict({
    hasStats: true,
    resampled: false,
    lossless: true,
    exclusive: false,
  });
  assert.equal(verdict.tone, 'good');
  assert.match(verdict.text, /未检测到重采样/);
});
