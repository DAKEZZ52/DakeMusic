<script setup lang="ts">
/**
 * 本地歌曲信息匹配
 *
 * 左边选一首本地文件，右边搜线上曲目；按时长接近度与名称相似度排序，
 * 选中后把标题/歌手/专辑/封面写回文件标签，并刷新本地音乐库。
 */
import { computed, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Cover from '@/components/ui/Cover.vue';
import { search } from '@/api/search';
import { mapSearchSong } from '@/utils/mappers';
import { extractSearchLists } from '@/views/search/searchHelpers';
import { useLocalMusicStore } from '@/stores/localMusic';
import { useToastStore } from '@/stores/toast';
import type { Song } from '@/models/song';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const localStore = useLocalMusicStore();
const toastStore = useToastStore();

const localFilter = ref('');
const keyword = ref('');
const selectedPath = ref('');
const results = ref<Song[]>([]);
const searching = ref(false);
const applying = ref(false);

const localSongs = computed(() => localStore.allSongs);

const filteredLocal = computed(() => {
  const word = localFilter.value.trim().toLowerCase();
  const list = localSongs.value;
  if (!word) return list.slice(0, 200);
  return list
    .filter((song) =>
      `${song.name} ${song.artist ?? ''} ${song.album ?? ''}`.toLowerCase().includes(word),
    )
    .slice(0, 200);
});

const selected = computed(
  () => localSongs.value.find((song) => (song.audioUrl ?? '') === selectedPath.value) ?? null,
);

const close = () => emit('update:open', false);

const formatDuration = (seconds?: number) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** 候选时长与本地文件的差值（秒），未知时返回 null */
const durationDiff = (candidate: Song) => {
  const localSeconds = Number(selected.value?.duration) || 0;
  const candidateSeconds = Number(candidate.duration) || 0;
  if (!localSeconds || !candidateSeconds) return null;
  return Math.round(candidateSeconds - localSeconds);
};

const diffLabel = (candidate: Song) => {
  const diff = durationDiff(candidate);
  if (diff === null) return '';
  if (Math.abs(diff) <= 1) return '时长一致';
  return diff > 0 ? `长 ${diff}s` : `短 ${Math.abs(diff)}s`;
};

const normalize = (value: string) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

const scoreCandidate = (candidate: Song) => {
  const localName = normalize(selected.value?.name ?? '');
  const candidateName = normalize(candidate.name ?? '');
  let score = 0;
  if (localName && candidateName) {
    if (localName === candidateName) score += 60;
    else if (localName.includes(candidateName) || candidateName.includes(localName)) score += 40;
    else {
      const a = new Set(localName);
      const b = new Set(candidateName);
      let inter = 0;
      for (const ch of a) if (b.has(ch)) inter += 1;
      score += Math.round((inter / Math.max(1, a.size)) * 25);
    }
  }
  const localArtist = normalize(selected.value?.artist ?? '');
  const candidateArtist = normalize(candidate.artist ?? '');
  if (
    localArtist &&
    candidateArtist &&
    (localArtist.includes(candidateArtist) || candidateArtist.includes(localArtist))
  ) {
    score += 25;
  }
  const diff = durationDiff(candidate);
  if (diff !== null && Math.abs(diff) <= 2) score += 30;
  else if (diff !== null && Math.abs(diff) <= 5) score += 12;
  return score;
};

const sortedResults = computed(() =>
  [...results.value].sort((a, b) => scoreCandidate(b) - scoreCandidate(a)),
);

const runSearch = async () => {
  const base = selected.value;
  const query = keyword.value.trim() || (base ? `${base.name} ${base.artist ?? ''}`.trim() : '');
  if (!query) return;
  searching.value = true;
  try {
    const response = await search(query, 'song', 1, 20);
    const lists = extractSearchLists(response);
    results.value = lists.map((item) => mapSearchSong(item)).filter((song) => song.name);
  } catch {
    results.value = [];
    toastStore.warning('搜索失败，请稍后再试');
  } finally {
    searching.value = false;
  }
};

const pickLocal = (song: Song) => {
  selectedPath.value = song.audioUrl ?? '';
  keyword.value = `${song.name} ${song.artist ?? ''}`.trim();
  results.value = [];
  void runSearch();
};

const applyCandidate = async (candidate: Song) => {
  const file = selectedPath.value;
  if (!file || applying.value) return;
  applying.value = true;
  try {
    const result = await window.electron.localMusic.applyMetadata(file, {
      id: candidate.hash || candidate.id || file,
      title: candidate.name,
      artist: candidate.artist ?? '',
      album: candidate.albumName ?? candidate.album ?? '',
      duration: Math.round(Number(candidate.duration) || 0),
      coverUrl: candidate.coverUrl || undefined,
      hash: candidate.hash,
      mixSongId: candidate.mixSongId,
    });
    if (!result?.ok) {
      toastStore.warning(result?.error || '写入失败');
      return;
    }
    await localStore.loadLibraries();
    toastStore.success(`已更新：${candidate.name}`);
    close();
  } catch (error) {
    toastStore.warning(error instanceof Error ? error.message : '写入失败');
  } finally {
    applying.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localFilter.value = '';
    keyword.value = '';
    results.value = [];
    selectedPath.value = '';
  },
);
</script>

<template>
  <Dialog
    :open="props.open"
    content-class="local-match-dialog"
    show-close
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #title>匹配歌曲信息</template>

    <div class="match">
      <div class="match-pane">
        <input v-model="localFilter" class="match-input" type="search" placeholder="筛选本地歌曲" />
        <div class="match-list">
          <button
            v-for="song in filteredLocal"
            :key="song.id"
            type="button"
            class="match-row"
            :class="{ 'is-active': song.audioUrl === selectedPath }"
            @click="pickLocal(song)"
          >
            <span class="match-row-title">{{ song.name }}</span>
            <span class="match-row-sub">{{ song.artist }}</span>
          </button>
          <p v-if="!filteredLocal.length" class="match-empty">没有本地歌曲</p>
        </div>
      </div>

      <div class="match-pane match-pane-right">
        <div class="match-search">
          <input
            v-model="keyword"
            class="match-input"
            type="search"
            placeholder="搜索线上曲目"
            @keydown.enter="runSearch"
          />
          <Button
            variant="primary"
            size="sm"
            :disabled="searching || (!selected && !keyword.trim())"
            @click="runSearch"
          >
            {{ searching ? '搜索中' : '搜索' }}
          </Button>
        </div>

        <div class="match-list">
          <button
            v-for="candidate in sortedResults"
            :key="candidate.id"
            type="button"
            class="match-row match-candidate"
            :disabled="applying"
            @click="applyCandidate(candidate)"
          >
            <Cover :url="candidate.coverUrl" :size="64" class="match-cover" />
            <span class="match-row-main">
              <span class="match-row-title">{{ candidate.name }}</span>
              <span class="match-row-sub">{{ candidate.artist }}</span>
              <span v-if="candidate.albumName" class="match-row-sub">{{
                candidate.albumName
              }}</span>
            </span>
            <span class="match-row-right">
              <span class="match-duration">{{ formatDuration(candidate.duration) }}</span>
              <span
                class="match-diff"
                :class="{ 'is-close': Math.abs(durationDiff(candidate) ?? 99) <= 2 }"
              >
                {{ diffLabel(candidate) }}
              </span>
            </span>
          </button>
          <p v-if="selected && !sortedResults.length && !searching" class="match-empty">
            左侧选一首歌后会自动搜索，也可以自己改关键词
          </p>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
:global(.local-match-dialog) {
  width: min(820px, calc(100vw - 48px));
}

.match {
  display: flex;
  gap: 16px;
  min-height: 420px;
}

.match-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 260px;
  min-width: 0;
}

.match-pane-right {
  flex: 1;
}

.match-input {
  width: 100%;
  padding: 7px 10px;
  border-radius: 9px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--text-main) 4%, transparent);
  color: var(--text-main);
  font: inherit;
  font-size: 12px;
  outline: none;
}

.match-search {
  display: flex;
  gap: 8px;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: 380px;
  padding-right: 4px;
}

.match-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.match-row:hover {
  background: color-mix(in srgb, var(--text-main) 6%, transparent);
}

.match-row.is-active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.match-candidate {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.match-cover {
  width: 36px;
  height: 36px;
  border-radius: 7px;
  overflow: hidden;
  flex-shrink: 0;
}

.match-row-main {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-width: 0;
}

.match-row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.match-row-title {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.match-row-sub {
  font-size: 11px;
  line-height: 15px;
  color: var(--color-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.match-duration {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.match-diff {
  font-size: 10px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.match-diff.is-close {
  color: var(--color-success, #16a34a);
  opacity: 1;
}

.match-empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}
</style>
