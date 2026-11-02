<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import PluginIcon from '@/components/PluginIcon.vue';
import type { ResolvedTitlebarAction } from '@/plugins/titlebar';
defineProps<{ action: ResolvedTitlebarAction; badge?: boolean }>();
</script>

<template>
  <Button
    variant="unstyled"
    size="none"
    class="titlebar-action no-drag"
    :tooltip="action.tooltip"
    tooltip-side="bottom"
    :aria-label="action.title"
    :aria-busy="action.isBusy"
    :disabled="action.isDisabled"
    @click="action.onClick()"
  >
    <PluginIcon :icon="action.icon" :width="24" :height="24" />
    <span v-if="badge" class="action-badge" />
  </Button>
</template>

<style scoped>
.titlebar-action {
  position: relative;
  display: flex;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  /* 图标调暗：主文字色降到 62% */
  color: color-mix(in srgb, var(--color-text-main) 50%, transparent);
  transition:
    background-color 0.12s,
    color 0.12s;
}
.titlebar-action:hover {
  background: var(--control-hover-bg);
  color: var(--color-text-main);
}
.action-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary);
}
</style>
