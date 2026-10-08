/*
 * DakeMusic 座位管理模块
 * 作者：知之Dake
 * 文件：useSeatManager.ts
 * 描述：座位/麦位状态与动作的 composable 单例
 *   - 6 个小座位：点空座直接坐，点自己离开，谁都能坐
 *   - 1 个大主座：非房主需向房主申请，房主同意后才入座；房主可直接坐、可把人请下
 * 同步：经 LiveKit DataChannel（publishSeatData / onSeatData）在全员之间实时同步；
 *   新成员加入时房主单播座位快照。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { ref, computed, watch } from 'vue';
import { getLiveKitClient } from '@/utils/livekitClient';
import { useChatRoomStore } from '@/stores/chatRoom';
import {
  MAIN_SEAT_ID,
  SMALL_SEAT_IDS,
  type SeatState,
  type SeatOccupant,
  type MainSeatRequest,
  type MyRequestState,
  type SeatNotice,
  SeatMsgType,
} from './seatTypes';

// ================= 模块级单例状态（房间存活期间常驻，不随组件卸载丢失） =================
function buildEmptySeats(): SeatState[] {
  return [
    { id: MAIN_SEAT_ID, isMain: true, occupant: null },
    ...SMALL_SEAT_IDS.map(id => ({ id, isMain: false, occupant: null })),
  ];
}

const seats = ref<SeatState[]>(buildEmptySeats());
/** 房主收到的主座申请列表 */
const pendingRequests = ref<MainSeatRequest[]>([]);
/** 我的申请状态 */
const myRequestState = ref<MyRequestState>('none');
const myRequest = ref<MainSeatRequest | null>(null);
/** 提示文案（Toast，由 UI 自动消失） */
const notices = ref<SeatNotice[]>([]);
/** 房间管理员身份列表（房主是超管，不在此列表内） */
const adminIdentities = ref<string[]>([]);
let registered = false;
let noticeSeq = 0;

function pushNotice(text: string, tone: SeatNotice['tone'] = 'info') {
  const id = ++noticeSeq;
  notices.value.push({ id, text, tone });
  setTimeout(() => {
    notices.value = notices.value.filter(n => n.id !== id);
  }, 2600);
}

