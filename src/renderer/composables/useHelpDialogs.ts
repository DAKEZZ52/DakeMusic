/**
 * 帮助类弹窗的全局开关（版本亮点 / 使用指南）
 *
 * 放模块级 ref：侧栏、设置页、首次启动都能打开同一个弹窗，
 * 不用一层层透传事件。
 */
import { ref } from 'vue';

export const whatsNewOpen = ref(false);
export const userGuideOpen = ref(false);

export const openWhatsNew = () => {
  whatsNewOpen.value = true;
};

export const closeWhatsNew = () => {
  whatsNewOpen.value = false;
};

export const openUserGuide = () => {
  userGuideOpen.value = true;
};

export const closeUserGuide = () => {
  userGuideOpen.value = false;
};
