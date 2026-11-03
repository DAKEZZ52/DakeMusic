<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ChatRoomList.vue
  描述：房间列表页 - 房间卡片展示 + 创建/编辑/加入房间
-->
<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useSettingStore } from '@/stores/setting';
import { roomApi } from '@/utils/roomApi';
import Button from '@/components/ui/Button.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import { logger } from '@/utils/logger';
// DakeMusic: 默认房间封面
import defaultCover from '/dakemusic-default-room-cover.png?url';

// ===== 房间卡片 3D 倾斜动效（鼠标跟随透视倾斜） =====
/** 最大倾斜角度（度），克制取值避免眩晕。 */
const TILT_MAX_DEG = 8;
/** 悬停时的轻微放大比例。 */
const TILT_SCALE = 1.02;
/** 卡片透视距离（px），越小立体感越强。 */
const TILT_PERSPECTIVE = 900;

/** 是否正在跟随鼠标倾斜（控制 transition 开关：跟随无过渡、离开平滑复位）。 */
const tiltHovering = reactive<Record<string, boolean>>({});
/** 每张卡片当前的旋转量。 */
const tiltState = reactive<Record<string, { rx: number; ry: number }>>({});

/** mousemove：按鼠标相对卡片中心的位置计算透视旋转。 */
function onCardMove(event: MouseEvent, roomId: string) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const px = (event.clientX - rect.left) / rect.width; // 0 左 ~ 1 右
  const py = (event.clientY - rect.top) / rect.height; // 0 上 ~ 1 下
  tiltHovering[roomId] = true;
  tiltState[roomId] = {
    rx: (py - 0.5) * -2 * TILT_MAX_DEG,
    ry: (px - 0.5) * 2 * TILT_MAX_DEG,
  };
}

/** mouseleave：复位并开启过渡平滑回正。 */
function onCardLeave(roomId: string) {
  tiltHovering[roomId] = false;
  tiltState[roomId] = { rx: 0, ry: 0 };
}

/** 卡片 transform（透视 + 双轴旋转 + 轻微放大）。 */
function tiltStyle(roomId: string): string {
  const t = tiltState[roomId];
  const rx = t?.rx ?? 0;
  const ry = t?.ry ?? 0;
  const scale = tiltHovering[roomId] ? TILT_SCALE : 1;
  return `perspective(${TILT_PERSPECTIVE}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`;
}

const router = useRouter();
const store = useChatRoomStore();
// DakeMusic: 设置 store（用于自定义背景）
const settingStore = useSettingStore();

// ===== 登录/注册 =====
const authMode = ref<'login' | 'register'>('login');
const loginNameInput = ref('');
const loginNicknameInput = ref(''); // 注册时填的昵称（显示用，可与账号不同）
const loginPasswordInput = ref('');
const loginConfirmPassword = ref('');
const loginError = ref('');
const isLoggingIn = ref(false);

async function handleAuth() {
  if (!loginNameInput.value.trim() || !loginPasswordInput.value) {
    loginError.value = '账号和密码必填';
    return;
  }
  isLoggingIn.value = true;
  loginError.value = '';
  try {
    if (authMode.value === 'register') {
      // 注册：先调 register，成功后自动登录
      if (loginPasswordInput.value !== loginConfirmPassword.value) {
        loginError.value = '两次密码不一致';
        return;
      }
      await roomApi.register(
        loginNameInput.value.trim(),
        loginPasswordInput.value,
        loginNicknameInput.value.trim() || undefined,
      );
      await store.login(loginNameInput.value.trim(), loginPasswordInput.value);
    } else {
      // DakeMusic: 优先走 peiwan 登录；peiwan 未部署/接口不存在/任何失败都自动回退到老账号登录
      try {
        await store.loginPeiwan(loginNameInput.value.trim(), loginPasswordInput.value);
      } catch {
        await store.login(loginNameInput.value.trim(), loginPasswordInput.value);
      }
    }
    await store.fetchRooms();
  } catch (e: any) {
    loginError.value = e.message || '操作失败';
  } finally {
    isLoggingIn.value = false;
  }
}

function switchAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login';
  loginError.value = '';
  loginConfirmPassword.value = '';
}

// 登出前必须先退出房间：store.logout() 只清会话/localStorage，
// 不会断开 LiveKit 连接（isConnected/currentRoomId 都还在），
// 否则会出现「已登出，但房间悬浮窗还挂在屏幕上、人还在房间里」的残留。
async function handleLogout() {
  if (store.isConnected && typeof (store as any).leaveRoom === 'function') {
    try {
      await store.leaveRoom();
    } catch (e) {
      logger.debug('ChatRoomList', '登出前退出房间失败，继续清理本地状态', e);
    }
  }
  try {
    if ((store as any).isConnected) (store as any).isConnected = false;
  } catch (e) {
    logger.debug('ChatRoomList', '登出时重置连接状态失败', e);
  }
  store.logout();
  loginNameInput.value = '';
  loginNicknameInput.value = '';
  loginPasswordInput.value = '';
}

// ===== 房间操作 =====
const showCreateDialog = ref(false);
const showJoinDialog = ref(false);
const showEditDialog = ref(false);
const newRoomName = ref('');
const newRoomPassword = ref('');
const newRoomCover = ref('');
const joinRoomId = ref('');
const joinRoomPassword = ref('');
const joinPasswordInput = ref<HTMLInputElement | null>(null);
const editRoomId = ref('');
const editRoomName = ref('');
const editRoomCover = ref('');
const editCoverInput = ref<HTMLInputElement | null>(null);
const createCoverInput = ref<HTMLInputElement | null>(null);

