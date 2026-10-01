// 房间管理后端 API 封装
const API_BASE = 'http://106.52.9.146:3001';

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
}

async function request(path: string, options: RequestOptions = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export const roomApi = {
  createRoom: (name: string, creatorName: string, creatorPassword?: string, roomPassword?: string) =>
    request('/api/rooms', { method: 'POST', body: { name, creatorName, creatorPassword, roomPassword } }),

  getRooms: () => request('/api/rooms'),

  joinRoom: (roomId: string, userName: string, password?: string) =>
    request(`/api/rooms/${roomId}/join`, { method: 'POST', body: { userName, password } }),

  ownerJoinRoom: (roomId: string, password: string) =>
    request(`/api/rooms/${roomId}/owner-join`, { method: 'POST', body: { password } }),

  leaveRoom: (roomId: string, identity: string) =>
    request(`/api/rooms/${roomId}/leave`, { method: 'POST', body: { identity } }),

  kickParticipant: (roomId: string, targetIdentity: string, ownerIdentity: string) =>
    request(`/api/rooms/${roomId}/kick`, { method: 'POST', body: { targetIdentity, ownerIdentity } }),

  muteParticipant: (roomId: string, targetIdentity: string, muted: boolean, ownerIdentity: string) =>
    request(`/api/rooms/${roomId}/mute`, { method: 'POST', body: { targetIdentity, muted, ownerIdentity } }),

  banParticipant: (roomId: string, targetIdentity: string, banned: boolean, ownerIdentity: string) =>
    request(`/api/rooms/${roomId}/ban`, { method: 'POST', body: { targetIdentity, banned, ownerIdentity } }),

  updateRoom: (roomId: string, name: string, auth: Record<string, unknown>) =>
    request(`/api/rooms/${roomId}`, { method: 'PUT', body: { name, ...auth } }),

  deleteRoom: (roomId: string, ownerIdentity: string) =>
    request(`/api/rooms/${roomId}`, { method: 'DELETE', body: { ownerIdentity } }),

  adminVerify: (password: string) =>
    request('/api/admin/verify', { method: 'POST', body: { password } }),

  adminDeleteRoom: (roomId: string, password: string) =>
    request(`/api/admin/rooms/${roomId}`, { method: 'DELETE', body: { password } }),
};
