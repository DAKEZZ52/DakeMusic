/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：useMicGain.ts
 * 描述：麦克风输入增益链（模块级单例）- 麦克风→GainNode→LocalAudioTrack→LiveKit，
 *       房间内页与悬浮窗共用同一套，避免多轨道冲突；真正退房才销毁。
 */
import { ref, computed, watch } from 'vue';
import { getLiveKitClient } from '@/utils/livekitClient';
import { LocalAudioTrack } from 'livekit-client';
import { logger } from '@/utils/logger';

/* ============ 模块级单例状态（跨组件共享，不随页面卸载重置） ============ */
const micGainReady = ref(false);
const adsMicId = ref('');
const adsMicVol = ref(60);
// adsMuted：麦克风开关的单一真相源（true = 已闭麦）
const adsMuted = ref(true);
// 防连点锁（切换进行中忽略重复点击）
const adsSwitching = ref(false);
const adsMicOn = computed(() => !adsMuted.value);

let micGainCtx: any = null;
let micGainSrc: any = null;
let micGainNode: any = null;
let micGainDest: any = null;
let micRawStream: MediaStream | null = null;
let micLkTrack: any = null;

// 安全获取 LiveKit room（private 字段，用 any 访问）
function getLKRoom(): any {
  try {
    const c: any = getLiveKitClient();
    return c?.room || c?.currentRoom || null;
  } catch {
    return null;
  }
}

/** 释放并关闭整条增益链（退房时调用） */
function cleanupMicGain() {
  try {
    micGainSrc?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '断开增益源失败', e);
  }
  try {
    micGainNode?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '断开增益节点失败', e);
  }
  try {
    micGainDest?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '断开增益输出失败', e);
  }
  if (micRawStream) {
    micRawStream.getTracks().forEach((t: any) => {
      try {
        t.stop();
      } catch (e) {
        logger.debug('MicGain', '停止原始麦克风轨道失败', e);
      }
    });
    micRawStream = null;
  }
  try {
    micGainCtx?.close();
  } catch (e) {
    logger.debug('MicGain', '关闭 AudioContext 失败', e);
  }
  micGainCtx = micGainSrc = micGainNode = micGainDest = null;
  micLkTrack = null;
  micGainReady.value = false;
  adsMuted.value = true; // 退房后回到默认闭麦
}

/** 释放旧音频图（重建前调用，防止 AudioContext / 麦克风句柄泄漏） */
function teardownGraph() {
  try {
    micGainSrc?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '重建前断开增益源失败', e);
  }
  try {
    micGainNode?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '重建前断开增益节点失败', e);
  }
  try {
    micGainDest?.disconnect();
  } catch (e) {
    logger.debug('MicGain', '重建前断开增益输出失败', e);
  }
  if (micRawStream) {
    micRawStream.getTracks().forEach((t: any) => {
      try {
        t.stop();
      } catch (e) {
        logger.debug('MicGain', '重建前停止原始麦克风轨道失败', e);
      }
    });
    micRawStream = null;
  }
  try {
    micGainCtx?.close();
  } catch (e) {
    logger.debug('MicGain', '重建前关闭 AudioContext 失败', e);
  }
  micGainCtx = micGainSrc = micGainNode = micGainDest = null;
}

