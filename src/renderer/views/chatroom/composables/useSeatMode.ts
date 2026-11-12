/**
 * LyriseMusic 语聊房 - 座位模式与指令来源校验
 * 描述：对唱/语聊模式切换与同步，LiveKit 指令发送者的身份权限校验。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { roomApi } from '@/utils/roomApi';

export interface SeatModeContext {
  store: any;
  getLKRoom: () => Promise<any>;
  /** 主麦信息（惰性取值，useSeatManager 可能在后面才初始化） */
  getMainSeat: () => any;
}

export function useSeatMode(ctx: SeatModeContext) {
  const { store, getLKRoom } = ctx;

  const currentSeatMode = ref<'normal' | 'duet'>('normal');

  // 房主切换座位模式：本地切 + 通知服务器持久化 + LiveKit 广播给房内所有人
  async function toggleSeatMode() {
    const next = currentSeatMode.value === 'normal' ? 'duet' : 'normal';
    currentSeatMode.value = next;
    store.currentRoomSeatMode = next;
    window.dispatchEvent(new CustomEvent('lyrise-set-seat-mode', { detail: next }));
    // 持久化到服务器（房主才能调 PATCH，requireOwner 会拦非房主）
    if (store.currentRoomId) {
      try {
        await roomApi.updateRoom(store.currentRoomId, undefined, undefined, undefined, false, next);
      } catch (e) {
        console.warn('[seatMode] 持久化失败:', e);
      }
    }
    // LiveKit 数据通道广播给房内其他用户
    try {
      const lkRoom = await getLKRoom();
      if (lkRoom?.localParticipant) {
        const payload = JSON.stringify({
          kind: 'lyrise-seat-mode',
          mode: next,
          time: Date.now(),
        });
        const buf = new TextEncoder().encode(payload);
        await lkRoom.localParticipant.publishData(buf, { reliable: true });
      }
    } catch (e) {
      console.warn('[seatMode] 广播失败:', e);
    }
  }

  function onSeatModeChanged(e: Event) {
    currentSeatMode.value = (e as CustomEvent).detail as 'normal' | 'duet';
  }

  // 从服务器同步过来的座位模式（其他房主广播 / 进房初始化）
  function applySeatModeFromRemote(mode: 'normal' | 'duet') {
    if (currentSeatMode.value === mode) return;
    currentSeatMode.value = mode;
    store.currentRoomSeatMode = mode;
    window.dispatchEvent(new CustomEvent('lyrise-set-seat-mode', { detail: mode }));
  }

  // LyriseMusic: 控制指令来源校验（LiveKit 已签名 participant.identity，不能伪造）
  function senderMember(identity: string) {
    return store.members.find((m: any) => m.identity === identity) || null;
  }
  /** 真房主（歌词/点歌播放源） */
  function isOwnerSender(identity: string) {
    return !!identity && identity === store.ownerIdentity;
  }
  /**
   * LyriseMusic: 歌词来源身份 = 房主，或当前坐在主麦上的 DJ。
   * 现实里在放歌的常常是管理员/普通成员（房主只是房间创建者），
   * 如果只认房主广播，网页端与其它客户端就永远拿不到歌词。
   * 主麦只能由房主/超管/房间管理员落座，信任范围可控。
   */
  function isLyricSourceSender(identity: string) {
    if (!identity) return false;
    if (isOwnerSender(identity)) return true;
    return ctx.getMainSeat()?.occupant?.identity === identity;
  }
  /** 房主 / 平台超管 / 根超管（可切换座位模式、刷新违禁词） */
  function isGlobalAdminSender(identity: string) {
    if (isOwnerSender(identity)) return true;
    const m = senderMember(identity);
    return !!m && (!!m.isAdmin || !!m.isRootSuper);
  }
  // LyriseMusic: 进房时用服务器返回的房间座位模式初始化（否则新用户永远看到 normal）
  currentSeatMode.value = store.currentRoomSeatMode === 'duet' ? 'duet' : 'normal';
  window.dispatchEvent(new CustomEvent('lyrise-set-seat-mode', { detail: currentSeatMode.value }));
  onMounted(() => window.addEventListener('lyrise-seat-mode-changed', onSeatModeChanged));
  onUnmounted(() => window.removeEventListener('lyrise-seat-mode-changed', onSeatModeChanged));

  return {
    currentSeatMode,
    toggleSeatMode,
    applySeatModeFromRemote,
    onSeatModeChanged,
    senderMember,
    isOwnerSender,
    isLyricSourceSender,
    isGlobalAdminSender,
  };
}
