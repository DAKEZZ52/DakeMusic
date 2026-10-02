import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getLiveKitClient, type RoomMember, type ChatMessage } from '@/utils/livekitClient';
import { roomApi } from '@/utils/roomApi';

export interface RoomInfo {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  ownerName?: string;
  ownerUserId?: number;
  participantCount: number;
  isOwner?: boolean;
  isSuperAdmin?: boolean;
  hasPassword?: boolean;
  seats?: any[];
  createdAt: number;
}

export const useChatRoomStore = defineStore('chatRoom', () => {
  const rooms = ref<RoomInfo[]>([]);
  const currentRoomId = ref('');
  const currentRoomName = ref('');
  const currentRoomDescription = ref('');
  const currentRoomCoverImage = ref('');
  const currentRoomOwnerName = ref('');
  const seats = ref<any[]>([null, null, null, null, null]);
  let seatProbeTimer: any = null;
  let probeBackoff = 1000;
  let lastSeatEventAt = 0;
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
  const error = ref('');
  const bannedUsers = ref<string[]>([]);
  const isLoggedIn = ref(!!localStorage.getItem('chat_session'));
  const loginName = ref(localStorage.getItem('chat_login_name') || '');
  const isAdmin = ref(false);

  const memberCount = computed(() => members.value.length);
  const isMicEnabled = computed(() => !isMuted.value);
  const localMember = computed(() =>
    members.value.find((m) => m.identity === myIdentity.value) || null,
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
      } catch {}
    },
    onMessage: (msg) => { messages.value.push(msg); },
    onSeatsUpdate: (newSeats) => { applySeats(newSeats, 'broadcast'); bumpSeatHeartbeat(); },
    onConnected: () => { isConnected.value = true; isConnecting.value = false; },
    onDisconnected: () => { isConnected.value = false; },
    onError: (err) => { error.value = err.message; isConnecting.value = false; },
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
    await fetchMyProfile();
    return result;
  }

  function logout() {
    localStorage.removeItem('chat_session');
    localStorage.removeItem('chat_login_name');
    localStorage.removeItem('chatroom_avatarImage');
    isLoggedIn.value = false;
    loginName.value = '';
    isAdmin.value = false;
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
      await connectToRoom(joinResult);
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
        try { await roomApi.leaveRoom(currentRoomId.value); } catch (e) { console.warn('[ChatRoom] 退出旧房间失败（可忽略）:', e); }
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

  async function connectToRoom(result: any) {
    // 进新房间前清空旧房间的所有状态，防止串房
    messages.value = [];
    members.value = [];
    memberAvatars.value = {};
    currentRoomId.value = result.roomId;
    currentRoomName.value = result.name || '';
    currentRoomDescription.value = result.description || '';
    currentRoomCoverImage.value = result.coverImage || '';
    currentRoomOwnerName.value = result.ownerName || '';
    seats.value = result.seats || [null, null, null, null, null];
    myIdentity.value = result.identity;
    myName.value = loginName.value || '用户';
    isOwner.value = !!result.isOwner;
    await client.joinRoom(result.roomId, myName.value, {
      token: result.token,
      identity: result.identity,
    });
    members.value = client.getMembers();
    // 填充所有成员头像
    members.value.forEach(m => { if (m.avatar) memberAvatars.value[m.identity] = m.avatar; });
    isMuted.value = true;
    // 进房间默认闭麦，确保不显示正在说话
    members.value.forEach(m => { if (m.isMuted) m.isSpeaking = false; });
    // 启动麦位心跳 probe（15秒无广播事件才触发HTTP兜底，指数退避）
    startSeatProbe();
    bumpSeatHeartbeat();
  }

  async function leaveRoom() {
    // 退出前如果在麦位上，自动下麦
    const myIdx = mySeatIndex();
    if (currentRoomId.value && myIdx >= 0) {
      try { await roomApi.leaveSeat(currentRoomId.value, myIdx); } catch {}
    }
    if (currentRoomId.value) {
      try { await roomApi.leaveRoom(currentRoomId.value); } catch {}
    }
    await client.leaveRoom();
    resetState();
  }

  function resetState() {
    stopSeatProbe();
    members.value = [];
    memberAvatars.value = {};
    messages.value = [];
    currentRoomId.value = '';
    currentRoomName.value = '';
    currentRoomDescription.value = '';
    currentRoomCoverImage.value = '';
    currentRoomOwnerName.value = '';
    seats.value = [null, null, null, null, null];
    myIdentity.value = '';
    isOwner.value = false;
    isMuted.value = true;
    bannedUsers.value = [];
  }

  async function toggleMute() {
    // 没上麦时不允许开麦
    if (isMuted.value && mySeatIndex() < 0) {
      console.warn('[ChatRoom] 未上麦，不能开麦');
      return;
    }
    try {
      const newMuted = !isMuted.value;
      await client.setMicrophoneEnabled(!newMuted);
      isMuted.value = newMuted;
      const me = members.value.find((m) => m.identity === myIdentity.value);
      if (me) {
        me.isMuted = newMuted;
        // 闭麦时强制清除说话状态
        if (newMuted) me.isSpeaking = false;
      }
    } catch (e) {
      console.error('[ChatRoom] 切换麦克风失败:', e);
    }
  }

  const toggleMicrophone = toggleMute;

  async function sendMessage(content: string) {
    if (!content.trim()) return;
    try { await client.sendMessage(content.trim()); }
    catch (e) { console.error('[ChatRoom] 发送消息失败:', e); }
  }

  async function kickParticipant(targetIdentity: string) {
    if (!isOwner.value) return;
    try {
      await roomApi.kickParticipant(currentRoomId.value, targetIdentity);
      members.value = members.value.filter((m) => m.identity !== targetIdentity);
    } catch (e) { console.error('[ChatRoom] 踢人失败:', e); }
  }

  async function muteParticipant(targetIdentity: string, muted: boolean) {
    if (!isOwner.value) return;
    try {
      await roomApi.muteParticipant(currentRoomId.value, targetIdentity, muted);
      const m = members.value.find((x) => x.identity === targetIdentity);
      if (m) m.isMuted = muted;
    } catch (e) { console.error('[ChatRoom] 禁麦失败:', e); }
  }

  async function banParticipant(targetIdentity: string, banned: boolean) {
    if (!isOwner.value) return;
    try {
      await roomApi.banParticipant(currentRoomId.value, targetIdentity, banned);
      if (banned && !bannedUsers.value.includes(targetIdentity)) bannedUsers.value.push(targetIdentity);
      else if (!banned) bannedUsers.value = bannedUsers.value.filter((x) => x !== targetIdentity);
    } catch (e) { console.error('[ChatRoom] 禁言失败:', e); }
  }

  function isBanned(identity: string) { return bannedUsers.value.includes(identity); }

  async function takeSeat(index: number) {
    const prev = seats.value[index];
    // 乐观更新：立即显示自己占座，带 pending 标记
    seats.value[index] = { identity: myIdentity.value, name: myName.value, isPending: true };
    try {
      const result = await roomApi.takeSeat(currentRoomId.value, index);
      applySeats(result.seats, 'api');
      bumpSeatHeartbeat();
    } catch (e) {
      // 失败回滚，避免幽灵占座
      seats.value[index] = prev;
      throw e;
    }
  }
  async function leaveSeat(index: number) {
    const prev = seats.value[index];
    seats.value[index] = null; // 乐观更新
    try {
      const result = await roomApi.leaveSeat(currentRoomId.value, index);
      applySeats(result.seats, 'api');
      bumpSeatHeartbeat();
    } catch (e) {
      seats.value[index] = prev; // 回滚
      throw e;
    }
    // 下麦后自动闭麦
    await client.setMicrophoneEnabled(false);
    isMuted.value = true;
    const me = members.value.find(m => m.isLocal);
    if (me) me.isMuted = true;
  }
  function mySeatIndex() {
    for (let i = 0; i < seats.value.length; i++) {
      if (seats.value[i] && seats.value[i].identity === myIdentity.value) return i;
    }
    return -1;
  }

  // 麦位状态归并：以后端为准，保留本地 pending 避免闪烁
  function applySeats(incoming: any[], _source: string) {
    if (!Array.isArray(incoming)) return;
    seats.value = incoming.map((s, i) => {
      if (s) return s;
      const local = seats.value[i];
      if (local?.isPending && local.identity === myIdentity.value) {
        return { ...local, _stale: true };
      }
      return null;
    });
  }

  // 麦位事件心跳：任何 seat 事件都刷新时间戳
  function bumpSeatHeartbeat() { lastSeatEventAt = Date.now(); probeBackoff = 1000; }

  // 指数退避 probe：15秒无广播事件才触发HTTP兜底拉取
  function startSeatProbe() {
    stopSeatProbe();
    const tick = async () => {
      if (!currentRoomId.value) return;
      const silent = Date.now() - lastSeatEventAt > 15000;
      if (!silent) { seatProbeTimer = setTimeout(tick, probeBackoff); return; }
      try {
        const room = await roomApi.getRoom(currentRoomId.value);
        if (room?.seats) { applySeats(room.seats, 'probe'); bumpSeatHeartbeat(); }
      } catch {
        probeBackoff = Math.min(probeBackoff * 2, 15000);
      }
      seatProbeTimer = setTimeout(tick, probeBackoff);
    };
    seatProbeTimer = setTimeout(tick, probeBackoff);
  }
  function stopSeatProbe() {
    if (seatProbeTimer) { clearTimeout(seatProbeTimer); seatProbeTimer = null; }
    probeBackoff = 1000;
  }

  // 不在麦位时强制闭麦（麦下不能说话）
  watch(seats, () => {
    if (isConnected.value && mySeatIndex() < 0 && !isMuted.value) {
      client.setMicrophoneEnabled(false).catch(() => {});
      isMuted.value = true;
      const me = members.value.find((m) => m.identity === myIdentity.value);
      if (me) { me.isMuted = true; me.isSpeaking = false; }
    }
  }, { deep: true });

  // 换头像时调用，实时同步给房间内所有人
  async function updateMyAvatar(avatar: string) {
    memberAvatars.value[myIdentity.value] = avatar;
    const me = members.value.find(m => m.identity === myIdentity.value);
    if (me) me.avatar = avatar;
    await client.updateLocalMetadata(avatar);
  }

  async function updateRoomName(roomId: string, name: string) {
    await roomApi.updateRoom(roomId, name);
  }

  const adminToken = ref('');

  async function adminLogin(password: string) {
    const result = await roomApi.adminLogin(password);
    adminToken.value = result.token;
    return result;
  }

  async function adminDeleteRoom(roomId: string) {
    if (!adminToken.value) throw new Error('未登录管理员');
    await roomApi.adminDeleteRoom(roomId, adminToken.value);
  }

  return {
    rooms, currentRoomId, currentRoomName, currentRoomDescription, currentRoomCoverImage, currentRoomOwnerName, seats, members, memberAvatars, messages,
    isConnected, isConnecting, isMuted, myIdentity, myName, myAvatar, isOwner, error,
    bannedUsers, isLoggedIn, loginName, isAdmin, adminToken,
    memberCount, isMicEnabled, localMember, sortedMessages,
    login, logout, fetchRooms, fetchMyProfile, createRoom, joinRoom, leaveRoom,
    toggleMute, toggleMicrophone, sendMessage,
    kickParticipant, muteParticipant, banParticipant, isBanned,
    takeSeat, leaveSeat, mySeatIndex, updateMyAvatar,
    updateRoomName, adminLogin, adminDeleteRoom,
  };
});
