<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
const myAvatarImage = ref('');
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import Button from '@/components/ui/Button.vue';
import AudioDeviceSelector from './AudioDeviceSelector.vue';

const router = useRouter();
const store = useChatRoomStore();

const messageInput = ref('');
const chatContainer = ref<HTMLElement | null>(null);
// 右键菜单
const contextMenu = ref({ show: false, x: 0, y: 0, member: null as any });

// 用 store 的计算属性
const sortedMessages = computed(() => store.sortedMessages);

onMounted(() => {
  if (!store.isConnected) {
    router.replace('/main/chatroom');
  }
  // 读取头像
  myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
  // 监听 localStorage 变化（其他页面修改头像时同步）
  window.addEventListener('storage', onStorageChange);
});

// 连接成功时刷新头像（确保进入房间时显示最新）
watch(() => store.isConnected, (connected) => {
  if (connected) {
    myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
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
  await store.toggleMute();
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
          @click="leaveRoom"
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
      <!-- 左侧成员列表 -->
      <div class="w-48 border-r border-[var(--border-subtle)] flex flex-col">
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
            <div class="relative">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shrink-0"
                :class="member.isSpeaking ? 'bg-green-500/20 ring-2 ring-green-500' : 'bg-[var(--control-track-bg)]'"
              >
                <img v-if="member.isLocal && myAvatarImage" :src="myAvatarImage" class="w-full h-full object-cover" />
                <span v-else>{{ member.name.charAt(0) }}</span>
              </div>
              <!-- 麦状态 -->
              <div
                class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
                :class="member.isMuted ? 'bg-red-500' : 'bg-green-500'"
              >
                {{ member.isMuted ? '🔇' : '🎤' }}
              </div>
            </div>
            <!-- 名字 -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium truncate flex items-center gap-1">
                {{ member.name }}
                <span v-if="member.isOwner" class="text-[8px] text-yellow-500">👑</span>
                <span v-if="member.isLocal" class="text-[8px] opacity-50">(我)</span>
                <span v-if="store.isBanned(member.identity)" class="text-[8px] text-red-400">🔇禁言</span>
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
        <div class="p-3 border-t border-[var(--border-subtle)]">
          <div class="flex gap-2">
            <input
              v-model="messageInput"
              type="text"
              placeholder="输入消息..."
              class="flex-1 px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-primary)]"
              @keyup.enter="sendMessage"
            />
            <Button class="px-4 py-2 text-sm" @click="sendMessage">发送</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div class="flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--border-subtle)]">
      <!-- 左侧：音频设备选择 -->
      <div class="flex-1 min-w-0">
        <AudioDeviceSelector />
      </div>
      <!-- 右侧：闭麦 + 退出 -->
      <div class="flex items-center gap-2 shrink-0">
        <Button
          :variant="store.isMicEnabled ? 'primary' : 'secondary'"
          class="px-4 py-1.5 text-xs font-bold rounded-full"
          @click="toggleMic"
        >
          {{ store.isMicEnabled ? '🎤 开麦' : '🔇 闭麦' }}
        </Button>
        <Button
          variant="danger"
          class="px-4 py-1.5 text-xs font-bold rounded-full"
          @click="leaveRoom"
        >
          退出房间
        </Button>
      </div>
    </div>

    <!-- 右键管理菜单（房主可见） -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="fixed inset-0 z-[9999]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div
          class="absolute bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] text-white"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="px-3 py-1.5 text-xs text-white/50 border-b border-white/10 mb-1">
            管理：{{ contextMenu.member?.name }}
          </div>
          <button
            @click="adminMuteMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span>{{ contextMenu.member?.isMuted ? '🎤 打开麦克风' : '🔇 关闭麦克风' }}</span>
          </button>
          <button
            @click="adminBanMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span>{{ store.isBanned(contextMenu.member?.identity) ? '💬 解除禁言' : '🚫 禁言' }}</span>
          </button>
          <button
            @click="adminKickMember"
            class="w-full text-left px-3 py-2 text-sm hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-2"
          >
            <span>🚪 踢出房间</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>