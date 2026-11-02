<script setup lang="ts">
/**
 * ChatRoomTopbar — 语聊房顶部栏
 * 左侧：收起悬浮窗按钮 + 房间名 + 在线人数
 * 中间：连接状态 + 全站公告
 * 右侧：点歌台开关 + 退出房间按钮
 */
import Tooltip from '@/components/ui/Tooltip.vue';

defineProps<{
  roomName: string;
  memberCount: number;
  showSongPanel: boolean;
}>();

const emit = defineEmits<{
  (e: 'collapse'): void;
  (e: 'toggle-song-panel'): void;
  (e: 'leave'): void;
}>();
</script>

<template>
  <div class="cr-topbar">
    <Tooltip content="收起为悬浮窗">
      <template #trigger>
        <button class="cr-icon-btn" aria-label="收起为悬浮窗" @click="emit('collapse')">
          <span>←</span>
        </button>
      </template>
    </Tooltip>
    <div class="cr-title">
      <div class="cr-title-name">{{ roomName }}</div>
      <div class="cr-title-sub">{{ memberCount }} 人在线</div>
    </div>
    <div class="cr-status">
      <span class="cr-status-dot"></span>
      <span>语音已连接</span>
    </div>
    <!-- 点歌台开关 -->
    <Tooltip content="点歌台">
      <template #trigger>
        <button
          class="cr-song-btn"
          :class="{ active: showSongPanel }"
          aria-label="点歌台"
          @click="emit('toggle-song-panel')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span>点歌</span>
        </button>
      </template>
    </Tooltip>
    <Tooltip content="退出房间">
      <template #trigger>
        <button class="cr-exit" aria-label="退出房间" @click="emit('leave')">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>退出</span>
        </button>
      </template>
    </Tooltip>
  </div>
</template>

<style scoped>
.cr-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.cr-icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #cfd0e0;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.18s;
}
.cr-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.cr-title {
  flex: 1;
  min-width: 0;
}
.cr-title-name {
  font-size: 13px;
  font-weight: 700;
}
.cr-title-sub {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 1px;
}
.cr-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  opacity: 0.65;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
}
.cr-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.9);
  animation: cr-pulse 1.6s infinite;
}
@keyframes cr-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.cr-song-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #ddd6fe;
  background: rgba(139, 92, 246, 0.35);
  border: 1px solid rgba(167, 139, 250, 0.4);
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.18s;
}
.cr-song-btn svg {
  width: 12px;
  height: 12px;
}
.cr-song-btn:hover,
.cr-song-btn.active {
  background: #8b5cf6;
  color: #fff;
}
.cr-exit {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #ffd7dd;
  background: rgba(220, 38, 38, 0.55);
  border: 1px solid rgba(255, 120, 140, 0.35);
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.18s;
}
.cr-exit svg {
  width: 12px;
  height: 12px;
}
.cr-exit:hover {
  background: rgba(220, 38, 38, 0.9);
  color: #fff;
  border-color: rgba(255, 150, 165, 0.6);
}
</style>
