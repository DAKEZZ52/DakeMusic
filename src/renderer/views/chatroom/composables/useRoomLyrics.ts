/**
 * LyriseMusic 语聊房 - 歌词面板与房间数据通道
 * 描述：本地/远端歌词对齐、LiveKit 歌词广播（全量+心跳+分片）、麦位装扮与座位模式广播。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useLyricStore } from '@/stores/lyric';
import { getSeatFrameUrl, getMySeatFrameId } from '@/seatManager/seatFrames';
import { getAuralUrl, getMyAuralId } from '@/seatManager/auralSkins';
import { logger } from '@/utils/logger';

export interface RoomLyricsContext {
  /** 语聊房 store */
  store: any;
  /** 取 LiveKit 房间（可能延迟 resolve） */
  getLKRoom: () => Promise<any>;
  /** 发送者是否为合法歌词来源（房主/主麦 DJ） */
  isLyricSourceSender: (identity: string) => boolean;
  /** 发送者是否为房主或平台管理员 */
  isGlobalAdminSender: (identity: string) => boolean;
  /** 当前座位模式 */
  currentSeatMode: Ref<'normal' | 'duet'>;
  /** 应用远端座位模式 */
  applySeatModeFromRemote: (mode: 'normal' | 'duet') => void;
  /** 重新拉取违禁词 */
  loadBadWords: () => void;
  /** 本机是否坐在主麦上（惰性取值，避免 setup 顺序问题） */
  isOnMain: () => boolean;
  /** 合唱消息（由 useChorus 处理） */
  onChorusMessage?: (obj: any, from: string) => void;
}

/**
 * 歌词面板与房间数据通道。
 * 返回面板所需的响应式状态，内部负责挂载/卸载时的 LiveKit 监听注册。
 */
