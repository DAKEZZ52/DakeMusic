<!--
  DakeMusic 座位管理模块
  作者：知之Dake
  文件：SeatStage.vue
  描述：座位/麦位舞台 UI - 1 个大主座（上）+ 6 个小座位（双排 3+3）
    小座位点空座直接坐；主座非房主点击为向房主申请，房主在审批卡片上同意/拒绝
  版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
-->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useMicGain } from '@/composables/useMicGain';
import { roomApi } from '@/utils/roomApi';
import { useSeatManager } from './useSeatManager';
import { getMyAuralId, getAuralUrl } from './auralSkins';
import { getMySeatFrameId, getSeatFrameUrl } from './seatFrames';

const emit = defineEmits<{
  (e: 'view-profile', identity: string): void;
}>();

const store = useChatRoomStore();
const micGain = useMicGain();
const {
  seats,
  pendingRequests,
  myRequestState,
  myRequest,
  notices,
  amAdmin,
  isAdminOf,
  requestSeat,
  leaveSeat,
  cancelRequest,
  approveRequest,
  rejectRequest,
  kickFromMain,
} = useSeatManager();

const mainSeat = computed(() => seats.value.find(s => s.isMain) || null);
const smallSeats = computed(() => seats.value.filter(s => !s.isMain));

// DakeMusic: 麦位布局模式切换
const seatMode = ref<'normal' | 'duet'>('normal');
function toggleSeatMode() {
  seatMode.value = seatMode.value === 'normal' ? 'duet' : 'normal';
}
// 对唱模式：第一个小座升为大座，剩下 4 个小座
const duetBigSeat = computed(() => smallSeats.value[0] || null);
const duetSmallSeats = computed(() => smallSeats.value.slice(1, 5));

// DakeMusic: 我的麦位说话声波皮肤
const myAuralUrl = ref(getAuralUrl(getMyAuralId()));
function onAuralChanged(e: Event) {
  const id = (e as CustomEvent).detail as string;
  myAuralUrl.value = getAuralUrl(id);
}
onMounted(() => window.addEventListener('dakemusic-aural-changed', onAuralChanged));
onUnmounted(() => window.removeEventListener('dakemusic-aural-changed', onAuralChanged));

// DakeMusic: 我的麦位框
const myFrameUrl = ref(getSeatFrameUrl(getMySeatFrameId()));
function onFrameChanged(e: Event) {
  const id = (e as CustomEvent).detail as string;
  myFrameUrl.value = getSeatFrameUrl(id);
}
onMounted(() => window.addEventListener('dakemusic-frame-changed', onFrameChanged));
onUnmounted(() => window.removeEventListener('dakemusic-frame-changed', onFrameChanged));

// DakeMusic: 监听外部切换模式
function onSetMode(e: Event) {
  seatMode.value = (e as CustomEvent).detail as 'normal' | 'duet';
  window.dispatchEvent(new CustomEvent('dakemusic-seat-mode-changed', { detail: seatMode.value }));
}
onMounted(() => window.addEventListener('dakemusic-set-seat-mode', onSetMode));
onUnmounted(() => window.removeEventListener('dakemusic-set-seat-mode', onSetMode));

// 座位 id → 可读名
function seatLabel(seatId: string) {
  if (seatId === 'main') return '主座';
  return `${seatId.replace('small-', '')}号麦位`;
}

// 由座位 occupant 反查完整成员（头像 / 麦状态 / 说话状态）
function memberOf(identity?: string) {
  if (!identity) return null;
  return store.members.find(m => m.identity === identity) || null;
}

