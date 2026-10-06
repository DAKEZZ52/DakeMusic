/**
 * DakeMusic PK房浮动公屏
 * 作者：知之Dake

 * 文件：ChatOverlay.js
 * 描述：左下角浮动半透明聊天消息，自动滚动，自适应深浅字
 */
(function () {
  const { defineComponent, ref, watch, nextTick } = Vue;

  const ChatOverlay = defineComponent({
    name: 'ChatOverlay',
    props: {
      messages: { type: Array, default: () => [] },
    },
    setup(props) {
      const box = ref(null);
      watch(() => props.messages.length, async () => {
        await nextTick();
        if (box.value) box.value.scrollTop = box.value.scrollHeight;
      });
      return { box };
    },
    template: `
      <div ref="box"
           class="absolute left-3 bottom-28 sm:bottom-24 z-10 w-[62%] max-w-sm h-32 overflow-y-auto no-scrollbar flex flex-col justify-end gap-1 pr-1">
        <div v-for="(m, i) in messages" :key="i"
             :class="['text-xs leading-snug rounded-lg px-2 py-0.5 inline-block w-fit max-w-full',
                      m.type === 'system' ? 'text-yellow-200/90 bg-black/25' : 'text-white/90 bg-black/30 backdrop-blur-sm']">
          <template v-if="m.type !== 'system'">
            <span class="font-bold text-cyan-300">{{ m.name }}：</span>{{ m.content }}
          </template>
          <template v-else>{{ m.content }}</template>
        </div>
      </div>
    `,
  });

  window.ChatOverlay = ChatOverlay;
})();
