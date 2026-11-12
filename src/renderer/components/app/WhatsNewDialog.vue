<script setup lang="ts">
/**
 * 版本亮点弹窗
 *
 * 升级后首次启动自动弹出（见 App.vue 的 maybeShowWhatsNew），
 * 也可以在「设置 → 关于」里点「本版亮点」再看。
 */
import { computed } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import { useSettingStore } from '@/stores/setting';
import { findRelease } from '@/data/whatsNew';
import { closeWhatsNew, whatsNewOpen } from '@/composables/useHelpDialogs';

const settingStore = useSettingStore();

const version = computed(() => String(settingStore.appVersion || ''));
const release = computed(() => findRelease(version.value));

const open = computed({
  get: () => whatsNewOpen.value,
  set: (value: boolean) => {
    if (!value) dismiss();
  },
});

const dismiss = () => {
  if (version.value) {
    try {
      localStorage.setItem('lyrise_whatsnew_seen', version.value);
    } catch {
      // 存储不可用时忽略：本次仍会关闭，只是下次还会弹
    }
  }
  closeWhatsNew();
};
</script>

<template>
  <Dialog
    v-model:open="open"
    content-class="whats-new-dialog"
    :close-on-interact-outside="false"
    show-close
  >
    <template #title>本次更新</template>

    <div v-if="release" class="whats-new">
      <div class="whats-new-head">
        <span class="whats-new-version">v{{ release.version }}</span>
        <h3 v-if="release.headline" class="whats-new-headline">{{ release.headline }}</h3>
      </div>

      <ul class="whats-new-list">
        <li v-for="feature in release.features" :key="feature.title" class="whats-new-item">
          <span class="whats-new-dot" aria-hidden="true"></span>
          <div class="whats-new-text">
            <h4 class="whats-new-title">{{ feature.title }}</h4>
            <p class="whats-new-desc">{{ feature.desc }}</p>
          </div>
        </li>
      </ul>

      <div class="whats-new-foot">
        <Button variant="primary" size="sm" @click="dismiss">知道了</Button>
      </div>
    </div>

    <div v-else class="whats-new-empty">当前版本没有单独的更新说明。</div>
  </Dialog>
</template>

<style scoped>
:global(.whats-new-dialog) {
  width: min(460px, calc(100vw - 48px));
}

.whats-new {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px 2px;
}

.whats-new-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.whats-new-version {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  color: var(--color-primary-text);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.whats-new-headline {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  font-weight: 650;
  color: var(--text-main);
}

.whats-new-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.whats-new-item {
  display: flex;
  gap: 10px;
}

.whats-new-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--color-primary);
}

.whats-new-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.whats-new-title {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.whats-new-desc {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text-secondary);
}

.whats-new-foot {
  display: flex;
  justify-content: flex-end;
}

.whats-new-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
