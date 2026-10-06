// DakeMusic 网页版成员列表组件 / 作者：知之Dake / 文件：MemberList.js / 描述：房间在线成员列表，点击查看资料
window.MemberListComponent = {
  props: ['members'],
  emits: ['view-profile'],
  template: `
    <div class="mb-4">
      <h3 class="text-sm font-bold mb-2 opacity-70">👥 成员 ({{ members.length }})</h3>
      <div class="space-y-1 max-h-40 overflow-y-auto">
        <div v-for="m in members" :key="m.identity" 
             class="flex items-center gap-2 p-1 rounded hover:bg-white/10 cursor-pointer"
             @click="$emit('view-profile', m)">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs">
            {{ m.name[0] }}
          </div>
          <span class="text-sm truncate">{{ m.name }}</span>
          <span v-if="m.isSpeaking" class="w-2 h-2 bg-green-400 rounded-full"></span>
        </div>
      </div>
    </div>
  `
};
