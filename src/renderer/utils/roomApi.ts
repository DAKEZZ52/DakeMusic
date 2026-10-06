/**
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：roomApi.ts
 * 描述：房间管理后端 API 封装 - JWT 会话鉴权 + 内存缓存
 */
const API_BASE = 'http://106.52.9.146:3001';

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
  // DakeMusic: GET 请求加缓存
  const cacheKey = path;
  if (!options.method || options.method === 'GET') {
    const cached = cache.get(cacheKey);
    if (cached && cached.expire > Date.now()) {
      return cached.data;
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.auth !== false) {
    const token = getSessionToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    method: options.method,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && data.error === 'TOKEN_EXPIRED') {
      localStorage.removeItem('chat_session');
      // 401 时清空缓存
      cache.clear();
    }
    throw new Error(data.error || '请求失败');
  }

  // DakeMusic: GET 请求写入缓存
  if (!options.method || options.method === 'GET') {
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
    request('/api/auth/register', { method: 'POST', auth: false, body: { name, password, nickname: nickname || '' } }),

  // 登录
  /** 登录：账号优先；昵称唯一时也能登（后端兜底） */
  login: (name: string, password: string) =>
    request('/api/auth/login', { method: 'POST', auth: false, body: { name, password } }),

  // 当前用户信息
  getMe: () => request('/api/auth/me'),

  // 更新个人资料
  /** 只改昵称等资料；账号 name 后端不接受修改 */
  // DakeMusic: 加上 city, gender
  updateProfile: async (data: { nickname?: string; avatar?: string; age?: number; zodiac?: string; photos?: string[]; bio?: string; city?: string; gender?: string }) => {
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

  leaveRoom: (roomId: string) =>
    request(`/api/rooms/${roomId}/leave`, { method: 'POST' }),

  kickParticipant: (roomId: string, targetIdentity: string) =>
    request(`/api/rooms/${roomId}/kick`, { method: 'POST', body: { targetIdentity } }),

  muteParticipant: (roomId: string, targetIdentity: string, muted: boolean) =>
    request(`/api/rooms/${roomId}/mute`, { method: 'POST', body: { targetIdentity, muted } }),

  banParticipant: (roomId: string, targetIdentity: string, banned: boolean) =>
    request(`/api/rooms/${roomId}/ban`, { method: 'POST', body: { targetIdentity, banned } }),

  updateRoom: (roomId: string, name?: string, description?: string, coverImage?: string, remove?: boolean) =>
    request(`/api/rooms/${roomId}`, { method: remove ? 'DELETE' : 'PATCH', body: { name, description, coverImage } }),

  adminLogin: (password: string) =>
    request('/api/admin/login', { method: 'POST', auth: false, body: { password } }),

  adminDeleteRoom: (roomId: string, adminToken: string) =>
    request(`/api/admin/rooms/${roomId}`, {
      method: 'DELETE',
      auth: false,
      headers: { Authorization: `Bearer ${adminToken}` },
    }),

  // 超级管理员：用户管理
  listAdminUsers: () => request('/api/admin/users'),
  grantAdmin: (userId: number) => request(`/api/admin/users/${userId}`, { method: 'POST' }),
  revokeAdmin: (userId: number) => request(`/api/admin/users/${userId}`, { method: 'DELETE' }),
};