// 头像：自己读 store.myAvatar；他人走 memberAvatars，未命中则通过后端拉取
const fetchedAvatars = new Set<string>();
function avatarOf(identity?: string) {
  if (!identity) return '';
  if (identity === store.myIdentity && store.myAvatar) return store.myAvatar;
  if (store.memberAvatars[identity]) return store.memberAvatars[identity];
  const m = memberOf(identity);
  if (m?.avatar) return m.avatar;
  if (!fetchedAvatars.has(identity)) {
    fetchedAvatars.add(identity);
    const userId = Number(identity.replace('user_', ''));
    if (userId) {
      roomApi.getUser(userId).then((user: any) => {
        if (user?.avatar) store.memberAvatars[identity] = user.avatar;
      }).catch(() => fetchedAvatars.delete(identity));
    }
  }
  return '';
}
function micOffOf(identity?: string) {
  const m = memberOf(identity);
  if (!m) return false;
  if (m.isLocal) return micGain.adsMuted.value;
  return m.isMuted;
}
function speakingOf(identity?: string) {
  return !!memberOf(identity)?.isSpeaking;
}

// 点击主座：空→房主直接坐/非房主申请；我→离开；别人→看资料
function onMainClick() {
  const seat = mainSeat.value;
  if (!seat) return;
  const occupant = seat.occupant;
  if (occupant?.identity === store.myIdentity) { leaveSeat(); return; }
  if (occupant) { emit('view-profile', occupant.identity); return; }
  requestSeat(seat.id);
}

// 点击小座位：空→房主直接坐/非房主申请；我→离开；别人→看资料
function onSmallClick(seatId: string) {
  const seat = seats.value.find(s => s.id === seatId);
  if (!seat) return;
  const occupant = seat.occupant;
  if (occupant?.identity === store.myIdentity) { leaveSeat(); return; }
  if (occupant) { emit('view-profile', occupant.identity); return; }
  requestSeat(seatId);
}
</script>

