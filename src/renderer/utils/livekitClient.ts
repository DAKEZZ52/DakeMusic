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
  name: string;
  avatar: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
  isOwner: boolean;
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
    // 进新房间前确保旧房间已断开，防止串房
    if (this.room) {
      try { await this.room.disconnect(); } catch {}
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

      // 设置自己的 metadata（包含头像）
      const avatar = typeof localStorage !== 'undefined' ? (localStorage.getItem('chatroom_avatarImage') || '') : '';
      try { await this.room.localParticipant.setMetadata(JSON.stringify({ avatar })); } catch {}

      this.callbacks.onConnected?.();
      this.sendSystemMessage(`${userName} 加入了房间`);
    } catch (error) {
      console.error('[LiveKit] 连接失败:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.room) {
      this.sendSystemMessage(`${this.localName} 离开了房间`);
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
    try {
      const lp = this.room.localParticipant;
      const hasAudio = Array.from(lp.audioTrackPublications.values()).length > 0;
      if (!enabled && !hasAudio) return;
      await lp.setMicrophoneEnabled(enabled);
      // 兜底：闭麦时直接禁用所有本地音频 track，防止 API 调用失败但 track 还在发送
      if (!enabled) {
        for (const pub of lp.audioTrackPublications.values()) {
          const t = pub.track;
          if (t?.mediaStreamTrack) {
            try { t.mediaStreamTrack.enabled = false; } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('[LiveKit] setMicrophoneEnabled 失败:', e);
    }
  }

  // 更新自己的 metadata（换头像时调用，实时同步给房间内所有人）
  async updateLocalMetadata(avatar: string): Promise<void> {
    if (!this.room) return;
    const metadata = JSON.stringify({ avatar });
    try {
      await this.room.localParticipant.setMetadata(metadata);
      // 主动触发本地回调，确保自己的头像立即更新（不依赖事件延迟）
      this.callbacks.onMetadataChanged?.(this.localIdentity, metadata);
    } catch (e) {
      console.warn('[LiveKit] updateMetadata 失败:', e);
    }
  }

  // 从 participant metadata 解析头像
  private parseAvatar(metadata: string | undefined): string {
    if (!metadata) return '';
    try { return JSON.parse(metadata).avatar || ''; } catch { return ''; }
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
        // seats 变化广播（麦位实时同步）
        if (topic === 'seats' || data.type === 'seats_update') {
          this.callbacks.onSeatsUpdate?.(data.seats || []);
          return;
        }
        this.callbacks.onMessage?.(data as ChatMessage);
      } catch (e) {
        console.error('[LiveKit] 解析消息失败:', e);
      }
    });

    this.room.on(RoomEvent.TrackMuted, (...args: any[]) => {
      // 兼容不同版本参数顺序：(publication, participant) 或 (participant, publication)
      let publication: any, participant: Participant | undefined;
      if (args[0]?.kind !== undefined) { publication = args[0]; participant = args[1]; }
      else { participant = args[0]; publication = args[1]; }
      if (publication?.kind === 'audio' && participant) {
        this.callbacks.onMemberMuteChange?.(participant.identity, true);
      }
    });

    this.room.on(RoomEvent.TrackUnmuted, (...args: any[]) => {
      let publication: any, participant: Participant | undefined;
      if (args[0]?.kind !== undefined) { publication = args[0]; participant = args[1]; }
      else { participant = args[0]; publication = args[1]; }
      if (publication?.kind === 'audio' && participant) {
        this.callbacks.onMemberMuteChange?.(participant.identity, false);
      }
    });

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
          document.body.appendChild(el);
          console.log('[LiveKit] 远程音频已 attach:', participant?.name);
        } catch (e) {
          console.warn('[LiveKit] 音频 attach 失败:', e);
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
