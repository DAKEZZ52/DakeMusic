/**
 * DakeMusic 语聊房 - 合唱（M1：时钟同步与起播对齐）
 * 描述：以房间服务器时间为基准校准本机时钟，房主发起倒计时后所有端在同一个
 *       服务器时刻起唱；M1 阶段只做对齐与状态同步，不推送音频。
 */
import { computed, onUnmounted, ref } from 'vue';
import { DAKE_API_BASE_URL } from '../../../../shared/endpoints';
import { CLIENT_BUILD_HEADER, getClientBuildTag } from '../../../../shared/buildInfo';

export interface ChorusSession {
  active: boolean;
  songId: string;
  title: string;
  /** 统一起播时刻（服务器时间 ms） */
  startAtServer: number;
  /** 歌曲内起始偏移（ms） */
  offsetMs: number;
  leader: string;
  members: string[];
}

export interface ChorusContext {
  getLKRoom: () => Promise<any>;
  myIdentity: () => string;
  /** 是否允许该发送者控制合唱（房主 / 主麦 DJ） */
  isAllowedSender: (identity: string) => boolean;
}

const CHORUS_KIND = 'dakemusic-chorus';
const CLOCK_SAMPLES = 5;

export function useChorus(ctx: ChorusContext) {
  /** 服务器时间 - 本机时间 */
  const clockOffset = ref(0);
  const clockRtt = ref(0);
  const clockSynced = ref(false);
  const syncing = ref(false);

  const session = ref<ChorusSession | null>(null);
  /** 距离起唱还有多少毫秒（已开始则为负） */
  const remainingMs = ref(0);
  /** 已进行多少毫秒 */
  const elapsedMs = ref(0);

  const serverNow = () => Date.now() + clockOffset.value;

  async function syncClock() {
    if (syncing.value) return;
    syncing.value = true;
    try {
      const samples: Array<{ offset: number; rtt: number }> = [];
      for (let i = 0; i < CLOCK_SAMPLES; i += 1) {
        const t0 = Date.now();
        const res = await fetch(`${DAKE_API_BASE_URL}/api/time`, {
          cache: 'no-store',
          headers: { [CLIENT_BUILD_HEADER]: getClientBuildTag() },
        });
        const t1 = Date.now();
        const data = (await res.json()) as { t?: number };
        if (!Number.isFinite(data?.t)) continue;
        const rtt = t1 - t0;
        samples.push({ offset: (data.t as number) - (t0 + rtt / 2), rtt });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!samples.length) return;
      // 取 RTT 最小的几个样本求均值，抵消抖动
      samples.sort((a, b) => a.rtt - b.rtt);
      const best = samples.slice(0, Math.min(3, samples.length));
      clockOffset.value = Math.round(
        best.reduce((sum, item) => sum + item.offset, 0) / best.length,
      );
      clockRtt.value = Math.round(best[0].rtt);
      clockSynced.value = true;
    } catch {
      // 网络失败保留上次校准结果
    } finally {
      syncing.value = false;
    }
  }

  let ticker: ReturnType<typeof setInterval> | null = null;
  const ensureTicker = () => {
    if (ticker) return;
    ticker = setInterval(() => {
      const current = session.value;
      if (!current) {
        remainingMs.value = 0;
        elapsedMs.value = 0;
        return;
      }
      const delta = serverNow() - current.startAtServer;
      remainingMs.value = -delta;
      elapsedMs.value = delta;
    }, 100);
  };

  const broadcast = async (payload: Record<string, unknown>) => {
    try {
      const room = await ctx.getLKRoom();
      if (!room?.localParticipant) return;
      const body = JSON.stringify({ kind: CHORUS_KIND, time: Date.now(), ...payload });
      await room.localParticipant.publishData(new TextEncoder().encode(body), { reliable: true });
    } catch {
      // 广播失败由下一轮状态重发兜底
    }
  };

  const isLeader = computed(() => !!session.value && session.value.leader === ctx.myIdentity());

  /** 房主/主麦发起一次对齐测试（M1 用假歌名，不播放音频） */
  async function startTest(options: { delayMs?: number; title?: string } = {}) {
    const delayMs = options.delayMs ?? 3000;
    await syncClock();
    const startAtServer = serverNow() + delayMs;
    const me = ctx.myIdentity();
    session.value = {
      active: true,
      songId: 'chorus-test',
      title: options.title ?? '对齐测试',
      startAtServer,
      offsetMs: 0,
      leader: me,
      members: [me],
    };
    ensureTicker();
    await broadcast({
      type: 'chorus-start',
      session: session.value,
    });
  }

  async function joinChorus() {
    const current = session.value;
    const me = ctx.myIdentity();
    if (!current || !me) return;
    if (!current.members.includes(me)) current.members = [...current.members, me];
    await broadcast({ type: 'chorus-join', identity: me });
  }

  async function leaveChorus() {
    const current = session.value;
    const me = ctx.myIdentity();
    if (!current) return;
    if (current.leader === me) {
      session.value = null;
      await broadcast({ type: 'chorus-stop' });
      return;
    }
    current.members = current.members.filter((item) => item !== me);
    await broadcast({ type: 'chorus-leave', identity: me });
  }

  function applySession(next: ChorusSession | null) {
    session.value = next ? { ...next, members: [...(next.members ?? [])] } : null;
    if (next) ensureTicker();
  }

  /** 收到房间数据通道里的合唱消息 */
  async function handleChorusMessage(obj: any, from: string) {
    if (!obj || obj.kind !== CHORUS_KIND) return;
    const allowed = ctx.isAllowedSender(from);
    switch (obj.type) {
      case 'chorus-start': {
        if (!allowed) return;
        if (!obj.session || typeof obj.session !== 'object') return;
        const next = obj.session as ChorusSession;
        if (!Number.isFinite(next.startAtServer)) return;
        applySession({
          active: true,
          songId: String(next.songId ?? ''),
          title: String(next.title ?? ''),
          startAtServer: Number(next.startAtServer),
          offsetMs: Number(next.offsetMs ?? 0),
          leader: String(next.leader ?? from),
          members: Array.isArray(next.members) ? next.members.map(String) : [],
        });
        break;
      }
      case 'chorus-join': {
        const current = session.value;
        const identity = String(obj.identity ?? from);
        if (!current || !identity) return;
        if (!current.members.includes(identity)) current.members = [...current.members, identity];
        // 新成员可能没有状态：由主唱补发一次
        if (isLeader.value) await broadcast({ type: 'chorus-start', session: current });
        break;
      }
      case 'chorus-leave': {
        const current = session.value;
        const identity = String(obj.identity ?? from);
        if (!current) return;
        current.members = current.members.filter((item) => item !== identity);
        break;
      }
      case 'chorus-stop': {
        if (!allowed) return;
        session.value = null;
        break;
      }
      default:
        break;
    }
  }

  onUnmounted(() => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  });

  return {
    clockOffset,
    clockRtt,
    clockSynced,
    syncing,
    session,
    remainingMs,
    elapsedMs,
    isLeader,
    serverNow,
    syncClock,
    startTest,
    joinChorus,
    leaveChorus,
    handleChorusMessage,
  };
}
