<script setup lang="ts">
/**
 * ChatRoomBackground — 语聊房背景层
 * 有自定义背景图时显示图片+遮罩，否则显示内置 CSS 星空极光。
 * 纯展示组件，只读取 settingStore。
 */
import { useSettingStore } from '@/stores/setting';

const settingStore = useSettingStore();
</script>

<template>
  <!-- 自定义背景图 -->
  <div
    v-if="settingStore.chatroomBackgroundImage"
    class="cr-custom-bg"
    :style="{ backgroundImage: `url(${settingStore.chatroomBackgroundImage})` }"
  >
    <div
      class="cr-custom-bg-overlay"
      :style="{ opacity: settingStore.chatroomBackgroundOverlay / 100 }"
    ></div>
  </div>
  <!-- 内置星空极光背景（纯 CSS） -->
  <div v-else class="cr-aurora">
    <div class="cr-stars cr-stars-1"></div>
    <div class="cr-stars cr-stars-2"></div>
    <div class="cr-aurora-band b1"></div>
    <div class="cr-aurora-band b2"></div>
  </div>
</template>

<style scoped>
.cr-custom-bg {
  position: absolute;
  inset: 0;
  background-image: url('');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}
.cr-custom-bg-overlay {
  position: absolute;
  inset: 0;
  background: #000;
}
/* 内置星空极光背景 */
.cr-aurora {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.cr-stars {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
}
.cr-stars-1 {
  background-image:
    radial-gradient(1px 1px at 20px 30px, #ffffff, transparent),
    radial-gradient(1px 1px at 80px 120px, #cfe8ff, transparent),
    radial-gradient(1.6px 1.6px at 160px 70px, #ffffff, transparent),
    radial-gradient(1px 1px at 240px 200px, #e6d6ff, transparent),
    radial-gradient(1px 1px at 320px 40px, #ffffff, transparent),
    radial-gradient(1.2px 1.2px at 120px 230px, #bfe0ff, transparent);
  background-size: 360px 260px;
  animation: cr-twinkle 4.5s ease-in-out infinite;
}
.cr-stars-2 {
  background-image:
    radial-gradient(1px 1px at 60px 90px, #ffffff, transparent),
    radial-gradient(1.6px 1.6px at 200px 160px, #bfe0ff, transparent),
    radial-gradient(1px 1px at 300px 120px, #ffffff, transparent),
    radial-gradient(1px 1px at 40px 200px, #f0e6ff, transparent);
  background-size: 420px 320px;
  animation: cr-twinkle 7s ease-in-out infinite 1.5s;
}
@keyframes cr-twinkle {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
.cr-aurora-band {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
}
.cr-aurora-band.b1 {
  width: 170%;
  height: 58%;
  top: -18%;
  left: -35%;
  transform: rotate(-18deg);
  background: linear-gradient(
    100deg,
    transparent 8%,
    rgba(0, 205, 255, 0.34) 34%,
    rgba(124, 92, 255, 0.42) 60%,
    transparent 88%
  );
  animation: cr-aurora-breath 13s ease-in-out infinite;
}
.cr-aurora-band.b2 {
  width: 130%;
  height: 46%;
  bottom: -22%;
  right: -22%;
  transform: rotate(15deg);
  background: linear-gradient(
    80deg,
    transparent 14%,
    rgba(255, 96, 178, 0.2) 44%,
    rgba(86, 140, 255, 0.3) 70%,
    transparent 92%
  );
  animation: cr-aurora-breath 17s ease-in-out infinite reverse;
}
@keyframes cr-aurora-breath {
  0%,
  100% {
    opacity: 0.42;
  }
  50% {
    opacity: 0.72;
  }
}
</style>
