<script setup lang="ts">
import { ref, onMounted, onActivated, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import { roomApi } from '@/utils/roomApi';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const store = useChatRoomStore();

// ===== 登录/注册 =====
const authMode = ref<'login' | 'register'>('login');
const loginNameInput = ref('');
const loginPasswordInput = ref('');
const loginConfirmPassword = ref('');
const loginError = ref('');
const isLoggingIn = ref(false);

async function handleAuth() {
  if (!loginNameInput.value.trim() || !loginPasswordInput.value) {
    loginError.value = '昵称和密码必填';
    return;
  }
  if (authMode.value === 'register') {
    if (loginPasswordInput.value.length < 6) { loginError.value = '密码至少6位'; return; }
    if (loginPasswordInput.value !== loginConfirmPassword.value) { loginError.value = '两次密码不一致'; return; }
  }
  isLoggingIn.value = true;
  loginError.value = '';
  try {
    if (authMode.value === 'register') {
      await roomApi.register(loginNameInput.value.trim(), loginPasswordInput.value);
    }
    await store.login(loginNameInput.value.trim(), loginPasswordInput.value);
    await store.fetchRooms();
  } catch (e: any) {
    loginError.value = e.message || (authMode.value === 'register' ? '注册失败' : '登录失败');
  } finally {
    isLoggingIn.value = false;
  }
}

function switchAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login';
  loginError.value = '';
  loginConfirmPassword.value = '';
}

function handleLogout() {
  store.logout();
  loginNameInput.value = '';
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
    alert(e.message || '加载失败');
  } finally {
    adminLoading.value = false;
  }
}
async function grantAdmin(userId: number) {
  try {
    await roomApi.grantAdmin(userId);
    await loadAdminUsers();
  } catch (e: any) {
    alert(e.message || '操作失败');
  }
}
async function revokeAdmin(userId: number) {
  if (!confirm('确定取消该用户的管理员权限？')) return;
  try {
    await roomApi.revokeAdmin(userId);
    await loadAdminUsers();
  } catch (e: any) {
    alert(e.message || '操作失败');
  }
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
  showCreateDialog.value = true;
}

async function handleCreateRoom() {
  if (!newRoomName.value.trim()) return;
  try {
    await store.createRoom(newRoomName.value.trim(), newRoomPassword.value || undefined, newRoomCover.value || undefined);
    showCreateDialog.value = false;
    newRoomCover.value = '';
    router.push('/main/chatroom/room');
  } catch (e: any) {
    alert(e.message || '创建失败');
  }
}

async function handleJoinRoom(roomId: string) {
  const room = store.rooms.find(r => r.id === roomId);
  // 没有密码的房间直接进
  if (!room?.hasPassword) {
    try {
      await store.joinRoom(roomId);
      router.push('/main/chatroom/room');
    } catch (e: any) {
      alert(e.message || '加入失败');
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
    if (e.message === '密码错误') alert('房间密码错误');
    else alert(e.message || '加入失败');
  }
}

// ===== 编辑房间 =====
function openEditDialog(room: any) {
  editRoomId.value = room.id;
  editRoomName.value = room.name;
  editRoomCover.value = room.coverImage || '';
  showEditDialog.value = true;
}

async function confirmEditRoom() {
  if (!editRoomName.value.trim()) return;
  try {
    await roomApi.updateRoom(editRoomId.value, editRoomName.value.trim(), undefined, editRoomCover.value);
    showEditDialog.value = false;
    await store.fetchRooms();
  } catch (e: any) {
    alert(e.message || '修改失败');
  }
}

async function handleDeleteRoom(roomId: string) {
  if (!confirm('确定删除这个房间？')) return;
  try {
    await roomApi.updateRoom(roomId, undefined, undefined, undefined, true);
    await store.fetchRooms();
  } catch (e: any) {
    alert(e.message || '删除失败');
  }
}

function onCreateCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { alert('封面图不能超过3MB'); return; }
  const reader = new FileReader();
  reader.onload = () => { newRoomCover.value = reader.result as string; };
  reader.readAsDataURL(file);
}

function onEditCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { alert('封面图不能超过3MB'); return; }
  const reader = new FileReader();
  reader.onload = () => { editRoomCover.value = reader.result as string; };
  reader.readAsDataURL(file);
}

