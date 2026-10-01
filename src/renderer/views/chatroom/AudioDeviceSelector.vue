<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { getLiveKitClient } from '@/utils/livekitClient';

const mics = ref<MediaDeviceInfo[]>([]);
const speakers = ref<MediaDeviceInfo[]>([]);
const selectedMic = ref('');
const selectedSpeaker = ref('');
const loading = ref(false);

const client = getLiveKitClient();

// 截断设备名，去掉括号里的设备ID，最多18字
function shortLabel(label: string): string {
  if (!label) return '';
  // 去掉括号及后面的内容，如 "Default - 麦克风 (2- iKF-G11) (0d8c:0359)" → "Default - 麦克风"
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
    await lp.setMicrophoneEnabled(false);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });
    const track = stream.getAudioTracks()[0];
    if (track) {
      const existing = lp.audioTrackPublications.values().next().value;
      if (existing) {
        await existing.setTrack(track);
      } else {
        await lp.publishTrack(track, { source: 'microphone' as any });
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

watch(selectedMic, (id) => {
  if (id) applyMic(id);
});

watch(selectedSpeaker, (id) => {
  if (id) applySpeaker(id);
});

function onDeviceChange() {
  loadDevices();
}

onMounted(() => {
  loadDevices();
  navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
});

onUnmounted(() => {
  navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
});
</script>

<template>
  <div class="audio-device-selector flex items-center gap-3 px-3 py-2">
    <div class="flex items-center gap-2">
      <span class="text-xs text-text-main/60 shrink-0">🎤</span>
      <select
        v-model="selectedMic"
        class="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-[140px] truncate"
        :disabled="loading"
      >
        <option value="" disabled>{{ loading ? '加载中...' : '麦克风' }}</option>
        <option v-for="d in mics" :key="d.deviceId" :value="d.deviceId" :title="d.label">
          {{ shortLabel(d.label) || `麦克风 ${mics.indexOf(d) + 1}` }}
        </option>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-text-main/60 shrink-0">🔊</span>
      <select
        v-model="selectedSpeaker"
        class="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-[140px] truncate"
        :disabled="loading"
      >
        <option value="" disabled>{{ loading ? '加载中...' : '扬声器' }}</option>
        <option v-for="d in speakers" :key="d.deviceId" :value="d.deviceId" :title="d.label">
          {{ shortLabel(d.label) || `扬声器 ${speakers.indexOf(d) + 1}` }}
        </option>
      </select>
    </div>
    
  </div>
</template>
