/**
 * LyriseMusic 语聊房 - 聊天消息
 * 描述：消息展示与本地提示、成员进出追踪、发送文字/图片（本地压缩）。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { logger } from '@/utils/logger';

export interface RoomChatContext {
  store: any;
  /** 违禁词过滤（来自 useBadWords） */
  filterBadWords: (text: string) => string;
}

export function useRoomChatMessages(ctx: RoomChatContext) {
  const { store, filterBadWords } = ctx;

  const messageInput = ref('');

  const sortedMessages = computed(() => store.sortedMessages);

  // ===== 本地提示（进房/他人进出，只显示在自己屏幕，不发到房间）=====
  // 提示钉在聊天区顶部：不参与消息排序、不追加到末尾、不触发自动下滑
  const localNotices = ref<Array<{ id: string; type: string; content: string }>>([]);
  let noticeSeq = 0;
  let noticeTimer: any = null;
  const NOTICE_TTL = 5000; // 单条提示停留时长（毫秒）

  function pushNotice(content: string) {
    // 只保留最新一条，避免消息区被提示堆满
    localNotices.value = [{ id: `local_${++noticeSeq}`, type: 'system', content }];
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      localNotices.value = [];
      noticeTimer = null;
    }, NOTICE_TTL);
  }
  function clearNoticeTimer() {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  }

  // 聊天区只渲染真实消息；进出提示单独钉在顶部
  const displayMessages = computed(() => [...(sortedMessages.value || [])]);
  const hasAnyMessage = computed(
    () => displayMessages.value.length > 0 || localNotices.value.length > 0,
  );

  // ===== 清屏：只清本地显示，不影响其他人 =====
  function clearScreen() {
    if (!hasAnyMessage.value) return;
    try {
      const list: any = (store as any).messages;
      if (Array.isArray(list)) list.splice(0, list.length);
    } catch (e) {
      logger.debug('ChatRoom', '清空本地消息失败', e);
    }
    clearNoticeTimer();
    localNotices.value = [];
  }

  // ===== 成员进出监听（用 identity 追踪，同名也不会重复）=====
  const STABLE_MS = 1200; // 成员名单稳定多久才建基线
  const GRACE_MS = 3000; // 进房宽限期：这期间到达的人视为「本来就在」

  let memberBaselineReady = false; // 基线是否已建立
  const knownMembers = new Map<string, string>(); // identity -> name
  const recentNotice = new Map<string, number>(); // 事件去重：key -> 时间戳
  let baselineTimer: any = null; // 稳定防抖计时器
  let graceUntil = 0; // 宽限期截止时刻
  let trackedRoomKey = ''; // 当前追踪的房间标识

  function noticeOnce(key: string, content: string) {
    const now = Date.now();
    const last = recentNotice.get(key) || 0;
    if (now - last < 5000) return; // 5 秒内同一事件只提示一次
    recentNotice.set(key, now);
    pushNotice(content);
  }

  // 换房间 / 重连：彻底重置追踪状态，防止把上一个房间的人串进来
  function resetMemberTracking(roomKey: string) {
    if (baselineTimer) {
      clearTimeout(baselineTimer);
      baselineTimer = null;
    }
    memberBaselineReady = false;
    knownMembers.clear();
    recentNotice.clear();
    trackedRoomKey = roomKey;
    graceUntil = Date.now() + GRACE_MS;
  }

  function snapshotMembers(arr: any[]) {
    const cur = new Map<string, string>();
    arr.forEach((m: any) => {
      const id = m?.identity || m?.sid || m?.name;
      if (id) cur.set(String(id), m?.name || m?.identity || '未知用户');
    });
    return cur;
  }

  // 房间切换（或断线重连）时重置 —— 这是「串房间」的根因
  watch(
    () => `${store.currentRoomId || ''}|${store.isConnected}`,
    (key) => {
      if (key === trackedRoomKey) return;
      resetMemberTracking(key);
      clearNoticeTimer();
      localNotices.value = []; // 清掉上一个房间残留的进出提示
    },
  );

  watch(
    () => store.members,
    (list: any) => {
      const arr = Array.isArray(list) ? list : [];
      const cur = snapshotMembers(arr);

      // 基线未建立：成员是异步陆续到达的，等名单稳定后再锁定基线
      if (!memberBaselineReady) {
        if (baselineTimer) clearTimeout(baselineTimer);
        baselineTimer = setTimeout(() => {
          baselineTimer = null;
          knownMembers.clear();
          snapshotMembers(Array.isArray(store.members) ? store.members : []).forEach((v, k) =>
            knownMembers.set(k, v),
          );
          memberBaselineReady = true;
        }, STABLE_MS);
        return;
      }

      const inGrace = Date.now() < graceUntil; // 宽限期内不提示任何人

      // 新来的
      cur.forEach((name, id) => {
        if (!knownMembers.has(id)) {
          if (inGrace) {
            knownMembers.set(id, name);
            return;
          } // 视为本来就在
          noticeOnce(`in_${id}`, `${name} 进入房间`);
        }
      });
      // 走了的
      knownMembers.forEach((name, id) => {
        if (!cur.has(id)) {
          if (inGrace) {
            knownMembers.delete(id);
            return;
          } // 宽限期内消失也不提示
          noticeOnce(`out_${id}`, `${name} 离开了房间`);
          recentNotice.delete(`in_${id}`); // 清掉进入记录，下次进来还能提示
        }
      });

      knownMembers.clear();
      cur.forEach((v, k) => knownMembers.set(k, v));
    },
    { deep: false },
  );

  async function sendMessage() {
    if (!messageInput.value.trim()) return;
    try {
      const filtered = filterBadWords(messageInput.value);
      await store.sendMessage(filtered);
      messageInput.value = '';
    } catch (e: any) {
      alert(e.message || '发送失败');
    }
  }

  // LyriseMusic: 发送图片到公屏（本地压缩成小图，base64 随消息广播，无需上传接口）
  const sendingImage = ref(false);

  /** 压缩图片为 base64，逐级降尺寸/质量，直到 JSON 体积在 LiveKit 消息限制内（<13KB） */
  async function compressToBase64(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 800;
    const steps: Array<[number, number]> = [
      [600, 0.55],
      [450, 0.5],
      [360, 0.45],
      [280, 0.4],
    ];
    let last = '';
    for (const [maxSide, q] of steps) {
      let w = nw,
        h = nh;
      if (w > maxSide || h > maxSide) {
        const r = Math.min(maxSide / w, maxSide / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, w, h);
      last = canvas.toDataURL('image/jpeg', q);
      if (last.length < 13000) return last;
    }
    return last;
  }

  async function onImageSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      pushNotice('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      pushNotice('图片不能超过 5MB');
      return;
    }
    sendingImage.value = true;
    try {
      const dataUrl = await compressToBase64(file);
      await store.sendMessage(dataUrl, 'image');
    } catch {
      pushNotice('图片发送失败，请重试');
    } finally {
      sendingImage.value = false;
    }
  }

  // 卸载时清掉计时器，避免离开房间后还在跑
  onUnmounted(() => {
    if (baselineTimer) {
      clearTimeout(baselineTimer);
      baselineTimer = null;
    }
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  });

  return {
    messageInput,
    localNotices,
    displayMessages,
    hasAnyMessage,
    clearScreen,
    resetMemberTracking,
    clearNoticeTimer,
    pushNotice,
    sendMessage,
    sendingImage,
    onImageSelected,
  };
}