/** 建立增益链并用 LiveKit 官方 LocalAudioTrack 包装 */
async function buildGainTrack(deviceId?: string): Promise<any> {
  // 先释放旧图，避免重复创建泄漏 AudioContext / 占用麦克风
  teardownGraph();

  const AC: any = window.AudioContext || (window as any).webkitAudioContext;
  micGainCtx = new AC();
  // 必须主动 resume，否则 Electron 自动播放策略会挂起 AudioContext，输出静音轨道
  if (micGainCtx.state === 'suspended') {
    try {
      await micGainCtx.resume();
    } catch (e) {
      logger.warn('MicGain', 'AudioContext 恢复失败，输出可能静音', e);
    }
  }
  micRawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // 唱歌场景：关掉浏览器默认的 AEC / 降噪 / 自动增益，
      // 否则机架（VST 宿主）处理过的人声会被二次处理，尾音被切、动态被压平
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48000,
    },
  });
  micGainSrc = micGainCtx.createMediaStreamSource(micRawStream);
  micGainNode = micGainCtx.createGain();
  micGainNode.gain.value = adsMicVol.value / 100;
  micGainDest = micGainCtx.createMediaStreamDestination();
  micGainSrc.connect(micGainNode);
  micGainNode.connect(micGainDest);

  const processed: any = micGainDest.stream.getAudioTracks()[0];

  // 用 LiveKit 官方类包装，不能直接 publish 原生轨道
  return new LocalAudioTrack(processed);
}

/** 发布带增益的麦克风轨道（替换已发布轨道） */
async function publishGainMic(deviceId?: string): Promise<boolean> {
  try {
    const room: any = getLKRoom();
    const lp = room?.localParticipant;
    if (!lp) return false;

    const track = await buildGainTrack(deviceId);

    // 卸载旧音频轨道（先收集成数组，避免遍历中修改 Map）
    try {
      const pubs = [...lp.audioTrackPublications.values()] as any[];
      for (const pub of pubs) {
        const t = pub?.track ?? pub;
        if (t) {
          try {
            await lp.unpublishTrack(t);
          } catch (e) {
            logger.debug('MicGain', '卸载旧麦克风轨道失败', e);
          }
        }
      }
    } catch (e) {
      logger.warn('MicGain', '读取旧麦克风轨道列表失败', e);
    }

    await lp.publishTrack(track, { source: 'microphone' });
    // 发布后必须按当前真实开关状态恢复轨道，不能在切设备时无条件开麦。
    // adsMuted 是开关麦的单一真相源：true 表示用户当前处于闭麦状态。
    try {
      if (adsMuted.value) {
        if (typeof track.mute === 'function') await track.mute();
      } else if (typeof track.unmute === 'function') {
        await track.unmute();
      }
    } catch (e) {
      logger.warn('MicGain', '恢复增益轨道静音状态失败', e);
    }
    micLkTrack = track;
    micGainReady.value = true;
    return true;
  } catch (e) {
    console.error('[MicGain] 建立输入增益失败', e);
    cleanupMicGain();
    return false;
  }
}

/** 开麦前确保增益链已建立 */
async function ensureMicGain() {
  if (micGainReady.value) return;
  const room: any = getLKRoom();
  if (!room?.localParticipant) return; // 还没进房
  const ok = await publishGainMic(adsMicId.value || undefined);
  if (!ok) console.warn('[MicGain] 输入增益不可用，已退回普通麦克风模式');
}

/** 实时改 GainNode 音量（不重新发布轨道） */
function applyMicGain() {
  if (micGainNode) {
    try {
      micGainNode.gain.value = adsMicVol.value / 100;
    } catch (e) {
      logger.warn('MicGain', '设置麦克风增益失败', e);
    }
  }
}
watch(adsMicVol, applyMicGain);

/** 从 LiveKit 回读真实麦状态（不猜），读不到返回 null */
async function readRealMuted(): Promise<boolean | null> {
  try {
    const room: any = getLKRoom();
    const lp = room?.localParticipant;
    if (!lp) return null;
    try {
      for (const pub of [...lp.audioTrackPublications.values()] as any[]) {
        if (typeof pub?.isMuted === 'boolean') return pub.isMuted;
        const t = pub?.track;
        if (t && typeof t.isMuted === 'boolean') return t.isMuted;
        if (t && typeof t.enabled === 'boolean') return !t.enabled;
      }
    } catch (e) {
      logger.debug('MicGain', '读取麦克风轨道状态失败', e);
    }
    if (typeof lp.isMicrophoneEnabled === 'boolean') return !lp.isMicrophoneEnabled;
  } catch (e) {
    logger.debug('MicGain', '读取 LiveKit 麦克风状态失败', e);
  }
  return null;
}

