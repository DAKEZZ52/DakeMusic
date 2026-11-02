/** * DakeMusic 通用徽标（Badge） * 文件：Badge.vue *
描述：绝对定位的小圆点/数字徽标，用于播放条队列数、桌面歌词状态等角标 * 作者：知之（DAKE知之） *
版权：© 2026 DakeMusic. All rights reserved. */
<script setup lang="ts">
interface Props {
  count?: number | string;
  class?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <span
    v-if="count !== undefined"
    :class="[
      'badge absolute -top-1.5 -right-6 inline-flex min-w-[20px] h-5 items-center justify-center px-1.5 rounded-full text-[11px] font-bold bg-black text-white dark:bg-white dark:text-black shadow-sm select-none pointer-events-none tabular-nums',
      props.class,
    ]"
  >
    {{ count }}
  </span>
</template>

<style scoped>
.badge {
  /* 固定深浅背景保证任何主题色下都清晰 */
}
</style>
