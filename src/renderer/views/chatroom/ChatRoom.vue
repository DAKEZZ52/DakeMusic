<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ChatRoom.vue
  描述：语聊房主界面 - 左侧成员栏 + 右侧聊天/歌词区 + 底部控制栏
-->
<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
const myAvatarImage = ref('');
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useSettingStore } from '@/stores/setting';
import Button from '@/components/ui/Button.vue';
import { roomApi } from '@/utils/roomApi';
import { getActivePinia } from 'pinia';
// DakeMusic: 默认房间封面
import defaultCover from '../../../../public/dakemusic-default-room-cover.png';

const router = useRouter();
const store = useChatRoomStore();
// DakeMusic: 设置 store（用于自定义背景）
const settingStore = useSettingStore();

const messageInput = ref('');
const messageInputEl = ref<HTMLInputElement | null>(null);
const chatContainer = ref<HTMLElement | null>(null);

// 用户资料弹窗
const showUserProfile = ref(false);
const viewingUser = ref<any>(null);
const loadingUser = ref(false);

async function openUserProfile(identity?: string) {
  // DakeMusic: 防止 identity 为 undefined 时报错
  if (!identity) return;
  const userId = Number(identity.replace('user_', ''));
  if (!userId) return;
  loadingUser.value = true;
  viewingUser.value = null;
  showUserProfile.value = true;
  try {
    viewingUser.value = await roomApi.getUser(userId);
  } catch (e) {
    viewingUser.value = { error: '加载失败' };
  } finally {
    loadingUser.value = false;
  }
}
function openPhoto(url: string) {
  window.open(url, '_blank');
}
const showEmojiPicker = ref(false);
const isSystemMuted = ref(false);


/* ================= 歌词面板（自动对接 DakeMusic 播放器状态） ================= */
import { usePlayerStore } from '@/stores/player';
import { useLyricStore } from '@/stores/lyric';

// 显式导入两个核心store
const playerStore = usePlayerStore();
const lyricStore = useLyricStore();

const lyricTick = ref(0);
const lyricCollapsed = ref(false);
const lyricBox = ref<HTMLElement | null>(null);
let lyricTimer: any = null;
let watchBroadcastStop: (()=>void)|null = null;

// 远端接收的歌词同步数据
const remoteLyricData = ref({
  lines: [] as Array<{time:number;text:string}>,
  currentIndex: -1,
  songTitle: '',
  songArtist: '',
  timestamp: 0
})

// 判断：本机是否为播放源（房主作为播放源）
const isLocalSongSource = computed(()=>{
  return !!store.isOwner;
})

// 250ms定时器驱动 computed 更新
onMounted(()=>{
  lyricTimer = setInterval(()=>{
    lyricTick.value++;
  },250);
})

onUnmounted(()=>{
  if(lyricTimer) clearInterval(lyricTimer);
  if(watchBroadcastStop) watchBroadcastStop();
})

// 歌曲信息：本地优先；非播放源使用远端数据
const currentSong = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    return playerStore.currentTrackSnapshot;
  }
  return null;
})

const songTitle = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    const s = currentSong.value;
    return s ? (s.title ?? s.name ?? '') : '';
  }
  return remoteLyricData.value.songTitle;
})

const songArtist = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    const s = currentSong.value;
    if(!s) return '';
    if(Array.isArray(s.artists)) return s.artists.map(a=>a.name).join(' / ')
    return s.artist ?? '';
  }
  return remoteLyricData.value.songArtist;
})

const playTime = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    return playerStore.currentTime ?? 0;
  }
  return 0;
})

const isPlaying = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    return playerStore.isPlaying ?? false;
  }
  return false;
})

// 歌词数组：本机播放源读lyricStore，其他人接收远端广播
const lyricLines = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    return lyricStore.lines ?? [];
  }
  return remoteLyricData.value.lines;
})

// 当前高亮行下标
const activeLyricIndex = computed(()=>{
  void lyricTick.value;
  if(isLocalSongSource.value){
    if(typeof lyricStore.currentIndex === 'number'){
      const idx = lyricStore.currentIndex;
      if(idx >=0 && idx < lyricLines.value.length){
        return idx;
      }
    }
    //兜底二分查找
    const t = playTime.value;
    const lines = lyricLines.value;
    if(!lines.length) return -1;
    let lo = 0, hi = lines.length -1, ans = 0;
    while(lo <= hi){
      const mid = (lo + hi) >>1;
      if(lines[mid].time <= t){
        ans = mid;
        lo = mid + 1;
      }else{
        hi = mid -1;
      }
    }
    return ans;
  }else{
    // 听众端直接用广播过来的下标
    return remoteLyricData.value.currentIndex ?? -1;
  }
})

// 歌词滚动居中
watch(activeLyricIndex,async (i)=>{
  if(i <0 || lyricCollapsed.value) return;
  await nextTick();
  const box = lyricBox.value;
  if(!box) return;
  const el = box.querySelector('.cr-lyric-line.active') as HTMLElement|null;
  if(!el) return;
  const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight /2;
  try{
    box.scrollTo({top, behavior:'smooth'})
  }catch{
    box.scrollTop = top;
  }
})

// ---------------- LiveKit 自定义数据通道 歌词广播 ----------------
/** 房主发送歌词同步消息 */
async function broadcastLyricSync(){
  try {
    const room = await getLKRoom();
    if(!room?.localParticipant) return;
    const payload = JSON.stringify({
      type:'lyric-sync',
      lines: lyricStore.lines,
      currentIndex: lyricStore.currentIndex,
      songTitle: songTitle.value,
      songArtist: songArtist.value,
      time: Date.now()
    })
    const buf = new TextEncoder().encode(payload);
    await room.localParticipant.publishData(buf, { reliable:true });
  }catch(err){
    console.warn('[歌词广播发送失败]', err);
  }
}

/** 接收房间二进制data消息 */
function onRoomDataReceived(data: Uint8Array){
  try{
    const jsonStr = new TextDecoder().decode(data);
    const obj = JSON.parse(jsonStr);
    if(obj.type === 'lyric-sync'){
      remoteLyricData.value.lines = obj.lines ?? [];
      remoteLyricData.value.currentIndex = obj.currentIndex ?? -1;
      remoteLyricData.value.songTitle = obj.songTitle ?? '';
      remoteLyricData.value.songArtist = obj.songArtist ?? '';
      remoteLyricData.value.timestamp = obj.time ?? 0;
    }
  }catch(e){
    /*忽略其他消息*/
  }
}


// 挂载：注册监听；房主开启定时广播
onMounted(()=>{
  const roomPromise = getLKRoom();
  roomPromise.then(room=>{
    if(!room) return;
    room.on('dataReceived', onRoomDataReceived);

    // 只有房主开启监听 + 定时推送歌词
    if(isLocalSongSource.value){
      watchBroadcastStop = watch(
        [()=>lyricStore.lines, ()=>lyricStore.currentIndex],
        ()=>broadcastLyricSync(),
        {deep:true}
      )
      // 兜底1秒一次广播，防止丢包
      setInterval(()=>{
        if(isLocalSongSource.value) broadcastLyricSync();
      },1000)
    }
  })
})

// 卸载：移除事件监听
onUnmounted(()=>{
  const roomPromise = getLKRoom();
  roomPromise.then(room=>{
    if(room){
      room.off('dataReceived', onRoomDataReceived);
    }
  })
})
/* =============== 歌词面板 END =============== */




// ===== 房间封面：房主没上传时，显示 DakeMusic 默认封面 =====
const DEFAULT_COVER_KEY = '__dakemusic_default__';

const DEFAULT_COVER = defaultCover;
const roomCoverSrc = computed(() => {
  const c = (store as any).currentRoomCoverImage;
  if (!c || c === DEFAULT_COVER_KEY) return DEFAULT_COVER;
  return c;
});

// 房间公告
const roomAnnouncement = ref('');
const showAnnouncementEdit = ref(false);
const editAnnouncement = ref('');
// ===== 通用确认弹窗（替代原生 confirm，全站同一套渐变样式）=====
// message 支持 <br/> 换行；内容均为内部常量，v-html 安全
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
  if (confirmState.value.doing) return;   // 执行中禁止关闭，防重复提交
  confirmState.value.show = false;
  confirmState.value.onOk = null;
}

async function runConfirm() {
  if (confirmState.value.doing) return;
  const fn = confirmState.value.onOk;
  if (!fn) { closeConfirm(); return; }
  confirmState.value.doing = true;
  try {
    await fn();
  } catch (e: any) {
    alert(e.message || '操作失败');
  } finally {
    confirmState.value.doing = false;
    confirmState.value.show = false;
    confirmState.value.onOk = null;
  }
}
const isRoomOwner = computed(() => store.isOwner);
const isAdmin = computed(() => store.isOwner || store.isAdmin);

// 当前正在说话的成员（取第一个 isSpeaking 的）
const currentSpeaker = computed(() => {
  const list = store.members || [];
  return list.find(m => m.isSpeaking) || null;
});
// 说话人头像
function speakerAvatar(identity: string) {
  return (store as any).memberAvatars?.[identity] || '';
}

watch(() => store.currentRoomDescription, (v) => { roomAnnouncement.value = v || ''; }, { immediate: true });

function openAnnouncementEdit() {
  editAnnouncement.value = roomAnnouncement.value;
  showAnnouncementEdit.value = true;
}
async function saveAnnouncement() {
  try {
    await roomApi.updateRoom(store.currentRoomId || '', undefined, editAnnouncement.value.trim());
    roomAnnouncement.value = editAnnouncement.value.trim();
    showAnnouncementEdit.value = false;
  } catch (e: any) {
    alert(e.message || '保存失败');
  }
}

// 右键管理菜单（房主/管理员可用）
const contextMenu = ref({ show: false, x: 0, y: 0, member: null as any });
function onMemberContextMenu(e: MouseEvent, member: any) {
  if (!isAdmin.value) return;
  if (member.isLocal) return;
  e.preventDefault();
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, member };
}
function closeContextMenu() {
  contextMenu.value.show = false;
  contextMenu.value.member = null;
}
async function adminToggleMute() {
  const m = contextMenu.value.member;
  if (!m) return;
  await store.muteParticipant(m.identity, !m.isMuted);
  closeContextMenu();
}
async function adminToggleBan() {
  const m = contextMenu.value.member;
  if (!m) return;
  const banned = store.isBanned(m.identity);
  await store.banParticipant(m.identity, !banned);
  closeContextMenu();
}
async function adminKickMember() {
  const m = contextMenu.value.member;
  if (!m) return;
  closeContextMenu();   // 先关菜单，避免盖住确认弹窗
  askConfirm('踢出成员', `确定要踢出「${m.name}」吗？<br/>踢出后 TA 需要重新加入。`, async () => {
    await store.kickParticipant(m.identity);
  }, '确定踢出');
}

const sortedMessages = computed(() => store.sortedMessages);

