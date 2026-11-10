<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ChatRoom.vue
  描述：语聊房主界面 - 左侧成员栏 + 右侧聊天/歌词区 + 底部控制栏
-->
<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
const myAvatarImage = ref('');
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import Button from '@/components/ui/Button.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import { roomApi } from '@/utils/roomApi';
import SeatStage from '@/seatManager/SeatStage.vue';
import SongRequestPanel from './SongRequestPanel.vue';
import ChatRoomBackground from './components/ChatRoomBackground.vue'; // 背景层（星空极光/自定义图）
import ChatRoomTopbar from './components/ChatRoomTopbar.vue'; // 顶部栏（房间名/状态/点歌/退出）
import ChatRoomMemberList from './components/ChatRoomMemberList.vue'; // 左侧成员列表
import { useSeatManager } from '@/seatManager/useSeatManager';
import { getSeatFrameUrl, getMySeatFrameId } from '@/seatManager/seatFrames';
import { getAuralUrl, getMyAuralId } from '@/seatManager/auralSkins';
// DakeMusic: 麦克风增益/开关麦统一走单例 composable（房间内与悬浮窗共用，避免多轨道冲突）
import { useMicGain } from '@/composables/useMicGain';
import { logger } from '@/utils/logger';
// DakeMusic: 默认房间封面
import defaultCover from '/dakemusic-default-room-cover.png?url';

const router = useRouter();
const store = useChatRoomStore();
// DakeMusic: 点歌台浮层开关
const showSongPanel = ref(false);
// DakeMusic: 跳语聊房个人中心
function goToProfileEdit() {
  showUserProfile.value = false;
  router.push('/main/chatroom/profile');
}
// DakeMusic: 切换对唱/语聊模式
const currentSeatMode = ref<'normal' | 'duet'>('normal');

// 房主切换座位模式：本地切 + 通知服务器持久化 + LiveKit 广播给房内所有人
async function toggleSeatMode() {
  const next = currentSeatMode.value === 'normal' ? 'duet' : 'normal';
  currentSeatMode.value = next;
  store.currentRoomSeatMode = next;
  window.dispatchEvent(new CustomEvent('dakemusic-set-seat-mode', { detail: next }));
  // 持久化到服务器（房主才能调 PATCH，requireOwner 会拦非房主）
  if (store.currentRoomId) {
    try {
      await roomApi.updateRoom(store.currentRoomId, undefined, undefined, undefined, false, next);
    } catch (e) {
      console.warn('[seatMode] 持久化失败:', e);
    }
  }
  // LiveKit 数据通道广播给房内其他用户
  try {
    const lkRoom = await getLKRoom();
    if (lkRoom?.localParticipant) {
      const payload = JSON.stringify({ kind: 'dakemusic-seat-mode', mode: next, time: Date.now() });
      const buf = new TextEncoder().encode(payload);
      await lkRoom.localParticipant.publishData(buf, { reliable: true });
    }
  } catch (e) {
    console.warn('[seatMode] 广播失败:', e);
  }
}

function onSeatModeChanged(e: Event) {
  currentSeatMode.value = (e as CustomEvent).detail as 'normal' | 'duet';
}

// 从服务器同步过来的座位模式（其他房主广播 / 进房初始化）
function applySeatModeFromRemote(mode: 'normal' | 'duet') {
  if (currentSeatMode.value === mode) return;
  currentSeatMode.value = mode;
  store.currentRoomSeatMode = mode;
  window.dispatchEvent(new CustomEvent('dakemusic-set-seat-mode', { detail: mode }));
}

// DakeMusic: 控制指令来源校验（LiveKit 已签名 participant.identity，不能伪造）
function senderMember(identity: string) {
  return store.members.find((m) => m.identity === identity) || null;
}
/** 真房主（歌词/点歌播放源） */
function isOwnerSender(identity: string) {
  return !!identity && identity === store.ownerIdentity;
}
/**
 * DakeMusic: 歌词来源身份 = 房主，或当前坐在主麦上的 DJ。
 * 现实里在放歌的常常是管理员/普通成员（房主只是房间创建者），
 * 如果只认房主广播，网页端与其它客户端就永远拿不到歌词。
 * 主麦只能由房主/超管/房间管理员落座，信任范围可控。
 */
function isLyricSourceSender(identity: string) {
  if (!identity) return false;
  if (isOwnerSender(identity)) return true;
  return mainSeat.value?.occupant?.identity === identity;
}
/** 房主 / 平台超管 / 根超管（可切换座位模式、刷新违禁词） */
function isGlobalAdminSender(identity: string) {
  if (isOwnerSender(identity)) return true;
  const m = senderMember(identity);
  return !!m && (!!m.isAdmin || !!m.isRootSuper);
}
// DakeMusic: 进房时用服务器返回的房间座位模式初始化（否则新用户永远看到 normal）
currentSeatMode.value = store.currentRoomSeatMode === 'duet' ? 'duet' : 'normal';
window.dispatchEvent(new CustomEvent('dakemusic-set-seat-mode', { detail: currentSeatMode.value }));
onMounted(() => window.addEventListener('dakemusic-seat-mode-changed', onSeatModeChanged));
onUnmounted(() => window.removeEventListener('dakemusic-seat-mode-changed', onSeatModeChanged));
// DakeMusic: 设置 store（用于自定义背景）

const messageInput = ref('');
const messageInputEl = ref<HTMLInputElement | null>(null);
const chatContainer = ref<HTMLElement | null>(null);

// DakeMusic: 违禁词列表
const badWords = ref<string[]>([]);
const showBadWordsModal = ref(false);
const newBadWord = ref('');
async function loadBadWords() {
  try {
    const data = await roomApi.getBadWords();
    badWords.value = data?.words || [];
  } catch (e) {
    logger.warn('ChatRoom', '加载违禁词失败', e);
  }
}
function filterBadWords(text: string): string {
  if (!badWords.value.length) return text;
  let out = text;
  for (const w of badWords.value) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '*'.repeat(w.length));
  }
  return out;
}
async function openBadWords() {
  showBadWordsModal.value = true;
  await loadBadWords();
}
async function broadcastBadWordsRefresh() {
  try {
    const lkRoom = await getLKRoom();
    if (!lkRoom?.localParticipant) return;
    const payload = JSON.stringify({ kind: 'dakemusic-badwords-refresh', time: Date.now() });
    await lkRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
      reliable: true,
    });
  } catch (e) {
    logger.debug('ChatRoom', '广播违禁词刷新失败', e);
  }
}
async function addBadWordLocal() {
  const w = newBadWord.value.trim();
  if (!w) return;
  try {
    await roomApi.addBadWord(w);
    newBadWord.value = '';
    await loadBadWords();
    broadcastBadWordsRefresh();
  } catch (e) {
    logger.warn('ChatRoom', '添加违禁词失败', e);
  }
}
async function delBadWordLocal(w: string) {
  try {
    await roomApi.deleteBadWord(w);
    await loadBadWords();
    broadcastBadWordsRefresh();
  } catch (e) {
    logger.warn('ChatRoom', '删除违禁词失败', e);
  }
}

// 用户资料弹窗
const showUserProfile = ref(false);
const viewingUser = ref<any>(null);
const loadingUser = ref(false);

async function openUserProfile(identity?: string) {
  // DakeMusic: 防止 identity 为 undefined 时报错
  if (!identity) return;
  const userId = Number(identity.replace('user_', ''));
  if (!userId) return;
  loadingUser.value = true;
  viewingUser.value = null;
  showUserProfile.value = true;
  try {
    viewingUser.value = await roomApi.getUser(userId);
    viewingUser.value.identity = identity;
  } catch {
    viewingUser.value = { error: '加载失败' };
  } finally {
    loadingUser.value = false;
  }
}
// DakeMusic: 资料卡图片墙 - 应用内点击放大预览
const previewPhotoUrl = ref('');
function openPhoto(url: string) {
  previewPhotoUrl.value = url;
}
// DakeMusic: 房主设置/取消管理员
async function toggleAdmin(u: any) {
  if (!u?.identity) return;
  await setAdmin(u.identity, !isAdminOf(u.identity));
}
const showEmojiPicker = ref(false);

