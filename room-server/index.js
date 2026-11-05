/**
 * DakeMusic 聊天房后端
 * 作者：知之Dake
 * 文件：index.js
 * 描述：用户系统、房间管理、LiveKit语音、网页版托管 + 房间消息/麦位/WebSocket
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
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import adminRouter, { initAdmin } from './admin.js';

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
const PEIWAN_API_BASE = (process.env.PEIWAN_API_BASE || '').replace(/\/$/, '');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || [
  'app://.',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://localhost',
  'capacitor://localhost',
  'https://dkyy.top',
  'https://www.dkyy.top',
].join(','))
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

// DakeMusic: 违禁词表
db.exec(`CREATE TABLE IF NOT EXISTS bad_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
)`);

// === 房间消息表 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS room_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT,
    user_avatar TEXT,
    content TEXT NOT NULL,
    is_system INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room ON room_messages(room_id, created_at);
`);

// === 房间麦位表 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS room_seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    seat_index INTEGER NOT NULL,
    user_id INTEGER,
    user_name TEXT,
    user_avatar TEXT,
    is_muted INTEGER DEFAULT 0,
    is_speaking INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    UNIQUE(room_id, seat_index)
  );
  CREATE INDEX IF NOT EXISTS idx_seats_room ON room_seats(room_id);
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
if (!cols.includes('peiwan_uid')) {
  db.exec('ALTER TABLE users ADD COLUMN peiwan_uid INTEGER DEFAULT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_peiwan ON users(peiwan_uid) WHERE peiwan_uid IS NOT NULL');
  logger.info('db.migrate', { added: 'peiwan_uid' });
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
const stmtFindByPeiwan = db.prepare('SELECT * FROM users WHERE peiwan_uid = ?');
const stmtUpsertPeiwan = db.prepare('INSERT INTO users (name, nickname, avatar, peiwan_uid, password_hash, created_at) VALUES (?, ?, ?, ?, \'peiwan\', ?)');
const stmtSyncPeiwanProfile = db.prepare('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?');
const stmtCreateUser = db.prepare('INSERT INTO users (name, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)');
const stmtUpdateProfile = db.prepare('UPDATE users SET avatar = ?, age = ?, zodiac = ?, photos = ?, bio = ?, nickname = ?, gender = ?, city = ? WHERE id = ?');
const stmtUpdateNickname = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');

// 消息 / 麦位 prepared statements
const stmtInsertMessage = db.prepare('INSERT INTO room_messages (room_id, user_id, user_name, user_avatar, content, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtGetMessages = db.prepare('SELECT * FROM room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?');
const stmtGetMessagesAfter = db.prepare('SELECT * FROM room_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?');
const stmtDeleteRoomMessages = db.prepare('DELETE FROM room_messages WHERE room_id = ?');
const stmtInsertSeat = db.prepare('INSERT OR REPLACE INTO room_seats (room_id, seat_index, user_id, user_name, user_avatar, is_muted, is_speaking, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const stmtGetSeats = db.prepare('SELECT * FROM room_seats WHERE room_id = ? ORDER BY seat_index ASC');
const stmtDeleteRoomSeats = db.prepare('DELETE FROM room_seats WHERE room_id = ?');
const stmtFindSeatByUser = db.prepare('SELECT * FROM room_seats WHERE room_id = ? AND user_id = ?');
const stmtUpdateSeatMute = db.prepare('UPDATE room_seats SET is_muted = ?, updated_at = ? WHERE room_id = ? AND seat_index = ?');

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
  } catch (e) {
    logger.warn('current_db_user_failed', { error: e?.message || String(e) });
  }
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

// ============ WebSocket 管理 ============
const wssClients = new Map(); // ws -> { userId, roomId, userName }
const roomWsClients = new Map(); // roomId -> Set(ws)

function wsJoinRoom(ws, roomId) {
  if (!roomWsClients.has(roomId)) roomWsClients.set(roomId, new Set());
  roomWsClients.get(roomId).add(ws);
}

function wsLeaveRoom(ws, roomId) {
  const set = roomWsClients.get(roomId);
  if (set) { set.delete(ws); if (!set.size) roomWsClients.delete(roomId); }
}

function wsBroadcast(roomId, payload, excludeWs = null) {
  const set = roomWsClients.get(roomId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws === excludeWs) continue;
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch (e) { logger.warn('ws.send failed', { err: e.message }); }
    }
  }
}

// 同时广播到 LiveKit DataPacket（兼容网页版）
async function broadcastToRoom(room, payload, excludeWs = null) {
  wsBroadcast(room.id, payload, excludeWs);
  // LiveKit broadcast for web clients
  if (room && room.id) {
    try {
      const msg = {
        type: payload.type === 'system' ? 'system' : 'chat',
        id: `ws_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        ts: Date.now(),
        senderIdentity: payload.userId ? `user_${payload.userId}` : 'system',
        senderName: payload.userName || '系统',
        payload,
        content: payload.content || payload.text || '',
      };
      await roomService.sendData(room.id, Buffer.from(JSON.stringify(msg)), DataPacket_Kind.RELIABLE, { topic: 'chat' });
    } catch (e) { logger.warn('lk broadcast failed', { err: e.message }); }
  }
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
// 聊天发消息：按登录用户限流（10 秒 20 条），比全局 IP 限流更精准，也不影响同 IP 的其他用户
const chatLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20,
  keyGenerator: req => String(req.user?.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

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
      if (u && SUPER_ADMIN_NAMES.includes(u.name)) return true;
    } catch (e) {
      logger.warn('admin_lookup_failed', { error: e?.message || String(e) });
    }
  }
  return SUPER_ADMIN_NAMES.includes(user.name);
}

function isRootSuperAccount(name) {
  return !!name && SUPER_ADMIN_NAMES.includes(name);
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

// ===== DakeMusic: 客户端构建标识（观察期只记录，不拒绝） =====
// 官方构建会带 X-Dake-Build: v=2.4.7;b=20261106T1200;ch=release
// 缺失或格式不对的请求先只记日志，用来观察真实用户里有多少是非官方构建。
const clientBuildSeen = new Map();
function noteClientBuild(req, tag) {
  const present = typeof tag === 'string' && /^v=[^;]+;b=[^;]+;ch=(release|beta|dev)$/.test(tag);
  const key = (present ? 'present' : 'missing') + '|' + (req.baseUrl || '') + req.path;
  const now = Date.now();
  if (now - (clientBuildSeen.get(key) || 0) < 60_000) return;
  clientBuildSeen.set(key, now);
  logger.info(present ? 'client_build_present' : 'client_build_missing', {
    reqId: req.id,
    path: req.path,
    ip: req.headers['x-real-ip'] || req.ip,
    build: typeof tag === 'string' ? tag.slice(0, 60) : null,
    ua: String(req.headers['user-agent'] || '').slice(0, 60),
  });
}

app.use((req, _res, next) => {
  const tag = req.headers['x-dake-build'];
  req.clientBuild = typeof tag === 'string' ? tag : '';
  req.clientBuildValid = /^v=[^;]+;b=[^;]+;ch=(release|beta|dev)$/.test(req.clientBuild);
  noteClientBuild(req, tag);
  next();
});

// DakeMusic: 管理后台（同源访问，不走 CORS）
initAdmin({ db, rooms: () => rooms, jwtSecret: JWT_SECRET });
app.use('/admin', adminRouter);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS 拒绝'));
  },
  credentials: true,
}));

// ============ DakeMusic: 托管网页版静态文件（已关闭） ============
// app.use(express.static(path.join(__dirname, 'web')));

// ===== 健康检查 =====
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), users: db.prepare('SELECT COUNT(*) as c FROM users').get().c }));

// ===== DakeMusic: 公开违禁词列表（前端发消息时过滤） =====
app.get('/api/bad-words', (req, res) => {
  const rows = db.prepare('SELECT word FROM bad_words ORDER BY id DESC').all();
  res.json({ words: rows.map(r => r.word) });
});

// DakeMusic: 违禁词增删必须服务端鉴权（列表是全站共享的，客户端隐藏按钮不构成权限控制）
function requireBadWordAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role === 'admin' || isSuperAdmin(payload)) return next();
    return res.status(403).json({ error: 'FORBIDDEN' });
  } catch { return res.status(401).json({ error: 'TOKEN_EXPIRED' }); }
}

app.post('/api/bad-words/add', requireBadWordAdmin, (req, res) => {
  const { word } = req.body || {};
  if (!word || !word.trim()) return res.status(400).json({ error: '请输入违禁词' });
  try {
    db.prepare('INSERT INTO bad_words (word, created_at) VALUES (?, ?)').run(word.trim(), Date.now());
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});
app.post('/api/bad-words/delete', requireBadWordAdmin, (req, res) => {
  const { word } = req.body || {};
  if (!word) return res.status(400).json({ error: '参数缺失' });
  db.prepare('DELETE FROM bad_words WHERE word = ?').run(word);
  res.json({ ok: true });
});

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
    isRootSuper: isRootSuperAccount(user.name),
  });
});

// ===== DakeMusic: peiwan 账号密码登录（陪玩平台对接）=====
app.post('/api/auth/peiwan-login', authLimiter, async (req, res) => {
  if (!PEIWAN_API_BASE) return res.status(503).json({ error: '陪玩平台未配置(PEIWAN_API_BASE)' });
  const { account, password } = req.body || {};
  if (!account || !password) return res.status(400).json({ error: '账号和密码必填' });
  try {
    const loginRes = await fetch(`${PEIWAN_API_BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ account: String(account), password: String(password) }),
    });
    const loginText = await loginRes.text();
    let loginJson;
    try { loginJson = JSON.parse(loginText); } catch { return res.status(502).json({ error: '陪玩平台响应异常' }); }
    if (loginJson.code !== 1) {
      logger.warn('peiwan.login_fail', { reqId: req.id, account });
      return res.status(401).json({ error: loginJson.msg || '账号或密码错误' });
    }
    const peiwanToken = loginRes.headers.get('token') || loginRes.headers.get('Token');
    if (!peiwanToken) return res.status(502).json({ error: '陪玩平台未返回登录凭证' });

    const infoRes = await fetch(`${PEIWAN_API_BASE}/api/user/index`, {
      headers: { 'token': peiwanToken },
    });
    const infoJson = await infoRes.json();
    if (infoJson.code !== 1) return res.status(401).json({ error: '陪玩平台登录态失效' });
    const pu = infoJson.data || {};
    const peiwanUid = Number(pu.id);
    if (!peiwanUid) return res.status(502).json({ error: '陪玩平台用户信息缺失' });

    let user = stmtFindByPeiwan.get(peiwanUid);
    const nick = String(pu.nickname || pu.username || `用户${peiwanUid}`).slice(0, 20);
    const avatar = String(pu.avatar || '').slice(0, 3000000);
    if (!user) {
      const r = stmtUpsertPeiwan.run(`peiwan_${peiwanUid}`, nick, avatar, peiwanUid, Date.now());
      user = stmtFindUserById.get(r.lastInsertRowid);
    } else {
      stmtSyncPeiwanProfile.run(nick, avatar, user.id);
      user.nickname = nick; user.avatar = avatar;
    }

    const token = signSession(user);
    logger.info('peiwan.login', { reqId: req.id, localUserId: user.id, peiwanUid, nick });
    res.json({
      token, userId: user.id,
      name: user.name, nickname: nick, avatar,
      isAdmin: !!user.is_admin,
      fromPeiwan: true,
    });
  } catch (e) {
    logger.error('peiwan.login_error', { reqId: req.id, err: e.message });
    res.status(502).json({ error: '无法连接陪玩平台' });
  }
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
    isRootSuper: isRootSuperAccount(user.name),
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
    isAdmin: !!user.is_admin,
    isRootSuper: isRootSuperAccount(user.name),
  });
});

// ===== DakeMusic: 根超管任免超管 =====
app.post('/api/users/:id/super-admin', authSession, (req, res) => {
  const me = currentDbUser(req);
  if (!me || !isRootSuperAccount(me.name)) {
    return res.status(403).json({ error: '仅根超管可任免超管' });
  }
  const target = stmtFindUserById.get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const { isAdmin } = req.body || {};
  const next = !!isAdmin;
  if (!next && isRootSuperAccount(target.name)) {
    return res.status(400).json({ error: '根超管不能被取消' });
  }
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(next ? 1 : 0, target.id);
  logger.info('admin.grant_revoke', { reqId: req.id, by: me.name, target: target.name, isAdmin: next });
  res.json({ ok: true, userId: target.id, isAdmin: next });
});

// ===== DakeMusic: 管理员面板 - 列出所有用户（仅超管可访问）=====
app.get('/api/admin/users', authSession, (req, res) => {
  const me = currentDbUser(req);
  if (!me || !isRootSuperAccount(me.name)) {
    return res.status(403).json({ error: '仅根超管可访问' });
  }
  const rows = db.prepare('SELECT id, name, nickname, avatar, is_admin, created_at FROM users ORDER BY id DESC').all();
  res.json({
    list: rows.map(u => ({
      id: u.id,
      name: u.name,
      nickname: displayName(u),
      avatar: u.avatar || '',
      isAdmin: !!u.is_admin,
      isRootSuper: isRootSuperAccount(u.name),
      createdAt: u.created_at,
    })),
  });
});

// 设为房间管理员
app.post('/api/admin/users/:id', authSession, (req, res) => {
  const me = currentDbUser(req);
  if (!me || !isRootSuperAccount(me.name)) return res.status(403).json({ error: '仅根超管可操作' });
  const target = stmtFindUserById.get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(target.id);
  logger.info('admin.panel_grant', { reqId: req.id, by: me.name, target: target.name });
  res.json({ ok: true });
});

// 取消房间管理员
app.delete('/api/admin/users/:id', authSession, (req, res) => {
  const me = currentDbUser(req);
  if (!me || !isRootSuperAccount(me.name)) return res.status(403).json({ error: '仅根超管可操作' });
  const target = stmtFindUserById.get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (isRootSuperAccount(target.name)) return res.status(400).json({ error: '根超管不能被取消' });
  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(target.id);
  logger.info('admin.panel_revoke', { reqId: req.id, by: me.name, target: target.name });
  res.json({ ok: true });
});

// 房间密码：新数据一律 bcrypt 哈希存储；旧数据是明文，校验通过后自动升级
const ROOM_PASSWORD_HASH_RE = /^\$2[aby]\$/;
// 房间封面：只接受 data:image 的 base64，且限制体积（约 900KB 原图），避免 JSON 存储被撑爆
const ROOM_COVER_MAX_CHARS = 1_200_000;
function normalizeRoomCover(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(raw)) return '';
  // 超限返回 null：调用方回 413，绝不能截断 base64（截断后图片损坏）
  if (raw.length > ROOM_COVER_MAX_CHARS) return null;
  return raw;
}

function verifyRoomPassword(stored, input) {
  if (!stored) return true;
  const plain = String(input ?? '');
  const storedStr = String(stored);
  if (ROOM_PASSWORD_HASH_RE.test(storedStr)) return bcrypt.compareSync(plain, storedStr);
  return storedStr === plain;
}

function hashRoomPassword(password) {
  const plain = String(password ?? '');
  return plain ? bcrypt.hashSync(plain, 10) : '';
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ===== 创建房间 =====
app.post('/api/rooms', authSession, (req, res) => {
  const { name, description, password = '', coverImage = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '房间名不能为空' });
  const cover = normalizeRoomCover(coverImage);
  if (cover === null) return res.status(413).json({ error: '封面图过大，请换一张更小的图片' });
  const me = currentDbUser(req);
  const ownerNick = displayName(me) || req.user.name;
  const id = uid('room');
  rooms[id] = {
    id, name: name.trim(), description: description || '',
    coverImage: cover,
    ownerUserId: req.user.userId,
    ownerName: req.user.name,
    ownerNickname: ownerNick,
    createdAt: Date.now(),
    participants: [], banned: [],
    // 只存 bcrypt 哈希，避免明文房间密码落盘
    password: hashRoomPassword(password),
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
    } catch (e) {
      logger.warn('room_list_jwt_verify_failed', { error: e?.message || String(e) });
    }
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
      seatMode: r.seatMode === 'duet' ? 'duet' : 'normal',
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
    seatMode: room.seatMode === 'duet' ? 'duet' : 'normal',
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
      try { await roomService.removeParticipant(other.id, oldInOther.identity); } catch (e) {
        logger.warn('remove_stale_participant_failed', { roomId: other.id, error: e?.message || String(e) });
      }
    }
    other.participants = other.participants.filter(p => p.userId !== req.user.userId);
    if (other.participants.length !== before) otherRoomChanged = true;
  }
  if (otherRoomChanged) saveRooms();

  const isBanned = room.banned.some(b => b.startsWith(`user_${req.user.userId}`));
  if (isBanned) return res.status(403).json({ error: 'BANNED' });
  if (room.password && !verifyRoomPassword(room.password, req.body?.password)) {
    return res.status(403).json({ error: '密码错误' });
  }
  // 旧房间是明文密码，验证通过后顺手升级为哈希
  if (room.password && !ROOM_PASSWORD_HASH_RE.test(String(room.password))) {
    room.password = hashRoomPassword(req.body?.password);
    saveRooms();
  }

  const oldParticipants = room.participants.filter(p => p.userId === req.user.userId && p.identity !== identity);
  for (const old of oldParticipants) {
    try { await roomService.removeParticipant(room.id, old.identity); } catch (e) {
      logger.warn('remove_duplicate_participant_failed', { roomId: room.id, error: e?.message || String(e) });
    }
  }
  room.participants = room.participants.filter(p => p.userId !== req.user.userId);

  const me = currentDbUser(req);
  const myNick = displayName(me) || req.user.name;
  const myAccount = me?.name || req.user.name;
  const isOwner = room.ownerUserId === req.user.userId ||
    (!room.ownerUserId && (room.ownerName === req.user.name || room.ownerNickname === myNick));
  // 真房主的 LiveKit identity（用于客户端校验歌词/控制指令来源，避免普通成员伪造）
  const ownerUserId = room.ownerUserId ||
    (room.ownerName ? stmtFindUser.get(room.ownerName)?.id : null);
  const ownerIdentity = ownerUserId ? `user_${ownerUserId}` : '';
  const superAdmin = isSuperAdmin(req.user);
  const dbMe = currentDbUser(req);

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity, name: myNick, ttl: '2h',
    metadata: JSON.stringify({
      account: myAccount,
      userId: req.user.userId,
      nickname: myNick,
      isAdmin: !!(dbMe && dbMe.is_admin),
      isRootSuper: isRootSuperAccount(dbMe?.name || ''),
    }),
  });
  at.addGrant({ room: room.id, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

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
    ownerUserId: ownerUserId || undefined,
    ownerIdentity,
    identity,
    myNickname: myNick,
    seatMode: room.seatMode === 'duet' ? 'duet' : 'normal',
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
  const { name, description, coverImage, seatMode } = req.body || {};
  const room = req.room;
  if (name?.trim()) room.name = name.trim();
  if (typeof description === 'string') room.description = description;
  if (typeof coverImage === 'string') {
    const cover = normalizeRoomCover(coverImage);
    if (cover === null) return res.status(413).json({ error: '封面图过大，请换一张更小的图片' });
    room.coverImage = cover;
  }
  // DakeMusic: 对唱/普通模式持久化，房主不在线时新进房的人也能看到正确布局
  if (seatMode === 'normal' || seatMode === 'duet') room.seatMode = seatMode;
  saveRooms();
  res.json({ ok: true, name: room.name, seatMode: room.seatMode === 'duet' ? 'duet' : 'normal' });
});

// ===== 删除房间 =====
app.delete('/api/rooms/:id', authSession, requireOwner, (req, res) => {
  const room = req.room;
  try {
    for (const p of room.participants) {
      roomService.removeParticipant(room.id, p.identity).catch((e) => {
        logger.warn('remove_room_participant_failed', { roomId: room.id, error: e?.message || String(e) });
      });
    }
  } catch (e) {
    logger.warn('remove_room_participants_failed', { roomId: room.id, error: e?.message || String(e) });
  }
  delete rooms[room.id];
  saveRooms();
  // 清理消息和麦位
  stmtDeleteRoomMessages.run(room.id);
  stmtDeleteRoomSeats.run(room.id);
  logger.info('room.delete', { reqId: req.id, roomId: room.id, owner: req.user.name });
  res.json({ ok: true });
});

// ===== 房间消息 REST API =====
app.get('/api/rooms/:id/messages', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const after = Number(req.query.after) || 0;
  let rows;
  if (after > 0) {
    rows = stmtGetMessagesAfter.all(req.params.id, after, limit);
  } else {
    rows = stmtGetMessages.all(req.params.id, limit);
    rows.reverse();
  }
  res.json({
    list: rows.map(r => ({
      id: String(r.id),
      room_id: r.room_id,
      user_id: r.user_id,
      user_name: r.user_name,
      user_avatar: r.user_avatar || '',
      content: r.content,
      is_system: !!r.is_system,
      created_at: new Date(r.created_at).toISOString(),
    })),
  });
});

app.post('/api/rooms/:id/messages', authSession, chatLimiter, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  // 必须真的在这个房间里才能发言（防止非成员往任意房间写消息）
  const myRoomId = userCurrentRoom.get(req.user.userId);
  const inParticipants = room.participants.some(p => p.userId === req.user.userId);
  if (!inParticipants && myRoomId !== req.params.id) {
    return res.status(403).json({ error: '你不在该房间中' });
  }
  const { content, silent } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });
  if (content.length > 4000) return res.status(400).json({ error: '消息过长' });
  const me = currentDbUser(req);
  const myNick = displayName(me) || req.user.name;
  const myAvatar = me?.avatar || '';
  const now = Date.now();
  const result = stmtInsertMessage.run(req.params.id, req.user.userId || null, myNick, myAvatar, content.trim(), 0, now);
  const msg = {
    id: String(result.lastInsertRowid),
    room_id: req.params.id,
    user_id: req.user.userId,
    user_name: myNick,
    user_avatar: myAvatar,
    content: content.trim(),
    is_system: false,
    created_at: new Date(now).toISOString(),
  };
  // DakeMusic: 客户端已经通过 LiveKit 实时广播过这条聊天，这里只做历史持久化，
  // silent=true 时不再走 WebSocket，避免 web 端收到重复消息。
  if (!silent) wsBroadcast(req.params.id, { type: 'message', ...msg });
  res.json(msg);
});

// ===== 麦位 REST API =====
function getOrInitSeats(roomId) {
  const existing = stmtGetSeats.all(roomId);
  if (existing.length >= 7) return existing;
  // 初始化 7 个麦位（0 号主持位 + 6 普通位）
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    if (!existing.find(e => e.seat_index === i)) {
      stmtInsertSeat.run(roomId, i, null, null, null, 0, 0, now);
    }
  }
  return stmtGetSeats.all(roomId);
}

app.get('/api/rooms/:id/seats', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const rows = getOrInitSeats(req.params.id);
  res.json({
    list: rows.map(r => ({
      id: `seat_${r.seat_index}`,
      room_id: r.room_id,
      seat_index: r.seat_index,
      user_id: r.user_id,
      user_name: r.user_name,
      user_avatar: r.user_avatar || '',
      is_muted: !!r.is_muted,
      is_speaking: !!r.is_speaking,
      updated_at: new Date(r.updated_at).toISOString(),
    })),
  });
});

app.post('/api/rooms/:id/take-seat', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { seatIndex } = req.body || {};
  if (typeof seatIndex !== 'number' || seatIndex < 0 || seatIndex > 6) {
    return res.status(400).json({ error: 'seatIndex 需在 0-6 之间' });
  }
  const me = currentDbUser(req);
  const myNick = displayName(me) || req.user.name;
  const myAvatar = me?.avatar || '';
  const now = Date.now();

  // 先下掉该用户在其他麦位
  // 先校验目标麦位：校验失败时不能动用户原有座位，否则会白丢座位
  const allSeats = stmtGetSeats.all(req.params.id);
  const target = allSeats.find(s => s.seat_index === seatIndex);
  if (target && target.user_id && target.user_id !== req.user.userId) {
    return res.status(409).json({ error: '该麦位已被占用' });
  }

  // 主麦位（0 号）只允许房主/超级管理员就座，避免普通成员直接占房主位
  if (seatIndex === 0) {
    const meForSeat = currentDbUser(req);
    const seatOwner = room.ownerUserId === req.user.userId ||
      isSuperAdmin(req.user) ||
      isRootSuperAccount(meForSeat?.name || '');
    if (!seatOwner) return res.status(403).json({ error: '主麦位仅房主可用' });
  }

  // 校验通过后再下掉该用户原来的座位
  const myOldSeat = stmtFindSeatByUser.get(req.params.id, req.user.userId);
  if (myOldSeat) {
    stmtInsertSeat.run(req.params.id, myOldSeat.seat_index, null, null, null, 0, 0, now);
  }

  stmtInsertSeat.run(req.params.id, seatIndex, req.user.userId, myNick, myAvatar, target?.is_muted || 0, 0, now);
  const seat = {
    id: `seat_${seatIndex}`,
    room_id: req.params.id,
    seat_index: seatIndex,
    user_id: req.user.userId,
    user_name: myNick,
    user_avatar: myAvatar,
    is_muted: target?.is_muted || false,
    is_speaking: false,
    updated_at: new Date(now).toISOString(),
  };
  wsBroadcast(req.params.id, { type: 'seat_update', seat });
  res.json({ success: true, seat });
});

app.post('/api/rooms/:id/leave-seat', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const mySeat = stmtFindSeatByUser.get(req.params.id, req.user.userId);
  if (!mySeat) return res.status(404).json({ error: '你不在麦上' });
  const now = Date.now();
  stmtInsertSeat.run(req.params.id, mySeat.seat_index, null, null, null, 0, 0, now);
  const seat = {
    id: `seat_${mySeat.seat_index}`,
    room_id: req.params.id,
    seat_index: mySeat.seat_index,
    user_id: null,
    user_name: null,
    user_avatar: null,
    is_muted: false,
    is_speaking: false,
    updated_at: new Date(now).toISOString(),
  };
  wsBroadcast(req.params.id, { type: 'seat_update', seat });
  res.json({ success: true, seat });
});

app.post('/api/rooms/:id/seat-status', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { isMuted } = req.body || {};
  const mySeat = stmtFindSeatByUser.get(req.params.id, req.user.userId);
  if (!mySeat) return res.status(404).json({ error: '你不在麦上' });
  const now = Date.now();
  stmtUpdateSeatMute.run(isMuted ? 1 : 0, now, req.params.id, mySeat.seat_index);
  const seat = {
    id: `seat_${mySeat.seat_index}`,
    room_id: req.params.id,
    seat_index: mySeat.seat_index,
    user_id: mySeat.user_id,
    user_name: mySeat.user_name,
    user_avatar: mySeat.user_avatar || '',
    is_muted: !!isMuted,
    is_speaking: !!mySeat.is_speaking,
    updated_at: new Date(now).toISOString(),
  };
  wsBroadcast(req.params.id, { type: 'seat_update', seat });
  res.json({ success: true, seat });
});

// ============ DakeMusic: 房间点歌台 ============
// 队列存于 room.musicQueue（内存），正在播的存 room.currentTrack。
// 权限：房主或当前在麦上的人 = DJ，可切歌/删歌；任何人可点歌、可删自己点的。

/** 判断用户是否为 DJ（房主 或 当前在麦上） */
function isRoomDJ(room, userId) {
  if (!room || !userId) return false;
  if (room.ownerUserId === userId) return true;
  try {
    const seats = stmtGetSeats.all(room.id);
    return seats.some(s => s.user_id === userId);
  } catch { return false; }
}

