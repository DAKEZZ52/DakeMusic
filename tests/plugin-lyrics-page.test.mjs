import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { build } from 'esbuild';
import { parse, compileScript } from '@vue/compiler-sfc';
import { computed, effectScope, reactive, ref } from 'vue';

const require = createRequire(import.meta.url);
const root = resolve('.');
const fixture = {};
const stubs = {
  '@/stores/player': 'export const usePlayerStore = () => fixture.controls.player;',
  '@/stores/setting': 'export const useSettingStore = () => fixture.settings;',
  '@/stores/lyric':
    'export const useLyricStore = () => fixture.lyric; export const LYRIC_COVER_COLOR_VALUE = "__cover__";',
  '@/stores/toast': 'export const useToastStore = () => fixture.toast;',
  '@/composables/usePlayerControls': 'export const usePlayerControls = () => fixture.controls;',
  '@/plugins/coverFallback': 'export const coverFallbackRevision = { value: 0 };',
  '@/utils/cover': 'export const resolveCoverDisplayUrl = () => "";',
};
const realComponents = new Set(['LyricPage.vue', 'LyricPageTitlebar.vue', 'OverlayHeader.vue']);
const bundle = await build({
  stdin: {
    contents: `export * from './src/renderer/plugins/lyricsPage';
      export { default as Page } from './src/renderer/views/lyric/LyricPage.vue';
      export { useLyricsPageContext } from './src/renderer/views/lyric/composables/useLyricsPageContext';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
  plugins: [
    {
      name: 'lyric-host-fixture',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (args.path === 'vue') return { path: 'vue', external: true };
          if (stubs[args.path]) return { path: args.path, namespace: 'fixture' };
          if (args.path === '@/icons') return { path: args.path, namespace: 'fixture' };
          if (args.path.endsWith('/useLyricBackground'))
            return { path: 'background', namespace: 'fixture' };
          if (args.path.endsWith('.vue')) {
            const file = args.path.startsWith('@/')
              ? resolve(root, 'src/renderer', args.path.slice(2))
              : resolve(args.resolveDir, args.path);
            return {
              path: file,
              namespace: realComponents.has(basename(file)) ? 'sfc' : 'component',
            };
          }
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents:
            stubs[args.path] ??
            (args.path === 'background'
              ? 'export const useLyricBackground = () => ({ backgroundColor: { value: "" } });'
              : 'export const iconChevronDown={}, iconChevronLeft={}, iconChevronRight={}, iconList={}, iconSettings={}, iconArrowBarDown={}, iconArrowBarToUp={}, iconRotateCcw={}, iconRotateCw={}, iconRefreshCw={}, iconCopy={}, iconShirt={};'),
          loader: 'js',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'component' }, (args) => ({
          contents: `import { h } from 'vue'; export default { name: ${JSON.stringify(basename(args.path))},
          inheritAttrs: false, setup(_, { attrs, slots }) { return () => h(${JSON.stringify(basename(args.path))}, attrs, slots.default?.()); } };`,
        }));
        builder.onLoad({ filter: /.*/, namespace: 'sfc' }, (args) => {
          const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path });
          return {
            contents: compileScript(descriptor, { id: args.path, inlineTemplate: true }).content,
            loader: 'ts',
            resolveDir: resolve(args.path, '..'),
          };
        });
      },
    },
  ],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', 'fixture', bundle.outputFiles[0].text)(
  require,
  module,
  module.exports,
  fixture,
);
const api = module.exports;
const makeApi = (id = 'test', errors = []) =>
  api.createLyricsPageApi(
    id,
    () => {},
    (source, error) => errors.push({ source, error }),
  );
const key = (id = 'test', page = 'custom') => JSON.stringify([id, page]);
afterEach(() => {
  ['test', 'other'].forEach(api.removeLyricsPagesByPlugin);
});

function setupFixture(t) {
  const calls = [];
  const listeners = new Map();
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const cleanups = [];
  fixture.cleanups = cleanups;
  globalThis.window = {
    electron: { platform: 'linux' },
    setTimeout,
    clearTimeout,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup());
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  });
  fixture.settings = reactive({
    lyricViewMode: 'cover',
    lyricsPageProvider: 'host',
    effectiveWindowBackground: {},
    lyricOffsetStep: 0.5,
  });
  fixture.lyric = reactive({
    lines: [],
    sourceDialogOpen: false,
    currentTimeOffset: 0,
    loadedHash: '',
    clear() {},
    fetchLyrics() {},
    updateCurrentIndex() {},
    adjustTimeOffset(ms) {
      this.currentTimeOffset += ms;
    },
    resetTimeOffset() {
      this.currentTimeOffset = 0;
    },
  });
  fixture.toast = { warning: (value) => calls.push(['warning', value]), success() {} };
  const player = reactive({
    currentTime: 2,
    duration: 120,
    volume: 50,
    playMode: 'list',
    audioEffect: 'none',
    isPlaying: true,
    toggleLyricView: (value) => calls.push(['visible', value]),
    togglePlay: () => calls.push(['toggle']),
    next: () => calls.push(['next']),
    prev: () => calls.push(['prev']),
    setVolume(value) {
      this.volume = value;
    },
    seek: (value) => calls.push(['seek', value]),
    setPlayMode(value) {
      this.playMode = value;
    },
    playTrack: (...args) => calls.push(['playTrack', ...args]),
  });
  const track = { id: 'a', name: 'Song A', hash: 'hash-a', mixSongId: '100' };
  fixture.controls = {
    player,
    playlist: { removeFromQueue: (...args) => calls.push(['remove', ...args]) },
    currentTrack: ref(track),
    currentPlaybackQueue: ref({ id: 'queue-a', songs: [track] }),
    isQueueDrawerOpen: ref(false),
    showAddToPlaylistDialog: ref(false),
    isPlaylistLoading: ref(false),
    createdPlaylists: ref([]),
    addToPlaybackQueues: ref([]),
    canAddToPlaylist: ref(true),
    handleOpenAddToPlaylist() {
      fixture.controls.showAddToPlaylistDialog.value = true;
    },
    handleAddToQueue() {},
    handleSelectPlaylist() {},
    isFavorite: ref(false),
    toggleFavorite: () => calls.push(['favorite']),
    isAudioQualityDisabled: (value) => value === 'high',
    effectiveAudioQuality: ref('flac'),
    isAudioEffectPresetSelectionDisabled: ref(false),
    isAudioSourceSwitching: ref(false),
    playModeLabel: ref('列表循环'),
    canShareCurrentTrack: ref(true),
    isResolvedCloudSource: ref(false),
    hasCloudAudioSourceOption: ref(false),
    toggleMute() {},
    setPlaybackRate() {},
    cyclePlayMode() {},
    ensureCurrentTrackCatalogQualities() {},
    setAudioQuality: (value) => calls.push(['quality', value]),
    setCloudAudioSource() {},
    setAudioEffect() {},
    handleShareCurrentTrack() {},
    toggleDesktopLyric() {},
  };
  return { calls, listeners };
}

test('registrations are namespaced, validated, and old disposers cannot remove replacements', () => {
  const one = makeApi(),
    other = makeApi('other');
  const component = { render: () => null };
  const dispose = one.register({ id: 'custom', component });
  other.register({ id: 'custom', component, titlebar: 'none' });
  one.register({ id: 'custom', component, title: 'New' });
  dispose();
  dispose();
  assert.equal(api.resolveLyricsPage(key()).title, 'New');
  assert.equal(api.resolveLyricsPage(key()).titlebar, 'host');
  assert.equal(api.resolveLyricsPage(key('other')).titlebar, 'none');
  assert.equal(api.resolveLyricsPage('host'), undefined);
  for (const input of [
    { id: '', component },
    { id: 'bad', component: null },
    { id: 'bad', component, titlebar: 'main' },
  ])
    assert.throws(() => one.register(input));
  assert.throws(() => one.usePage(), /setup/);
  api.removeLyricsPagesByPlugin('test');
  assert.equal(api.lyricsPages.value.length, 5); // 4 built-in skins + 1 plugin page
});

test('page controls share reactive playback and validate seek, volume, queues, and audio availability', async (t) => {
  const { calls } = setupFixture(t);
  const scope = effectScope();
  const page = scope.run(() =>
    api.useLyricsPageContext(
      fixture.controls,
      computed(() => 'host'),
      () => {},
      () => {},
    ),
  );
  t.after(() => scope.stop());
  page.playback.next();
  page.playback.prev();
  page.playback.toggle();
  page.playback.seek(300);
  page.playback.setVolume(200);
  assert.equal(page.state.value.volume, 100);
  assert.deepEqual(calls.slice(0, 4), [['next'], ['prev'], ['toggle'], ['seek', 120]]);
  assert.throws(() => page.playback.seek(NaN));
  page.playback.setMode('single');
  assert.equal(page.state.value.playMode, 'single');
  assert.throws(() => page.playback.setMode('invalid'));
  page.queue.play('a');
  page.queue.remove('a');
  assert.equal(calls.at(-2)[3].sourceQueueId, 'queue-a');
  assert.deepEqual(calls.at(-1), ['remove', 'a', 'queue-a']);
  assert.throws(() => page.queue.play('missing'));
  assert.throws(() => page.audio.setQuality('high'), /不可用/);
  page.audio.setQuality('flac');
  assert.deepEqual(calls.at(-1), ['quality', 'flac']);
  page.lyrics.adjustOffset(500);
  assert.equal(page.state.value.lyrics.timeOffset, 500);
  page.lyrics.resetOffset();
  assert.equal(page.state.value.lyrics.timeOffset, 0);
  await page.favorite.toggle();
  assert.deepEqual(calls.at(-1), ['favorite']);
  scope.stop();
  assert.throws(() => page.panels.open('queue'), /关闭/);
});