/* ================= 歌词面板（自动对接 DakeMusic 播放器状态） ================= */
import { usePlayerStore } from '@/stores/player';
import { useLyricStore } from '@/stores/lyric';

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
  // DakeMusic: 用真房主判断播放源，避免根超管进自己房间被误判成听众
  return !!store.isRoomHost;
});

// DakeMusic: 本地播放器是否正对应房间当前曲目。
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

// DakeMusic: 是否应该由本机广播歌词。
// 房主（播放源）照旧广播；另外允许「坐在主麦上、且本地正在放房间这首歌」的 DJ 广播，
// 否则管理员/成员在放歌时，网页端与其它客户端都拿不到歌词。
const shouldBroadcastLyrics = computed(
  () => isLocalSongSource.value || (isOnMain.value && isLocalRoomTrack.value),
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

// DakeMusic: 房间点歌台当前曲目，作为标题/歌手的兜底，
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
      kind: 'dakemusic-lyric',
      type: 'lyric-sync',
      lines: lyricStore.lines,
      currentIndex: lyricStore.currentIndex,
      songTitle: songTitle.value,
      songArtist: songArtist.value,
      time: Date.now(),
    });
    const buf = new TextEncoder().encode(payload);
    // DakeMusic: LiveKit 单包上限 64KB，歌词过大时切片发送，接收端按 transferId 重组
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
          kind: 'dakemusic-lyric-chunk',
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
      kind: 'dakemusic-lyric',
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

/** DakeMusic: 应用全量歌词同步（换歌/丢包兜底/新人进房共用） */
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

/** DakeMusic: 歌词分片重组缓存 transferId -> {total, parts, count, updatedAt} */
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

    // DakeMusic: 先判断是否为歌词分片（包头为 JSON + '\n'，后面是原始字节）
    const nlIdx = data.indexOf(0x0a);
    if (nlIdx > 0 && nlIdx < 300) {
      try {
        const header = JSON.parse(new TextDecoder().decode(data.slice(0, nlIdx)));
        if (header.kind === 'dakemusic-lyric-chunk') {
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
      obj.kind === 'dakemusic-seat-mode' &&
      (obj.mode === 'normal' || obj.mode === 'duet')
    ) {
      // DakeMusic: 房主/平台管理员切换对唱/普通模式，房内其他人同步
      if (!isGlobalAdminSender(from)) return;
      applySeatModeFromRemote(obj.mode);
    } else if (obj.kind === 'dakemusic-user-style' && obj.identity === from) {
      // DakeMusic: 某用户广播自己的麦位框/声波皮肤（只能改自己的，不能冒充别人）
      store.userStyles[obj.identity] = {
        frameUrl: typeof obj.frameUrl === 'string' ? obj.frameUrl.slice(0, 2048) : '',
        auralUrl: typeof obj.auralUrl === 'string' ? obj.auralUrl.slice(0, 2048) : '',
      };
    } else if (obj.kind === 'dakemusic-badwords-refresh') {
      // DakeMusic: 违禁词有变更，房间所有人重新拉取（仅房主/平台管理员可触发）
      if (!isGlobalAdminSender(from)) return;
      loadBadWords();
    }
  } catch {
    /*忽略其他消息*/
  }
}

// DakeMusic: 广播自己的麦位框/声波皮肤给房内所有人
async function broadcastMyStyle() {
  try {
    const lkRoom = await getLKRoom();
    if (!lkRoom?.localParticipant || !store.myIdentity) return;
    const payload = JSON.stringify({
      kind: 'dakemusic-user-style',
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

// DakeMusic: 有新人进房，立刻把自己的框/声波/当前座位模式/当前歌词广播给他，他不用等下次
async function onNewParticipant() {
  try {
    await broadcastMyStyle();
    const lkRoom = await getLKRoom();
    if (lkRoom?.localParticipant) {
      // 座位模式只有房主/平台管理员需要广播；普通成员广播会被接收端权限校验丢弃
      if (store.isOwner || store.isAdmin || store.isRootSuper) {
        const payload = JSON.stringify({
          kind: 'dakemusic-seat-mode',
          mode: currentSeatMode.value,
          time: Date.now(),
        });
        await lkRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
          reliable: true,
        });
      }
      // DakeMusic: 房主/主麦 DJ 有新人进房立刻广播当前歌曲/歌词，新人进来就同步看到
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

    // DakeMusic: 进房后等其他人都连上，广播一次自己的麦位框/声波；同时监听本地选装扮变化
    setTimeout(() => {
      broadcastMyStyle();
    }, 1500);
    window.addEventListener('dakemusic-frame-changed', onLocalStyleChanged);
    window.addEventListener('dakemusic-aural-changed', onLocalStyleChanged);

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
  window.removeEventListener('dakemusic-frame-changed', onLocalStyleChanged);
  window.removeEventListener('dakemusic-aural-changed', onLocalStyleChanged);
});
/* =============== 歌词面板 END =============== */

// ===== 房间封面：房主没上传时，显示 DakeMusic 默认封面 =====
const DEFAULT_COVER_KEY = '__dakemusic_default__';

const DEFAULT_COVER = defaultCover;
const roomCoverSrc = computed(() => {
  const c = (store as any).currentRoomCoverImage;
  if (!c || c === DEFAULT_COVER_KEY) return DEFAULT_COVER;
  return c;
});

// 房间公告
const roomAnnouncement = ref('');
const showAnnouncementEdit = ref(false);
const editAnnouncement = ref('');
// ===== 通用确认弹窗（替代原生 confirm，全站同一套渐变样式）=====
// message 用纯文本渲染（CSS white-space: pre-line），允许 \n 换行；
// 禁止使用 v-html —— 昵称等用户内容会进入这里，拼接 HTML 会造成 XSS。
const confirmState = ref({
  show: false as boolean,
  title: '',
  message: '',
  confirmText: '确定',
  doing: false as boolean,
  onOk: null as null | (() => void | Promise<void>),
});

function askConfirm(
  title: string,
  message: string,
  onOk: () => void | Promise<void>,
  confirmText = '确定',
) {
  confirmState.value = { show: true, title, message, confirmText, doing: false, onOk };
}

function closeConfirm() {
  if (confirmState.value.doing) return; // 执行中禁止关闭，防重复提交
  confirmState.value.show = false;
  confirmState.value.onOk = null;
}

async function runConfirm() {
  if (confirmState.value.doing) return;
  const fn = confirmState.value.onOk;
  if (!fn) {
    closeConfirm();
    return;
  }
  confirmState.value.doing = true;
  try {
    await fn();
  } catch (e: any) {
    alert(e.message || '操作失败');
  } finally {
    confirmState.value.doing = false;
    confirmState.value.show = false;
    confirmState.value.onOk = null;
  }
}
const isRoomOwner = computed(() => store.isOwner);
// DakeMusic: 根管理进别人房间也有全部管理权限，但不显示房主标签
const isAdmin = computed(() => store.isOwner || store.isAdmin || store.isRootSuper);

watch(
  () => store.currentRoomDescription,
  (v) => {
    roomAnnouncement.value = v || '';
  },
  { immediate: true },
);

function openAnnouncementEdit() {
  editAnnouncement.value = roomAnnouncement.value;
  showAnnouncementEdit.value = true;
}
async function saveAnnouncement() {
  try {
    await roomApi.updateRoom(store.currentRoomId || '', undefined, editAnnouncement.value.trim());
    roomAnnouncement.value = editAnnouncement.value.trim();
    showAnnouncementEdit.value = false;
  } catch (e: any) {
    alert(e.message || '保存失败');
  }
}

// 右键管理菜单（房主/管理员可用）
const contextMenu = ref({ show: false, x: 0, y: 0, member: null as any });
function onMemberContextMenu(e: MouseEvent, member: any) {
  if (!isAdmin.value) return;
  if (member.isLocal) return;
  e.preventDefault();
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, member };
}
function closeContextMenu() {
  contextMenu.value.show = false;
  contextMenu.value.member = null;
}
async function adminToggleMute() {
  const m = contextMenu.value.member;
  if (!m) return;
  await store.muteParticipant(m.identity, !m.isMuted);
  closeContextMenu();
}
async function adminToggleBan() {
  const m = contextMenu.value.member;
  if (!m) return;
  const banned = store.isBanned(m.identity);
  await store.banParticipant(m.identity, !banned);
  closeContextMenu();
}
async function adminKickMember() {
  const m = contextMenu.value.member;
  if (!m) return;
  closeContextMenu(); // 先关菜单，避免盖住确认弹窗
  askConfirm(
    '踢出成员',
    `确定要踢出「${m.name}」吗？\n踢出后 TA 需要重新加入。`,
    async () => {
      await store.kickParticipant(m.identity);
    },
    '确定踢出',
  );
}
// DakeMusic: 房主在右键菜单里随时开启/关闭管理员
async function adminToggleAdmin() {
  const m = contextMenu.value.member;
  if (!m) return;
  await setAdmin(m.identity, !isAdminOf(m.identity));
  closeContextMenu();
}

// DakeMusic: 根超管任免超管（仅环境变量里的根超管可见此项）
async function adminToggleSuper() {
  const m = contextMenu.value.member;
  if (!m) return;
  // 成员对象只有 identity（形如 user_5），没有 userId；需从 identity 解析出数字 userId
  const userId = Number(String(m.identity).replace('user_', ''));
  if (!userId) return;
  // 拉最新资料判断当前是否超管
  const profile = await roomApi.getUser(userId).catch(() => null);
  const cur = !!profile?.isAdmin;
  try {
    await roomApi.setSuperAdmin(userId, !cur);
    // 本地成员列表同步：member.isSuperAdmin 由 LiveKit metadata 刷新；这里直接更新本地缓存
    m.isSuperAdmin = !cur;
    alert(!cur ? `已将 ${m.name} 设为超管` : `已取消 ${m.name} 的超管`);
  } catch (e: any) {
    alert(e.message || '操作失败');
  }
  closeContextMenu();
}

const sortedMessages = computed(() => store.sortedMessages);

// ===== 本地提示（进房/他人进出，只显示在自己屏幕，不发到房间）=====
// 提示钉在聊天区顶部：不参与消息排序、不追加到末尾、不触发自动下滑
const localNotices = ref<Array<{ id: string; type: string; content: string }>>([]);
let noticeSeq = 0;
let noticeTimer: any = null;
const NOTICE_TTL = 5000; // 单条提示停留时长（毫秒）

function pushNotice(content: string) {
  // 只保留最新一条，避免消息区被提示堆满
  localNotices.value = [{ id: `local_${++noticeSeq}`, type: 'system', content }];
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    localNotices.value = [];
    noticeTimer = null;
  }, NOTICE_TTL);
}
function clearNoticeTimer() {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
}

