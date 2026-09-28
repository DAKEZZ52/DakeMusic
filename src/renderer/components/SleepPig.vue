<template>
  <Teleport to="body">
    <Transition name="pig-fade">
    <div
      v-if="showPig"
      class="sleep-pig"
      :class="{ awake: state !== 'sleep' }"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      @click.stop="pigClick"
    >
      <span class="pig-emoji">{{ state === 'sleep' ? '🐷' : '🐽' }}</span>
      <div v-if="state === 'sleep'" class="zzz">z</div>
    </div>
  </Transition>

  <!-- 彩带 -->
  <div v-if="showConfetti" class="confetti-layer">
    <div
      v-for="(item, index) in confettiList"
      :key="'c' + index"
      class="confetti-piece"
      :style="{
        left: item.x + 'vw',
        backgroundColor: item.color,
        animationDelay: item.delay + 's',
        animationDuration: item.duration + 's',
        width: item.size + 'px',
        height: item.size + 'px',
      }"
    ></div>
  </div>

  <!-- 弹幕文字 -->
  <div v-if="showBarrage" class="barrage-layer">
    <div class="barrage-line line1" :style="{ color: barrageColors[0] }">咻咻咻~~~duangduang</div>
    <div class="barrage-line line2" :style="{ color: barrageColors[1] }">
      感谢带带珍猪贡献启动声音！
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';

type PigState = 'sleep' | 'run' | 'done';

const route = useRoute();
const showPig = ref(false);
const state = ref<PigState>('sleep');
const hitCount = ref(0);
const pos = ref({ x: 0, y: 0 });
const showConfetti = ref(false);
const showBarrage = ref(false);
const confettiList = ref<
  Array<{ x: number; color: string; delay: number; duration: number; size: number }>
>([]);
const barrageColors = ref(['#ff4d6d', '#ffd166']);

const CONFETTI_COLORS = [
  '#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#ff9ff3', '#f72585',
  '#ffbe0b', '#a0e9ff', '#c780fa', '#00f5d4', '#fee440', '#f15bb5',
] as const;

const pickColor = () => CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

// 按 data 属性找锚点元素（最稳定），兜底按文本找

// 定位到锚点元素右侧
const updatePosition = () => {
  // 定位到"风格推荐"文字右边
  const titleEl = document.querySelector('.style-recommend-section .section-title');
  if (!titleEl) {
    showPig.value = false;
    return;
  }
  const rects = titleEl.getClientRects();
  const rect = rects.length > 0 ? rects[0] : titleEl.getBoundingClientRect();
  pos.value = {
    x: Math.round(rect.right + 6),
    y: Math.round(rect.top + rect.height / 2 - 9),
  };
};

const resetSleepPig = () => {
  state.value = 'sleep';
  hitCount.value = 0;
  updatePosition();
};

function shakeScreen() {
  document.body.classList.add('egg-shake');
  window.setTimeout(() => {
    document.body.classList.remove('egg-shake');
  }, 2500);
}

function startConfetti() {
  // for 循环 → Array.from，更声明式
  confettiList.value = Array.from({ length: 350 }, () => ({
    x: Math.random() * 100,
    color: pickColor(),
    delay: Math.random() * 2,
    duration: 6 + Math.random() * 4,
    size: 5 + Math.random() * 7,
  }));
  showConfetti.value = true;
  window.setTimeout(() => {
    showConfetti.value = false;
  }, 60000);
}

function startBarrage() {
  barrageColors.value = [pickColor(), pickColor()];
  showBarrage.value = true;
  window.setTimeout(() => {
    showBarrage.value = false;
  }, 6000);
}

function pigClick() {
  if (state.value === 'sleep') {
    state.value = 'run';
    hitCount.value = 1;
    return;
  }
  if (state.value === 'run') {
    hitCount.value += 1;
    if (hitCount.value >= 3) {
      state.value = 'done';
      showPig.value = false;
      shakeScreen();
      startConfetti();
      nextTick(() => {
        startBarrage();
      });
      window.setTimeout(() => {
        resetSleepPig();
        showPig.value = true;
      }, 60000);
    }
  }
}

let showTimer: number | null = null;
let mounted = false;

const scheduleShow = () => {
  if (showTimer !== null) window.clearTimeout(showTimer);
  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (state.value === 'sleep') {
      updatePosition();
      showPig.value = true;
    }
  }, 1500);
};

