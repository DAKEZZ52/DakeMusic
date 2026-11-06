/**
 * 命令面板（Ctrl/Cmd + K）
 *
 * 交互参考了 Folia 的命令面板思路（AGPL-3.0，仅借鉴交互，代码独立实现）：
 * 一个输入框里既能跳页面、又能执行动作，还能直接搜索。
 */
import { ref } from 'vue';

export const paletteOpen = ref(false);
export const paletteQuery = ref('');

export function openPalette() {
  paletteOpen.value = true;
  paletteQuery.value = '';
}

export function closePalette() {
  paletteOpen.value = false;
  paletteQuery.value = '';
}

export function togglePalette() {
  if (paletteOpen.value) closePalette();
  else openPalette();
}

/** 组件卸载时兜底关闭，避免热更新后残留 */
export function resetPalette() {
  paletteOpen.value = false;
  paletteQuery.value = '';
}
