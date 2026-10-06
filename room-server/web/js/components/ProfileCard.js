// DakeMusic 网页版资料卡组件 / 作者：知之Dake / 文件：ProfileCard.js / 描述：成员资料卡弹窗，显示头像、年龄、性别、城市、签名
window.ProfileCardComponent = {
  components: {
    'room-actions': window.RoomActionsComponent
  },
  props: ['user', 'visible', 'isMe', 'isRoomOwner'],
  emits: ['close', 'kick', 'ban'],
  template: `
    <div v-if="visible" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click="$emit('close')">
      <div class="w-full max-w-sm bg-gray-900 rounded-2xl p-6" @click.stop>
        <!-- 头像 -->
        <div class="text-center mb-4">
          <div class="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-3xl overflow-hidden mb-3">
            <img v-if="user.avatar" :src="user.avatar" class="w-full h-full object-cover" />
            <span v-else>{{ user.nickname?.[0] }}</span>
          </div>
          <h3 class="text-xl font-bold">{{ user.nickname }}</h3>
          <p class="text-sm opacity-60">@{{ user.name }}</p>
        </div>
        <!-- 资料标签 -->
        <div class="flex flex-wrap items-center justify-center gap-2 mb-4">
          <span v-if="user.age" :class="['px-2 py-0.5 rounded-full text-xs font-bold', user.gender === '女' ? 'bg-pink-500/30 text-pink-300' : 'bg-blue-500/30 text-blue-300']">
            {{ user.age }} {{ user.gender === '女' ? '♀' : '♂' }}
          </span>
          <span v-if="user.city" class="px-2 py-0.5 bg-gray-700/50 text-xs opacity-80 flex items-center gap-1">
            📍 {{ user.city }}
          </span>
        </div>
        <!-- 签名 -->
        <p v-if="user.bio" class="text-center text-sm opacity-70 mb-4">{{ user.bio }}</p>
        <!-- DakeMusic: 房主操作按钮 -->
        <room-actions :member="user" :is-me="isMe" :is-room-owner="isRoomOwner" @kick="$emit('kick', user)" @ban="$emit('ban', user)"></room-actions>
        <button @click="$emit('close')" class="w-full py-2 bg-white/10 rounded-lg hover:bg-white/20 mt-4">关闭</button>
      </div>
    </div>
  `
};
