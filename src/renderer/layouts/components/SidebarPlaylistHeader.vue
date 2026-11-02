<script setup lang="ts">
/**
 * SidebarPlaylistHeader — 歌单列表头部
 * 包含「自建歌单 / 收藏歌单」Tab 切换、排序、刷新、新建/导入歌单菜单。
 * 通过 props 接收状态，通过 emit 通知父组件操作。
 */
import Button from '@/components/ui/Button.vue';
import Popover from '@/components/ui/Popover.vue';
import RefreshIcon from '@/components/ui/RefreshIcon.vue';
import { iconArrowsSort, iconExternalLink, iconPlaylistAdd, iconPlus } from '@/icons';

defineProps<{
  activeTab: number;
  isLoggedIn: boolean;
  showCreateMenu: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:showCreateMenu', v: boolean): void;
  (e: 'tab-change', tab: number): void;
  (e: 'open-order'): void;
  (e: 'refresh'): void;
  (e: 'create-playlist'): void;
  (e: 'import-playlist'): void;
}>();
</script>

<template>
  <div class="sidebar-playlist-header pl-7.5 pr-3 mb-2 flex items-center gap-1.5">
    <div class="min-w-0 flex flex-1 items-center gap-1">
      <Button
        variant="unstyled"
        size="none"
        :class="[
          'sidebar-playlist-tab',
          activeTab === 0
            ? 'text-primary-text opacity-100'
            : 'text-text-main opacity-60 hover:opacity-80',
        ]"
        @click="emit('tab-change', 0)"
      >
        自建歌单
      </Button>
      <span class="sidebar-tab-divider" aria-hidden="true"></span>
      <Button
        variant="unstyled"
        size="none"
        :class="[
          'sidebar-playlist-tab',
          activeTab === 1
            ? 'text-primary-text opacity-100'
            : 'text-text-main opacity-60 hover:opacity-80',
        ]"
        @click="emit('tab-change', 1)"
      >
        收藏歌单
      </Button>
    </div>
    <div class="flex items-center gap-0.5 shrink-0 pl-0.5">
      <Button
        variant="unstyled"
        size="none"
        type="button"
        class="sidebar-section-action sidebar-icon-btn"
        tooltip="调整歌单顺序"
        :disabled="!isLoggedIn"
        @click="emit('open-order')"
      >
        <Icon :icon="iconArrowsSort" width="12" height="12" />
      </Button>
      <Button
        variant="unstyled"
        size="none"
        type="button"
        class="sidebar-section-action sidebar-icon-btn"
        tooltip="刷新歌单"
        :disabled="!isLoggedIn"
        @click="emit('refresh')"
      >
        <RefreshIcon width="13" height="13" />
      </Button>
      <div class="sidebar-section-action-slot">
        <Popover
          v-if="isLoggedIn && activeTab === 0"
          :open="showCreateMenu"
          trigger="click"
          side="bottom"
          align="end"
          :side-offset="6"
          :show-arrow="false"
          content-class="sidebar-create-menu"
          @update:open="emit('update:showCreateMenu', $event)"
        >
          <template #trigger>
            <Button
              variant="unstyled"
              size="none"
              type="button"
              class="sidebar-section-action sidebar-icon-btn"
              tooltip="添加歌单"
            >
              <Icon :icon="iconPlus" width="12" height="12" />
            </Button>
          </template>

          <div class="sidebar-create-menu-list">
            <div class="sidebar-create-menu-title">添加歌单</div>
            <button
              type="button"
              class="sidebar-create-menu-item"
              @click="
                () => {
                  emit('update:showCreateMenu', false);
                  emit('create-playlist');
                }
              "
            >
              <span class="sidebar-create-menu-icon">
                <Icon :icon="iconPlaylistAdd" width="16" height="16" />
              </span>
              <div class="min-w-0 flex-1 text-left">
                <div class="sidebar-create-menu-title-row">新建空歌单</div>
                <div class="sidebar-create-menu-desc">自定义名称从零开始</div>
              </div>
            </button>
            <button
              type="button"
              class="sidebar-create-menu-item"
              @click="
                () => {
                  emit('update:showCreateMenu', false);
                  emit('import-playlist');
                }
              "
            >
              <span class="sidebar-create-menu-icon">
                <Icon :icon="iconExternalLink" width="16" height="16" />
              </span>
              <div class="min-w-0 flex-1 text-left">
                <div class="sidebar-create-menu-title-row">导入外部歌单</div>
                <div class="sidebar-create-menu-desc">链接 / 截图</div>
              </div>
            </button>
          </div>
        </Popover>
      </div>
    </div>
  </div>
</template>
