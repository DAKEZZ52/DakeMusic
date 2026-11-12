/**
 * LyriseMusic 语聊房 - 成员资料卡
 * 描述：成员资料弹窗、加载状态与资料墙图片预览。
 */
import { ref } from 'vue';
import { roomApi } from '@/utils/roomApi';

export function useMemberProfile() {
  const showUserProfile = ref(false);
  const viewingUser = ref<any>(null);
  const loadingUser = ref(false);

  async function openUserProfile(identity?: string) {
    // LyriseMusic: 防止 identity 为 undefined 时报错
    if (!identity) return;
    const userId = Number(identity.replace('user_', ''));
    if (!userId) return;
    loadingUser.value = true;
    viewingUser.value = null;
    showUserProfile.value = true;
    try {
      viewingUser.value = await roomApi.getUser(userId);
      viewingUser.value.identity = identity;
    } catch {
      viewingUser.value = { error: '加载失败' };
    } finally {
      loadingUser.value = false;
    }
  }
  // LyriseMusic: 资料卡图片墙 - 应用内点击放大预览
  const previewPhotoUrl = ref('');
  function openPhoto(url: string) {
    previewPhotoUrl.value = url;
  }

  return { showUserProfile, viewingUser, loadingUser, openUserProfile, previewPhotoUrl, openPhoto };
}
