<script setup lang="ts">
/**
 * 主题化歌词皮肤（雾白 / 霓虹 / 纸上）
 *
 * 视觉方向参考 Folia 的歌词可视化风格命名（AGPL-3.0，仅借鉴「一套皮肤一种气质」的思路，
 * 背景、配色、排版全部用 CSS 自己实现，不含对方任何代码）。
 */
import { computed } from 'vue';
import LyricScroller from './LyricScroller.vue';

const props = defineProps<{
  variant: 'mist' | 'neon' | 'paper' | 'aurora' | 'film' | 'space';
  fontScale: number;
  fontWeightIndex: number;
  playedColor: string;
  unplayedColor: string;
}>();

/** 浅底皮肤：雾白与纸上；其余（霓虹/极光/胶片/深空）仍是深底 */
const isLight = computed(() => props.variant === 'mist' || props.variant === 'paper');
</script>

<template>
  <div class="themed-skin" :class="[`is-${variant}`, { 'is-light': isLight }]">
    <div class="skin-bg" aria-hidden="true">
      <span class="skin-glow skin-glow-a"></span>
      <span class="skin-glow skin-glow-b"></span>
      <span class="skin-texture"></span>
    </div>

    <div class="skin-lyrics">
      <LyricScroller
        :font-scale="fontScale"
        :font-weight-index="fontWeightIndex"
        :played-color="playedColor"
        :unplayed-color="unplayedColor"
      />
    </div>
  </div>
</template>

<style scoped>
.themed-skin {
  position: relative;
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.skin-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.skin-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.9;
}

.skin-texture {
  position: absolute;
  inset: 0;
}

.skin-lyrics {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  max-width: 860px;
  margin: 0 auto;
  padding: 0 clamp(24px, 6vw, 72px);
}

/* —— 雾白：低对比、厚雾、留白 —— */
.is-mist {
  background: #eef1f5;
}
.is-mist .skin-glow-a {
  top: -18%;
  left: -10%;
  width: 62%;
  height: 78%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0));
}
.is-mist .skin-glow-b {
  right: -14%;
  bottom: -22%;
  width: 58%;
  height: 72%;
  background: radial-gradient(circle, rgba(198, 212, 228, 0.9), rgba(198, 212, 228, 0));
}
.is-mist .skin-texture {
  background-image: radial-gradient(rgba(29, 29, 31, 0.045) 1px, transparent 1px);
  background-size: 4px 4px;
  opacity: 0.5;
}

/* —— 霓虹：深底 + 双色光晕 + 细网格 —— */
.is-neon {
  background: #0a1020;
}
.is-neon .skin-glow-a {
  top: -24%;
  left: -8%;
  width: 56%;
  height: 70%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.4), rgba(34, 211, 238, 0));
}
.is-neon .skin-glow-b {
  right: -12%;
  bottom: -26%;
  width: 52%;
  height: 68%;
  background: radial-gradient(circle, rgba(232, 121, 249, 0.32), rgba(232, 121, 249, 0));
}
.is-neon .skin-texture {
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.09) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(circle at 50% 45%, #000 10%, transparent 78%);
}

/* —— 纸上：暖白纸面 + 细横线 —— */
.is-paper {
  background: #f4efe6;
}
.is-paper .skin-glow-a {
  top: -30%;
  right: -6%;
  width: 50%;
  height: 60%;
  background: radial-gradient(circle, rgba(214, 196, 168, 0.55), rgba(214, 196, 168, 0));
}
.is-paper .skin-glow-b {
  left: -10%;
  bottom: -30%;
  width: 46%;
  height: 56%;
  background: radial-gradient(circle, rgba(230, 219, 200, 0.7), rgba(230, 219, 200, 0));
}
.is-paper .skin-texture {
  background-image: linear-gradient(rgba(120, 98, 68, 0.08) 1px, transparent 1px);
  background-size: 100% 44px;
  opacity: 0.55;
}