watch(
  () => route.path,
  (path) => {
    if (showTimer !== null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    const isHome = path === '/main/home' || path === '/home' || path === '/';
    if (isHome) {
      scheduleShow();
    } else {
      showPig.value = false;
    }
  },
  { immediate: true },
);

onMounted(() => {
  mounted = true;
  window.addEventListener('resize', updatePosition);
  // 多次重试定位，等 DOM 完全稳定
  updatePosition();
  window.setTimeout(updatePosition, 300);
  window.setTimeout(updatePosition, 800);
});

onUnmounted(() => {
  mounted = false;
  document.body.classList.remove('egg-shake');
  window.removeEventListener('resize', updatePosition);
  if (showTimer !== null) {
    window.clearTimeout(showTimer);
  }
});
</script>

<style scoped>
/* 小猪：更小、更透明，贴着"由此开启好心情~"右侧 */
.sleep-pig {
  position: fixed;
  z-index: 9998;
  width: 30px;
  height: 17px;
  cursor: pointer;
  user-select: none;
  opacity: 0.1;
  transition: opacity 0.2s, transform 0.3s ease;
  pointer-events: auto;
}

.sleep-pig:hover {
  opacity: 0.7;
}

.sleep-pig.awake {
  opacity: 0.35;
}

/* 动作1：刚醒 */
.sleep-pig.hit-1 {
  transform: translateY(-3px) scale(1.05);
}
.sleep-pig.hit-1 .pig-head-side {
  transform: rotate(-10deg) translateY(-2px);
}

/* 动作2：学你 */
.sleep-pig.hit-2 {
  transform: translateY(-5px) rotate(-12deg) scale(1.15);
  opacity: 0.6;
}
.sleep-pig.hit-2 .pig-ear-side {
  transform: rotate(-40deg) scale(1.2);
  top: -5px;
}
.sleep-pig.hit-2 .pig-eye-side {
  width: 5px;
  height: 5px;
}

.pig-fade-enter-active,
.pig-fade-leave-active {
  transition: opacity 0.4s ease;
}
.pig-fade-enter-from,
.pig-fade-leave-to {
  opacity: 0;
}

.pig-side {
  position: relative;
  width: 30px;
  height: 17px;
  transition: transform 0.3s ease;
}
.pig-body-side {
  position: absolute;
  right: 0;
  bottom: 2px;
  width: 23px;
  height: 12px;
  background: #555;
  border-radius: 50% 60% 55% 50%;
  transition: transform 0.3s ease;
}
.pig-head-side {
  position: absolute;
  left: -2px;
  top: 2px;
  width: 12px;
  height: 10px;
  background: #555;
  border-radius: 50% 40% 45% 55%;
  transition: transform 0.3s ease;
}
.pig-ear-side {
  position: absolute;
  top: -3px;
  left: 3px;
  width: 6px;
  height: 7px;
  background: #444;
  border-radius: 50%;
  transform: rotate(-15deg);
  transition: transform 0.3s ease, top 0.3s ease;
}
.pig-eye-side {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 3px;
  height: 3px;
  background: #ccc;
  border-radius: 50%;
  transition: width 0.2s, height 0.2s;
}
.pig-eye-side.closed {
  width: 4px;
  height: 1.5px;
  margin-top: 1px;
  background: #aaa;
  border-radius: 1px;
}
.pig-snout-side {
  position: absolute;
  left: 0;
  top: 6px;
  width: 3px;
  height: 3px;
  background: #444;
  border-radius: 50%;
}
.pig-leg-side {
  position: absolute;
  bottom: -1px;
  width: 4px;
  height: 4px;
  background: #444;
  border-radius: 50%;
}
.pig-leg-side.front1 { left: 7px; }
.pig-leg-side.front2 { left: 12px; }
.pig-leg-side.back1 { right: 6px; }
.pig-leg-side.back2 { right: 3px; }
.pig-tail-side {
  position: absolute;
  right: -1px;
  top: 5px;
  width: 5px;
  height: 5px;
  border: 1.5px solid #444;
  border-top: none;
  border-left: none;
  border-radius: 0 0 50% 0;
  transform: rotate(20deg);
}
.zzz {
  position: absolute;
  top: -8px;
  right: 2px;
  color: #999;
  font-size: 9px;
  opacity: 0.5;
  animation: zzzAnim 3s infinite ease-in-out;
}
@keyframes zzzAnim {
  0% { opacity: 0.1; transform: translateY(0px); }
  50% { opacity: 0.5; transform: translateY(-3px); }
  100% { opacity: 0.1; transform: translateY(-6px); }
}

/* 彩带 */
.confetti-layer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}
.confetti-piece {
  position: absolute;
  top: -20px;
  border-radius: 2px;
  animation-name: confetti-fall;
  animation-timing-function: linear;
  animation-iteration-count: 1;
}
@keyframes confetti-fall {
  0% { transform: translateY(0) rotate(0deg); }
  100% { transform: translateY(110vh) rotate(720deg); }
}

/* 弹幕文字 */
.barrage-layer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
}
.barrage-line {
  white-space: nowrap;
  font-size: 42px;
  font-weight: 900;
  text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.6), 0 0 20px currentColor;
  animation: barrage-slide 8s linear forwards;
  opacity: 0;
}
.barrage-line.line1 { animation-delay: 0.2s; }
.barrage-line.line2 { animation-delay: 0.6s; font-size: 32px; }
@keyframes barrage-slide {
  0% { transform: translateX(110vw); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateX(-120vw); opacity: 0; }
}
</style>

<style>
.egg-shake {
  animation: egg-shake-anim 0.18s ease-in-out 14;
}
@keyframes egg-shake-anim {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-5px, 3px); }
  40% { transform: translate(5px, -3px); }
  60% { transform: translate(-3px, -4px); }
  80% { transform: translate(4px, 2px); }
}
</style>