// ===== 本地提示（进房/他人进出，只显示在自己屏幕，不发到房间）=====
// 提示钉在聊天区顶部：不参与消息排序、不追加到末尾、不触发自动下滑
const localNotices = ref<Array<{ id: string; type: string; content: string }>>([]);
let noticeSeq = 0;
let noticeTimer: any = null;
const NOTICE_TTL = 5000;   // 单条提示停留时长（毫秒）

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
  if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
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
  } catch {}
  clearNoticeTimer();
  localNotices.value = [];
}

// ===== 成员进出监听（用 identity 追踪，同名也不会重复）=====
const STABLE_MS = 1200;   // 成员名单稳定多久才建基线
const GRACE_MS  = 3000;   // 进房宽限期：这期间到达的人视为「本来就在」

let memberBaselineReady = false;                // 基线是否已建立
const knownMembers = new Map<string, string>(); // identity -> name
const recentNotice = new Map<string, number>(); // 事件去重：key -> 时间戳
let baselineTimer: any = null;                  // 稳定防抖计时器
let graceUntil = 0;                             // 宽限期截止时刻
let trackedRoomKey = '';                        // 当前追踪的房间标识

function noticeOnce(key: string, content: string) {
  const now = Date.now();
  const last = recentNotice.get(key) || 0;
  if (now - last < 5000) return;   // 5 秒内同一事件只提示一次
  recentNotice.set(key, now);
  pushNotice(content);
}

// 换房间 / 重连：彻底重置追踪状态，防止把上一个房间的人串进来
function resetMemberTracking(roomKey: string) {
  if (baselineTimer) { clearTimeout(baselineTimer); baselineTimer = null; }
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
watch(() => `${store.currentRoomId || ''}|${store.isConnected}`, (key) => {
  if (key === trackedRoomKey) return;
  resetMemberTracking(key);
  clearNoticeTimer();
  localNotices.value = [];   // 清掉上一个房间残留的进出提示
});

watch(() => store.members, (list: any) => {
  const arr = Array.isArray(list) ? list : [];
  const cur = snapshotMembers(arr);

  // 基线未建立：成员是异步陆续到达的，等名单稳定后再锁定基线
  if (!memberBaselineReady) {
    if (baselineTimer) clearTimeout(baselineTimer);
    baselineTimer = setTimeout(() => {
      baselineTimer = null;
      knownMembers.clear();
      snapshotMembers(Array.isArray(store.members) ? store.members : [])
        .forEach((v, k) => knownMembers.set(k, v));
      memberBaselineReady = true;
    }, STABLE_MS);
    return;
  }

  const inGrace = Date.now() < graceUntil;   // 宽限期内不提示任何人

  // 新来的
  cur.forEach((name, id) => {
    if (!knownMembers.has(id)) {
      if (inGrace) { knownMembers.set(id, name); return; }  // 视为本来就在
      noticeOnce(`in_${id}`, `${name} 进入房间`);
    }
  });
  // 走了的
  knownMembers.forEach((name, id) => {
    if (!cur.has(id)) {
      if (inGrace) { knownMembers.delete(id); return; }     // 宽限期内消失也不提示
      noticeOnce(`out_${id}`, `${name} 离开了房间`);
      recentNotice.delete(`in_${id}`);   // 清掉进入记录，下次进来还能提示
    }
  });

  knownMembers.clear();
  cur.forEach((v, k) => knownMembers.set(k, v));
}, { deep: false });

onMounted(() => {
  if (!store.isLoggedIn || !store.isConnected) {
    router.replace('/main/chatroom');
    return;
  }
  myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
  window.addEventListener('storage', onStorageChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  navigator.mediaDevices?.addEventListener?.('devicechange', adsLoad);
  nextTick(() => messageInputEl.value?.focus());
  adsRestore();
  adsLoad();
  // 首次挂载：建立房间追踪基线（并清掉可能残留的旧提示）
  resetMemberTracking(`${store.currentRoomId || ''}|${store.isConnected}`);
  clearNoticeTimer();
  localNotices.value = [];
  // 进房后同步一次真实麦状态，避免开局就出现「底部闭麦、列表开麦」的不同步
  setTimeout(() => { adsSyncFromRoom(); }, 600);
});

function onBeforeUnload() {
  if (store.isConnected && store.currentRoomId) {
    store.leaveRoom().catch(() => {});
  }
}

watch(() => store.isConnected, (connected) => {
  if (connected) {
    myAvatarImage.value = localStorage.getItem('chatroom_avatarImage') || '';
    nextTick(() => messageInputEl.value?.focus());
    setTimeout(() => { adsSyncFromRoom(); }, 600);
  }
});

function onStorageChange(e: StorageEvent) {
  if (e.key === 'chatroom_avatarImage') myAvatarImage.value = e.newValue || '';
}

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
}
watch(() => store.messages.length, () => scrollToBottom());

async function sendMessage() {
  if (!messageInput.value.trim()) return;
  try {
    await store.sendMessage(messageInput.value);
    messageInput.value = '';
  } catch (e: any) {
    alert(e.message || '发送失败');
  }
}

async function toggleMic() {
  // 注意：store 没有 mySeatIndex()，不要调用它
  // 统一走 adsToggleMic（单一真相源），避免两处逻辑各写一套导致状态漂移
  await adsToggleMic();
}

function collapseToFloating() {
  router.back();
}

const emojiList = ['😀','😂','🥰','😎','🤔','😴','😭','😡','👍','👏','🙏','💪','🎉','🔥','❤️','💕','🎵','🎶','🎤','🎸','🎹','🥁','🎧','☕','🍺','🌹','✨','💯','🤣','😊','😍','🤩','😇','🤗','🤭','🤫','😏','😒','🙄','😬','🤮','🤧','🥵','🥶','😱','😨','😢','😤','😠','🤬','🤯','😳','🥺','😻','💀','👻','🤖','👽','🎃','😺','🐱','🐶','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦐','🦀','🐟','🐬','🐳','🦈','🐊','🐅','🦓','🦒','🐘','🦏','🐪','🐫','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🐇','🐿','🦔','🦥','🦦','🦨','🦘','🦡','🐾'];
function insertEmoji(emoji: string) {
  messageInput.value += emoji;
  showEmojiPicker.value = false;
}

async function toggleSystemMute() {
  try {
    const electronAny = window.electron as any;
    if (electronAny?.setSystemMuted) {
      isSystemMuted.value = await electronAny.setSystemMuted(!isSystemMuted.value);
    } else {
      isSystemMuted.value = !isSystemMuted.value;
    }
  } catch {
    isSystemMuted.value = !isSystemMuted.value;
  }
}

const fetchedAvatars = new Set<string>();
function memberAvatar(identity?: string) {
  // DakeMusic: 防止 identity 为 undefined 时报错
  if (!identity) return '';
  if (store.memberAvatars[identity]) return store.memberAvatars[identity];
  const m = store.members.find(x => x.identity === identity);
  if (m?.avatar) return m.avatar;
  if (identity === store.myIdentity) return myAvatarImage.value;
  if (!fetchedAvatars.has(identity)) {
    fetchedAvatars.add(identity);
    const userId = Number(identity.replace('user_', ''));
    if (userId) {
      roomApi.getUser(userId).then((user: any) => {
        if (user?.avatar) store.memberAvatars[identity] = user.avatar;
      }).catch(() => {
        // 失败就放开标记，下次渲染可以重试（换房/网络恢复后能补上头像）
        fetchedAvatars.delete(identity);
      });
    }
  }
  return '';
}

function askLeaveRoom() {
  askConfirm('退出房间', '确定要退出当前房间吗？<br/>退出后需要重新加入。', async () => {
    await store.leaveRoom();
    router.replace('/main/chatroom');
  }, '确定退出');
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ===== 左侧栏宽度：可拖拽 + 记忆 =====
const sideW = ref(Number(localStorage.getItem('chatroom_sideW') || 260));
const sideDragging = ref(false);
function onSideResizeStart(e: MouseEvent) {
  sideDragging.value = true;
  e.preventDefault();
  const startX = e.clientX;
  const startW = sideW.value;
  const onMove = (ev: MouseEvent) => {
    const w = startW + (ev.clientX - startX);
    sideW.value = Math.min(420, Math.max(180, w));
  };
  const onUp = () => {
    sideDragging.value = false;
    localStorage.setItem('chatroom_sideW', String(Math.round(sideW.value)));
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
function onSideResizeDblClick() {
  sideW.value = 260;
  localStorage.setItem('chatroom_sideW', '260');
}

// ===== 音频设备：合并为单一胶囊（内联，不依赖子组件）=====
const adsOpen = ref(false);
const adsMics = ref<any[]>([]);
const adsSpeakers = ref<any[]>([]);
const adsMicId = ref('');
const adsSpeakerId = ref('');
const adsSpeakerVol = ref(85);
const adsMicVol = ref(60);
const adsSwitching = ref(false);
// ===== 麦克风状态：单一真相源 =====
// 之前底部按钮读 store.isMuted、成员列表读 member.isMuted，两个数据源各自为政 → 不同步
// 现在统一为 adsMuted（true = 已闭麦），两边都读它，永不漂移
// 初值跟随 store（store 默认 isMuted=true），避免开局就「底部开麦、列表闭麦」
const adsMuted = ref(!!(store as any).isMuted);
const adsMicOn = computed(() => !adsMuted.value);

// 成员列表读这个：自己读真相源，其他成员读 member.isMuted
function micMutedOf(member: any): boolean {
  if (member?.isLocal) return adsMuted.value;
  return !!member?.isMuted;
}

// 输出静音：只控制「你听到房间里别人的声音」，不影响你的麦克风输入
// 注意：这里不是监听(sidetone)。监听会把自己的麦克风声回放到耳机，
// 走机架时会和湿声叠加导致重音，因此已彻底移除。
const adsSpeakerMuted = ref(false);
function toggleSpeakerMute() {
  adsSpeakerMuted.value = !adsSpeakerMuted.value;
  adsApplyVol();
  adsSave();
}

// 安全获取 LiveKit room：路径/导出不对只返回 null，绝不阻断模块加载
async function getLKRoom(): Promise<any> {
  try {
    const mod: any = await import('@/utils/livekitClient');
    const fn = mod?.getLiveKitClient || mod?.default?.getLiveKitClient;
    const client = fn ? fn() : mod?.default;
    const room = client?.room || client?.currentRoom || null;
    if (!room) console.warn('[ADS] 未获取到 LiveKit room（可能未连接）');
    return room;
  } catch (e) {
    console.warn('[ADS] livekitClient 导入失败，麦克风增益不可用', e);
    return null;
  }
}

// ===== 麦克风「输入增益」：真实控制传到房间的音量 =====
// 链路：麦克风 → AudioContext Source → GainNode → MediaStreamDestination
//      → 用 LiveKit 官方 LocalAudioTrack 包装 → publishTrack
// 关键：绝不能直接 publishTrack(原生 MediaStreamTrack)，必须官方类包装，
//      否则 LiveKit 调 .mute()/.unmute()/.on() 会报 xxx is not a function
const micGainReady = ref(false);
let micGainCtx: any = null;
let micGainSrc: any = null;
let micGainNode: any = null;
let micGainDest: any = null;
let micRawStream: MediaStream | null = null;
let micLkTrack: any = null;

function cleanupMicGain() {
  try { micGainSrc?.disconnect(); } catch {}
  try { micGainNode?.disconnect(); } catch {}
  try { micGainDest?.disconnect(); } catch {}
  if (micRawStream) { micRawStream.getTracks().forEach((t: any) => t.stop()); micRawStream = null; }
  try { micGainCtx?.close(); } catch {}
  micGainCtx = micGainSrc = micGainNode = micGainDest = null;
  micLkTrack = null;
  micGainReady.value = false;
}

// 建立增益链并用官方类包装成 LocalAudioTrack
async function buildGainTrack(deviceId?: string): Promise<any> {
  const AC: any = window.AudioContext || (window as any).webkitAudioContext;
  micGainCtx = new AC();
  micRawStream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true
  });
  micGainSrc = micGainCtx.createMediaStreamSource(micRawStream);
  micGainNode = micGainCtx.createGain();
  micGainNode.gain.value = adsMicVol.value / 100;
  micGainDest = micGainCtx.createMediaStreamDestination();
  micGainSrc.connect(micGainNode);
  micGainNode.connect(micGainDest);

  // 取出处理后的原生轨道
  const processed: any = micGainDest.stream.getAudioTracks()[0];

  // 用 LiveKit 官方类包装（多版本兼容）
  const lk: any = await import('livekit-client');
  if (typeof lk.LocalAudioTrack === 'function') {
    return new lk.LocalAudioTrack(processed);
  }
  if (typeof lk.createLocalAudioTrack === 'function') {
    return await lk.createLocalAudioTrack(processed);
  }
  throw new Error('livekit-client 未提供 LocalAudioTrack');
}

// 发布带增益的麦克风轨道（替换掉当前已发布的轨道）
async function publishGainMic(deviceId?: string): Promise<boolean> {
  try {
    const room: any = await getLKRoom();
    const lp = room?.localParticipant;
    if (!lp) return false;

    const oldGain = micGainNode;
    const track = await buildGainTrack(deviceId);
    if (oldGain) { try { oldGain.disconnect(); } catch {} }

    // 卸载旧音频轨道
    try {
      for (const pub of lp.audioTrackPublications.values()) {
        const t = (pub as any).track ?? pub;
        if (t) { try { await lp.unpublishTrack(t); } catch {} }
      }
    } catch {}

    await lp.publishTrack(track, { source: 'microphone' });
    micLkTrack = track;
    micGainReady.value = true;
    return true;
  } catch (e) {
    console.error('[ADS] 建立输入增益失败', e);
    cleanupMicGain();
    return false;
  }
}

// 开麦前确保增益链已建立（失败则自动退回普通模式，不阻断）
async function ensureMicGain() {
  if (micGainReady.value) return;
  const room: any = await getLKRoom();
  if (!room?.localParticipant) return; // 还没进房，跳过
  const ok = await publishGainMic(adsMicId.value || undefined);
  if (!ok) {
    console.warn('[ADS] 输入增益不可用，已退回普通麦克风模式');
  }
}

// 麦克风音量：实时改 GainNode（不重新发布轨道，零风险）
function applyMicGain() {
  // 输入增益（传到房间的音量）
  if (micGainNode) {
    try { micGainNode.gain.value = adsMicVol.value / 100; } catch {}
  }
}
watch(adsMicVol, applyMicGain);

// ===== 设备选择记忆：下次进房自动套用，不用每次重选机架设备 =====
const ADS_KEY = 'chatroom_ads_devices';
function adsRestore() {
  try {
    const raw = localStorage.getItem(ADS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o?.micId) adsMicId.value = o.micId;
    if (o?.speakerId) adsSpeakerId.value = o.speakerId;
    if (typeof o?.micVol === 'number') adsMicVol.value = o.micVol;
    if (typeof o?.speakerVol === 'number') adsSpeakerVol.value = o.speakerVol;
    if (typeof o?.speakerMuted === 'boolean') adsSpeakerMuted.value = o.speakerMuted;
    setTimeout(() => adsApplyVol(), 0);
  } catch {}
}
function adsSave() {
  try {
    localStorage.setItem(ADS_KEY, JSON.stringify({
      micId: adsMicId.value,
      speakerId: adsSpeakerId.value,
      micVol: adsMicVol.value,
      speakerVol: adsSpeakerVol.value,
      speakerMuted: adsSpeakerMuted.value
    }));
  } catch {}
}

async function adsLoad() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t: any) => t.stop());
  } catch {}
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    adsMics.value = ds.filter((d: any) => d.kind === 'audioinput');
    adsSpeakers.value = ds.filter((d: any) => d.kind === 'audiooutput');
    // 记忆优先：上次选过且设备还在 → 自动套用
    const hasMic = adsMics.value.some((d: any) => d.deviceId === adsMicId.value);
    const hasSpk = adsSpeakers.value.some((d: any) => d.deviceId === adsSpeakerId.value);
    if (!hasMic && adsMics.value[0]) adsMicId.value = adsMics.value[0].deviceId;
    if (!hasSpk && adsSpeakers.value[0]) adsSpeakerId.value = adsSpeakers.value[0].deviceId;
  } catch {}
}