/* —— 极光：深青底 + 绿紫光带 —— */
.is-aurora {
  background: #06141a;
}
.is-aurora .skin-glow-a {
  top: -22%;
  left: -14%;
  width: 64%;
  height: 74%;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.34), rgba(52, 211, 153, 0));
}
.is-aurora .skin-glow-b {
  right: -16%;
  bottom: -28%;
  width: 58%;
  height: 70%;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0));
}
.is-aurora .skin-texture {
  background: linear-gradient(
    100deg,
    transparent 18%,
    rgba(110, 231, 183, 0.09) 34%,
    transparent 46%,
    rgba(167, 139, 250, 0.09) 62%,
    transparent 76%
  );
  filter: blur(18px);
}

/* —— 胶片：暖褐底 + 颗粒 + 暗角 —— */
.is-film {
  background: #1c1814;
}
.is-film .skin-glow-a {
  top: -20%;
  left: 8%;
  width: 54%;
  height: 60%;
  background: radial-gradient(circle, rgba(217, 159, 91, 0.28), rgba(217, 159, 91, 0));
}
.is-film .skin-glow-b {
  right: -18%;
  bottom: -24%;
  width: 48%;
  height: 60%;
  background: radial-gradient(circle, rgba(120, 72, 44, 0.4), rgba(120, 72, 44, 0));
}
.is-film .skin-texture {
  background-image: radial-gradient(rgba(255, 236, 210, 0.06) 1px, transparent 1px);
  background-size: 3px 3px;
  box-shadow: inset 0 0 220px 60px rgba(0, 0, 0, 0.55);
}

/* —— 深空：近黑底 + 星点 + 冷蓝晕 —— */
.is-space {
  background: #05070f;
}
.is-space .skin-glow-a {
  top: -30%;
  left: -12%;
  width: 60%;
  height: 66%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.22), rgba(59, 130, 246, 0));
}
.is-space .skin-glow-b {
  right: -14%;
  bottom: -30%;
  width: 52%;
  height: 62%;
  background: radial-gradient(circle, rgba(129, 140, 248, 0.18), rgba(129, 140, 248, 0));
}
.is-space .skin-texture {
  background-image:
    radial-gradient(1px 1px at 12% 22%, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(1px 1px at 32% 68%, rgba(255, 255, 255, 0.5), transparent),
    radial-gradient(1.5px 1.5px at 58% 38%, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(1px 1px at 74% 74%, rgba(255, 255, 255, 0.45), transparent),
    radial-gradient(1px 1px at 88% 28%, rgba(255, 255, 255, 0.6), transparent),
    radial-gradient(1px 1px at 46% 86%, rgba(255, 255, 255, 0.4), transparent);
  background-repeat: repeat;
  background-size: 220px 220px;
  opacity: 0.85;
}

/* 皮肤自带整页底色：让 LyricPage 自己的封面背景层让位，
   否则标题栏那一条会露出原来的深色背景，出现「上面一条灰、下面一片白」。 */
:global(.lyric-page:has(.themed-skin)) .lyric-background {
  display: none;
}
:global(.lyric-page:has(.themed-skin.is-mist)) {
  background-color: #eef1f5;
}
:global(.lyric-page:has(.themed-skin.is-paper)) {
  background-color: #f4efe6;
}
:global(.lyric-page:has(.themed-skin.is-neon)) {
  background-color: #0a1020;
}
:global(.lyric-page:has(.themed-skin.is-aurora)) {
  background-color: #06141a;
}
:global(.lyric-page:has(.themed-skin.is-film)) {
  background-color: #1c1814;
}
:global(.lyric-page:has(.themed-skin.is-space)) {
  background-color: #05070f;
}

/* 浅底皮肤下，底部控制栏压成深色，保证白图标与文字仍有对比 */
:global(.lyric-page:has(.themed-skin.is-light) .lyric-bar) {
  background: rgba(20, 22, 26, 0.9);
}

/* 浅色皮肤下，右上角窗口按钮改用深色，否则白图标看不见。
   标题栏在皮肤组件之外，只能靠 :has 从 .lyric-page 这一层把变量改掉。 */
:global(.lyric-page:has(.themed-skin.is-light)) {
  --window-action-color: rgba(0, 0, 0, 0.55);
  --window-action-hover-color: rgba(0, 0, 0, 0.9);
}
</style>
