/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：livekitClient.ts
 * 描述：LiveKit 音视频客户端封装 - 房间连接/成员管理/消息收发/设备管理
 */
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client';

// LiveKit WebSocket 地址（由后端 /api/rooms/:id/join 返回的 token 配合使用）
// 注意：API_KEY / API_SECRET 永远不放在前端，token 必须由后端签发
const LIVEKIT_URL = 'ws://106.52.9.146:7880';

export interface ChatMessage {
  id: string;
  senderIdentity: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
}

export interface RoomMember {
  identity: string;
  name: string;         // 昵称（显示用）
  account?: string;     // 登录账号（小字灰色展示，可为空）
  avatar: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
  isOwner: boolean;
  isAdmin?: boolean;    // 房间管理员（非房主）
}

export interface LiveKitClientCallbacks {
  onMemberJoin?: (member: RoomMember) => void;
  onMemberLeave?: (identity: string) => void;
  onMemberMuteChange?: (identity: string, muted: boolean) => void;
  onMessage?: (message: ChatMessage) => void;
  onSeatsUpdate?: (seats: any[]) => void;
  onSpeakingChange?: (identity: string, speaking: boolean) => void;
  onMetadataChanged?: (identity: string, metadata: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export class LiveKitClient {
  private room: Room | null = null;
  private callbacks: LiveKitClientCallbacks = {};
  private muteSyncTimer: any = null;
  private localIdentity: string = '';
  private localName: string = '';
  private ownerIdentity: string = '';

  constructor(callbacks?: LiveKitClientCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  setCallbacks(callbacks: LiveKitClientCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async joinRoom(
    roomName: string,
    userName: string,
    options?: { ownerIdentity?: string; token?: string; identity?: string },
  ): Promise<void> {
    // 进新房间前确保旧房间已断开，防止串房（最多等1秒，避免卡顿）
    if (this.room) {
      try {
        await Promise.race([
          this.room.disconnect(),
          new Promise(r => setTimeout(r, 1000)),
        ]);
      } catch {}
      this.room = null as any;
    }
    this.localName = userName;
    this.ownerIdentity = options?.ownerIdentity || '';

    // token 必须由后端 /api/rooms/:id/join 签发，前端不持有 API_SECRET
    const token = options?.token;
    if (!token) throw new Error('MISSING_ROOM_TOKEN: 必须由后端签发房间令牌');
    this.localIdentity = options?.identity || '';

    // 从 token 解析 identity（如果没传）
    if (!this.localIdentity) {
      try {
        const payloadB64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        this.localIdentity = payload.sub;
      } catch {
        this.localIdentity = `user_${Date.now()}`;
      }
    }

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      reconnect: false, // 禁止自动重连，被服务器踢掉后不自动回旧房间
    } as any);

    this.setupEventListeners();

    try {
      await this.room.connect(LIVEKIT_URL, token);
      console.log('[LiveKit] 已连接到房间:', roomName);

      await this.room.localParticipant.setMicrophoneEnabled(false);

      // DakeMusic: 不再通过 LiveKit metadata 同步大头像（会导致信令报错、反复重连、语音中断）
      // 头像统一通过后端 /api/users/:id 获取，LiveKit metadata 仅由后端在 join 时写入账号信息
      // 保留 localStorage 头像仅本地使用，不发送到 LiveKit

      this.callbacks.onConnected?.();
      this.sendSystemMessage(`${userName} 加入了房间`);
    } catch (error) {
      console.error('[LiveKit] 连接失败:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.muteSyncTimer) { clearInterval(this.muteSyncTimer); this.muteSyncTimer = null; }
    if (this.room) {
      // 发完「离开了房间」再断线：否则 publishData 还没发出去连接就断了，别人收不到提示
      // 加 150ms 超时保护，避免网络异常时退房卡顿
      try {
        await Promise.race([
          this.sendSystemMessage(`${this.localName} 离开了房间`),
          new Promise<void>((r) => setTimeout(r, 150)),
        ]);
      } catch (e) {
        console.warn("[LiveKit] 发送离开消息失败 (ignorable):", e);
      }
      try {
        await this.room.disconnect();
      } catch (e) {
        console.warn("[LiveKit] disconnect warning (ignorable):", e);
      }
      this.room = null;
      this.callbacks.onDisconnected?.();
    }
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room) return;
    const lp = this.room.localParticipant;
    // 先尝试官方 API，失败则用底层方式兜底（兼容不同 livekit-client 版本）
    try {
      await lp.setMicrophoneEnabled(enabled);
    } catch (e) {
      console.warn('[LiveKit] setMicrophoneEnabled 失败，用底层方式兜底:', e);
    }
    // 无论 API 是否成功，都强制确保 track 状态正确（防止 API 报错但 track 还在发送/停止）
    for (const pub of lp.audioTrackPublications.values()) {
      const t = pub.track;
      if (t?.mediaStreamTrack) {
        try { t.mediaStreamTrack.enabled = enabled; } catch {}
      }
    }
  }

  // DakeMusic: 更新本地头像显示，不再通过 LiveKit metadata 发送（避免超大 base64 导致重连断语音）
  // 头像保存到后端后，其他人通过后端 API 拉取
  async updateLocalMetadata(avatar: string): Promise<void> {
    if (!this.room) return;
    // 仅更新本地显示，不调用 LiveKit setMetadata
    const metadata = JSON.stringify({ avatar });
    this.callbacks.onMetadataChanged?.(this.localIdentity, metadata);
  }

  // 从 participant metadata 解析头像
  private parseAvatar(metadata: string | undefined): string {
    if (!metadata) return '';
    try { return JSON.parse(metadata).avatar || ''; } catch { return ''; }
  }

  /** 从 participant.metadata 解析登录账号（后端 join 时写入） */
  private parseAccount(metadata: string | undefined): string {
    if (!metadata) return '';
    try { return JSON.parse(metadata).account || ''; } catch { return ''; }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.room) return;

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderIdentity: this.localIdentity,
      senderName: this.localName,
      content,
      timestamp: Date.now(),
      type: 'text',
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));

    await this.room.localParticipant.publishData(data, { reliable: true });

    this.callbacks.onMessage?.(message);
  }

