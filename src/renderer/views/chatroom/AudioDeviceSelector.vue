<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { getLiveKitClient } from '@/utils/livekitClient';
import { useChatRoomStore } from '@/stores/chatRoom';

const store = useChatRoomStore();
const isSystemMuted = ref(false);

const mics = ref<MediaDeviceInfo[]>([]);
const speakers = ref<MediaDeviceInfo[]>([]);
const selectedMic = ref('');
const selectedSpeaker = ref('');
const loading = ref(false);

const client = getLiveKitClient();

const isMicEnabled = computed(() => store.isMicEnabled);

// 截断设备名
function shortLabel(label: string): string {
  if (!label) return '';
  const cleaned = label.replace(/\s*\([^)]*\)\s*$/g, '').replace(/\s*\([^)]*\)\s*$/g, '');
  return cleaned.length > 16 ? cleaned.slice(0, 16) + '…' : cleaned;
}

async function loadDevices() {
  loading.value = true;
  try {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    mics.value = devices.filter((d) => d.kind === 'audioinput');
    speakers.value = devices.filter((d) => d.kind === 'audiooutput');
    if (!selectedMic.value && mics.value.length) selectedMic.value = mics.value[0].deviceId;
    if (!selectedSpeaker.value && speakers.value.length) selectedSpeaker.value = speakers.value[0].deviceId;
  } catch (e) {
    console.error('[AudioDevice] 获取设备列表失败:', e);
  }
  loading.value = false;
}

async function applyMic(deviceId: string) {
  if (!deviceId) return;
  try {
    const room = (client as any).room;
    if (!room) return;
    const lp = room.localParticipant;
    const hasAudio = Array.from(lp.audioTrackPublications.values()).length > 0;
    if (hasAudio) await lp.setMicrophoneEnabled(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
    } catch (e) {
      console.error('[AudioDevice] 麦克风权限被拒，切换失败:', e);
      // 权限被拒时恢复之前的麦状态（如果之前开着）
      if (hasAudio && store.isMicEnabled) {
        try { await lp.setMicrophoneEnabled(true); } catch {}
      }
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (track) {
      const existing = lp.audioTrackPublications.values().next().value;
      if (existing) {
        await existing.setTrack(track);
      } else {
        await lp.publishTrack(track, { source: 'microphone' as any });
      }
      // 切换后保持当前麦状态
      if (store.isMicEnabled) {
        try { await lp.setMicrophoneEnabled(true); } catch {}
      } else {
        // 闭麦状态下新发布的 track 默认是 unmuted，必须强制闭麦，否则会泄露声音
        try { await lp.setMicrophoneEnabled(false); } catch {}
        // 兜底：直接禁用 track
        try { track.enabled = false; } catch {}
      }
    }
  } catch (e) {
    console.error('[AudioDevice] 切换麦克风失败:', e);
  }
}

function applySpeaker(deviceId: string) {
  if (!deviceId) return;
  const audioEls = document.querySelectorAll('audio');
  audioEls.forEach((el: any) => {
    if (el.setSinkId) el.setSinkId(deviceId).catch(() => {});
  });
}

function toggleMic() {
  store.toggleMute();
}

function toggleSystemMute() {
  isSystemMuted.value = !isSystemMuted.value;
  const audioEls = document.querySelectorAll('audio');
  audioEls.forEach((el: any) => { el.muted = isSystemMuted.value; });
}

watch(selectedMic, (id) => { if (id) applyMic(id); });
watch(selectedSpeaker, (id) => { if (id) applySpeaker(id); });

function onDeviceChange() { loadDevices(); }

onMounted(() => {
  loadDevices();
  navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
});

onUnmounted(() => {
  navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
});
</script>

<template>
  <div class="audio-device-selector flex items-center gap-2">
    <!-- 麦克风：开关图标 + 设备选择 -->
    <div class="flex items-center bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-full hover:border-[var(--color-primary)] transition-colors">
      <button
        class="w-8 h-8 flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--control-hover-bg)] rounded-l-full"
        :class="isMicEnabled ? 'text-[var(--color-primary)]' : 'text-red-500'"
        :title="isMicEnabled ? '闭麦' : '开麦'"
        @click.stop="toggleMic"
      >
        <svg v-if="isMicEnabled" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="2" x2="22" y2="22"/>
          <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
          <path d="M5 10v2a7 7 0 0 0 12 5"/>
          <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
      </button>
      <div class="relative">
        <select
          v-model="selectedMic"
          class="bg-[var(--color-bg)] text-[var(--color-text)] py-1.5 pr-7 pl-1 text-xs outline-none cursor-pointer appearance-none min-w-[110px] rounded-r-full"
          :disabled="loading"
          @click.stop
          @focus="!mics.length && loadDevices()"
        >
          <option value="" disabled class="bg-[var(--color-bg)] text-[var(--color-text)]">{{ loading ? '...' : '麦克风' }}</option>
          <option v-for="d in mics" :key="d.deviceId" :value="d.deviceId" :title="d.label" class="bg-[var(--color-bg)] text-[var(--color-text)]">
            {{ shortLabel(d.label) || `麦克风 ${mics.indexOf(d) + 1}` }}
          </option>
        </select>
        <svg class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-main/40" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
    <!-- 扬声器：开关图标 + 设备选择 -->
    <div class="flex items-center bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-full hover:border-[var(--color-primary)] transition-colors">
      <button
        class="w-8 h-8 flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--control-hover-bg)] rounded-l-full"
        :class="!isSystemMuted ? 'text-[var(--color-primary)]' : 'text-red-500'"
        :title="isSystemMuted ? '取消静音' : '系统静音'"
        @click.stop="toggleSystemMute"
      >
        <svg v-if="!isSystemMuted" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      </button>
      <div class="relative">
        <select
          v-model="selectedSpeaker"
          class="bg-[var(--color-bg)] text-[var(--color-text)] py-1.5 pr-7 pl-1 text-xs outline-none cursor-pointer appearance-none min-w-[110px] rounded-r-full"
          :disabled="loading"
          @click.stop
          @focus="!speakers.length && loadDevices()"
        >
          <option value="" disabled class="bg-[var(--color-bg)] text-[var(--color-text)]">{{ loading ? '...' : '系统' }}</option>
          <option v-for="d in speakers" :key="d.deviceId" :value="d.deviceId" :title="d.label" class="bg-[var(--color-bg)] text-[var(--color-text)]">
            {{ shortLabel(d.label) || `扬声器 ${speakers.indexOf(d) + 1}` }}
          </option>
        </select>
        <svg class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-main/40" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
  </div>
</template>
