import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getLiveKitClient, type RoomMember, type ChatMessage } from '@/utils/livekitClient';
import { roomApi } from '@/utils/roomApi';

export interface RoomInfo {
  id: string;
  name: string;
  creatorName: string;
  createdAt: number;
  participantCount: number;
  hasPassword?: boolean;
}

export const useChatRoomStore = defineStore('chatRoom', () => {
  // ===== 状态 =====
  const rooms = ref<RoomInfo[]>([]);
  const currentRoomId = ref('');
  const currentRoomName = ref('');
  const members = ref<RoomMember[]>([]);
  const messages = ref<ChatMessage[]>([]);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const isMuted = ref(true);
  const myIdentity = ref('');
  const myName = ref('');
  const isOwner = ref(false);
  const ownerIdentity = ref('');
  const error = ref('');
  const bannedUsers = ref<string[]>([]); // 被禁言的用户

  // ===== 个人资料（本地虚拟账户） =====
  const profile = ref({
    nickname: localStorage.getItem('chatroom_nickname') || '',
    avatar: localStorage.getItem('chatroom_avatar') || '🎵',
    avatarColor: localStorage.getItem('chatroom_avatarColor') || '#6366f1',
  });

  function saveProfile() {
    localStorage.setItem('chatroom_nickname', profile.value.nickname);
    localStorage.setItem('chatroom_avatar', profile.value.avatar);
    localStorage.setItem('chatroom_avatarColor', profile.value.avatarColor);
  }

  function updateProfile(p: Partial<typeof profile.value>) {
    profile.value = { ...profile.value, ...p };
    saveProfile();
  }

  // ===== 计算属性 =====
  const memberCount = computed(() => members.value.length);
  const isMicEnabled = computed(() => !isMuted.value);
  const localMember = computed(() =>
    members.value.find((m) => m.identity === myIdentity.value) || null,
  );
  const sortedMessages = computed(() =>
    [...messages.value].sort((a, b) => a.timestamp - b.timestamp),
  );

  // ===== LiveKit 客户端 =====
  const client = getLiveKitClient({
    onMemberJoin: (member) => {
      if (!members.value.find((m) => m.identity === member.identity)) {
        members.value.push(member);
      }
    },
    onMemberLeave: (identity) => {
      members.value = members.value.filter((m) => m.identity !== identity);
    },
    onMemberMuteChange: (identity, muted) => {
      const m = members.value.find((x) => x.identity === identity);
      if (m) m.isMuted = muted;
    },
    onSpeakingChange: (identity, speaking) => {
      const m = members.value.find((x) => x.identity === identity);
      if (m) m.isSpeaking = speaking;
    },
    onMessage: (msg) => {
      if (!messages.value.find((m) => m.id === msg.id)) {
        messages.value.push(msg);
      }
    },
    onConnected: () => {
      isConnected.value = true;
      isConnecting.value = false;
      error.value = '';
    },
    onDisconnected: () => {
      isConnected.value = false;
      isConnecting.value = false;
    },
    onError: (err) => {
      error.value = err.message;
      isConnecting.value = false;
    },
  });

  // ===== 房间列表 =====
  async function fetchRooms() {
    try {
      rooms.value = await roomApi.getRooms();
    } catch (e) {
      console.error('[ChatRoom] 获取房间列表失败:', e);
    }
  }

  // ===== 创建/加入房间 =====
  async function createRoom(name: string, creatorName: string, ownerPassword?: string, roomPassword?: string) {
    isConnecting.value = true;
    error.value = '';
    try {
      const result = await roomApi.createRoom(name, creatorName, ownerPassword || undefined, roomPassword || undefined);
      await connectToRoom(result, creatorName);
      return result;
    } catch (e: any) {
      error.value = e.message || '创建房间失败';
      isConnecting.value = false;
      throw e;
    }
  }

  async function joinRoom(roomId: string, userName: string, password?: string) {
    isConnecting.value = true;
    error.value = '';
    try {
      const result = await roomApi.joinRoom(roomId, userName, password);
      await connectToRoom(result, userName);
      return result;
    } catch (e: any) {
      error.value = e.message || '加入房间失败';
      isConnecting.value = false;
      throw e;
    }
  }

  async function ownerJoinRoom(roomId: string, password: string) {
    isConnecting.value = true;
    error.value = '';
    try {
      const result = await roomApi.ownerJoinRoom(roomId, password);
      await connectToRoom(result, result.name);
      return result;
    } catch (e: any) {
      error.value = e.message || '创建者加入失败';
      isConnecting.value = false;
      throw e;
    }
  }

  // 统一连接逻辑
  async function connectToRoom(result: any, displayName: string) {
    currentRoomId.value = result.roomId;
    currentRoomName.value = result.name;
    myIdentity.value = result.identity;
    myName.value = displayName;
    isOwner.value = result.isOwner;
    ownerIdentity.value = result.ownerIdentity;
    client.setOwnerIdentity(result.ownerIdentity);

    await client.joinRoom(result.roomId, displayName, {
      token: result.token,
      identity: result.identity,
      ownerIdentity: result.ownerIdentity,
    });
    members.value = client.getMembers();
    isMuted.value = true; // 加入时默认闭麦
    bannedUsers.value = (result as any).banned || [];
  }

  // ===== 离开房间 =====
  async function leaveRoom() {
    if (currentRoomId.value && myIdentity.value) {
      try {
        await roomApi.leaveRoom(currentRoomId.value, myIdentity.value);
      } catch {}
    }
    await client.leaveRoom();
    resetState();
  }

  function resetState() {
    members.value = [];
    messages.value = [];
    currentRoomId.value = '';
    currentRoomName.value = '';
    myIdentity.value = '';
    isOwner.value = false;
    isMuted.value = true;
  }

  // ===== 麦克风控制 =====
  async function toggleMute() {
    try {
      const newMuted = !isMuted.value;
      await client.setMicrophoneEnabled(!newMuted);
      isMuted.value = newMuted;
      const me = members.value.find((m) => m.identity === myIdentity.value);
      if (me) me.isMuted = newMuted;
    } catch (e) {
      console.error('[ChatRoom] 切换麦克风失败:', e);
    }
  }

  // 别名，兼容不同命名
  const toggleMicrophone = toggleMute;

  // ===== 消息 =====
  async function sendMessage(content: string) {
    if (!content.trim()) return;
    if (bannedUsers.value.includes(myIdentity.value)) {
      throw new Error('你已被房主禁言');
    }
    try {
      await client.sendMessage(content.trim());
    } catch (e) {
      console.error('[ChatRoom] 发送消息失败:', e);
    }
  }

  // ===== 房主管理 =====
  async function kickParticipant(targetIdentity: string) {
    if (!isOwner.value) return;
    try {
      await roomApi.kickParticipant(currentRoomId.value, targetIdentity, ownerIdentity.value);
      members.value = members.value.filter((m) => m.identity !== targetIdentity);
    } catch (e) {
      console.error('[ChatRoom] 踢人失败:', e);
    }
  }

  async function muteParticipant(targetIdentity: string, muted: boolean) {
    if (!isOwner.value) return;
    try {
      await roomApi.muteParticipant(currentRoomId.value, targetIdentity, muted, ownerIdentity.value);
      const m = members.value.find((x) => x.identity === targetIdentity);
      if (m) m.isMuted = muted;
    } catch (e) {
      console.error('[ChatRoom] 禁麦失败:', e);
    }
  }

  async function banParticipant(targetIdentity: string, banned: boolean) {
    if (!isOwner.value) return;
    try {
      const result = await roomApi.banParticipant(currentRoomId.value, targetIdentity, banned, ownerIdentity.value);
      bannedUsers.value = result.banned || [];
    } catch (e) {
      console.error('[ChatRoom] 禁言失败:', e);
    }
  }

  function isBanned(identity: string) {
    return bannedUsers.value.includes(identity);
  }

  async function deleteRoom() {
    if (!isOwner.value) return;
    try {
      await roomApi.deleteRoom(currentRoomId.value, ownerIdentity.value);
    } catch (e) {
      console.error('[ChatRoom] 解散房间失败:', e);
    }
    await leaveRoom();
  }

  async function updateRoomName(roomId: string, name: string, password: string) {
    await roomApi.updateRoom(roomId, name, { password });
  }

  return {
    // 状态
    rooms,
    currentRoomId,
    currentRoomName,
    members,
    messages,
    isConnected,
    isConnecting,
    isMuted,
    myIdentity,
    myName,
    isOwner,
    ownerIdentity,
    error,
    // 个人资料
    profile,
    updateProfile,
    // 计算属性
    memberCount,
    isMicEnabled,
    localMember,
    sortedMessages,
    // 方法
    fetchRooms,
    createRoom,
    joinRoom,
    ownerJoinRoom,
    leaveRoom,
    toggleMute,
    toggleMicrophone,
    sendMessage,
    kickParticipant,
    muteParticipant,
    banParticipant,
    bannedUsers,
    isBanned,
    deleteRoom,
    updateRoomName,
  };
});
