/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：roomApi.ts
 * 描述：房间管理后端 API 封装 - JWT 会话鉴权 + 内存缓存
 */
import { DAKE_API_BASE_URL } from '../../shared/endpoints';
import { CLIENT_BUILD_HEADER, getClientBuildTag } from '../../shared/buildInfo';

const API_BASE = DAKE_API_BASE_URL;

// DakeMusic: 简单内存缓存
const cache = new Map<string, { data: any; expire: number }>();
const CACHE_DURATION = 30 * 1000; // 30秒缓存

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  auth?: boolean;
  cache?: boolean; // 是否缓存 GET 请求
}

function getSessionToken(): string | null {
  return localStorage.getItem('chat_session');
}

async function request(path: string, options: RequestOptions = {}) {
  // DakeMusic: GET 请求加缓存（cache: false 可跳过，用于增删后必须拿到最新数据的场景）
  const useCache = (!options.method || options.method === 'GET') && options.cache !== false;
  const cacheKey = path;
  if (useCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expire > Date.now()) {
      return cached.data;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // 构建标识：服务端据此区分官方构建与改包（观察期只记录）
    [CLIENT_BUILD_HEADER]: getClientBuildTag(),
    ...(options.headers || {}),
  };
  if (options.auth !== false) {
    const token = getSessionToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    method: options.method,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // 后端返回了非 JSON（比如 Nginx 限流 "Too many requests"、502 等）
    throw new Error(`服务器错误 (${res.status}): ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    // DakeMusic: 会话失效（token 过期 / 未带 token）统一清除本地登录态，避免残留无效会话
    if (res.status === 401 && (data.error === 'TOKEN_EXPIRED' || data.error === 'UNAUTHORIZED')) {
      localStorage.removeItem('chat_session');
      // 401 时清空缓存
      cache.clear();
    }
    throw new Error(data.error || '请求失败');
  }

  // DakeMusic: GET 请求写入缓存
  if (useCache) {
    cache.set(cacheKey, { data, expire: Date.now() + CACHE_DURATION });
  }

  return data;
}

// DakeMusic: 手动清除缓存（更新资料后调用）
export function clearApiCache() {
  cache.clear();
}

export const roomApi = {
  // 注册
  /** 注册：name=账号（登录用，唯一、不可改），nickname=昵称（显示用，可重复、可改） */
  register: (name: string, password: string, nickname?: string) =>
    request('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: { name, password, nickname: nickname || '' },
    }),

  // 登录
  /** 登录：账号优先；昵称唯一时也能登（后端兜底） */
  login: (name: string, password: string) =>
    request('/api/auth/login', { method: 'POST', auth: false, body: { name, password } }),

  // DakeMusic: peiwan 陪玩平台账号密码登录
  peiwanLogin: (account: string, password: string) =>
    request('/api/auth/peiwan-login', { method: 'POST', auth: false, body: { account, password } }),

  // 当前用户信息
  getMe: () => request('/api/auth/me'),

  // 更新个人资料
  /** 只改昵称等资料；账号 name 后端不接受修改 */
  // DakeMusic: 加上 city, gender
  updateProfile: async (data: {
    nickname?: string;
    avatar?: string;
    age?: number;
    zodiac?: string;
    photos?: string[];
    bio?: string;
    city?: string;
    gender?: string;
  }) => {
    const result = await request('/api/auth/profile', { method: 'PATCH', body: data });
    // 更新资料后清除缓存
    cache.clear();
    return result;
  },
  // 修改密码
  changePassword: (oldPassword: string, newPassword: string) =>
    request('/api/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } }),

  // 查看他人资料
  getUser: (userId: number) => request(`/api/users/${userId}`, { auth: false }),

  health: () => request('/api/health', { auth: false }),

  createRoom: (name: string, password?: string, coverImage?: string) =>
    request('/api/rooms', { method: 'POST', body: { name, password, coverImage, isPublic: true } }),

  getRooms: () => request('/api/rooms'),

  getRoom: (roomId: string) => request(`/api/rooms/${roomId}`),

  joinRoom: (roomId: string, password?: string) =>
    request(`/api/rooms/${roomId}/join`, { method: 'POST', body: { password } }),

  leaveRoom: (roomId: string) => request(`/api/rooms/${roomId}/leave`, { method: 'POST' }),

  // DakeMusic: 房间聊天历史（进房时补齐之前的文字/系统消息）
  getMessages: (roomId: string, limit = 50) =>
    request(`/api/rooms/${roomId}/messages?limit=${limit}`, { auth: false, cache: false }),
  /** 只持久化聊天，不重复广播（实时消息已通过 LiveKit 发出） */
  saveMessage: (roomId: string, content: string) =>
    request(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      body: { content, silent: true },
    }),

  kickParticipant: (roomId: string, targetIdentity: string) =>
    request(`/api/rooms/${roomId}/kick`, { method: 'POST', body: { targetIdentity } }),

  muteParticipant: (roomId: string, targetIdentity: string, muted: boolean) =>
    request(`/api/rooms/${roomId}/mute`, { method: 'POST', body: { targetIdentity, muted } }),

  banParticipant: (roomId: string, targetIdentity: string, banned: boolean) =>
    request(`/api/rooms/${roomId}/ban`, { method: 'POST', body: { targetIdentity, banned } }),

  updateRoom: (
    roomId: string,
    name?: string,
    description?: string,
    coverImage?: string,
    remove?: boolean,
    seatMode?: 'normal' | 'duet',
  ) =>
    request(`/api/rooms/${roomId}`, {
      method: remove ? 'DELETE' : 'PATCH',
      body: { name, description, coverImage, seatMode },
    }),

  // 超级管理员：用户管理
  listAdminUsers: () => request('/api/admin/users'),
  grantAdmin: (userId: number) => request(`/api/admin/users/${userId}`, { method: 'POST' }),
  revokeAdmin: (userId: number) => request(`/api/admin/users/${userId}`, { method: 'DELETE' }),

  // DakeMusic: 根超管任免超管（仅环境变量里的根超管可调用）
  setSuperAdmin: (userId: number, isAdmin: boolean) =>
    request(`/api/users/${userId}/super-admin`, { method: 'POST', body: { isAdmin } }),

  // ===== DakeMusic: 房间点歌台 =====
  /** 点歌进队列（任何人，免审核，每人最多3首） */
  requestSong: (
    roomId: string,
    song: {
      songId?: string | number;
      title: string;
      artist?: string;
      cover?: string;
      url: string;
      duration?: number;
      songData?: unknown;
    },
  ) => request(`/api/rooms/${roomId}/request-song`, { method: 'POST', body: song }),
  /** 拉取队列与当前播放（队列变化频繁，禁用 30 秒 GET 缓存） */
  getQueue: (roomId: string) => request(`/api/rooms/${roomId}/queue`, { cache: false }),
  /** DJ 切到下一首（房主/麦上人） */
  nextSong: (roomId: string) => request(`/api/rooms/${roomId}/queue/next`, { method: 'POST' }),
  /** 删除队列中的歌（DJ删任意，普通用户删自己的） */
  removeSong: (roomId: string, index: number) =>
    request(`/api/rooms/${roomId}/queue/${index}`, { method: 'DELETE' }),

  // ===== DakeMusic: 全站违禁词（增删由服务端校验超管身份） =====
  getBadWords: () => request('/api/bad-words', { auth: false, cache: false }),
  addBadWord: (word: string) => request('/api/bad-words/add', { method: 'POST', body: { word } }),
  deleteBadWord: (word: string) =>
    request('/api/bad-words/delete', { method: 'POST', body: { word } }),
};