/** 惰性初始化房间队列 */
function ensureQueue(room) {
  if (!Array.isArray(room.musicQueue)) room.musicQueue = [];
  if (!room.currentTrack) room.currentTrack = null;
}

/**
 * 队列对外快照：去掉 requestedByAvatar 和 songData。
 * 头像是 base64 data URI（可达上百 KB），既不需要发给客户端，
 * 也会让 LiveKit DataChannel 广播超过单包上限，导致别人收不到队列更新。
 * songData 只在切歌时随 currentTrack 下发，队列展示用不到。
 */
function toPublicQueueItem(item) {
  if (!item || typeof item !== 'object') return item;
  const copy = { ...item };
  delete copy.requestedByAvatar;
  delete copy.songData;
  return copy;
}

/** 当前播放曲目保留 songData，供所有人真实播放；只去掉头像 */
function toPublicTrack(track) {
  if (!track || typeof track !== 'object') return track;
  const copy = { ...track };
  delete copy.requestedByAvatar;
  // DakeMusic: 带上当前播放进度，供中途进房/断线重连的客户端 seek 对齐。
  // 用服务端时间计算，避免各客户端时钟不一致。
  const startedAt = Number(track.startedAt) || 0;
  copy.position = startedAt > 0 ? Math.max(0, (Date.now() - startedAt) / 1000) : 0;
  return copy;
}