// 聊天区只渲染真实消息；进出提示单独钉在顶部
const displayMessages = computed(() => [...(sortedMessages.value || [])]);
const hasAnyMessage = computed(
  () => displayMessages.value.length > 0 || localNotices.value.length > 0,
);

// ===== 清屏：只清本地显示，不影响其他人 =====
function clearScreen() {
  if (!hasAnyMessage.value) return;
  try {
    const list: any = (store as any).messages;
    if (Array.isArray(list)) list.splice(0, list.length);
  } catch (e) {
    logger.debug('ChatRoom', '清空本地消息失败', e);
  }
  clearNoticeTimer();
  localNotices.value = [];
}

// ===== 成员进出监听（用 identity 追踪，同名也不会重复）=====
const STABLE_MS = 1200; // 成员名单稳定多久才建基线
const GRACE_MS = 3000; // 进房宽限期：这期间到达的人视为「本来就在」

let memberBaselineReady = false; // 基线是否已建立
const knownMembers = new Map<string, string>(); // identity -> name
const recentNotice = new Map<string, number>(); // 事件去重：key -> 时间戳
let baselineTimer: any = null; // 稳定防抖计时器
let graceUntil = 0; // 宽限期截止时刻
let trackedRoomKey = ''; // 当前追踪的房间标识

function noticeOnce(key: string, content: string) {
  const now = Date.now();
  const last = recentNotice.get(key) || 0;
  if (now - last < 5000) return; // 5 秒内同一事件只提示一次
  recentNotice.set(key, now);
  pushNotice(content);
}

// 换房间 / 重连：彻底重置追踪状态，防止把上一个房间的人串进来
function resetMemberTracking(roomKey: string) {
  if (baselineTimer) {
    clearTimeout(baselineTimer);
    baselineTimer = null;
  }
  memberBaselineReady = false;
  knownMembers.clear();
  recentNotice.clear();
  trackedRoomKey = roomKey;
  graceUntil = Date.now() + GRACE_MS;
}

function snapshotMembers(arr: any[]) {
  const cur = new Map<string, string>();
  arr.forEach((m: any) => {
    const id = m?.identity || m?.sid || m?.name;
    if (id) cur.set(String(id), m?.name || m?.identity || '未知用户');
  });
  return cur;
}

// 房间切换（或断线重连）时重置 —— 这是「串房间」的根因
watch(
  () => `${store.currentRoomId || ''}|${store.isConnected}`,
  (key) => {
    if (key === trackedRoomKey) return;
    resetMemberTracking(key);
    clearNoticeTimer();
    localNotices.value = []; // 清掉上一个房间残留的进出提示
  },
);

watch(
  () => store.members,
  (list: any) => {
    const arr = Array.isArray(list) ? list : [];
    const cur = snapshotMembers(arr);

    // 基线未建立：成员是异步陆续到达的，等名单稳定后再锁定基线
    if (!memberBaselineReady) {
      if (baselineTimer) clearTimeout(baselineTimer);
      baselineTimer = setTimeout(() => {
        baselineTimer = null;
        knownMembers.clear();
        snapshotMembers(Array.isArray(store.members) ? store.members : []).forEach((v, k) =>
          knownMembers.set(k, v),
        );
        memberBaselineReady = true;
      }, STABLE_MS);
      return;
    }

    const inGrace = Date.now() < graceUntil; // 宽限期内不提示任何人

    // 新来的
    cur.forEach((name, id) => {
      if (!knownMembers.has(id)) {
        if (inGrace) {
          knownMembers.set(id, name);
          return;
        } // 视为本来就在
        noticeOnce(`in_${id}`, `${name} 进入房间`);
      }
    });
    // 走了的
    knownMembers.forEach((name, id) => {
      if (!cur.has(id)) {
        if (inGrace) {
          knownMembers.delete(id);
          return;
        } // 宽限期内消失也不提示
        noticeOnce(`out_${id}`, `${name} 离开了房间`);
        recentNotice.delete(`in_${id}`); // 清掉进入记录，下次进来还能提示
      }
    });

    knownMembers.clear();
    cur.forEach((v, k) => knownMembers.set(k, v));
  },
  { deep: false },
);

onMounted(() => {
  if (!store.isLoggedIn || !store.isConnected) {
    router.replace('/main/chatroom');
    return;
  }
  myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
  window.addEventListener('storage', onStorageChange);
  navigator.mediaDevices?.addEventListener?.('devicechange', adsLoad);
  nextTick(() => messageInputEl.value?.focus());
  adsRestore();
  adsLoad();
  // 首次挂载：建立房间追踪基线（并清掉可能残留的旧提示）
  resetMemberTracking(`${store.currentRoomId || ''}|${store.isConnected}`);
  clearNoticeTimer();
  localNotices.value = [];
  // 进房后同步一次真实麦状态，避免开局就出现「底部闭麦、列表开麦」的不同步
  setTimeout(() => {
    adsSyncFromRoom();
  }, 600);
});

watch(
  () => store.isConnected,
  (connected) => {
    if (connected) {
      myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
      nextTick(() => messageInputEl.value?.focus());
      setTimeout(() => {
        adsSyncFromRoom();
      }, 600);
    }
  },
);

function onStorageChange(e: StorageEvent) {
  if (e.key === 'chatroom_avatarImage') myAvatarImage.value = e.newValue || '';
}

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
}
watch(
  () => store.messages.length,
  () => scrollToBottom(),
);