function adsShort(l: string): string {
  if (!l) return '';
  const c = l.replace(/\s*\([^)]*\)\s*$/g, '');
  return c.length > 16 ? c.slice(0, 16) + '…' : c;
}

// 虚拟声卡 / 机架输出识别：名字含以下关键词就打 🔌 标记
function isVirtDevice(label: string): boolean {
  const l = (label || '').toLowerCase();
  return ['总线', 'virtual', 'vrec', 'playback', 'cable', 'voicemeeter',
          'stereo mix', '立体声混音', 'loopback', '混音', 'vb-audio'].some(k => l.includes(k));
}
const adsMicLabel = computed(() => {
  const d = adsMics.value.find((x: any) => x.deviceId === adsMicId.value);
  return adsShort(d?.label || '') || '麦克风';
});
const adsSpeakerLabel = computed(() => {
  const d = adsSpeakers.value.find((x: any) => x.deviceId === adsSpeakerId.value);
  return adsShort(d?.label || '') || '扬声器';
});

// 从 LiveKit 回读真实麦状态（不猜），读不到返回 null
async function readRealMuted(): Promise<boolean | null> {
  try {
    const room: any = await getLKRoom();
    const lp = room?.localParticipant;
    if (!lp) return null;
    try {
      for (const pub of lp.audioTrackPublications.values()) {
        const p: any = pub;
        if (typeof p?.isMuted === 'boolean') return p.isMuted;
        const t = p?.track;
        if (t && typeof t.isMuted === 'boolean') return t.isMuted;
        if (t && typeof t.enabled === 'boolean') return !t.enabled;
      }
    } catch {}
    if (typeof lp.isMicrophoneEnabled === 'boolean') return !lp.isMicrophoneEnabled;
  } catch {}
  return null;
}

// 一次写入三处：真相源 + store + 成员列表自己那条，保证底部按钮和列表永远一致
function adsSetMuted(muted: boolean) {
  adsMuted.value = muted;
  const s: any = store;
  // store 侧：优先用 setter；只有状态不一致时才翻转，绝不无脑调 toggleMute
  try {
    if (typeof s.setMuted === 'function') s.setMuted(muted);
    else if (typeof s.setMicMuted === 'function') s.setMicMuted(muted);
    else if (typeof s.setMicrophoneEnabled === 'function') s.setMicrophoneEnabled(!muted);
    else if (s.isMuted !== muted && typeof s.toggleMute === 'function') s.toggleMute();
  } catch {}
  // 兜底对齐：store.toggleMute 内部有「未上麦不允许开麦」的业务约束会直接 return，
  // 那样 store.isMuted 不翻转 → 悬浮窗（读 store.isMicEnabled）会跟房间内显示不一致。
  // 这里直接写 ref 强制对齐，不改动 toggleMute 本身的逻辑。
  try { if (s.isMuted !== muted) s.isMuted = muted; } catch {}
  // 成员列表自己那条
  try {
    const self = (store.members || []).find((m: any) => m.isLocal);
    if (self) self.isMuted = muted;
  } catch {}
}

// 进房后同步一次真实状态，避免开局就出现「底部闭麦、列表开麦」
async function adsSyncFromRoom() {
  const real = await readRealMuted();
  if (real !== null) adsSetMuted(real);
}

async function adsToggleMic() {
  if (adsSwitching.value) return;
  adsSwitching.value = true;
  try {
    // 注意：store 没有 mySeatIndex()，绝对不能调用，否则报 is not a function

    // 1) 以 LiveKit 真实状态为准，不猜
    const real = await readRealMuted();
    const curMuted = real ?? adsMuted.value;
    // setMicrophoneEnabled(x) 的 x 是「是否启用麦克风」
    // 当前闭麦(true) → 点击要开麦 → 传 true；当前开麦(false) → 要闭麦 → 传 false
    const wantEnabled = curMuted;

    // 2) 开麦前先建立「输入增益」链路（让音量滑块真实作用于房间）
    if (wantEnabled) {
      try { await ensureMicGain(); } catch {}
    }

    // 3) 真实操作 LiveKit（唯一入口，不再调 store.toggleMute 造成二次翻转）
    try {
      const room: any = await getLKRoom();
      const lp = room?.localParticipant;
      if (lp && typeof lp.setMicrophoneEnabled === 'function') {
        await lp.setMicrophoneEnabled(wantEnabled);
      }
    } catch (e) {
      console.error('[ADS] LiveKit 开关麦克风失败', e);
    }

    // 4) 写入单一真相源：底部按钮 + 成员列表 + store 一次到位
    adsSetMuted(!wantEnabled);

    // 5) 复查：350ms 后读真实状态，不一致就纠正
    setTimeout(async () => {
      const after = await readRealMuted();
      if (after !== null && after !== adsMuted.value) adsSetMuted(after);
    }, 350);
  } catch (e) {
    console.error('[ADS] 切换麦克风失败', e);
  } finally {
    adsSwitching.value = false;
  }
}

// 反向同步：房主闭麦你 / 服务端回推状态时，自动同步到真相源
watch(() => (store as any).isMuted, (v) => {
  if (typeof v === 'boolean' && v !== adsMuted.value) {
    adsMuted.value = v;
    try {
      const self = (store.members || []).find((m: any) => m.isLocal);
      if (self) self.isMuted = v;
    } catch {}
  }
});

async function adsChangeMic(id: string) {
  try {
    // 增益模式：换设备必须重建整条链路，否则会绕过 GainNode
    if (micGainReady.value) {
      const ok = await publishGainMic(id);
      if (ok) return;
    }
    const room: any = await getLKRoom();
    if (room?.switchActiveDevice) await room.switchActiveDevice('audioinput', id);
  } catch (e) {
    console.error('[ADS] 切换麦克风设备失败', e);
  }
}

function adsChangeSpeaker(id: string) {
  document.querySelectorAll('audio.lk-voice-audio').forEach((el: any) => {
    if (el.setSinkId) el.setSinkId(id).catch(() => {});
  });
}

function adsApplyVol() {
  const v = adsSpeakerMuted.value ? 0 : adsSpeakerVol.value / 100;
  document.querySelectorAll('audio.lk-voice-audio').forEach((el: any) => {
    el.volume = v;
  });
}

