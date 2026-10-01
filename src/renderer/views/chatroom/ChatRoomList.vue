<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { useChatRoomStore } from '@/stores/chatRoom';
import { roomApi } from '@/utils/roomApi';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const store = useChatRoomStore();

const showCreateDialog = ref(false);
const showJoinDialog = ref(false);
const newRoomName = ref('');
const newRoomPassword = ref('');
const newRoomAccessPassword = ref('');
const creatorName = ref('');
const joinUserName = ref('');
const joinRoomId = ref('');
const ownerPassword = ref('');
const showOwnerLogin = ref(false);
const ownerLoginRoomId = ref('');
const showEditDialog = ref(false);
const editRoomId = ref('');
const editRoomName = ref('');
const editOwnerIdentity = ref('');
// 管理员
const isAdmin = ref(false);
const showAdminLogin = ref(false);
const adminPasswordInput = ref('');
const adminError = ref('');
const adminSavedPassword = ref('');
// 个人资料（完全本地管理，不依赖 store）
const userProfile = ref({
  nickname: localStorage.getItem('chatroom_nickname') || '',
  avatarImage: localStorage.getItem('chatroom_avatarImage') || '',
});
const avatarFileInput = ref<HTMLInputElement | null>(null);
const showProfileDialog = ref(false);
const editNickname = ref('');
const editAvatar = ref('');



onMounted(() => {
  store.fetchRooms();
  // 用本地资料填充昵称
  if (userProfile.value.nickname) {
    creatorName.value = userProfile.value.nickname;
    joinUserName.value = userProfile.value.nickname;
  }
});

// 每次进入页面都刷新房间列表（keep-alive 缓存时也会触发）
onActivated(() => {
  store.fetchRooms();
});

// 保存昵称到个人资料
function saveNickname(name: string) {
  if (name.trim()) {
    userProfile.value.nickname = name.trim();
    localStorage.setItem('chatroom_nickname', name.trim());
  }
}

// 打开编辑资料弹窗
function openProfileDialog() {
  editNickname.value = userProfile.value.nickname;
  editAvatar.value = userProfile.value.avatarImage;
  showProfileDialog.value = true;
}

// 选择头像图片
function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('图片不能超过2MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    editAvatar.value = reader.result as string;
  };
  reader.readAsDataURL(file);
}

function triggerAvatarUpload() {
  avatarFileInput.value?.click();
}

// 保存资料
function confirmProfile() {
  if (!editNickname.value.trim()) {
    alert('昵称不能为空');
    return;
  }
  userProfile.value = {
    nickname: editNickname.value.trim(),
    avatarImage: editAvatar.value,
  };
  localStorage.setItem('chatroom_nickname', editNickname.value.trim());
  if (editAvatar.value) {
    localStorage.setItem('chatroom_avatarImage', editAvatar.value);
  } else {
    localStorage.removeItem('chatroom_avatarImage');
  }
  creatorName.value = editNickname.value.trim();
  joinUserName.value = editNickname.value.trim();
  showProfileDialog.value = false;
}

async function handleCreateRoom() {
  if (!newRoomName.value.trim() || !creatorName.value.trim()) return;
  try {
    await store.createRoom(newRoomName.value.trim(), creatorName.value.trim(), newRoomPassword.value || undefined, newRoomAccessPassword.value || undefined);
    saveNickname(creatorName.value);
    showCreateDialog.value = false;
    newRoomName.value = '';
    newRoomPassword.value = '';
    newRoomAccessPassword.value = '';
    creatorName.value = '';
    router.push('/main/chatroom/room');
  } catch (e: any) {
    alert(e.message || '创建失败');
  }
}

// 加入房间时临时存的房间密码
const joinRoomPassword = ref('');

async function handleJoinRoom(roomId: string) {
  joinRoomId.value = roomId;
  joinRoomPassword.value = '';
  const room = store.rooms.find((r) => r.id === roomId);
  // 如果房间有密码，先弹密码框
  if (room?.hasPassword) {
    showJoinDialog.value = true;
    return;
  }
  // 无密码且有昵称，直接加入
  if (userProfile.value.nickname) {
    joinUserName.value = userProfile.value.nickname;
    await confirmJoin();
  } else {
    showJoinDialog.value = true;
  }
}

async function confirmJoin() {
  if (!joinUserName.value.trim()) return;
  try {
    await store.joinRoom(joinRoomId.value, joinUserName.value.trim(), joinRoomPassword.value || undefined);
    saveNickname(joinUserName.value);
    showJoinDialog.value = false;
    joinUserName.value = '';
    joinRoomPassword.value = '';
    router.push('/main/chatroom/room');
  } catch (e: any) {
    alert(e.message || '加入失败');
  }
}

