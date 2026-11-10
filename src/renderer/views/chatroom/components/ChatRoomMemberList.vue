<script setup lang="ts">
/**
 * ChatRoomMemberList — 语聊房左侧成员列表
 * 显示房间在线成员，带头像、角色徽章（房主/管理员/超管/我/禁言）。
 * 点击成员看资料卡，右键呼出管理菜单。
 */
interface ChatRoomMember {
  identity: string;
  name: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isLocal?: boolean;
  isRootSuper?: boolean;
  isSuperAdmin?: boolean;
}

defineProps<{
  members: ChatRoomMember[];
  isBanned: (identity: string) => boolean;
  memberAvatar: (identity: string) => string;
}>();

const emit = defineEmits<{
  (e: 'click-member', identity: string): void;
  (e: 'context-menu', ev: MouseEvent, member: ChatRoomMember): void;
}>();
</script>

<template>
  <div class="cr-member-head">
    <span>成员</span>
    <span class="cr-member-tip">{{ members.length }} 人在线</span>
  </div>
  <div class="cr-member-list">
    <div
      v-for="member in members"
      :key="member.identity"
      class="cr-member"
      :class="{
        'is-banned': isBanned(member.identity),
        'is-owner': member.isOwner,
        'is-admin': member.isAdmin,
        'is-local': member.isLocal,
      }"
      @click.stop="emit('click-member', member.identity)"
      @contextmenu="emit('context-menu', $event, member)"
    >
      <div class="cr-avatar-wrap">
        <div
          class="cr-avatar"
          :class="{
            'role-owner': member.isOwner,
            'is-banned': isBanned(member.identity),
          }"
        >
          <img v-if="memberAvatar(member.identity)" :src="memberAvatar(member.identity)" />
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
          </svg>
        </div>
      </div>
      <div class="cr-member-info">
        <div class="cr-member-name">
          <span class="truncate">{{ member.name }}</span>
          <span
            v-if="member.isRootSuper"
            class="cr-badge rootsuper-icon"
            role="img"
            aria-label="根超管"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
            </svg>
          </span>
          <span
            v-else-if="member.isSuperAdmin"
            class="cr-badge super-icon"
            role="img"
            aria-label="超级管理员"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
            </svg>
          </span>
          <span v-if="member.isOwner" class="cr-badge owner"><i>房主</i></span>
          <span v-if="member.isAdmin" class="cr-badge admin-icon" role="img" aria-label="管理员">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
              <path d="M9 11.5l2 2 4-4" />
            </svg>
          </span>
          <span v-if="member.isLocal" class="cr-badge me"><i>我</i></span>
          <span v-if="isBanned(member.identity)" class="cr-badge ban"><i>禁言</i></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 成员列表头部 */
.cr-member-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.6;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.cr-member-tip {
  font-size: 9px;
  opacity: 0.55;
  font-weight: 400;
}
.cr-member-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.cr-member-list::-webkit-scrollbar {
  width: 5px;
}
.cr-member-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 999px;
}
.cr-member-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.26);
}
.cr-member-list::-webkit-scrollbar-track {
  background: transparent;
}

/* 成员行 */
.cr-member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.16s;
}
.cr-member:hover {
  background: rgba(255, 255, 255, 0.075);
}

/* 头像 */
.cr-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}
.cr-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 700;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.14),
    0 0 0 1.5px rgba(138, 92, 255, 0.4),
    0 0 10px rgba(138, 92, 255, 0.28);
  transition: box-shadow 0.2s;
}
.cr-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 成员信息 */
.cr-member-info {
  flex: 1;
  min-width: 0;
}
.cr-member-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.cr-member-name .truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 角色徽章：房主金 / 管理员蓝 / 自己灰 / 禁言红 */
.cr-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 6px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}
.cr-badge i {
  font-style: normal;
  font-size: 8px;
}
.cr-badge.owner {
  color: #ffd479;
  background: linear-gradient(135deg, rgba(255, 193, 84, 0.22), rgba(255, 140, 60, 0.16));
  box-shadow:
    inset 0 0 0 1px rgba(255, 193, 84, 0.5),
    0 0 8px rgba(255, 193, 84, 0.28);
}
.cr-badge.admin-icon {
  padding: 2px;
  color: #7cc4ff;
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.22), rgba(60, 120, 255, 0.16));
  box-shadow:
    inset 0 0 0 1px rgba(120, 180, 255, 0.5),
    0 0 8px rgba(88, 166, 255, 0.26);
}
.cr-badge.admin-icon svg {
  width: 11px;
  height: 11px;
}
.cr-badge.super-icon {
  padding: 2px;
  color: #c4b5fd;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(99, 102, 241, 0.16));
  box-shadow:
    inset 0 0 0 1px rgba(168, 85, 247, 0.5),
    0 0 8px rgba(168, 85, 247, 0.3);
}
.cr-badge.super-icon svg {
  width: 11px;
  height: 11px;
}
.cr-badge.rootsuper-icon {
  padding: 2px;
  color: #fbbf24;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.28), rgba(245, 158, 11, 0.2));
  box-shadow:
    inset 0 0 0 1px rgba(251, 191, 36, 0.6),
    0 0 10px rgba(251, 191, 36, 0.45);
}
.cr-badge.rootsuper-icon svg {
  width: 11px;
  height: 11px;
}
.cr-badge.me {
  color: #c9c9dc;
  background: rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}
.cr-badge.ban {
  color: #ff8fa3;
  background: linear-gradient(135deg, rgba(255, 77, 109, 0.24), rgba(255, 60, 90, 0.16));
  box-shadow:
    inset 0 0 0 1px rgba(255, 77, 109, 0.55),
    0 0 8px rgba(255, 77, 109, 0.3);
  animation: cr-ban-blink 1.8s ease-in-out infinite;
}
@keyframes cr-ban-blink {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 77, 109, 0.45),
      0 0 6px rgba(255, 77, 109, 0.22);
  }
  50% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 77, 109, 0.85),
      0 0 12px rgba(255, 77, 109, 0.5);
  }
}

/* 成员行状态：禁言红 / 发言绿 / 房主金 / 管理员蓝 */
.cr-member.is-banned {
  background: rgba(255, 77, 109, 0.09);
  box-shadow: inset 2px 0 0 rgba(255, 77, 109, 0.75);
}
.cr-member.is-banned .cr-member-name .truncate {
  color: #ff8fa3;
}
.cr-member.is-owner {
  box-shadow: inset 2px 0 0 rgba(255, 193, 84, 0.45);
}
.cr-member.is-admin {
  box-shadow: inset 2px 0 0 rgba(120, 180, 255, 0.4);
}

/* 头像光环按角色变色 */
.cr-avatar.role-owner {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    0 0 0 1.5px rgba(255, 193, 84, 0.7),
    0 0 12px rgba(255, 193, 84, 0.4);
}
.cr-avatar.is-banned {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 0 0 1.5px rgba(255, 77, 109, 0.65),
    0 0 12px rgba(255, 77, 109, 0.32);
}
.cr-avatar.is-banned img {
  opacity: 0.55;
  filter: grayscale(0.55);
}
</style>
