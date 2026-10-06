/**
 * DakeMusic 聊天房后端
 * 作者：知之Dake
 * 文件：index.js
 * 描述：用户系统、房间管理、LiveKit语音、网页版托管
 */
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { AccessToken, RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import lockfile from 'proper-lockfile';
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ 配置 ============
const API_KEY = process.env.LK_API_KEY;
const API_SECRET = process.env.LK_API_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_HASH = process.env.ADMIN_HASH;
const SUPER_ADMIN_NAMES = (process.env.SUPER_ADMIN_NAMES || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const DATA_FILE = process.env.DATA_FILE || './rooms.json';
const DB_FILE = process.env.DB_FILE || './users.db';
const LK_WS_URL = process.env.LK_WS_URL;
const LK_HTTP_URL = process.env.LK_HTTP_URL;
const ROOM_EMPTY_TTL = Number(process.env.ROOM_EMPTY_TTL || 6 * 60 * 60 * 1000);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'app://.,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 3001);

for (const [k, v] of Object.entries({ API_KEY, API_SECRET, JWT_SECRET, ADMIN_HASH })) {
  if (!v) { console.error(`缺少环境变量 ${k}`); process.exit(1); }
}

const roomService = new RoomServiceClient(LK_HTTP_URL, API_KEY, API_SECRET);

// ============ 日志 ============
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    ...(process.env.LOG_FILE ? [new winston.transports.File({ filename: process.env.LOG_FILE })] : []),
  ],
});

// ============ SQLite 用户库 ============
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    age INTEGER DEFAULT 0,
    zodiac TEXT DEFAULT '',
    photos TEXT DEFAULT '[]',
    bio TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