<template>
  <div class="seat-stage" :style="{ '--my-aural-url': `url('${myAuralUrl}')`, ...(myFrameUrl ? { '--my-frame-url': `url('${myFrameUrl}')` } : {}) }">
    <!-- 提示 Toast -->
    <div class="seat-toasts">
      <span
        v-for="n in notices"
        :key="n.id"
        class="seat-toast"
        :class="n.tone"
      >{{ n.text }}</span>
    </div>

    <!-- 房主审批卡片（有申请时显示在主座上方） -->
    <div v-if="amAdmin && pendingRequests.length" class="seat-approve">
      <div class="seat-approve-title">麦位申请</div>
      <div v-for="req in pendingRequests" :key="req.reqId" class="seat-approve-row">
        <span class="seat-approve-name">{{ req.name }}<i class="seat-approve-seat">{{ seatLabel(req.seatId) }}</i></span>
        <button class="seat-approve-btn ok" @click.stop="approveRequest(req)">同意</button>
        <button class="seat-approve-btn no" @click.stop="rejectRequest(req)">拒绝</button>
      </div>
    </div>

    <!-- 上：房主信息卡（大头像 + 昵称 + 标签 + 简介） -->
    <template v-if="seatMode === 'normal'">
    <div class="seat-row top">
      <div
        class="seat big host-card"
        :class="{
          'is-speaking': speakingOf(mainSeat?.occupant?.identity),
          'is-muted': micOffOf(mainSeat?.occupant?.identity),
          'is-mine': mainSeat?.occupant?.identity === store.myIdentity,
          'is-empty': !mainSeat?.occupant,
          'is-owner': !!mainSeat?.occupant?.isOwner,
          'is-pending': !store.isOwner && myRequestState === 'pending'
        }"
        @click="onMainClick"
        @contextmenu.prevent
      >
        <div class="seat-avatar">
          <img v-if="mainSeat?.occupant && avatarOf(mainSeat.occupant.identity)" :src="avatarOf(mainSeat.occupant!.identity)" />
          <svg v-else class="seat-default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3z"/><path d="M5 16v2M19 16v2"/></svg>
          <span
            v-if="mainSeat?.occupant"
            class="seat-mic"
            :class="micOffOf(mainSeat.occupant.identity) ? 'off' : 'on'"
          >
            <svg v-if="micOffOf(mainSeat.occupant.identity)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          </span>
        </div>
        <!-- 房主请下主座的人：hover 小 X -->
        <button
          v-if="amAdmin && mainSeat?.occupant && mainSeat.occupant.identity !== store.myIdentity"
          class="seat-kick"
          title="请下主座"
          @click.stop="kickFromMain"
        >×</button>
        <div class="host-info">
          <div class="seat-name">
            <template v-if="mainSeat?.occupant">
              <span class="truncate">{{ mainSeat.occupant.name }}</span>
              <span v-if="mainSeat.occupant.isRootSuper" class="seat-rootsuper-tag" title="根超管">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z"/></svg>
                根超管
              </span>
              <span v-else-if="mainSeat.occupant.isSuperAdmin" class="seat-super-tag" title="超级管理员">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                超管
              </span>
              <span v-if="mainSeat.occupant.isOwner" class="seat-owner-tag">主持</span>
              <span v-else-if="mainSeat.occupant.isAdmin" class="seat-admin-tag">管理员</span>
            </template>
            <template v-else-if="!store.isOwner && myRequestState === 'pending' && myRequest?.seatId === 'main'">
              <span class="seat-pending-text">申请中…
                <button class="seat-pending-cancel" @click.stop="cancelRequest">取消</button>
              </span>
            </template>
            <template v-else>
              <span>虚位以待</span>
            </template>
          </div>
          <div class="host-bio">{{ mainSeat?.occupant?.bio || '这个人很懒，什么都没写' }}</div>
        </div>
      </div>
    </div>

    <!-- 下：6 个小座位双排（3+3） -->
    <div class="seat-grid">
      <div
        v-for="seat in smallSeats"
        :key="seat.id"
        class="seat"
        :class="{
          'is-speaking': speakingOf(seat.occupant?.identity),
          'is-muted': micOffOf(seat.occupant?.identity),
          'is-mine': seat.occupant?.identity === store.myIdentity,
          'is-empty': !seat.occupant,
          'is-owner': !!seat.occupant?.isOwner
        }"
        @click="onSmallClick(seat.id)"
        @contextmenu.prevent
      >
        <div class="seat-avatar">
          <img v-if="seat.occupant && avatarOf(seat.occupant.identity)" :src="avatarOf(seat.occupant!.identity)" />
          <svg v-else class="seat-default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3z"/><path d="M5 16v2M19 16v2"/></svg>
          <span
            v-if="seat.occupant"
            class="seat-mic"
            :class="micOffOf(seat.occupant.identity) ? 'off' : 'on'"
          >
            <svg v-if="micOffOf(seat.occupant.identity)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          </span>
        </div>
        <div class="seat-name">
          <template v-if="seat.occupant">
            <span class="truncate">{{ seat.occupant.name }}</span>
            <span v-if="seat.occupant.isRootSuper" class="seat-rootsuper-tag" title="根超管">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z"/></svg>
            </span>
            <span v-else-if="seat.occupant.isSuperAdmin" class="seat-super-tag" title="超级管理员">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <span v-if="seat.occupant.isOwner" class="seat-owner-tag">房主</span>
            <span v-else-if="seat.occupant.isAdmin" class="seat-admin-tag">管理员</span>
          </template>
          <template v-else-if="!store.isOwner && myRequestState === 'pending' && myRequest?.seatId === seat.id">
            <span class="seat-pending-text">申请中…<button class="seat-pending-cancel" @click.stop="cancelRequest">取消</button></span>
          </template>
          <template v-else>
            <span>虚位以待</span>
          </template>
        </div>
      </div>
    </div>
    </template>

    <!-- DakeMusic: 对唱模式：2 个大座并排 + 4 个小座 -->
    <template v-else>
    <div class="duet-row">
      <!-- 左大座（主座） -->
      <div
        class="seat big duet-seat"
        :class="{
          'is-speaking': speakingOf(mainSeat?.occupant?.identity),
          'is-muted': micOffOf(mainSeat?.occupant?.identity),
          'is-mine': mainSeat?.occupant?.identity === store.myIdentity,
          'is-empty': !mainSeat?.occupant,
        }"
        @click="onMainClick"
      >
        <div class="seat-avatar">
          <img v-if="mainSeat?.occupant && avatarOf(mainSeat.occupant.identity)" :src="avatarOf(mainSeat.occupant!.identity)" />
          <svg v-else class="seat-default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3z"/></svg>
        </div>
        <div class="seat-name">{{ mainSeat?.occupant?.name || '虚位以待' }}</div>
      </div>
      <!-- VS 中间 -->
      <div class="duet-vs">VS</div>
      <!-- 右大座（原小座1） -->
      <div
        v-if="duetBigSeat"
        class="seat big duet-seat"
        :class="{
          'is-speaking': speakingOf(duetBigSeat.occupant?.identity),
          'is-muted': micOffOf(duetBigSeat.occupant?.identity),
          'is-mine': duetBigSeat.occupant?.identity === store.myIdentity,
          'is-empty': !duetBigSeat.occupant,
        }"
        @click="onSmallClick(duetBigSeat.id)"
      >
        <div class="seat-avatar">
          <img v-if="duetBigSeat.occupant && avatarOf(duetBigSeat.occupant.identity)" :src="avatarOf(duetBigSeat.occupant.identity)" />
          <svg v-else class="seat-default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3z"/></svg>
        </div>
        <div class="seat-name">{{ duetBigSeat.occupant?.name || '虚位以待' }}</div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.seat-stage {
  position: relative;
  flex: 0 0 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;  align-items: center;
  justify-content: flex-start;
  gap: clamp(8px, 2vh, 20px);
  padding: 10px 12px 8px;
  overflow-y: auto;
}
.seat-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