  private async sendSystemMessage(content: string): Promise<void> {
    if (!this.room) return;

    const message: ChatMessage = {
      id: `sys_${Date.now()}`,
      senderIdentity: 'system',
      senderName: '系统',
      content,
      timestamp: Date.now(),
      type: 'system',
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));

    await this.room.localParticipant.publishData(data, { reliable: true });
  }

  getMembers(): RoomMember[] {
    if (!this.room) return [];

    const members: RoomMember[] = [];

    const local = this.room.localParticipant;
    members.push({
      identity: local.identity,
      name: local.name || '未知用户',
      avatar: this.parseAvatar(local.metadata),
      account: this.parseAccount(local.metadata),
      isMuted: !local.isMicrophoneEnabled,
      isSpeaking: local.isSpeaking,
      isLocal: true,
      isOwner: local.identity === this.ownerIdentity,
    });

    this.room.remoteParticipants.forEach((p: RemoteParticipant) => {
      members.push({
        identity: p.identity,
        name: p.name || '未知用户',
        avatar: this.parseAvatar(p.metadata),
        account: this.parseAccount(p.metadata),
        isMuted: !p.isMicrophoneEnabled,
        isSpeaking: p.isSpeaking,
        isLocal: false,
        isOwner: p.identity === this.ownerIdentity,
      });
    });

    return members;
  }

  getLocalIdentity(): string {
    return this.localIdentity;
  }

  getLocalName(): string {
    return this.localName;
  }

  setOwnerIdentity(identity: string) {
    this.ownerIdentity = identity;
  }

  private setupEventListeners() {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] 用户加入:', participant.name);
      this.callbacks.onMemberJoin?.({
        identity: participant.identity,
        name: participant.name || '未知用户',
        avatar: this.parseAvatar(participant.metadata),
        isMuted: !participant.isMicrophoneEnabled,
        isSpeaking: false,
        isLocal: false,
        isOwner: participant.identity === this.ownerIdentity,
      });
      // 延迟1秒再读一次 metadata（对方可能刚设置头像，metadata 同步有延迟）
      setTimeout(() => {
        if (!this.room) return;
        const p = this.room.remoteParticipants.get(participant.identity);
        if (p) {
          const avatar = this.parseAvatar(p.metadata);
          if (avatar) this.callbacks.onMetadataChanged?.(p.identity, p.metadata || '');
        }
      }, 1000);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] 用户离开:', participant.name);
      this.callbacks.onMemberLeave?.(participant.identity);
    });

    this.room.on(RoomEvent.DataReceived, (...args: any[]) => {
      try {
        const payload = args[0] as Uint8Array;
        // topic 可能在第4个参数，或在 participant 的 dataPacketInfo 里
        let topic: string | undefined = args[3];
        if (!topic && args[1]?.dataPacketInfo?.topic) topic = args[1].dataPacketInfo.topic;
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));
        this.callbacks.onMessage?.(data as ChatMessage);
      } catch (e) {
        console.error('[LiveKit] 解析消息失败:', e);
      }
    });

    // 静音状态变化
    const onMuteChange = (participant: Participant) => {
      if (!participant) return;
      const isMuted = !participant.isMicrophoneEnabled;
      this.callbacks.onMemberMuteChange?.(participant.identity, isMuted);
    };
    // ParticipantChanged：参与者任何属性变化（包括静音），最可靠
    try {
      this.room.on((RoomEvent as any).ParticipantChanged || 'participantChanged', (participant: Participant) => {
        onMuteChange(participant);
      });
    } catch {}
    // TrackMuted/TrackUnmuted 兜底
    this.room.on(RoomEvent.TrackMuted, (...args: any[]) => {
      const participant = (args[1] as Participant) || args.find((a: any) => a?.identity);
      if (participant) onMuteChange(participant);
    });
    this.room.on(RoomEvent.TrackUnmuted, (...args: any[]) => {
      const participant = (args[1] as Participant) || args.find((a: any) => a?.identity);
      if (participant) onMuteChange(participant);
    });
    // 定时同步兜底（每2秒遍历所有参与者），确保远程静音状态最终一致
    if (this.muteSyncTimer) clearInterval(this.muteSyncTimer);
    this.muteSyncTimer = setInterval(() => {
      if (!this.room) return;
      try {
        this.room.remoteParticipants.forEach((p: RemoteParticipant) => onMuteChange(p));
        if (this.room.localParticipant) onMuteChange(this.room.localParticipant);
      } catch {}
    }, 2000);

    this.room.on(RoomEvent.ActiveSpeakersChanged, (...args: any[]) => {
      const speakers = (args[0] || []) as Participant[];
      const speakingIdentities = new Set(speakers.map((s: Participant) => s.identity));
      this.getMembers().forEach((m) => {
        this.callbacks.onSpeakingChange?.(m.identity, speakingIdentities.has(m.identity));
      });
    });

    // 参与者 metadata 变化（换头像等）— 回调参数顺序：(metadata, participant)
    this.room.on(RoomEvent.ParticipantMetadataChanged, (metadata: string | undefined, participant: any) => {
      if (!participant) return;
      // 重新从 room 取 participant，确保拿到最新 metadata
      let latestMetadata = metadata || participant.metadata || '';
      try {
        const p = this.room?.remoteParticipants.get(participant.identity) ||
          (participant.identity === this.room?.localParticipant.identity ? this.room?.localParticipant : null);
        if (p?.metadata) latestMetadata = p.metadata;
      } catch {}
      this.callbacks.onMetadataChanged?.(participant.identity, latestMetadata);
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] 已断开连接');
      this.callbacks.onDisconnected?.();
    });

    // 远程音频轨道订阅时手动 attach，确保能听到声音
    this.room.on(RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => {
      if (track.kind === 'audio') {
        try {
          const el = track.attach();
          el.style.display = 'none';
          el.className = 'lk-voice-audio'; // 标记为语聊房音频，与播放器区分
          document.body.appendChild(el);
          console.log('[LiveKit] 远程音频已 attach:', participant?.name);
        } catch (e) {
          console.warn('[LiveKit] 音频 attach 失败:', e);
        }
        // 订阅到音频时同步一次静音状态（对方可能在订阅前就开/闭麦了）
        if (participant?.identity) {
          this.callbacks.onMemberMuteChange?.(participant.identity, !participant.isMicrophoneEnabled);
        }
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (track.kind === 'audio') {
        try { track.detach().forEach((el: HTMLMediaElement) => el.remove()); } catch {}
      }
    });
  }
}

let instance: LiveKitClient | null = null;

export function getLiveKitClient(callbacks?: LiveKitClientCallbacks): LiveKitClient {
  if (!instance) {
    instance = new LiveKitClient(callbacks);
  } else if (callbacks) {
    instance.setCallbacks(callbacks);
  }
  return instance;
}
