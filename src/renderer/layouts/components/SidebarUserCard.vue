<script setup lang="ts">
/**
 * SidebarUserCard — 侧边栏底部用户信息卡片
 * 显示头像、昵称、VIP 等级徽章，点击跳转个人页，右侧齿轮进设置。
 * 从 Sidebar.vue 拆出，独立管理用户 store 和 VIP 计算逻辑。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '@/components/ui/Avatar.vue';
import Button from '@/components/ui/Button.vue';
import { iconSettings } from '@/icons';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();

const isLoggedIn = computed(() => userStore.isLoggedIn);
const userInfo = computed(() => userStore.info);

interface VipLevelInfo {
  product_type?: string;
  is_vip?: number;
}

interface VipInfoState {
  busi_vip?: VipLevelInfo[];
}

const vipInfo = computed<VipInfoState>(
  () => (userInfo.value?.extendsInfo?.vip as VipInfoState | undefined) || {},
);
const busiVip = computed<VipLevelInfo[]>(() => vipInfo.value?.busi_vip || []);
const svip = computed(() => busiVip.value.find((v) => v.product_type === 'svip' && v.is_vip === 1));
const tvip = computed(() => busiVip.value.find((v) => v.product_type === 'tvip' && v.is_vip === 1));
const vipBadge = computed(() => {
  if (svip.value) return 'svip';
  if (tvip.value) return 'tvip';
  return 'novip';
});

const navigateToProfile = () => {
  router.push(isLoggedIn.value ? '/main/profile' : '/login');
};
</script>

<template>
  <div class="sidebar-user-card px-4 pb-4 shrink-0 no-drag">
    <div
      class="user-info-card flex items-center overflow-hidden bg-bg-info-card border border-[var(--border-subtle)] rounded-[20px] p-1 transition-all duration-200"
    >
      <div
        class="sidebar-user-link min-w-0 flex-1 flex items-center gap-3 p-1.5 rounded-[14px] cursor-pointer transition-all active:scale-[0.98]"
        @click="navigateToProfile"
      >
        <div
          class="w-8.5 h-8.5 shrink-0 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden"
        >
          <Avatar :src="isLoggedIn ? userInfo?.pic : ''" class="w-full h-full" />
        </div>
        <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
          <span
            class="text-[13px] font-semibold text-primary-text truncate leading-tight tracking-tight"
          >
            {{ isLoggedIn ? userInfo?.nickname : '未登录' }}
          </span>
          <span
            class="truncate text-[9px] text-text-secondary font-medium tracking-wider inline-flex items-center gap-1.5"
          >
            <template v-if="isLoggedIn">
              <span class="shrink-0 opacity-60">Lv.{{ userInfo?.p_grade || 0 }}</span>
              <span class="h-2.5 w-px shrink-0 bg-text-main/15"></span>
              <span
                v-if="vipBadge === 'svip'"
                class="shrink-0 px-0.75 py-[1.5px] rounded-sm bg-linear-to-r from-orange-500 to-orange-500/80 text-[8px] text-white font-black leading-none"
                >SVIP</span
              >
              <span
                v-else-if="vipBadge === 'tvip'"
                class="shrink-0 px-0.75 py-[1.5px] rounded-sm bg-linear-to-r from-[#07C160] to-[#07C160]/80 text-[8px] text-white font-black leading-none"
                >TVIP</span
              >
              <span
                v-else
                class="shrink-0 px-0.75 py-[1.5px] rounded-sm bg-linear-to-r from-gray-500/60 to-gray-500/40 text-[8px] text-white/60 font-black leading-none"
                >NOVIP</span
              >
            </template>
            <span v-else class="opacity-60">点击登录账号</span>
          </span>
        </div>
      </div>
      <div class="sidebar-user-divider"></div>
      <Button
        variant="unstyled"
        size="none"
        class="sidebar-settings-btn p-2 mr-1 rounded-[14px] text-text-secondary transition-all active:scale-90"
        @click="router.push('/main/settings')"
      >
        <Icon :icon="iconSettings" width="19" height="19" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-user-divider {
  width: 1px;
  height: 24px;
  background: var(--border-subtle, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
}

.sidebar-user-link:hover {
  background: var(--control-hover-bg, rgba(0, 0, 0, 0.04));
}

.sidebar-settings-btn:hover {
  background: var(--control-hover-bg, rgba(0, 0, 0, 0.04));
  color: var(--color-primary, #0071e3);
}
</style>
