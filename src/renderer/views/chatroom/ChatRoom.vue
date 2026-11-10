<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ChatRoom.vue
  描述：语聊房主界面 - 左侧成员栏 + 右侧聊天/歌词区 + 底部控制栏
-->
<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
const myAvatarImage = ref('');
/** 输入栏组件引用（用于聚焦） */
const chatInputRef = ref<{ focus: () => void } | null>(null);
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useRoomLyrics } from './composables/useRoomLyrics';
import { useBadWords } from './composables/useBadWords';
import { useMemberProfile } from './composables/useMemberProfile';
import { useSeatMode } from './composables/useSeatMode';
import { useRoomChatMessages } from './composables/useRoomChatMessages';
import Button from '@/components/ui/Button.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import { roomApi } from '@/utils/roomApi';
import SeatStage from '@/seatManager/SeatStage.vue';
import SongRequestPanel from './SongRequestPanel.vue';
import ChatRoomBackground from './components/ChatRoomBackground.vue'; // 背景层（星空极光/自定义图）
import ChatRoomTopbar from './components/ChatRoomTopbar.vue'; // 顶部栏（房间名/状态/点歌/退出）
import ChatRoomMemberList from './components/ChatRoomMemberList.vue';
import ChatMessageList from './components/ChatMessageList.vue';
import ChatInputBar from './components/ChatInputBar.vue'; // 左侧成员列表
import { useSeatManager } from '@/seatManager/useSeatManager';
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
const {
  currentSeatMode,
  toggleSeatMode,
  applySeatModeFromRemote,
  isLyricSourceSender,
  isGlobalAdminSender,
} = useSeatMode({
  store,
  getLKRoom,
  getMainSeat: () => mainSeat.value,
});

// DakeMusic: 设置 store（用于自定义背景）

const {
  badWords,
  showBadWordsModal,
  newBadWord,
  loadBadWords,
  filterBadWords,
  openBadWords,
  addBadWordLocal,
  delBadWordLocal,
} = useBadWords({ getLKRoom });

const { showUserProfile, viewingUser, loadingUser, openUserProfile, previewPhotoUrl, openPhoto } =
  useMemberProfile();

// DakeMusic: 房主设置/取消管理员
async function toggleAdmin(u: any) {
  if (!u?.identity) return;
  await setAdmin(u.identity, !isAdminOf(u.identity));
}
const showEmojiPicker = ref(false);

/* ================= 歌词面板与房间数据通道（逻辑在 composables/useRoomLyrics.ts） ================= */
const {
  lyricCollapsed,
  lyricBox,
  songTitle,
  songArtist,
  isPlaying,
  lyricLines,
  lyricEmptyText,
  activeLyricIndex,
} = useRoomLyrics({
  store,
  getLKRoom,
  isLyricSourceSender,
  isGlobalAdminSender,
  currentSeatMode,
  applySeatModeFromRemote,
  loadBadWords,
  isOnMain: () => isOnMain.value,
});
/* ================= 歌词面板 END ================= */

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

const {
  messageInput,
  localNotices,
  displayMessages,
  hasAnyMessage,
  clearScreen,
  resetMemberTracking,
  clearNoticeTimer,
  pushNotice,
  sendMessage,
  sendingImage,
  onImageSelected,
} = useRoomChatMessages({ store, filterBadWords });

onMounted(() => {
  if (!store.isLoggedIn || !store.isConnected) {
    router.replace('/main/chatroom');
    return;
  }
  myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
  window.addEventListener('storage', onStorageChange);
  navigator.mediaDevices?.addEventListener?.('devicechange', adsLoad);
  nextTick(() => chatInputRef.value?.focus());
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
      nextTick(() => chatInputRef.value?.focus());
      setTimeout(() => {
        adsSyncFromRoom();
      }, 600);
    }
  },
);

function onStorageChange(e: StorageEvent) {
  if (e.key === 'chatroom_avatarImage') myAvatarImage.value = e.newValue || '';
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
        <ChatMessageList
          :messages="displayMessages"
          :notices="localNotices"
          :has-any-message="hasAnyMessage"
          :my-identity="store.myIdentity"
          :member-avatar="memberAvatar"
          :format-time="formatTime"
          @open-profile="openUserProfile"
          @preview-photo="previewPhotoUrl = $event"
        />
        <!-- DakeMusic: 输入框归位右侧公屏底部 -->
        <ChatInputBar
          ref="chatInputRef"
          v-model="messageInput"
          :has-any-message="hasAnyMessage"
          :sending-image="sendingImage"
          :emoji-list="emojiList"
          @send="sendMessage"
          @clear="clearScreen"
          @image-selected="onImageSelected"
          @insert-emoji="insertEmoji"
        />
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