function openOwnerLogin(roomId: string) {
  ownerLoginRoomId.value = roomId;
  ownerPassword.value = '';
  showOwnerLogin.value = true;
}

async function confirmOwnerLogin() {
  try {
    await store.ownerJoinRoom(ownerLoginRoomId.value, ownerPassword.value);
    showOwnerLogin.value = false;
    router.push('/main/chatroom/room');
  } catch (e: any) {
    alert(e.message || '密码错误');
  }
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 编辑房间名
function openEditDialog(room: any) {
  editRoomId.value = room.id;
  editRoomName.value = room.name;
  editOwnerIdentity.value = '';
  showEditDialog.value = true;
}

async function confirmEdit() {
  if (!editRoomName.value.trim()) return;
  try {
    await store.updateRoomName(editRoomId.value, editRoomName.value.trim(), editOwnerIdentity.value);
    showEditDialog.value = false;
    await store.fetchRooms();
  } catch (e: any) {
    alert(e.message || '修改失败');
  }
}

// 管理员登录
async function adminLogin() {
  adminError.value = '';
  try {
    await roomApi.adminVerify(adminPasswordInput.value);
    isAdmin.value = true;
    adminSavedPassword.value = adminPasswordInput.value;
    showAdminLogin.value = false;
    adminPasswordInput.value = '';
  } catch (e: any) {
    adminError.value = e.message || '密码错误';
  }
}

function adminLogout() {
  isAdmin.value = false;
  adminSavedPassword.value = '';
}

// 管理员删除房间
async function adminDeleteRoom(roomId: string) {
  if (!confirm('确定要删除这个房间吗？')) return;
  try {
    await roomApi.adminDeleteRoom(roomId, adminSavedPassword.value);
    await store.fetchRooms();
  } catch (e: any) {
    alert(e.message || '删除失败');
  }
}

</script>

<template>
  <div class="chat-room-list p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button
          @click="openProfileDialog"
          class="w-10 h-10 rounded-full shrink-0 hover:scale-105 transition-transform cursor-pointer overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center"
          :title="userProfile.nickname ? '编辑资料' : '设置昵称和头像'"
        >
          <img v-if="userProfile.avatarImage" :src="userProfile.avatarImage" class="w-full h-full object-cover" />
          <span v-else class="text-lg">👤</span>
        </button>
        <h1 class="text-2xl font-bold">聊天房</h1>
      </div>
      <div class="flex gap-2">
        <Button v-if="!isAdmin" @click="showAdminLogin = true" variant="outline" size="sm">管理</Button>
        <Button v-else @click="adminLogout" variant="outline" size="sm">退出管理</Button>
        <Button @click="store.fetchRooms()" variant="outline" size="sm">刷新</Button>
        <Button @click="showCreateDialog = true" variant="primary" size="sm">+ 创建房间</Button>
      </div>
    </div>

    <div v-if="store.rooms.length === 0" class="text-center py-20 text-text-main/50">
      暂无房间，创建一个吧
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="room in store.rooms"
        :key="room.id"
        class="border border-[var(--border-subtle)] rounded-xl p-4 hover:border-[var(--color-primary)] transition-colors cursor-pointer bg-[var(--bg-secondary)]"
      >
        <div class="flex items-start justify-between mb-2">
          <h3 class="font-bold text-lg truncate flex-1 flex items-center gap-1">
            {{ room.name }}
            <span v-if="room.hasPassword" class="text-xs">🔒</span>
          </h3>
          <div class="flex items-center gap-1 ml-2 shrink-0">
            <button
              @click.stop="openEditDialog(room)"
              class="text-xs text-text-main/40 hover:text-[var(--color-primary)] transition-colors"
              title="修改房间名"
            >✏️</button>
            <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              {{ room.participantCount }} 人
            </span>
          </div>
        </div>
        <p class="text-sm text-text-main/60 mb-1">房主：{{ room.creatorName }}</p>
        <p class="text-xs text-text-main/40 mb-4">{{ formatTime(room.createdAt) }}</p>
        <div class="flex gap-2">
          <Button @click.stop="handleJoinRoom(room.id)" variant="primary" size="sm" class="flex-1">加入</Button>
          <Button @click.stop="openOwnerLogin(room.id)" variant="outline" size="sm">房主</Button>
          <Button v-if="isAdmin" @click.stop="adminDeleteRoom(room.id)" variant="danger" size="sm" title="管理员删除">删除</Button>
        </div>
      </div>
    </div>

    <!-- 创建房间弹窗 -->
    <div v-if="showCreateDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showCreateDialog = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-white/10 text-white">
        <h2 class="text-xl font-bold mb-4">创建房间</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-white/70">房间名称</label>
            <input v-model="newRoomName" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="给房间起个名字" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-white/70">你的昵称</label>
            <input v-model="creatorName" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="创建者昵称" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-white/70">房主密码（可选）</label>
            <input v-model="newRoomPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="设置后以房主身份进入需要密码" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-white/70">房间密码（可选）</label>
            <input v-model="newRoomAccessPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="设置后加入房间需要密码" />
          </div>
          <p v-if="store.error" class="text-red-500 text-sm">{{ store.error }}</p>
          <div class="flex gap-2 pt-2">
            <Button @click="showCreateDialog = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="handleCreateRoom" variant="primary" class="flex-1" :disabled="store.isConnecting">
              {{ store.isConnecting ? '创建中...' : '创建' }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 加入房间弹窗 -->
    <div v-if="showJoinDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showJoinDialog = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-white/10 text-white">
        <h2 class="text-xl font-bold mb-4">加入房间</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-white/70">你的昵称</label>
            <input v-model="joinUserName" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入昵称" @keyup.enter="confirmJoin" />
          </div>
          <div v-if="store.rooms.find(r => r.id === joinRoomId)?.hasPassword">
            <label class="block text-sm mb-1 text-white/70">房间密码</label>
            <input v-model="joinRoomPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入房间密码" @keyup.enter="confirmJoin" />
          </div>
          <div class="flex gap-2 pt-2">
            <Button @click="showJoinDialog = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="confirmJoin" variant="primary" class="flex-1" :disabled="store.isConnecting">
              {{ store.isConnecting ? '加入中...' : '加入' }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 房主登录弹窗 -->
    <div v-if="showOwnerLogin" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showOwnerLogin = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-white/10 text-white">
        <h2 class="text-xl font-bold mb-4">房主登录</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-white/70">房主密码</label>
            <input v-model="ownerPassword" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入房主密码" @keyup.enter="confirmOwnerLogin" />
          </div>
          <div class="flex gap-2 pt-2">
            <Button @click="showOwnerLogin = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="confirmOwnerLogin" variant="primary" class="flex-1">登录</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改房间名弹窗 -->
    <div v-if="showEditDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showEditDialog = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-white/10 text-white">
        <h2 class="text-xl font-bold mb-4">修改房间名</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-white/70">新房间名</label>
            <input v-model="editRoomName" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入新房间名" @keyup.enter="confirmEdit" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-white/70">房主密码（没设密码留空）</label>
            <input v-model="editOwnerIdentity" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入房主密码" @keyup.enter="confirmEdit" />
          </div>
          <div class="flex gap-2 pt-2">
            <Button @click="showEditDialog = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="confirmEdit" variant="primary" class="flex-1">保存</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 管理员登录弹窗 -->
    <div v-if="showAdminLogin" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showAdminLogin = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-[var(--border-subtle)] text-white">
        <h2 class="text-xl font-bold mb-4 text-white">管理员登录</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-white/70">管理员密码</label>
            <input v-model="adminPasswordInput" type="password" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入管理员密码" @keyup.enter="adminLogin" />
          </div>
          <p v-if="adminError" class="text-red-400 text-xs">{{ adminError }}</p>
          <div class="flex gap-2 pt-2">
            <Button @click="showAdminLogin = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="adminLogin" variant="primary" class="flex-1">登录</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑个人资料弹窗 -->
    <div v-if="showProfileDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showProfileDialog = false">
      <div class="bg-[#1e1e2e] rounded-2xl p-6 w-96 border border-white/10 text-white">
        <h2 class="text-xl font-bold mb-4 text-white">个人资料</h2>
        <div class="space-y-4">
          <!-- 头像预览 -->
          <div class="flex justify-center">
            <div
              class="w-20 h-20 rounded-full overflow-hidden bg-white/10 flex items-center justify-center cursor-pointer border-2 border-dashed border-white/30 hover:border-[var(--color-primary)] transition-colors"
              @click="triggerAvatarUpload"
            >
              <img v-if="editAvatar" :src="editAvatar" class="w-full h-full object-cover" />
              <span v-else class="text-2xl text-white/40">+</span>
            </div>
          </div>
          <input ref="avatarFileInput" type="file" accept="image/*" class="hidden" @change="onAvatarSelected" />
          <p class="text-center text-xs text-white/40">点击头像上传图片（最大2MB）</p>
          <!-- 昵称 -->
          <div>
            <label class="block text-sm mb-1 text-white/70">昵称</label>
            <input v-model="editNickname" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-[var(--color-primary)] outline-none" placeholder="输入昵称" maxlength="20" />
          </div>
          <div v-if="editAvatar" class="flex justify-center">
            <button @click="editAvatar = ''" class="text-xs text-white/50 hover:text-red-400 transition-colors">移除头像</button>
          </div>
          <div class="flex gap-2 pt-2">
            <Button @click="showProfileDialog = false" variant="outline" class="flex-1">取消</Button>
            <Button @click="confirmProfile" variant="primary" class="flex-1">保存</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>