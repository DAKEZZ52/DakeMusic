/**
 * DakeMusic 管理后台 API
 * 挂载在 /admin 路由下
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// 复用主进程的 db 和 rooms（由 index.js 注入）
let db = null;
let getRooms = () => ({});
let JWT_SECRET = '';

export function initAdmin({ db: _db, rooms, jwtSecret }) {
  db = _db;
  getRooms = typeof rooms === 'function' ? rooms : () => rooms;
  JWT_SECRET = jwtSecret;
}

// ============ 中间件：校验 admin token ============
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.isAdmin) return res.status(403).json({ error: '无权限' });
    req.adminUser = payload;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// ============ 登录 ============
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入账号密码' });

  const user = db.prepare('SELECT * FROM users WHERE name = ? AND is_admin = 1').get(username);
  if (!user) return res.status(401).json({ error: '账号不存在或无权限' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '密码错误' });

  const token = jwt.sign(
    { userId: user.id, name: user.name, isAdmin: 1 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { name: user.name, nickname: user.nickname || user.name } });
});

// ============ 控制台统计 ============
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ?').get(today.getTime()).c;
  const rooms = getRooms();
  const roomCount = Object.keys(rooms).length;

  // 各房间在线人数
  let onlineCount = 0;
  for (const r of Object.values(rooms)) {
    if (r.members) onlineCount += Object.keys(r.members).length;
  }

  res.json({ totalUsers, todayUsers, roomCount, onlineCount });
});

// ============ 用户管理 ============
router.get('/users', requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, keyword = '' } = req.query;
  const offset = (page - 1) * pageSize;
  const where = keyword ? 'WHERE name LIKE ? OR nickname LIKE ?' : '';
  const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];

  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const list = db.prepare(
    `SELECT id, name, nickname, avatar, gender, city, created_at, is_admin
     FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(pageSize), Number(offset));

  res.json({ total, list: list.map(u => ({
    ...u,
    created_at: u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '',
  })) });
});

// 封禁/解封用户
router.post('/users/:id/ban', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { banned } = req.body || {};
  // 检查是否有 banned 列
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0');
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id);
  res.json({ ok: true });
});

// 编辑用户资料
router.post('/users/:id/update', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nickname, gender, city, password, isAdmin } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });

  if (nickname !== undefined) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, id);
  if (gender !== undefined) db.prepare('UPDATE users SET gender = ? WHERE id = ?').run(gender, id);
  if (city !== undefined) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(city, id);
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }
  if (isAdmin !== undefined) db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  res.json({ ok: true });
});

// ============ 房间管理 ============
router.get('/rooms', requireAdmin, (req, res) => {
  const rooms = getRooms();
  const list = Object.entries(rooms).map(([id, r]) => ({
    id,
    name: r.name || '未命名',
    owner: r.ownerName || r.owner || '',
    memberCount: r.members ? Object.keys(r.members).length : 0,
    createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '',
  }));
  res.json({ list });
});

// 关闭房间
router.post('/rooms/:id/close', requireAdmin, (req, res) => {
  const { id } = req.params;
  const rooms = getRooms();
  if (rooms[id]) {
    delete rooms[id];
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: '房间不存在' });
  }
});

// 编辑房间
router.post('/rooms/:id/update', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, owner } = req.body || {};
  const rooms = getRooms();
  if (!rooms[id]) return res.status(404).json({ error: '房间不存在' });
  if (name !== undefined) rooms[id].name = name;
  if (owner !== undefined) rooms[id].ownerName = owner;
  res.json({ ok: true });
});

// ============ 违禁词管理 ============
router.get('/bad-words', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM bad_words ORDER BY id DESC').all();
  res.json({ list: rows });
});

router.post('/bad-words/add', requireAdmin, (req, res) => {
  const { word } = req.body || {};
  if (!word || !word.trim()) return res.status(400).json({ error: '请输入违禁词' });
  const w = word.trim();
  try {
    db.prepare('INSERT INTO bad_words (word, created_at) VALUES (?, ?)').run(w, Date.now());
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: '该词已存在' });
  }
});

router.post('/bad-words/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM bad_words WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ 静态文件（admin 前端页面） ============
router.use('/', express.static(path.join(__dirname, 'admin')));

export default router;