/* 小座位双排网格 */
.seat-grid {
  display: grid;
  grid-template-columns: repeat(3, clamp(52px, 9.5vh, 78px));
  gap: 22px 36px;
}

.seat {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform .2s ease;
}
.seat:hover { transform: translateY(-3px); }
.seat.is-empty { cursor: pointer; }

/* 头像 */
.seat-avatar {
  position: relative;
  width: clamp(38px, 7vh, 54px);
  height: clamp(38px, 7vh, 54px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20,18,31,.8);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.18),
    0 4px 14px rgba(0,0,0,.4);
  transition: box-shadow .22s ease, transform .22s ease, filter .22s ease;
}
.seat-avatar img {
  width: 100%; height: 100%;
  object-fit: cover; border-radius: 50%;
}
/* DakeMusic: 麦位框 - 围绕头像的圆形装饰，盖在头像上面 */
.seat.is-mine .seat-avatar::after {
  content: '';
  position: absolute;
  inset: -48%;
  background: var(--my-frame-url, none) center/contain no-repeat;
  pointer-events: none;
  z-index: 2;
}
.seat-default {
  width: clamp(20px, 4vh, 28px);
  height: clamp(20px, 4vh, 28px);
  color: rgba(255,255,255,.7);
}

/* 说话光环：用用户上传的装饰图 */
.seat.is-speaking .seat-avatar {
  transform: scale(1.06);
  animation: seat-pulse 1.4s ease-in-out infinite;
}
.seat.is-speaking .seat-avatar::before {
  content: '';
  position: absolute;
  inset: -27px;
  background: var(--my-aural-url, url('/seat/speaking-ring.webp')) center/contain no-repeat;
  pointer-events: none;
  z-index: -1;
}
@keyframes seat-pulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.18); }
}
.seat.is-muted .seat-avatar { filter: saturate(.5) brightness(.8); }

