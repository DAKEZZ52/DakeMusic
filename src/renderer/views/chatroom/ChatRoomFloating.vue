<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';

const store = useChatRoomStore();
const router = useRouter();
const route = useRoute();

// 位置
const pos = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

// 是否显示：已连接 且 不在房间内页
const visible = computed(() => {
  return store.isConnected && route.path !== '/main/chatroom/room';
});

// 初始化位置（右下角）
onMounted(() => {
  pos.value = {
    x: window.innerWidth - 280,
    y: window.innerHeight - 140,
  };
});

function onMouseDown(e: MouseEvent) {
  dragging.value = true;
  dragOffset.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!dragging.value) return;
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragOffset.value.x)),
    y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.value.y)),
  };
}

function onMouseUp() {
  dragging.value = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});

// 展开回房间
function expand() {
  router.push('/main/chatroom/room');
}

// 真正退出房间
async function leave() {
  if (!confirm('确定退出房间？')) return;
  await store.leaveRoom();
}

// 切换麦
async function toggleMic() {
  await store.toggleMute();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed z-[9999] select-none"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    >
      <div
        class="w-[260px] bg-[#1e1e2e] border border-[#313244] rounded-xl shadow-2xl overflow-hidden text-[#cdd6f4]"
      >
        <!-- 顶部拖动条 -->
        <div
          class="flex items-center justify-between px-3 py-2 bg-[#313244] cursor-move"
          @mousedown="onMouseDown"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
            <span class="text-xs font-bold truncate">{{ store.currentRoomName || '聊天房' }}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <!-- 麦开关 -->
            <button
              class="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--control-hover-bg)]"
              :class="store.isMicEnabled ? 'text-[var(--color-primary)]' : 'text-red-500'"
              :title="store.isMicEnabled ? '闭麦' : '开麦'"
              @click.stop="toggleMic"
            >
              <svg v-if="store.isMicEnabled" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="2" y1="2" x2="22" y2="22"/>
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
                <path d="M5 10v2a7 7 0 0 0 12 5"/>
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </button>
            <!-- 展开（回房间） -->
            <button
              class="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--control-hover-bg)] text-[var(--color-primary)]"
              title="回到房间"
              @click.stop="expand"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/>
              </svg>
            </button>
            <!-- 关闭（退出房间） -->
            <button
              class="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-red-500/20 text-red-500"
              title="退出房间"
              @click.stop="leave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <!-- 成员信息 -->
        <div class="px-3 py-2 flex items-center justify-between">
          <span class="text-xs opacity-60">{{ store.memberCount }} 人在线</span>
          <span class="text-[10px] opacity-40">{{ store.isMicEnabled ? '已开麦' : '已闭麦' }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
