/**
 * 播放栏自定义槽位
 *
 * 参考了 Folia 的「播放栏按钮可换」交互思路（AGPL-3.0，仅借鉴交互，代码独立实现）：
 * 用户右键槽位或点末尾「⋯」，把固定按钮换成自己常用的动作。
 *
 * 默认值保持与原样一致（音质 + 音效），不改变任何现有行为。
 */
import { ref, watch } from 'vue';

export type PlayerSlotAction =
  | 'quality'
  | 'effect'
  | 'pitch'
  | 'theme'
  | 'queue'
  | 'favorite'
  | 'download'
  | 'sleep'
  | 'comments'
  | 'mv'
  | 'playlist'
  | 'none';

export interface PlayerSlotOption {
  id: PlayerSlotAction;
  label: string;
  hint?: string;
}

export const PLAYER_SLOT_OPTIONS: PlayerSlotOption[] = [
  { id: 'quality', label: '音质' },
  { id: 'effect', label: '音效' },
  { id: 'pitch', label: '变速 / 升降调' },
  { id: 'theme', label: '桌面歌词开关' },
  { id: 'queue', label: '播放队列' },
  { id: 'favorite', label: '收藏当前歌曲' },
  { id: 'download', label: '下载当前歌曲' },
  { id: 'sleep', label: '睡眠定时' },
  { id: 'comments', label: '查看评论' },
  { id: 'mv', label: '播放 MV', hint: '无 MV 时置灰' },
  { id: 'playlist', label: '加入歌单' },
  { id: 'none', label: '留空', hint: '不显示按钮' },
];

const STORAGE_KEY = 'dakemusic_player_slots_v1';
const DEFAULTS: { a: PlayerSlotAction; b: PlayerSlotAction } = { a: 'quality', b: 'effect' };

const isValid = (value: unknown): value is PlayerSlotAction =>
  PLAYER_SLOT_OPTIONS.some((option) => option.id === value);

function load(): { a: PlayerSlotAction; b: PlayerSlotAction } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<'a' | 'b', unknown>>;
    return {
      a: isValid(parsed.a) ? parsed.a : DEFAULTS.a,
      b: isValid(parsed.b) ? parsed.b : DEFAULTS.b,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const initial = load();

export const playerSlotA = ref<PlayerSlotAction>(initial.a);
export const playerSlotB = ref<PlayerSlotAction>(initial.b);

watch([playerSlotA, playerSlotB], () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ a: playerSlotA.value, b: playerSlotB.value }),
    );
  } catch {
    // 存储不可用时忽略：本会话内仍然生效
  }
});

export function setPlayerSlot(slot: 'a' | 'b', action: PlayerSlotAction) {
  if (!isValid(action)) return;
  if (slot === 'a') playerSlotA.value = action;
  else playerSlotB.value = action;
}

export function resetPlayerSlots() {
  playerSlotA.value = DEFAULTS.a;
  playerSlotB.value = DEFAULTS.b;
}
