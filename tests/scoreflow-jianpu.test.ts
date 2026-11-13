import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DUR_SET,
  beatToSeconds,
  deleteNote,
  hitTest,
  layoutScore,
  noteAtTime,
  noteName,
  notationOf,
  pitchNames,
  scoreStats,
  shiftDegree,
  shiftDuration,
  shiftOctave,
  type ScoreLayout,
} from '../src/renderer/utils/jianpu.ts';
import type { ScoreDoc, ScoreMeasure, ScoreNote } from '../src/shared/scoreflow.ts';

function note(partial: Partial<ScoreNote> = {}): ScoreNote {
  return {
    start_beat: 0,
    dur_beats: 1,
    degree: 1,
    accidental: 0,
    octave: 0,
    midi: 63,
    lines: 0,
    dots: 0,
    extend: 0,
    tie: false,
    slur: false,
    lyrics: '',
    confidence: 1,
    ...partial,
  };
}

function measure(index: number, notes: ScoreNote[]): ScoreMeasure {
  return { index, start_beat: index * 4, beats: 4, notes, chord: null };
}

function doc(measures: ScoreMeasure[]): ScoreDoc {
  return {
    meta: {
      title: 't',
      artist: 'a',
      source: '',
      duration: 10,
      key_root: 3,
      key_mode: 'major',
      key_name: '1=Eb',
      bpm: 68,
      beats_per_bar: 4,
      beat_unit: 4,
      engine: {},
    },
    measures,
    raw_notes: [],
    pitch_curve: [],
    chords: [],
    lyric_tokens: [],
  };
}

test('时值映射与引擎侧 _notation 一致', () => {
  assert.deepEqual(notationOf(4), { lines: 0, dots: 0, extend: 3 });
  assert.deepEqual(notationOf(3), { lines: 0, dots: 1, extend: 1 });
  assert.deepEqual(notationOf(2), { lines: 0, dots: 0, extend: 1 });
  assert.deepEqual(notationOf(1.5), { lines: 0, dots: 1, extend: 0 });
  assert.deepEqual(notationOf(1), { lines: 0, dots: 0, extend: 0 });
  assert.deepEqual(notationOf(0.75), { lines: 1, dots: 1, extend: 0 });
  assert.deepEqual(notationOf(0.5), { lines: 1, dots: 0, extend: 0 });
  assert.deepEqual(notationOf(0.25), { lines: 2, dots: 0, extend: 0 });
});

test('不在表里的时值吸附到最近的合法值', () => {
  // 1.25 拍不存在，渲染必须吸到 1 或 1.5 之一，不能漏出非法记谱
  const near = notationOf(1.2);
  assert.deepEqual(near, notationOf(1));
  const legal = DUR_SET.filter((v) => Math.abs(v - 1.2) <= 0.3);
  assert.ok(legal.length > 0);
});

test('音名按调性选升号还是降号', () => {
  assert.deepEqual(pitchNames(3), [
    'C',
    'Db',
    'D',
    'Eb',
    'E',
    'F',
    'Gb',
    'G',
    'Ab',
    'A',
    'Bb',
    'B',
  ]);
  assert.deepEqual(pitchNames(0), [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B',
  ]);
  assert.equal(noteName(63, 3), 'Eb4');
  assert.equal(noteName(61, 0), 'C#4');
  assert.equal(noteName(0), '--');
});

test('换行模式：小节密度决定每行小节数', () => {
  const sparse = doc([0, 1, 2, 3].map((i) => measure(i, [note(), note()])));
  assert.equal(layoutScore(sparse, 1200, 'wrap').barsPerLine, 4);

  const dense = doc(
    [0, 1, 2, 3].map((i) =>
      measure(
        i,
        new Array(8).fill(null).map(() => note()),
      ),
    ),
  );
  assert.equal(layoutScore(dense, 1200, 'wrap').barsPerLine, 2);

  const mid = doc(
    [0, 1, 2, 3].map((i) =>
      measure(
        i,
        new Array(5).fill(null).map(() => note()),
      ),
    ),
  );
  assert.equal(layoutScore(mid, 1200, 'wrap').barsPerLine, 3);
});

test('换行模式：宽度固定，行数随小节数增长', () => {
  const eightBars = doc(new Array(8).fill(null).map((_, i) => measure(i, [note()])));
  const layout = layoutScore(eightBars, 1280, 'wrap');
  assert.equal(layout.mode, 'wrap');
  assert.equal(layout.width, 1280);
  assert.equal(layout.rows.length, 2);
  assert.equal(layout.bars.length, 8);
  // 同一行的两个小节 y 相同、x 递增
  assert.equal(layout.bars[0].y, layout.bars[1].y);
  assert.ok(layout.bars[1].x > layout.bars[0].x);
  // 第二行整体下移
  assert.ok(layout.bars[4].y > layout.bars[0].y);
});

test('横向模式：单行铺开，宽度按音符数自适应', () => {
  const d = doc([
    measure(0, [note()]),
    measure(
      1,
      new Array(8).fill(null).map(() => note()),
    ),
    measure(2, [note(), note()]),
  ]);
  const layout = layoutScore(d, 900, 'scroll');
  assert.equal(layout.mode, 'scroll');
  assert.equal(layout.rows.length, 1);
  assert.equal(layout.rows[0].length, 3);
  // 所有小节在同一行
  assert.equal(layout.bars[0].y, layout.bars[2].y);
  // x 单调递增且互不重叠（没有 GAP，直接首尾相接）
  assert.ok(layout.bars[1].x >= layout.bars[0].x + layout.bars[0].w);
  assert.ok(layout.bars[2].x >= layout.bars[1].x + layout.bars[1].w);
  // 密的小节比稀的宽
  assert.ok(layout.bars[1].w > layout.bars[0].w);
  // 内容不足一屏时撑满容器宽度（不然右侧会露底色）
  assert.equal(layout.width, 900);
  // 单行高度
  assert.ok(layout.height < 320);

  // 小节多了以后总宽超过容器，交给外层横向滚动
  const long = doc(new Array(12).fill(null).map((_, i) => measure(i, [note(), note(), note()])));
  const longLayout = layoutScore(long, 900, 'scroll');
  assert.ok(longLayout.width > 900);
  assert.ok(longLayout.bars[11].x + longLayout.bars[11].w <= longLayout.width);
});

