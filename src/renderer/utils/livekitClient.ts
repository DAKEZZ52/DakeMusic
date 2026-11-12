/**
 * LyriseMusic 语聊房模块
 * 作者：知之Dake
 * 文件：livekitClient.ts
 * 描述：LiveKit 音视频客户端封装 - 房间连接/成员管理/消息收发/设备管理
 */
import { Room, RoomEvent, type RemoteParticipant, type Participant } from 'livekit-client';
import { DAKE_LIVEKIT_URL } from '../../shared/endpoints';
import { logger } from '@/utils/logger';

// LiveKit WebSocket 地址（由后端 /api/rooms/:id/join 返回的 token 配合使用）
// 注意：API_KEY / API_SECRET 永远不放在前端，token 必须由后端签发
/*
 * LiveKit 服务器地址（wss = 加密 WebSocket）
 * 走 nginx 443 的 /livekit 反代到 LiveKit 7880，相比原来的 ws://...:7880：
 *   1. 加密传输；2. 走 443 标准端口，企业/校园/酒店网络只开 443 也能连；3. 无需暴露 7880。
 * 已在服务器验证：443 /livekit 与直连 7880 响应一致，WebSocket 升级头齐全。
 */
const LIVEKIT_URL = DAKE_LIVEKIT_URL;

export interface ChatMessage {
  id: string;
  senderIdentity: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system' | 'image';
  /** 控制数据标识（座位/歌词等）；正常聊天消息无此字段 */
  kind?: string;
}

export interface RoomMember {
  identity: string;
  name: string; // 昵称（显示用）
  account?: string; // 登录账号（小字灰色展示，可为空）
  avatar: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
  isOwner: boolean;
  isAdmin?: boolean; // 房间管理员（非房主）
  isSuperAdmin?: boolean; // 全局超级管理员
  isRootSuper?: boolean; // 根超管（环境变量写死）
}

