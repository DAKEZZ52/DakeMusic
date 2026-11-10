<script setup lang="ts">
/**
 * DakeMusic 语聊房 - 聊天消息区
 * 描述：公屏消息列表、进出房间提示、空态骨架屏与自动滚动到底。
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import type { ChatMessageLike } from '../types';

const props = defineProps<{
  messages: ChatMessageLike[];
  notices: Array<{ id: string; content: string }>;
  hasAnyMessage: boolean;
  myIdentity?: string;
  memberAvatar: (identity?: string) => string;
  formatTime: (timestamp: number) => string;
}>();

const emit = defineEmits<{
  (e: 'open-profile', identity?: string): void;
  (e: 'preview-photo', url: string): void;
}>();

const scroller = ref<HTMLElement | null>(null);

/** 滚到最新一条 */
const scrollToBottom = async () => {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
};

watch(
  () => props.messages.length,
  () => void scrollToBottom(),
);
onMounted(() => void scrollToBottom());

defineExpose({ scrollToBottom });
</script>

<template>
  <div ref="scroller" class="cr-scroll cr-chat-scroll">
    <!-- 进出房间提示：钉在聊天区顶部，不参与排序也不滚动 -->
    <div v-if="notices.length" class="cr-top-notice">
      <span class="cr-system">{{ notices[notices.length - 1].content }}</span>
    </div>
    <template v-if="hasAnyMessage">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="cr-row"
        :class="
          msg.type === 'system' ? 'center' : msg.senderIdentity === myIdentity ? 'mine' : 'other'
        "
      >
        <div v-if="msg.type === 'system'" class="cr-system">{{ msg.content }}</div>
        <div v-else class="cr-msg">
          <!-- 发送者头像：点击看资料 -->
          <div
            class="cr-msg-av"
            :aria-label="msg.senderName"
            @click="emit('open-profile', msg.senderIdentity)"
          >
            <img v-if="memberAvatar(msg.senderIdentity)" :src="memberAvatar(msg.senderIdentity)" />
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
              <span class="cr-msg-name" @click="emit('open-profile', msg.senderIdentity)">{{
                msg.senderName
              }}</span>
              <span class="cr-msg-time">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div v-if="msg.type === 'image'" class="cr-bubble cr-bubble-img">
              <img :src="msg.content" @click="emit('preview-photo', msg.content)" />
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
</template>

<style scoped src="./chatMessageList.css"></style>
