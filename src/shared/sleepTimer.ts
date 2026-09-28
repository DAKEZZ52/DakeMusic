export type SleepTimerAction = 'pause' | 'quit' | 'shutdown';
export type SleepTimerActionResult = { ok: true } | { ok: false; error: string };

export const sleepTimerActionLabels: Record<SleepTimerAction, string> = {
  pause: '停止播放',
  quit: '退出 DakeMusic',
  shutdown: '关机',
};
