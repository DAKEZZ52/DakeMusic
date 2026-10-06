/**
 * DakeMusic PK房观众头像条
 * 作者：知之Dake
 * 文件：AudienceStrip.js
 * 描述：顶部横向排列观众小头像，超出显示 +N
 */
(function () {
  const { defineComponent } = Vue;

  const AudienceStrip = defineComponent({
    name: 'AudienceStrip',
    props: {
      audience: { type: Array, default: () => [] },
      participantCount: { type: Number, default: 0 },
    },
    computed: {
      shown() { return this.audience.slice(0, 6); },
      more() { return Math.max(0, this.audience.length - 6); },
    },
    template: `
      <div class="relative z-20 flex items-center gap-2 px-3 mt-2.5">
        <div class="flex items-center -space-x-2">
          <div v-for="(m, i) in shown" :key="m.identity || i"
               class="w-8 h-8 rounded-full overflow-hidden border-2 border-indigo-950 bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
            <img v-if="m.avatar" :src="m.avatar" class="w-full h-full object-cover" />
            <span v-else class="text-[10px] font-bold">{{ (m.name || '?')[0] }}</span>
          </div>
          <!-- 空位占位 -->
          <div v-if="shown.length === 0"
               class="w-8 h-8 rounded-full border-2 border-dashed border-white/25 opacity-40"></div>
        </div>
        <span v-if="more > 0" class="text-xs text-white/70 bg-black/40 rounded-full px-2 py-0.5">+{{ more }}</span>
      </div>
    `,
  });

  window.AudienceStrip = AudienceStrip;
})();
