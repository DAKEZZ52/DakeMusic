<script setup lang="ts">
import { computed, ref } from 'vue';
import { useUserStore } from '@/stores/user';
import { useToastStore } from '@/stores/toast';
import Button from '@/components/ui/Button.vue';
import {
  iconGift,
  iconCheck,
  iconHome,
  iconScan,
  iconInfo,
} from '@/icons';
import logger from '@/utils/logger';

interface VipLevelInfo {
  product_type?: string;
  is_vip?: number;
  vip_begin_time?: string | number;
  vip_end_time?: string | number;
}

const userStore = useUserStore();
const toastStore = useToastStore();

const isClaiming = ref(false);
const isUpgrading = ref(false);

const vipInfo = computed(
  () => (userStore.info?.extendsInfo?.vip as { busi_vip?: VipLevelInfo[] } | undefined) || {},
);
const busiVip = computed<VipLevelInfo[]>(() => vipInfo.value?.busi_vip || []);
const tvip = computed(() => busiVip.value.find((v) => v.product_type === 'tvip' && v.is_vip === 1));
const svip = computed(() => busiVip.value.find((v) => v.product_type === 'svip' && v.is_vip === 1));

const tvipActive = computed(() => {
  if (!tvip.value?.vip_end_time) return false;
  try {
    return new Date(tvip.value.vip_end_time).getTime() > Date.now();
  } catch {
    return false;
  }
});

const svipActive = computed(() => {
  if (!svip.value?.vip_end_time) return false;
  try {
    return new Date(svip.value.vip_end_time).getTime() > Date.now();
  } catch {
    return false;
  }
});

const getVipExpireText = (vipData?: VipLevelInfo) => {
  if (!vipData?.vip_end_time) return null;
  try {
    const expireDate = new Date(vipData.vip_end_time);
    const diff = expireDate.getTime() - Date.now();
    if (diff < 0) return '已过期';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (days > 365) return `${Math.floor(days / 365)}年后到期`;
    if (days > 30) return `${Math.floor(days / 30)}个月后到期`;
    if (days > 0) return `${days}天后到期`;
    if (hours > 0) return `${hours}小时后到期`;
    return '即将到期';
  } catch {
    return null;
  }
};

const handleClaimTvip = async () => {
  if (isClaiming.value) return;
  isClaiming.value = true;
  try {
    await userStore.claimTvip();
    toastStore.success('畅听会员领取成功');
  } catch (e) {
    logger.error('VipClaimCard', 'Claim tvip error:', e);
    const msg = e instanceof Error ? e.message : '领取失败，请稍后重试';
    toastStore.danger(msg);
  } finally {
    isClaiming.value = false;
  }
};

const handleUpgradeSvip = async () => {
  if (isUpgrading.value) return;
  if (!tvipActive.value) {
    toastStore.warning('请先领取畅听会员');
    return;
  }
  isUpgrading.value = true;
  try {
    await userStore.upgradeSvip();
    toastStore.success('概念会员升级成功');
  } catch (e) {
    logger.error('VipClaimCard', 'Upgrade svip error:', e);
    const msg = e instanceof Error ? e.message : '升级失败，请稍后重试';
    toastStore.danger(msg);
  } finally {
    isUpgrading.value = false;
  }
};
</script>

<template>
  <div
    class="p-4 rounded-2xl border"
    :class="svipActive
      ? 'bg-orange-500/10 border-orange-500/20'
      : tvipActive
        ? 'bg-green-500/10 border-green-500/20'
        : 'bg-[var(--content-panel-bg)] border-[var(--content-panel-border)]'"
  >
    <div class="flex items-center gap-2 mb-4">
      <Icon :icon="iconGift" width="18" height="18" class="text-primary-text" />
      <h3 class="text-[15px] font-black">每日权益</h3>
    </div>

    <div class="space-y-3">
      <div
        class="flex items-center gap-3 p-3 rounded-xl border transition-all"
        :class="tvipActive
          ? 'bg-green-500/15 border-green-500/30'
          : 'bg-[var(--control-muted-bg)] border-transparent hover:border-green-500/20'"
      >
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          :class="tvipActive ? 'bg-green-500/25 text-green-500' : 'bg-[var(--control-hover-bg)] text-text-secondary'"
        >
          <Icon :icon="iconHome" width="20" height="20" />
        </div>
        <div class="flex-1 min-w-0">
          <h4
            class="text-[13px] font-black"
            :class="tvipActive ? 'text-green-500' : 'text-text-main'"
          >
            领取畅听会员
          </h4>
          <p v-if="tvipActive" class="text-[11px] opacity-60 font-bold mt-0.5">
            {{ getVipExpireText(tvip) }}
          </p>
          <p v-else class="text-[11px] opacity-50 font-bold mt-0.5">
            每日免费领取，畅享无损音质
          </p>
        </div>
        <div v-if="tvipActive" class="text-green-500 shrink-0">
          <Icon :icon="iconCheck" width="18" height="18" />
        </div>
        <Button
          v-else
          variant="primary"
          size="sm"
          :loading="isClaiming"
          :disabled="isClaiming"
          @click="handleClaimTvip"
          class="shrink-0 rounded-full"
        >
          领取
        </Button>
      </div>

      <div
        class="flex items-center gap-3 p-3 rounded-xl border transition-all"
        :class="svipActive
          ? 'bg-orange-500/15 border-orange-500/30'
          : 'bg-[var(--control-muted-bg)] border-transparent hover:border-orange-500/20'"
      >
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          :class="svipActive ? 'bg-orange-500/25 text-orange-500' : 'bg-[var(--control-hover-bg)] text-text-secondary'"
        >
          <Icon :icon="iconScan" width="20" height="20" />
        </div>
        <div class="flex-1 min-w-0">
          <h4
            class="text-[13px] font-black"
            :class="svipActive ? 'text-orange-500' : 'text-text-main'"
          >
            升级概念会员
          </h4>
          <p v-if="svipActive" class="text-[11px] opacity-60 font-bold mt-0.5">
            {{ getVipExpireText(svip) }}
          </p>
          <p v-else class="text-[11px] opacity-50 font-bold mt-0.5">
            {{ tvipActive ? '畅听会员可免费升级' : '需先领取畅听会员' }}
          </p>
        </div>
        <div v-if="svipActive" class="text-orange-500 shrink-0">
          <Icon :icon="iconCheck" width="18" height="18" />
        </div>
        <Button
          v-else
          variant="primary"
          size="sm"
          :loading="isUpgrading"
          :disabled="isUpgrading || !tvipActive"
          @click="handleUpgradeSvip"
          class="shrink-0 rounded-full"
        >
          升级
        </Button>
      </div>
    </div>

   
  </div>
</template>
