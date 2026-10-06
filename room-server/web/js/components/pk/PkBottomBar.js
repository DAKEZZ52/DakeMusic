/**
 * DakeMusic PK房底部控制栏
 * 作者：知之Dake
 * 文件：PkBottomBar.js
 * 描述：聊天输入框、礼物入口、麦克风/扬声器设备选择与开关，弹出菜单半透明毛玻璃
 */
(function () {
  const { defineComponent, ref } = Vue;

  const PkBottomBar = defineComponent({
    name: 'PkBottomBar',
    props: {
      chat: { type: String, default: '' },
      micOn: { type: Boolean, default: false },
      micDevices: { type: Array, default: () => [] },
      speakerDevices: { type: Array, default: () => [] },
      selectedMic: { type: String, default: '' },
      selectedSpeaker: { type: String, default: '' },
    },
    emits: ['update:chat', 'send', 'toggle-mic', 'select-mic', 'select-speaker', 'gift'],
    setup(props, { emit }) {
      const showMicMenu = ref(false);
      const showSpeakerMenu = ref(false);
      function send() {
        emit('send');
      }
      return { showMicMenu, showSpeakerMenu, send, emit };
    },
    template: `
      <div class="absolute bottom-0 left-0 right-0 z-20 px-3 pb-3 pt-2 bg-gradient-to-t from-black/60 to-transparent">
        <div class="flex items-center gap-2">
          <!-- 输入框 -->
          <div class="flex-1 flex items-center bg-black/40 backdrop-blur rounded-full pl-3 pr-1 py-1 border border-white/10">
            <input :value="chat" @input="emit('update:chat', $event.target.value)"
                   @keyup.enter="send"
                   placeholder="说点什么..."
                   class="flex-1 bg-transparent text-sm outline-none placeholder-white/50 min-w-0" />
            <button @click="send"
                    class="shrink-0 w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <!-- 礼物盒 -->
          <button @click="emit('gift')"
                  class="shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/40">
            <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
          </button>

          <!-- 麦克风设备选择 -->
          <div class="relative shrink-0">
            <button @click.stop="showMicMenu = !showMicMenu; showSpeakerMenu = false"
                    class="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center border border-white/10">
              <svg class="w-5 h-5 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
            </button>
            <div v-if="showMicMenu"
                 class="absolute bottom-full mb-2 right-0 w-52 bg-black/70 backdrop-blur-xl rounded-xl p-2 border border-white/15 shadow-2xl">
              <p class="text-[11px] opacity-60 text-center py-1">选择麦克风</p>
              <div class="max-h-44 overflow-y-auto space-y-0.5 no-scrollbar">
                <button v-for="dev in micDevices" :key="dev.deviceId"
                        @click.stop="emit('select-mic', dev.deviceId); showMicMenu = false"
                        :class="['w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate',
                                 selectedMic === dev.deviceId ? 'bg-green-500/30 text-white' : 'hover:bg-white/10 text-white/80']">
                  {{ dev.label || '麦克风设备' }}
                </button>
                <p v-if="micDevices.length === 0" class="text-[11px] opacity-50 text-center py-2">未检测到设备</p>
              </div>
            </div>
          </div>

          <!-- 开关麦克风主按钮 -->
          <button @click="emit('toggle-mic')"
                  :class="['shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all',
                           micOn ? 'bg-green-500 shadow-green-500/50' : 'bg-rose-500/90 shadow-rose-500/40']">
            <svg v-if="micOn" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            </svg>
          </button>

          <!-- 扬声器设备选择 -->
          <div class="relative shrink-0">
            <button @click.stop="showSpeakerMenu = !showSpeakerMenu; showMicMenu = false"
                    class="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center border border-white/10">
              <svg class="w-5 h-5 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <div v-if="showSpeakerMenu"
                 class="absolute bottom-full mb-2 right-0 w-52 bg-black/70 backdrop-blur-xl rounded-xl p-2 border border-white/15 shadow-2xl">
              <p class="text-[11px] opacity-60 text-center py-1">选择扬声器</p>
              <div class="max-h-44 overflow-y-auto space-y-0.5 no-scrollbar">
                <button v-for="dev in speakerDevices" :key="dev.deviceId"
                        @click.stop="emit('select-speaker', dev.deviceId); showSpeakerMenu = false"
                        :class="['w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate',
                                 selectedSpeaker === dev.deviceId ? 'bg-blue-500/30 text-white' : 'hover:bg-white/10 text-white/80']">
                  {{ dev.label || '扬声器设备' }}
                </button>
                <p v-if="speakerDevices.length === 0" class="text-[11px] opacity-50 text-center py-2">未检测到设备</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  });

  window.PkBottomBar = PkBottomBar;
})();