async function sendMessage() {
  if (!messageInput.value.trim()) return;
  try {
    const filtered = filterBadWords(messageInput.value);
    await store.sendMessage(filtered);
    messageInput.value = '';
  } catch (e: any) {
    alert(e.message || '发送失败');
  }
}

// DakeMusic: 发送图片到公屏（本地压缩成小图，base64 随消息广播，无需上传接口）
const imageInput = ref<HTMLInputElement | null>(null);
const sendingImage = ref(false);

/** 压缩图片为 base64，逐级降尺寸/质量，直到 JSON 体积在 LiveKit 消息限制内（<13KB） */
async function compressToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const nw = img.naturalWidth || 800;
  const nh = img.naturalHeight || 800;
  const steps: Array<[number, number]> = [
    [600, 0.55],
    [450, 0.5],
    [360, 0.45],
    [280, 0.4],
  ];
  let last = '';
  for (const [maxSide, q] of steps) {
    let w = nw,
      h = nh;
    if (w > maxSide || h > maxSide) {
      const r = Math.min(maxSide / w, maxSide / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    last = canvas.toDataURL('image/jpeg', q);
    if (last.length < 13000) return last;
  }
  return last;
}

async function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    pushNotice('请选择图片文件');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    pushNotice('图片不能超过 5MB');
    return;
  }
  sendingImage.value = true;
  try {
    const dataUrl = await compressToBase64(file);
    await store.sendMessage(dataUrl, 'image');
  } catch {
    pushNotice('图片发送失败，请重试');
  } finally {
    sendingImage.value = false;
  }
}

async function toggleMic() {
  // DakeMusic: 麦下（没上麦）不能开麦，只能发文字消息
  if (!isOnSeat.value) {
    pushNotice('先申请上麦后才能说话');
    return;
  }
  // 统一走 adsToggleMic（单一真相源），避免两处逻辑各写一套导致状态漂移
  await adsToggleMic();
}

function collapseToFloating() {
  router.back();
}

const emojiList = [
  '😀',
  '😂',
  '🥰',
  '😎',
  '🤔',
  '😴',
  '😭',
  '😡',
  '👍',
  '👏',
  '🙏',
  '💪',
  '🎉',
  '🔥',
  '❤️',
  '💕',
  '🎵',
  '🎶',
  '🎤',
  '🎸',
  '🎹',
  '🥁',
  '🎧',
  '☕',
  '🍺',
  '🌹',
  '✨',
  '💯',
  '🤣',
  '😊',
  '😍',
  '🤩',
  '😇',
  '🤗',
  '🤭',
  '🤫',
  '😏',
  '😒',
  '🙄',
  '😬',
  '🤮',
  '🤧',
  '🥵',
  '🥶',
  '😱',
  '😨',
  '😢',
  '😤',
  '😠',
  '🤬',
  '🤯',
  '😳',
  '🥺',
  '😻',
  '💀',
  '👻',
  '🤖',
  '👽',
  '🎃',
  '😺',
  '🐱',
  '🐶',
  '🐰',
  '🦊',
  '🐻',
  '🐼',
  '🐨',
  '🐯',
  '🦁',
  '🐮',
  '🐷',
  '🐸',
  '🐵',
  '🐔',
  '🐧',
  '🐦',
  '🦆',
  '🦅',
  '🦉',
  '🐺',
  '🐗',
  '🐴',
  '🦄',
  '🐝',
  '🦋',
  '🐌',
  '🐞',
  '🐢',
  '🐍',
  '🦎',
  '🐙',
  '🦑',
  '🦐',
  '🦀',
  '🐟',
  '🐬',
  '🐳',
  '🦈',
  '🐊',
  '🐅',
  '🦓',
  '🦒',
  '🐘',
  '🦏',
  '🐪',
  '🐫',
  '🐃',
  '🐂',
  '🐄',
  '🐎',
  '🐖',
  '🐏',
  '🐑',
  '🐐',
  '🦌',
  '🐕',
  '🐩',
  '🐈',
  '🐓',
  '🦃',
  '🦚',
  '🦜',
  '🦢',
  '🦩',
  '🐇',
  '🐿',
  '🦔',
  '🦥',
  '🦦',
  '🦨',
  '🦘',
  '🦡',
  '🐾',
];
function insertEmoji(emoji: string) {
  messageInput.value += emoji;
  showEmojiPicker.value = false;
}

const fetchedAvatars = new Set<string>();
function memberAvatar(identity?: string) {
  // DakeMusic: 防止 identity 为 undefined 时报错
  if (!identity) return '';
  if (store.memberAvatars[identity]) return store.memberAvatars[identity];
  const m = store.members.find((x) => x.identity === identity);
  if (m?.avatar) return m.avatar;
  if (identity === store.myIdentity) return myAvatarImage.value;
  if (!fetchedAvatars.has(identity)) {
    fetchedAvatars.add(identity);
    const userId = Number(identity.replace('user_', ''));
    if (userId) {
      roomApi
        .getUser(userId)
        .then((user: any) => {
          if (user?.avatar) store.memberAvatars[identity] = user.avatar;
        })
        .catch(() => {
          // 失败就放开标记，下次渲染可以重试（换房/网络恢复后能补上头像）
          fetchedAvatars.delete(identity);
        });
    }
  }
  return '';
}

