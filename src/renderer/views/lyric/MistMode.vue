<script setup lang="ts">
import { DEFAULT_LYRIC_PLAYED_COLOR, DEFAULT_LYRIC_UNPLAYED_COLOR } from '@/stores/lyric';
import ThemedLyricSkin from './ThemedLyricSkin.vue';
import { useLyricSkin } from './composables/useLyricSkin';
import { HOST_SKIN_KEYS, LYRIC_SKIN_MIST_DEFAULTS, resolveLyricSkinColor } from './skins/config';

const { settings } = useLyricSkin(HOST_SKIN_KEYS.mist, LYRIC_SKIN_MIST_DEFAULTS);
</script>

<template>
  <ThemedLyricSkin
    variant="mist"
    :font-scale="settings.fontScale"
    :font-weight-index="settings.fontWeightIndex"
    :played-color="resolveLyricSkinColor(settings.playedColor, DEFAULT_LYRIC_PLAYED_COLOR)"
    :unplayed-color="resolveLyricSkinColor(settings.unplayedColor, DEFAULT_LYRIC_UNPLAYED_COLOR)"
  />
</template>
