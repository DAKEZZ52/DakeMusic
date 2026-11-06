import { defineAsyncComponent } from 'vue';
import type { BuiltinLyricSkin } from '@/plugins/lyricsPage';
import CoverMode from './CoverMode.vue';
import PortraitMode from './PortraitMode.vue';
import LyricMode from './LyricMode.vue';
import MistMode from './MistMode.vue';
import NeonMode from './NeonMode.vue';
import PaperMode from './PaperMode.vue';
import AuroraMode from './AuroraMode.vue';
import FilmMode from './FilmMode.vue';
import SpaceMode from './SpaceMode.vue';
import coverSettings from './skins/CoverSkinSettings.vue';
import lyricSettings from './skins/LyricSkinSettings.vue';
import portraitSettings from './skins/PortraitSkinSettings.vue';
import {
  HOST_SKIN_KEYS,
  LYRIC_SKIN_AMLL_DEFAULTS,
  LYRIC_SKIN_COVER_DEFAULTS,
  LYRIC_SKIN_LYRIC_DEFAULTS,
  LYRIC_SKIN_MIST_DEFAULTS,
  LYRIC_SKIN_NEON_DEFAULTS,
  LYRIC_SKIN_PAPER_DEFAULTS,
  LYRIC_SKIN_AURORA_DEFAULTS,
  LYRIC_SKIN_FILM_DEFAULTS,
  LYRIC_SKIN_SPACE_DEFAULTS,
  LYRIC_SKIN_PORTRAIT_DEFAULTS,
} from './skins/config';

/**
 * Apple Music（AMLL）皮肤采用异步组件：只有当该皮肤被使用时才加载
 * 其依赖的 AMLL / Pixi 代码，避免拖慢启动与常驻内存。
 */
const amllMode = defineAsyncComponent(() => import('./AmllMode.vue'));
const amllSettings = defineAsyncComponent(() => import('./skins/AmllSkinSettings.vue'));

const validateAmllSettings = (values: Record<string, unknown>) => {
  const align = Number(values.alignPosition);
  const fade = Number(values.wordFadeWidth);
  let errors: string[] | undefined;
  if (!Number.isFinite(align) || align < 0 || align > 1) {
    errors = ['歌词位置需在 0~1 之间'];
  } else if (!Number.isFinite(fade) || fade <= 0) {
    errors = ['渐变宽度需大于 0'];
  }
  return { errors };
};

/** 内置皮肤，与自定义皮肤共用同一套选择与设置机制。 */
export const builtinLyricSkins: BuiltinLyricSkin[] = [
  {
    pluginId: 'host',
    id: 'cover',
    key: HOST_SKIN_KEYS.cover,
    title: '封面',
    component: CoverMode,
    titlebar: 'host',
    tools: 'host',
    category: 'player',
    settings: {
      defaults: LYRIC_SKIN_COVER_DEFAULTS,
      component: coverSettings,
    },
  },
  {
    pluginId: 'host',
    id: 'portrait',
    key: HOST_SKIN_KEYS.portrait,
    title: '写真',
    component: PortraitMode,
    titlebar: 'host',
    tools: 'host',
    category: 'player',
    settings: {
      defaults: LYRIC_SKIN_PORTRAIT_DEFAULTS,
      component: portraitSettings,
    },
  },
  {
    pluginId: 'host',
    id: 'lyric',
    key: HOST_SKIN_KEYS.lyric,
    title: '简洁歌词',
    component: LyricMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: {
      defaults: LYRIC_SKIN_LYRIC_DEFAULTS,
      component: lyricSettings,
    },
  },
  {
    pluginId: 'host',
    id: 'mist',
    key: HOST_SKIN_KEYS.mist,
    title: '雾白',
    component: MistMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_MIST_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'neon',
    key: HOST_SKIN_KEYS.neon,
    title: '霓虹夜',
    component: NeonMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_NEON_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'paper',
    key: HOST_SKIN_KEYS.paper,
    title: '纸上',
    component: PaperMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_PAPER_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'aurora',
    key: HOST_SKIN_KEYS.aurora,
    title: '极光',
    component: AuroraMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_AURORA_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'film',
    key: HOST_SKIN_KEYS.film,
    title: '胶片',
    component: FilmMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_FILM_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'space',
    key: HOST_SKIN_KEYS.space,
    title: '深空',
    component: SpaceMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: { defaults: LYRIC_SKIN_SPACE_DEFAULTS },
  },
  {
    pluginId: 'host',
    id: 'amll',
    key: HOST_SKIN_KEYS.amll,
    title: 'Apple Music',
    component: amllMode,
    titlebar: 'host',
    tools: 'host',
    category: 'effect',
    settings: {
      defaults: LYRIC_SKIN_AMLL_DEFAULTS,
      validate: validateAmllSettings,
      component: amllSettings,
    },
  },
];
