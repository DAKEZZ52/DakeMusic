<script setup lang="ts">
/**
 * 主题预设画廊
 *
 * 十套成套外观：强调色 + 顶部渐变 + 深浅模式。点卡片即时生效，可继续在设置里微调。
 */
import { ref } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import { useThemePresets } from '@/composables/useThemePresets';
import type { ThemePreset } from '@/data/themePresets';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const { presets, apply, isActive } = useThemePresets();
const lastApplied = ref('');

const swatchStyle = (preset: ThemePreset) => ({
  background: `linear-gradient(135deg, ${preset.accent}, color-mix(in srgb, ${preset.accent} 35%, #ffffff))`,
});

const modeLabel = (preset: ThemePreset) =>
  preset.theme === 'dark' ? '深色' : preset.theme === 'light' ? '浅色' : '跟随系统';

const choose = (preset: ThemePreset) => {
  apply(preset);
  lastApplied.value = preset.id;
};

const close = () => emit('update:open', false);
</script>

<template>
  <Dialog
    :open="props.open"
    content-class="theme-gallery-dialog"
    show-close
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #title>主题预设</template>

    <div class="gallery">
      <p class="gallery-hint">点一下整套换掉，之后仍可在「主题色」里单独微调。</p>

      <div class="gallery-grid">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="gallery-card"
          :class="{ 'is-active': isActive(preset) }"
          :aria-pressed="isActive(preset)"
          @click="choose(preset)"
        >
          <span class="gallery-swatch" :style="swatchStyle(preset)">
            <span v-if="preset.gradient" class="gallery-swatch-glow"></span>
            <span class="gallery-swatch-mode">{{ modeLabel(preset) }}</span>
          </span>
          <span class="gallery-meta">
            <span class="gallery-name">{{ preset.name }}</span>
            <span class="gallery-tagline">{{ preset.tagline }}</span>
          </span>
          <span v-if="isActive(preset)" class="gallery-check" aria-hidden="true">✓</span>
        </button>
      </div>

      <div class="gallery-foot">
        <span class="gallery-foot-text">{{ lastApplied ? '已应用，可继续微调' : '' }}</span>
        <Button variant="primary" size="sm" @click="close">完成</Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
:global(.theme-gallery-dialog) {
  width: min(720px, calc(100vw - 48px));
}

.gallery {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gallery-hint {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text-secondary);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.gallery-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.gallery-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}

.gallery-card.is-active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.gallery-swatch {
  position: relative;
  display: block;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
}

.gallery-swatch-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.55), transparent 62%);
}

.gallery-swatch-mode {
  position: absolute;
  top: 6px;
  right: 8px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 15px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.28);
}

.gallery-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.gallery-name {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.gallery-tagline {
  font-size: 11px;
  line-height: 16px;
  color: var(--color-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gallery-check {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  color: #fff;
  background: var(--color-primary);
}

.gallery-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gallery-foot-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
