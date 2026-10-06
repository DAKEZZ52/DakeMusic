/**
 * DakeMusic PK倒计时进度条
 * 作者：知之Dake
 * 文件：PkTimer.js
 * 描述：PK剩余时间、红蓝双方进度占比条
 */
(function () {
  const { defineComponent, computed } = Vue;

  const PkTimer = defineComponent({
    name: 'PkTimer',
    props: {
      remain: { type: Number, default: 0 },
      total: { type: Number, default: 300 },
    },
    computed: {
      timeText() {
        const s = Math.max(0, this.remain);
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
      },
      pct() {
        if (!this.total) return 0;
        return Math.max(0, Math.min(100, (this.remain / this.total) * 100));
      },
    },
    template: `
      <div class="absolute left-1/2 -translate-x-1/2 bottom-20 sm:bottom-16 z-10 w-56 sm:w-72">
        <div class="text-center text-sm font-bold mb-1 tracking-wider"
             style="text-shadow:0 0 8px rgba(168,85,247,.8)">
          {{ timeText }}
        </div>
        <div class="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-1000"
               style="width:100%; background:linear-gradient(90deg,#3b82f6 0%,#a855f7 50%,#ec4899 100%)"></div>
        </div>
      </div>
    `,
  });

  window.PkTimer = PkTimer;
})();
