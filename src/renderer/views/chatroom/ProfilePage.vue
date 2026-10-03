<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ProfilePage.vue
  描述：个人中心页 - 头像/昵称/个人资料编辑
-->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { roomApi } from '@/utils/roomApi';
import { useChatRoomStore } from '@/stores/chatRoom';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const chatStore = useChatRoomStore();

interface UserProfile {
  userId: number;
  name: string;
  nickname?: string;   // 昵称（显示名，优先于 name 展示）
  avatar: string;
  age: number;
  zodiac: string;
  photos: string[];
  bio: string;
}

const profile = ref<UserProfile | null>(null);
const loading = ref(false);
const saving = ref(false);
const editMode = ref(false);

// 编辑表单
const editBio = ref('');
const editPhotos = ref<string[]>([]);
const editAvatar = ref('');
const editName = ref('');

// 修改密码
const oldPassword = ref('');
const newPassword = ref('');
const changingPwd = ref(false);
async function changePassword() {
  if (!oldPassword.value || !newPassword.value) return;
  if (newPassword.value.length < 4) { alert('新密码至少4位'); return; }
  changingPwd.value = true;
  try {
    await roomApi.changePassword(oldPassword.value, newPassword.value);
    alert('密码修改成功');
    oldPassword.value = '';
    newPassword.value = '';
  } catch (e: any) {
    alert(e.message || '修改失败');
  } finally {
    changingPwd.value = false;
  }
}

const avatarInput = ref<HTMLInputElement | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);

// 图片预览
const previewIndex = ref(-1);
const previewPhotos = computed(() => profile.value?.photos || []);

function openPreview(index: number) {
  previewIndex.value = index;
}
function closePreview() {
  previewIndex.value = -1;
}
function prevPhoto() {
  if (previewIndex.value > 0) previewIndex.value--;
  else previewIndex.value = previewPhotos.value.length - 1;
}
function nextPhoto() {
  if (previewIndex.value < previewPhotos.value.length - 1) previewIndex.value++;
  else previewIndex.value = 0;
}

onMounted(loadProfile);

async function loadProfile() {
  loading.value = true;
  try {
    profile.value = await roomApi.getMe();
  } catch (e) {
    console.error('加载资料失败', e);
  } finally {
    loading.value = false;
  }
}

function startEdit() {
  if (!profile.value) return;
  editBio.value = profile.value.bio;
  editPhotos.value = [...profile.value.photos];
  editAvatar.value = profile.value.avatar;
  // 编辑的是昵称（显示名），不是登录账号
  editName.value = profile.value.nickname || profile.value.name;
  editMode.value = true;
}

function cancelEdit() {
  editMode.value = false;
}

async function saveProfile() {
  saving.value = true;
  try {
    const result: any = await roomApi.updateProfile({
      nickname: editName.value,
      avatar: editAvatar.value,
      photos: editPhotos.value,
      bio: editBio.value,
    });
    // 改的是昵称：同步本地显示名（登录账号 chat_login_name 不变）
    if (result?.nickname) {
      if (profile.value) profile.value.nickname = result.nickname;
      localStorage.setItem('chat_login_nickname', result.nickname);
    }
    // 同步头像到 localStorage，房间内和列表页即时生效
    if (editAvatar.value) localStorage.setItem('chatroom_avatarImage', editAvatar.value);
    else localStorage.removeItem('chatroom_avatarImage');
    // 更新 store 里的我的头像（即使不在房间里也即时生效）
    chatStore.myAvatar = editAvatar.value || '';
    // 如果在房间内，实时同步头像给房间内所有人
    if (chatStore.isConnected && editAvatar.value) {
      chatStore.updateMyAvatar(editAvatar.value).catch(() => {});
    }
    await loadProfile();
    editMode.value = false;
  } catch (e: any) {
    alert(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('图片不能超过2MB'); return; }
  const reader = new FileReader();
  reader.onload = () => { editAvatar.value = reader.result as string; };
  reader.readAsDataURL(file);
}

function onPhotosSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (editPhotos.value.length + files.length > 9) {
    alert('最多9张图片');
    return;
  }
  files.forEach(file => {
    if (file.size > 2 * 1024 * 1024) { alert(`${file.name} 超过2MB`); return; }
    const reader = new FileReader();
    reader.onload = () => { editPhotos.value.push(reader.result as string); };
    reader.readAsDataURL(file);
  });
}

function removePhoto(index: number) {
  editPhotos.value.splice(index, 1);
}

