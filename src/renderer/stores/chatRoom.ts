/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：chatRoom.ts (store)
 * 描述：语聊房状态管理 - 房间列表/成员/消息/LiveKit 连接
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getLiveKitClient, type RoomMember, type ChatMessage } from '@/utils/livekitClient';
// DakeMusic: 麦克风增益链单例，房间内与悬浮窗共用，toggleMute 统一走它
import { useMicGain } from '@/composables/useMicGain';
import { roomApi } from '@/utils/roomApi';

export interface RoomInfo {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  ownerName?: string;
  ownerNickname?: string;   // 房主昵称（显示优先于 ownerName 账号）
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

  // DakeMusic: 麦克风增益链单例（房间内与悬浮窗共用同一轨道）
  const micGain = useMicGain();
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
    // 优先显示房主昵称，没有再退回账号
    currentRoomOwnerName.value = result.ownerNickname || result.ownerName || '';
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
  }

  async function leaveRoom() {
    if (currentRoomId.value) {
      try { await roomApi.leaveRoom(currentRoomId.value); } catch {}
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
    myIdentity.value = '';
    isOwner.value = false;
    isMuted.value = true;
    bannedUsers.value = [];
  }

  async function toggleMute() {
    // DakeMusic: 统一走增益链单例；adsMuted 变化后由 watch 同步 isMuted 与成员列表
    await micGain.adsToggleMic();
  }

  const toggleMicrophone = toggleMute;

  // 点歌（开始唱）
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

  // 换头像时调用，实时同步给房间内所有人
  async function updateMyAvatar(avatar: string) {
    myAvatar.value = avatar;
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
    rooms, currentRoomId, currentRoomName, currentRoomDescription, currentRoomCoverImage, currentRoomOwnerName, members, memberAvatars, messages,
    isConnected, isConnecting, isMuted, myIdentity, myName, myAvatar, isOwner, error,
    bannedUsers, isLoggedIn, loginName, isAdmin, adminToken,
    memberCount, isMicEnabled, localMember, sortedMessages,
    login, logout, fetchRooms, fetchMyProfile, createRoom, joinRoom, leaveRoom,
    toggleMute, toggleMicrophone, sendMessage,
    kickParticipant, muteParticipant, banParticipant, isBanned,
    updateMyAvatar,
    updateRoomName, adminLogin, adminDeleteRoom,
  };
});