watch(adsMicId, (id) => { if (id) { adsChangeMic(id); adsSave(); } });
watch(adsSpeakerId, (id) => { if (id) { adsChangeSpeaker(id); adsSave(); } });
watch(adsSpeakerVol, () => { adsApplyVol(); adsSave(); });
watch(adsMicVol, () => adsSave());

onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange);
  window.removeEventListener('beforeunload', onBeforeUnload);
  navigator.mediaDevices?.removeEventListener?.('devicechange', adsLoad);
  cleanupMicGain();
  if (baselineTimer) { clearTimeout(baselineTimer); baselineTimer = null; }
});
</script>

<template>
<div class="cr-root">
  <!-- DakeMusic 语聊房模块 - 作者：知之Dake -->
  <!-- 描述：自定义背景层 -->
  <div v-if="settingStore.chatroomBackgroundImage" class="cr-custom-bg" :style="{ backgroundImage: `url(${settingStore.chatroomBackgroundImage})` }">
    <div class="cr-custom-bg-overlay" :style="{ opacity: settingStore.chatroomBackgroundOverlay / 100 }"></div>
  </div>
  <!-- 顶部栏 -->
  <div class="cr-topbar">
      <button class="cr-icon-btn" title="收起为悬浮窗" @click="collapseToFloating">
        <span>←</span>
      </button>
      <div class="cr-title">
        <div class="cr-title-name">{{ store.currentRoomName }}</div>
        <div class="cr-title-sub">{{ store.memberCount }} 人在线</div>
      </div>
      <div class="cr-status">
        <span class="cr-status-dot"></span>
        <span>语音已连接</span>
      </div>
  </div>
  <!-- 主体 -->
  <div class="cr-body">
    <!-- 左侧：房间信息 + 公告 + 成员 -->
    <aside class="cr-side" :class="{ resizing: sideDragging }" :style="{ width: sideW + 'px' }">
      <!-- 房间卡片 -->
      <div class="cr-room-card">
        <div class="cr-room-cover">
          <img :src="roomCoverSrc" alt="房间封面" />
        </div>
        <div class="cr-room-meta">
          <div class="cr-room-name">{{ store.currentRoomName }}</div>
          <div class="cr-room-owner">房主：{{ store.currentRoomOwnerName || '未知' }}</div>
        </div>
      </div>
      <!-- 公告 -->
      <div class="cr-notice">
        <div class="cr-notice-head">
          <span>📢 房间公告</span>
          <button v-if="isRoomOwner" class="cr-notice-edit" @click="openAnnouncementEdit">编辑</button>
        </div>
        <div v-if="roomAnnouncement" class="cr-notice-text">{{ roomAnnouncement }}</div>
        <div v-else class="cr-notice-empty">{{ isRoomOwner ? '点击编辑设置公告' : '暂无公告' }}</div>
      </div>
      <!-- 成员 -->
      <div class="cr-member-head">
        <span>成员 ({{ store.memberCount }})</span>
        
      </div>
      <div class="cr-member-list">
        <div
          v-for="member in store.members"
          :key="member.identity"
          class="cr-member"
          :class="{
            'is-active': contextMenu.show && contextMenu.member?.identity === member.identity,
            'is-owner': member.isOwner,
            'is-admin': member.isAdmin && !member.isOwner,
            'is-banned': store.isBanned(member.identity),
            'is-speaking': member.isSpeaking
          }"
          @click.stop="openUserProfile(member.identity)"
          @contextmenu="onMemberContextMenu($event, member)"
        >
          <div class="cr-avatar-wrap">
            <div
              class="cr-avatar"
              :class="{
                'is-speaking': member.isSpeaking,
                'role-owner': member.isOwner,
                'role-admin': member.isAdmin && !member.isOwner,
                'is-banned': store.isBanned(member.identity)
              }"
            >
              <img v-if="memberAvatar(member.identity)" :src="memberAvatar(member.identity)" />
              <svg v-else class="cr-av-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8"/></svg>
            </div>
            <span class="cr-mic-badge" :class="micMutedOf(member) ? 'off' : 'on'">
              <svg v-if="micMutedOf(member)" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
            </span>
          </div>
          <div class="cr-member-info">
            <div class="cr-member-name">
              <span class="truncate">{{ member.name }}</span>
              <span v-if="member.isOwner" class="cr-badge owner" title="房主"><i>👑</i>房主</span>
              <span v-else-if="member.isAdmin" class="cr-badge admin" title="管理员"><i>🛡️</i>管理</span>
              <span v-if="member.isLocal" class="cr-badge me">我</span>
              <span v-if="store.isBanned(member.identity)" class="cr-badge ban" title="已被禁言"><i>🚫</i>禁言</span>
            </div>
            <div class="cr-member-state">
              <span v-if="member.isSpeaking" class="speaking"><span class="cr-wave"><i></i><i></i><i></i><i></i></span>正在说话</span>
              <span v-else-if="store.isBanned(member.identity)" class="banned">🚫 已禁言</span>
              <span v-else>{{ micMutedOf(member) ? '已闭麦' : '已开麦' }}</span>
            </div>
          </div>
          <!-- hover 快捷管理（仅管理员对他人可见） -->
          <button
            v-if="isAdmin && !member.isLocal"
            class="cr-member-more"
            title="管理该成员"
            @click.stop="onMemberContextMenu($event, member)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </button>
        </div>
      </div>
    </aside>
    <!-- 拖拽调宽手柄 -->
    <div
      class="cr-side-resizer"
      :class="{ active: sideDragging }"
      title="拖动调整宽度（双击恢复默认）"
      @mousedown="onSideResizeStart"
      @dblclick="onSideResizeDblClick"
    ></div>
    <!-- 右侧：聊天舞台 -->
    <section class="cr-stage">
      <!-- 歌词大框 -->
      <div class="cr-lyric">
        <div class="cr-lyric-head">
          <div class="cr-lyric-title">
            <svg class="cr-lyric-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
            <span class="cr-lyric-song">{{ songTitle || '暂无播放' }}</span>
            <span v-if="songArtist" class="cr-lyric-artist">{{ songArtist }}</span>
            <span v-if="isPlaying" class="cr-lyric-live" title="正在播放"><i></i><i></i><i></i></span>
          </div>
          <button
            class="cr-lyric-btn"
            :title="lyricCollapsed ? '展开歌词' : '收起歌词'"
            @click="lyricCollapsed = !lyricCollapsed"
          >
            <svg v-if="lyricCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
        <div v-show="!lyricCollapsed" ref="lyricBox" class="cr-lyric-body">
          <template v-if="lyricLines.length">
            <div
              v-for="(ln, i) in lyricLines"
              :key="i"
              class="cr-lyric-line"
              :class="{ active: i === activeLyricIndex, near: Math.abs(i - activeLyricIndex) === 1 }"
            >{{ ln.text }}</div>
          </template>
          <div v-else class="cr-lyric-empty">
            暂无歌词
          </div>
        </div>
      </div>
      <div ref="chatContainer" class="cr-scroll">
        <!-- 进出房间提示：钉在聊天区顶部，不参与排序也不滚动 -->
        <div v-if="localNotices.length" class="cr-top-notice">
          <span class="cr-system">{{ localNotices[localNotices.length - 1].content }}</span>
        </div>
        <template v-if="hasAnyMessage">
          <div
            v-for="msg in displayMessages"
            :key="msg.id"
            class="cr-row"
            :class="msg.type === 'system' ? 'center' : (msg.senderIdentity === store.myIdentity ? 'mine' : 'other')"
          >
            <div v-if="msg.type === 'system'" class="cr-system">{{ msg.content }}</div>
            <div v-else class="cr-msg">
              <!-- 发送者头像：点击看资料 -->
              <div
                class="cr-msg-av"
                :title="msg.senderName"
                @click="openUserProfile(msg.senderIdentity)"
              >
                <img v-if="memberAvatar(msg.senderIdentity)" :src="memberAvatar(msg.senderIdentity)" />
                <svg v-else class="cr-av-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8"/></svg>
              </div>
              <div class="cr-msg-body">
                <div class="cr-msg-meta">
                  <span class="cr-msg-name" @click="openUserProfile(msg.senderIdentity)">{{ msg.senderName }}</span>
                  <span class="cr-msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div class="cr-bubble">{{ msg.content }}</div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="cr-empty">
          <div class="cr-skeleton s1"></div>
          <div class="cr-skeleton s2"></div>
          <div class="cr-skeleton s3"></div>
        </div>
      </div>
      <!-- 正在说话的人：浮动头像标识 -->
      <div v-if="currentSpeaker" class="speaking-badge">
        <div class="speaking-badge-avatar">
          <img v-if="speakerAvatar(currentSpeaker.identity)" :src="speakerAvatar(currentSpeaker.identity)" />
          <svg v-else class="cr-av-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8"/></svg>
        </div>
        <div class="speaking-badge-info">
          <div class="speaking-badge-name">{{ currentSpeaker.name }}</div>
          <div class="speaking-badge-wave"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>
    </section>
  </div>
  <!-- 底部控制栏 -->
  <div class="cr-bottom">
    <!-- 左下：麦克风 / 音量 / 耳机监听 / 设置 -->
    <div class="cr-bar">
      <button
        class="cr-bar-btn"
        :class="adsMicOn ? 'on' : 'off'"
        :title="adsMicOn ? '闭麦' : '开麦'"
        :disabled="adsSwitching"
        @click.stop="adsToggleMic"
      >
        <svg v-if="adsMicOn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
      </button>
      <!-- 耳机：静音 / 恢复房间声音。不是监听，不影响你的麦克风输入 -->
      <button
        class="cr-bar-btn"
        :class="adsSpeakerMuted ? 'off' : 'on'"
        :title="adsSpeakerMuted ? '恢复房间声音' : '静音:不听王八念经'"
        @click.stop="toggleSpeakerMute"
      >
        <svg v-if="!adsSpeakerMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
      </button>
      <!-- 常驻音量条：麦克风 + 扬声器，不用点开，随时可拖 -->
      <div class="cr-vol-inline" @click.stop>
        <svg class="cr-vol-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M19 11h-2v2c0 2.76-2.24 5-5 5s-5-2.24-5-5v-2H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92v-2z"/></svg>
        <input
          type="range" min="0" max="100" v-model.number="adsMicVol"
          class="cr-pop-range uni" :style="{ '--vol': adsMicVol + '%' }"
          title="麦克风:大声发啊，这么大声"
        />
        <span class="cr-vol-val">{{ adsMicVol }}</span>
        <span class="cr-vol-sep"></span>
        <svg class="cr-vol-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
        <input
          type="range" min="0" max="100" v-model.number="adsSpeakerVol"
          class="cr-pop-range uni" :style="{ '--vol': adsSpeakerMuted ? '0%' : adsSpeakerVol + '%' }"
          title="扬声器：你是蚊子亲戚啊？"
        />
        <span class="cr-vol-val">{{ adsSpeakerMuted ? 0 : adsSpeakerVol }}</span>
      </div>
      <button class="cr-bar-btn" title="音频设置" @click.stop="() => { adsOpen = true; adsLoad(); }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
      <Teleport to="body">
        <div v-if="adsOpen" class="ads-mask" @click.self="adsOpen = false">
          <div class="ads-panel" @click.stop>
            <div class="ads-panel-head">
              <span>音频设置</span>
              <button class="ads-x" @click="adsOpen = false">×</button>
            </div>
            <!-- 输入：麦克风 / 机架输出（唱歌总线） -->
            <div class="ads-block">
              <div class="ads-label">
                输入设备（麦克风 / 机架输出）
                <span v-if="isVirtDevice(adsMicLabel)" class="ads-virt">🔌 虚拟</span>
              </div>
              <select v-model="adsMicId" class="ads-select">
                <option v-if="!adsMics.length" value="">未检测到输入设备</option>
                <option v-for="d in adsMics" :key="d.deviceId" :value="d.deviceId">
                  {{ isVirtDevice(d.label) ? '🔌 ' : '' }}{{ d.label || '输入设备' }}
                </option>
              </select>
              <div class="ads-vol">
                <svg class="ads-vi" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M19 11h-2v2c0 2.76-2.24 5-5 5s-5-2.24-5-5v-2H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92v-2z"/></svg>
                <input type="range" min="0" max="100" v-model.number="adsMicVol" class="ads-range uni" :style="{ '--vol': adsMicVol + '%' }" />
                <span class="ads-val">{{ adsMicVol }}</span>
              </div>
              
            </div>
            <!-- 输出：扬声器 / 耳机 -->
            <div class="ads-block">
              <div class="ads-label">输出设备（扬声器 / 耳机）</div>
              <select v-model="adsSpeakerId" class="ads-select">
                <option v-if="!adsSpeakers.length" value="">未检测到输出设备</option>
                <option v-for="d in adsSpeakers" :key="d.deviceId" :value="d.deviceId">
                  {{ isVirtDevice(d.label) ? '🔌 ' : '' }}{{ d.label || '输出设备' }}
                </option>
              </select>
              <div class="ads-vol">
                <svg class="ads-vi" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                <input type="range" min="0" max="100" v-model.number="adsSpeakerVol" class="ads-range uni" :style="{ '--vol': adsSpeakerVol + '%' }" />
                <span class="ads-val">{{ adsSpeakerVol }}</span>
              </div>
              
            </div>
            <div class="ads-tip">
              <div>输入：{{ adsMicLabel }} · 输出：{{ adsSpeakerLabel }}</div>
              <div class="ads-tip-sub ok">知之呕心沥血之作</div>
            </div>
          </div>
        </div>
      </Teleport>
    <div class="cr-input-wrap">
      <button
        class="cr-clear-btn"
        :class="{ 'is-disabled': !hasAnyMessage }"
        title="清屏（清空本地聊天显示）"
        @click="clearScreen"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
      <input
        ref="messageInputEl"
        v-model="messageInput"
        type="text"
        placeholder="来点虎狼之词..."
        class="cr-input"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button class="cr-emoji-btn" title="表情" @click="showEmojiPicker = !showEmojiPicker">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
      </button>
      <button class="cr-send" @click="sendMessage">发送</button>
      <div v-if="showEmojiPicker" class="cr-emoji-mask" @click="showEmojiPicker = false"></div>
      <div v-if="showEmojiPicker" class="cr-emoji-panel">
        <button
          v-for="emoji in emojiList"
          :key="emoji"
          class="cr-emoji-item"
          @click="insertEmoji(emoji)"
        >{{ emoji }}</button>
      </div>
    </div>
    <button class="cr-exit" @click="askLeaveRoom">退出房间</button>
  </div>
  <!-- 右键管理菜单 -->
  <Teleport to="body">
    <div v-if="contextMenu.show" class="cr-menu-mask" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
      <div class="cr-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <div class="cr-menu-title">管理 · {{ contextMenu.member?.name }}</div>
        <button class="cr-menu-item" @click="adminToggleMute">
          {{ contextMenu.member?.isMuted ? '开麦（解除闭麦）' : '闭麦' }}
        </button>
        <button class="cr-menu-item" @click="adminToggleBan">
          {{ store.isBanned(contextMenu.member?.identity) ? '解除禁言' : '禁言' }}
        </button>
        <div class="cr-menu-sep"></div>
        <button class="cr-menu-item danger" @click="adminKickMember">踢出房间</button>
        <button class="cr-menu-item" @click="() => { openUserProfile(contextMenu.member.identity); closeContextMenu(); }">
          查看个人信息
        </button>
      </div>
    </div>
  </Teleport>
  <!-- 通用确认弹窗（踢人 / 退出房间等，替代原生 confirm） -->
  <Teleport to="body">
    <div v-if="confirmState.show" class="cr-leave-mask" @click.self="closeConfirm">
      <div class="cr-leave-panel">
        <div class="cr-leave-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
        <div class="cr-leave-title">{{ confirmState.title }}</div>
        <div class="cr-leave-text" v-html="confirmState.message"></div>
        <div class="cr-leave-foot">
          <button class="cr-leave-btn cancel" :disabled="confirmState.doing" @click="closeConfirm">取消</button>
          <button class="cr-leave-btn confirm" :disabled="confirmState.doing" @click="runConfirm">
            {{ confirmState.doing ? '处理中…' : confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- 公告编辑弹窗 -->
  <Teleport to="body">
    <div v-if="showAnnouncementEdit" class="cr-modal-mask" @click.self="showAnnouncementEdit = false">
      <div class="cr-modal">
        <div class="cr-modal-head">
          <span>编辑房间公告</span>
          <button class="cr-modal-close" @click="showAnnouncementEdit = false">×</button>
        </div>
        <textarea
          v-model="editAnnouncement"
          rows="5"
          class="cr-textarea"
          placeholder="输入房间公告..."
          maxlength="500"
        />
        <div class="cr-modal-foot">
          <span class="cr-count">{{ editAnnouncement.length }}/500</span>
          <Button variant="outline" @click="showAnnouncementEdit = false">取消</Button>
          <Button @click="saveAnnouncement">保存</Button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- 用户资料弹窗 -->
  <Teleport to="body">
    <div v-if="showUserProfile" class="cr-modal-mask" @click.self="showUserProfile = false">
      <div class="cr-modal">
        <div class="cr-modal-head">
          <span>用户资料</span>
          <button class="cr-modal-close" @click="showUserProfile = false">×</button>
        </div>
        <div v-if="loadingUser" class="cr-modal-body center">加载中...</div>
        <div v-else-if="viewingUser?.error" class="cr-modal-body center err">{{ viewingUser.error }}</div>
        <div v-else-if="viewingUser" class="cr-modal-body">
          <div class="cr-profile-top">
            <div class="cr-profile-avatar">
              <img v-if="viewingUser.avatar" :src="viewingUser.avatar" />
              <svg v-else class="cr-av-ico big" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8"/></svg>
            </div>
            <div class="cr-profile-name">{{ viewingUser.name }}</div>
            <div class="cr-profile-id">ID：{{ viewingUser.userId ? 999 + viewingUser.userId : '-' }}</div>
            <div v-if="viewingUser.role" class="cr-profile-role">
              {{ viewingUser.role === 'owner' ? '👑 房主' : viewingUser.role === 'admin' ? '🛡️ 管理员' : '成员' }}
            </div>
          </div>
          <div v-if="viewingUser.bio" class="cr-profile-block">
            <div class="cr-profile-label">个性签名</div>
            <div class="cr-profile-text">{{ viewingUser.bio }}</div>
          </div>
          <div v-if="viewingUser.photos?.length" class="cr-profile-block">
            <div class="cr-profile-label">图片墙</div>
            <div class="cr-photos">
              <div
                v-for="(photo, i) in viewingUser.photos"
                :key="i"
                class="cr-photo"
                @click="openPhoto(photo)"
              >
                <img :src="photo" />
              </div>
            </div>
          </div>
          <div v-if="isAdmin && viewingUser.identity && viewingUser.identity !== store.myIdentity" class="cr-profile-actions">
            <button class="cr-act" @click="() => { store.muteParticipant(viewingUser.identity, !viewingUser.isMuted); }">
              {{ viewingUser.isMuted ? '开麦' : '闭麦' }}
            </button>
            <button class="cr-act" @click="() => { store.banParticipant(viewingUser.identity, !store.isBanned(viewingUser.identity)); }">
              {{ store.isBanned(viewingUser.identity) ? '解除禁言' : '禁言' }}
            </button>
            <button class="cr-act danger" @click="() => askConfirm('踢出成员', `确定要踢出「${viewingUser?.name || '该成员'}」吗？<br/>踢出后 TA 需要重新加入。`, async () => { await store.kickParticipant(viewingUser.identity); showUserProfile = false; }, '确定踢出')">
              踢出
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</div>
</template>



/* 所有业务层提升层级 */
.cr-topbar,
.cr-body,
.cr-bottom {
  position: relative;
  z-index: 1;
}



<style scoped>
.cr-root {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #101026 0%, #16112e 45%, #0b0b16 100%);
  color: #ececf1;
  overflow: hidden;
}
/* DakeMusic: 自定义背景层 */
.cr-custom-bg {
  position: absolute;
  inset: 0;
  background-image: url('');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}
.cr-custom-bg-overlay {
  position: absolute;
  inset: 0;
  background: #000;
}
.cr-root::before,
.cr-root::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  z-index: 0;
}
.cr-root::before {
  width: 420px; height: 420px;
  top: -140px; left: -120px;
  background: rgba(138, 92, 255, 0.30);
  animation: cr-float-a 16s ease-in-out infinite;
}
.cr-root::after {
  width: 460px; height: 460px;
  right: -160px; bottom: -180px;
  background: rgba(0, 190, 255, 0.24);
  animation: cr-float-b 20s ease-in-out infinite;
}
@keyframes cr-float-a {
  0%,100% { transform: translate(0,0); }
  50%     { transform: translate(40px, 30px); }
}
@keyframes cr-float-b {
  0%,100% { transform: translate(0,0); }
  50%     { transform: translate(-40px, -25px); }
}

/* 顶部栏 */
.cr-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.055);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255,255,255,0.10);
}
.cr-icon-btn {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
  color: #cfd0e0;
  background: rgba(255,255,255,0.05);
  transition: all .18s;
}
.cr-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
.cr-title { flex: 1; min-width: 0; }
.cr-title-name { font-size: 13px; font-weight: 700; }
.cr-title-sub { font-size: 11px; opacity: .5; margin-top: 1px; }
.cr-status {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; opacity: .65;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.05);
}
.cr-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px rgba(52,211,153,.9);
  animation: cr-pulse 1.6s infinite;
}
@keyframes cr-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