test('命中测试只在音符热区里返回', () => {
  const layout = {
    rows: [],
    width: 800,
    height: 200,
    barW: 200,
    barsPerLine: 4,
    boxes: [
      { x: 100, y: 80, w: 16, h: 30, mi: 0, ni: 0, note: note() },
      { x: 300, y: 80, w: 16, h: 30, mi: 0, ni: 1, note: note({ degree: 2 }) },
    ],
  } as ScoreLayout;
  assert.deepEqual(hitTest(layout, 108, 95), { mi: 0, ni: 0 });
  assert.deepEqual(hitTest(layout, 308, 95), { mi: 0, ni: 1 });
  assert.equal(hitTest(layout, 600, 95), null);
});

test('音级与八度在边界上循环/夹紧', () => {
  const n1 = note({ degree: 7 });
  shiftDegree(n1, 1);
  assert.equal(n1.degree, 1);

  const n2 = note({ degree: 1 });
  shiftDegree(n2, -1);
  assert.equal(n2.degree, 7);

  const n3 = note({ octave: 3 });
  shiftOctave(n3, 1);
  assert.equal(n3.octave, 3);

  const n4 = note({ octave: -3 });
  shiftOctave(n4, -1);
  assert.equal(n4.octave, -3);
});

test('改时值同时刷新减时线/附点/延长线', () => {
  const n = note({ dur_beats: 1 });
  shiftDuration(n, 1); // 1 -> 1.5（变长）
  assert.equal(n.dur_beats, 1.5);
  assert.equal(n.dots, 1);
  assert.equal(n.extend, 0);

  shiftDuration(n, 1); // 1.5 -> 2
  assert.equal(n.dur_beats, 2);
  assert.equal(n.extend, 1);

  shiftDuration(n, 3); // 继续变长，封顶到全音符
  assert.equal(n.dur_beats, 4);
  assert.equal(DUR_SET[0], 4);

  shiftDuration(n, -8); // 一路变短，封底到十六分
  assert.equal(n.dur_beats, 0.25);
  assert.equal(n.lines, 2);
});

test('删除音符把时值并给前一个音', () => {
  const m = measure(0, [
    note({ start_beat: 0, dur_beats: 1 }),
    note({ start_beat: 1, dur_beats: 1, degree: 2 }),
    note({ start_beat: 2, dur_beats: 2, degree: 3 }),
  ]);
  deleteNote(m, 1);
  assert.equal(m.notes.length, 2);
  assert.equal(m.notes[0].degree, 1);
  assert.equal(m.notes[0].dur_beats, 2);
  assert.equal(m.notes[1].degree, 3);
});

test('统计口径：只算非休止音，歌词按挂载率算', () => {
  const d = doc([
    measure(0, [
      note({ lyrics: '心' }),
      note({ degree: 0 }),
      note({ degree: 2, lyrics: '' }),
      note({ degree: 3, lyrics: '跳' }),
    ]),
  ]);
  const stats = scoreStats(d);
  assert.equal(stats.notes, 3);
  assert.equal(stats.withLyrics, 2);
  assert.equal(stats.bars, 1);
  assert.ok(Math.abs(stats.lyricRate - 2 / 3) < 1e-6);
});

test('拍 -> 秒：有拍点表时用插值，没有时按 BPM 等距', () => {
  const withBeats = doc([measure(0, [note()])]);
  withBeats.meta.bpm = 71;
  withBeats.meta.beat_times = [0, 0.85, 1.7, 2.55, 3.4];

  assert.equal(beatToSeconds(withBeats, 0), 0);
  assert.equal(beatToSeconds(withBeats, 1), 0.85);
  assert.ok(Math.abs(beatToSeconds(withBeats, 1.5) - 1.275) < 1e-6);
  // 超出表尾按最后一拍的速度外推
  assert.ok(Math.abs(beatToSeconds(withBeats, 4) - 3.4) < 1e-6);

  const noBeats = doc([measure(0, [note()])]);
  noBeats.meta.bpm = 60;
  assert.ok(Math.abs(beatToSeconds(noBeats, 3) - 3) < 1e-6);
});

test('按播放时间找当前音', () => {
  const beats = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const d = doc([
    measure(0, [
      note({ start_beat: 0, dur_beats: 1.5, lyrics: '心' }),
      note({ start_beat: 2, dur_beats: 2, degree: 2, lyrics: '跳' }),
    ]),
    measure(1, [note({ start_beat: 4, dur_beats: 4, degree: 3, lyrics: '乱' })]),
  ]);
  d.meta.beat_times = beats;
  d.meta.bpm = 60;

  assert.deepEqual(noteAtTime(d, 0.5), { mi: 0, ni: 0 });
  assert.deepEqual(noteAtTime(d, 2.5), { mi: 0, ni: 1 });
  assert.deepEqual(noteAtTime(d, 6.0), { mi: 1, ni: 0 });
  // 1.5~2 拍之间是空隙（前一个音已结束、后一个还没开始）
  assert.equal(noteAtTime(d, 1.75), null);
  // 谱面结束之后没有音
  assert.equal(noteAtTime(d, 12), null);
});