function askLeaveRoom() {
  askConfirm(
    '退出房间',
    '确定要退出当前房间吗？\n退出后需要重新加入。',
    async () => {
      await store.leaveRoom();
      router.replace('/main/chatroom');
    },
    '确定退出',
  );
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ===== 左侧栏宽度：沿用记忆宽度（旧的拖拽调宽已废弃，相关手柄与逻辑已移除） =====
const sideW = ref(Number(localStorage.getItem('chatroom_sideW') || 260));

// ===== 左侧栏可收起（默认打开） =====
const sideCollapsed = ref(false);
function toggleSide() {
  sideCollapsed.value = !sideCollapsed.value;
  localStorage.setItem('chatroom_sideCollapsed', sideCollapsed.value ? '1' : '0');
}

// ===== 右侧聊天栏：可收起（默认打开） =====
const chatW = ref(Number(localStorage.getItem('chatroom_chatW') || 312));
const chatCollapsed = ref(false);
function toggleChat() {
  chatCollapsed.value = !chatCollapsed.value;
  localStorage.setItem('chatroom_chatCollapsed', chatCollapsed.value ? '1' : '0');
}

// ===== 音频设备：合并为单一胶囊（内联，不依赖子组件）=====
// DakeMusic: 麦克风增益链/开关麦/输入设备统一走 useMicGain 单例（房间内与悬浮窗共用同一轨道）
const {
  adsMicId,
  adsMicVol,
  adsMuted,
  adsSwitching,
  adsMicOn,
  adsToggleMic: gainToggleMic,
  adsChangeMic: gainChangeMic,
} = useMicGain();

// DakeMusic: 座位状态（麦下禁麦）——与 SeatStage 共用同一份模块级状态
const { isOnSeat, isAdminOf, setAdmin, isOnMain, mainSeat } = useSeatManager();
// 离开座位时如果麦还开着，自动闭麦（麦下强制静音，只能发文字消息）
watch(isOnSeat, (on) => {
  if (!on && !adsMuted.value) {
    gainToggleMic();
  }
});

const adsOpen = ref(false);
const adsMics = ref<any[]>([]);
const adsSpeakers = ref<any[]>([]);
const adsSpeakerId = ref('');
const adsSpeakerVol = ref(85);

// 中央座位舞台已抽到独立模块 src/renderer/seatManager/SeatStage.vue（6 小座位直接坐，大主座需申请）

// 输出静音：只控制「你听到房间里别人的声音」，不影响你的麦克风输入
// 注意：这里不是监听(sidetone)。监听会把自己的麦克风声回放到耳机，
// 走机架时会和湿声叠加导致重音，因此已彻底移除。
const adsSpeakerMuted = ref(false);
function toggleSpeakerMute() {
  adsSpeakerMuted.value = !adsSpeakerMuted.value;
  adsApplyVol();
  adsSave();
}

// ===== 设备选择记忆：下次进房自动套用，不用每次重选机架设备 =====
const ADS_KEY = 'chatroom_ads_devices';
function adsRestore() {
  try {
    const raw = localStorage.getItem(ADS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o?.micId) adsMicId.value = o.micId;
    if (o?.speakerId) adsSpeakerId.value = o.speakerId;
    if (typeof o?.micVol === 'number') adsMicVol.value = o.micVol;
    if (typeof o?.speakerVol === 'number') adsSpeakerVol.value = o.speakerVol;
    if (typeof o?.speakerMuted === 'boolean') adsSpeakerMuted.value = o.speakerMuted;
    setTimeout(() => adsApplyVol(), 0);
  } catch (e) {
    logger.debug('ChatRoom', '恢复音频设备设置失败', e);
  }
}
function adsSave() {
  try {
    localStorage.setItem(
      ADS_KEY,
      JSON.stringify({
        micId: adsMicId.value,
        speakerId: adsSpeakerId.value,
        micVol: adsMicVol.value,
        speakerVol: adsSpeakerVol.value,
        speakerMuted: adsSpeakerMuted.value,
      }),
    );
  } catch (e) {
    logger.debug('ChatRoom', '保存音频设备设置失败', e);
  }
}

async function adsLoad() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t: any) => t.stop());
  } catch (e) {
    logger.debug('ChatRoom', '申请麦克风权限失败，设备列表可能不完整', e);
  }
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    // DakeMusic: 列表只显示真实设备，不显示 Windows 的角色条目（Default - / Communications - 前缀）。
    // 这些角色条目和真实设备是同一个硬件，留着反而让人困惑；选到哪个设备就用哪个设备。
    const isRoleStub = (label: string) =>
      /^(Default|Communications)\s*-/i.test((label || '').trim());
    const pickReal = (arr: any[]) => {
      const real = arr.filter((d: any) => !isRoleStub(d.label));
      // 兜底：万一全是角色条目（某些系统枚举不全），退回原列表，别让选择器变空
      return real.length ? real : arr;
    };
    // 同一设备只保留一条：按"去掉尾部 ID 后的名字"去重，避免同名端点因尾部
    // hex ID 或空格差异被当成不同设备重复显示
    const dedupe = (arr: any[]) => {
      const seen = new Set<string>();
      return arr.filter((d: any) => {
        const key = adsDisplayLabel(d).trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    adsMics.value = pickReal(dedupe(ds.filter((d: any) => d.kind === 'audioinput')));
    adsSpeakers.value = pickReal(dedupe(ds.filter((d: any) => d.kind === 'audiooutput')));
    // 记忆优先：上次选过且设备还在 → 自动套用
    const hasMic = adsMics.value.some((d: any) => d.deviceId === adsMicId.value);
    const hasSpk = adsSpeakers.value.some((d: any) => d.deviceId === adsSpeakerId.value);
    if (!hasMic && adsMics.value[0]) adsMicId.value = adsMics.value[0].deviceId;
    if (!hasSpk && adsSpeakers.value[0]) adsSpeakerId.value = adsSpeakers.value[0].deviceId;
  } catch (e) {
    logger.warn('ChatRoom', '枚举音频设备失败', e);
  }
}

function adsShort(l: string): string {
  if (!l) return '';
  const c = l.replace(/\s*\([^)]*\)\s*$/g, '');
  return c.length > 16 ? c.slice(0, 16) + '…' : c;
}

// 设备 label 尾部常带硬件 ID（如 "(0d8c0359)" 或带冒号的 "(0d8c:0359)"），
// 显示时去掉，只留设备名（设备型号如 "(4-iKF-G11)" 保留）
function adsDisplayLabel(d: any, fallback = '输入设备'): string {
  const raw = d.label || fallback;
  return raw.replace(/\s*\((?:[0-9a-f]{8}|[0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i, '');
}

// 虚拟声卡 / 机架输出识别：名字含以下关键词就打 🔌 标记
function isVirtDevice(label: string): boolean {
  const l = (label || '').toLowerCase();
  return [
    '总线',
    'virtual',
    'vrec',
    'playback',
    'cable',
    'voicemeeter',
    'stereo mix',
    '立体声混音',
    'loopback',
    '混音',
    'vb-audio',
  ].some((k) => l.includes(k));
}
const adsMicLabel = computed(() => {
  const d = adsMics.value.find((x: any) => x.deviceId === adsMicId.value);
  return adsShort(d?.label || '') || '麦克风';
});
const adsSpeakerLabel = computed(() => {
  const d = adsSpeakers.value.find((x: any) => x.deviceId === adsSpeakerId.value);
  return adsShort(d?.label || '') || '扬声器';
});

// DakeMusic: 开关麦 / 增益链 / 输入设备统一由 useMicGain 单例负责（文件顶部已解构）
// 安全获取 LiveKit room（歌词广播等组件内逻辑使用）
async function getLKRoom(): Promise<any> {
  try {
    const mod: any = await import('@/utils/livekitClient');
    const fn = mod?.getLiveKitClient || mod?.default?.getLiveKitClient;
    const client = fn ? fn() : mod?.default;
    return client?.room || client?.currentRoom || null;
  } catch {
    return null;
  }
}
// 建立组件内别名，供模板与 onMounted 引用 —— 房间内与悬浮窗操作同一条轨道
const adsToggleMic = gainToggleMic;
async function adsChangeMic(id: string) {
  await gainChangeMic(id);
  adsSave();
}
// 进房麦状态已在 composable 与 store 统一（默认闭麦），组件无需再回读，空函数兼容旧调用
function adsSyncFromRoom() {}

function adsChangeSpeaker(id: string) {
  document.querySelectorAll('audio.lk-voice-audio').forEach((el: any) => {
    if (el.setSinkId) el.setSinkId(id).catch(() => {});
  });
}

function adsApplyVol() {
  const v = adsSpeakerMuted.value ? 0 : adsSpeakerVol.value / 100;
  document.querySelectorAll('audio.lk-voice-audio').forEach((el: any) => {
    el.volume = v;
  });
}

watch(adsMicId, (id) => {
  if (id) {
    adsChangeMic(id);
    adsSave();
  }
});
watch(adsSpeakerId, (id) => {
  if (id) {
    adsChangeSpeaker(id);
    adsSave();
  }
});
watch(adsSpeakerVol, () => {
  adsApplyVol();
  adsSave();
});
watch(adsMicVol, () => adsSave());

onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange);
  navigator.mediaDevices?.removeEventListener?.('devicechange', adsLoad);
  // DakeMusic: 增益链由 useMicGain 单例管理，页面收起/切换不销毁（真正退房才在 store 清理）
  if (baselineTimer) {
    clearTimeout(baselineTimer);
    baselineTimer = null;
  }
});
</script>

