<script setup lang="ts">
/**
 * LyriseMusic - 通用图标渲染组件
 * 作者：知之（DAKE知之）
 * 说明：随插件系统精简后保留，负责标题栏等位置的图标渲染。
 */
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { iconPlugin } from '@/icons';
import type { IconifyIcon } from '@iconify/types';

type PluginIcon = string | IconifyIcon | Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    icon?: PluginIcon;
    width?: number | string;
    height?: number | string;
  }>(),
  {
    width: 18,
    height: 18,
  },
);

const resolvedIcon = computed<any>(() => props.icon || iconPlugin);
</script>

<template>
  <Icon :icon="resolvedIcon" :width="width" :height="height" />
</template>