export interface LiveKitClientCallbacks {
  onMemberJoin?: (member: RoomMember) => void;
  onMemberLeave?: (identity: string) => void;
  onMemberMuteChange?: (identity: string, muted: boolean) => void;
  onMessage?: (message: ChatMessage) => void;
  onSeatsUpdate?: (seats: any[]) => void;
  onSpeakingChange?: (identity: string, speaking: boolean) => void;
  onMetadataChanged?: (identity: string, metadata: string) => void;
  // LyriseMusic: 座位管理模块专用数据通道（kind=lyrise-seat）
  onSeatData?: (payload: any, fromIdentity: string) => void;
  onSeatPeerConnected?: (identity: string) => void;
  // LyriseMusic: 房间点歌台事件（queue:updated / track:changed）
  onQueueEvent?: (payload: { type: string; queue?: any[]; track?: any }) => void;
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
        await Promise.race([this.room.disconnect(), new Promise((r) => setTimeout(r, 1000))]);
      } catch (e) {
        logger.debug('LiveKit', '断开旧房间失败，继续进入新房间', e);
      }
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

      await this.room.localParticipant.setMicrophoneEnabled(false);

      // LyriseMusic: 不再通过 LiveKit metadata 同步大头像（会导致信令报错、反复重连、语音中断）
      // 头像统一通过后端 /api/users/:id 获取，LiveKit metadata 仅由后端在 join 时写入账号信息
      // 保留 localStorage 头像仅本地使用，不发送到 LiveKit

      // 进/退房系统消息由后端统一广播（避免客户端伪造 + 重复两条）
      this.callbacks.onConnected?.();
    } catch (error) {
      console.error('[LiveKit] 连接失败:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.muteSyncTimer) {
      clearInterval(this.muteSyncTimer);
      this.muteSyncTimer = null;
    }
    if (this.room) {
      // 退房系统消息同样由后端广播，客户端不再直接发；直接断开即可。
      try {
        await this.room.disconnect();
      } catch (e) {
        console.warn('[LiveKit] disconnect warning (ignorable):', e);
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
        try {
          t.mediaStreamTrack.enabled = enabled;
        } catch (e) {
          logger.debug('LiveKit', '设置音频轨道启用状态失败', e);
        }
      }
    }
  }

  // LyriseMusic: 更新本地头像显示，不再通过 LiveKit metadata 发送（避免超大 base64 导致重连断语音）
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
    try {
      return JSON.parse(metadata).avatar || '';
    } catch {
      return '';
    }
  }

  /** 从 participant.metadata 解析登录账号（后端 join 时写入） */
  private parseAccount(metadata: string | undefined): string {
    if (!metadata) return '';
    try {
      return JSON.parse(metadata).account || '';
    } catch {
      return '';
    }
  }

  private parseIsAdmin(metadata: string | undefined): boolean {
    if (!metadata) return false;
    try {
      return !!JSON.parse(metadata).isAdmin;
    } catch {
      return false;
    }
  }

  private parseIsRootSuper(metadata: string | undefined): boolean {
    if (!metadata) return false;
    try {
      return !!JSON.parse(metadata).isRootSuper;
    } catch {
      return false;
    }
  }

  async sendMessage(content: string, type: 'text' | 'image' = 'text'): Promise<void> {
    if (!this.room) return;

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderIdentity: this.localIdentity,
      senderName: this.localName,
      content,
      timestamp: Date.now(),
      type,
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));

    await this.room.localParticipant.publishData(data, { reliable: true });

    this.callbacks.onMessage?.(message);
  }

  /**
   * LyriseMusic: 座位协议数据广播（kind=lyrise-seat，与聊天消息区分）
   * @param payload 座位协议消息（内部会自动加 kind）
   * @param destinationIdentities 传 identity 列表则单播给指定成员（如房主给新成员同步座位快照）
   */
  async publishSeatData(payload: any, destinationIdentities?: string[]): Promise<void> {
    if (!this.room) return;
    const envelope = { ...payload, kind: 'lyrise-seat' };
    const data = new TextEncoder().encode(JSON.stringify(envelope));
    const opts: any = { reliable: true };
    if (destinationIdentities?.length) {
      opts.destinationIdentities = destinationIdentities;
    }
    await this.room.localParticipant.publishData(data, opts);
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
      isAdmin: this.parseIsAdmin(local.metadata),
      isRootSuper: this.parseIsRootSuper(local.metadata),
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
        isAdmin: this.parseIsAdmin(p.metadata),
        isRootSuper: this.parseIsRootSuper(p.metadata),
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
      this.callbacks.onSeatPeerConnected?.(participant.identity);
      this.callbacks.onMemberJoin?.({
        identity: participant.identity,
        name: participant.name || '未知用户',
        account: this.parseAccount(participant.metadata),
        avatar: this.parseAvatar(participant.metadata),
        isMuted: !participant.isMicrophoneEnabled,
        isSpeaking: false,
        isLocal: false,
        isOwner: participant.identity === this.ownerIdentity,
        isAdmin: this.parseIsAdmin(participant.metadata),
        isRootSuper: this.parseIsRootSuper(participant.metadata),
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
      this.callbacks.onMemberLeave?.(participant.identity);
    });

    this.room.on(RoomEvent.DataReceived, (...args: any[]) => {
      try {
        const payload = args[0] as Uint8Array;
        // args[1] 仅在自己的 LiveKit 数据包中才是 RemoteParticipant；
        // 服务端通过 roomService.sendData 发出的系统消息/点歌事件没有 participant。
        const participant = args[1] as RemoteParticipant | undefined;
        const fromIdentity: string = participant?.identity || '';
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (!data || typeof data !== 'object') return;

        /*
         * LyriseMusic 数据广播协议（统一靠 JSON 里的 kind 字段区分，全部走 publishData）：
         *   lyrise-seat             座位协议（落座/换座/申请/审批/快照），交给座位模块 onSeatData
         *   lyrise-lyric            歌词：lyric-sync（全量）/ lyric-heartbeat（轻量行号）
         *   lyrise-seat-mode        房间座位模式 normal / duet
         *   lyrise-user-style       某人的麦位框 / 声波皮肤
         *   lyrise-badwords-refresh 通知全员重拉违禁词
         * 除座位外，其余控制协议由 ChatRoom 独立 room.on('dataReceived') 处理。
         * 这里统一拦截所有 lyrise-* 控制协议，不让它进入聊天消息层（也不依赖 store 的二次过滤）。
         */
        if (typeof data.kind === 'string' && data.kind.startsWith('lyrise-')) {
          // 座位协议只能来自真实参与者；服务端不会发这个 kind
          if (data.kind === 'lyrise-seat' && participant) {
            this.callbacks.onSeatData?.(data, fromIdentity);
          }
          // 其余控制协议（含 lyric / seat-mode / user-style / badwords-refresh）由 ChatRoom 处理，此处直接丢弃
          return;
        }
        // 兼容旧版：无 kind 但带 type=lyric-sync 的歌词消息，同样不进公屏
        if (data.type === 'lyric-sync') return;

        // LyriseMusic: 点歌台事件只允许服务端下发（participant 为空），
        // 普通成员伪造 music_* 事件会让所有人切歌/清队列。
        if (
          data.payload &&
          typeof data.payload.type === 'string' &&
          data.payload.type.startsWith('music_')
        ) {
          if (!participant) this.callbacks.onQueueEvent?.(data.payload);
          return;
        }

        // 普通聊天消息：参与者发来的消息一律以 LiveKit 签名的身份/昵称为准，
        // 防止伪造别人的 senderIdentity / senderName；系统消息只允许服务端发。
        if (participant) {
          if (data.type !== 'text' && data.type !== 'image') return;
          if (typeof data.content !== 'string' || !data.content || data.content.length > 4000)
            return;
          this.callbacks.onMessage?.({
            ...(data as ChatMessage),
            senderIdentity: participant.identity,
            senderName: participant.name || '未知用户',
          });
          return;
        }

        // 服务端消息（系统提示等）：保留后端下发的身份
        if (data.type === 'text' || data.type === 'system' || data.type === 'image') {
          this.callbacks.onMessage?.(data as ChatMessage);
        }
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
      this.room.on(
        (RoomEvent as any).ParticipantChanged || 'participantChanged',
        (participant: Participant) => {
          onMuteChange(participant);
        },
      );
    } catch (e) {
      logger.debug('LiveKit', '订阅参与者变动兼容事件失败', e);
    }
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
      } catch (e) {
        logger.debug('LiveKit', '轮询同步静音状态失败', e);
      }
    }, 2000);

    // 活跃说话人变化（更新声波）。speakers 数组同时含本地与远端参与者
    this.room.on(RoomEvent.ActiveSpeakersChanged, (...args: any[]) => {
      const room = this.room; // 局部捕获，避免闭包里 TS 判为 null
      if (!room) return;
      const speakers = (args[0] || []) as Participant[];
      const speakingIdentities = new Set(speakers.map((s: Participant) => s.identity));
      // 直接遍历 room 现有参与者，避免 getMembers() 每次重建数组
      room.remoteParticipants.forEach((p: any) => {
        this.callbacks.onSpeakingChange?.(p.identity, speakingIdentities.has(p.identity));
      });
      if (room.localParticipant) {
        this.callbacks.onSpeakingChange?.(
          room.localParticipant.identity,
          speakingIdentities.has(room.localParticipant.identity),
        );
      }
    });

    // 参与者 metadata 变化（换头像等）— 回调参数顺序：(metadata, participant)
    this.room.on(
      RoomEvent.ParticipantMetadataChanged,
      (metadata: string | undefined, participant: any) => {
        if (!participant) return;
        // 重新从 room 取 participant，确保拿到最新 metadata
        let latestMetadata = metadata || participant.metadata || '';
        try {
          const p =
            this.room?.remoteParticipants.get(participant.identity) ||
            (participant.identity === this.room?.localParticipant.identity
              ? this.room?.localParticipant
              : null);
          if (p?.metadata) latestMetadata = p.metadata;
        } catch (e) {
          logger.debug('LiveKit', '读取参与者元数据失败', e);
        }
        this.callbacks.onMetadataChanged?.(participant.identity, latestMetadata);
      },
    );

    this.room.on(RoomEvent.Disconnected, () => {
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
        } catch (e) {
          console.warn('[LiveKit] 音频 attach 失败:', e);
        }
        // 订阅到音频时同步一次静音状态（对方可能在订阅前就开/闭麦了）
        if (participant?.identity) {
          this.callbacks.onMemberMuteChange?.(
            participant.identity,
            !participant.isMicrophoneEnabled,
          );
        }
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (track.kind === 'audio') {
        try {
          track.detach().forEach((el: HTMLMediaElement) => el.remove());
        } catch (e) {
          logger.debug('LiveKit', '移除远端音频元素失败', e);
        }
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
