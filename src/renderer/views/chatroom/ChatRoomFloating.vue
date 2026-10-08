<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ChatRoomFloating.vue
  描述：悬浮窗组件 - 可拖动的悬浮房间卡片 / 收起态小圆钮
-->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
// DakeMusic: 默认房间封面
import defaultCover from '../../../../public/dakemusic-default-room-cover.png';

const store = useChatRoomStore();
const router = useRouter();
const route = useRoute();

// 位置
const pos = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const dragStart = ref({ x: 0, y: 0 });

// 收起状态：true = 缩成侧边可拖动小圆钮
const collapsed = ref(false);
const dotPos = ref({ x: 0, y: 0 });
let dragMode = 'card'; // 'card' | 'dot'
let dotMoved = false;  // 小圆钮是否真拖动过（区分拖动与点击）

// 退出确认弹窗
const showLeaveConfirm = ref(false);

// 默认房间封面（与房间列表页、房间内页完全一致）
const DEFAULT_COVER_KEY = '__dakemusic_default__';

const DEFAULT_COVER = defaultCover;

const coverSrc = computed(() => {
  const c = (store as any).currentRoomCoverImage;
  if (!c || c === DEFAULT_COVER_KEY) return DEFAULT_COVER;
  return c;
});

// 是否显示：已连接 且 不在房间内页
// 必须同时满足：已登录 + 已连接 + 不在房间内页
// 加 isLoggedIn 是为了兜底「已登出但 LiveKit 连接还挂着」的残留显示
const visible = computed(() => {
  return !!store.isLoggedIn && !!store.isConnected && route.path !== '/main/chatroom/room';
});

// 彻底断开：leaveRoom 之后再兜底把 isConnected 置 false
// （store.resetState() 不会主动清 isConnected，它依赖 onDisconnected 回调；
//   回调没触发时悬浮窗会一直挂着，所以需要这层保险）
async function hardLeave() {
  try {
    if (typeof (store as any).leaveRoom === 'function') await store.leaveRoom();
  } catch (e) {
    console.error('[Float] 退出房间失败', e);
  }
  try {
    if ((store as any).isConnected) (store as any).isConnected = false;
  } catch {}
}

// 登出守卫：任何地方触发登出，都自动退房并隐藏悬浮窗
watch(() => store.isLoggedIn, (ok) => {
  if (ok) return;
  showLeaveConfirm.value = false;
  if (store.isConnected) hardLeave();
});

// DakeMusic: 每次新进入房间，悬浮窗默认收起成小圆钮，不展开
watch(() => store.isConnected, (connected, old) => {
  if (connected && !old) {
    collapsed.value = true;
    try { localStorage.setItem('chatroom_float_collapsed', '1'); } catch {}
  }
});

// 悬浮窗尺寸（与模板保持一致，用于边界收敛）
const CARD_W = 300;
const CARD_H = 104;
const DOT_SIZE = 46;

// 把坐标收敛到可视区内，避免窗口缩小后悬浮窗跑出屏幕看不见
function clampPos(x: number, y: number) {
  const maxX = Math.max(0, window.innerWidth - CARD_W);
  const maxY = Math.max(0, window.innerHeight - CARD_H);
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(0, Math.min(maxY, y)),
  };
}

function clampDotPos(x: number, y: number) {
  const maxX = Math.max(0, window.innerWidth - DOT_SIZE);
  const maxY = Math.max(0, window.innerHeight - DOT_SIZE);
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(0, Math.min(maxY, y)),
  };
}

function onResize() {
  pos.value = clampPos(pos.value.x, pos.value.y);
  dotPos.value = clampDotPos(dotPos.value.x, dotPos.value.y);
}

// 初始化位置：优先读上次记忆，否则右下角
onMounted(() => {
  let saved: any = null;
  try {
    const raw = localStorage.getItem('chatroom_float_pos');
    if (raw) saved = JSON.parse(raw);
  } catch {}
  const x = Number(saved?.x);
  const y = Number(saved?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    pos.value = clampPos(x, y);
  } else {
    pos.value = clampPos(window.innerWidth - CARD_W - 24, window.innerHeight - CARD_H - 110);
  }
  try {
    collapsed.value = localStorage.getItem('chatroom_float_collapsed') === '1';
    const rawD = localStorage.getItem('chatroom_float_dotpos');
    if (rawD) {
      const d = JSON.parse(rawD);
      if (Number.isFinite(Number(d?.x)) && Number.isFinite(Number(d?.y))) {
        dotPos.value = clampDotPos(Number(d.x), Number(d.y));
      }
    }
  } catch {}
  if (!Number.isFinite(dotPos.value.x) || (dotPos.value.x === 0 && dotPos.value.y === 0)) {
    dotPos.value = clampDotPos(window.innerWidth - DOT_SIZE - 10, Math.round(window.innerHeight / 2));
  }
  window.addEventListener('resize', onResize);
});

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('button')) return;  // 点按钮不拖
  e.preventDefault();   // 防止拖拽时选中文本
  dragging.value = true;
  dragMode = 'card';
  dragOffset.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// 小圆钮拖拽
function onDotDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('button')) return;
  e.preventDefault();
  dragging.value = true;
  dragMode = 'dot';
  dotMoved = false;
  dragStart.value = { x: e.clientX, y: e.clientY };
  dragOffset.value = { x: e.clientX - dotPos.value.x, y: e.clientY - dotPos.value.y };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!dragging.value) return;
  const nx = e.clientX - dragOffset.value.x;
  const ny = e.clientY - dragOffset.value.y;
  if (dragMode === 'dot') {
    if (Math.abs(e.clientX - dragStart.value.x) > 4 || Math.abs(e.clientY - dragStart.value.y) > 4) dotMoved = true;
    dotPos.value = clampDotPos(nx, ny);
  } else {
    pos.value = clampPos(nx, ny);
  }
}

function onMouseUp() {
  dragging.value = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  try {
    if (dragMode === 'dot') localStorage.setItem('chatroom_float_dotpos', JSON.stringify(dotPos.value));
    else localStorage.setItem('chatroom_float_pos', JSON.stringify(pos.value));
  } catch {}
  if (dragMode === 'dot' && !dotMoved) uncollapse();   // 没移动 = 点击 = 展开
}

// 收起到侧边小圆钮
function collapse() {
  collapsed.value = true;
  try { localStorage.setItem('chatroom_float_collapsed', '1'); } catch {}
}

// 从小圆钮展开回卡片
function uncollapse() {
  collapsed.value = false;
  try { localStorage.setItem('chatroom_float_collapsed', '0'); } catch {}
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('resize', onResize);
});

// 回到房间
function expand() {
  router.push('/main/chatroom/room');
}

// 返回房间列表（保持连接，悬浮窗继续显示）
function backToList() {
  router.push('/main/chatroom');
}

// 点关闭：先弹确认
function leave() {
  showLeaveConfirm.value = true;
}

// 取消
function cancelLeave() {
  showLeaveConfirm.value = false;
}

// 真正退出房间
async function doLeave() {
  showLeaveConfirm.value = false;
  await hardLeave();
}

