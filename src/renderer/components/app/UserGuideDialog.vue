<script setup lang="ts">
/**
 * 内置使用指南
 *
 * 左侧章节，右侧内容；顶部可搜索。入口：设置 → 关于，或首次启动的版本亮点里。
 */
import { computed, ref, watch } from 'vue';
import Dialog from '@/components/ui/Dialog.vue';
import { USER_GUIDE_SECTIONS, type GuideSection } from '@/data/userGuide';
import { closeUserGuide, userGuideOpen } from '@/composables/useHelpDialogs';

const open = computed({
  get: () => userGuideOpen.value,
  set: (value: boolean) => {
    if (!value) closeUserGuide();
  },
});

const query = ref('');
const activeId = ref(USER_GUIDE_SECTIONS[0]?.id ?? '');

const filtered = computed<GuideSection[]>(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return USER_GUIDE_SECTIONS;
  return USER_GUIDE_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.title.toLowerCase().includes(keyword) ||
        item.body.toLowerCase().includes(keyword) ||
        section.title.toLowerCase().includes(keyword),
    ),
  })).filter((section) => section.items.length > 0);
});

const active = computed<GuideSection | undefined>(
  () => filtered.value.find((section) => section.id === activeId.value) ?? filtered.value[0],
);

watch(filtered, (list) => {
  if (!list.length) return;
  if (!list.some((section) => section.id === activeId.value)) {
    activeId.value = list[0].id;
  }
});

watch(userGuideOpen, (open) => {
  if (open) query.value = '';
});
</script>

<template>
  <Dialog
    v-model:open="open"
    content-class="user-guide-dialog"
    :close-on-interact-outside="false"
    show-close
  >
    <template #title>使用指南</template>

    <div class="guide">
      <div class="guide-search">
        <input
          v-model="query"
          class="guide-search-input"
          type="search"
          placeholder="搜索功能，例如「桌面歌词」"
        />
      </div>

      <div class="guide-body">
        <nav class="guide-nav" aria-label="指南章节">
          <button
            v-for="section in filtered"
            :key="section.id"
            type="button"
            class="guide-nav-item"
            :class="{ active: active?.id === section.id }"
            @click="activeId = section.id"
          >
            <span class="guide-nav-title">{{ section.title }}</span>
            <span class="guide-nav-summary">{{ section.summary }}</span>
          </button>
          <p v-if="!filtered.length" class="guide-empty">没有匹配的内容</p>
        </nav>

        <div v-if="active" class="guide-content">
          <h3 class="guide-content-title">{{ active.title }}</h3>
          <div v-for="item in active.items" :key="item.title" class="guide-item">
            <h4 class="guide-item-title">{{ item.title }}</h4>
            <p class="guide-item-body">{{ item.body }}</p>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
:global(.user-guide-dialog) {
  width: min(720px, calc(100vw - 48px));
}

.guide {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 380px;
}

.guide-search-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--text-main) 4%, transparent);
  color: var(--text-main);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.guide-search-input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
}

.guide-body {
  display: flex;
  gap: 16px;
  min-height: 320px;
}

.guide-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 180px;
  flex-shrink: 0;
  overflow-y: auto;
  max-height: 360px;
}

.guide-nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.guide-nav-item:hover {
  background: color-mix(in srgb, var(--text-main) 6%, transparent);
}

.guide-nav-item.active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.guide-nav-title {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.guide-nav-summary {
  font-size: 11px;
  line-height: 16px;
  color: var(--color-text-secondary);
}

.guide-empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.guide-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  max-height: 360px;
  padding-right: 4px;
}

.guide-content-title {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 20px;
  font-weight: 650;
  color: var(--text-main);
}

.guide-item {
  padding: 10px 0;
  border-top: 1px solid var(--border-subtle);
}

.guide-item:first-of-type {
  border-top: none;
  padding-top: 0;
}

.guide-item-title {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.guide-item-body {
  margin: 0;
  font-size: 12px;
  line-height: 19px;
  color: var(--color-text-secondary);
}
</style>