export function useRoomLyrics(ctx: RoomLyricsContext) {
  const {
    store,
    getLKRoom,
    isLyricSourceSender,
    isGlobalAdminSender,
    currentSeatMode,
    applySeatModeFromRemote,
    loadBadWords,
  } = ctx;

  // 显式导入两个核心store
  const playerStore = usePlayerStore();
  const lyricStore = useLyricStore();

  const lyricTick = ref(0);
  const lyricCollapsed = ref(false);
  const lyricBox = ref<HTMLElement | null>(null);
  let lyricTimer: any = null;
  // 组件卸载后 LiveKit 的 Promise 可能才 resolve，用它拦住迟到注册
  let lyricRoomDisposed = false;
  let watchBroadcastStop: (() => void) | null = null;
  let lyricBroadcastTimer: any = null; // 全量歌词兜底定时器
  let lyricHeartbeatTimer: any = null; // 轻量行号心跳定时器

  // 远端接收的歌词同步数据
  const remoteLyricData = ref({
    lines: [] as Array<{ time: number; text: string }>,
    currentIndex: -1,
    songTitle: '',
    songArtist: '',
    timestamp: 0,
  });

  // 判断：本机是否为播放源（房主作为播放源）
  const isLocalSongSource = computed(() => {
    // LyriseMusic: 用真房主判断播放源，避免根超管进自己房间被误判成听众
    return !!store.isRoomHost;
  });

  // LyriseMusic: 本地播放器是否正对应房间当前曲目。
  // 房间里的每个客户端都会本地播放同一首歌，因此即使房主歌词广播丢包，
  // 也能直接用本地歌词库显示，不必卡在“暂无歌词”。
  const isLocalRoomTrack = computed(() => {
    void lyricTick.value;
    const roomTrack: any = store.currentTrack;
    const local: any = playerStore.currentTrackSnapshot;
    if (!roomTrack || !local) return false;
    const roomSongId = String(roomTrack.songId ?? '');
    const localSongId = String(local.id ?? '');
    if (roomSongId && localSongId && roomSongId === localSongId) return true;
    const roomHash = String(roomTrack.songData?.hash ?? '').toLowerCase();
    const localHash = String(local.hash ?? '').toLowerCase();
    return Boolean(roomHash && localHash && roomHash === localHash);
  });

  // 歌词来源：房主，或本地确实在播房间这首歌的客户端，优先读本地歌词库
  const useLocalLyric = computed(() => isLocalSongSource.value || isLocalRoomTrack.value);

  // LyriseMusic: 是否应该由本机广播歌词。
  // 房主（播放源）照旧广播；另外允许「坐在主麦上、且本地正在放房间这首歌」的 DJ 广播，
  // 否则管理员/成员在放歌时，网页端与其它客户端都拿不到歌词。
  const shouldBroadcastLyrics = computed(
    () => isLocalSongSource.value || (ctx.isOnMain() && isLocalRoomTrack.value),
  );

  // 250ms定时器驱动 computed 更新
  onMounted(() => {
    lyricTimer = setInterval(() => {
      lyricTick.value++;
    }, 250);
  });

  onUnmounted(() => {
    lyricRoomDisposed = true;
    if (lyricTimer) clearInterval(lyricTimer);
    if (lyricBroadcastTimer) clearInterval(lyricBroadcastTimer);
    if (lyricHeartbeatTimer) clearInterval(lyricHeartbeatTimer);
    if (watchBroadcastStop) watchBroadcastStop();
  });

  // 歌曲信息：本地优先；非播放源使用远端数据
  const currentSong = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      return playerStore.currentTrackSnapshot;
    }
    return null;
  });

  // LyriseMusic: 房间点歌台当前曲目，作为标题/歌手的兜底，
  // 避免本地播放器尚未接上（或听众端广播丢失）时面板一直显示“暂无播放”。
  const roomTrackTitle = computed(() => {
    void lyricTick.value;
    const t = store.currentTrack;
    return t ? (t.title ?? t.name ?? '') : '';
  });

  const roomTrackArtist = computed(() => {
    void lyricTick.value;
    const t = store.currentTrack;
    if (!t) return '';
    if (Array.isArray(t.artists)) return t.artists.map((a: any) => a.name).join(' / ');
    return t.artist ?? '';
  });

  const songTitle = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      const s = currentSong.value;
      const local = s ? (s.title ?? s.name ?? '') : '';
      return local || roomTrackTitle.value;
    }
    return remoteLyricData.value.songTitle || roomTrackTitle.value;
  });

  const songArtist = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      const s = currentSong.value;
      if (!s) return roomTrackArtist.value;
      const local = Array.isArray(s.artists)
        ? s.artists.map((a) => a.name).join(' / ')
        : (s.artist ?? '');
      return local || roomTrackArtist.value;
    }
    return remoteLyricData.value.songArtist || roomTrackArtist.value;
  });

  const playTime = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      return playerStore.currentTime ?? 0;
    }
    return 0;
  });

  const isPlaying = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      return playerStore.isPlaying ?? false;
    }
    return false;
  });

  // 歌词数组：本地能播这首就读本地歌词库，否则接收远端广播
  const lyricLines = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      return lyricStore.lines ?? [];
    }
    return remoteLyricData.value.lines;
  });

  // 没有歌词时给用户明确状态：加载中 / 暂无歌词 / 加载失败
  const lyricEmptyText = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      if (lyricStore.isLoading) return '歌词加载中...';
      return lyricStore.tips || '暂无歌词';
    }
    return '暂无歌词';
  });

  // 当前高亮行下标
  const activeLyricIndex = computed(() => {
    void lyricTick.value;
    if (useLocalLyric.value) {
      if (typeof lyricStore.currentIndex === 'number') {
        const idx = lyricStore.currentIndex;
        if (idx >= 0 && idx < lyricLines.value.length) {
          return idx;
        }
      }
      //兜底二分查找
      const t = playTime.value;
      const lines = lyricLines.value;
      if (!lines.length) return -1;
      let lo = 0,
        hi = lines.length - 1,
        ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].time <= t) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    } else {
      // 听众端直接用广播过来的下标
      return remoteLyricData.value.currentIndex ?? -1;
    }
  });

  // 歌词滚动居中
  watch(activeLyricIndex, async (i) => {
    if (i < 0 || lyricCollapsed.value) return;
    await nextTick();
    const box = lyricBox.value;
    if (!box) return;
    const el = box.querySelector('.cr-lyric-line.active') as HTMLElement | null;
    if (!el) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    try {
      box.scrollTo({ top, behavior: 'smooth' });
    } catch {
      box.scrollTop = top;
    }
  });

  // ---------------- LiveKit 自定义数据通道 歌词广播 ----------------
  /** 房主发送歌词同步消息（全量：含所有歌词行，体积较大，仅在换歌/歌词变化/低频兜底时发） */
  async function broadcastLyricSync() {
    try {
      if (!shouldBroadcastLyrics.value) return;
      const room = await getLKRoom();
      if (!room?.localParticipant) return;
      const payload = JSON.stringify({
        kind: 'lyrise-lyric',
        type: 'lyric-sync',
        lines: lyricStore.lines,
        currentIndex: lyricStore.currentIndex,
        songTitle: songTitle.value,
        songArtist: songArtist.value,
        time: Date.now(),
      });
      const buf = new TextEncoder().encode(payload);
      // LyriseMusic: LiveKit 单包上限 64KB，歌词过大时切片发送，接收端按 transferId 重组
      const MAX = 60000;
      if (buf.length <= MAX) {
        await room.localParticipant.publishData(buf, { reliable: true });
        return;
      }
      const transferId = `t${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const total = Math.ceil(buf.length / MAX);
      for (let i = 0; i < total; i++) {
        const slice = buf.slice(i * MAX, (i + 1) * MAX);
        // 包头：JSON 头 + '\n'，后面紧跟原始字节切片
        const header = new TextEncoder().encode(
          JSON.stringify({
            kind: 'lyrise-lyric-chunk',
            transferId,
            index: i,
            total,
          }) + '\n',
        );
        const packet = new Uint8Array(header.length + slice.length);
        packet.set(header, 0);
        packet.set(slice, header.length);
        await room.localParticipant.publishData(packet, { reliable: true });
      }
    } catch (err) {
      console.warn('[歌词广播发送失败]', err);
    }
  }

  /**
   * 房主发送歌词轻量心跳（只带当前行号 + 歌名，几十字节）。
   * 作用：让当前行号秒级同步（不卡在旧行），又不必每秒重发全部歌词行，大幅省带宽。
   */
  async function broadcastLyricHeartbeat() {
    try {
      if (!shouldBroadcastLyrics.value) return;
      const room = await getLKRoom();
      if (!room?.localParticipant) return;
      const payload = JSON.stringify({
        kind: 'lyrise-lyric',
        type: 'lyric-heartbeat',
        currentIndex: lyricStore.currentIndex,
        songTitle: songTitle.value,
      });
      const buf = new TextEncoder().encode(payload);
      await room.localParticipant.publishData(buf, { reliable: true });
    } catch {
      /* 心跳失败可忽略，下一拍继续 */
    }
  }

  /** LyriseMusic: 应用全量歌词同步（换歌/丢包兜底/新人进房共用） */
  function applyLyricSync(obj: any) {
    const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
    remoteLyricData.value.lines = rawLines
      .filter((l: any) => l && typeof l.time === 'number' && typeof l.text === 'string')
      .slice(0, 5000)
      .map((l: any) => ({ time: l.time, text: l.text.slice(0, 2000) }));
    const idx = Number(obj.currentIndex);
    remoteLyricData.value.currentIndex = Number.isInteger(idx) ? idx : -1;
    remoteLyricData.value.songTitle =
      typeof obj.songTitle === 'string' ? obj.songTitle.slice(0, 200) : '';
    remoteLyricData.value.songArtist =
      typeof obj.songArtist === 'string' ? obj.songArtist.slice(0, 200) : '';
    const ts = Number(obj.time);
    remoteLyricData.value.timestamp = Number.isFinite(ts) ? ts : 0;
  }

  /** LyriseMusic: 歌词分片重组缓存 transferId -> {total, parts, count, updatedAt} */
  const LYRIC_CHUNK_MAX_TOTAL = 64; // 最多 64 包 × 60KB ≈ 3.8MB，防止超大内存占用
  const LYRIC_CHUNK_TTL = 30_000;
  const lyricChunkBuffer = new Map<
    string,
    { total: number; parts: Array<Uint8Array | undefined>; count: number; updatedAt: number }
  >();

  /** 清理超时/过多的重组缓存，防止恶意分片长期占用内存 */
  function purgeLyricChunkBuffer(now: number) {
    for (const [id, rec] of lyricChunkBuffer) {
      if (now - rec.updatedAt > LYRIC_CHUNK_TTL) lyricChunkBuffer.delete(id);
    }
    while (lyricChunkBuffer.size > 16) {
      const oldest = lyricChunkBuffer.keys().next().value;
      if (!oldest) break;
      lyricChunkBuffer.delete(oldest);
    }
  }

  /** 处理一片歌词：收齐后重组并应用 */
  function handleLyricChunk(header: any, slice: Uint8Array) {
    const transferId = typeof header.transferId === 'string' ? header.transferId : '';
    const total = Number(header.total);
    const index = Number(header.index);
    if (!transferId || transferId.length > 128) return;
    if (!Number.isInteger(total) || total < 1 || total > LYRIC_CHUNK_MAX_TOTAL) return;
    if (!Number.isInteger(index) || index < 0 || index >= total) return;
    if (!slice.length || slice.length > 60000) return;

    const now = Date.now();
    purgeLyricChunkBuffer(now);
    let rec = lyricChunkBuffer.get(transferId);
    if (rec && (rec.total !== total || now - rec.updatedAt > LYRIC_CHUNK_TTL)) {
      lyricChunkBuffer.delete(transferId);
      rec = undefined;
    }
    if (!rec) {
      rec = { total, parts: new Array(total), count: 0, updatedAt: now };
      lyricChunkBuffer.set(transferId, rec);
    }
    rec.updatedAt = now;
    if (rec.parts[index]) return; // 防重复
    rec.parts[index] = slice;
    rec.count++;
    if (rec.count !== rec.total) return;
    // 收齐：拼接（防御性检查空洞，避免 set(undefined) 抛错）
    const parts = rec.parts.filter((p): p is Uint8Array => !!p);
    if (parts.length !== rec.total) return;
    const totalLen = parts.reduce((s, p) => s + p.length, 0);
    const full = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      full.set(p, offset);
      offset += p.length;
    }
    lyricChunkBuffer.delete(transferId);
    try {
      const obj = JSON.parse(new TextDecoder().decode(full));
      if (obj.type === 'lyric-sync') applyLyricSync(obj);
    } catch {
      /* 重组数据损坏，忽略 */
    }
  }

  /**
   * 接收房间二进制 data 消息（控制协议）
   * @param participant LiveKit 签名的发送者；服务端消息没有 participant。
   * 所有控制协议都必须来自真实参与者，并按身份校验权限，防止普通成员伪造。
   */
  function onRoomDataReceived(data: Uint8Array, participant?: any) {
    try {
      const from = participant?.identity || '';
      if (!from || !(data instanceof Uint8Array) || data.length > 2_000_000) return;

      // LyriseMusic: 先判断是否为歌词分片（包头为 JSON + '\n'，后面是原始字节）
      const nlIdx = data.indexOf(0x0a);
      if (nlIdx > 0 && nlIdx < 300) {
        try {
          const header = JSON.parse(new TextDecoder().decode(data.slice(0, nlIdx)));
          if (header.kind === 'lyrise-lyric-chunk') {
            // 只有房主或主麦 DJ 能发歌词，避免任意成员覆盖全房间歌词
            if (!isLyricSourceSender(from)) return;
            handleLyricChunk(header, data.slice(nlIdx + 1));
            return;
          }
        } catch {
          /* 不是分片头，走正常 JSON 解析 */
        }
      }
      const jsonStr = new TextDecoder().decode(data);
      const obj = JSON.parse(jsonStr);
      if (!obj || typeof obj !== 'object') return;

      if (obj.type === 'lyric-sync') {
        if (!isLyricSourceSender(from)) return;
        // 全量同步：重建歌词（换歌/丢包兜底/新人进房）
        applyLyricSync(obj);
      } else if (obj.type === 'lyric-heartbeat') {
        if (!isLyricSourceSender(from)) return;
        // 轻量心跳：同一首歌才只更新当前行号（不重建歌词、不打断滚动）；
        // 歌名对不上（换歌/本地还没拿到全量）则忽略，等全量兜底（3 秒内）。
        if (
          obj.songTitle === remoteLyricData.value.songTitle &&
          Number.isInteger(obj.currentIndex) &&
          remoteLyricData.value.lines.length > 0
        ) {
          remoteLyricData.value.currentIndex = obj.currentIndex;
        }
      } else if (
        obj.kind === 'lyrise-seat-mode' &&
        (obj.mode === 'normal' || obj.mode === 'duet')
      ) {
        // LyriseMusic: 房主/平台管理员切换对唱/普通模式，房内其他人同步
        if (!isGlobalAdminSender(from)) return;
        applySeatModeFromRemote(obj.mode);
      } else if (obj.kind === 'lyrise-user-style' && obj.identity === from) {
        // LyriseMusic: 某用户广播自己的麦位框/声波皮肤（只能改自己的，不能冒充别人）
        store.userStyles[obj.identity] = {
          frameUrl: typeof obj.frameUrl === 'string' ? obj.frameUrl.slice(0, 2048) : '',
          auralUrl: typeof obj.auralUrl === 'string' ? obj.auralUrl.slice(0, 2048) : '',
        };
      } else if (obj.kind === 'lyrise-chorus') {
        if (!isLyricSourceSender(from)) return;
        ctx.onChorusMessage?.(obj, from);
      } else if (obj.kind === 'lyrise-badwords-refresh') {
        // LyriseMusic: 违禁词有变更，房间所有人重新拉取（仅房主/平台管理员可触发）
        if (!isGlobalAdminSender(from)) return;
        loadBadWords();
      }
    } catch {
      /*忽略其他消息*/
    }
  }

  // LyriseMusic: 广播自己的麦位框/声波皮肤给房内所有人
  async function broadcastMyStyle() {
    try {
      const lkRoom = await getLKRoom();
      if (!lkRoom?.localParticipant || !store.myIdentity) return;
      const payload = JSON.stringify({
        kind: 'lyrise-user-style',
        identity: store.myIdentity,
        frameUrl: getSeatFrameUrl(getMySeatFrameId()) || '',
        auralUrl: getAuralUrl(getMyAuralId()) || '',
        time: Date.now(),
      });
      const buf = new TextEncoder().encode(payload);
      await lkRoom.localParticipant.publishData(buf, { reliable: true });
    } catch (e) {
      console.warn('[broadcastMyStyle] failed', e);
    }
  }

  // 监听本窗口选框/选声波事件，变化后立即广播
  function onLocalStyleChanged() {
    broadcastMyStyle();
  }

  // LyriseMusic: 有新人进房，立刻把自己的框/声波/当前座位模式/当前歌词广播给他，他不用等下次
  async function onNewParticipant() {
    try {
      await broadcastMyStyle();
      const lkRoom = await getLKRoom();
      if (lkRoom?.localParticipant) {
        // 座位模式只有房主/平台管理员需要广播；普通成员广播会被接收端权限校验丢弃
        if (store.isOwner || store.isAdmin || store.isRootSuper) {
          const payload = JSON.stringify({
            kind: 'lyrise-seat-mode',
            mode: currentSeatMode.value,
            time: Date.now(),
          });
          await lkRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
            reliable: true,
          });
        }
        // LyriseMusic: 房主/主麦 DJ 有新人进房立刻广播当前歌曲/歌词，新人进来就同步看到
        if (shouldBroadcastLyrics.value) await broadcastLyricSync();
      }
    } catch (e) {
      logger.debug('ChatRoom', '向新成员广播房间状态失败', e);
    }
  }

  // 挂载：注册监听；房主开启定时广播
  onMounted(() => {
    loadBadWords();
    lyricRoomDisposed = false;
    const roomPromise = getLKRoom();
    roomPromise.then((room) => {
      if (!room || lyricRoomDisposed) return;
      room.on('dataReceived', onRoomDataReceived);
      room.on('participantConnected', onNewParticipant);

      // LyriseMusic: 进房后等其他人都连上，广播一次自己的麦位框/声波；同时监听本地选装扮变化
      setTimeout(() => {
        broadcastMyStyle();
      }, 1500);
      window.addEventListener('lyrise-frame-changed', onLocalStyleChanged);
      window.addEventListener('lyrise-aural-changed', onLocalStyleChanged);

      // 歌词广播：房主或主麦 DJ 都会广播（函数内部有 shouldBroadcastLyrics 守卫）
      watchBroadcastStop = watch(
        [() => lyricStore.lines, () => lyricStore.currentIndex],
        () => broadcastLyricSync(),
        { deep: true },
      );
      // 行号心跳：1 秒一次轻量同步（只带当前行号），保证当前行不卡
      lyricHeartbeatTimer = setInterval(() => {
        broadcastLyricHeartbeat();
      }, 1000);
      // 全量兜底：3 秒一次，防止丢全量 / 新人错过 / 换歌后对不上（比原来每秒全量省约 2/3 带宽）
      lyricBroadcastTimer = setInterval(() => {
        broadcastLyricSync();
      }, 3000);
    });
  });

  // 卸载：移除事件监听
  onUnmounted(() => {
    const roomPromise = getLKRoom();
    roomPromise.then((room) => {
      if (room) {
        room.off('dataReceived', onRoomDataReceived);
        room.off('participantConnected', onNewParticipant);
      }
    });
    window.removeEventListener('lyrise-frame-changed', onLocalStyleChanged);
    window.removeEventListener('lyrise-aural-changed', onLocalStyleChanged);
  });

  return {
    lyricCollapsed,
    lyricBox,
    remoteLyricData,
    isLocalSongSource,
    isLocalRoomTrack,
    useLocalLyric,
    shouldBroadcastLyrics,
    currentSong,
    roomTrackTitle,
    roomTrackArtist,
    songTitle,
    songArtist,
    playTime,
    isPlaying,
    lyricLines,
    lyricEmptyText,
    activeLyricIndex,
    broadcastLyricSync,
    broadcastLyricHeartbeat,
    applyLyricSync,
    onRoomDataReceived,
    broadcastMyStyle,
    onLocalStyleChanged,
    onNewParticipant,
  };
}