function publicQueue(room) {
  return (Array.isArray(room.musicQueue) ? room.musicQueue : []).map(toPublicQueueItem);
}

// 点歌：任何人可点，免审核，每人队列里最多 3 首
app.post('/api/rooms/:id/request-song', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  ensureQueue(room);
  const { songId, title, artist = '', cover = '', url = '', duration = 0, songData = null } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '缺少歌曲名' });
  // url 可空：DJ 端切歌时凭 songId 自行解析播放地址
  // songData：点歌端的完整标准 Song 对象，广播给所有人，让没搜过这首歌的人也能直接播放
  // 每人队列中最多 3 首
  const mineCount = room.musicQueue.filter(s => s.requestedBy === req.user.userId).length;
  if (mineCount >= 3) return res.status(400).json({ error: '你最多同时排队 3 首' });

  const me = currentDbUser(req);
  const item = {
    id: uid('req'),
    songId: songId || null,
    title: String(title).trim(),
    artist: artist || '',
    cover: cover || '',
    url: String(url).trim(),
    duration: Number(duration) || 0,
    songData: songData || null,
    requestedBy: req.user.userId,
    requestedByName: displayName(me) || req.user.name,
    addedAt: Date.now(),
  };
  room.musicQueue.push(item);
  // DakeMusic: 房间当前没有正在播放的歌时，新点的第一首直接开播，
  // 否则用户点完歌只看到队列里有歌却永远不响（此前只有“切歌”按钮能触发，而它只在有当前曲目时出现）。
  let startedTrack = null;
  if (!room.currentTrack) {
    startedTrack = room.musicQueue.shift() || null;
    if (startedTrack) startedTrack.startedAt = Date.now();
    room.currentTrack = startedTrack;
  }
  const queue = publicQueue(room);
  broadcastToRoom(room, { type: 'music_queue_updated', queue }).catch(() => {});
  if (startedTrack) {
    broadcastToRoom(room, {
      type: 'music_track_changed',
      track: toPublicTrack(startedTrack),
      queue,
    }).catch(() => {});
  }
  res.json({
    success: true,
    item: toPublicQueueItem(item),
    queue,
    current: toPublicTrack(room.currentTrack),
    track: startedTrack ? toPublicTrack(startedTrack) : null,
  });
});