export function useSeatManager() {
  const store = useChatRoomStore();
  const client = getLiveKitClient();

  /** 我当前是否在座位上 / 我坐的座位 */
  const mySeat = computed<SeatState | null>(
    () => seats.value.find(s => s.occupant?.identity === store.myIdentity) || null,
  );
  const isOnSeat = computed(() => !!mySeat.value);
  /** 我是否在大主座上 */
  const isOnMain = computed(() => mySeat.value?.isMain === true);

  /** 我是否拥有管理权限（房主 或 被任命的管理员） */
  const amAdmin = computed(() => store.isOwner || adminIdentities.value.includes(store.myIdentity));
  /** 判断某身份是否为管理员（不含房主，房主另算） */
  function isAdminOf(identity?: string) {
    return !!identity && adminIdentities.value.includes(identity);
  }

  /** 主座当前是否有人 */
  const mainSeat = computed(() => seats.value.find(s => s.isMain) || null);

  // ================= 消息处理（收到其他成员的座位协议） =================
  function handleSnapshot(msg: any) {
    if (!Array.isArray(msg.seats)) return;
    msg.seats.forEach((rs: SeatState) => {
      const local = seats.value.find(s => s.id === rs.id);
      if (!local) return;
      // 不覆盖自己（本地操作优先）
      if (local.occupant?.identity === store.myIdentity) return;
      local.occupant = rs.occupant;
    });
    // 同步管理员列表
    if (Array.isArray(msg.adminIdentities)) {
      adminIdentities.value = [...msg.adminIdentities];
    }
  }

  function handleOccupy(msg: any) {
    const seat = seats.value.find(s => s.id === msg.seatId);
    if (!seat || !msg.occupant) return;
    const incoming = msg.occupant as SeatOccupant;
    // 一人一座：该人若已在其他座位，先从旧座位移除（即换到新座位）
    seats.value.forEach(s => {
      if (s.id !== seat.id && s.occupant?.identity === incoming.identity) s.occupant = null;
    });
    // 同一个人刷新自己座位（改签名/昵称）：直接覆盖，不做抢座比较
    if (seat.occupant?.identity === incoming.identity) {
      seat.occupant = incoming;
      seat.occupant.isAdmin = adminIdentities.value.includes(incoming.identity);
      return;
    }
    // 并发抢座：已被不同的人占用时，按入座时间先到先得
    if (seat.occupant && seat.occupant.identity !== incoming.identity) {
      const localTs = seat.occupant.ts ?? Infinity;
      const incomingTs = incoming.ts ?? Infinity;
      if (localTs <= incomingTs) return; // 本地更早，保留
    }
    seat.occupant = incoming;
    // DakeMusic: 管理员标识以本地 adminIdentities 为准，不信任广播里的 isAdmin，避免误显
    seat.occupant.isAdmin = adminIdentities.value.includes(incoming.identity);
  }

  function handleLeave(msg: any) {
    const seat = seats.value.find(s => s.id === msg.seatId);
    if (!seat) return;
    // 只有当前占据者匹配才清空，避免误清
    if (!seat.occupant) return;
    if (msg.identity && seat.occupant.identity !== msg.identity) return;
    seat.occupant = null;
  }

  function handleRequest(msg: any) {
    const req = msg.req as MainSeatRequest;
    if (!req) return;
    // 房主收到申请，加入待审批（去重）
    if (!pendingRequests.value.find(r => r.reqId === req.reqId)) {
      pendingRequests.value.push(req);
    }
  }

  function handleRequestCancel(msg: any) {
    pendingRequests.value = pendingRequests.value.filter(r => r.reqId !== msg.reqId);
  }

  function handleApprove(msg: any) {
    const seat = seats.value.find(s => s.id === msg.seatId);
    if (!seat || !msg.occupant) return;
    // 一人一座：清掉申请人在其他座位
    seats.value.forEach(s => {
      if (s.id !== seat.id && s.occupant?.identity === msg.occupant.identity) s.occupant = null;
    });
    seat.occupant = msg.occupant as SeatOccupant;
    if (msg.reqId) pendingRequests.value = pendingRequests.value.filter(r => r.reqId !== msg.reqId);
    if (msg.occupant?.identity === store.myIdentity) {
      myRequestState.value = 'approved';
      myRequest.value = null;
      pushNotice('房主已同意，你已上麦', 'success');
    }
  }

  function handleReject(msg: any) {
    if (msg.reqId) pendingRequests.value = pendingRequests.value.filter(r => r.reqId !== msg.reqId);
    if (myRequest.value && myRequest.value.reqId === msg.reqId) {
      myRequestState.value = 'rejected';
      myRequest.value = null;
      pushNotice('房主拒绝了你的上麦申请', 'error');
    }
  }

  function handleMainKick(msg: any) {
    const main = seats.value.find(s => s.isMain);
    if (!main) return;
    if (main.occupant?.identity === msg.identity) {
      // 房主请下后主座归还房主
      main.occupant = null;
    }
    if (msg.identity === store.myIdentity) {
      myRequestState.value = 'none';
      myRequest.value = null;
      pushNotice('房主已把你请下大主座', 'error');
    }
  }

  /** 房主设置管理员 */
  function handleAdminSet(msg: any) {
    if (!msg.identity) return;
    if (!adminIdentities.value.includes(msg.identity)) {
      adminIdentities.value.push(msg.identity);
    }
    // 同步更新该成员当前座位上的标识
    seats.value.forEach(s => {
      if (s.occupant && s.occupant.identity === msg.identity) s.occupant.isAdmin = true;
    });
    if (msg.identity === store.myIdentity) pushNotice('房主已任命你为管理员', 'success');
  }

  /** 房主取消管理员 */
  function handleAdminRevoke(msg: any) {
    if (!msg.identity) return;
    adminIdentities.value = adminIdentities.value.filter(id => id !== msg.identity);
    seats.value.forEach(s => {
      if (s.occupant && s.occupant.identity === msg.identity) s.occupant.isAdmin = false;
    });
    if (msg.identity === store.myIdentity) pushNotice('你的管理员权限已被收回', 'error');
  }

  function onSeatData(payload: any) {
    switch (payload.type) {
      case SeatMsgType.Snapshot: handleSnapshot(payload); break;
      case SeatMsgType.Occupy: handleOccupy(payload); break;
      case SeatMsgType.Leave: handleLeave(payload); break;
      case SeatMsgType.Request: handleRequest(payload); break;
      case SeatMsgType.RequestCancel: handleRequestCancel(payload); break;
      case SeatMsgType.Approve: handleApprove(payload); break;
      case SeatMsgType.Reject: handleReject(payload); break;
      case SeatMsgType.MainKick: handleMainKick(payload); break;
      case SeatMsgType.AdminSet: handleAdminSet(payload); break;
      case SeatMsgType.AdminRevoke: handleAdminRevoke(payload); break;
    }
  }

  /** 新成员加入：房主单播座位快照（延迟 500ms 等连接稳定） */
  function onSeatPeerConnected(identity: string) {
    if (!store.isOwner) return;
    setTimeout(() => {
      client.publishSeatData({
        type: SeatMsgType.Snapshot,
        seats: seats.value,
        adminIdentities: adminIdentities.value,
      }, [identity]).catch(() => {});
    }, 500);
  }

  // ================= 本地动作 =================
  /**
   * 本地落座到指定座位（唯一入口，强制一人一座）
   * 落座前先清掉我在其他所有座位，保证最多占一个；目标被别人占用则返回 null
   */
  function occupyLocal(seatId: string): SeatOccupant | null {
    const target = seats.value.find(s => s.id === seatId);
    if (!target) return null;
    if (target.occupant && target.occupant.identity !== store.myIdentity) return null;
    seats.value.forEach(s => {
      if (s.id !== seatId && s.occupant?.identity === store.myIdentity) s.occupant = null;
    });
    const occ: SeatOccupant = {
      identity: store.myIdentity,
      name: store.myName,
      ts: Date.now(),
      isOwner: store.isOwner,
      isAdmin: adminIdentities.value.includes(store.myIdentity),
      isSuperAdmin: store.isSuperAdmin,
      isRootSuper: (store as any).isRootSuper,
      bio: (store as any).myBio || '',
    };
    target.occupant = occ;
    return occ;
  }

  /** 申请/入座一个座位（所有座位都走申请制；房主自己点座位直接坐） */
  async function requestSeat(seatId: string) {
    const seat = seats.value.find(s => s.id === seatId);
    if (!seat) return;

    // 房主：点座位直接坐，不需要申请
    if (store.isOwner) {
      if (seat.occupant?.identity === store.myIdentity) return;
      const occ = occupyLocal(seatId);
      if (!occ) { pushNotice('该座位已有人'); return; }
      await client.publishSeatData({ type: SeatMsgType.Occupy, seatId, occupant: occ }).catch(() => {});
      return;
    }

    // 非房主
    if (seat.occupant?.identity === store.myIdentity) return;
    // 小座位被别人占了就不能申请；主座即使有人（房主）也可申请（房主同意后让座）
    if (seat.occupant && !seat.isMain) {
      pushNotice('该座位已有人');
      return;
    }
    if (myRequestState.value === 'pending') {
      pushNotice('申请已发送，等待房主同意');
      return;
    }
    if (isOnSeat.value) {
      pushNotice('请先离开当前座位');
      return;
    }
    const req: MainSeatRequest = {
      reqId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      seatId,
      identity: store.myIdentity,
      name: store.myName,
      ts: Date.now(),
    };
    myRequest.value = req;
    myRequestState.value = 'pending';
    await client.publishSeatData({ type: SeatMsgType.Request, req }).catch(() => {});
    pushNotice('已向房主申请上麦');
  }

  /** 离开我当前的座位 */
  async function leaveSeat() {
    const seat = mySeat.value;
    if (!seat) return;
    seat.occupant = null;
    await client.publishSeatData({
      type: SeatMsgType.Leave,
      seatId: seat.id,
      identity: store.myIdentity,
    }).catch(() => {});
  }

  /** 房主直接坐主座（进房自动） */
  async function ownerTakeMain() {
    if (!store.isOwner) return;
    const main = seats.value.find(s => s.isMain);
    if (!main || main.occupant?.identity === store.myIdentity) return;
    const occ = occupyLocal(MAIN_SEAT_ID);
    if (!occ) return;
    await client.publishSeatData({ type: SeatMsgType.Occupy, seatId: MAIN_SEAT_ID, occupant: occ }).catch(() => {});
  }

  /** 申请人取消申请 */
  async function cancelRequest() {
    const reqId = myRequest.value?.reqId;
    if (!reqId) return;
    myRequest.value = null;
    myRequestState.value = 'none';
    await client.publishSeatData({ type: SeatMsgType.RequestCancel, reqId }).catch(() => {});
  }

  /** 房主同意申请：申请人入座该座位（主座则房主让座） */
  async function approveRequest(req: MainSeatRequest) {
    const target = seats.value.find(s => s.id === req.seatId);
    if (!target) return;
    // 一人一座：先清掉申请人可能在的其他座位
    seats.value.forEach(s => {
      if (s.id !== req.seatId && s.occupant?.identity === req.identity) s.occupant = null;
    });
    const occ: SeatOccupant = {
      identity: req.identity,
      name: req.name,
      ts: Date.now(),
      isOwner: false,
      isAdmin: adminIdentities.value.includes(req.identity),
    };
    // 房主本地直接更新（房主自己发的消息不回环）
    target.occupant = occ;
    pendingRequests.value = pendingRequests.value.filter(r => r.reqId !== req.reqId);
    await client.publishSeatData({
      type: SeatMsgType.Approve,
      reqId: req.reqId,
      req,
      occupant: occ,
      seatId: req.seatId,
    }).catch(() => {});
  }

  /** 房主拒绝申请 */
  async function rejectRequest(req: MainSeatRequest) {
    pendingRequests.value = pendingRequests.value.filter(r => r.reqId !== req.reqId);
    await client.publishSeatData({ type: SeatMsgType.Reject, reqId: req.reqId, req }).catch(() => {});
  }

  /** 房主把主座上的人请下来（主座归还房主） */
  async function kickFromMain() {
    const main = seats.value.find(s => s.isMain);
    if (!main) return;
    const target = main.occupant;
    if (!target || target.identity === store.myIdentity) return;
    await client.publishSeatData({ type: SeatMsgType.MainKick, identity: target.identity }).catch(() => {});
    if (store.isOwner) {
      // 房主请下，主座归还房主
      const ownerOcc: SeatOccupant = { identity: store.myIdentity, name: store.myName, ts: Date.now(), isOwner: store.isOwner };
      main.occupant = ownerOcc;
      await client.publishSeatData({ type: SeatMsgType.Occupy, seatId: MAIN_SEAT_ID, occupant: ownerOcc }).catch(() => {});
    } else {
      // 管理员请下，主座空着（不归管理员）
      main.occupant = null;
    }
  }

  /** 房主设置 / 取消某成员为管理员（管理员权限同房主，但不能删除房间） */
  async function setAdmin(identity: string, on: boolean) {
    if (!store.isOwner || identity === store.myIdentity) return;
    if (on) {
      if (!adminIdentities.value.includes(identity)) adminIdentities.value.push(identity);
      seats.value.forEach(s => { if (s.occupant && s.occupant.identity === identity) s.occupant.isAdmin = true; });
      await client.publishSeatData({ type: SeatMsgType.AdminSet, identity }).catch(() => {});
    } else {
      adminIdentities.value = adminIdentities.value.filter(id => id !== identity);
      seats.value.forEach(s => { if (s.occupant && s.occupant.identity === identity) s.occupant.isAdmin = false; });
      await client.publishSeatData({ type: SeatMsgType.AdminRevoke, identity }).catch(() => {});
    }
  }

  // ================= 注册一次回调 + 生命周期（多次调用 useSeatManager 也只执行一次） =================
  if (!registered) {
    registered = true;
    client.setCallbacks({ onSeatData, onSeatPeerConnected });

    // 房主进房自动坐主座（client 已连接后）
    if (store.isOwner && store.isConnected) {
      ownerTakeMain();
    }
    // 监听连接状态：房主在连接后自动坐主座
    const stopConnectedWatch = watch(
      () => store.isConnected,
      connected => {
        if (connected && store.isOwner) ownerTakeMain();
      },
    );

    // 成员离开房间（含异常断线）：释放其座位、清理其申请
    watch(
      () => store.members.map(m => m.identity),
      ids => {
        seats.value.forEach(seat => {
          if (seat.occupant && !ids.includes(seat.occupant.identity)) {
            seat.occupant = null;
          }
        });
        pendingRequests.value = pendingRequests.value.filter(r => ids.includes(r.identity));
      },
    );

    // 真正退房（currentRoomId 清空）：重置座位状态
    watch(
      () => store.currentRoomId,
      id => {
        if (!id) resetState();
      },
    );
  }

  function resetState() {
    seats.value = buildEmptySeats();
    pendingRequests.value = [];
    myRequestState.value = 'none';
    myRequest.value = null;
    notices.value = [];
    adminIdentities.value = [];
  }

  /** 刷新自己座位上的资料（改了昵称/头像/签名后调用，全员同步） */
  async function refreshMySeat() {
    const mine = seats.value.find(s => s.occupant?.identity === store.myIdentity);
    if (!mine) return;
    const occ: SeatOccupant = {
      identity: store.myIdentity,
      name: store.myName,
      ts: Date.now(),
      isOwner: store.isOwner,
      isAdmin: adminIdentities.value.includes(store.myIdentity),
      isSuperAdmin: store.isSuperAdmin,
      isRootSuper: (store as any).isRootSuper,
      bio: (store as any).myBio || '',
    };
    mine.occupant = occ;
    await client.publishSeatData({ type: SeatMsgType.Occupy, seatId: mine.id, occupant: occ }).catch(() => {});
  }

  return {
    seats,
    mainSeat,
    pendingRequests,
    myRequestState,
    myRequest,
    mySeat,
    isOnSeat,
    isOnMain,
    amAdmin,
    isAdminOf,
    adminIdentities,
    notices,
    requestSeat,
    leaveSeat,
    cancelRequest,
    approveRequest,
    rejectRequest,
    kickFromMain,
    setAdmin,
    refreshMySeat,
  };
}
