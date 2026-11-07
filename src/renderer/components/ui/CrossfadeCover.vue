<script setup lang="ts">
/**
 * 封面交叉淡入
 *
 * 换歌时旧封面淡出、新封面淡入并轻微收放，避免一帧硬切。
 * 只做视觉过渡，图片加载仍交给 Cover 组件处理。
 */
import { ref, watch } from 'vue';
import Cover from '@/components/ui/Cover.vue';

const props = withDefaults(
  defineProps<{
    url?: string;
    size?: number;
    width?: number;
    height?: number;
    borderRadius?: number;
    alt?: string;
  }>(),
  { size: 200, borderRadius: 10 },
);

const currentUrl = ref(props.url ?? '');
const previousUrl = ref('');
let clearTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.url,
  (next) => {
    const value = next ?? '';
    if (value === currentUrl.value) return;
    previousUrl.value = currentUrl.value;
    currentUrl.value = value;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      previousUrl.value = '';
      clearTimer = null;
    }, 320);
  },
);
</script>

<template>
  <span class="cover-crossfade">
    <span v-if="previousUrl" :key="`prev-${previousUrl}`" class="cover-layer is-leaving">
      <Cover
        :url="previousUrl"
        :size="props.size"
        :width="props.width"
        :height="props.height"
        :border-radius="props.borderRadius"
        :alt="props.alt"
      />
    </span>
    <span
      v-if="currentUrl"
      :key="`cur-${currentUrl}`"
      class="cover-layer"
      :class="{ 'is-entering': Boolean(previousUrl) }"
    >
      <Cover
        :url="currentUrl"
        :size="props.size"
        :width="props.width"
        :height="props.height"
        :border-radius="props.borderRadius"
        :alt="props.alt"
      />
    </span>
    <slot v-if="!currentUrl" />
  </span>
</template>

<style scoped>
.cover-crossfade {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.cover-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cover-layer.is-entering {
  animation: cover-enter 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.cover-layer.is-leaving {
  animation: cover-leave 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes cover-enter {
  from {
    opacity: 0;
    transform: scale(1.04);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes cover-leave {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.99);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cover-layer.is-entering,
  .cover-layer.is-leaving {
    animation: none;
  }
}
</style>