<template>
  <div class="cr-root">
    <!-- DakeMusic 语聊房模块 - 作者：知之Dake -->
    <ChatRoomBackground />
    <!-- 顶部栏 -->
    <ChatRoomTopbar
      :room-name="store.currentRoomName"
      :member-count="store.memberCount"
      :show-song-panel="showSongPanel"
      @collapse="collapseToFloating"
      @toggle-song-panel="showSongPanel = !showSongPanel"
      @leave="askLeaveRoom"
    />
    <!-- 主体 -->
    <div class="cr-body">
      <!-- 左侧：房间信息 + 公告 + 成员 -->
      <aside
        class="cr-side"
        :class="{ collapsed: sideCollapsed }"
        :style="{ width: sideCollapsed ? '0px' : sideW + 'px' }"
      >
        <!-- 收起侧栏按钮 -->
        <Tooltip content="收起侧栏">
          <template #trigger>
            <button class="cr-side-fold" aria-label="收起侧栏" @click="toggleSide">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </template>
        </Tooltip>
        <!-- 房间卡片 -->
        <div class="cr-room-card">
          <div class="cr-room-cover">
            <img :src="roomCoverSrc" alt="房间封面" />
          </div>
          <div class="cr-room-meta">
            <div class="cr-room-name-row">
              <div class="cr-room-name">{{ store.currentRoomName }}</div>
              <button v-if="isAdmin" class="cr-mode-btn" @click="toggleSeatMode">
                {{ currentSeatMode === 'duet' ? '正常' : '对唱' }}
              </button>
            </div>
            <div class="cr-room-owner">
              <span>房主：{{ store.currentRoomOwnerName || '未知' }}</span>
              <button v-if="isAdmin" class="cr-mode-btn cr-bw-btn" @click="openBadWords">
                违禁
              </button>
            </div>
          </div>
        </div>
        <!-- 公告 -->
        <div class="cr-notice">
          <div class="cr-notice-head">
            <span class="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z"
                  fill="#fbbf24"
                  stroke="#f59e0b"
                  stroke-width="1"
                  stroke-linejoin="round"
                />
                <path
                  d="M16 8a5 5 0 0 1 0 8"
                  stroke="#f59e0b"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
              房间公告
            </span>
            <button v-if="isRoomOwner" class="cr-notice-edit" @click="openAnnouncementEdit">
              编辑
            </button>
          </div>
          <div v-if="roomAnnouncement" class="cr-notice-text">{{ roomAnnouncement }}</div>
          <div v-else class="cr-notice-empty">
            {{ isRoomOwner ? '点击编辑设置公告' : '暂无公告' }}
          </div>
        </div>
        <!-- 成员列表（左侧栏） -->
        <ChatRoomMemberList
          :members="store.members"
          :is-banned="store.isBanned"
          :member-avatar="memberAvatar"
          @click-member="openUserProfile"
          @context-menu="onMemberContextMenu"
        />
      </aside>
      <!-- 侧栏收起时的展开按钮 -->
      <Tooltip v-if="sideCollapsed" content="展开侧栏">
        <template #trigger>
          <button class="cr-side-unfold" aria-label="展开侧栏" @click="toggleSide">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </template>
      </Tooltip>
      <!-- 中央：成员圆形舞台 + 歌词 -->
      <section class="cr-stage">
        <!-- DakeMusic: 座位舞台（独立模块 src/renderer/seatManager：6 小座位直接坐，大主座需向房主申请） -->
        <SeatStage @view-profile="openUserProfile" />
        <!-- DakeMusic: 歌词大框（房主播什么，大家同步看） -->
        <div class="cr-lyric">
          <div class="cr-lyric-head">
            <div class="cr-lyric-title">
              <svg class="cr-lyric-ico" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
              <span class="cr-lyric-song">{{ songTitle || '暂无播放' }}</span>
              <span v-if="songArtist" class="cr-lyric-artist">{{ songArtist }}</span>
              <span v-if="isPlaying" class="cr-lyric-live" role="img" aria-label="正在播放"
                ><i></i><i></i><i></i
              ></span>
            </div>
            <Tooltip :content="lyricCollapsed ? '展开歌词' : '收起歌词'">
              <template #trigger>
                <button
                  class="cr-lyric-btn"
                  :aria-label="lyricCollapsed ? '展开歌词' : '收起歌词'"
                  @click="lyricCollapsed = !lyricCollapsed"
                >
                  <svg
                    v-if="lyricCollapsed"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              </template>
            </Tooltip>
          </div>
          <div v-show="!lyricCollapsed" ref="lyricBox" class="cr-lyric-body">
            <template v-if="lyricLines.length">
              <div
                v-for="(ln, i) in lyricLines"
                :key="i"
                class="cr-lyric-line"
                :class="{
                  active: i === activeLyricIndex,
                  near: Math.abs(i - activeLyricIndex) === 1,
                }"
              >
                {{ ln.text }}
              </div>
            </template>
            <div v-else class="cr-lyric-empty">{{ lyricEmptyText }}</div>
          </div>
        </div>
      </section>
      <!-- DakeMusic: 聊天栏收起/展开按钮 -->
      <Tooltip v-if="chatCollapsed" content="展开聊天">
        <template #trigger>
          <button class="cr-chat-unfold" aria-label="展开聊天" @click="toggleChat">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </template>
      </Tooltip>
      <aside v-if="!chatCollapsed" class="cr-chat" :style="{ width: chatW + 'px' }">
        <Tooltip content="收起聊天">
          <template #trigger>
            <button class="cr-chat-fold" aria-label="收起聊天" @click="toggleChat">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </template>
        </Tooltip>
        <div ref="chatContainer" class="cr-scroll cr-chat-scroll">
          <!-- 进出房间提示：钉在聊天区顶部，不参与排序也不滚动 -->
          <div v-if="localNotices.length" class="cr-top-notice">
            <span class="cr-system">{{ localNotices[localNotices.length - 1].content }}</span>
          </div>
          <template v-if="hasAnyMessage">
            <div
              v-for="msg in displayMessages"
              :key="msg.id"
              class="cr-row"
              :class="
                msg.type === 'system'
                  ? 'center'
                  : msg.senderIdentity === store.myIdentity
                    ? 'mine'
                    : 'other'
              "
            >
              <div v-if="msg.type === 'system'" class="cr-system">{{ msg.content }}</div>
              <div v-else class="cr-msg">
                <!-- 发送者头像：点击看资料 -->
                <div
                  class="cr-msg-av"
                  :aria-label="msg.senderName"
                  @click="openUserProfile(msg.senderIdentity)"
                >
                  <img
                    v-if="memberAvatar(msg.senderIdentity)"
                    :src="memberAvatar(msg.senderIdentity)"
                  />
                  <svg
                    v-else
                    class="cr-av-ico"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
                  </svg>
                </div>
                <div class="cr-msg-body">
                  <div class="cr-msg-meta">
                    <span class="cr-msg-name" @click="openUserProfile(msg.senderIdentity)">{{
                      msg.senderName
                    }}</span>
                    <span class="cr-msg-time">{{ formatTime(msg.timestamp) }}</span>
                  </div>
                  <div v-if="msg.type === 'image'" class="cr-bubble cr-bubble-img">
                    <img :src="msg.content" @click="previewPhotoUrl = msg.content" />
                  </div>
                  <div v-else class="cr-bubble">{{ msg.content }}</div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="cr-empty">
            <div class="cr-skeleton s1"></div>
            <div class="cr-skeleton s2"></div>
            <div class="cr-skeleton s3"></div>
          </div>
        </div>
        <!-- DakeMusic: 输入框归位右侧公屏底部 -->
        <div class="cr-input-wrap">
          <Tooltip content="清屏（清空本地聊天显示）">
            <template #trigger>
              <button
                class="cr-clear-btn"
                :class="{ 'is-disabled': !hasAnyMessage }"
                aria-label="清屏（清空本地聊天显示）"
                @click="clearScreen"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </template>
          </Tooltip>
          <input
            ref="messageInputEl"
            v-model="messageInput"
            type="text"
            placeholder="来点虎狼之词..."
            class="cr-input"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <Tooltip content="发送图片">
            <template #trigger>
              <button
                class="cr-emoji-btn"
                aria-label="发送图片"
                :disabled="sendingImage"
                @click="imageInput?.click()"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
            </template>
          </Tooltip>
          <input
            ref="imageInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onImageSelected"
          />
          <Tooltip content="表情">
            <template #trigger>
              <button
                class="cr-emoji-btn"
                aria-label="表情"
                @click="showEmojiPicker = !showEmojiPicker"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
                  />
                </svg>
              </button>
            </template>
          </Tooltip>
          <button class="cr-send" @click="sendMessage">发送</button>
          <div v-if="showEmojiPicker" class="cr-emoji-mask" @click="showEmojiPicker = false"></div>
          <div v-if="showEmojiPicker" class="cr-emoji-panel">
            <button
              v-for="emoji in emojiList"
              :key="emoji"
              class="cr-emoji-item"
              @click="insertEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </aside>
    </div>
    <!-- DakeMusic: 底部居中悬浮控制胶囊（居中区域对齐中央舞台列） -->
    <div
      class="cr-bottom"
      :style="{
        paddingLeft: (sideCollapsed ? 14 : sideW + 14) + 'px',
        paddingRight: (chatCollapsed ? 14 : chatW + 14) + 'px',
      }"
    >
      <div class="cr-bar">
        <!-- 麦克风按钮 + 悬停弹出小音量条 -->
        <div class="cr-bar-group">
          <Tooltip :content="!isOnSeat ? '先申请上麦才能说话' : adsMicOn ? '闭麦' : '开麦'">
            <template #trigger>
              <button
                class="cr-bar-btn"
                :class="[adsMicOn && isOnSeat ? 'on' : 'off', !isOnSeat ? 'is-offseat' : '']"
                :aria-label="!isOnSeat ? '先申请上麦才能说话' : adsMicOn ? '闭麦' : '开麦'"
                :disabled="adsSwitching"
                @click.stop="toggleMic"
              >
                <svg
                  v-if="adsMicOn"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                  <path d="M5 10v2a7 7 0 0 0 12 5" />
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </button>
            </template>
          </Tooltip>
          <div class="cr-vol-pop" @click.stop>
            <span class="cr-vol-pop-label">麦</span>
            <input
              type="range"
              min="0"
              max="100"
              v-model.number="adsMicVol"
              class="cr-pop-range mini"
              :style="{ '--vol': adsMicVol + '%' }"
              aria-label="麦克风音量"
            />
            <span class="cr-vol-val">{{ adsMicVol }}</span>
          </div>
        </div>
        <!-- 扬声器：静音 / 恢复房间声音。不是监听，不影响你的麦克风输入 -->
        <div class="cr-bar-group">
          <Tooltip :content="adsSpeakerMuted ? '恢复房间声音' : '静音:不听王八念经'">
            <template #trigger>
              <button
                class="cr-bar-btn"
                :class="adsSpeakerMuted ? 'off' : 'on'"
                :aria-label="adsSpeakerMuted ? '恢复房间声音' : '静音:不听王八念经'"
                @click.stop="toggleSpeakerMute"
              >
                <svg
                  v-if="!adsSpeakerMuted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path
                    d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"
                  />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path
                    d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"
                  />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              </button>
            </template>
          </Tooltip>
          <div class="cr-vol-pop" @click.stop>
            <span class="cr-vol-pop-label">声</span>
            <input
              type="range"
              min="0"
              max="100"
              v-model.number="adsSpeakerVol"
              class="cr-pop-range mini"
              :style="{ '--vol': adsSpeakerMuted ? '0%' : adsSpeakerVol + '%' }"
              :disabled="adsSpeakerMuted"
              aria-label="扬声器音量"
            />
            <span class="cr-vol-val">{{ adsSpeakerMuted ? 0 : adsSpeakerVol }}</span>
          </div>
        </div>
        <Tooltip content="音频设置">
          <template #trigger>
            <button
              class="cr-bar-btn"
              aria-label="音频设置"
              @click.stop="
                () => {
                  adsOpen = true;
                  adsLoad();
                }
              "
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                />
              </svg>
            </button>
          </template>
        </Tooltip>
      </div>
      <Teleport to="body">
        <div v-if="adsOpen" class="ads-mask" @click.self="adsOpen = false">
          <div class="ads-panel" @click.stop>
            <div class="ads-panel-head">
              <span>音频设置</span>
              <button class="ads-x" @click="adsOpen = false">×</button>
            </div>
            <!-- 输入：麦克风 / 机架输出（唱歌总线） -->
            <div class="ads-block">
              <div class="ads-label">
                输入设备（麦克风 / 机架输出）
                <span v-if="isVirtDevice(adsMicLabel)" class="ads-virt">🔌 虚拟</span>
              </div>
              <select v-model="adsMicId" class="ads-select">
                <option v-if="!adsMics.length" value="">未检测到输入设备</option>
                <option v-for="d in adsMics" :key="d.deviceId" :value="d.deviceId">
                  {{ isVirtDevice(d.label) ? '🔌 ' : '' }}{{ adsDisplayLabel(d) }}
                </option>
              </select>
              <div class="ads-vol">
                <svg class="ads-vi" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
                  />
                  <path
                    d="M19 11h-2v2c0 2.76-2.24 5-5 5s-5-2.24-5-5v-2H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92v-2z"
                  />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  v-model.number="adsMicVol"
                  class="ads-range uni"
                  :style="{ '--vol': adsMicVol + '%' }"
                />
                <span class="ads-val">{{ adsMicVol }}</span>
              </div>
            </div>
            <!-- 输出：扬声器 / 耳机 -->
            <div class="ads-block">
              <div class="ads-label">输出设备（扬声器 / 耳机）</div>
              <select v-model="adsSpeakerId" class="ads-select">
                <option v-if="!adsSpeakers.length" value="">未检测到输出设备</option>
                <option v-for="d in adsSpeakers" :key="d.deviceId" :value="d.deviceId">
                  {{ isVirtDevice(d.label) ? '🔌 ' : '' }}{{ adsDisplayLabel(d, '输出设备') }}
                </option>
              </select>
              <div class="ads-vol">
                <svg class="ads-vi" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
                  />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  v-model.number="adsSpeakerVol"
                  class="ads-range uni"
                  :style="{ '--vol': adsSpeakerVol + '%' }"
                />
                <span class="ads-val">{{ adsSpeakerVol }}</span>
              </div>
            </div>
            <div class="ads-tip">
              <div>输入：{{ adsMicLabel }} · 输出：{{ adsSpeakerLabel }}</div>
              <div class="ads-tip-sub ok">知之呕心沥血之作</div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
    <!-- 右键管理菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="cr-menu-mask"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="cr-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="cr-menu-title">管理 · {{ contextMenu.member?.name }}</div>
          <button class="cr-menu-item" @click="adminToggleMute">
            {{ contextMenu.member?.isMuted ? '开麦（解除闭麦）' : '闭麦' }}
          </button>
          <button class="cr-menu-item" @click="adminToggleBan">
            {{ store.isBanned(contextMenu.member?.identity) ? '解除禁言' : '禁言' }}
          </button>
          <button
            v-if="
              (store.isOwner || store.isRootSuper) &&
              contextMenu.member?.identity !== store.myIdentity
            "
            class="cr-menu-item"
            @click="adminToggleAdmin"
          >
            {{ isAdminOf(contextMenu.member?.identity) ? '取消管理员' : '设为管理员' }}
          </button>
          <button
            v-if="store.isRootSuper && contextMenu.member?.identity !== store.myIdentity"
            class="cr-menu-item"
            @click="adminToggleSuper"
          >
            {{ contextMenu.member?.isSuperAdmin ? '取消超管' : '设为超管' }}
          </button>
          <div class="cr-menu-sep"></div>
          <button class="cr-menu-item danger" @click="adminKickMember">踢出房间</button>
          <button
            class="cr-menu-item"
            @click="
              () => {
                openUserProfile(contextMenu.member.identity);
                closeContextMenu();
              }
            "
          >
            查看个人信息
          </button>
        </div>
      </div>
    </Teleport>
    <!-- 通用确认弹窗（踢人 / 退出房间等，替代原生 confirm） -->
    <Teleport to="body">
      <div v-if="confirmState.show" class="cr-leave-mask" @click.self="closeConfirm">
        <div class="cr-leave-panel">
          <div class="cr-leave-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div class="cr-leave-title">{{ confirmState.title }}</div>
          <div class="cr-leave-text">{{ confirmState.message }}</div>
          <div class="cr-leave-foot">
            <button
              class="cr-leave-btn cancel"
              :disabled="confirmState.doing"
              @click="closeConfirm"
            >
              取消
            </button>
            <button class="cr-leave-btn confirm" :disabled="confirmState.doing" @click="runConfirm">
              {{ confirmState.doing ? '处理中…' : confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <!-- 公告编辑弹窗 -->
    <Teleport to="body">
      <div
        v-if="showAnnouncementEdit"
        class="cr-modal-mask"
        @click.self="showAnnouncementEdit = false"
      >
        <div class="cr-modal">
          <div class="cr-modal-head">
            <span>编辑房间公告</span>
            <button class="cr-modal-close" @click="showAnnouncementEdit = false">×</button>
          </div>
          <textarea
            v-model="editAnnouncement"
            rows="5"
            class="cr-textarea"
            placeholder="输入房间公告..."
            maxlength="500"
          />
          <div class="cr-modal-foot">
            <span class="cr-count">{{ editAnnouncement.length }}/500</span>
            <Button variant="outline" @click="showAnnouncementEdit = false">取消</Button>
            <Button @click="saveAnnouncement">保存</Button>
          </div>
        </div>
      </div>
    </Teleport>
    <!-- DakeMusic: 违禁词管理弹窗 -->
    <Teleport to="body">
      <div v-if="showBadWordsModal" class="cr-modal-mask" @click.self="showBadWordsModal = false">
        <div class="cr-modal" style="max-width: 420px">
          <div class="cr-modal-head">
            <span style="display: flex; align-items: center; gap: 8px">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f87171"
                stroke-width="2"
              >
                <path
                  d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
              违禁词管理 (说点气话发泄发泄肿么了)
            </span>
            <button class="cr-modal-close" @click="showBadWordsModal = false">×</button>
          </div>
          <div style="padding: 16px">
            <div style="display: flex; gap: 8px; margin-bottom: 14px">
              <input
                v-model="newBadWord"
                class="cr-textarea"
                style="flex: 1; margin: 0; border-radius: 10px"
                placeholder="输入违禁词，回车添加"
                @keydown.enter="addBadWordLocal"
              />
              <button
                @click="addBadWordLocal"
                style="
                  padding: 8px 18px;
                  border: none;
                  border-radius: 10px;
                  background: linear-gradient(90deg, var(--color-accent-purple), #00beff);
                  color: #fff;
                  cursor: pointer;
                  font-size: 13px;
                "
              >
                添加
              </button>
            </div>
            <div style="max-height: 280px; overflow-y: auto">
              <div
                v-for="w in badWords"
                :key="w"
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 10px 12px;
                  margin-bottom: 6px;
                  background: rgba(255, 255, 255, 0.05);
                  border-radius: 10px;
                "
              >
                <span style="color: #eee; font-size: 13px">{{ w }}</span>
                <button
                  style="
                    background: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-size: 12px;
                  "
                  @click="delBadWordLocal(w)"
                >
                  删除
                </button>
              </div>
              <div
                v-if="!badWords.length"
                style="color: #666; text-align: center; padding: 30px 0; font-size: 13px"
              >
                暂无违禁词
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="showUserProfile" class="cr-modal-mask" @click.self="showUserProfile = false">
        <div class="cr-modal cr-profile-modal">
          <button class="cr-modal-close cr-profile-close" @click="showUserProfile = false">
            ×
          </button>
          <div v-if="loadingUser" class="cr-modal-body center">加载中...</div>
          <div v-else-if="viewingUser?.error" class="cr-modal-body center err">
            {{ viewingUser.error }}
          </div>
          <div v-else-if="viewingUser" class="cr-modal-body">
            <div
              class="cr-profile-top"
              :style="viewingUser.avatar ? { backgroundImage: `url(${viewingUser.avatar})` } : {}"
            >
              <div class="cr-profile-top-mask"></div>
              <div class="cr-profile-avatar">
                <img v-if="viewingUser.avatar" :src="viewingUser.avatar" />
                <svg
                  v-else
                  class="cr-av-ico big"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
                </svg>
              </div>
              <div class="cr-profile-name">{{ viewingUser.name }}</div>
              <div class="cr-profile-id">
                ID：{{ viewingUser.userId ? 999 + viewingUser.userId : '-' }}
              </div>
              <!-- DakeMusic: 一行展示资料标签 -->
              <div class="cr-profile-tags">
                <span
                  v-if="viewingUser.age"
                  class="cr-tag"
                  :class="
                    viewingUser.gender === 'female' ||
                    viewingUser.gender === '女' ||
                    viewingUser.gender === 'F' ||
                    viewingUser.gender === 'f'
                      ? 'age-gender-female'
                      : 'age-gender-male'
                  "
                >
                  {{ viewingUser.age }}
                  <template
                    v-if="
                      viewingUser.gender === 'male' ||
                      viewingUser.gender === '男' ||
                      viewingUser.gender === 'M' ||
                      viewingUser.gender === 'm'
                    "
                    >♂</template
                  >
                  <template
                    v-else-if="
                      viewingUser.gender === 'female' ||
                      viewingUser.gender === '女' ||
                      viewingUser.gender === 'F' ||
                      viewingUser.gender === 'f'
                    "
                    >♀</template
                  >
                </span>
                <span v-if="viewingUser.city" class="cr-tag city">
                  <svg
                    class="inline w-3 h-3 mr-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {{ viewingUser.city }}
                </span>
                <span v-if="viewingUser.ip" class="cr-tag ip">IP: {{ viewingUser.ip }}</span>
              </div>
              <div v-if="viewingUser.role" class="cr-profile-role">
                {{
                  viewingUser.role === 'owner'
                    ? '👑 房主'
                    : viewingUser.role === 'admin'
                      ? '🛡️ 管理员'
                      : '成员'
                }}
              </div>
            </div>
            <div v-if="viewingUser.bio" class="cr-profile-block">
              <div class="cr-profile-label">个性签名</div>
              <div class="cr-profile-text">{{ viewingUser.bio }}</div>
            </div>
            <div v-if="viewingUser.photos?.length" class="cr-profile-block">
              <div class="cr-profile-label">图片墙</div>
              <div class="cr-photos">
                <div
                  v-for="(photo, i) in viewingUser.photos"
                  :key="i"
                  class="cr-photo"
                  @click="openPhoto(photo)"
                >
                  <img :src="photo" />
                </div>
              </div>
            </div>
            <!-- DakeMusic: 个人主页按钮（看自己资料时显示，点了进编辑） -->
            <div
              v-if="viewingUser.identity === store.myIdentity"
              class="cr-profile-actions"
              style="margin-top: 12px"
            >
              <button class="cr-act primary" @click="goToProfileEdit">个人主页</button>
            </div>
            <div
              v-if="isAdmin && viewingUser.identity && viewingUser.identity !== store.myIdentity"
              class="cr-profile-actions"
            >
              <button
                v-if="store.isOwner || store.isRootSuper"
                class="cr-act"
                @click="toggleAdmin(viewingUser)"
              >
                {{ isAdminOf(viewingUser.identity) ? '取消管理员' : '设为管理员' }}
              </button>
              <button
                class="cr-act"
                @click="
                  () => {
                    store.muteParticipant(viewingUser.identity, !viewingUser.isMuted);
                  }
                "
              >
                {{ viewingUser.isMuted ? '开麦' : '闭麦' }}
              </button>
              <button
                class="cr-act"
                @click="
                  () => {
                    store.banParticipant(
                      viewingUser.identity,
                      !store.isBanned(viewingUser.identity),
                    );
                  }
                "
              >
                {{ store.isBanned(viewingUser.identity) ? '解除禁言' : '禁言' }}
              </button>
              <button
                class="cr-act danger"
                @click="
                  () =>
                    askConfirm(
                      '踢出成员',
                      `确定要踢出「${viewingUser?.name || '该成员'}」吗？\n踢出后 TA 需要重新加入。`,
                      async () => {
                        await store.kickParticipant(viewingUser.identity);
                        showUserProfile = false;
                      },
                      '确定踢出',
                    )
                "
              >
                踢出
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- DakeMusic: 资料卡图片墙 - 应用内放大预览 -->
      <div v-if="previewPhotoUrl" class="cr-photo-viewer" @click="previewPhotoUrl = ''">
        <img :src="previewPhotoUrl" />
        <Tooltip content="关闭">
          <template #trigger>
            <button
              class="cr-photo-viewer-close"
              aria-label="关闭"
              @click.stop="previewPhotoUrl = ''"
            >
              ×
            </button>
          </template>
        </Tooltip>
      </div>
    </Teleport>
    <!-- DakeMusic: 点歌台浮层（右侧抽屉） -->
    <transition name="srp-slide">
      <div v-if="showSongPanel" class="cr-song-panel">
        <SongRequestPanel />
      </div>
    </transition>
  </div>
</template>

<style scoped src="./chatRoom.css"></style>
