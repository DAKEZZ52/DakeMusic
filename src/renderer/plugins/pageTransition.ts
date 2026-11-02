/**
 * DakeMusic - 页面切换动画状态
 * 作者：知之（DAKE知之）
 * 说明：随插件运行时精简后保留的固定默认页面过渡配置。
 */

export type PageTransitionMode = 'default' | 'out-in' | 'in-out';

export const pageTransitionState = {
  enabled: true,
  name: 'page',
  mode: 'out-in' as PageTransitionMode,
  appear: true,
};