/* 主体 */
.cr-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧栏 */
.cr-side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.045);
  backdrop-filter: blur(20px);
  overflow: hidden;
}
.cr-side.resizing { transition: none; user-select: none; }
/* 拖拽调宽手柄 */
.cr-side-resizer {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  position: relative;
  transition: background .15s;
  z-index: 5;
}
.cr-side-resizer::after {
  content: '';
  position: absolute;
  left: 2px; top: 0; bottom: 0;
  width: 1px;
  background: rgba(255,255,255,0.10);
}
.cr-side-resizer:hover,
.cr-side-resizer.active {
  background: linear-gradient(90deg, rgba(138,92,255,.35), rgba(0,190,255,.35));
}
.cr-side-resizer:hover::after,
.cr-side-resizer.active::after { background: rgba(138,92,255,.9); }
/* 拖拽时禁止全页选中 */
.cr-side.resizing * { user-select: none !important; }
.cr-room-card {
  display: flex; align-items: center; gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cr-room-cover {
  width: 64px; height: 64px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.cr-room-cover img { width: 100%; height: 100%; object-fit: cover; }
.cr-room-meta { min-width: 0; flex: 1; }
.cr-room-name { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-room-owner { font-size: 12px; opacity: .45; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cr-notice {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cr-notice-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 700; opacity: .75;
  margin-bottom: 7px;
}
.cr-notice-edit { font-size: 12px; opacity: .5; }
.cr-notice-edit:hover { opacity: 1; }
.cr-notice-text {
  font-size: 13px; line-height: 1.6; opacity: .7;
  max-height: 90px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
}
.cr-notice-empty { font-size: 13px; opacity: .32; font-style: italic; }

.cr-member-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  font-size: 13px; font-weight: 700; opacity: .6;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cr-member-tip { font-size: 9px; opacity: .55; font-weight: 400; }
.cr-member-list { flex: 1; overflow-y: auto; padding: 6px; }

.cr-member {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background .16s;
}
.cr-member:hover { background: rgba(255,255,255,0.075); }
.cr-member.is-active {
  background: rgba(255,255,255,0.10);
  box-shadow: inset 0 0 0 1px rgba(255,77,109,.55);
}
.cr-avatar-wrap { position: relative; flex-shrink: 0; }
.cr-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.10);
  font-size: 14px; font-weight: 700;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.14),
    0 0 0 1.5px rgba(138,92,255,.40),
    0 0 10px rgba(138,92,255,.28);
  transition: box-shadow .2s;
}
.cr-avatar img { width: 100%; height: 100%; object-fit: cover; }
.cr-avatar.is-speaking {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.22),
    0 0 0 2px rgba(52,211,153,.9),
    0 0 16px rgba(52,211,153,.55);
  animation: cr-avatar-pulse 1.5s ease-in-out infinite;
}
@keyframes cr-avatar-pulse {
  0%, 100% {
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,.22),
      0 0 0 2px rgba(52,211,153,.7),
      0 0 11px rgba(52,211,153,.38);
  }
  50% {
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,.3),
      0 0 0 3px rgba(52,211,153,1),
      0 0 22px rgba(52,211,153,.75);
  }
}
.cr-mic-badge {
  position: absolute;
  right: -2px; bottom: -2px;
  width: 15px; height: 15px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.cr-mic-badge svg { width: 9px; height: 9px; color: #fff; }
.cr-mic-badge.on  { background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,.6); }
.cr-mic-badge.off { background: #ff4d6d; box-shadow: 0 0 6px rgba(255,77,109,.6); }

.cr-member-info { flex: 1; min-width: 0; }
.cr-member-name {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 600;
}
.cr-member-name .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 角色徽章：房主金 / 管理员蓝 / 自己灰 / 禁言红 */
.cr-badge {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 8px; font-weight: 700; line-height: 1;
  padding: 2px 5px; border-radius: 6px;
  flex-shrink: 0; letter-spacing: .2px;
}
.cr-badge i { font-style: normal; font-size: 8px; }
.cr-badge.owner {
  color: #ffd479;
  background: linear-gradient(135deg, rgba(255,193,84,.22), rgba(255,140,60,.16));
  box-shadow: inset 0 0 0 1px rgba(255,193,84,.5), 0 0 8px rgba(255,193,84,.28);
}
.cr-badge.admin {
  color: #7cc4ff;
  background: linear-gradient(135deg, rgba(88,166,255,.22), rgba(60,120,255,.16));
  box-shadow: inset 0 0 0 1px rgba(120,180,255,.5), 0 0 8px rgba(88,166,255,.26);
}
.cr-badge.me {
  color: #c9c9dc;
  background: rgba(255,255,255,.09);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
}
.cr-badge.ban {
  color: #ff8fa3;
  background: linear-gradient(135deg, rgba(255,77,109,.24), rgba(255,60,90,.16));
  box-shadow: inset 0 0 0 1px rgba(255,77,109,.55), 0 0 8px rgba(255,77,109,.3);
  animation: cr-ban-blink 1.8s ease-in-out infinite;
}
@keyframes cr-ban-blink {
  0%, 100% { box-shadow: inset 0 0 0 1px rgba(255,77,109,.45), 0 0 6px rgba(255,77,109,.22); }
  50%      { box-shadow: inset 0 0 0 1px rgba(255,77,109,.85), 0 0 12px rgba(255,77,109,.5); }
}

/* 成员行状态强化 */
.cr-member.is-banned {
  background: rgba(255,77,109,.09);
  box-shadow: inset 2px 0 0 rgba(255,77,109,.75);
}
.cr-member.is-banned .cr-member-name .truncate { color: #ff8fa3; }
.cr-member.is-speaking { background: rgba(52,211,153,.09); }
.cr-member.is-owner { box-shadow: inset 2px 0 0 rgba(255,193,84,.45); }
.cr-member.is-admin { box-shadow: inset 2px 0 0 rgba(120,180,255,.4); }

/* 头像光环按角色变色 */
.cr-avatar.role-owner {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.16),
    0 0 0 1.5px rgba(255,193,84,.7),
    0 0 12px rgba(255,193,84,.4);
}
.cr-avatar.role-admin {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.16),
    0 0 0 1.5px rgba(120,180,255,.65),
    0 0 12px rgba(88,166,255,.36);
}
.cr-avatar.is-banned {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.12),
    0 0 0 1.5px rgba(255,77,109,.65),
    0 0 12px rgba(255,77,109,.32);
}
.cr-avatar.is-banned img { opacity: .55; filter: grayscale(.55); }

