/** 语聊房公屏消息（渲染所需字段） */
export interface ChatMessageLike {
  id: string | number;
  type: string;
  content: string;
  senderIdentity?: string;
  senderName?: string;
  timestamp: number;
}