// 切换麦：走 store（共享真相源），房间内的 watch 会自动同步到底部按钮与成员列表
async function toggleMic() {
  try {
    await store.toggleMute();
  } catch (e) {
    console.error('[Float] 切换麦克风失败', e);
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed z-[9999] select-none"
      :style="collapsed
        ? { left: dotPos.x + 'px', top: dotPos.y + 'px' }
        : { left: pos.x + 'px', top: pos.y + 'px' }"
    >
      <!-- 收起态：可拖动的小圆钮 -->
      <div
        v-if="collapsed"
        class="crf-dotbtn"
        :class="store.isMicEnabled ? 'on' : 'off'"
        title="点击展开房间卡片（可拖动）"
        @mousedown="onDotDown"
      >
        <img :src="coverSrc" alt="房间封面" class="crf-dotimg" />
        <span class="crf-dotbadge"></span>
        <span class="crf-dotcount">{{ store.memberCount }}</span>
      </div>

      <div v-else class="crf-card" @mousedown="onMouseDown">
        <!-- 左侧封面 -->
        <div class="crf-cover">
          <img :src="coverSrc" alt="房间封面" draggable="false" />
        </div>

        <!-- 房间信息 -->
        <div class="crf-info">
          <div class="crf-line1">
            <span class="crf-dot"></span>
            <span class="crf-rid" :title="store.currentRoomId || ''">当前房间</span>
          </div>
          <div class="crf-name">{{ store.currentRoomName || 'DM-SmallRoom' }}</div>
          <div class="crf-line3">
            <span class="crf-online">{{ store.memberCount }} 人在线</span>
            <button
              class="crf-micbtn"
              :class="store.isMicEnabled ? 'on' : 'off'"
              :title="store.isMicEnabled ? '点击闭麦' : '点击开麦'"
              @click.stop="toggleMic"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <template v-if="store.isMicEnabled">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </template>
                <template v-else>
                  <line x1="2" y1="2" x2="22" y2="22"/>
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
                  <path d="M5 10v2a7 7 0 0 0 12 5"/>
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </template>
              </svg>
              <span>{{ store.isMicEnabled ? '已开麦' : '已闭麦' }}</span>
            </button>
          </div>
        </div>

        <!-- 右侧竖排按钮 -->
        <div class="crf-acts">
          <button class="crf-act" title="返回房间列表" @click.stop="backToList">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 14 4 9 9 4"/>
              <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
          <button class="crf-act fold" title="收起侧栏" @click.stop="collapse">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button class="crf-act home" title="回到房间" @click.stop="expand">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/>
            </svg>
          </button>
          <button class="crf-act close" title="退出房间" @click.stop="leave">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 退出确认弹窗 -->
  <Teleport to="body">
    <div
      v-if="showLeaveConfirm"
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      @click.self="cancelLeave"
    >
      <div class="pop-panel w-[290px] rounded-2xl px-5 py-5 text-center">
        <!-- 图标 -->
        <div class="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-gradient-to-br from-[#ff8a5c] to-[#c8376d] shadow-[0_6px_18px_rgba(255,77,109,.45)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <!-- 标题 -->
        <div class="text-[15px] font-bold text-white mb-1.5">退出房间</div>
        <!-- 正文 -->
        <div class="text-[12px] leading-relaxed text-white/55 mb-5">
          确定要退出「{{ store.currentRoomName || '当前房间' }}」吗？<br />
          退出后需要重新加入。
        </div>
        <!-- 按钮 -->
        <div class="flex items-center gap-2.5">
          <button
            class="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[#8a5cff] to-[#00beff] shadow-[0_4px_14px_rgba(138,92,255,.42)] transition-all hover:brightness-110 hover:-translate-y-px active:translate-y-0"
            @click.stop="cancelLeave"
          >
            取消
          </button>
          <button
            class="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[#ff4d6d] to-[#c8376d] shadow-[0_4px_14px_rgba(255,77,109,.42)] transition-all hover:brightness-110 hover:-translate-y-px active:translate-y-0"
            @click.stop="doLeave"
          >
            确定退出
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.crf-card {
  width: 300px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  cursor: move;
  background: linear-gradient(150deg, rgba(31,26,54,.96), rgba(17,17,32,.96));
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 16px 44px rgba(0,0,0,.55), 0 0 34px rgba(138,92,255,.16);
  backdrop-filter: blur(10px);
}
.crf-cover {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  overflow: hidden;
  flex: none;
  background: #14121f;
  border: 1px solid rgba(255,255,255,.08);
}
.crf-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }

.crf-info { flex: 1; min-width: 0; }
.crf-line1 { display: flex; align-items: center; gap: 5px; }
.crf-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #22c55e; flex: none;
  box-shadow: 0 0 6px rgba(34,197,94,.8);
  animation: crf-breathe 1.6s ease-in-out infinite;
}
@keyframes crf-breathe {
  0%,100% { opacity: 1; }
  50% { opacity: .35; }
}
.crf-rid { font-size: 11px; color: rgba(255,255,255,.45); font-weight: 600; }
.crf-name {
  font-size: 14px; font-weight: 700; color: #eef0ff;
  margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.crf-line3 { display: flex; align-items: center; gap: 8px; margin-top: 5px; }
.crf-online { font-size: 11px; color: rgba(255,255,255,.5); flex: none; }
.crf-dotbtn {
  position: relative;
  width: 46px; height: 46px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  background: linear-gradient(150deg, rgba(31,26,54,.96), rgba(17,17,32,.96));
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 10px 28px rgba(0,0,0,.5), 0 0 20px rgba(138,92,255,.22);
  backdrop-filter: blur(10px);
  transition: transform .16s, filter .16s, border-color .16s;
  overflow: hidden;
}
.crf-dotimg {
  width: 100%; height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.crf-dotbtn:hover { transform: scale(1.08); filter: brightness(1.18); }
.crf-dotbtn.on  { border-color: rgba(56, 224, 208, .6); }
.crf-dotbtn.off { border-color: rgba(255, 107, 134, .6); }
.crf-dotbadge {
  position: absolute; top: -1px; right: -1px;
  width: 9px; height: 9px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.85);
  border: 1.5px solid #14121f;
  animation: crf-breathe 1.6s ease-in-out infinite;
}
.crf-dotcount {
  position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%);
  font-size: 9px; font-weight: 700; color: #eef0ff; line-height: 12px;
  padding: 0 4px; border-radius: 8px;
  background: rgba(10,10,20,.94); border: 1px solid rgba(255,255,255,.14);
}
.crf-act.fold:hover { color: #b79cff; background: rgba(138,92,255,.18); }

.crf-micbtn {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 7px; border-radius: 10px;
  font-size: 10px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; transition: all .16s;
}
.crf-micbtn.on  { color: #38e0d0; background: rgba(56,224,208,.14); border-color: rgba(56,224,208,.3); }
.crf-micbtn.off { color: #ff6b86; background: rgba(255,77,109,.14); border-color: rgba(255,77,109,.3); }
.crf-micbtn:hover { filter: brightness(1.25); }

.crf-acts { display: flex; flex-direction: column; gap: 5px; flex: none; }
.crf-act {
  width: 26px; height: 26px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.55); cursor: pointer;
  border: 1px solid transparent; transition: all .16s;
}
.crf-act:hover { background: rgba(138,92,255,.18); color: #b9a6ff; border-color: rgba(138,92,255,.35); }
.crf-act.home:hover { background: rgba(0,190,255,.16); color: #7fdcff; border-color: rgba(0,190,255,.35); }
.crf-act.close:hover { background: rgba(255,77,109,.18); color: #ff6b86; border-color: rgba(255,77,109,.4); }

.pop-panel {
  position: relative;
  background: linear-gradient(150deg, rgba(38,30,66,.97), rgba(22,22,40,.97));
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 18px 50px rgba(0,0,0,.6), 0 0 40px rgba(138,92,255,.18);
  overflow: hidden;
  animation: pop-in .2s cubic-bezier(.34,1.56,.64,1);
}
.pop-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 18% 0%, rgba(138,92,255,.28), transparent 62%);
  pointer-events: none;
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(.9); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