/* hover 快捷管理按钮 */
.cr-member-more {
  opacity: 0; flex-shrink: 0;
  width: 20px; height: 20px; border-radius: 7px;
  border: none; cursor: pointer;
  background: rgba(255,255,255,.08);
  color: #a9a9c0;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s, background .15s;
}
.cr-member:hover .cr-member-more { opacity: 1; }
.cr-member-more:hover { background: rgba(255,255,255,.18); color: #fff; }
.cr-member-more svg { width: 13px; height: 13px; }

.cr-member-state { font-size: 12px; opacity: .42; margin-top: 3px; }
.cr-member-state .speaking { color: #34d399; }
.cr-member-state .banned { color: #ff6b81; font-weight: 600; }

/* 右侧舞台 */
.cr-stage {
  position: relative;
  z-index: 0;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 歌词大框 ===== */
.cr-lyric {
  position: relative;
  flex-shrink: 0;
  margin: 12px 16px 0;
  padding: 11px 14px 10px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(32,28,62,.55), rgba(15,15,32,.55));
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 10px 26px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.05);
  overflow: hidden;
  backdrop-filter: blur(12px);
}
.cr-lyric::before {
  content: '';
  position: absolute;
  left: -20%; right: -20%; top: -120%; height: 200%;
  background: radial-gradient(ellipse at 50% 50%, rgba(120,150,255,.17), transparent 62%);
  pointer-events: none;
}
.cr-lyric-head {
  position: relative;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 6px;
}
.cr-lyric-title {
  display: flex; align-items: center; gap: 7px;
  min-width: 0; flex: 1;
}
.cr-lyric-ico { width: 15px; height: 15px; color: #8ab4ff; flex-shrink: 0; opacity: .9; }
.cr-lyric-song {
  font-size: 13px; font-weight: 600; color: #eef1ff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cr-lyric-artist {
  font-size: 11px; color: #9aa0c0; flex-shrink: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%;
}
.cr-lyric-live { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; flex-shrink: 0; }
.cr-lyric-live i {
  width: 2px; background: #4ade80; border-radius: 1px;
  animation: crLyricBar .9s ease-in-out infinite;
}
.cr-lyric-live i:nth-child(1) { height: 6px;  animation-delay: 0s; }
.cr-lyric-live i:nth-child(2) { height: 11px; animation-delay: .18s; }
.cr-lyric-live i:nth-child(3) { height: 7px;  animation-delay: .36s; }
@keyframes crLyricBar { 0%,100% { transform: scaleY(.45); } 50% { transform: scaleY(1); } }
.cr-lyric-btn {
  flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 8px;
  border: none; cursor: pointer;
  background: rgba(255,255,255,.07);
  color: #a9a9c0;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s;
}
.cr-lyric-btn:hover { background: rgba(255,255,255,.16); color: #fff; }
.cr-lyric-btn svg { width: 14px; height: 14px; }
.cr-lyric-body {
  position: relative;
  min-height: 150px;
  max-height: 200px;
  overflow-y: auto;
  padding: 10px 4px 8px;
  text-align: center;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.16) transparent;
}
.cr-lyric-body::-webkit-scrollbar { width: 4px; }
.cr-lyric-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 999px; }
.cr-lyric-body::-webkit-scrollbar-track { background: transparent; }
.cr-lyric-line {
  font-size: 14px;
  line-height: 1.95;
  padding: 5px 8px;
  color: rgba(220,222,240,.34);
  transition: color .25s, transform .25s, font-size .25s;
  word-break: break-word;
}
.cr-lyric-line.near { color: rgba(220,222,240,.6); }
.cr-lyric-line.active {
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  transform: scale(1.02);
  background: linear-gradient(90deg, transparent, rgba(138,92,255,.16), transparent);
  border-radius: 8px;
  text-shadow: 0 0 14px rgba(138,160,255,.5);
}
.cr-lyric-empty {
  padding: 56px 0;
  font-size: 13px;
  color: rgba(200,204,225,.4);
}
/* 诊断区 */
.cr-diag {
  flex: none;
  max-height: 190px;
  overflow-y: auto;
  padding: 8px 10px;
  border-top: 1px dashed rgba(140,140,190,.28);
  background: rgba(0,0,0,.22);
  font-size: 11px;
  line-height: 1.65;
  color: rgba(210,214,235,.85);
}
.cr-diag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
  font-weight: 600;
  color: rgba(180,170,255,.9);
}
.cr-diag-close {
  border: 0;
  background: transparent;
  color: rgba(200,204,225,.5);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.cr-diag-close:hover { color: #ff6b81; }
.cr-diag-row { display: flex; gap: 6px; align-items: flex-start; word-break: break-all; }
.cr-diag-row b { color: #9ad0ff; font-weight: 600; flex: none; }
.cr-diag-row span { flex: 1; word-break: break-all; }
.cr-diag-dim { color: rgba(200,204,225,.38); }
.cr-diag-err { color: #ff8a9b; margin-bottom: 4px; }
.cr-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 正在说话的人：浮动头像标识 */
.speaking-badge {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  border-radius: 999px;
  background: rgba(20, 20, 40, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(52, 211, 153, 0.4);
  box-shadow: 0 4px 20px rgba(52, 211, 153, 0.2);
  z-index: 10;
  animation: speakingPulse 2s ease-in-out infinite;
}
@keyframes speakingPulse {
  0%, 100% { box-shadow: 0 4px 20px rgba(52, 211, 153, 0.2); }
  50% { box-shadow: 0 4px 28px rgba(52, 211, 153, 0.4); }
}
.speaking-badge-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(52, 211, 153, 0.6);
  flex-shrink: 0;
}
.speaking-badge-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.speaking-badge-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.speaking-badge-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.speaking-badge-wave {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.speaking-badge-wave i {
  width: 3px;
  background: #34d399;
  border-radius: 2px;
  animation: speakingWave 1s ease-in-out infinite;
}
.speaking-badge-wave i:nth-child(1) { height: 6px; animation-delay: 0s; }
.speaking-badge-wave i:nth-child(2) { height: 12px; animation-delay: 0.15s; }
.speaking-badge-wave i:nth-child(3) { height: 8px; animation-delay: 0.3s; }
.speaking-badge-wave i:nth-child(4) { height: 10px; animation-delay: 0.45s; }
@keyframes speakingWave {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1); }
}
.cr-scroll::-webkit-scrollbar,
.cr-member-list::-webkit-scrollbar,
.cr-notice-text::-webkit-scrollbar { width: 5px; }
.cr-scroll::-webkit-scrollbar-thumb,
.cr-member-list::-webkit-scrollbar-thumb,
.cr-notice-text::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.14);
  border-radius: 999px;
}
.cr-scroll::-webkit-scrollbar-thumb:hover,
.cr-member-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.26); }
.cr-scroll::-webkit-scrollbar-track,
.cr-member-list::-webkit-scrollbar-track,
.cr-notice-text::-webkit-scrollbar-track { background: transparent; }

