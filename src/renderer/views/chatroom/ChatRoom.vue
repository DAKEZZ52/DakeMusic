<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
const myAvatarImage = ref('');
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import Button from '@/components/ui/Button.vue';
import AudioDeviceSelector from './AudioDeviceSelector.vue';
import { roomApi } from '@/utils/roomApi';

const router = useRouter();
const store = useChatRoomStore();

const messageInput = ref('');
const messageInputEl = ref<HTMLInputElement | null>(null);
const chatContainer = ref<HTMLElement | null>(null);

// 用户资料弹窗
const showUserProfile = ref(false);
const viewingUser = ref<any>(null);
const loadingUser = ref(false);

async function openUserProfile(identity: string) {
  const userId = Number(identity.replace('user_', ''));
  if (!userId) return;
  loadingUser.value = true;
  viewingUser.value = null;
  showUserProfile.value = true;
  try {
    viewingUser.value = await roomApi.getUser(userId);
  } catch (e) {
    viewingUser.value = { error: '加载失败' };
  } finally {
    loadingUser.value = false;
  }
}
function openPhoto(url: string) {
  window.open(url, '_blank');
}
const showEmojiPicker = ref(false);
const isSystemMuted = ref(false);
// 房间公告
const roomAnnouncement = ref('');
const showAnnouncementEdit = ref(false);
const editAnnouncement = ref('');
const isRoomOwner = computed(() => store.isOwner);

watch(() => store.currentRoomDescription, (v) => { roomAnnouncement.value = v || ''; }, { immediate: true });

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
// 右键菜单
const contextMenu = ref({ show: false, x: 0, y: 0, member: null as any });

// 用 store 的计算属性
const sortedMessages = computed(() => store.sortedMessages);

onMounted(() => {
  // 未登录跳转
  if (!store.isLoggedIn) {
    router.replace('/main/chatroom');
    return;
  }
  if (!store.isConnected) {
    router.replace('/main/chatroom');
    return;
  }
  // 读取头像
  myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
  // 监听 localStorage 变化（其他页面修改头像时同步）
  window.addEventListener('storage', onStorageChange);
  // 应用关闭时自动退出房间（不删除房间）
  window.addEventListener('beforeunload', onBeforeUnload);
  // 自动聚焦输入框
  nextTick(() => messageInputEl.value?.focus());
});

function onBeforeUnload() {
  // 退出房间（fire and forget，后端也有心跳超时兜底）
  if (store.isConnected && store.currentRoomId) {
    store.leaveRoom().catch(() => {});
  }
}

// 连接成功时刷新头像（确保进入房间时显示最新）
watch(() => store.isConnected, (connected) => {
  if (connected) {
    myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
    nextTick(() => messageInputEl.value?.focus());
  }
});

