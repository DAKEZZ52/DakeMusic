<!--
  DakeMusic 房间点歌台
  作者：知之Dake
  文件：SongRequestPanel.vue
  描述：房间内搜索点歌、队列展示、DJ切歌/删歌
  版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
-->
<template>
  <div class="srp-root">
    <!-- 当前播放 -->
    <div class="srp-current">
      <div class="srp-current-label">正在播放</div>
      <div v-if="currentTrack" class="srp-current-song">
        <img v-if="currentTrack.cover" :src="currentTrack.cover" class="srp-cover" />
        <div class="srp-current-info">
          <div class="srp-current-title">{{ currentTrack.title || '未知歌曲' }}</div>
          <div class="srp-current-artist">
            {{ currentTrack.artist }} · 点：{{ currentTrack.requestedByName }}
          </div>
        </div>
        <Tooltip v-if="isDJ" content="切下一首">
          <template #trigger>
            <button class="srp-next-btn" @click="onNext">切歌</button>
          </template>
        </Tooltip>
      </div>
      <div v-else class="srp-current-empty">
        <span class="srp-current-empty-text">暂无播放，点一首歌开始吧</span>
        <Tooltip v-if="isDJ && queue.length" content="播放队列第一首">
          <template #trigger>
            <button class="srp-next-btn" @click="onNext">立即播放</button>
          </template>
        </Tooltip>
      </div>
    </div>

    <!-- 搜索点歌 -->
    <div class="srp-search">
      <input
        v-model="keyword"
        class="srp-search-input"
        placeholder="搜索歌曲名，回车点歌"
        @keyup.enter="doSearch"
      />
      <button class="srp-search-btn" @click="doSearch">搜索</button>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResults.length" class="srp-results">
      <div class="srp-sub">搜索结果（点「点歌」加入队列）</div>
      <div v-for="(s, i) in searchResults" :key="s.id || i" class="srp-item">
        <div class="srp-item-info">
          <div class="srp-item-title">{{ s.name || s.title }}</div>
          <div class="srp-item-sub">{{ s.artist }}</div>
        </div>
        <button
          class="srp-add-btn"
          :class="{ 'is-added': isAdded(s, i) }"
          :disabled="isPending(s, i)"
          @click="onRequest(s, i)"
        >
          {{ isPending(s, i) ? '点歌中…' : isAdded(s, i) ? '已点' : '点歌' }}
        </button>
      </div>
    </div>

    <!-- 队列 -->
    <div class="srp-queue">
      <div class="srp-sub">待播队列（{{ queue.length }}）</div>
      <div v-if="!queue.length" class="srp-queue-empty">队列为空</div>
      <div v-for="(s, i) in queue" :key="s.id" class="srp-item srp-queue-item">
        <div class="srp-item-info">
          <div class="srp-item-title">{{ i + 1 }}. {{ s.title }}</div>
          <div class="srp-item-sub">{{ s.artist }} · 点：{{ s.requestedByName }}</div>
        </div>
        <button v-if="canRemove(s)" class="srp-del-btn" @click="onRemove(i)">删</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DakeMusic 房间点歌台逻辑
 * 作者：知之Dake
 * 文件：SongRequestPanel.vue
 * 描述：搜索结果统一用 mapSearchSong 规整为标准 Song，再点歌/缓存/播放
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { ref, computed, toRaw, onBeforeUnmount } from 'vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useToastStore } from '@/stores/toast';
import { search } from '@/api/search';
import { extractSearchLists } from '@/views/search/searchHelpers';
import { mapSearchSong } from '@/utils/mappers';
import type { Song } from '@/models/song';

const store = useChatRoomStore();
const toast = useToastStore();

const keyword = ref('');
const searchResults = ref<Song[]>([]);
// 每首歌的“点歌中 / 已点”状态，给用户即时反馈，避免请求成功但队列在面板底部看不见
const pendingKeys = ref<string[]>([]);
const addedKeys = ref<string[]>([]);
const addedTimers = new Map<string, number>();

const queue = computed(() => store.musicQueue);
const currentTrack = computed(() => store.currentTrack);
// 房主或超管视为 DJ（麦上人切歌由后端放行，前端不拦）
const isDJ = computed(() => store.isOwner || store.isRootSuper);

function songKey(s: Song, i: number): string {
  return String(s.id || `index-${i}`);
}

function isPending(s: Song, i: number): boolean {
  return pendingKeys.value.includes(songKey(s, i));
}

function isAdded(s: Song, i: number): boolean {
  return addedKeys.value.includes(songKey(s, i));
}