.cr-row { display: flex; }
.cr-row.center { justify-content: center; }
.cr-row.mine  { justify-content: flex-end; }
.cr-row.other { justify-content: flex-start; }

.cr-system {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  opacity: .6;
  background: rgba(255,255,255,0.07);
  backdrop-filter: blur(10px);
}
/* 进出房间提示：钉在聊天区顶部，不随消息滚动 */
.cr-top-notice {
  position: sticky;
  top: -4px;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: 2px 0 8px;
  margin: -4px 0 2px;
  background: linear-gradient(180deg, rgba(14,14,28,.94) 55%, rgba(14,14,28,0));
  backdrop-filter: blur(6px);
  pointer-events: none;
}
.cr-top-notice .cr-system {
  opacity: .85;
  border: 1px solid rgba(255,255,255,.1);
}
.cr-msg {
  max-width: 78%;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.cr-msg-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cr-msg-av {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #ececf1;
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow: 0 2px 8px rgba(0,0,0,.25);
  cursor: pointer;
  transition: transform .16s, box-shadow .16s;
}
.cr-msg-av:hover {
  transform: scale(1.08);
  box-shadow: 0 0 10px rgba(138,92,255,.55);
}
.cr-msg-av img { width: 100%; height: 100%; object-fit: cover; }
.cr-row.mine .cr-msg { flex-direction: row-reverse; }
.cr-row.mine .cr-msg-body { align-items: flex-end; }
.cr-row.mine .cr-msg-av {
  background: linear-gradient(135deg, rgba(138,92,255,.55), rgba(0,190,255,.45));
  border-color: rgba(255,255,255,0.22);
}
.cr-msg-meta {
  display: flex; align-items: baseline; gap: 6px;
  margin-bottom: 3px;
  padding: 0 2px;
}
.cr-row.mine .cr-msg-meta { justify-content: flex-end; }
.cr-msg-name { font-size: 11px; font-weight: 700; cursor: pointer; opacity: .8; }
.cr-msg-name:hover { text-decoration: underline; }
.cr-row.mine .cr-msg-name { color: #b39cff; }
.cr-msg-time { font-size: 10px; opacity: .35; }

.cr-bubble {
  padding: 8px 13px;
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
  backdrop-filter: blur(14px);
  box-shadow: 0 2px 12px rgba(0,0,0,.22);
}
.cr-row.other .cr-bubble {
  background: rgba(255,255,255,0.095);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px 14px 14px 4px;
}
.cr-row.mine .cr-bubble {
  background: linear-gradient(135deg, rgba(138,92,255,.55), rgba(88,101,242,.48));
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px 14px 4px 14px;
  color: #fff;
}

/* 空状态 */
.cr-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.cr-skeleton {
  height: 42px;
  border-radius: 14px;
  background: rgba(255,255,255,0.055);
  border: 1px solid rgba(255,255,255,0.075);
  backdrop-filter: blur(10px);
  animation: cr-breathe 3.4s ease-in-out infinite;
}
.cr-skeleton.s1 { width: 46%; align-self: flex-start; }
.cr-skeleton.s2 { width: 34%; align-self: flex-end; animation-delay: .5s; }
.cr-skeleton.s3 { width: 40%; align-self: flex-start; animation-delay: 1s; }
@keyframes cr-breathe {
  0%,100% { opacity: .45; transform: translateY(0); }
  50%     { opacity: .85; transform: translateY(-4px); }
}

/* 底部栏 */
.cr-bottom {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: rgba(255,255,255,0.055);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255,255,255,0.10);
}
.cr-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cr-bar-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #a9a9c0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all .18s;
}
.cr-bar-btn svg { width: 16px; height: 16px; }
.cr-bar-btn:hover { background: rgba(255,255,255,0.13); color: #ececf1; }
.cr-bar-btn.on {
  background: linear-gradient(135deg, rgba(138,92,255,.85), rgba(0,190,255,.75));
  border-color: rgba(255,255,255,0.28);
  color: #fff;
  box-shadow: 0 0 12px rgba(138,92,255,.55);
}
.cr-bar-btn.off {
  background: rgba(255,77,109,.16);
  border-color: rgba(255,77,109,.45);
  color: #ff4d6d;
  box-shadow: 0 0 10px rgba(255,77,109,.35);
}
.cr-bar-vol {
  display: flex; align-items: center; gap: 6px;
  padding: 0 10px; height: 32px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
}
.cr-bar-vol svg { width: 15px; height: 15px; color: #a9a9c0; flex-shrink: 0; }
.cr-bar-range {
  width: 84px; height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.16);
  appearance: none; -webkit-appearance: none;
  outline: none; cursor: pointer;
}
.cr-bar-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff;
  border: 2px solid #ff4d6d;
  box-shadow: 0 0 6px rgba(255,77,109,.6);
  cursor: pointer;
}
.cr-bar-range::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff; border: 2px solid #ff4d6d; cursor: pointer;
}

/* 耳机音量：向右弹性展开的面板（非弹窗） */
/* 常驻音量条胶囊：麦克风 + 扬声器，随时可拖，不再藏进弹出面板 */
.cr-vol-inline {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  flex-shrink: 0;
}
.cr-vol-inline:hover { background: rgba(255, 255, 255, 0.09); }
.cr-vol-sep {
  width: 1px; height: 14px; flex-shrink: 0;
  background: rgba(255, 255, 255, 0.13);
}
.cr-vol-ico { width: 14px; height: 14px; color: #a9a9c0; flex-shrink: 0; }
.cr-vol-val {
  font-size: 10px; color: #8b8ba6; width: 20px;
  text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums;
}

/* 统一配色滑块：紫蓝渐变，已填充部分按 --vol 百分比着色 */
.cr-pop-range {
  flex: none; width: 76px; height: 4px; border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
  appearance: none; -webkit-appearance: none;
  outline: none; cursor: pointer;
  transition: width .18s ease;
}
.cr-pop-range.uni {
  background: linear-gradient(
    90deg,
    #8a5cff 0%,
    #00beff var(--vol, 60%),
    rgba(255, 255, 255, 0.16) var(--vol, 60%)
  );
}
.cr-pop-range.uni::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff;
  border: 2px solid #8a5cff;
  box-shadow: 0 0 6px rgba(138, 92, 255, 0.65);
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.cr-pop-range.uni::-webkit-slider-thumb:hover {
  transform: scale(1.18);
  box-shadow: 0 0 10px rgba(138, 92, 255, 0.9);
}
.cr-pop-range.uni::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff; border: 2px solid #8a5cff; cursor: pointer;
}
.cr-vol-tip {
  font-size: 9.5px; line-height: 1.5; color: #6f6f88;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 7px; margin-top: 2px;
}

