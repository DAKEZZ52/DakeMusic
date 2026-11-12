<script setup lang="ts">
/**
 * LyriseMusic 语聊房 - 输入栏
 * 描述：文字输入、清屏、发送图片、表情面板。
 */
import { ref } from 'vue';
import Tooltip from '@/components/ui/Tooltip.vue';

const model = defineModel<string>({ default: '' });

defineProps<{
  hasAnyMessage: boolean;
  sendingImage: boolean;
  emojiList: string[];
}>();

const emit = defineEmits<{
  (e: 'send'): void;
  (e: 'clear'): void;
  (e: 'image-selected', event: Event): void;
  (e: 'insert-emoji', emoji: string): void;
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const fileEl = ref<HTMLInputElement | null>(null);
const showEmojiPicker = ref(false);

const focus = () => inputEl.value?.focus();
defineExpose({ focus });
</script>

<template>
  <div class="cr-input-wrap">
    <Tooltip content="清屏（清空本地聊天显示）">
      <template #trigger>
        <button
          class="cr-clear-btn"
          :class="{ 'is-disabled': !hasAnyMessage }"
          aria-label="清屏（清空本地聊天显示）"
          @click="emit('clear')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </template>
    </Tooltip>
    <input
      ref="inputEl"
      v-model="model"
      type="text"
      placeholder="来点虎狼之词..."
      class="cr-input"
      @keydown.enter.exact.prevent="emit('send')"
    />
    <Tooltip content="发送图片">
      <template #trigger>
        <button
          class="cr-emoji-btn"
          aria-label="发送图片"
          :disabled="sendingImage"
          @click="fileEl?.click()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
      </template>
    </Tooltip>
    <input
      ref="fileEl"
      type="file"
      accept="image/*"
      class="hidden"
      @change="emit('image-selected', $event)"
    />
    <Tooltip content="表情">
      <template #trigger>
        <button class="cr-emoji-btn" aria-label="表情" @click="showEmojiPicker = !showEmojiPicker">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
            />
          </svg>
        </button>
      </template>
    </Tooltip>
    <button class="cr-send" @click="emit('send')">发送</button>
    <div v-if="showEmojiPicker" class="cr-emoji-mask" @click="showEmojiPicker = false"></div>
    <div v-if="showEmojiPicker" class="cr-emoji-panel">
      <button
        v-for="emoji in emojiList"
        :key="emoji"
        class="cr-emoji-item"
        @click="emit('insert-emoji', emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./chatInputBar.css"></style>