// ===== 删除房间确认弹窗 =====
const showDeleteDialog = ref(false);
const pendingDeleteId = ref('');
const pendingDeleteName = ref('');
const deleting = ref(false);

// DakeMusic: 刷新 loading 状态
const refreshing = ref(false);
async function handleRefresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    // 强制跳过缓存，重新请求
    const { clearApiCache } = await import('@/utils/roomApi');
    clearApiCache();
    await store.fetchRooms();
  } finally {
    // 最少显示 500ms 动画，让用户感觉到刷新了
    setTimeout(() => {
      refreshing.value = false;
    }, 500);
  }
}

// ===== 通用确认弹窗（替代原生 confirm，与删除弹窗同一套渐变样式）=====
// message 用纯文本渲染（CSS white-space: pre-line），允许 \n 换行；
// 禁止使用 v-html —— 房间名/账号等用户内容会进入这里，拼接 HTML 会造成 XSS。
const confirmState = ref({
  show: false as boolean,
  title: '',
  message: '',
  confirmText: '确定',
  doing: false as boolean,
  onOk: null as null | (() => void | Promise<void>),
});

function askConfirm(
  title: string,
  message: string,
  onOk: () => void | Promise<void>,
  confirmText = '确定',
) {
  confirmState.value = { show: true, title, message, confirmText, doing: false, onOk };
}

function closeConfirm() {
  if (confirmState.value.doing) return; // 执行中禁止关闭，防重复提交
  confirmState.value.show = false;
  confirmState.value.onOk = null;
}

// ===== 错误提示弹窗（替代原生 alert，与确认弹窗同一套深色渐变样式）=====
const errorDialog = ref({
  show: false as boolean,
  title: '',
  message: '',
});

function showError(title: string, message: string) {
  errorDialog.value = { show: true, title, message };
}

function closeErrorDialog() {
  errorDialog.value.show = false;
}

/** 登录失效错误（服务端无 token / token 过期）统一中文提示。 */
function isAuthError(msg: string) {
  return msg === 'UNAUTHORIZED' || msg === 'TOKEN_EXPIRED';
}

async function runConfirm() {
  if (confirmState.value.doing) return;
  const fn = confirmState.value.onOk;
  if (!fn) {
    closeConfirm();
    return;
  }
  confirmState.value.doing = true;
  try {
    await fn();
  } catch (e: any) {
    const msg = e?.message || '操作失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('操作失败', msg);
  } finally {
    confirmState.value.doing = false;
    confirmState.value.show = false;
    confirmState.value.onOk = null;
  }
}

// ===== 当前所在房间（用于「重新进入」）=====
// 已连接且 currentRoomId 命中 → 视为当前所在房间
function isCurrentRoom(roomId: string) {
  return (
    !!store.isConnected && !!store.currentRoomId && String(store.currentRoomId) === String(roomId)
  );
}
// 曾经进过该房间（断线/收起悬浮窗残留也算）
function isLastRoom(roomId: string) {
  return (
    !store.isConnected && !!store.currentRoomId && String(store.currentRoomId) === String(roomId)
  );
}
// 重新进入：还连着就直接回房间页（复用连接，秒进，不重连不串房）
async function handleReenterRoom(room: any) {
  const roomId = String(room?.id || '');
  if (!roomId) return;
  if (isCurrentRoom(roomId)) {
    router.push('/main/chatroom/room');
    return;
  }
  // 断线残留 / 连在别的房间 → 走正常加入流程（有密码会自动弹框）
  await handleJoinRoom(roomId);
}

// 管理员面板
const showAdminPanel = ref(false);
const adminUsers = ref<any[]>([]);
const adminLoading = ref(false);

async function openAdminPanel() {
  showAdminPanel.value = true;
  await loadAdminUsers();
}
async function loadAdminUsers() {
  adminLoading.value = true;
  try {
    const result = await roomApi.listAdminUsers();
    adminUsers.value = result.list || [];
  } catch (e: any) {
    const msg = e?.message || '加载失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('加载失败', msg);
  } finally {
    adminLoading.value = false;
  }
}
async function grantAdmin(userId: number) {
  try {
    await roomApi.grantAdmin(userId);
    await loadAdminUsers();
  } catch (e: any) {
    const msg = e?.message || '操作失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('操作失败', msg);
  }
}
async function revokeAdmin(userId: number) {
  const u = adminUsers.value.find((x: any) => x.id === userId);
  askConfirm(
    '取消管理员',
    `确定取消「${u?.name || '该用户'}」的管理员权限吗？`,
    async () => {
      try {
        await roomApi.revokeAdmin(userId);
        await loadAdminUsers();
      } catch (e: any) {
        const msg = e?.message || '操作失败';
        if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
        else showError('操作失败', msg);
      }
    },
    '确定取消',
  );
}

// 管理员（已废弃，改用超级管理员账号绑定）
// const showAdminLogin = ref(false);
// const adminPasswordInput = ref('');
// const adminError = ref('');

onMounted(() => {
  if (store.isLoggedIn) store.fetchRooms();
});

onActivated(() => {
  if (store.isLoggedIn) store.fetchRooms();
});

function openCreateDialog() {
  newRoomName.value = '';
  newRoomPassword.value = '';
  newRoomCover.value = '';
  showCreateDialog.value = true;
}

