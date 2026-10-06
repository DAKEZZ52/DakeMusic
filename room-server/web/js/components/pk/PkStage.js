/**
 * DakeMusic PK主舞台
 * 作者：知之Dake
 * 文件：PkStage.js
 * 描述：1v1 PK双方大圆形头像、VS标志、说话光环、昵称票数、空位上麦
 */
(function () {
  const { defineComponent, computed } = Vue;

  const PkStage = defineComponent({
    name: 'PkStage',
    props: {
      blue: { type: Object, default: () => null },
      red: { type: Object, default: () => null },
      mySide: { type: String, default: '' }, // 'blue' | 'red' | ''
      blueScore: { type: Number, default: 0 },
      redScore: { type: Number, default: 0 },
    },
    emits: ['click-side', 'view-profile'],
    setup(props, { emit }) {
      const blueT = computed(() => ({
        occupied: !!props.blue,
        person: props.blue,
        score: props.blueScore,
        ring: 'border-blue-400',
        glow: 'shadow-blue-500/50',
        isMeHere: props.mySide === 'blue',
      }));
      const redT = computed(() => ({
        occupied: !!props.red,
        person: props.red,
        score: props.redScore,
        ring: 'border-pink-400',
        glow: 'shadow-pink-500/50',
        isMeHere: props.mySide === 'red',
      }));
      return { blueT, redT, emit };
    },
    template: `
      <div class="absolute inset-0 z-10 flex items-center justify-center px-4 -mt-6">
        <div class="flex items-center justify-center gap-3 sm:gap-8 w-full max-w-2xl">

          <!-- 蓝方 -->
          <div class="flex flex-col items-center flex-1">
            <div class="relative cursor-pointer" @click="blueT.occupied ? emit('view-profile', blueT.person) : emit('click-side', 'blue')">
              <!-- 说话光环 -->
              <div v-if="blueT.occupied && blueT.person.isSpeaking"
                   class="absolute inset-0 rounded-full ring-4 ring-green-400 animate-ping opacity-60"></div>
              <!-- 我的位置标记 -->
              <div v-if="blueT.isMeHere" class="absolute -inset-1.5 rounded-full ring-2 ring-white/80"></div>

              <!-- 有人头像 -->
              <div v-if="blueT.occupied"
                   :class="['w-28 h-28 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl', blueT.ring, blueT.glow]">
                <img v-if="blueT.person.avatar" :src="blueT.person.avatar" class="w-full h-full object-cover" />
                <span v-else class="text-3xl sm:text-5xl font-bold">{{ (blueT.person.name || '?')[0] }}</span>
              </div>
              <!-- 空位 -->
              <div v-else
                   class="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-dashed border-blue-400/50 bg-blue-950/30 flex flex-col items-center justify-center gap-1 hover:bg-blue-900/40 transition-colors">
                <svg class="w-8 h-8 text-blue-300/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                <span class="text-[10px] text-blue-200/70">点击上麦</span>
              </div>
            </div>
            <!-- 昵称 -->
            <p class="mt-2 text-sm font-bold truncate max-w-full flex items-center gap-1">
              {{ blueT.occupied ? blueT.person.name : '虚位以待' }}
            </p>
            <!-- 票数 -->
            <p class="text-xs text-blue-300 flex items-center gap-1">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              {{ blueT.score }} 埋
            </p>
          </div>

          <!-- VS 标志 -->
          <div class="shrink-0 relative">
            <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-black text-lg sm:text-2xl italic"
                 style="background:linear-gradient(135deg,#3b82f6 0%,#3b82f6 48%,#ec4899 52%,#ec4899 100%); box-shadow:0 0 24px rgba(168,85,247,.6)">
              VS
            </div>
          </div>

          <!-- 红方 -->
          <div class="flex flex-col items-center flex-1">
            <div class="relative cursor-pointer" @click="redT.occupied ? emit('view-profile', redT.person) : emit('click-side', 'red')">
              <div v-if="redT.occupied && redT.person.isSpeaking"
                   class="absolute inset-0 rounded-full ring-4 ring-green-400 animate-ping opacity-60"></div>
              <div v-if="redT.isMeHere" class="absolute -inset-1.5 rounded-full ring-2 ring-white/80"></div>

              <div v-if="redT.occupied"
                   :class="['w-28 h-28 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-2xl', redT.ring, redT.glow]">
                <img v-if="redT.person.avatar" :src="redT.person.avatar" class="w-full h-full object-cover" />
                <span v-else class="text-3xl sm:text-5xl font-bold">{{ (redT.person.name || '?')[0] }}</span>
              </div>
              <div v-else
                   class="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-dashed border-pink-400/50 bg-pink-950/30 flex flex-col items-center justify-center gap-1 hover:bg-pink-900/40 transition-colors">
                <svg class="w-8 h-8 text-pink-300/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                <span class="text-[10px] text-pink-200/70">点击上麦</span>
              </div>
            </div>
            <p class="mt-2 text-sm font-bold truncate max-w-full">
              {{ redT.occupied ? redT.person.name : '虚位以待' }}
            </p>
            <p class="text-xs text-pink-300 flex items-center gap-1">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              {{ redT.score }} 埋
            </p>
          </div>

        </div>
      </div>
    `,
  });

  window.PkStage = PkStage;
})();
