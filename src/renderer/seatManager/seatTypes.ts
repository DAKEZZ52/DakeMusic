/*
 * DakeMusic 座位管理模块
 * 作者：知之Dake
 * 文件：seatTypes.ts
 * 描述：座位/麦位类型定义与座位协议常量
 * 规则：6 个小座位谁都能直接坐；1 个大主座（主持位）需向房主申请，房主同意后才能上去
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */

/** 大主座 ID（申请制） */
export const MAIN_SEAT_ID = 'main';
/** 小座位数量（可直接坐） */
export const SMALL_SEAT_COUNT = 6;
/** 小座位 ID 列表 */
export const SMALL_SEAT_IDS: string[] = Array.from(
  { length: SMALL_SEAT_COUNT },
  (_, i) => `small-${i + 1}`,
);
/** 全部座位 ID（主座在前） */
export const ALL_SEAT_IDS: string[] = [MAIN_SEAT_ID, ...SMALL_SEAT_IDS];

/** 座位上的人 */
export interface SeatOccupant {
  identity: string;
  name: string;
  /** 入座时间戳（用于并抢占座时先到先得） */
  ts?: number;
  /** 是否为房间房主 */
  isOwner?: boolean;
  /** 是否为房间管理员 */
  isAdmin?: boolean;
  /** 是否为全局超级管理员 */
  isSuperAdmin?: boolean;
  /** 是否为根超管（环境变量里写死的） */
  isRootSuper?: boolean;
  /** 个人签名 */
  bio?: string;
}

/** 一个座位的当前状态 */
export interface SeatState {
  id: string;
  isMain: boolean;
  /** 空座为 null */
  occupant: SeatOccupant | null;
}

/** 座位申请单（所有座位都走申请制） */
export interface MainSeatRequest {
  reqId: string;
  seatId: string;
  identity: string;
  name: string;
  ts: number;
}

/** 我（本地成员）的主座申请状态 */
export type MyRequestState = 'none' | 'pending' | 'approved' | 'rejected';

/** 座位协议消息类型（经 LiveKit DataChannel 传输，kind=dakemusic-seat） */
export enum SeatMsgType {
  /** 座位全量快照（房主单播给新加入成员） */
  Snapshot = 'seat/snapshot',
  /** 某人坐下（小座位直接坐 / 房主坐主座） */
  Occupy = 'seat/occupy',
  /** 某人离开座位 */
  Leave = 'seat/leave',
  /** 申请大主座 */
  Request = 'seat/main/request',
  /** 申请人取消申请 */
  RequestCancel = 'seat/main/request-cancel',
  /** 房主同意申请 */
  Approve = 'seat/main/approve',
  /** 房主拒绝申请 */
  Reject = 'seat/main/reject',
  /** 房主把主座上的人请下来 */
  MainKick = 'seat/main/kick',
  /** 房主设置某成员为管理员 */
  AdminSet = 'seat/admin/set',
  /** 房主取消某成员管理员 */
  AdminRevoke = 'seat/admin/revoke',
}

/** 座位协议消息体 */
export interface SeatMessage {
  kind?: 'dakemusic-seat';
  type: SeatMsgType;
  seatId?: string;
  identity?: string;
  occupant?: SeatOccupant | null;
  seats?: SeatState[];
  req?: MainSeatRequest;
  reqId?: string;
  /** 管理员身份列表（Snapshot 下发用） */
  adminIdentities?: string[];
}

/** 提示文案（UI 展示用） */
export interface SeatNotice {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}