/* 大主座 */
.seat.big .seat-avatar {
  width: clamp(54px, 9vh, 78px);
  height: clamp(54px, 9vh, 78px);
}
/* 房主信息卡：头像+信息横排 */
.host-card {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 10px 16px 10px 12px;
  border-radius: 18px;
  background: rgba(255,255,255,.06);
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 26px rgba(30,8,30,.35);
}
.host-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  text-align: left;
}
.host-info .seat-name { margin-top: 0; }
.host-bio {
  font-size: 11px;
  color: rgba(255,255,255,.55);
  max-width: 180px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.seat.big .seat-default {
  width: clamp(32px, 5.5vh, 46px);
  height: clamp(32px, 5.5vh, 46px);
}
.seat.big.is-speaking .seat-avatar {
  animation: seat-big-pulse 1.4s ease-in-out infinite;
}
.seat.big.is-speaking .seat-avatar::before {
  inset: -45px;
}
@keyframes seat-big-pulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.18); }
}

/* 房主头像：去掉金色光环，保持粉色 */
.seat.is-owner .seat-avatar {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.28),
    0 0 0 2px rgba(244,114,182,.65),
    0 0 18px rgba(244,114,182,.45),
    0 8px 22px rgba(40,10,40,.45);
}
.seat.big.is-owner .seat-avatar {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.18),
    0 4px 14px rgba(0,0,0,.4);
}

