/**
 * DakeMusic 语聊房 - 违禁词
 * 描述：违禁词列表加载、文本过滤、增删与房间广播。
 */
import { ref } from 'vue';
import { roomApi } from '@/utils/roomApi';
import { logger } from '@/utils/logger';

export function useBadWords(ctx: { getLKRoom: () => Promise<any> }) {
  const { getLKRoom } = ctx;

  const badWords = ref<string[]>([]);
  const showBadWordsModal = ref(false);
  const newBadWord = ref('');
  async function loadBadWords() {
    try {
      const data = await roomApi.getBadWords();
      badWords.value = data?.words || [];
    } catch (e) {
      logger.warn('ChatRoom', '加载违禁词失败', e);
    }
  }
  function filterBadWords(text: string): string {
    if (!badWords.value.length) return text;
    let out = text;
    for (const w of badWords.value) {
      if (!w) continue;
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, '*'.repeat(w.length));
    }
    return out;
  }
  async function openBadWords() {
    showBadWordsModal.value = true;
    await loadBadWords();
  }
  async function broadcastBadWordsRefresh() {
    try {
      const lkRoom = await getLKRoom();
      if (!lkRoom?.localParticipant) return;
      const payload = JSON.stringify({ kind: 'dakemusic-badwords-refresh', time: Date.now() });
      await lkRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
        reliable: true,
      });
    } catch (e) {
      logger.debug('ChatRoom', '广播违禁词刷新失败', e);
    }
  }
  async function addBadWordLocal() {
    const w = newBadWord.value.trim();
    if (!w) return;
    try {
      await roomApi.addBadWord(w);
      newBadWord.value = '';
      await loadBadWords();
      broadcastBadWordsRefresh();
    } catch (e) {
      logger.warn('ChatRoom', '添加违禁词失败', e);
    }
  }
  async function delBadWordLocal(w: string) {
    try {
      await roomApi.deleteBadWord(w);
      await loadBadWords();
      broadcastBadWordsRefresh();
    } catch (e) {
      logger.warn('ChatRoom', '删除违禁词失败', e);
    }
  }

  return {
    badWords,
    showBadWordsModal,
    newBadWord,
    loadBadWords,
    filterBadWords,
    openBadWords,
    broadcastBadWordsRefresh,
    addBadWordLocal,
    delBadWordLocal,
  };
}