.ads-label { display: flex; align-items: center; gap: 6px; }
.ads-virt {
  font-size: 9px; padding: 1px 5px; border-radius: 6px;
  background: rgba(138,92,255,.22); color: #b79cff;
  border: 1px solid rgba(138,92,255,.35);
}
.ads-val { font-size: 10px; color: #9a9ab0; width: 22px; text-align: right; flex-shrink: 0; }
.ads-hint { font-size: 10px; color: #7a7a90; margin-top: 5px; line-height: 1.4; }
.ads-tip-sub { margin-top: 4px; font-size: 10px; }
.ads-tip-sub.ok { color: #4ade80; }
.ads-tip-sub.warn { color: #fbbf24; }

/* 展开动画 */
.volpop-enter-active { transition: all .18s cubic-bezier(.22,1,.36,1); }
.volpop-leave-active { transition: all .14s ease-in; }
.volpop-enter-from, .volpop-leave-to { opacity: 0; transform: scale(.92) translateX(-6px); }

/* 成员声波动画 */
.cr-wave {
  display: inline-flex; align-items: flex-end; gap: 2px;
  height: 10px; margin-right: 4px; vertical-align: -1px;
}
.cr-wave i {
  width: 2px; border-radius: 1px; background: #34d399;
  transform-origin: bottom;
  animation: cr-wave .9s ease-in-out infinite;
}
.cr-wave i:nth-child(1) { height: 4px;  animation-delay: 0s;   }
.cr-wave i:nth-child(2) { height: 9px;  animation-delay: .15s; }
.cr-wave i:nth-child(3) { height: 6px;  animation-delay: .3s;  }
.cr-wave i:nth-child(4) { height: 10px; animation-delay: .45s; }
@keyframes cr-wave {
  0%, 100% { transform: scaleY(.3); }
  50%      { transform: scaleY(1);  }
}
.cr-clear-btn {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #8f8fa6;
  cursor: pointer;
  transition: all 0.16s ease;
  z-index: 2;
  flex-shrink: 0;
}
.cr-clear-btn svg { width: 14px; height: 14px; }
.cr-clear-btn:hover {
  background: rgba(255, 77, 109, 0.18);
  color: #ff4d6d;
  transform: translateY(-50%) scale(1.08);
}
.cr-clear-btn.is-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.cr-clear-btn.is-disabled:hover {
  background: transparent;
  color: #8f8fa6;
  transform: translateY(-50%);
}
.cr-input-wrap {
  position: relative;
  flex: none;
  width: 300px;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cr-input {
  flex: 1;
  min-width: 0;
  padding: 7px 13px 7px 34px;
  border-radius: 999px;
  font-size: 12.5px;
  color: #ececf1;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.11);
  outline: none;
  transition: all .18s;
}
.cr-input::placeholder { color: rgba(236,236,241,.35); }
.cr-input:focus {
  border-color: rgba(138,92,255,.75);
  background: rgba(255,255,255,0.10);
  box-shadow: 0 0 0 3px rgba(138,92,255,.14);
}
.cr-emoji-btn {
  flex-shrink: 0;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  color: #cfd0e0;
  background: rgba(255,255,255,0.06);
  transition: all .18s;
}
.cr-emoji-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
.cr-emoji-btn svg { width: 17px; height: 17px; }
.cr-send {
  flex-shrink: 0;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #6d5cff, #4d8dff);
  box-shadow: 0 2px 10px rgba(109,92,255,.35);
  transition: all .18s;
}
.cr-send:hover { filter: brightness(1.1); box-shadow: 0 3px 14px rgba(109,92,255,.5); }
.cr-exit {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #ef4444;
  transition: all .18s;
}
.cr-exit:hover { background: #dc2626; }

/* ===== 退出房间确认弹窗 ===== */
.cr-leave-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 8, 18, .62);
  backdrop-filter: blur(6px);
  animation: crLeaveFade .16s ease;
}
.cr-leave-panel {
  position: relative;
  width: 320px;
  padding: 26px 22px 20px;
  border-radius: 20px;
  text-align: center;
  background: linear-gradient(160deg, rgba(38, 30, 66, .96), rgba(22, 22, 40, .96));
  border: 1px solid rgba(255, 255, 255, .12);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .6), 0 0 40px rgba(138, 92, 255, .18);
  overflow: hidden;
  animation: crLeavePop .2s cubic-bezier(.2, .9, .3, 1.2);
}
.cr-leave-panel::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -30%;
  width: 160%;
  height: 120%;
  background: radial-gradient(circle, rgba(138, 92, 255, .28), transparent 62%);
  pointer-events: none;
}
.cr-leave-icon {
  position: relative;
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #ff4d6d, #ff8a5c);
  box-shadow: 0 0 18px rgba(255, 77, 109, .45);
}
.cr-leave-icon svg { width: 24px; height: 24px; }
.cr-leave-title {
  position: relative;
  font-size: 16px;
  font-weight: 800;
  color: #ececf1;
  margin-bottom: 8px;
  letter-spacing: .5px;
}
.cr-leave-text {
  position: relative;
  font-size: 12px;
  line-height: 1.7;
  color: #a9a9c2;
  margin-bottom: 20px;
}
.cr-leave-foot {
  position: relative;
  display: flex;
  gap: 10px;
}
.cr-leave-btn {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: all .18s;
}
.cr-leave-btn.cancel {
  background: linear-gradient(135deg, #8a5cff, #00beff);
  box-shadow: 0 4px 14px rgba(109, 92, 255, .35);
}
.cr-leave-btn.cancel:hover {
  filter: brightness(1.12);
  box-shadow: 0 6px 20px rgba(109, 92, 255, .55);
  transform: translateY(-1px);
}
.cr-leave-btn.confirm {
  background: linear-gradient(135deg, #ff4d6d, #c8376d);
  box-shadow: 0 4px 14px rgba(255, 77, 109, .35);
}
.cr-leave-btn.confirm:hover {
  filter: brightness(1.12);
  box-shadow: 0 6px 20px rgba(255, 77, 109, .55);
  transform: translateY(-1px);
}
.cr-leave-btn:active { transform: translateY(0) scale(.97); }
@keyframes crLeaveFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes crLeavePop {
  from { opacity: 0; transform: scale(.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.cr-emoji-mask { position: fixed; inset: 0; z-index: 40; }
.cr-emoji-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  width: 288px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  max-height: 190px;
  overflow-y: auto;
  border-radius: 14px;
  background: rgba(26,26,40,0.92);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.13);
  box-shadow: 0 12px 40px rgba(0,0,0,.5);
}
.cr-emoji-item {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  border-radius: 7px;
  transition: background .14s;
}
.cr-emoji-item:hover { background: rgba(255,255,255,0.12); }

/* 右键菜单 */
.cr-menu-mask { position: fixed; inset: 0; z-index: 9999; }
.cr-menu {
  position: absolute;
  min-width: 160px;
  padding: 4px 0;
  border-radius: 11px;
  background: rgba(30,30,46,0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 10px 34px rgba(0,0,0,.5);
  font-size: 12.5px;
  color: #ececf1;
}
.cr-menu-title {
  padding: 5px 12px 7px;
  font-size: 11px;
  opacity: .5;
  margin-bottom: 3px;
  border-bottom: 1px solid rgba(255,255,255,0.09);
}
.cr-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  color: #ececf1;
  transition: background .14s;
}
.cr-menu-item:hover { background: rgba(255,255,255,0.10); }
.cr-menu-item.danger { color: #ff6b81; }
.cr-menu-item.danger:hover { background: rgba(239,68,68,.18); }
.cr-menu-sep { height: 1px; background: rgba(255,255,255,0.09); margin: 3px 0; }

/* 弹窗 */
.cr-modal-mask {
  position: fixed; inset: 0;
  z-index: 9998;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.62);
  backdrop-filter: blur(3px);
}
.cr-modal {
  width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 16px;
  background: #1e1e2a;
  border: 1px solid #3a3a4a;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  color: #ececf1;
}
.cr-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid #3a3a4a;
}
.cr-modal-close { font-size: 20px; line-height: 1; color: #9a9ab0; }
.cr-modal-close:hover { color: #fff; }
.cr-modal-body { padding: 16px; }
.cr-modal-body.center { text-align: center; padding: 32px 16px; color: #9a9ab0; }
.cr-modal-body.center.err { color: #ff6b81; }
.cr-textarea {
  width: 100%;
  padding: 9px 11px;
  border-radius: 10px;
  font-size: 13px;
  color: #ececf1;
  background: rgba(255,255,255,0.06);
  border: 1px solid #3a3a4a;
  outline: none;
  resize: none;
}
.cr-textarea:focus { border-color: #8a5cff; }
.cr-modal-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 0 16px 16px;
}
.cr-count { flex: 1; font-size: 11px; opacity: .4; }

.cr-profile-top { display: flex; flex-direction: column; align-items: center; margin-bottom: 14px; }
.cr-profile-avatar {
  width: 72px; height: 72px;
  border-radius: 50%;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: #111315;
  font-size: 24px; font-weight: 700;
  margin-bottom: 8px;
}
.cr-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
/* 默认头像：线性用户矢量图标 */
.cr-av-ico { width: 18px; height: 18px; color: rgba(255,255,255,.62); flex-shrink: 0; }
.cr-av-ico.big { width: 40px; height: 40px; color: rgba(255,255,255,.45); }
.cr-profile-name { font-size: 16px; font-weight: 700; }
.cr-profile-id { font-size: 11px; color: #7c7c92; margin-top: 2px; }
.cr-profile-role {
  margin-top: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10px;
  background: #111315;
}
.cr-profile-block { margin-bottom: 12px; }
.cr-profile-label { font-size: 11px; color: #7c7c92; margin-bottom: 5px; }
.cr-profile-text { font-size: 13px; color: #c8c8d4; white-space: pre-wrap; word-break: break-word; }
.cr-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.cr-photo {
  aspect-ratio: 1;
  border-radius: 9px;
  overflow: hidden;
  background: #111315;
  cursor: pointer;
  transition: opacity .16s;
}
.cr-photo:hover { opacity: .8; }
.cr-photo img { width: 100%; height: 100%; object-fit: cover; }
.cr-profile-actions {
  display: flex; gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #3a3a4a;
}
.cr-act {
  flex: 1;
  padding: 8px 0;
  border-radius: 9px;
  font-size: 12.5px;
  color: #ececf1;
  background: rgba(255,255,255,0.05);
  border: 1px solid #3a3a4a;
  transition: background .16s;
}
.cr-act:hover { background: rgba(255,255,255,0.12); }
.cr-act.danger { color: #ff6b81; background: rgba(239,68,68,.16); border-color: rgba(239,68,68,.3); }
.cr-act.danger:hover { background: rgba(239,68,68,.28); }

/* ===== 音频设备：单一胶囊 ===== */
.ads-one {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.13);
}
.ads-mic {
  width: 30px; height: 30px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .2s;
}
.ads-mic.on {
  background: linear-gradient(135deg, #8a5cff, #00beff);
  color: #fff;
  box-shadow: 0 0 10px rgba(138,92,255,.6);
}
.ads-mic.off {
  background: rgba(255,77,109,.16);
  color: #ff4d6d;
}
.ads-mic:disabled { opacity: .5; cursor: wait; }
.ads-ico { width: 15px; height: 15px; }
.ads-main {
  display: flex; align-items: center; gap: 4px;
  padding: 0 9px 0 5px;
  border: none; background: transparent;
  color: #d8d8e4; font-size: 11px;
  cursor: pointer;
  max-width: 132px;
}
.ads-main:hover { color: #fff; }
.ads-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ads-arrow { width: 11px; height: 11px; opacity: .5; flex-shrink: 0; }

.ads-mask {
  position: fixed; inset: 0;
  z-index: 9997;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6);
}
.ads-panel {
  width: 300px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(30,30,46,.94);
  border: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(20px);
  box-shadow: 0 16px 48px rgba(0,0,0,.6);
  color: #ececf1;
}
.ads-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
  font-size: 13px; font-weight: 700;
}
.ads-x { background: none; border: none; color: #9a9ab0; font-size: 18px; line-height: 1; cursor: pointer; }
.ads-x:hover { color: #fff; }
.ads-block { margin-bottom: 14px; }
.ads-label { font-size: 11px; color: #9a9ab0; margin-bottom: 6px; }
.ads-select {
  width: 100%;
  padding: 7px 9px;
  border-radius: 9px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.11);
  color: #d8d8e4; font-size: 11px;
  outline: none;
  margin-bottom: 9px;
  appearance: none;
}
.ads-select option { background: #1e1e2a; color: #d8d8e4; }
.ads-vol { display: flex; align-items: center; gap: 8px; }
.ads-vi { width: 16px; height: 16px; color: #9a9ab0; flex-shrink: 0; }
.ads-range {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.14);
  appearance: none;
  outline: none;
  cursor: pointer;
}
.ads-range.uni {
  background: linear-gradient(
    90deg,
    #8a5cff 0%,
    #00beff var(--vol, 60%),
    rgba(255, 255, 255, 0.14) var(--vol, 60%)
  );
}
.ads-range.uni::-webkit-slider-thumb {
  appearance: none;
  width: 13px; height: 13px; border-radius: 50%;
  background: #fff; border: 2px solid #8a5cff;
  box-shadow: 0 0 6px rgba(138,92,255,.6);
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.ads-range.uni::-webkit-slider-thumb:hover {
  transform: scale(1.18);
  box-shadow: 0 0 10px rgba(138,92,255,.9);
}
.ads-range::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  background: #fff; border: 2px solid #8a5cff; cursor: pointer;
}
.ads-tip {
  margin-top: 4px;
  font-size: 10px;
  color: #7c7c92;
  text-align: center;
}
</style>