// 房间管理后端 API 封装（v2 安全版：JWT 会话鉴权）
const API_BASE = 'http://106.52.9.146:3001';

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  auth?: boolean;
}

function getSessionToken(): string | null {
  return localStorage.getItem('chat_session');
}

async function request(path: string, options: RequestOptions = {}) {
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
    }
    throw new Error(data.error || '请求失败');
  }
  return data;
}

export const roomApi = {
  // 注册
  register: (name: string, password: string) =>
    request('/api/auth/register', { method: 'POST', auth: false, body: { name, password } }),

  // 登录
  login: (name: string, password: string) =>
    request('/api/auth/login', { method: 'POST', auth: false, body: { name, password } }),

  // 当前用户信息
  getMe: () => request('/api/auth/me'),

  // 更新个人资料
  updateProfile: (data: { avatar?: string; age?: number; zodiac?: string; photos?: string[]; bio?: string }) =>
    request('/api/auth/profile', { method: 'PATCH', body: data }),
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

  // 麦位
  takeSeat: (roomId: string, index: number) =>
    request(`/api/rooms/${roomId}/seats/${index}/take`, { method: 'POST' }),
  leaveSeat: (roomId: string, index: number) =>
    request(`/api/rooms/${roomId}/seats/${index}/leave`, { method: 'POST' }),
};