`);

// 兼容旧库：自动加列
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('age')) db.exec('ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0');
if (!cols.includes('zodiac')) db.exec('ALTER TABLE users ADD COLUMN zodiac TEXT DEFAULT \'\'');
if (!cols.includes('photos')) db.exec('ALTER TABLE users ADD COLUMN photos TEXT DEFAULT \'[]\'');
if (!cols.includes('bio')) db.exec('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT \'\'');
if (!cols.includes('is_admin')) db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
if (!cols.includes('nickname')) {
  db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
  db.exec("UPDATE users SET nickname = name WHERE nickname IS NULL OR nickname = ''");
  logger.info('db.migrate', { added: 'nickname' });
}
if (!cols.includes('gender')) {
  db.exec('ALTER TABLE users ADD COLUMN gender TEXT DEFAULT \'\'');
}
if (!cols.includes('city')) {
  db.exec('ALTER TABLE users ADD COLUMN city TEXT DEFAULT \'\'');
}

// 启动时把 SUPER_ADMIN_NAMES 里的用户自动设为管理员
if (SUPER_ADMIN_NAMES.length) {
  const stmtSetAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE name = ?');
  for (const name of SUPER_ADMIN_NAMES) {
    const r = stmtSetAdmin.run(name);
    if (r.changes > 0) logger.info('admin.auto_grant', { name });
  }
}

const stmtFindUser = db.prepare('SELECT * FROM users WHERE name = ?');
const stmtFindUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtCreateUser = db.prepare('INSERT INTO users (name, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)');
const stmtUpdateProfile = db.prepare('UPDATE users SET avatar = ?, age = ?, zodiac = ?, photos = ?, bio = ?, nickname = ?, gender = ?, city = ? WHERE id = ?');
const stmtUpdateNickname = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');

// 显示名：优先昵称，没有则回退账号
const displayName = (u) => {
  if (!u) return '';
  const nick = (u.nickname || '').trim();
  return nick || u.name || '';
};

// 取当前登录用户的完整 DB 记录
function currentDbUser(req) {
  try {
    if (req.user?.userId) {
      const u = stmtFindUserById.get(req.user.userId);
      if (u) return u;
    }
    if (req.user?.name) return stmtFindUser.get(req.user.name) || null;
  } catch {}
  return null;
}

// ============ 房间存储（JSON 原子写） ============
let rooms = {};
const userCurrentRoom = new Map();
let writeChain = Promise.resolve();

async function loadRooms() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    rooms = JSON.parse(raw) || {};
  } catch (e) {
    if (e.code !== 'ENOENT') logger.warn('[store] loadRooms failed', { err: e.message });
    rooms = {};
  }
  for (const r of Object.values(rooms)) {
    r.participants = [];
    r.banned = Array.isArray(r.banned) ? [...new Set(r.banned)] : [];
  }
  saveRooms();
}

function saveRooms(next) {
  writeChain = writeChain.then(async () => {
    const release = await lockfile.lock(DATA_FILE, { retries: 5 }).catch(() => null);
    const tmp = DATA_FILE + '.tmp';
    try {
      await fs.writeFile(tmp, JSON.stringify(rooms, null, 2));
      await fs.rename(tmp, DATA_FILE);
      next?.();
    } finally { release?.(); }
  });
}

// ============ 工具 ============
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
const hmac = (secret, ...parts) => crypto.createHmac('sha256', secret).update(parts.join(':')).digest('hex');

function signSession(user) {
  return jwt.sign({ userId: user.id, name: user.name, role: 'member' }, JWT_SECRET, { expiresIn: '7d' });
}

// ============ 中间件 ============
const reqId = (req, res, next) => { req.id = crypto.randomBytes(6).toString('hex'); res.setHeader('X-Request-Id', req.id); next(); };
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: req => req.ip });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyGenerator: req => req.ip });
const apiLimiter = rateLimit({ windowMs: 60000, max: 60 });

function authSession(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'TOKEN_EXPIRED' }); }
}

function isSuperAdmin(user) {
  if (!user) return false;
  if (user.is_admin === 1 || user.is_admin === true) return true;
  if (user.userId) {
    try {
      const u = stmtFindUserById.get(user.userId);
      if (u?.is_admin) return true;
      if (u && SUPER_ADMIN_NAMES.includes(displayName(u))) return true;
    } catch {}
  }
  return SUPER_ADMIN_NAMES.includes(user.name);
}

function requireOwner(req, res, next) {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const isOwner = room.ownerUserId === req.user.userId ||
    (!room.ownerUserId && room.ownerName === req.user.name);
  if (!isOwner && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: '无权限' });
  }
  req.operator = req.user;
  req.room = room;
  next();
}

const logReq = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logger.info('request', { reqId: req.id, ip: req.ip, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, user: req.user?.name }));
  next();
};

// ============ App ============
const app = express();
app.set('trust proxy', 1);
app.use(reqId);
app.use(express.json({ limit: '20mb' }));
app.use(apiLimiter);
app.use(logReq);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS 拒绝'));
  },
  credentials: true,
}));

// ============ DakeMusic: 托管网页版静态文件 ============
app.use(express.static(path.join(__dirname, 'web')));

// ===== 健康检查 =====
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), users: db.prepare('SELECT COUNT(*) as c FROM users').get().c }));

// ===== 注册 =====
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, password, nickname } = req.body || {};
  const account = (name || '').trim();
  if (!account || !password) return res.status(400).json({ error: '账号和密码必填' });
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(account)) {
    return res.status(400).json({ error: '账号需字母开头，3-20位字母/数字/下划线' });
  }
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  if (stmtFindUser.get(account)) return res.status(409).json({ error: '账号已被注册' });
  const nick = (nickname || '').trim().slice(0, 20) || account;
  const hash = bcrypt.hashSync(password, 10);
  const info = stmtCreateUser.run(account, nick, hash, Date.now());
  const user = { id: info.lastInsertRowid, name: account };
  const token = signSession(user);
  logger.info('auth.register', { reqId: req.id, userId: user.id, account, nickname: nick });
  res.json({ token, userId: user.id, name: account, nickname: nick, isAdmin: false });
});

// ===== 登录 =====
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { name, password } = req.body || {};
  const input = (name || '').trim();
  if (!input || !password) return res.status(400).json({ error: '账号和密码必填' });
  let user = stmtFindUser.get(input);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logger.warn('auth.login_fail', { reqId: req.id, ip: req.ip, name: input });
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const token = signSession(user);
  logger.info('auth.login', { reqId: req.id, userId: user.id, name: user.name });
  res.json({
    token, userId: user.id,
    name: user.name,
    nickname: displayName(user),
    avatar: user.avatar || '',
    isAdmin: !!user.is_admin,
  });
});

// ===== 获取当前用户信息 =====
app.get('/api/auth/me', authSession, (req, res) => {
  const user = stmtFindUser.get(req.user.name);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    userId: user.id,
    name: user.name,
    nickname: displayName(user),
    avatar: user.avatar || '',
    age: user.age || 0,
    zodiac: user.zodiac || '',
    photos: safeJsonParse(user.photos, []),
    bio: user.bio || '',
    gender: user.gender || '',
    city: user.city || '',
    isAdmin: !!user.is_admin,
    createdAt: user.created_at,
  });
});

// ===== 修改密码 =====
app.post('/api/auth/change-password', authSession, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '旧密码和新密码不能为空' });
  if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  const user = stmtFindUser.get(req.user.name);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const ok = bcrypt.compareSync(oldPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: '旧密码错误' });
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  logger.info('auth.change_password', { reqId: req.id, userId: user.id });
  res.json({ ok: true });
});

// ===== 更新个人资料 =====
app.patch('/api/auth/profile', authSession, (req, res) => {
  const { avatar, age, zodiac, photos, bio, nickname, gender, city } = req.body || {};
  const user = stmtFindUser.get(req.user.name);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const oldNick = displayName(user);
  let newNick = oldNick;
  if (typeof nickname === 'string' && nickname.trim() && nickname.trim() !== oldNick) {
    newNick = nickname.trim().slice(0, 20);
    let roomChanged = false;
    for (const room of Object.values(rooms)) {
      let changed = false;
      for (const p of room.participants) {
        if (p.userId === user.id) { p.name = newNick; changed = true; }
      }
      if (room.ownerUserId === user.id) { room.ownerNickname = newNick; changed = true; }
      else if (!room.ownerUserId && room.ownerName === user.name) { room.ownerNickname = newNick; changed = true; }
      if (changed) { saveRooms(); roomChanged = true; }
    }
    stmtUpdateNickname.run(newNick, user.id);
    logger.info('auth.nickname_update', { reqId: req.id, userId: user.id, from: oldNick, to: newNick, roomChanged });
  }

  const newAvatar = typeof avatar === 'string' ? avatar.slice(0, 3000000) : user.avatar;
  const newAge = Number.isInteger(age) && age >= 0 && age <= 120 ? age : user.age;
  const newZodiac = typeof zodiac === 'string' ? zodiac.slice(0, 10) : user.zodiac;
  const newBio = typeof bio === 'string' ? bio.slice(0, 200) : user.bio;
  const newGender = typeof gender === 'string' ? gender.slice(0, 10) : user.gender;
  const newCity = typeof city === 'string' ? city.slice(0, 50) : user.city;

  let newPhotos = user.photos;
  if (Array.isArray(photos)) {
    const limited = photos.slice(0, 9).map(p => typeof p === 'string' ? p.slice(0, 3000000) : '').filter(Boolean);
    newPhotos = JSON.stringify(limited);
  }

  stmtUpdateProfile.run(newAvatar, newAge, newZodiac, newPhotos, newBio, newNick, newGender, newCity, user.id);
  logger.info('auth.profile_update', { reqId: req.id, userId: user.id });
  res.json({ ok: true, name: user.name, nickname: newNick });
});

// ===== 查看他人资料 =====
app.get('/api/users/:id', (req, res) => {
  const user = stmtFindUserById.get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    userId: user.id,
    name: user.name,
    nickname: displayName(user),
    avatar: user.avatar || '',
    age: user.age || 0,
    zodiac: user.zodiac || '',
    photos: safeJsonParse(user.photos, []),
    bio: user.bio || '',
    gender: user.gender || '',
    city: user.city || '',
  });
});

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ===== 创建房间 =====
app.post('/api/rooms', authSession, (req, res) => {
  const { name, description, password = '', coverImage = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '房间名不能为空' });
  const me = currentDbUser(req);
  const ownerNick = displayName(me) || req.user.name;
  const id = uid('room');
  rooms[id] = {
    id, name: name.trim(), description: description || '',
    coverImage: typeof coverImage === 'string' ? coverImage.slice(0, 3000000) : '',
    ownerUserId: req.user.userId,
    ownerName: req.user.name,
    ownerNickname: ownerNick,
    createdAt: Date.now(),
    participants: [], banned: [],
    password,
  };
  saveRooms(() => logger.info('room.create', { reqId: req.id, roomId: id, owner: ownerNick }));
  res.json({ id, name: rooms[id].name, isOwner: true });
});

// ===== 房间列表 =====
app.get('/api/rooms', (req, res) => {
  cleanupDuplicateParticipants();
  let currentUserId = null;
  let currentUserName = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
      currentUserId = decoded.userId;
      currentUserName = decoded.name;
    } catch {}
  }
  const list = Object.values(rooms)
    .map(r => ({
      id: r.id, name: r.name, description: r.description,
      coverImage: r.coverImage || '',
      participantCount: r.participants.length,
      ownerName: r.ownerName,
      ownerNickname: r.ownerNickname || r.ownerName || '',
      ownerUserId: r.ownerUserId,
      isOwner: r.ownerUserId === currentUserId ||
        (!r.ownerUserId && r.ownerName === currentUserName),
      isSuperAdmin: isSuperAdmin({ userId: currentUserId, name: currentUserName }),
      hasPassword: !!r.password,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ list, total: list.length });
});

// ===== 获取单个房间信息 =====
app.get('/api/rooms/:id', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  res.json({
    id: room.id,
    name: room.name,
    description: room.description || '',
    coverImage: room.coverImage || '',
    ownerName: room.ownerName || '',
    ownerNickname: room.ownerNickname || room.ownerName || '',
    ownerUserId: room.ownerUserId,
    participantCount: room.participants.length,
    hasPassword: !!room.password,
    createdAt: room.createdAt,
  });
});

// ===== 加入房间 =====
app.post('/api/rooms/:id/join', authSession, async (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });

  const identity = `user_${req.user.userId}`;

  let otherRoomChanged = false;
  for (const rid of Object.keys(rooms)) {
    if (rid === room.id) continue;
    const other = rooms[rid];
    const before = other.participants.length;
    const oldInOther = other.participants.find(p => p.userId === req.user.userId);
    if (oldInOther) {
      try { await roomService.removeParticipant(other.id, oldInOther.identity); } catch {}
    }
    other.participants = other.participants.filter(p => p.userId !== req.user.userId);
    if (other.participants.length !== before) otherRoomChanged = true;
  }
  if (otherRoomChanged) saveRooms();

  const isBanned = room.banned.some(b => b.startsWith(`user_${req.user.userId}`));
  if (isBanned) return res.status(403).json({ error: 'BANNED' });
  if (room.password && room.password !== req.body?.password) return res.status(403).json({ error: '密码错误' });

  const oldParticipants = room.participants.filter(p => p.userId === req.user.userId && p.identity !== identity);
  for (const old of oldParticipants) {
    try { await roomService.removeParticipant(room.id, old.identity); } catch {}
  }
  room.participants = room.participants.filter(p => p.userId !== req.user.userId);

  const me = currentDbUser(req);
  const myNick = displayName(me) || req.user.name;
  const myAccount = me?.name || req.user.name;
  const isOwner = room.ownerUserId === req.user.userId ||
    (!room.ownerUserId && (room.ownerName === req.user.name || room.ownerNickname === myNick));
  const superAdmin = isSuperAdmin(req.user);

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity, name: myNick, ttl: '2h',
    metadata: JSON.stringify({ account: myAccount, userId: req.user.userId, nickname: myNick }),
  });
  at.addGrant({ room: room.id, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  if (isBanned) {
    at.addGrant({ canPublish: false, canPublishData: false });
  }

  room.participants.push({ identity, name: myNick, account: myAccount, userId: req.user.userId, joinedAt: Date.now() });
  userCurrentRoom.set(req.user.userId, room.id);
  saveRooms();

  broadcastSystem(room, { type: 'join', targetName: myNick }).catch(() => {});
  const sessionToken = jwt.sign({ userId: req.user.userId, identity, roomId: room.id, role: isOwner ? 'owner' : 'member' }, JWT_SECRET, { expiresIn: '2h' });
  logger.info('room.join', { reqId: req.id, roomId: room.id, user: myNick, isOwner });
  res.json({
    token: await at.toJwt(),
    roomId: room.id,
    name: room.name,
    description: room.description || '',
    coverImage: room.coverImage || '',
    ownerName: room.ownerName || '',
    ownerNickname: room.ownerNickname || room.ownerName || '',
    identity,
    isOwner: isOwner || superAdmin,
    isSuperAdmin: superAdmin,
    wsUrl: LK_WS_URL,
    sessionToken,
  });
});

// ===== 离开 =====
app.post('/api/rooms/:id/leave', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const before = room.participants.length;
  const wasInRoom = room.participants.some(p => p.userId === req.user.userId);
  const me = currentDbUser(req);
  const myNick = displayName(me) || req.user.name;
  room.participants = room.participants.filter(p => p.userId !== req.user.userId);
  if (room.participants.length !== before) saveRooms();
  userCurrentRoom.delete(req.user.userId);
  if (wasInRoom) broadcastSystem(room, { type: 'leave', targetName: myNick }).catch(() => {});
  res.json({ ok: true, participantCount: room.participants.length });
});

// ===== 踢人 =====
app.post('/api/rooms/:id/kick', authSession, requireOwner, async (req, res) => {
  const { targetIdentity } = req.body || {};
  if (!targetIdentity) return res.status(400).json({ error: 'targetIdentity 必填' });
  const room = req.room;
  const target = room.participants.find(p => p.identity === targetIdentity);
  if (!target) return res.status(404).json({ error: '用户不在房间' });
  if (target.userId === room.ownerUserId) return res.status(400).json({ error: '不能踢出房主' });
  room.participants = room.participants.filter(p => p.identity !== targetIdentity);
  room.banned = [...new Set([...room.banned, targetIdentity])];
  try { await roomService.removeParticipant(room.id, targetIdentity); } catch (e) { logger.warn('kick failed', { err: e.message }); }
  await broadcastSystem(room, { type: 'kick', targetName: target.name, operator: displayName(currentDbUser(req)) || req.user.name });
  saveRooms(() => logger.info('room.kick', { reqId: req.id, roomId: room.id, target: target.name }));
  res.json({ ok: true });
});

// ===== 禁言 =====
app.post('/api/rooms/:id/ban', authSession, requireOwner, async (req, res) => {
  const { targetIdentity, banned: shouldBan } = req.body || {};
  if (!targetIdentity) return res.status(400).json({ error: 'targetIdentity 必填' });
  const room = req.room;
  const target = room.participants.find(p => p.identity === targetIdentity);
  if (!target) return res.status(404).json({ error: '用户不在房间' });
  if (shouldBan) {
    room.banned = [...new Set([...room.banned, targetIdentity])];
    try { await roomService.updateParticipant(room.id, targetIdentity, { permission: { canPublish: false, canPublishData: false, canSubscribe: true } }); } catch (e) { logger.warn('ban failed', { err: e.message }); }
  } else {
    room.banned = room.banned.filter(b => b !== targetIdentity);
    try { await roomService.updateParticipant(room.id, targetIdentity, { permission: { canPublish: true, canPublishData: true, canSubscribe: true } }); } catch (e) { logger.warn('unban failed', { err: e.message }); }
  }
  await broadcastSystem(room, { type: shouldBan ? 'mute' : 'unmute', targetName: target.name, operator: displayName(currentDbUser(req)) || req.user.name });
  saveRooms(() => logger.info('room.ban', { reqId: req.id, roomId: room.id, target: target.name, banned: shouldBan }));
  res.json({ ok: true });
});

// ===== 更新房间 =====
app.patch('/api/rooms/:id', authSession, requireOwner, (req, res) => {
  const { name, description, coverImage } = req.body || {};
  const room = req.room;
  if (name?.trim()) room.name = name.trim();
  if (typeof description === 'string') room.description = description;
  if (typeof coverImage === 'string') room.coverImage = coverImage.slice(0, 3000000);
  saveRooms();
  res.json({ ok: true, name: room.name });
});

// ===== 删除房间 =====
app.delete('/api/rooms/:id', authSession, requireOwner, (req, res) => {
  const room = req.room;
  try {
    for (const p of room.participants) {
      roomService.removeParticipant(room.id, p.identity).catch(() => {});
    }
  } catch {}
  delete rooms[room.id];
  saveRooms();
  logger.info('room.delete', { reqId: req.id, roomId: room.id, owner: req.user.name });
  res.json({ ok: true });
});

// ===== 系统消息 HMAC =====
async function broadcastSystem(room, payload) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const msg = {
    type: 'system', id: `sys_${ts}_${nonce}`, ts, nonce,
    senderIdentity: 'system', senderName: '系统',
    sig: hmac(JWT_SECRET, room.id, String(ts), nonce, JSON.stringify(payload)),
    payload, content: formatSystemText(payload),
  };
  try { await roomService.sendData(room.id, Buffer.from(JSON.stringify(msg)), { kind: DataPacket_Kind.RELIABLE, topic: 'chat' }); } catch (e) { logger.warn('broadcast failed', { err: e.message }); }
}

function formatSystemText(p) {
  const op = p.operator || '管理员';
  if (p.type === 'join') return `"${p.targetName}" 加入了房间`;
  if (p.type === 'leave') return `"${p.targetName}" 离开了房间`;
  if (p.type === 'kick') return `"${p.targetName}" 已被 ${op} 移出房间`;
  if (p.type === 'mute') return `"${p.targetName}" 已被 ${op} 禁言`;
  if (p.type === 'unmute') return `"${p.targetName}" 已被 ${op} 解除禁言`;
  if (p.type === 'mic_muted') return `"${p.targetName}" 的麦克风已被 ${op} 关闭`;
  if (p.type === 'mic_unmuted') return `"${p.targetName}" 的麦克风已被 ${op} 开启`;
  return '';
}

// ===== 管理员 =====
app.post('/api/admin/login', adminLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || !bcrypt.compareSync(password, ADMIN_HASH)) {
    logger.warn('admin_auth_fail', { reqId: req.id, ip: req.ip });
    return res.status(403).json({ error: '密码错误' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const { role } = jwt.verify(token, JWT_SECRET);
    if (role !== 'admin') return res.status(403).json({ error: '无权限' });
    next();
  } catch { res.status(401).json({ error: 'TOKEN_EXPIRED' }); }
}

app.delete('/api/admin/rooms/:id', adminLimiter, requireAdmin, async (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  try { await roomService.deleteRoom(room.id); } catch (e) { logger.warn('admin.deleteRoom failed', { err: e.message }); }
  delete rooms[req.params.id];
  saveRooms(() => logger.warn('admin.delete_room', { reqId: req.id, roomId: req.params.id, name: room.name }));
  res.json({ ok: true });
});

// ===== 404/500 =====
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
app.use((err, req, res, _next) => {
  logger.error('request_error', { reqId: req.id, err: err.message });
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// ============ 启动 ============
await loadRooms();
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('server_start', { port: PORT, roomCount: Object.keys(rooms).length, userCount: db.prepare('SELECT COUNT(*) as c FROM users').get().c });
});

// 清理多房间重复用户
function cleanupDuplicateParticipants() {
  const userLatestRoom = new Map();
  for (const room of Object.values(rooms)) {
    for (const p of room.participants) {
      const cur = userLatestRoom.get(p.userId);
      if (!cur || p.joinedAt > cur.joinedAt) {
        userLatestRoom.set(p.userId, { roomId: room.id, joinedAt: p.joinedAt, identity: p.identity });
      }
    }
  }
  let changed = false;
  for (const room of Object.values(rooms)) {
    const toRemove = room.participants.filter(p => {
      const latest = userLatestRoom.get(p.userId);
      return latest && latest.roomId !== room.id;
    });
    for (const p of toRemove) {
      try { roomService.removeParticipant(room.id, p.identity); } catch {}
      logger.info('multiroom_cleanup', { user: p.name, roomId: room.id });
    }
    if (toRemove.length) {
      room.participants = room.participants.filter(p => !toRemove.includes(p));
      changed = true;
    }
  }
  if (changed) saveRooms();
}

setInterval(cleanupDuplicateParticipants, 15000);

// 僵尸房清理
const ttlTimer = setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, room] of Object.entries(rooms)) {
    if (room.participants.length === 0 && now - room.createdAt > ROOM_EMPTY_TTL) {
      delete rooms[id];
      try { roomService.deleteRoom(id).catch(() => {}); } catch {}
      changed = true;
      logger.info('room.ttl_destroy', { roomId: id });
    }
  }
  if (changed) saveRooms();
}, 5 * 60 * 1000);

function shutdown(sig) {
  logger.info('shutdown', { signal: sig });
  clearInterval(ttlTimer);
  server.close(() => { saveRooms(() => { logger.info('shutdown_complete'); process.exit(0); }); });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => logger.error('uncaughtException', { err: e.message, stack: e.stack }));
