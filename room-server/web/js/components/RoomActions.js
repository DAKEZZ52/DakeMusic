// DakeMusic 网页版房主操作组件 / 作者：知之Dake / 文件：RoomActions.js / 描述：房主踢人、禁言功能
window.RoomActionsComponent = {
  props: ['member', 'isMe', 'isRoomOwner'],
  emits: ['kick', 'ban'],
  template: `
    <div v-if="isRoomOwner && !isMe" class="flex gap-2 mt-4">
      <button @click="$emit('kick', member)" class="flex-1 py-2 bg-red-500/80 rounded-lg hover:bg-red-500 text-sm">
        🚪 移出房间
      </button>
      <button @click="$emit('ban', member)" class="flex-1 py-2 bg-yellow-500/80 rounded-lg hover:bg-yellow-500 text-sm">
        🤐 禁言
      </button>
    </div>
  `
};