function flashAdded(key: string) {
  if (!addedKeys.value.includes(key)) addedKeys.value = [...addedKeys.value, key];
  const oldTimer = addedTimers.get(key);
  if (oldTimer) window.clearTimeout(oldTimer);
  addedTimers.set(
    key,
    window.setTimeout(() => {
      addedKeys.value = addedKeys.value.filter((item) => item !== key);
      addedTimers.delete(key);
    }, 1800),
  );
}

onBeforeUnmount(() => {
  for (const timer of addedTimers.values()) window.clearTimeout(timer);
  addedTimers.clear();
});

function canRemove(s: any): boolean {
  // DJ 可删任意；本人可删自己点的
  if (isDJ.value) return true;
  // 本人点的：比较 requestedByName（前端无 userId，按昵称近似判断）
  return s.requestedByName === store.myName;
}

async function doSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  try {
    const res: any = await search(kw, 'song', 1, 20);
    // DakeMusic: 用 mapSearchSong 把各音源原始数据统一规整为标准 Song
    const rawList = extractSearchLists(res);
    searchResults.value = rawList.map((item: any) => mapSearchSong(item));
  } catch (e: any) {
    console.warn('[点歌台] 搜索失败:', e?.message || e);
    searchResults.value = [];
    toast.warning('搜索失败，请稍后重试');
  }
}

async function onRequest(s: Song, i: number) {
  const key = songKey(s, i);
  if (pendingKeys.value.includes(key)) return;
  const title = (s.name || s.title || '').trim();
  const songId = s.id;
  if (!title) {
    toast.warning('这首歌信息不全（缺少歌名），无法点歌');
    return;
  }
  if (!songId) {
    toast.warning('这首歌信息不全（缺少ID），无法点歌');
    return;
  }
  pendingKeys.value = [...pendingKeys.value, key];
  try {
    const r: any = await store.requestSong({
      songId,
      title,
      artist: s.artist || '',
      cover: s.coverUrl || s.cover || '',
      url: s.audioUrl || '',
      duration: s.duration || 0, // 标准 Song 的 duration 已是秒
      songData: s, // 完整标准 Song，供房间所有人直接播放
    });
    // DakeMusic: 缓存标准 Song 对象（取原始对象），切歌时用来真实播放
    store.cacheSong(songId, toRaw(s));
    flashAdded(key);
    // 房间空闲时服务端会自动开播这首，反馈要区分“开播”与“排队”，否则用户会以为还在等
    if (r?.track) toast.success(`已开始播放：${title}`);
    else toast.success(`已加入队列：${title}`);
  } catch (e: any) {
    console.warn('[点歌台] 点歌失败:', e?.message || e);
    toast.warning(`点歌失败：${e?.message || '请稍后重试'}`, 4200);
  } finally {
    pendingKeys.value = pendingKeys.value.filter((item) => item !== key);
  }
}

async function onNext() {
  try {
    await store.nextSong();
    toast.success('已切到下一首');
  } catch (e: any) {
    toast.warning(`切歌失败：${e?.message || '请稍后重试'}`);
  }
}

async function onRemove(i: number) {
  try {
    await store.removeSong(i);
    toast.success('已从队列移除');
  } catch (e: any) {
    toast.warning(`删除失败：${e?.message || '请稍后重试'}`);
  }
}
</script>

<style scoped>
.srp-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  font-size: 13px;
  color: #e5e7eb;
}
.srp-current {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 10px;
}
.srp-current-label {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 6px;
}
.srp-current-song {
  display: flex;
  align-items: center;
  gap: 8px;
}
.srp-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
}
.srp-current-info {
  flex: 1;
  min-width: 0;
}
.srp-current-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srp-current-artist {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}
.srp-next-btn {
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
}
.srp-next-btn:hover {
  background: #7c3aed;
}
.srp-current-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}
.srp-current-empty-text {
  min-width: 0;
}
.srp-search {
  display: flex;
  gap: 6px;
}
.srp-search-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 7px 10px;
  color: #fff;
  outline: none;
}
.srp-search-input:focus {
  border-color: #8b5cf6;
}
.srp-search-btn {
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0 14px;
  cursor: pointer;
}
.srp-sub {
  font-size: 11px;
  color: #9ca3af;
  margin: 4px 0 6px;
}
.srp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 4px;
}
.srp-item-info {
  flex: 1;
  min-width: 0;
}
.srp-item-title {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srp-item-sub {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 1px;
}
.srp-add-btn {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
  font-size: 11px;
}
.srp-add-btn:hover {
  background: #8b5cf6;
  color: #fff;
}
.srp-add-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}
.srp-add-btn.is-added {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(74, 222, 128, 0.45);
  color: #86efac;
}
.srp-del-btn {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11px;
}
.srp-del-btn:hover {
  background: #ef4444;
  color: #fff;
}
.srp-queue-empty {
  color: #6b7280;
  font-size: 12px;
  padding: 4px 0;
}
</style>
