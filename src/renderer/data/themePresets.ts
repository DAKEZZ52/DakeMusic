/**
 * 主题预设（画廊）
 *
 * 一套预设 = 强调色 + 顶部渐变 + 深浅模式。点一下就整体换掉，
 * 不涉及封面取色，切换后仍可在「主题色」里继续手动微调。
 */

export interface ThemePreset {
  id: string;
  name: string;
  tagline: string;
  /** 强调色（hex），会写入 themeStore.customColor */
  accent: string;
  /** 顶部渐变氛围层 */
  gradient: boolean;
  /** 渐变强度（20–200），仅在 gradient 为 true 时生效 */
  gradientStrength?: number;
  /** 深浅模式 */
  theme: 'system' | 'light' | 'dark';
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'graphite',
    name: '石墨',
    tagline: '近乎无色的克制',
    accent: '#6b7280',
    gradient: false,
    theme: 'dark',
  },
  {
    id: 'morning-mist',
    name: '晨雾',
    tagline: '清早的浅蓝空气',
    accent: '#0ea5e9',
    gradient: true,
    gradientStrength: 60,
    theme: 'light',
  },
  {
    id: 'sunset',
    name: '落日',
    tagline: '暖橙压在地平线',
    accent: '#f97316',
    gradient: true,
    gradientStrength: 85,
    theme: 'system',
  },
  {
    id: 'forest',
    name: '森林',
    tagline: '深绿里的一点光',
    accent: '#22c55e',
    gradient: true,
    gradientStrength: 70,
    theme: 'dark',
  },
  {
    id: 'berry',
    name: '莓果',
    tagline: '明亮的粉紫',
    accent: '#ec4899',
    gradient: true,
    gradientStrength: 65,
    theme: 'light',
  },
  {
    id: 'dusk',
    name: '暮色',
    tagline: '紫罗兰的黄昏',
    accent: '#8b5cf6',
    gradient: true,
    gradientStrength: 90,
    theme: 'dark',
  },
  {
    id: 'night-flight',
    name: '夜航',
    tagline: '只剩仪表盘的蓝',
    accent: '#38bdf8',
    gradient: false,
    theme: 'dark',
  },
  {
    id: 'film',
    name: '胶片',
    tagline: '旧照片的暖褐',
    accent: '#d9a05b',
    gradient: true,
    gradientStrength: 55,
    theme: 'dark',
  },
  {
    id: 'sea-salt',
    name: '海盐',
    tagline: '薄荷与白',
    accent: '#14b8a6',
    gradient: true,
    gradientStrength: 50,
    theme: 'light',
  },
  {
    id: 'champagne',
    name: '香槟',
    tagline: '低饱和的金',
    accent: '#eab308',
    gradient: false,
    theme: 'light',
  },
];

export const findThemePreset = (id: string): ThemePreset | undefined =>
  THEME_PRESETS.find((preset) => preset.id === id);
