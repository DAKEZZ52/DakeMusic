/**
 * 主题预设的应用与判定
 *
 * 应用会直接改 themeStore / settingStore；两者都有 watcher 负责落到 DOM 与持久化，
 * 所以这里只负责「把值放进去」，不碰样式。
 */
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useSettingStore } from '@/stores/setting';
import { THEME_PRESETS, type ThemePreset } from '@/data/themePresets';

export function useThemePresets() {
  const themeStore = useThemeStore();
  const settingStore = useSettingStore();

  const apply = (preset: ThemePreset) => {
    themeStore.setCustomColor(preset.accent);
    themeStore.setGlobalAccent(true);
    themeStore.setAccentGradient(preset.gradient);
    if (preset.gradient && preset.gradientStrength) {
      themeStore.setAccentGradientStrength(preset.gradientStrength);
    }
    settingStore.theme = preset.theme;
  };

  /** 当前是否已经落在某个预设上（只比较关键三项） */
  const isActive = (preset: ThemePreset) =>
    themeStore.accentMode === 'custom' &&
    String(themeStore.customColor).toLowerCase() === preset.accent.toLowerCase() &&
    themeStore.accentGradient === preset.gradient &&
    settingStore.theme === preset.theme;

  const activeId = computed(() => THEME_PRESETS.find((preset) => isActive(preset))?.id ?? '');

  return { presets: THEME_PRESETS, apply, isActive, activeId };
}