// 查看队列与当前播放
app.get('/api/rooms/:id/queue', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  ensureQueue(room);
  res.json({ queue: publicQueue(room), current: toPublicTrack(room.currentTrack) });
});

// DJ 切到下一首（队列首出列，设为正在播放，广播全员）
app.post('/api/rooms/:id/queue/next', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  ensureQueue(room);
  if (!isRoomDJ(room, req.user.userId)) return res.status(403).json({ error: '只有房主或麦上的人能切歌' });
  const next = room.musicQueue.shift() || null;
  if (next) next.startedAt = Date.now();
  room.currentTrack = next;
  const queue = publicQueue(room);
  const track = toPublicTrack(room.currentTrack);
  broadcastToRoom(room, {
    type: 'music_track_changed',
    track,
    queue,
  }).catch(() => {});
  res.json({ success: true, track, queue });
});

// 删除队列中的歌：DJ 可删任意，普通用户只能删自己点的
app.delete('/api/rooms/:id/queue/:index', authSession, (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  ensureQueue(room);
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= room.musicQueue.length) return res.status(404).json({ error: '歌曲不存在' });
  const item = room.musicQueue[idx];
  const canDelete = isRoomDJ(room, req.user.userId) || item.requestedBy === req.user.userId;
  if (!canDelete) return res.status(403).json({ error: '只能删自己点的歌' });
  room.musicQueue.splice(idx, 1);
  const queue = publicQueue(room);
  broadcastToRoom(room, { type: 'music_queue_updated', queue }).catch(() => {});
  res.json({ success: true, queue });
});