/* 房主小标签 */
.seat-owner-tag {
  font-size: 9px;
  background: linear-gradient(90deg,#fb923c,#ef4444);
  color: #fff;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
  line-height: 1.5;
  flex-shrink: 0;
}
.seat-admin-tag {
  font-size: 9px;
  background: linear-gradient(90deg,#38bdf8,#6366f1);
  color: #fff;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
  line-height: 1.5;
  flex-shrink: 0;
}
/* 超管标签：盾牌+紫色圆角 */
.seat-super-tag {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 9px;
  background: linear-gradient(90deg,#a855f7,#6366f1);
  color: #fff;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
  line-height: 1.5;
  flex-shrink: 0;
}
.seat-super-tag svg { width: 11px; height: 11px; }
/* 根超管标签：皇冠+金色，更醒目 */
.seat-rootsuper-tag {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 9px;
  background: linear-gradient(90deg,#fbbf24,#f59e0b);
  color: #4a2c00;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 800;
  line-height: 1.5;
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(251,191,36,.5);
}
.seat-rootsuper-tag svg { width: 11px; height: 11px; }

/* 麦克风角标：头像右下角 */
.seat-mic {
  position: absolute;
  right: -4px; bottom: -4px;
  width: 18px; height: 18px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  z-index: 3;
  background: rgba(15,14,25,.85);
  box-shadow: 0 2px 6px rgba(0,0,0,.4);
}
.seat.big .seat-mic {
  width: 22px; height: 22px;
  right: -5px; bottom: -5px;
}
.seat-mic svg { width: 10px; height: 10px; }
.seat.big .seat-mic svg { width: 12px; height: 12px; }
.seat-mic.on { color: #4ade80; }
.seat-mic.off { color: #f87171; }

/* 名字 */
.seat-name {
  margin-top: 7px;
  display: flex; align-items: center; gap: 4px;
  max-width: 100%;
  font-size: clamp(10px, 1.7vh, 11px);
  font-weight: 600;
  color: rgba(255,255,255,.85);
  text-align: center;
}
.seat.big .seat-name {
  font-size: clamp(12px, 2.2vh, 14px);
  margin-top: 10px;
}
.seat-name .truncate {
  max-width: 78px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.seat.big .seat-name .truncate { max-width: 120px; }

/* 空位：沙发图标 */
.seat.is-empty .seat-avatar {
  background: rgba(255,255,255,.04);
  border: 1.5px dashed rgba(255,150,220,.35);
  box-shadow: 0 0 14px rgba(255,120,200,.12), inset 0 0 12px rgba(255,120,200,.06);
}
.seat.is-empty .seat-default { color: rgba(255,170,220,.55); }
.seat.is-empty .seat-name { color: rgba(255,255,255,.4); font-weight: 500; font-size: 10px; }

/* 申请中 */
.seat-pending-text { color: #fbbf24; display: inline-flex; align-items: center; gap: 4px; }
.seat-pending-cancel {
  border: none; background: rgba(255,255,255,.1);
  color: #fbbf24; font-size: 10px;
  border-radius: 999px; padding: 1px 6px; cursor: pointer;
}
.seat-pending-cancel:hover { background: rgba(255,255,255,.2); }

/* 房主请下小 X */
.seat-kick {
  position: absolute;
  top: -6px; right: -6px;
  width: 20px; height: 20px;
  border-radius: 50%;
  border: none;
  background: #e11d48; color: #fff;
  font-size: 14px; line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center; justify-content: center;
  z-index: 3;
}
.seat.big:hover .seat-kick { display: flex; }

/* 房主审批卡片 */
.seat-approve {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  min-width: 190px;
  padding: 9px 11px;
  border-radius: 12px;
  background: rgba(22,20,44,.96);
  border: 1px solid rgba(251,191,36,.7);
  box-shadow: 0 10px 30px rgba(8,6,24,.6), 0 0 22px rgba(251,191,36,.3);
  backdrop-filter: blur(20px);
  animation: seat-approve-glow 1.6s ease-in-out infinite;
}
@keyframes seat-approve-glow {
  0%,100% { box-shadow: 0 10px 30px rgba(8,6,24,.6), 0 0 14px rgba(251,191,36,.25); }
  50%     { box-shadow: 0 10px 30px rgba(8,6,24,.6), 0 0 28px rgba(251,191,36,.65); }
}
.seat-approve-title {
  font-size: 11px; font-weight: 700;
  color: #fde68a; margin-bottom: 6px;
  display: flex; align-items: center; gap: 6px;
}
.seat-approve-title::before {
  content: '';
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fbbf24;
  animation: seat-dot-blink 1s ease-in-out infinite;
}
@keyframes seat-dot-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.seat-approve-row {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 5px;
}
.seat-approve-row:last-child { margin-bottom: 0; }
.seat-approve-name {
  flex: 1; font-size: 12px; color: #ececf1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 5px;
}
.seat-approve-seat {
  flex: none; font-style: normal; font-size: 10px;
  color: #0b0a18; background: #fbbf24;
  padding: 1px 6px; border-radius: 6px; font-weight: 700;
}
.seat-approve-btn {
  border: none; border-radius: 8px;
  font-size: 11px; padding: 3px 9px;
  cursor: pointer;
}
.seat-approve-btn.ok { background: #16a34a; color: #fff; }
.seat-approve-btn.ok:hover { background: #15803d; }
.seat-approve-btn.no { background: rgba(255,255,255,.12); color: #e7e7f0; }
.seat-approve-btn.no:hover { background: rgba(255,255,255,.2); }

/* Toast */
.seat-toasts {
  position: absolute;
  top: 4px; left: 50%;
  transform: translateX(-50%);
  display: flex; flex-direction: column;
  align-items: center; gap: 4px;
  z-index: 20;
  pointer-events: none;
}
.seat-toast {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(22,20,44,.92);
  border: 1px solid rgba(255,255,255,.14);
  color: #d8d8e8;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(8,6,24,.5);
}
.seat-toast.success { color: #86efac; border-color: rgba(52,211,153,.4); }
.seat-toast.error { color: #fda4af; border-color: rgba(255,77,109,.4); }

/* DakeMusic: 布局切换按钮 */
.seat-mode-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  color: #fff;
  background: rgba(138,92,255,.3);
  border: 1px solid rgba(138,92,255,.5);
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.seat-mode-btn:hover { background: rgba(138,92,255,.5); }

/* DakeMusic: 对唱模式 */
.duet-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
  width: 100%;
}
.duet-seat {
  flex-direction: column;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255,255,255,.06);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}
.duet-vs {
  font-size: 20px;
  font-weight: 800;
  background: linear-gradient(135deg, #fbbf24, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.duet-grid {
  display: grid;
  grid-template-columns: repeat(4, clamp(52px, 9.5vh, 78px));
  gap: 22px 36px;
  justify-content: center;
}
</style>