async function handleCreateRoom() {
  if (!newRoomName.value.trim()) return;
  try {
    await store.createRoom(
      newRoomName.value.trim(),
      newRoomPassword.value || undefined,
      newRoomCover.value || undefined,
    );
    showCreateDialog.value = false;
    newRoomCover.value = '';
    router.push('/main/chatroom/room');
  } catch (e: any) {
    const msg = e?.message || '';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('创建失败', msg || '创建房间失败，请稍后再试。');
  }
}

async function handleJoinRoom(roomId: string) {
  const room = store.rooms.find((r) => r.id === roomId);
  // 已经在这个房间里了 → 直接回房间页
  if (isCurrentRoom(roomId)) {
    router.push('/main/chatroom/room');
    return;
  }
  // 连在别的房间 → 先退出旧房间，避免串房
  if (store.isConnected && typeof (store as any).leaveRoom === 'function') {
    try {
      await store.leaveRoom();
    } catch (e) {
      logger.debug('ChatRoomList', '切换房间前退出旧房间失败', e);
    }
  }
  // 没有密码的房间直接进
  if (!room?.hasPassword) {
    try {
      await store.joinRoom(roomId);
      router.push('/main/chatroom/room');
    } catch (e: any) {
      const msg = e?.message || '';
      if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
      else showError('加入失败', msg || '加入房间失败，请稍后再试。');
    }
    return;
  }
  // 有密码才弹密码框
  joinRoomId.value = roomId;
  joinRoomPassword.value = '';
  showJoinDialog.value = true;
  nextTick(() => joinPasswordInput.value?.focus());
}

async function confirmJoin() {
  try {
    await store.joinRoom(joinRoomId.value, joinRoomPassword.value || undefined);
    showJoinDialog.value = false;
    joinRoomPassword.value = '';
    router.push('/main/chatroom/room');
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg === '密码错误') showError('加入失败', '房间密码错误，请重新输入。');
    else if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('加入失败', msg || '加入房间失败，请稍后再试。');
  }
}

// 直接退出房间（列表页用）
async function leaveCurrentRoom() {
  if (!store.isConnected) return;
  try {
    if (typeof (store as any).leaveRoom === 'function') await store.leaveRoom();
  } catch (e: any) {
    const msg = e?.message || '退出失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('退出失败', msg);
  }
  try {
    if ((store as any).isConnected) (store as any).isConnected = false;
  } catch (e) {
    logger.debug('ChatRoomList', '重置连接状态失败', e);
  }
}

// ===== 默认房间封面 =====
// 哨兵值：代表"用系统默认封面"。房主上传后会变成真实图片数据，默认即消失。
const DEFAULT_COVER_KEY = '__dakemusic_default__';

const DEFAULT_COVER = defaultCover;

// 没有封面 / 是哨兵值 → 用默认封面；否则用房主上传的图
function coverSrc(cover?: string): string {
  if (!cover || cover === DEFAULT_COVER_KEY) return DEFAULT_COVER;
  return cover;
}

// 是否用的是默认封面（用于显示"更换封面"提示）
function isDefaultCover(cover?: string): boolean {
  return !cover || cover === DEFAULT_COVER_KEY;
}

// DakeMusic 语聊房模块 - 作者：知之Dake
// 描述：从 localStorage 读取我的头像（确保即使不在房间里也能显示）
const localMyAvatar = ref(localStorage.getItem('chatroom_avatarImage') || '');

// ===== 编辑房间 =====
function openEditDialog(room: any) {
  editRoomId.value = room.id;
  editRoomName.value = room.name;
  editRoomCover.value = isDefaultCover(room.coverImage) ? '' : room.coverImage;
  showEditDialog.value = true;
}

async function confirmEditRoom() {
  if (!editRoomName.value.trim()) return;
  try {
    await roomApi.updateRoom(
      editRoomId.value,
      editRoomName.value.trim(),
      undefined,
      editRoomCover.value,
    );
    showEditDialog.value = false;
    // DakeMusic: 如果编辑的是当前房间，同步更新 store 里的封面，悬浮窗即时生效
    if (store.currentRoomId === editRoomId.value) {
      store.currentRoomCoverImage = editRoomCover.value || '';
    }
    await store.fetchRooms();
  } catch (e: any) {
    const msg = e?.message || '修改失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('修改失败', msg);
  }
}

function handleDeleteRoom(roomId: string, roomName?: string) {
  pendingDeleteId.value = roomId;
  pendingDeleteName.value = roomName || '';
  showDeleteDialog.value = true;
}

function cancelDeleteRoom() {
  if (deleting.value) return;
  showDeleteDialog.value = false;
}

async function doDeleteRoom() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await roomApi.updateRoom(pendingDeleteId.value, undefined, undefined, undefined, true);
    showDeleteDialog.value = false;
    await store.fetchRooms();
  } catch (e: any) {
    const msg = e?.message || '删除失败';
    if (isAuthError(msg)) showError('登录已过期', '登录已过期，请重新登录后再试。');
    else showError('删除失败', msg);
  } finally {
    deleting.value = false;
  }
}

function onCreateCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showError('封面图过大', '封面图不能超过3MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    newRoomCover.value = reader.result as string;
  };
  reader.readAsDataURL(file);
}

function onEditCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showError('封面图过大', '封面图不能超过3MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    editRoomCover.value = reader.result as string;
  };
  reader.readAsDataURL(file);
}

// ===== 管理员（已废弃，改用超级管理员账号绑定）=====
</script>