function onStorageChange(e: StorageEvent) {
  if (e.key === 'chatroom_avatarImage') {
    myAvatarImage.value = e.newValue || '';
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

watch(() => store.messages.length, () => scrollToBottom());

async function sendMessage() {
  if (!messageInput.value.trim()) return;
  try {
    await store.sendMessage(messageInput.value);
    messageInput.value = '';
  } catch (e: any) {
    alert(e.message || '发送失败');
  }
}

async function toggleMic() {
  // 没上麦时不能开麦
  if (store.isMuted && store.mySeatIndex() < 0) {
    alert('请先上麦才能开麦');
    return;
  }
  await store.toggleMute();
}

// 收起为悬浮窗（不断开连接，返回上一页）
function collapseToFloating() {
  router.back();
}

// 表情列表
const emojiList = ['😀','😂','🥰','😎','🤔','😴','😭','😡','👍','👏','🙏','💪','🎉','🔥','❤️','💕','🎵','🎶','🎤','🎸','🎹','🥁','🎧','☕','🍺','🌹','✨','💯','🤣','😊','😍','🤩','😇','🤗','🤭','🤫','🤔','🤐','😏','😒','🙄','😬','🤮','🤧','🥵','🥶','😱','😨','😰','😥','😢','😭','😤','😠','😡','🤬','🤯','😳','🥺','😻','💀','👻','🤖','👽','🎃','😺','🐱','🐶','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🦖','🐙','🦑','🦐','🦀','🐟','🐬','🐳','🦈','🐊','🐅','🦓','🦒','🐘','🦏','🐪','🐫','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🐇','🦁','🐿','🦔','🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐿'];

function insertEmoji(emoji: string) {
  messageInput.value += emoji;
  showEmojiPicker.value = false;
}

// 系统静音（切换系统输出音量静音）
async function toggleSystemMute() {
  try {
    const electronAny = window.electron as any;
    if (electronAny?.setSystemMuted) {
      const result = await electronAny.setSystemMuted(!isSystemMuted.value);
      isSystemMuted.value = result;
    } else {
      isSystemMuted.value = !isSystemMuted.value;
    }
  } catch (e) {
    isSystemMuted.value = !isSystemMuted.value;
  }
}

// 右键管理菜单
function onMemberContextMenu(e: MouseEvent, member: any) {
  if (!store.isOwner || member.isLocal) return; // 只有房主能管理，不能管理自己
  e.preventDefault();
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, member };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

// 麦位
const seatContextMenu = ref({ show: false, x: 0, y: 0, index: -1 });

const fetchedAvatars = new Set<string>();
function memberAvatar(identity: string) {
  // 1. 优先从实时同步的 memberAvatars 取
  if (store.memberAvatars[identity]) return store.memberAvatars[identity];
  // 2. 从 members 数组里的 avatar 字段取（getMembers 时从 participant.metadata 解析）
  const m = store.members.find(x => x.identity === identity);
  if (m?.avatar) return m.avatar;
  // 3. 自己的从 localStorage 取
  if (identity === store.myIdentity) return myAvatarImage.value;
  // 4. 都没有时，懒加载从后端拉取用户资料（只拉一次）
  if (!fetchedAvatars.has(identity)) {
    fetchedAvatars.add(identity);
    const userId = Number(identity.replace('user_', ''));
    if (userId) {
      roomApi.getUser(userId).then((user: any) => {
        if (user?.avatar) {
          store.memberAvatars[identity] = user.avatar;
        }
      }).catch(() => { fetchedAvatars.delete(identity); });
    }
  }
  return '';
}
function isSeatMuted(identity: string) {
  const m = store.members.find(x => x.identity === identity);
  return m ? m.isMuted : true;
}
async function onSeatClick(index: number) {
  const seat = store.seats[index];
  // 有人的麦位（包括自己）→ 查看资料
  if (seat) {
    openUserProfile(seat.identity);
    return;
  }
  const myIdx = store.mySeatIndex();
  try {
    // 已在别的麦位，先下再上（下麦失败不阻断，可能已经下了）
    if (myIdx >= 0 && myIdx !== index) {
      try { await store.leaveSeat(myIdx); } catch {}
    }
    if (myIdx !== index) await store.takeSeat(index);
  } catch (e: any) {
    // 只处理真实错误，不再用 getRoom 当刷新手段（事件驱动+probe兜底）
    if (e?.message?.includes('已有人')) alert('该麦位已被占用');
    else alert(e.message || '操作失败');
  }
}
function onSeatContextMenu(e: MouseEvent, index: number) {
  const seat = store.seats[index];
  if (!seat) return; // 空麦位不弹菜单
  if (!store.isOwner && seat.identity !== store.myIdentity) return; // 非房主不能管理别人
  e.preventDefault();
  seatContextMenu.value = { show: true, x: e.clientX, y: e.clientY, index };
}
function closeSeatMenu() { seatContextMenu.value.show = false; }
async function seatDownMic() {
  const idx = seatContextMenu.value.index;
  if (idx < 0) return;
  const seat = store.seats[idx];
  // 如果是下自己的麦，用 mySeatIndex() 确保 index 正确（防止 seats 不同步导致"该麦位无人"）
  const targetIdx = seat?.identity === store.myIdentity ? store.mySeatIndex() : idx;
  if (targetIdx < 0) { closeSeatMenu(); return; }
  try { await store.leaveSeat(targetIdx); } catch (e: any) { alert(e.message || '下麦失败'); }
  closeSeatMenu();
}
async function seatMute() {
  const idx = seatContextMenu.value.index;
  const seat = store.seats[idx];
  if (!seat) return;
  if (seat.identity === store.myIdentity) {
    // 自己 → 切换麦状态
    await store.toggleMute();
  } else {
    // 别人 → 管理员接口
    const muted = isSeatMuted(seat.identity);
    await store.muteParticipant(seat.identity, !muted);
  }
  closeSeatMenu();
}
async function seatKick() {
  const idx = seatContextMenu.value.index;
  const seat = store.seats[idx];
  if (!seat) return;
  if (!confirm(`确定踢出 ${seat.name}？`)) return;
  await store.kickParticipant(seat.identity);
  // 踢出后自动下麦
  try { await store.leaveSeat(idx); } catch {}
  closeSeatMenu();
}
async function seatBan() {
  const idx = seatContextMenu.value.index;
  const seat = store.seats[idx];
  if (!seat) return;
  const banned = store.isBanned(seat.identity);
  await store.banParticipant(seat.identity, !banned);
  closeSeatMenu();
}

async function adminMuteMember() {
  const m = contextMenu.value.member;
  if (!m) return;
  await store.muteParticipant(m.identity, !m.isMuted);
  closeContextMenu();
}

async function adminBanMember() {
  const m = contextMenu.value.member;
  if (!m) return;
  const banned = store.isBanned(m.identity);
  await store.banParticipant(m.identity, !banned);
  closeContextMenu();
}

async function adminKickMember() {
  const m = contextMenu.value.member;
  if (!m) return;
  if (!confirm(`确定要踢出 ${m.name} 吗？`)) return;
  await store.kickParticipant(m.identity);
  closeContextMenu();
}

async function leaveRoom() {
  await store.leaveRoom();
  router.replace('/main/chatroom');
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <div class="chat-room h-full flex flex-col">
    <!-- 顶部栏 -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
      <div class="flex items-center gap-2">
        <Button
          variant="unstyled"
          size="none"
          class="p-1.5 rounded-md hover:bg-[var(--control-hover-bg)] transition-colors"
          title="收起为悬浮窗"
          @click="collapseToFloating"
        >
          <span class="text-lg">←</span>
        </Button>
        <div>
          <div class="font-bold text-sm">{{ store.currentRoomName }}</div>
          <div class="text-xs opacity-50">{{ store.memberCount }} 人在线</div>
        </div>
      </div>
      <div class="flex items-center gap-1 text-xs opacity-60">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span>语音已连接</span>
      </div>
    </div>

    <!-- 主体：成员列表 + 聊天 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 左侧：房间信息 + 公告 + 成员 -->
      <div class="w-48 border-r border-[var(--border-subtle)] flex flex-col">
        <!-- 房间信息 -->
        <div class="p-3 border-b border-[var(--border-subtle)]">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-10 h-10 rounded-lg overflow-hidden bg-[var(--control-track-bg)] flex items-center justify-center shrink-0">
              <img v-if="store.currentRoomCoverImage" :src="store.currentRoomCoverImage" class="w-full h-full object-cover" />
              <span v-else class="text-lg">🎵</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm truncate">{{ store.currentRoomName }}</div>
              <div class="text-[10px] opacity-40 truncate">房主：{{ store.currentRoomOwnerName || '未知' }}</div>
            </div>
          </div>
        </div>
        <!-- 房间公告 -->
        <div class="border-b border-[var(--border-subtle)] p-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold opacity-50">📢 房间公告</span>
            <button v-if="isRoomOwner" class="text-[10px] opacity-50 hover:opacity-100" @click="openAnnouncementEdit">编辑</button>
          </div>
          <div v-if="roomAnnouncement" class="text-xs opacity-70 leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            {{ roomAnnouncement }}
          </div>
          <div v-else class="text-xs opacity-30 italic">
            {{ isRoomOwner ? '点击编辑设置公告' : '暂无公告' }}
          </div>
        </div>
        <!-- 成员列表 -->
        <div class="px-3 py-2 text-xs font-bold opacity-50 border-b border-[var(--border-subtle)]">
          成员 ({{ store.memberCount }})
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div
            v-for="member in store.members"
            :key="member.identity"
            class="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--control-hover-bg)] transition-colors cursor-context-menu"
            @contextmenu="onMemberContextMenu($event, member)"
          >
            <!-- 头像 -->
            <div class="relative" @click.stop="openUserProfile(member.identity)">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shrink-0"
                :class="[member.isSpeaking ? 'bg-green-500/20 ring-2 ring-green-500' : 'bg-[var(--control-track-bg)]', !member.isLocal ? 'cursor-pointer hover:ring-2 hover:ring-[var(--color-primary)]' : '']"
              >
                <img v-if="memberAvatar(member.identity)" :src="memberAvatar(member.identity)" class="w-full h-full object-cover" />
                <span v-else>{{ member.name.charAt(0) }}</span>
              </div>
              <!-- 麦状态 -->
              <div
                class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                :class="member.isMuted ? 'bg-red-500' : 'bg-green-500'"
              >
                <svg v-if="member.isMuted" viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
                <svg v-else viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              </div>
            </div>
            <!-- 名字 -->
            <div class="flex-1 min-w-0 cursor-pointer" @click.stop="openUserProfile(member.identity)">
              <div class="text-xs font-medium truncate flex items-center gap-1">
                {{ member.name }}
                <span v-if="member.isOwner" class="text-[8px] text-yellow-500">👑</span>
                <span v-if="member.isLocal" class="text-[8px] opacity-50">(我)</span>
                <span v-if="store.isBanned(member.identity)" class="text-[8px] text-red-400 flex items-center gap-0.5">
                  <svg viewBox="0 0 24 24" class="w-2.5 h-2.5" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/><path d="M9.5 9l5 5M14.5 9l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>禁言
                </span>
              </div>
              <div class="text-[10px] opacity-40">
                {{ member.isSpeaking ? '正在说话...' : member.isMuted ? '已闭麦' : '已开麦' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧聊天区 -->
      <div class="flex-1 flex flex-col">
        <!-- 麦位区 -->
        <div class="px-4 py-3 border-b border-[var(--border-subtle)]">
          <div class="flex items-center justify-center gap-4">
            <div
              v-for="(seat, idx) in store.seats"
              :key="idx"
              class="relative flex flex-col items-center cursor-pointer group"
              @click="onSeatClick(idx)"
              @contextmenu.prevent="onSeatContextMenu($event, idx)"
            >
              <!-- 头像圈 -->
              <div
                class="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all"
                :class="[seat ? 'border-[var(--color-primary)]' : 'border-dashed border-[var(--border-subtle)] group-hover:border-[var(--color-primary)]', seat && seat.identity !== store.myIdentity ? 'cursor-pointer' : '']"
              >
                <img v-if="seat && memberAvatar(seat.identity)" :src="memberAvatar(seat.identity)" class="w-full h-full object-cover" />
                <span v-else-if="seat" class="text-lg font-bold">{{ seat.name.charAt(0) }}</span>
                <span v-else class="text-xl opacity-30">+</span>
              </div>
              <!-- 名字 -->
              <div class="text-[10px] mt-1 max-w-[60px] truncate">
                {{ seat ? seat.name : `麦位${idx + 1}` }}
              </div>
              <!-- 麦状态小标 -->
              <div v-if="seat" class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                :class="isSeatMuted(seat.identity) ? 'bg-red-500' : 'bg-green-500'">
                <svg v-if="isSeatMuted(seat.identity)" viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
                <svg v-else viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              </div>
            </div>
          </div>
        </div>
        <!-- 消息列表 -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-3 space-y-2">
          <div
            v-for="msg in sortedMessages"
            :key="msg.id"
            class="text-sm"
            :class="msg.type === 'system' ? 'text-center' : ''"
          >
            <!-- 系统消息 -->
            <div
              v-if="msg.type === 'system'"
              class="inline-block px-3 py-1 rounded-full bg-[var(--control-track-bg)] text-xs opacity-60"
            >
              {{ msg.content }}
            </div>
            <!-- 普通消息 -->
            <div v-else>
              <div class="flex items-baseline gap-2 mb-0.5">
                <span
                  class="text-xs font-bold"
                  :class="msg.senderIdentity === store.myIdentity ? 'text-[var(--color-primary)]' : ''"
                >
                  {{ msg.senderName }}
                </span>
                <span class="text-[10px] opacity-40">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="text-xs opacity-80 pl-1">{{ msg.content }}</div>
            </div>
          </div>

          <div v-if="sortedMessages.length === 0" class="text-center py-12 opacity-40 text-sm">
            暂无消息，说点什么吧
          </div>
        </div>

        <!-- 输入框 -->
        <div class="p-3 border-t border-[var(--border-subtle)] relative">
          <div class="flex gap-2 items-center">
            <input
              ref="messageInputEl"
              v-model="messageInput"
              type="text"
              placeholder="输入消息..."
              class="flex-1 px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-primary)]"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <button
              class="p-1.5 rounded-lg hover:bg-[var(--control-hover-bg)] transition-colors"
              title="表情"
              @click="showEmojiPicker = !showEmojiPicker"
            >
              <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
            </button>
            <button
              class="px-3 py-1 text-xs rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity"
              @click="sendMessage"
            >发送</button>
          </div>
          <!-- 点击空白关闭表情面板的遮罩 -->
          <div v-if="showEmojiPicker" class="fixed inset-0 z-40" @click="showEmojiPicker = false"></div>
          <!-- 表情面板 -->
          <div v-if="showEmojiPicker" class="absolute bottom-full left-3 mb-2 bg-[var(--color-bg)] border border-[var(--border-subtle)] rounded-xl shadow-xl p-3 w-72 z-50">
            <div class="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
              <button
                v-for="emoji in emojiList"
                :key="emoji"
                class="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--control-hover-bg)] rounded transition-colors"
                @click="insertEmoji(emoji)"
              >{{ emoji }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div class="flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--border-subtle)]">
      <!-- 左侧：音频设备选择（含麦克风/喇叭开关） -->
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <AudioDeviceSelector />
      </div>
      <!-- 右侧：退出 -->
      <div class="flex items-center gap-2 shrink-0">
        <button
          class="px-3 py-1 text-xs font-bold rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
          @click="leaveRoom"
        >
          退出房间
        </button>
      </div>
    </div>

    <!-- 右键管理菜单（房主可见） -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="fixed inset-0 z-[9999]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div
          class="absolute bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg shadow-xl py-1 min-w-[140px] text-[var(--text-primary)]"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="px-3 py-1.5 text-xs text-[var(--text-secondary)] border-b border-[var(--border-subtle)] mb-1">
            管理：{{ contextMenu.member?.name }}
          </div>
          <button
            @click="adminMuteMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span class="flex items-center gap-2">
              <svg v-if="contextMenu.member?.isMuted" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              <svg v-else viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
              {{ contextMenu.member?.isMuted ? '打开麦克风' : '关闭麦克风' }}
            </span>
          </button>
          <button
            @click="adminBanMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span class="flex items-center gap-2">
              <svg v-if="store.isBanned(contextMenu.member?.identity)" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
              <svg v-else viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/><path d="M9.5 9l5 5M14.5 9l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
              {{ store.isBanned(contextMenu.member?.identity) ? '解除禁言' : '禁言' }}
            </span>
          </button>
          <button
            @click="adminKickMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-2"
          >
            <span>🚪 踢出房间</span>
          </button>
        </div>
      </div>

      <!-- 麦位右键菜单 -->
      <div v-if="seatContextMenu.show" class="fixed inset-0 z-[9999]" @click="closeSeatMenu" @contextmenu.prevent="closeSeatMenu">
        <div
          class="absolute bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] text-white"
          :style="{ left: seatContextMenu.x + 'px', top: seatContextMenu.y + 'px' }"
          @click.stop
        >
          <div class="px-3 py-1.5 text-xs text-white/50 border-b border-white/10 mb-1">
            麦位 {{ seatContextMenu.index + 1 }}：{{ store.seats[seatContextMenu.index]?.name }}
          </div>
          <button
            @click="seatMute"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span class="flex items-center gap-2">
              <svg v-if="isSeatMuted(store.seats[seatContextMenu.index]?.identity)" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              <svg v-else viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
              {{ isSeatMuted(store.seats[seatContextMenu.index]?.identity) ? '开麦' : '闭麦' }}
            </span>
          </button>
          <button
            v-if="store.seats[seatContextMenu.index]?.identity !== store.myIdentity"
            @click="seatBan"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span class="flex items-center gap-2">
              <svg v-if="store.isBanned(store.seats[seatContextMenu.index]?.identity)" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
              <svg v-else viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/><path d="M9.5 9l5 5M14.5 9l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
              {{ store.isBanned(store.seats[seatContextMenu.index]?.identity) ? '解除禁言' : '禁言' }}
            </span>
          </button>
          <button
            @click="seatDownMic"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span>⬇ 下麦</span>
          </button>
          <button
            v-if="store.seats[seatContextMenu.index]?.identity !== store.myIdentity"
            @click="seatKick"
            class="w-full text-left px-3 py-2 text-sm hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-2"
          >
            <span>🚪 踢出房间</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 公告编辑弹窗 -->
    <Teleport to="body">
      <div v-if="showAnnouncementEdit" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[9998]" @click.self="showAnnouncementEdit = false">
        <div class="bg-[var(--color-bg)] rounded-2xl p-6 w-96 border border-[var(--border-subtle)]">
          <h2 class="text-xl font-bold mb-4">编辑房间公告</h2>
          <textarea
            v-model="editAnnouncement"
            rows="5"
            class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
            placeholder="输入房间公告..."
            maxlength="500"
          />
          <p class="text-xs opacity-40 mt-1 text-right">{{ editAnnouncement.length }}/500</p>
          <div class="flex gap-2 mt-4">
            <Button variant="outline" class="flex-1" @click="showAnnouncementEdit = false">取消</Button>
            <Button class="flex-1" @click="saveAnnouncement">保存</Button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 用户资料弹窗 -->
    <Teleport to="body">
      <div v-if="showUserProfile" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[9998]" @click.self="showUserProfile = false">
        <div class="bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-2xl w-[360px] max-h-[80vh] overflow-y-auto text-[var(--text-primary)]">
          <div class="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
            <span class="font-bold">用户资料</span>
            <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl leading-none" @click="showUserProfile = false">×</button>
          </div>
          <div v-if="loadingUser" class="p-8 text-center text-[var(--text-secondary)]">加载中...</div>
          <div v-else-if="viewingUser?.error" class="p-8 text-center text-red-400">{{ viewingUser.error }}</div>
          <div v-else-if="viewingUser" class="p-4">
            <!-- 头像+昵称 -->
            <div class="flex flex-col items-center mb-4">
              <div class="w-20 h-20 rounded-full overflow-hidden bg-[var(--control-track-bg)] flex items-center justify-center mb-2">
                <img v-if="viewingUser.avatar" :src="viewingUser.avatar" class="w-full h-full object-cover" />
                <span v-else class="text-2xl font-bold">{{ viewingUser.name?.charAt(0) }}</span>
              </div>
              <div class="font-bold text-lg">{{ viewingUser.name }}</div>
              <div class="text-xs text-[var(--text-muted)] mt-0.5">ID：{{ viewingUser.userId ? 999 + viewingUser.userId : '-' }}</div>
            </div>
            <!-- 个性签名 -->
            <div v-if="viewingUser.bio" class="mb-4">
              <div class="text-xs text-[var(--text-muted)] mb-1">个性签名</div>
              <div class="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">{{ viewingUser.bio }}</div>
            </div>
            <!-- 图片墙 -->
            <div v-if="viewingUser.photos?.length" class="mb-2">
              <div class="text-xs text-[var(--text-muted)] mb-2">图片墙</div>
              <div class="grid grid-cols-3 gap-1.5">
                <div
                  v-for="(photo, i) in viewingUser.photos"
                  :key="i"
                  class="aspect-square rounded-lg overflow-hidden bg-[var(--control-track-bg)] cursor-pointer hover:opacity-80 transition-opacity"
                  @click="openPhoto(photo)"
                >
                  <img :src="photo" class="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>