// ===== 系统消息 HMAC =====
async function broadcastSystem(room, payload) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const content = formatSystemText(payload);
  const result = stmtInsertMessage.run(room.id, null, '系统', '', content, 1, ts);
  const msg = {
    id: String(result.lastInsertRowid),
    room_id: room.id,
    user_id: null,
    user_name: '系统',
    user_avatar: '',
    content,
    is_system: true,
    created_at: new Date(ts).toISOString(),
  };
  // WebSocket 广播
  wsBroadcast(room.id, { type: 'message', ...msg });
  // LiveKit broadcast for web clients
  try {
    const lkMsg = {
      type: 'system', id: `sys_${ts}_${nonce}`, ts, nonce,
      senderIdentity: 'system', senderName: '系统',
      sig: hmac(JWT_SECRET, room.id, String(ts), nonce, JSON.stringify(payload)),
      payload, content,
    };
    await roomService.sendData(room.id, Buffer.from(JSON.stringify(lkMsg)), DataPacket_Kind.RELIABLE, { topic: 'chat' });
  } catch (e) { logger.warn('broadcast failed', { err: e.message }); }
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

// ============ 启动 HTTP + WebSocket ============
await loadRooms();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  logger.info('ws.connect', { ip: req.socket.remoteAddress });
  wssClients.set(ws, { userId: null, roomId: null, userName: '' });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      const info = wssClients.get(ws);
      if (!info) return;

      // 认证
      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET);
          info.userId = decoded.userId;
          info.userName = decoded.name || '';
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          logger.info('ws.auth', { userId: decoded.userId });
        } catch {
          ws.send(JSON.stringify({ type: 'auth_fail' }));
          ws.close();
        }
        return;
      }

      // 订阅房间
      if (msg.type === 'join_room' && info.userId) {
        if (info.roomId) wsLeaveRoom(ws, info.roomId);
        info.roomId = msg.roomId;
        wsJoinRoom(ws, msg.roomId);
        // 推送历史消息和麦位
        const seats = getOrInitSeats(msg.roomId);
        ws.send(JSON.stringify({ type: 'seat_list', seats: seats.map(r => ({
          id: `seat_${r.seat_index}`, room_id: r.room_id, seat_index: r.seat_index,
          user_id: r.user_id, user_name: r.user_name, user_avatar: r.user_avatar || '',
          is_muted: !!r.is_muted, is_speaking: !!r.is_speaking,
          updated_at: new Date(r.updated_at).toISOString(),
        })) }));
        const messages = stmtGetMessages.all(msg.roomId, 50);
        messages.reverse();
        ws.send(JSON.stringify({ type: 'message_history', messages: messages.map(r => ({
          id: String(r.id), room_id: r.room_id, user_id: r.user_id,
          user_name: r.user_name, user_avatar: r.user_avatar || '',
          content: r.content, is_system: !!r.is_system,
          created_at: new Date(r.created_at).toISOString(),
        })) }));
        return;
      }

      // 客户端发送消息（通过 WS）
      if (msg.type === 'chat' && info.userId && info.roomId) {
        const user = stmtFindUserById.get(info.userId);
        const myNick = displayName(user) || info.userName || '用户';
        const myAvatar = user?.avatar || '';
        const now = Date.now();
        const result = stmtInsertMessage.run(info.roomId, info.userId, myNick, myAvatar, String(msg.content || '').trim(), 0, now);
        const out = {
          type: 'message',
          id: String(result.lastInsertRowid),
          room_id: info.roomId,
          user_id: info.userId,
          user_name: myNick,
          user_avatar: myAvatar,
          content: String(msg.content || '').trim(),
          is_system: false,
          created_at: new Date(now).toISOString(),
        };
        wsBroadcast(info.roomId, out);
        return;
      }

      // 心跳
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    } catch (e) {
      logger.warn('ws.message_error', { err: e.message });
    }
  });

  ws.on('close', () => {
    const info = wssClients.get(ws);
    if (info?.roomId) wsLeaveRoom(ws, info.roomId);
    wssClients.delete(ws);
    logger.info('ws.disconnect');
  });

  ws.on('error', (err) => {
    logger.warn('ws.error', { err: err.message });
  });
});

server.listen(PORT, '0.0.0.0', () => {
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
      try { roomService.removeParticipant(room.id, p.identity); } catch (e) {
        logger.warn('cleanup_multiroom_participant_failed', { roomId: room.id, error: e?.message || String(e) });
      }
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
      try {
        roomService.deleteRoom(id).catch((e) => {
          logger.warn('delete_livekit_room_failed', { roomId: id, error: e?.message || String(e) });
        });
      } catch (e) {
        logger.warn('delete_livekit_room_failed_sync', { roomId: id, error: e?.message || String(e) });
      }
      stmtDeleteRoomMessages.run(id);
      stmtDeleteRoomSeats.run(id);
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
