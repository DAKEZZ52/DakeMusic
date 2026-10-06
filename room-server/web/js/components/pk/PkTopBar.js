/**
 * DakeMusic PK房顶部主播信息栏
 * 作者：知之Dake
 * 文件：PkTopBar.js
 * 描述：1v1 PK房顶部：关闭按钮、主播头像昵称、关注、在线人数、任务/特色/举报入口
 */
(function () {
  const { defineComponent, h, ref } = Vue;

  const PkTopBar = defineComponent({
    name: 'PkTopBar',
    props: {
      roomName: { type: String, default: '' },
      participantCount: { type: Number, default: 0 },
      host: { type: Object, default: () => ({}) },
    },
    emits: ['leave', 'report'],
    setup(props, { emit }) {
      const followed = ref(false);
      return { followed, emit };
    },
    template: `
      <div class="relative z-20 flex items-center gap-2 px-3 pt-3">
        <!-- 关闭按钮 -->
        <button @click="emit('leave')"
                class="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur hover:bg-black/60">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- 主播头像 -->
        <div class="w-10 h-10 shrink-0 rounded-full overflow-hidden border-2 border-yellow-400/70 bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
          <img v-if="host.avatar" :src="host.avatar" class="w-full h-full object-cover" />
          <span v-else class="text-sm font-bold">{{ (host.name || '房')[0] }}</span>
        </div>

        <!-- 昵称 / ID -->
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold leading-tight truncate flex items-center gap-1">
            {{ host.name || roomName }}
            <svg class="w-3.5 h-3.5 text-yellow-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
            </svg>
          </p>
          <p class="text-[10px] text-white/60 leading-tight">ID:{{ host.account || '----' }} · {{ participantCount }}人在线</p>
        </div>

        <!-- 关注按钮 -->
        <button @click="followed = !followed"
                :class="['shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all',
                         followed ? 'bg-white/15 text-white/70' : 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black']">
          {{ followed ? '已关注' : '+ 关注' }}
        </button>

        <!-- 星级任务 -->
        <button class="hidden sm:flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur text-[11px]">
          <svg class="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
          </svg>
          星级任务
        </button>

        <!-- 我的特色 -->
        <button class="hidden md:flex shrink-0 items-center px-2.5 py-1 rounded-full bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-[11px] font-bold">
          我的特色
        </button>

        <!-- 举报 -->
        <button @click="emit('report')"
                class="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `,
  });

  window.PkTopBar = PkTopBar;
})();