// ===== 管理员（已废弃，改用超级管理员账号绑定）=====
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <!-- 未登录：登录/注册页 -->
    <div v-if="!store.isLoggedIn" class="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 class="text-3xl font-bold mb-2">聊天房</h1>
      <p class="text-sm opacity-50 mb-8">{{ authMode === 'login' ? '登录后即可创建或加入房间' : '注册一个账号开始使用' }}</p>
      <div class="w-80 space-y-4">
        <div>
          <label class="block text-sm mb-1 opacity-70">昵称</label>
          <input v-model="loginNameInput" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="输入昵称" @keyup.enter="handleAuth" />
        </div>
        <div>
          <label class="block text-sm mb-1 opacity-70">密码</label>
          <input v-model="loginPasswordInput" type="password" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="输入密码（至少6位）" @keyup.enter="handleAuth" />
        </div>
        <div v-if="authMode === 'register'">
          <label class="block text-sm mb-1 opacity-70">确认密码</label>
          <input v-model="loginConfirmPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="再次输入密码" @keyup.enter="handleAuth" />
        </div>
        <p v-if="loginError" class="text-red-500 text-sm">{{ loginError }}</p>
        <Button class="w-full" :disabled="isLoggingIn" @click="handleAuth">
          {{ isLoggingIn ? (authMode === 'login' ? '登录中...' : '注册中...') : (authMode === 'login' ? '登录' : '注册') }}
        </Button>
        <p class="text-xs opacity-40 text-center">
          {{ authMode === 'login' ? '还没有账号？' : '已有账号？' }}
          <button class="text-[var(--color-primary)] hover:underline" @click="switchAuthMode">
            {{ authMode === 'login' ? '立即注册' : '去登录' }}
          </button>
        </p>
      </div>
    </div>

    <!-- 已登录：房间列表 -->
    <template v-else>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">聊天房</h1>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="router.push('/main/chatroom/profile')">个人中心</Button>
          <Button v-if="store.isAdmin" variant="outline" size="sm" @click="openAdminPanel">管理员</Button>
          <Button variant="outline" size="sm" @click="store.fetchRooms">刷新</Button>
          <Button size="sm" @click="openCreateDialog">+ 创建房间</Button>
          <Button variant="ghost" size="sm" @click="handleLogout">退出</Button>
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
          class="border border-[var(--border-subtle)] rounded-xl overflow-hidden hover:border-[var(--color-primary)] transition-colors"
        >
          <!-- 封面图 -->
          <div v-if="room.coverImage" class="h-28 bg-[var(--bg-secondary)] overflow-hidden">
            <img :src="room.coverImage" class="w-full h-full object-cover" />
          </div>
          <div class="p-4">
            <div class="flex items-start justify-between mb-2">
              <h3 class="font-bold text-lg truncate flex-1">{{ room.name }}</h3>
              <span class="text-xs bg-[var(--control-track-bg)] px-2 py-0.5 rounded-full ml-2 shrink-0">
                {{ room.participantCount }} 人
              </span>
            </div>
            <p class="text-xs opacity-40 mb-3">
              房主：{{ room.ownerName }} · {{ new Date(room.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
            </p>
            <div class="flex gap-2">
              <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity" @click="handleJoinRoom(room.id)">
                
                加入房间
              </button>
              <template v-if="room.isOwner || room.isSuperAdmin">
                <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity" @click="openEditDialog(room)" title="编辑">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500 text-white hover:opacity-90 transition-opacity" @click="handleDeleteRoom(room.id)" title="删除">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 创建房间弹窗 -->
    <div v-if="showCreateDialog" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click.self="showCreateDialog = false">
      <div class="bg-[#1a1a2e] rounded-2xl p-6 w-96 border border-white/10 text-white shadow-2xl">
        <h2 class="text-xl font-bold mb-4">创建房间</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 opacity-70">房间名称</label>
            <input v-model="newRoomName" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="给房间起个名字" />
          </div>
          <div>
            <label class="block text-sm mb-1 opacity-70">房间密码（可选）</label>
            <input v-model="newRoomPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="设置后加入需要密码" />
          </div>
          <div>
            <label class="block text-sm mb-1 opacity-70">房间封面（可选）</label>
            <div class="flex items-center gap-3">
              <div class="w-16 h-16 rounded-lg overflow-hidden bg-[var(--control-track-bg)] flex items-center justify-center shrink-0">
                <img v-if="newRoomCover" :src="newRoomCover" class="w-full h-full object-cover" />
                <span v-else class="text-2xl opacity-30">🖼</span>
              </div>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="createCoverInput?.click()">上传</Button>
                <Button v-if="newRoomCover" variant="ghost" size="sm" @click="newRoomCover = ''">移除</Button>
              </div>
              <input ref="createCoverInput" type="file" accept="image/*" class="hidden" @change="onCreateCoverSelected" />
            </div>
          </div>
          <div class="flex gap-2 pt-2">
            <Button variant="outline" class="flex-1" @click="showCreateDialog = false">取消</Button>
            <Button class="flex-1" :disabled="store.isConnecting" @click="handleCreateRoom">
              {{ store.isConnecting ? '创建中...' : '创建' }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 加入房间弹窗 -->
    <div v-if="showJoinDialog" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click.self="showJoinDialog = false">
      <div class="bg-[#1a1a2e] rounded-2xl p-6 w-96 border border-white/10 text-white shadow-2xl">
        <h2 class="text-xl font-bold mb-4">加入房间</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 opacity-70">房间密码（无密码留空）</label>
            <input ref="joinPasswordInput" v-model="joinRoomPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="输入房间密码" @keyup.enter="confirmJoin" />
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
    <div v-if="showEditDialog" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click.self="showEditDialog = false">
      <div class="bg-[#1a1a2e] rounded-2xl p-6 w-96 border border-white/10 text-white shadow-2xl">
        <h2 class="text-xl font-bold mb-4">编辑房间</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 opacity-70">房间名称</label>
            <input v-model="editRoomName" class="w-full px-3 py-2 rounded-lg bg-[var(--control-track-bg)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]" placeholder="房间名称" />
          </div>
          <div>
            <label class="block text-sm mb-1 opacity-70">房间封面</label>
            <div class="flex items-center gap-3">
              <div class="w-16 h-16 rounded-lg overflow-hidden bg-[var(--control-track-bg)] flex items-center justify-center shrink-0">
                <img v-if="editRoomCover" :src="editRoomCover" class="w-full h-full object-cover" />
                <span v-else class="text-2xl opacity-30">🖼</span>
              </div>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="editCoverInput?.click()">上传</Button>
                <Button v-if="editRoomCover" variant="ghost" size="sm" @click="editRoomCover = ''">移除</Button>
              </div>
              <input ref="editCoverInput" type="file" accept="image/*" class="hidden" @change="onEditCoverSelected" />
            </div>
          </div>
          <div class="flex gap-2 pt-2">
            <Button variant="outline" class="flex-1" @click="showEditDialog = false">取消</Button>
            <Button class="flex-1" @click="confirmEditRoom">保存</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 管理员面板 -->
    <div v-if="showAdminPanel" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click.self="showAdminPanel = false">
      <div class="bg-[#1a1a2e] rounded-2xl p-6 w-[500px] max-h-[80vh] flex flex-col border border-white/10 text-white shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">用户管理</h2>
          <span class="text-xs opacity-50">共 {{ adminUsers.length }} 人</span>
        </div>
        <div class="flex-1 overflow-y-auto space-y-2">
          <div v-if="adminLoading" class="text-center py-8 opacity-50">加载中...</div>
          <div
            v-for="u in adminUsers"
            :key="u.id"
            class="flex items-center gap-3 p-3 rounded-lg bg-[var(--control-track-bg)]"
          >
            <div class="w-10 h-10 rounded-full overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center shrink-0">
              <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" />
              <span v-else class="text-sm font-bold">{{ u.name.charAt(0) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate flex items-center gap-2">
                {{ u.name }}
                <span v-if="u.is_admin" class="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">管理员</span>
              </div>
              <div class="text-xs opacity-40">ID: {{ u.id }}</div>
            </div>
            <div class="shrink-0">
              <Button v-if="u.is_admin" variant="outline" size="sm" @click="revokeAdmin(u.id)">取消</Button>
              <Button v-else size="sm" @click="grantAdmin(u.id)">设为管理员</Button>
            </div>
          </div>
        </div>
        <div class="mt-4 pt-4 border-t border-[var(--border-subtle)]">
          <Button class="w-full" variant="outline" @click="showAdminPanel = false">关闭</Button>
        </div>
      </div>
    </div>
  </div>
</template>
