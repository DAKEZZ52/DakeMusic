/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：chatRoom.ts (store)
 * 描述：语聊房状态管理 - 房间列表/成员/消息/LiveKit 连接
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getLiveKitClient, type RoomMember, type ChatMessage } from '@/utils/livekitClient';
import { logger } from '@/utils/logger';
// DakeMusic: 麦克风增益链单例，房间内与悬浮窗共用，toggleMute 统一走它
import { useMicGain } from '@/composables/useMicGain';
import { roomApi } from '@/utils/roomApi';
import { usePlayerStore } from './player';
import { usePlaylistStore } from '@/stores/playlist';
import { replaceQueueAndPlay } from '@/utils/playback';

/** 内存中保留的最大聊天消息条数（更早的从历史接口重新拉取） */
const MAX_MESSAGES = 500;

export interface RoomInfo {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  ownerName?: string;
  ownerNickname?: string; // 房主昵称（显示优先于 ownerName 账号）
  ownerUserId?: number;
  participantCount: number;
  isOwner?: boolean;
  isSuperAdmin?: boolean;
  hasPassword?: boolean;
  createdAt: number;
}

export const useChatRoomStore = defineStore('chatRoom', () => {
  const rooms = ref<RoomInfo[]>([]);
  const currentRoomId = ref('');
  const currentRoomName = ref('');
  const currentRoomDescription = ref('');
  const currentRoomCoverImage = ref('');
  const currentRoomOwnerName = ref('');
  // DakeMusic: 房间座位模式（normal=9宫格 / duet=对唱2麦位），由房主切换，服务器广播
  const currentRoomSeatMode = ref<'normal' | 'duet'>('normal');
  // DakeMusic: 房内每个人的麦位框/声波皮肤 URL（identity -> {frameUrl, auralUrl}），通过 LiveKit 数据通道同步
  const userStyles = ref<Record<string, { frameUrl: string; auralUrl: string }>>({});
  const members = ref<RoomMember[]>([]);
  const memberAvatars = ref<Record<string, string>>({});
  const messages = ref<ChatMessage[]>([]);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const isMuted = ref(true);
  const myIdentity = ref('');
  const myName = ref('');
  const myAvatar = ref(localStorage.getItem('chatroom_avatarImage') || '');
  const isOwner = ref(false);
  // DakeMusic: 真房主的 LiveKit identity（后端 join 返回），用于控制指令来源校验
  const ownerIdentity = ref('');
  // DakeMusic: 房间真房主（后端认定，不被根超管进房覆盖），专用于歌词/播放源判断
  const isRoomHost = ref(false);
  /** 全局超级管理员（Dake），进别人房间不自动上麦、不显示房主标签 */
  const isSuperAdmin = ref(false);
  /** DakeMusic: 根超管（环境变量写死），可任免其他超管，且自己不能被取消 */
  const isRootSuper = ref(false);
  const error = ref('');
  const bannedUsers = ref<string[]>([]);
  const isLoggedIn = ref(!!localStorage.getItem('chat_session'));
  const loginName = ref(localStorage.getItem('chat_login_name') || '');
  const isAdmin = ref(false);
  const myBio = ref('');
  // DakeMusic: 房间点歌台队列与当前播放
  const musicQueue = ref<any[]>([]);
  const currentTrack = ref<any>(null);
  // 队列版本号：请求/广播/主动刷新都会递增，用于丢弃迟到的旧队列响应，避免刚点的歌被覆盖
  let queueRevision = 0;

  const memberCount = computed(() => members.value.length);
  const isMicEnabled = computed(() => !isMuted.value);
  const localMember = computed(
    () => members.value.find((m) => m.identity === myIdentity.value) || null,
  );
  const sortedMessages = computed(() =>
    [...messages.value].sort((a, b) => a.timestamp - b.timestamp),
  );

  const client = getLiveKitClient({
    onMemberJoin: (member) => {
      if (!members.value.find((m) => m.identity === member.identity)) members.value.push(member);
      if (member.avatar) memberAvatars.value[member.identity] = member.avatar;
    },
    onMemberLeave: (identity) => {
      members.value = members.value.filter((m) => m.identity !== identity);
      delete memberAvatars.value[identity];
    },
    onMetadataChanged: (identity, metadata) => {
      try {
        const avatar = JSON.parse(metadata).avatar || '';
        if (avatar) memberAvatars.value[identity] = avatar;
        // 同步更新 members 里的 avatar
        const m = members.value.find((x) => x.identity === identity);
        if (m) m.avatar = avatar;
      } catch (e) {
        logger.debug('ChatRoom', '解析成员元数据失败', e);
      }
    },
    onMessage: (msg) => {
      // DakeMusic: 仅接受合法聊天/系统消息，座位等控制数据（kind=dakemusic-seat）绝不串到公屏
      if (!msg || msg.kind === 'dakemusic-seat') return;
      if (msg.type !== 'text' && msg.type !== 'system' && msg.type !== 'image') return;
      if (msg.senderIdentity === undefined) return;
      messages.value.push(msg);
      // 长会话封顶，避免消息数组无限增长拖慢渲染
      if (messages.value.length > MAX_MESSAGES) {
        messages.value.splice(0, messages.value.length - MAX_MESSAGES);
      }
    },
    onConnected: () => {
      isConnected.value = true;
      isConnecting.value = false;
    },
    onDisconnected: () => {
      isConnected.value = false;
    },
    onError: (err) => {
      error.value = err.message;
      isConnecting.value = false;
    },
    onSpeakingChange: (identity, speaking) => {
      const m = members.value.find((x) => x.identity === identity);
      // 静音的人不应该显示正在说话
      if (m) m.isSpeaking = speaking && !m.isMuted;
    },
    onMemberMuteChange: (identity, muted) => {
      const m = members.value.find((x) => x.identity === identity);
      if (m) {
        m.isMuted = muted;
        // 静音时强制清除说话状态
        if (muted) m.isSpeaking = false;
      }
    },
    // DakeMusic: 点歌台广播（队列更新 / 切歌）
    onQueueEvent: (payload) => {
      if (payload.type === 'music_queue_updated') {
        queueRevision += 1;
        musicQueue.value = payload.queue || [];
      } else if (payload.type === 'music_track_changed') {
        queueRevision += 1;
        currentTrack.value = payload.track || null;
        musicQueue.value = payload.queue || [];
        // DakeMusic: 切歌/自动开播后真实播放——把缓存的真 song 放进队列播放，避免旧歌串歌
        playRoomTrack(payload.track);
      }
    },
  });

  // DakeMusic: 麦克风增益链单例（房间内与悬浮窗共用同一轨道）
  const micGain = useMicGain();
  // DakeMusic: 点歌台切歌后触发真实播放
  const playerStore = usePlayerStore();
  const playlistStore = usePlaylistStore();
  let lastPlayedTrackId = '';
  // DakeMusic: 点歌缓存 songId -> 完整 song 对象（切歌时用真 song 播放）
  const songCache = new Map<string, any>();
  // composable(真相) → store：同步 isMuted 与成员列表自己那条
  watch(micGain.adsMuted, (m) => {
    if (isMuted.value !== m) isMuted.value = m;
    const self = members.value.find((x) => x.isLocal);
    if (self && self.isMuted !== m) self.isMuted = m;
  });
  // 服务端/房主回推 store.isMuted → composable
  watch(isMuted, (m) => {
    if (micGain.adsMuted.value !== m) micGain.adsMuted.value = m;
  });

  async function fetchMyProfile() {
    try {
      const me = await roomApi.getMe();
      if (me.avatar) {
        myAvatar.value = me.avatar;
        localStorage.setItem('chatroom_avatarImage', me.avatar);
      } else {
        myAvatar.value = '';
        localStorage.removeItem('chatroom_avatarImage');
      }
      isAdmin.value = !!me.isAdmin;
      isRootSuper.value = !!me.isRootSuper;
      myBio.value = me.bio || '';
    } catch (e) {
      console.error('[ChatRoom] 拉取资料失败:', e);
    }
  }

  async function login(name: string, password: string) {
    const result = await roomApi.login(name, password);
    localStorage.setItem('chat_session', result.token);
    localStorage.setItem('chat_login_name', result.name);
    isLoggedIn.value = true;
    loginName.value = result.name;
    isAdmin.value = !!result.isAdmin;
    isRootSuper.value = !!result.isRootSuper;
    await fetchMyProfile();
    return result;
  }

  // DakeMusic: peiwan 陪玩平台账号密码登录
  async function loginPeiwan(account: string, password: string) {
    const result = await roomApi.peiwanLogin(account, password);
    localStorage.setItem('chat_session', result.token);
    localStorage.setItem('chat_login_name', result.name);
    isLoggedIn.value = true;
    loginName.value = result.name;
    isAdmin.value = !!result.isAdmin;
    isRootSuper.value = !!result.isRootSuper;
    await fetchMyProfile();
    return result;
  }

  async function logout() {
    // 登出前先退出房间：否则 LiveKit 连接仍挂着，人还在房间里（悬浮窗不消失、别人还能听到）
    if (isConnected.value || currentRoomId.value) {
      try {
        await leaveRoom();
      } catch (e) {
        console.warn('[ChatRoom] 登出前退出房间失败（可忽略）:', e);
      }
    }
    // 双保险：leaveRoom 依赖 Disconnected 回调置 false，异常时可能不触发
    isConnected.value = false;
    isConnecting.value = false;
    localStorage.removeItem('chat_session');
    localStorage.removeItem('chat_login_name');
    localStorage.removeItem('chatroom_avatarImage');
    isLoggedIn.value = false;
    loginName.value = '';
    isAdmin.value = false;
    isRootSuper.value = false;
    myAvatar.value = '';
  }

  async function fetchRooms() {
    try {
      const result = await roomApi.getRooms();
      rooms.value = result.list || result || [];
    } catch (e) {
      console.error('[ChatRoom] 获取房间列表失败:', e);
    }
  }

  async function createRoom(name: string, password?: string, coverImage?: string) {
    isConnecting.value = true;
    error.value = '';
    try {
      const result = await roomApi.createRoom(name, password, coverImage);
      const joinResult = await roomApi.joinRoom(result.id, password);
      await connectToRoom(joinResult, true);
      return joinResult;
    } catch (e: any) {
      error.value = e.message || '创建房间失败';
      isConnecting.value = false;
      throw e;
    }
  }

  async function joinRoom(roomId: string, password?: string) {
    isConnecting.value = true;
    error.value = '';
    try {
      // 如果已经在另一个房间，先退出旧房间（清理后端 participants，防止串房）
      if (currentRoomId.value && currentRoomId.value !== roomId) {
        try {
          await roomApi.leaveRoom(currentRoomId.value);
        } catch (e) {
          console.warn('[ChatRoom] 退出旧房间失败（可忽略）:', e);
        }
      }
      await fetchMyProfile();
      const result = await roomApi.joinRoom(roomId, password);
      await connectToRoom(result);
      return result;
    } catch (e: any) {
      error.value = e.message || '加入房间失败';
      isConnecting.value = false;
      throw e;
    }
  }

  async function connectToRoom(result: any, isCreate: boolean = false) {
    // 进新房间前清空旧房间的所有状态，防止串房
    messages.value = [];
    members.value = [];
    memberAvatars.value = {};
    currentRoomId.value = result.roomId;
    currentRoomName.value = result.name || '';
    currentRoomDescription.value = result.description || '';
    currentRoomCoverImage.value = result.coverImage || '';
    // 优先显示房主昵称，没有再退回账号
    currentRoomOwnerName.value = result.ownerNickname || result.ownerName || '';
    // DakeMusic: 房间座位模式（对唱/普通）
    currentRoomSeatMode.value = result.seatMode === 'duet' ? 'duet' : 'normal';
    myIdentity.value = result.identity;
    myName.value = result.myNickname || loginName.value || '用户';
    isSuperAdmin.value = !!result.isSuperAdmin;
    // DakeMusic: 真房主 = 当前 identity 与后端返回的 ownerIdentity 一致。
    // 平台超管/根超管进别人房间时 result.isOwner 也为 true，不能据此判断真房主，
    // 否则会误显示房主标签、自动坐主座、抢占歌词播放源。
    const resolvedOwnerIdentity =
      result.ownerIdentity || (result.ownerUserId ? `user_${result.ownerUserId}` : '');
    const realOwner = resolvedOwnerIdentity
      ? result.identity === resolvedOwnerIdentity
      : !!result.isOwner && !isSuperAdmin.value && !isRootSuper.value;
    ownerIdentity.value = resolvedOwnerIdentity || (realOwner ? result.identity : '');
    isRoomHost.value = realOwner;
    // isOwner = 房主级管理权限（含平台超管，保留原有管理能力）；
    // 房主标签/自动坐主座/歌词源请统一用 isRoomHost。
    isOwner.value = !!result.isOwner && (!isRootSuper.value || isCreate);
    await client.joinRoom(result.roomId, myName.value, {
      token: result.token,
      identity: result.identity,
      ownerIdentity: ownerIdentity.value,
    });
    members.value = client.getMembers();
    // 填充所有成员头像
    members.value.forEach((m) => {
      if (m.avatar) memberAvatars.value[m.identity] = m.avatar;
    });
    isMuted.value = true;
    // 进房间默认闭麦，确保不显示正在说话
    members.value.forEach((m) => {
      if (m.isMuted) m.isSpeaking = false;
    });
    // DakeMusic: 拉取点歌台队列与最近聊天记录，保证一进房就和其他人看到同一份状态
    fetchQueue();
    fetchMessages();
  }

  async function leaveRoom() {
    if (currentRoomId.value) {
      try {
        await roomApi.leaveRoom(currentRoomId.value);
      } catch (e) {
        logger.debug('ChatRoom', '退出房间接口失败，继续本地退房', e);
      }
    }
    await client.leaveRoom();
    // DakeMusic: 真正退房才销毁增益链（收起悬浮窗不销毁）
    micGain.cleanupMicGain();
    resetState();
    isConnected.value = false;
  }

  function resetState() {
    isConnected.value = false;
    members.value = [];
    memberAvatars.value = {};
    messages.value = [];
    currentRoomId.value = '';
    currentRoomName.value = '';
    currentRoomDescription.value = '';
    currentRoomCoverImage.value = '';
    currentRoomOwnerName.value = '';
    currentRoomSeatMode.value = 'normal';
    userStyles.value = {};
    myIdentity.value = '';
    ownerIdentity.value = '';
    isOwner.value = false;
    isRoomHost.value = false;
    isSuperAdmin.value = false;
    isMuted.value = true;
    bannedUsers.value = [];
    musicQueue.value = [];
    currentTrack.value = null;
    // DakeMusic: 重进房间要能重新接上“正在播放”，清掉上次的去重标记
    lastPlayedTrackId = '';
  }

  async function toggleMute() {
    // DakeMusic: 统一走增益链单例；adsMuted 变化后由 watch 同步 isMuted 与成员列表
    await micGain.adsToggleMic();
  }

  const toggleMicrophone = toggleMute;

  // 点歌（开始唱）
  async function sendMessage(content: string, type: 'text' | 'image' = 'text') {
    if (!content.trim()) return;
    try {
      await client.sendMessage(content.trim(), type);
      // DakeMusic: 文字消息额外写入服务端历史，供后进房的人看到；图片体积大，不落库。
      if (type === 'text' && currentRoomId.value) {
        void roomApi.saveMessage(currentRoomId.value, content.trim()).catch((e) => {
          logger.debug('ChatRoom', '聊天消息持久化失败', e);
        });
      }
    } catch (e) {
      console.error('[ChatRoom] 发送消息失败:', e);
    }
  }

  /** DakeMusic: 进房时补齐最近聊天记录（文字/系统消息），让新人一进来就能看到上下文 */
  async function fetchMessages() {
    const roomId = currentRoomId.value;
    if (!roomId) return;
    try {
      const r = await roomApi.getMessages(roomId, 50);
      if (currentRoomId.value !== roomId) return;
      const list = Array.isArray(r?.list) ? r.list : [];
      const history: ChatMessage[] = list
        .filter((m: any) => m && typeof m.content === 'string' && m.content)
        .map(
          (m: any): ChatMessage => ({
            id: `history_${m.id}`,
            senderIdentity: m.is_system ? 'system' : m.user_id ? `user_${m.user_id}` : 'system',
            senderName: m.user_name || '系统',
            content: m.content,
            timestamp: Date.parse(m.created_at) || Date.now(),
            type: m.is_system ? 'system' : 'text',
          }),
        );
      // 拉取期间可能刚收到实时消息，按“同内容 + 同发送者 + 10 秒内”去重，避免重复上屏
      const live = messages.value;
      messages.value = [
        ...history,
        ...live.filter(
          (m) =>
            !history.some(
              (h) =>
                h.content === m.content &&
                h.senderName === m.senderName &&
                Math.abs(h.timestamp - m.timestamp) < 10_000,
            ),
        ),
      ].sort((a, b) => a.timestamp - b.timestamp);
    } catch (e) {
      logger.debug('ChatRoom', '拉取聊天历史失败', e);
    }
  }

  // ===== DakeMusic: 房间点歌台 =====
  async function fetchQueue() {
    const roomId = currentRoomId.value;
    if (!roomId) return;
    // 记录本次请求的版本；若期间有人点歌/切歌/收到广播，则丢弃这个可能过期的响应
    const revision = ++queueRevision;
    try {
      const r = await roomApi.getQueue(roomId);
      if (revision !== queueRevision || currentRoomId.value !== roomId) return;
      musicQueue.value = Array.isArray(r?.queue) ? r.queue : [];
      currentTrack.value = r?.current ?? null;
      // DakeMusic: 进房/刷新时如果房间已有正在播放的歌，所有客户端都要接上并对齐进度，
      // 否则中途进房的人听不到歌，歌词也对不上。
      if (r?.current) playRoomTrack(r.current);
    } catch (e) {
      console.warn('[ChatRoom] 拉取队列失败:', e);
    }
  }
  async function requestSong(song: {
    songId?: string | number;
    title: string;
    artist?: string;
    cover?: string;
    url: string;
    duration?: number;
    songData?: any;
  }) {
    const roomId = currentRoomId.value;
    if (!roomId) throw new Error('还未进入房间');
    const r = await roomApi.requestSong(roomId, song);
    // 请求期间可能已经切房，旧响应不能污染新房间队列
    if (currentRoomId.value !== roomId) return r;
    queueRevision += 1;
    if (Array.isArray(r?.queue)) {
      musicQueue.value = r.queue;
    } else if (r?.item) {
      // DakeMusic: 兼容旧服务端只返回 item 的情况，先乐观追加，避免界面看起来“没反应”
      musicQueue.value = [...musicQueue.value, r.item];
    } else {
      // 响应里没有任何队列信息时，再回源拉一次最新队列
      void fetchQueue();
    }
    // DakeMusic: 房间空闲时服务端会把新点的第一首直接开播，这里同步当前曲目并真正播放；
    // 旧服务端没有 track 字段时，由 music_track_changed 广播兜底。
    if (r?.current !== undefined) currentTrack.value = r.current ?? null;
    if (r?.track) playRoomTrack(r.track);
    return r;
  }
  // DakeMusic: 缓存完整 song 对象（切歌时用来真实播放）
  function cacheSong(songId: string | number, songObj: any) {
    songCache.set(String(songId), songObj);
  }

  /**
   * DakeMusic: 真正把房间当前曲目交给本地播放器。
   * 优先用广播/接口携带的完整 songData（别人点的歌也能播），否则用点歌时缓存的 Song。
   * 同一首歌只触发一次，避免“接口响应 + 广播”重复播放。
   */
  function playRoomTrack(track: any) {
    if (!track || !track.songId) return;
    const trackKey = String(track.id || track.songId);
    if (trackKey === lastPlayedTrackId) return;
    // DakeMusic: 优先用广播携带的完整 songData（别人点的歌也能播），否则用本地缓存
    const cachedSong = songCache.get(String(track.songId));
    const songToPlay = track.songData || cachedSong;
    if (!songToPlay) {
      console.warn('[点歌台] 既无广播songData也无本地缓存，无法播放:', track.title);
      return;
    }
    lastPlayedTrackId = trackKey;
    // DakeMusic: 中途进房/重连时按服务端进度 seek，保证和房里其他人基本对齐
    const position = Math.max(0, Number(track.position) || 0);
    const duration = Math.max(0, Number(songToPlay.duration) || 0);
    const seekTarget =
      position > 1.5
        ? duration > 0
          ? Math.min(position, Math.max(0, duration - 2))
          : position
        : 0;
    // DakeMusic: 用 replaceQueueAndPlay 让播放队列只有这首歌，避免旧歌串歌
    replaceQueueAndPlay(playlistStore, playerStore, [songToPlay], 0, songToPlay)
      .then((ok) => {
        if (!ok || seekTarget <= 1.5) return;
        // 确认当前确实切到了这首歌，再按房间进度对齐
        if (String(playerStore.currentTrackId ?? '') !== String(songToPlay.id)) return;
        return playerStore.seek(seekTarget);
      })
      .catch((e: any) => console.warn('[点歌台] 切歌播放失败:', e?.message || e));
  }

  async function nextSong() {
    const roomId = currentRoomId.value;
    if (!roomId) throw new Error('还未进入房间');
    const r = await roomApi.nextSong(roomId);
    if (currentRoomId.value !== roomId) return r;
    queueRevision += 1;
    if (r?.track !== undefined) currentTrack.value = r.track || null;
    if (Array.isArray(r?.queue)) musicQueue.value = r.queue;
    // DakeMusic: 本机是切歌发起方时不等广播，直接开始播放（广播到达后会被 lastPlayedTrackId 去重）
    if (r?.track) playRoomTrack(r.track);
    return r;
  }
  async function removeSong(index: number) {
    const roomId = currentRoomId.value;
    if (!roomId) throw new Error('还未进入房间');
    const r = await roomApi.removeSong(roomId, index);
    if (currentRoomId.value !== roomId) return r;
    queueRevision += 1;
    if (Array.isArray(r?.queue)) musicQueue.value = r.queue;
    return r;
  }

  // 权限判定：房主或根超管（根超管在别人房间也有全部管理权限）；普通管理员只认房主
  const canManage = computed(() => isOwner.value || isRootSuper.value);

  async function kickParticipant(targetIdentity: string) {
    if (!canManage.value) return;
    try {
      await roomApi.kickParticipant(currentRoomId.value, targetIdentity);
      members.value = members.value.filter((m) => m.identity !== targetIdentity);
    } catch (e) {
      console.error('[ChatRoom] 踢人失败:', e);
    }
  }

  async function muteParticipant(targetIdentity: string, muted: boolean) {
    if (!canManage.value) return;
    try {
      await roomApi.muteParticipant(currentRoomId.value, targetIdentity, muted);
      const m = members.value.find((x) => x.identity === targetIdentity);
      if (m) m.isMuted = muted;
    } catch (e) {
      console.error('[ChatRoom] 禁麦失败:', e);
    }
  }

  async function banParticipant(targetIdentity: string, banned: boolean) {
    if (!canManage.value) return;
    try {
      await roomApi.banParticipant(currentRoomId.value, targetIdentity, banned);
      if (banned && !bannedUsers.value.includes(targetIdentity))
        bannedUsers.value.push(targetIdentity);
      else if (!banned) bannedUsers.value = bannedUsers.value.filter((x) => x !== targetIdentity);
    } catch (e) {
      console.error('[ChatRoom] 禁言失败:', e);
    }
  }

  function isBanned(identity: string) {
    return bannedUsers.value.includes(identity);
  }

  // 换头像时调用，实时同步给房间内所有人
  async function updateMyAvatar(avatar: string) {
    myAvatar.value = avatar;
    memberAvatars.value[myIdentity.value] = avatar;
    const me = members.value.find((m) => m.identity === myIdentity.value);
    if (me) me.avatar = avatar;
    await client.updateLocalMetadata(avatar);
  }

  async function updateRoomName(roomId: string, name: string) {
    await roomApi.updateRoom(roomId, name);
  }

  return {
    rooms,
    currentRoomId,
    currentRoomName,
    currentRoomDescription,
    currentRoomCoverImage,
    currentRoomOwnerName,
    currentRoomSeatMode,
    userStyles,
    members,
    memberAvatars,
    messages,
    isConnected,
    isConnecting,
    isMuted,
    myIdentity,
    myName,
    myAvatar,
    myBio,
    isOwner,
    ownerIdentity,
    isRoomHost,
    isSuperAdmin,
    isRootSuper,
    error,
    bannedUsers,
    isLoggedIn,
    loginName,
    isAdmin,
    memberCount,
    isMicEnabled,
    localMember,
    sortedMessages,
    musicQueue,
    currentTrack,
    login,
    loginPeiwan,
    logout,
    fetchRooms,
    fetchMyProfile,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleMicrophone,
    sendMessage,
    fetchMessages,
    kickParticipant,
    muteParticipant,
    banParticipant,
    isBanned,
    updateMyAvatar,
    updateRoomName,
    fetchQueue,
    requestSong,
    nextSong,
    removeSong,
    cacheSong,
  };
});