function removeAvatar() {
  editAvatar.value = '';
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6">
  <div class="max-w-3xl mx-auto pb-20">
    <div class="flex items-center gap-3 mb-6">
      <button class="p-1.5 rounded-md hover:bg-[var(--control-hover-bg)] transition-colors" @click="router.push('/main/chatroom')">
        <span class="text-lg">←</span>
      </button>
      <h1 class="text-2xl font-bold">个人中心</h1>
    </div>

    <div v-if="loading" class="text-center py-20 opacity-50">加载中...</div>

    <div v-else-if="profile" class="space-y-6">
      <!-- 查看模式 -->
      <div v-if="!editMode" class="bg-[var(--control-track-bg)] rounded-2xl p-6">
        <div class="flex items-start gap-6 mb-6">
          <div class="w-24 h-24 rounded-full shrink-0 p-[2px] bg-transparent border-2 border-[color:var(--border-subtle,rgba(140,140,175,0.35))] transition-colors">
            <div class="w-full h-full rounded-full overflow-hidden bg-transparent flex items-center justify-center">
              <img v-if="profile.avatar" :src="profile.avatar" class="w-full h-full object-cover" />
              <svg v-else class="w-12 h-12 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
            </svg>
            </div>
          </div>
          <div class="flex-1">
            <h2 class="text-xl font-bold mb-1">{{ profile.nickname || profile.name }}</h2>
            <p class="text-xs opacity-40 mb-1">账号：{{ profile.name }}</p>
            <p class="text-xs opacity-50 mb-1">ID：{{ 999 + (profile?.userId || 0) }}</p>
            <p v-if="profile.bio" class="text-sm opacity-70">{{ profile.bio }}</p>
          </div>
          <Button size="sm" @click="startEdit">编辑资料</Button>
        </div>

        <!-- 图片墙 -->
        <div v-if="profile.photos.length > 0">
          <h3 class="text-sm font-bold opacity-60 mb-3">图片墙</h3>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="(photo, i) in profile.photos"
              :key="i"
              class="aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)] cursor-pointer hover:opacity-80 transition-opacity"
              @click="openPreview(i)"
            >
              <img :src="photo" class="w-full h-full object-cover" />
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 opacity-40 text-sm">
          还没有图片墙，点击「编辑资料」上传
        </div>
      </div>

      <!-- 编辑模式 -->
      <div v-else class="bg-[var(--control-track-bg)] rounded-2xl p-6 space-y-5">
        <!-- 头像 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">头像</label>
          <div class="flex items-center gap-4">
            <div class="w-20 h-20 rounded-full shrink-0 p-[2px] bg-transparent border-2 border-[color:var(--border-subtle,rgba(140,140,175,0.35))] transition-colors">
              <div class="w-full h-full rounded-full overflow-hidden bg-transparent flex items-center justify-center">
                <img v-if="editAvatar" :src="editAvatar" class="w-full h-full object-cover" />
                <svg v-else class="w-10 h-10 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
              </svg>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="avatarInput?.click()">上传头像</Button>
              <Button v-if="editAvatar" variant="ghost" size="sm" @click="removeAvatar">移除</Button>
            </div>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarSelected" />
          </div>
        </div>

        <!-- 账号（只读，不可改） -->
        <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-secondary)]">
          <span class="text-sm opacity-70">账号</span>
          <span class="text-sm font-mono opacity-60">{{ profile?.name }}（不可修改）</span>
        </div>

        <!-- 昵称 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">昵称 <span class="text-xs font-normal opacity-50">（房间里的显示名）</span></label>
          <input
            v-model="editName"
            type="text"
            maxlength="20"
            class="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
            placeholder="输入昵称"
          />
        </div>

        <!-- 用户ID -->
        <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-secondary)]">
          <span class="text-sm opacity-70">用户ID</span>
          <span class="text-sm font-mono">ID：{{ 999 + (profile?.userId || 0) }}</span>
        </div>

        <!-- 修改密码 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">修改密码</label>
          <div class="space-y-2">
            <input
              v-model="oldPassword"
              type="password"
              class="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="旧密码"
            />
            <input
              v-model="newPassword"
              type="password"
              class="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="新密码（至少4位）"
            />
            <button
              class="px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="changingPwd || !oldPassword || !newPassword"
              @click="changePassword"
            >{{ changingPwd ? '修改中...' : '修改密码' }}</button>
          </div>
        </div>

        <!-- 简介 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">个性签名</label>
          <textarea
            v-model="editBio"
            rows="2"
            maxlength="200"
            class="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
            placeholder="写点什么..."
          />
        </div>

        <!-- 图片墙 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">图片墙（最多9张）</label>
          <div class="grid grid-cols-3 gap-2 mb-2">
            <div
              v-for="(photo, i) in editPhotos"
              :key="i"
              class="aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)] relative group"
            >
              <img :src="photo" class="w-full h-full object-cover" />
              <button
                class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                @click="removePhoto(i)"
              >×</button>
            </div>
            <button
              v-if="editPhotos.length < 9"
              class="aspect-square rounded-lg border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center text-2xl opacity-40 hover:opacity-70 transition-opacity"
              @click="photoInput?.click()"
            >+</button>
          </div>
          <input ref="photoInput" type="file" accept="image/*" multiple class="hidden" @change="onPhotosSelected" />
        </div>

        <!-- 操作 -->
        <div class="flex gap-2 pt-2">
          <Button variant="outline" class="flex-1" @click="cancelEdit">取消</Button>
          <Button class="flex-1" :disabled="saving" @click="saveProfile">
            {{ saving ? '保存中...' : '保存' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
  </div>

  <!-- 图片预览弹窗 -->
  <Teleport to="body">
    <div
      v-if="previewIndex >= 0 && previewPhotos[previewIndex]"
      class="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center"
      @click.self="closePreview"
    >
      <!-- 关闭 -->
      <button
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="closePreview"
      >×</button>
      <!-- 上一张 -->
      <button
        v-if="previewPhotos.length > 1"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="prevPhoto"
      >‹</button>
      <!-- 下一张 -->
      <button
        v-if="previewPhotos.length > 1"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="nextPhoto"
      >›</button>
      <!-- 图片 -->
      <img
        :src="previewPhotos[previewIndex]"
        class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        @click.stop
      />
      <!-- 计数 -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        {{ previewIndex + 1 }} / {{ previewPhotos.length }}
      </div>
    </div>
  </Teleport>
</template>