<template>
  <div class="crl-page relative min-h-[calc(100vh-120px)]">
    <!-- DakeMusic 语聊房模块 - 作者：知之Dake -->
    <!-- 描述：自定义背景层 - 铺满整个内容区域 -->
    <div
      v-if="settingStore.chatroomBackgroundImage"
      class="crl-custom-bg"
      :style="{ backgroundImage: `url(${settingStore.chatroomBackgroundImage})` }"
    >
      <div
        class="crl-custom-bg-overlay"
        :style="{ opacity: settingStore.chatroomBackgroundOverlay / 100 }"
      ></div>
    </div>
    <div class="crl-root p-6 max-w-4xl mx-auto relative">
      <!-- 未登录：登录/注册页 -->
      <div v-if="!store.isLoggedIn" class="flex items-center justify-center min-h-[60vh]">
        <div
          class="crl-auth w-full max-w-md max-h-[calc(100vh-180px)] overflow-y-auto flex flex-col items-center"
        >
          <div
            class="w-20 h-20 rounded-full bg-[var(--control-track-bg)] border border-[var(--border-subtle)] flex items-center justify-center mb-3"
          >
            <svg
              viewBox="0 0 24 24"
              class="w-11 h-11 opacity-60"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
            </svg>
          </div>
          <p class="text-sm opacity-50 mb-6">未登录</p>
          <h1 class="text-3xl font-bold mb-2">DM-SmallRoom</h1>
          <p class="text-sm opacity-50 mb-8">
            {{ authMode === 'login' ? '登录后即可创建或加入房间' : '注册一个账号开始使用' }}
          </p>
          <div class="w-80 space-y-4">
            <div>
              <label class="block text-sm mb-1 opacity-70">
                {{ authMode === 'register' ? '账号' : '账号 / 昵称' }}
                <span class="text-xs opacity-50">{{
                  authMode === 'register' ? '（登录用，字母开头3-20位，注册后不可改）' : ''
                }}</span>
              </label>
              <input
                v-model="loginNameInput"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                :placeholder="authMode === 'register' ? '输入账号，如 Dake' : '输入账号或昵称'"
                @keyup.enter="handleAuth"
              />
            </div>
            <div v-if="authMode === 'register'">
              <label class="block text-sm mb-1 opacity-70"
                >昵称 <span class="text-xs opacity-50">（房间里的显示名，可随时改）</span></label
              >
              <input
                v-model="loginNicknameInput"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="输入昵称，留空则与账号相同"
                @keyup.enter="handleAuth"
              />
            </div>
            <div>
              <label class="block text-sm mb-1 opacity-70">密码</label>
              <input
                v-model="loginPasswordInput"
                type="password"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="输入密码（至少6位）"
                @keyup.enter="handleAuth"
              />
            </div>
            <div v-if="authMode === 'register'">
              <label class="block text-sm mb-1 opacity-70">确认密码</label>
              <input
                v-model="loginConfirmPassword"
                type="password"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="再次输入密码"
                @keyup.enter="handleAuth"
              />
            </div>
            <p v-if="loginError" class="text-red-500 text-sm">{{ loginError }}</p>
            <Button class="w-full" :disabled="isLoggingIn" @click="handleAuth">
              {{
                isLoggingIn
                  ? authMode === 'login'
                    ? '登录中...'
                    : '注册中...'
                  : authMode === 'login'
                    ? '登录'
                    : '注册'
              }}
            </Button>
            <p class="text-xs opacity-40 text-center">
              {{ authMode === 'login' ? '还没有账号？' : '已有账号？' }}
              <button class="text-[var(--color-primary)] hover:underline" @click="switchAuthMode">
                {{ authMode === 'login' ? '立即注册' : '去登录' }}
              </button>
            </p>
          </div>
        </div>
      </div>

      <!-- 已登录：房间列表 -->
      <template v-else>
        <div class="crl-topbar flex items-center mb-6">
          <h1 class="crl-title text-2xl font-bold">DM-SmallRoom</h1>
          <div class="crl-topbtns flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              class="crl-tbtn crl-tbtn-warn"
              :class="{ 'crl-tbtn-ghost': !store.isConnected }"
              :disabled="!store.isConnected"
              @click="leaveCurrentRoom"
              >退出当前房间</Button
            >
            <Button
              variant="outline"
              size="sm"
              class="crl-tbtn crl-tbtn-line"
              @click="router.push('/main/chatroom/profile')"
              >个人中心</Button
            >
            <Button
              variant="outline"
              size="sm"
              class="crl-tbtn crl-tbtn-line"
              :class="{ 'crl-tbtn-ghost': !store.isAdmin }"
              :disabled="!store.isAdmin"
              @click="openAdminPanel"
              >管理员</Button
            >
            <Button
              variant="outline"
              size="sm"
              class="crl-tbtn crl-tbtn-success"
              :disabled="refreshing"
              @click="handleRefresh"
            >
              <svg
                v-if="refreshing"
                class="inline-block w-4 h-4 mr-1 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {{ refreshing ? '刷新中...' : '刷新' }}
            </Button>
            <Button size="sm" class="crl-tbtn crl-tbtn-main" @click="openCreateDialog"
              >+ 创建房间</Button
            >
            <Button
              variant="outline"
              size="sm"
              class="crl-tbtn crl-tbtn-danger"
              @click="handleLogout"
              >退出</Button
            >
          </div>
        </div>

        <!-- 房间列表 -->
        <div v-if="store.rooms.length === 0" class="text-center py-20 opacity-40">
          暂无房间，创建一个吧
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="room in store.rooms"
            :key="room.id"
            class="crl-tilt-card border rounded-xl overflow-hidden transition-colors bg-[#0f0f1e]"
            :class="[
              { 'is-tilting': tiltHovering[room.id] },
              isCurrentRoom(room.id)
                ? 'border-green-500 shadow-[0_0_14px_rgba(34,197,94,0.28)]'
                : 'border-[var(--border-subtle)] hover:border-[var(--color-primary)]',
            ]"
            :style="tiltStyle(room.id)"
            @mousemove="onCardMove($event, room.id)"
            @mouseleave="onCardLeave(room.id)"
          >
            <!-- 封面图 -->
            <div class="aspect-square overflow-hidden relative">
              <img
                :src="coverSrc(room.coverImage)"
                class="crl-cover-img w-full h-full object-cover"
              />
              <!-- 底部渐变遮罩 -->
              <div
                class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"
              ></div>
              <span
                v-if="isCurrentRoom(room.id) || isLastRoom(room.id)"
                class="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white flex items-center gap-1"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  :class="isCurrentRoom(room.id) ? 'bg-green-400 animate-pulse' : 'bg-gray-400'"
                ></span>
                {{ isCurrentRoom(room.id) ? '当前房间' : '上次房间' }}
              </span>
              <!-- 成员头像组：最多3个，超过的 +N -->
              <div class="absolute bottom-3 left-3 flex items-center">
                <template v-if="isCurrentRoom(room.id)">
                  <!-- 当前房间：显示真实成员头像 -->
                  <template v-if="store.members.length > 0">
                    <div
                      v-for="(m, i) in store.members.slice(0, 3)"
                      :key="m.identity"
                      class="w-11 h-11 rounded-full border-2 border-black/50 overflow-hidden bg-gray-600 flex items-center justify-center text-[12px] font-bold text-white shadow-lg"
                      :style="{ marginLeft: i === 0 ? '0' : '-12px' }"
                    >
                      <img v-if="m.avatar" :src="m.avatar" class="w-full h-full object-cover" />
                      <svg
                        v-else
                        class="w-6 h-6 text-white/60"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                        />
                      </svg>
                    </div>
                    <!-- 超过3人，显示 +N -->
                    <div
                      v-if="store.members.length > 3"
                      class="w-11 h-11 rounded-full border-2 border-black/50 bg-black/70 flex items-center justify-center text-[12px] font-bold text-white shadow-lg"
                      style="margin-left: -12px"
                    >
                      +{{ store.members.length - 3 }}
                    </div>
                  </template>
                  <!-- 不在房间里，显示我的头像 -->
                  <div
                    v-else
                    class="w-11 h-11 rounded-full border-2 border-black/50 overflow-hidden bg-gray-600 flex items-center justify-center text-[12px] font-bold text-white shadow-lg"
                  >
                    <img
                      v-if="localMyAvatar"
                      :src="localMyAvatar"
                      class="w-full h-full object-cover"
                    />
                    <svg
                      v-else
                      class="w-6 h-6 text-white/60"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                      />
                    </svg>
                  </div>
                </template>
                <template v-else>
                  <!-- 其他房间：用占位头像显示人数 -->
                  <div
                    v-for="i in Math.min(room.participantCount, 3)"
                    :key="i"
                    class="w-11 h-11 rounded-full border-2 border-black/50 bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-[12px] font-bold text-white shadow-lg"
                    :style="{ marginLeft: i === 1 ? '0' : '-12px' }"
                  >
                    <svg class="w-6 h-6 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                      />
                    </svg>
                  </div>
                  <div
                    v-if="room.participantCount > 3"
                    class="w-11 h-11 rounded-full border-2 border-black/50 bg-black/70 flex items-center justify-center text-[12px] font-bold text-white shadow-lg"
                    style="margin-left: -12px"
                  >
                    +{{ room.participantCount - 3 }}
                  </div>
                </template>
              </div>
            </div>
            <div class="p-4 bg-gradient-to-b from-[#1a1a2e] to-[#0f0f1e]">
              <div class="flex items-start justify-between mb-2">
                <h3 class="font-bold text-lg truncate flex-1 text-white">{{ room.name }}</h3>
                <span
                  class="text-xs bg-white/10 px-2 py-0.5 rounded-full ml-2 shrink-0 text-white/80"
                >
                  {{ room.participantCount }} 人
                </span>
              </div>
              <p class="text-xs text-white/50 mb-3">
                房主：{{ room.ownerNickname || room.ownerName }} ·{{
                  new Date(room.createdAt).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </p>
              <div class="flex gap-2">
                <!-- 已在房间里 → 重新进入 -->
                <button
                  v-if="isCurrentRoom(room.id) || isLastRoom(room.id)"
                  class="flex-1 flex items-center justify-center px-3 py-1.5 rounded-full bg-[#0071e3] text-white text-sm font-semibold hover:opacity-90 hover:brightness-110 transition-all"
                  @click="handleReenterRoom(room)"
                >
                  重新进入
                </button>
                <!-- 正常加入 -->
                <button
                  v-else
                  class="flex-1 flex items-center justify-center px-3 py-1.5 rounded-full bg-[#0071e3] text-white text-sm font-semibold hover:opacity-90 hover:brightness-110 transition-all"
                  @click="handleJoinRoom(room.id)"
                >
                  加入房间
                </button>
                <template v-if="room.isOwner || room.isSuperAdmin">
                  <Tooltip content="编辑">
                    <template #trigger>
                      <button
                        class="w-9 h-9 flex items-center justify-center rounded-full bg-white/12 text-white/90 hover:bg-white/20 hover:text-white transition-all"
                        aria-label="编辑"
                        @click="openEditDialog(room)"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                    </template>
                  </Tooltip>
                  <Tooltip content="删除">
                    <template #trigger>
                      <button
                        class="w-9 h-9 flex items-center justify-center rounded-full bg-[#ff453a]/15 text-[#ff453a] hover:bg-[#ff453a]/25 transition-all"
                        aria-label="删除"
                        @click="handleDeleteRoom(room.id, room.name)"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </template>
                  </Tooltip>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 创建房间弹窗 -->
      <div
        v-if="showCreateDialog"
        class="crl-dialog-overlay fixed inset-0 flex items-center justify-center z-50"
        @click.self="showCreateDialog = false"
      >
        <div class="crl-dialog p-6 w-96">
          <h2 class="text-xl font-bold mb-4">创建房间</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm mb-1 opacity-70">房间名称</label>
              <input
                v-model="newRoomName"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="给房间起个名字"
              />
            </div>
            <div>
              <label class="block text-sm mb-1 opacity-70">房间密码（可选）</label>
              <input
                v-model="newRoomPassword"
                type="password"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="设置后加入需要密码"
              />
            </div>
            <div>
              <label class="block text-sm mb-1 opacity-70">房间封面</label>
              <div
                class="w-40 aspect-square rounded-lg overflow-hidden bg-[var(--control-track-bg)] border border-[var(--border-subtle)] mb-2"
              >
                <img :src="coverSrc(newRoomCover)" class="w-full h-full object-cover" />
              </div>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="createCoverInput?.click()"
                  >更换封面</Button
                >
                <Button v-if="newRoomCover" variant="ghost" size="sm" @click="newRoomCover = ''"
                  >恢复默认</Button
                >
                <span v-else class="text-xs opacity-40">当前：默认封面</span>
              </div>
              <input
                ref="createCoverInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onCreateCoverSelected"
              />
            </div>
            <div class="flex gap-2 pt-2">
              <Button variant="outline" class="flex-1" @click="showCreateDialog = false"
                >取消</Button
              >
              <Button class="flex-1" :disabled="store.isConnecting" @click="handleCreateRoom">
                {{ store.isConnecting ? '创建中...' : '创建' }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 加入房间弹窗 -->
      <div
        v-if="showJoinDialog"
        class="crl-dialog-overlay fixed inset-0 flex items-center justify-center z-50"
        @click.self="showJoinDialog = false"
      >
        <div class="crl-dialog p-6 w-96">
          <h2 class="text-xl font-bold mb-4">加入房间</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm mb-1 opacity-70">房间密码（无密码留空）</label>
              <input
                ref="joinPasswordInput"
                v-model="joinRoomPassword"
                type="password"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="输入房间密码"
                @keyup.enter="confirmJoin"
              />
            </div>
            <div class="flex gap-2 pt-2">
              <Button variant="outline" class="flex-1" @click="showJoinDialog = false">取消</Button>
              <Button class="flex-1" :disabled="store.isConnecting" @click="confirmJoin">
                {{ store.isConnecting ? '加入中...' : '加入' }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑房间弹窗 -->
      <div
        v-if="showEditDialog"
        class="crl-dialog-overlay fixed inset-0 flex items-center justify-center z-50"
        @click.self="showEditDialog = false"
      >
        <div class="crl-dialog p-6 w-96">
          <h2 class="text-xl font-bold mb-4">编辑房间</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm mb-1 opacity-70">房间名称</label>
              <input
                v-model="editRoomName"
                class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="房间名称"
              />
            </div>
            <div>
              <label class="block text-sm mb-1 opacity-70">房间封面</label>
              <div
                class="w-40 aspect-square rounded-lg overflow-hidden bg-[var(--control-track-bg)] border border-[var(--border-subtle)] mb-2"
              >
                <img :src="coverSrc(editRoomCover)" class="w-full h-full object-cover" />
              </div>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="editCoverInput?.click()"
                  >更换封面</Button
                >
                <Button v-if="editRoomCover" variant="ghost" size="sm" @click="editRoomCover = ''"
                  >恢复默认</Button
                >
                <span v-else class="text-xs opacity-40">当前：默认封面</span>
              </div>
              <input
                ref="editCoverInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onEditCoverSelected"
              />
            </div>
            <div class="flex gap-2 pt-2">
              <Button variant="outline" class="flex-1" @click="showEditDialog = false">取消</Button>
              <Button class="flex-1" @click="confirmEditRoom">保存</Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除房间确认弹窗 -->
      <div v-if="showDeleteDialog" class="cr-del-mask" @click.self="cancelDeleteRoom">
        <div class="cr-del-panel">
          <div class="cr-del-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
          </div>
          <div class="cr-del-title">删除房间</div>
          <div class="cr-del-text">
            确定删除<span v-if="pendingDeleteName" class="cr-del-name"
              >「{{ pendingDeleteName }}」</span
            >这个房间吗？
          </div>
          <div class="cr-del-sub">删除后房间内的成员将被移出，且无法恢复。</div>
          <div class="cr-del-btns">
            <button class="cr-del-btn cancel" :disabled="deleting" @click="cancelDeleteRoom">
              取消
            </button>
            <button class="cr-del-btn ok" :disabled="deleting" @click="doDeleteRoom">
              {{ deleting ? '删除中…' : '确定删除' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 通用确认弹窗（替代原生 confirm） -->
      <div v-if="confirmState.show" class="cr-del-mask" @click.self="closeConfirm">
        <div class="cr-del-panel">
          <div class="cr-del-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <div class="cr-del-title">{{ confirmState.title }}</div>
          <div class="cr-del-text">{{ confirmState.message }}</div>
          <div class="cr-del-btns">
            <button class="cr-del-btn cancel" :disabled="confirmState.doing" @click="closeConfirm">
              取消
            </button>
            <button class="cr-del-btn ok" :disabled="confirmState.doing" @click="runConfirm">
              {{ confirmState.doing ? '处理中…' : confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>

      <!-- 错误提示弹窗（替代原生 alert，深色渐变样式与删除/确认弹窗一致） -->
      <div v-if="errorDialog.show" class="cr-del-mask" @click.self="closeErrorDialog">
        <div class="cr-del-panel">
          <div class="cr-del-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div class="cr-del-title">{{ errorDialog.title }}</div>
          <div class="cr-del-text">{{ errorDialog.message }}</div>
          <div class="cr-del-btns">
            <button class="cr-del-btn ok" @click="closeErrorDialog">确定</button>
          </div>
        </div>
      </div>

      <!-- 管理员面板 -->
      <div
        v-if="showAdminPanel"
        class="crl-dialog-overlay fixed inset-0 flex items-center justify-center z-50"
        @click.self="showAdminPanel = false"
      >
        <div class="crl-dialog p-6 w-[28rem] max-h-[70vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">管理员</h2>
            <button
              class="opacity-50 hover:opacity-100 text-xl leading-none"
              @click="showAdminPanel = false"
            >
              ×
            </button>
          </div>
          <div v-if="adminLoading" class="text-center py-8 opacity-50">加载中...</div>
          <div v-else-if="adminUsers.length === 0" class="text-center py-8 opacity-50">
            暂无用户
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="u in adminUsers"
              :key="u.id"
              class="flex items-center justify-between p-2 rounded-lg bg-white/5"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-medium text-sm truncate">{{ u.name }}</span>
                <span
                  v-if="u.isAdmin"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 shrink-0"
                  >管理员</span
                >
              </div>
              <Button v-if="u.isAdmin" variant="ghost" size="sm" @click="revokeAdmin(u.id)"
                >取消</Button
              >
              <Button v-else variant="outline" size="sm" @click="grantAdmin(u.id)"
                >设为管理员</Button
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 房间弹窗：跟随播放器的毛玻璃质感（浅色/深色主题通用） */
.crl-dialog {
  background: color-mix(in srgb, var(--surface-dialog-base) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 90%, transparent);
  border-radius: 18px;
  color: var(--text-main);
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.22),
    0 2px 8px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 color-mix(in srgb, #ffffff 55%, transparent);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  backdrop-filter: blur(28px) saturate(160%);
}

.crl-dialog-overlay {
  background: color-mix(in srgb, #0b0f19 48%, transparent);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
  backdrop-filter: blur(10px) saturate(120%);
}

/* 关闭系统半透明效果时退回不透明面板，避免糊成一片 */
@media (prefers-reduced-transparency: reduce) {
  .crl-dialog {
    background: var(--surface-dialog-base);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .crl-dialog-overlay {
    background: rgba(11, 15, 25, 0.72);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
/* DakeMusic: 自定义背景层 */
.crl-custom-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}
.crl-custom-bg-overlay {
  position: absolute;
  inset: 0;
  background: #000;
}
/* 确保内容在背景层之上 */
.crl-root {
  position: relative;
  z-index: 1;
}

/* ===== 删除房间确认弹窗 ===== */
.cr-del-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
  animation: cr-del-fade 0.16s ease;
}
@keyframes cr-del-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.cr-del-panel {
  position: relative;
  width: 320px;
  padding: 26px 22px 20px;
  border-radius: 20px;
  text-align: center;
  color: #ececf1;
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(255, 77, 109, 0.18), transparent 62%),
    linear-gradient(150deg, rgba(46, 32, 62, 0.96), rgba(24, 22, 42, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  animation: cr-del-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes cr-del-pop {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.cr-del-icon {
  width: 54px;
  height: 54px;
  margin: 0 auto 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--color-accent-pink), #ff8a3d);
  box-shadow: 0 6px 18px rgba(255, 77, 109, 0.45);
}
.cr-del-icon svg {
  width: 26px;
  height: 26px;
}

.cr-del-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
}
.cr-del-text {
  font-size: 13px;
  color: #c8c8d8;
  line-height: 1.6;
  white-space: pre-line;
  word-break: break-word;
}
.cr-del-name {
  color: #ff8fa6;
  font-weight: 600;
}
.cr-del-sub {
  margin-top: 6px;
  font-size: 11px;
  color: #8f8fa6;
  line-height: 1.5;
}

.cr-del-btns {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.cr-del-btn {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition:
    transform 0.15s,
    filter 0.15s,
    box-shadow 0.15s;
}
.cr-del-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cr-del-btn:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.cr-del-btn.cancel {
  background: linear-gradient(135deg, var(--color-accent-purple), #00beff);
  box-shadow: 0 4px 14px rgba(138, 92, 255, 0.38);
}
.cr-del-btn.ok {
  background: linear-gradient(135deg, var(--color-accent-pink), #c8376d);
  box-shadow: 0 4px 14px rgba(255, 77, 109, 0.38);
}

/* ===== 登录/注册页：内容超出时可滚动，表单不会被底部播放条挡住 ===== */
.crl-auth {
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 140, 175, 0.45) transparent;
  overscroll-behavior: contain;
  padding: 2px 4px; /* 给滑块留边，滚动条不贴着输入框 */
}
.crl-auth::-webkit-scrollbar {
  width: 6px;
}
.crl-auth::-webkit-scrollbar-track {
  background: transparent;
}
.crl-auth::-webkit-scrollbar-thumb {
  background: rgba(140, 140, 175, 0.45);
  border-radius: 3px;
}
.crl-auth::-webkit-scrollbar-thumb:hover {
  background: rgba(140, 140, 175, 0.7);
}

/* ===== 顶部标题「DM-SmallRoom」：永远钉死在最左侧，不随按钮增减移动 ===== */
.crl-topbar {
  position: relative;
  flex-wrap: nowrap;
}

.crl-title {
  flex: none !important; /* 绝不伸缩：按钮变多变少都推不动它 */
  flex-shrink: 0 !important;
  white-space: nowrap !important; /* 永不换行/压缩 */
  margin-right: auto; /* 右侧空间全留给按钮组 */
  order: -1; /* 永远排在最前，防被其他元素挤到中间 */
}

/* ===== 顶部工具栏按钮：统一描边 + hover 渐变 ===== */
.crl-topbtns {
  gap: 8px;
  flex-wrap: nowrap !important; /* 永不换行，避免按钮折行导致整排跳动 */
  flex-shrink: 0 !important; /* 不被压缩，按钮始终完整显示 */
  justify-content: flex-end; /* 内部按钮一律靠右聚拢，中间不留缝 */
  margin-left: auto; /* 整组顶到最右侧 */
}

/* 不可用时彻底移出布局（不占宽度），保证按钮之间不留空档、整排紧贴右侧 */
.crl-tbtn-ghost {
  display: none !important;
  pointer-events: none !important;
  box-shadow: none !important;
}

.crl-tbtn {
  background: transparent !important;
  color: var(--text-secondary, #cfd0e0) !important;
  border: 1px solid var(--border-subtle, rgba(140, 140, 175, 0.38)) !important;
  border-radius: 10px !important;
  font-weight: 500 !important;
  backdrop-filter: blur(4px);
  transition:
    background 0.18s,
    color 0.18s,
    border-color 0.18s,
    box-shadow 0.18s,
    transform 0.18s !important;
}

/* 个人中心：蓝渐变（默认就有） */
.crl-tbtn-line {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(59, 130, 246, 0.35) !important;
}
.crl-tbtn-line:hover {
  filter: brightness(1.12);
  box-shadow: 0 5px 18px rgba(59, 130, 246, 0.5) !important;
  transform: translateY(-1px);
}

/* 刷新：绿渐变（默认就有） */
.crl-tbtn-success {
  background: linear-gradient(135deg, #10b981, #059669) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(16, 185, 129, 0.35) !important;
}
.crl-tbtn-success:hover {
  filter: brightness(1.12);
  box-shadow: 0 5px 18px rgba(16, 185, 129, 0.5) !important;
  transform: translateY(-1px);
}

/* 主操作：紫渐变（默认就有） */
.crl-tbtn-main {
  background: linear-gradient(135deg, #a855f7, #7c3aed) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(168, 85, 247, 0.35) !important;
}
.crl-tbtn-main:hover {
  filter: brightness(1.12);
  box-shadow: 0 5px 18px rgba(168, 85, 247, 0.5) !important;
  transform: translateY(-1px);
}

/* 退出当前房间：橙渐变（默认就有） */
.crl-tbtn-warn {
  background: linear-gradient(135deg, #ff8a3d, #f2612c) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(255, 138, 61, 0.35) !important;
}
.crl-tbtn-warn:hover {
  filter: brightness(1.12);
  box-shadow: 0 5px 18px rgba(255, 138, 61, 0.5) !important;
  transform: translateY(-1px);
}

/* 退出登录：红渐变（默认就有） */
.crl-tbtn-danger {
  background: linear-gradient(135deg, var(--color-accent-pink), #c8376d) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(255, 77, 109, 0.35) !important;
}
.crl-tbtn-danger:hover {
  filter: brightness(1.12);
  box-shadow: 0 5px 18px rgba(255, 77, 109, 0.5) !important;
  transform: translateY(-1px);
}

.crl-tbtn:active {
  transform: translateY(0) scale(0.97);
}

/* ===== 房间卡片 3D 倾斜动效 ===== */
.crl-tilt-card {
  /* 倾斜由内联 transform 驱动（perspective + rotateX/Y + scale）；
     transform-style 让内部封面随卡片一起做 3D 变换 */
  transform-style: preserve-3d;
  will-change: transform;
  /* 默认开启过渡：鼠标离开时平滑回正 */
  transition:
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* 跟随阶段：关闭过渡，让倾斜实时跟手（无拖影） */
.crl-tilt-card.is-tilting {
  transition:
    transform 0.08s ease-out,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* 悬停立体感：封面轻微放大，遮住倾斜时露出的边角 */
.crl-cover-img {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.crl-tilt-card.is-tilting .crl-cover-img {
  transform: scale(1.06);
}
</style>