/**
 * 统一开关麦（房间内与悬浮窗共用）
 * 开麦：建立增益链并 unmute；闭麦：mute 增益轨道。绝不混用官方 setMicrophoneEnabled。
 */
async function adsToggleMic() {
  if (adsSwitching.value) return;
  adsSwitching.value = true;
  try {
    const real = await readRealMuted();
    const curMuted = real ?? adsMuted.value;
    const wantEnabled = curMuted; // 当前闭麦→开麦(true)；当前开麦→闭麦(false)

    if (wantEnabled) {
      try {
        if (micGainReady.value && micLkTrack) {
          if (micGainCtx?.state === 'suspended') {
            try {
              await micGainCtx.resume();
            } catch (e) {
              logger.warn('MicGain', '开麦前恢复 AudioContext 失败', e);
            }
          }
          if (typeof micLkTrack.unmute === 'function') await micLkTrack.unmute();
        } else {
          await ensureMicGain();
          // ensureMicGain 会按当前 adsMuted（此时仍是 true）发布静音轨道，
          // 因此首次开麦必须显式 unmute，否则 UI 显示开麦但实际没有声音。
          if (micGainReady.value && micLkTrack && typeof micLkTrack.unmute === 'function') {
            await micLkTrack.unmute();
          }
          // 增益失败兜底：官方 API 开普通麦，保证能说话
          if (!micGainReady.value) {
            const room: any = getLKRoom();
            if (typeof room?.localParticipant?.setMicrophoneEnabled === 'function') {
              await room.localParticipant.setMicrophoneEnabled(true);
            }
          }
        }
      } catch (e) {
        logger.warn('MicGain', '开麦失败', e);
      }
    } else {
      // 闭麦：优先 mute 增益轨道，否则官方 API
      if (micLkTrack && typeof micLkTrack.mute === 'function') {
        await micLkTrack.mute();
      } else {
        const room: any = getLKRoom();
        if (typeof room?.localParticipant?.setMicrophoneEnabled === 'function') {
          await room.localParticipant.setMicrophoneEnabled(false);
        }
      }
    }

    adsMuted.value = !wantEnabled;

    // 复查纠正：350ms 后读真实状态
    setTimeout(async () => {
      const after = await readRealMuted();
      if (after !== null && after !== adsMuted.value) adsMuted.value = after;
    }, 350);
  } catch (e) {
    console.error('[MicGain] 切换麦克风失败', e);
  } finally {
    adsSwitching.value = false;
  }
}

/** 切换麦克风输入设备（增益模式重建链路） */
async function adsChangeMic(id: string) {
  try {
    adsMicId.value = id;
    if (micGainReady.value) {
      const ok = await publishGainMic(id);
      if (ok) return;
    }
    const room: any = getLKRoom();
    if (room?.switchActiveDevice) await room.switchActiveDevice('audioinput', id);
  } catch (e) {
    console.error('[MicGain] 切换麦克风设备失败', e);
  }
}

/**
 * 拿到人声增益链的音频图（供合唱混音使用）。
 * 拿到 dest 后把伴奏节点接进去，已发布的麦克风轨道会自动带上伴奏。
 */
export function getMicMixGraph(): {
  ctx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  input: GainNode;
} | null {
  if (!micGainCtx || !micGainDest || !micGainNode) return null;
  return { ctx: micGainCtx, dest: micGainDest, input: micGainNode };
}

export function useMicGain() {
  return {
    // state
    micGainReady,
    adsMicId,
    adsMicVol,
    adsMuted,
    adsSwitching,
    adsMicOn,
    // methods
    adsToggleMic,
    adsChangeMic,
    ensureMicGain,
    cleanupMicGain,
  };
}
