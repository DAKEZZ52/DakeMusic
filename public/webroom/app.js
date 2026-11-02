/* =========================================================
   DakeMusic 语聊房 · 网页版交互
   纯原生 JS，无构建依赖。
   - 未登录 / 演示模式：使用本地演示数据
   - 登录后：接入 dkyy.top 房间服务 + LiveKit 实时语音与 DataChannel
   ========================================================= */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const icon = (name, extra = '') =>
    `<svg class="ico ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[char];
    });

  const formatTime = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const formatClock = (value) => {
    const date = value instanceof Date ? value : new Date(Number(value) || Date.now());
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const nowTime = () => formatClock(Date.now());

  const randomId = (prefix = 'x') =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * 排障用：记录最近收到的 LiveKit DataChannel 数据包。
   * 浏览器控制台可用 window.DAKE_WEBROOM_DEBUG.packets 查看。
   */
  const debugPackets = [];
  const recordPacket = (from, kind, type, accepted, extra) => {
    debugPackets.push({
      t: Date.now(),
      from: from || '(server)',
      kind: kind || '',
      type: type || '',
      accepted: Boolean(accepted),
      ...(extra || {}),
    });
    while (debugPackets.length > 120) debugPackets.shift();
  };

  const hashString = (value) => {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
  };

  const AVATAR_PALETTES = [
    ['#8a5cff', '#00beff'],
    ['#fbbf24', '#f472b6'],
    ['#34d399', '#06b6d4'],
    ['#6366f1', '#a855f7'],
    ['#f472b6', '#fb7185'],
    ['#38bdf8', '#6366f1'],
    ['#f59e0b', '#ef4444'],
    ['#10b981', '#84cc16'],
    ['#f97316', '#fbbf24'],
    ['#a78bfa', '#f472b6'],
    ['#22d3ee', '#3b82f6'],
    ['#fb7185', '#f59e0b'],
  ];

  const paletteFor = (id) => AVATAR_PALETTES[hashString(id) % AVATAR_PALETTES.length];

  const initialOf = (name) => {
    const text = String(name || '?').trim();
    return text ? text.slice(0, 1).toUpperCase() : '?';
  };

  const cleanAvatar = (value) => {
    const text = String(value || '');
    if (!text || text.length > 3_000_000) return '';
    if (/^data:image\//i.test(text) || /^https?:\/\//i.test(text)) return text;
    return '';
  };

  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = String(value == null ? '' : value);
  };

  const setHtml = (selector, value) => {
    const element = $(selector);
    if (element) element.innerHTML = value;
  };

  /* -------------------------------------------------------
     运行配置
     ------------------------------------------------------- */
  const params = new URLSearchParams(window.location.search);
  const runtimeConfig = window.DAKE_WEBROOM_CONFIG || {};
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const DEFAULT_API_BASE = 'https://dkyy.top';
  const DEFAULT_LIVEKIT_URL = 'wss://dkyy.top/livekit';
  const API_BASE = String(
    runtimeConfig.apiBase || (isLocalhost && params.get('api')) || DEFAULT_API_BASE,
  ).replace(/\/+$/, '');
  const LIVEKIT_FALLBACK = String(
    runtimeConfig.livekitUrl || (isLocalhost && params.get('lk')) || DEFAULT_LIVEKIT_URL,
  );

  /** 由 API 地址推导同源 LiveKit 反代地址（https → wss，http → ws）。 */
  const deriveLivekitUrl = () => {
    try {
      const api = new URL(API_BASE);
      return `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}/livekit`;
    } catch {
      return LIVEKIT_FALLBACK;
    }
  };

  /**
   * 纠正服务端下发的 LiveKit 地址。
   * 服务端可能下发明文/内网地址（例如 ws://1.2.3.4:7880），而网页跑在 https 下，
   * 浏览器会按混合内容直接拦截 ws://，表现就是「语音尚未连接」。
   * 这里统一改成可用地址：同源就升级成 wss，否则走 API 同源的 /livekit 反代。
   */
  const resolveLivekitUrl = (candidate) => {
    const raw = String(candidate || '').trim();
    if (!raw) return deriveLivekitUrl();
    let url;
    try {
      url = new URL(raw);
    } catch {
      return deriveLivekitUrl();
    }
    if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
      if (url.host === window.location.host) {
        url.protocol = 'wss:';
        return url.toString();
      }
      return deriveLivekitUrl();
    }
    return raw;
  };
  const TOKEN_KEY = 'chat_session';
  const LAST_ROOM_KEY = 'dake_webroom_last_room';
  const AUDIO_INPUT_KEY = 'dake_webroom_audio_input';
  const AUDIO_OUTPUT_KEY = 'dake_webroom_audio_output';
  const MAX_CHAT_MESSAGES = 200;

  const getToken = () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  };
  const setToken = (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  };
  const clearToken = () => setToken('');

  const getLocal = (key) => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };
  const setLocal = (key, value) => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  /* -------------------------------------------------------
     演示数据
     ------------------------------------------------------- */
  const SONG_DATA = [
    {
      title: '唯一 (Live)',
      artist: 'Rosy赵露思',
      duration: 360,
      requester: '房主推荐',
      lyricLines: [
        '你真的懂唯一的定义',
        '并不简单如呼吸',
        '你真的希望你能厘清',
        '若没交心怎么说明',
        '我真的爱你 句句不轻易',
        '眼神中飘移 总是在关键时刻清楚洞悉',
        '你的不坚定 配合我颠沛流离',
        '死去中清醒 明白你背着我聪明',
        '爱本质无异 是因为人多得拥挤',
        '你不想证明 证明我是你唯一',
      ],
    },
    {
      title: '晴天',
      artist: '周杰伦',
      duration: 269,
      requester: '小鹿 点歌',
      lyricLines: [
        '故事的小黄花 从出生那年就飘着',
        '童年的荡秋千 随记忆一直晃到现在',
        '吹着前奏望着天空',
        '我想起花瓣试着掉落',
        '为你翘课的那一天',
        '花落的那一天 教室的那一间',
        '我怎么看不见',
        '消失的下雨天 我好想再淋一遍',
      ],
    },
    {
      title: '特别的人',
      artist: '方大同',
      duration: 259,
      requester: '阿泽 点歌',
      lyricLines: [
        '爱一个人或许要慷慨',
        '若只想要被爱 最后没有了对白',
        '必须有你我的情真',
        '不求计分的平等',
        '总有幸福有心疼',
        '生命的起伏要认可',
        '懂一个人也许要忍耐',
        '要经过了意外 才了解所谓的爱',
      ],
    },
    {
      title: '如果呢',
      artist: '郑润泽',
      duration: 255,
      requester: 'Momo 点歌',
      lyricLines: [
        '如果呢 如果呢',
        '你会不会也偶尔想起我',
        '如果呢 如果呢',
        '会不会有一点点难过',
        '那些没说出口的承诺',
        '都被时间一笔带过',
        '如果呢 如果呢',
        '我们会不会有如果',
      ],
    },
    {
      title: '晚风心里吹',
      artist: '阿梨粤',
      duration: 225,
      requester: '夜航星 点歌',
      lyricLines: [
        '晚风心里吹 吹散多少旧梦',
        '吹不散你眼中 那一点温柔',
        '街灯照亮长街 谁在路口等候',
        '等一句晚安 等一个回头',
        '晚风心里吹 吹过你的发梢',
        '吹过我们曾经 并肩走过的桥',
        '如果时间倒退 我还会不会走',
        '走到你身边 不再放手',
      ],
    },
  ];

  const withLyrics = (song) => ({
    ...song,
    lyrics: song.lyricLines.map((text, index) => ({ t: index * 12, text })),
  });

  const SONGS = SONG_DATA.map(withLyrics);

  const MEMBER_DATA = [
    { id: 'dake', name: '知之Dake', initial: '之', role: 'owner', colors: ['#fbbf24', '#f472b6'], bio: '把耳机分你一半，今晚也一起听歌。', mic: true, speaking: false },
    { id: 'xiaolu', name: '小鹿', initial: '鹿', role: 'admin', colors: ['#34d399', '#06b6d4'], bio: '今晚也要开心，禁止偷偷 emo。', mic: true, speaking: true },
    { id: 'me', name: '你', initial: '你', role: 'me', colors: ['#8a5cff', '#00beff'], bio: '正在听歌，偶尔接一句。', mic: true, speaking: false, self: true },
    { id: 'aze', name: '阿泽', initial: '泽', role: 'member', colors: ['#6366f1', '#a855f7'], bio: '低音炮选手，副歌交给我。', mic: true, speaking: false },
    { id: 'momo', name: 'Momo', initial: 'M', role: 'member', colors: ['#f472b6', '#fb7185'], bio: 'R&B 和晚风，缺一不可。', mic: false, speaking: false },
    { id: 'night', name: '夜航星', initial: '星', role: 'member', colors: ['#38bdf8', '#6366f1'], bio: '夜猫子，凌晨三点还在线。', mic: true, speaking: false },
    { id: 'xiaye', name: '夏夜', initial: '夏', role: 'member', colors: ['#f59e0b', '#ef4444'], bio: '安静听歌的听众。', mic: false, speaking: false },
    { id: 'luming', name: '鹿鸣', initial: '鸣', role: 'member', colors: ['#10b981', '#84cc16'], bio: '在公屏潜水，在副歌冒泡。', mic: false, speaking: false },
    { id: 'cola', name: '可乐', initial: '可', role: 'member', colors: ['#f97316', '#fbbf24'], bio: '加冰，谢谢。', mic: false, speaking: false },
    { id: 'shiyi', name: '十一', initial: '十', role: 'member', colors: ['#a78bfa', '#f472b6'], bio: '耳机是本体。', mic: false, speaking: false },
    { id: 'mumu', name: '木木', initial: '木', role: 'member', colors: ['#22d3ee', '#3b82f6'], bio: '刚下班，来听一首再睡。', mic: false, speaking: false },
    { id: 'ali', name: '阿离', initial: '离', role: 'member', colors: ['#fb7185', '#f59e0b'], bio: '点歌台常驻嘉宾。', mic: false, speaking: false },
  ];

  const SEAT_DATA = [
    { id: 'main', memberId: 'dake' },
    { id: 's1', memberId: 'xiaolu' },
    { id: 's2', memberId: 'me' },
    { id: 's3', memberId: 'aze' },
    { id: 's4', memberId: 'momo' },
    { id: 's5', memberId: 'night' },
    { id: 's6', memberId: null },
  ];

  const SEAT_IDS = ['main', 's1', 's2', 's3', 's4', 's5', 's6'];

  const INITIAL_MESSAGES = [
    { type: 'system', text: '欢迎来到「深夜电台」，请文明聊天，禁止刷屏～' },
    { type: 'text', memberId: 'xiaolu', text: '今晚这首《唯一》也太好听了', time: '21:42' },
    { type: 'text', memberId: 'aze', text: '房主的声音好温柔，耳机已戴好', time: '21:43' },
    { type: 'text', memberId: 'me', text: '一起听歌的感觉真好', time: '21:43' },
    { type: 'text', memberId: 'momo', text: '点了一首《晴天》，等下一起听', time: '21:44' },
    { type: 'system', text: '夜航星 加入了房间' },
    { type: 'text', memberId: 'night', text: '刚进来就赶上好歌，运气不错', time: '21:45' },
  ];

  const EMOJIS = [
    '😀', '😂', '🥹', '😍', '😎', '🤔',
    '🥳', '😭', '😴', '🤯', '👍', '👏',
    '🙌', '🔥', '✨', '🎵', '🎧', '💜',
    '🌙', '🍻', '🐶', '🐱', '🌸', '⭐',
  ];

  const FALLBACK_SONGS = ['红豆', '演员', '小幸运', '稻香', '告白气球', '想你的夜'];

  /* -------------------------------------------------------
     全局状态
     ------------------------------------------------------- */
  const state = {
    mode: 'demo',
    gateOpen: true,
    gateView: 'login',
    authMode: 'login',
    auth: null,
    myProfile: null,
    busy: false,
    roomList: [],
    roomsLoading: false,
    pendingRoomId: '',
    autoJoinAttempted: false,

    // 演示态
    seats: [],
    members: [],
    songs: [],
    messages: [],
    seatMode: 'normal',
    songIndex: 0,
    progress: 78,
    playing: true,
    speakerOn: true,
    speakerVolume: 68,
    micVolume: 76,
    activeLyric: -1,
    emojiOpen: false,
    replied: false,

    // 真实房间
    room: null,
    roomId: '',
    lkRoom: null,
    connectState: 'offline',
    livekitUrl: '',
    lastConnectError: '',
    leaving: false,
    myIdentity: 'me',
    myName: '你',
    ownerIdentity: 'dake',
    isRoomHost: false,
    isGlobalAdmin: false,
    isRootSuper: false,
    adminIdentities: [],
    pendingSeatRequests: [],
    mySeatRequest: null,
    mySeatRequestState: 'none',
    liveQueue: [],
    currentTrack: null,
    songResults: [],
    liveLyrics: { lines: [], currentIndex: -1, songTitle: '', songArtist: '', time: 0 },
    lyricChunks: new Map(),
    chatIds: new Set(),
    messageKeys: new Set(),
    historyAvatars: {},
    profileCache: new Map(),
    liveSeatMode: 'normal',
    micEnabled: false,
    micBusy: false,
    badWords: [],
    historyLoaded: false,
  };

  /* -------------------------------------------------------
     查询辅助
     ------------------------------------------------------- */
  const memberById = (id) => state.members.find((member) => member.id === id);
  const seatById = (id) => state.seats.find((seat) => seat.id === id);
  const seatOfMember = (id) => state.seats.find((seat) => seat.memberId === id);
  const mySeat = () => seatOfMember(state.myIdentity);
  const currentSong = () => (state.mode === 'live' ? state.currentTrack : state.songs[state.songIndex]);

  const seatLabel = (seatId) => {
    if (seatId === 'main') return '主麦';
    const index = state.seats.filter((seat) => seat.id !== 'main').findIndex((seat) => seat.id === seatId);
    return index >= 0 ? `${index + 1} 号麦` : '麦位';
  };

  const toWireSeatId = (id) => {
    if (id === 'main') return 'main';
    if (/^s[1-6]$/.test(String(id))) return `small-${String(id).slice(1)}`;
    return id;
  };

  const fromWireSeatId = (id) => {
    if (id === 'main') return 'main';
    if (/^small-[1-6]$/.test(String(id))) return `s${String(id).slice(6)}`;
    if (/^s[1-6]$/.test(String(id))) return id;
    return id;
  };

  const buildEmptySeats = () => SEAT_IDS.map((id) => ({ id, memberId: null, ts: 0 }));

  const emptyLiveLyrics = () => ({
    lines: [],
    currentIndex: -1,
    songTitle: '',
    songArtist: '',
    time: 0,
  });

  const isOwnerSender = (identity) => Boolean(identity) && identity === state.ownerIdentity;

  /**
   * 歌词来源身份：房主，或当前坐在主麦上的 DJ。
   * 桌面端只有「房主 / 主麦上正在放歌的 DJ」会广播歌词（浏览器无法读酷狗词库），
   * 这里保持同一套判定，否则网页端永远收不到歌词。
   */
  const isLyricSourceSender = (identity) => {
    if (!identity) return false;
    if (isOwnerSender(identity)) return true;
    const main = seatById('main');
    return Boolean(main && main.memberId === identity);
  };

  const isGlobalAdminSender = (identity) => {
    if (!identity) return false;
    if (isOwnerSender(identity)) return true;
    const member = memberById(identity);
    return Boolean(member && (member.isRootSuper || member.isPlatformAdmin));
  };

  const isSeatAdminSender = (identity) =>
    isGlobalAdminSender(identity) || state.adminIdentities.includes(identity);

  const amSeatAdmin = () =>
    isGlobalAdminSender(state.myIdentity) || state.adminIdentities.includes(state.myIdentity);

  const parseMetadata = (metadata) => {
    if (!metadata) return {};
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  /* -------------------------------------------------------
     通用渲染
     ------------------------------------------------------- */
  const messageMember = (message) => {
    const member = message.memberId ? memberById(message.memberId) : null;
    if (member) return member;
    const rawId = String(message.memberId || '');
    const cache = rawId ? state.profileCache.get(rawId.replace(/^user_/, '')) : null;
    return {
      id: rawId,
      name: message.senderName || '成员',
      initial: initialOf(message.senderName || '?'),
      colors: paletteFor(rawId || message.senderName || 'member'),
      avatar: cleanAvatar(state.historyAvatars[rawId] || cache?.avatar),
      bio: cache?.bio || '',
      role: 'member',
      mic: false,
      speaking: false,
      self: false,
    };
  };

  const avatarHtml = (member, size = '') => {
    if (!member) {
      return `<span class="avatar ${size} empty">${icon('user')}</span>`;
    }
    const colors = member.colors || paletteFor(member.id || member.name);
    const style = `--a:${escapeHtml(colors[0])};--b:${escapeHtml(colors[1])}`;
    const avatar = cleanAvatar(member.avatar);
    if (avatar) {
      return `<span class="avatar ${size} has-photo" style="${style}"><img src="${escapeHtml(avatar)}" alt=""></span>`;
    }
    return `<span class="avatar ${size}" style="${style}">${escapeHtml(
      member.initial || initialOf(member.name),
    )}</span>`;
  };

  const badgeIcon = (member) => {
    if (!member) return '';
    if (member.role === 'owner') {
      return `<span class="role-ico owner" title="房主">${icon('crown')}</span>`;
    }
    if (member.role === 'admin') {
      return `<span class="role-ico admin" title="管理员">${icon('shield')}</span>`;
    }
    if (member.role === 'me') {
      return '<span class="role-ico me" title="我">我</span>';
    }
    return '';
  };

  const memberStatus = (member) => {
    if (member.speaking) return '正在说话';
    const seat = seatOfMember(member.id);
    if (seat) return `${seatLabel(seat.id)} · ${member.mic ? '开麦' : '闭麦'}`;
    if (member.self) return member.mic ? '听众 · 麦克风已开' : '听众';
    if (member.role === 'owner') return '房主 · 听众';
    if (member.role === 'admin') return '管理员 · 听众';
    return '听众';
  };

  /* -------------------------------------------------------
     座位渲染
     ------------------------------------------------------- */
  const hostCard = (seat) => {
    const member = seat?.memberId ? memberById(seat.memberId) : null;
    const classes = ['host-card'];
    if (!member) classes.push('is-empty');
    if (member && member.speaking) classes.push('is-speaking');

    const avatar = member
      ? avatarHtml(member, 'xl') +
        `<span class="seat-mic-badge ${member.mic ? 'on' : 'off'}">${icon(member.mic ? 'mic' : 'mic-off')}</span>`
      : avatarHtml(null, 'xl');

    const meta = member
      ? `<span class="tag ${
          member.role === 'owner' ? 'tag-gold' : member.role === 'admin' ? 'tag-blue' : ''
        }">${member.role === 'owner' ? '房主' : member.role === 'admin' ? '管理员' : '成员'}</span><span class="host-live">${
          member.speaking ? '正在说话' : member.mic ? '在麦上' : '已闭麦'
        }</span>`
      : '<span class="tag tag-violet">主座</span><span class="host-live">点击申请</span>';

    return `<div class="${classes.join(' ')}" data-seat="${seat?.id || 'main'}" role="button" tabindex="0" aria-label="${
      member ? escapeHtml(member.name) : '空主座'
    }">
      <span class="host-avatar-wrap">
        ${member && member.speaking ? '<span class="speaking-ring"></span>' : ''}
        ${avatar}
      </span>
      <span class="host-info">
        <span class="host-name"><span>${member ? escapeHtml(member.name) : '虚位以待'}</span>${
          member ? badgeIcon(member) : ''
        }</span>
        <span class="host-bio">${member ? escapeHtml(member.bio || '这个人很懒，什么都没写') : '点击上麦，成为今天的 DJ'}</span>
        <span class="host-meta">${meta}</span>
      </span>
    </div>`;
  };

  const smallSeatHtml = (seat) => {
    const member = seat?.memberId ? memberById(seat.memberId) : null;
    if (!member) {
      return `<div class="seat is-empty" data-seat="${seat.id}" role="button" tabindex="0" aria-label="空麦位，点击申请上麦">
        <span class="seat-avatar-wrap"><span class="avatar seat-avatar empty">${icon('user')}</span></span>
        <span class="seat-name">虚位以待</span>
        <span class="seat-sub">点击申请</span>
      </div>`;
    }

    const classes = ['seat'];
    if (member.speaking) classes.push('is-speaking');
    if (member.self) classes.push('is-me');
    if (member.role === 'owner') classes.push('is-owner');
    if (!member.mic) classes.push('is-muted');

    return `<div class="${classes.join(' ')}" data-seat="${seat.id}" role="button" tabindex="0" aria-label="${escapeHtml(
      member.name,
    )}">
      <span class="seat-avatar-wrap">
        ${member.speaking ? '<span class="speaking-ring"></span>' : ''}
        ${avatarHtml(member, 'seat-avatar')}
        <span class="seat-mic-badge ${member.mic ? 'on' : 'off'}">${icon(member.mic ? 'mic' : 'mic-off')}</span>
      </span>
      <span class="seat-name">${escapeHtml(member.name)}${badgeIcon(member)}</span>
      <span class="seat-sub">${member.speaking ? '正在说话' : member.mic ? '在麦上' : '已闭麦'}</span>
    </div>`;
  };

  const renderSeats = () => {
    const main = seatById('main');
    if (!main) return;
    const smallSeats = state.seats.filter((seat) => seat.id !== 'main');
    setHtml(
      '#seatNormal',
      `<div class="host-row">${hostCard(main)}</div><div class="seat-grid">${smallSeats
        .map(smallSeatHtml)
        .join('')}</div>`,
    );

    let duetSmallSeats = smallSeats.slice(1, 5);
    const mine = mySeat();
    const promotedSeat = smallSeats[0];
    if (
      mine &&
      mine.id !== 'main' &&
      mine.id !== promotedSeat?.id &&
      !duetSmallSeats.some((seat) => seat.id === mine.id)
    ) {
      duetSmallSeats = duetSmallSeats.slice(0, 3).concat(mine);
    }
    setHtml(
      '#seatDuet',
      `<div class="duet-row">${hostCard(main)}<span class="vs-badge">VS</span>${hostCard(
        smallSeats[0],
      )}</div><div class="seat-grid duet-grid">${duetSmallSeats.map(smallSeatHtml).join('')}</div>`,
    );

    const normal = $('#seatNormal');
    const duet = $('#seatDuet');
    if (normal) normal.hidden = state.seatMode !== 'normal';
    if (duet) duet.hidden = state.seatMode !== 'duet';
    applySeatModeUI();
  };

  const renderSeatApprovals = () => {
    const box = $('#seatApprovals');
    if (!box) return;
    if (state.mode !== 'live' || !amSeatAdmin() || !state.pendingSeatRequests.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const requests = [...state.pendingSeatRequests].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    box.hidden = false;
    box.innerHTML =
      `<div class="seat-approval-title">${icon('shield')}上麦申请 · ${requests.length}</div>` +
      requests
        .map((req) => {
          const name = req.name || memberById(req.identity)?.name || '成员';
          return `<div class="seat-approval-row">
            <span class="seat-approval-name"><b>${escapeHtml(name)}</b><i>${escapeHtml(
              seatLabel(fromWireSeatId(req.seatId)),
            )}</i></span>
            <button class="seat-approval-btn ok" data-seat-approve="${escapeHtml(req.reqId)}">同意</button>
            <button class="seat-approval-btn no" data-seat-reject="${escapeHtml(req.reqId)}">拒绝</button>
          </div>`;
        })
        .join('');
  };

  const applySeatModeUI = () => {
    const stage = $('#seatStage');
    if (stage) stage.dataset.mode = state.seatMode;
    setText('#roomModeTag', state.seatMode === 'duet' ? '对唱模式' : '普通模式');
    setText('#seatModeBtnText', state.seatMode === 'duet' ? '普通' : '对唱');
    const button = $('#seatModeBtn');
    if (button) {
      const canChange = canManageSeatMode();
      button.disabled = !canChange;
      button.title = canChange ? '切换普通 / 对唱模式' : '只有房主或管理员可以切换模式';
    }
  };

  const updateCounts = () => {
    const count = state.members.length;
    setText('#memberCount', count);
    setText('#chatOnline', count);
    setText('#topOnline', count);
    setText('#dockLive', count);
  };

  const renderMembers = () => {
    updateCounts();
    const list = $('#memberList');
    if (!list) return;
    list.innerHTML = state.members
      .map(
        (member) => `<li class="member ${member.self ? 'is-me' : ''}" data-member="${escapeHtml(
          member.id,
        )}" role="button" tabindex="0">
          <span class="member-avatar-wrap">
            ${avatarHtml(member, 'sm')}
            ${member.speaking ? '<span class="speaking-dot"></span>' : ''}
          </span>
          <span class="member-copy">
            <span class="member-name">${escapeHtml(member.name)}${badgeIcon(member)}</span>
            <span class="member-status ${member.speaking ? 'is-speaking' : ''}">${escapeHtml(
              memberStatus(member),
            )}</span>
          </span>
          <span class="member-mic ${member.mic ? 'on' : 'off'}">${icon(member.mic ? 'mic' : 'mic-off')}</span>
        </li>`,
      )
      .join('');
  };

  /* -------------------------------------------------------
     公屏
     ------------------------------------------------------- */
  const renderMessages = () => {
    const box = $('#chatMessages');
    if (!box) return;
    if (!state.messages.length) {
      box.innerHTML = '<div class="chat-empty">还没有消息，来打个招呼吧</div>';
      return;
    }
    box.innerHTML = state.messages
      .map((message) => {
        if (message.type === 'system') {
          return `<div class="system-msg">${escapeHtml(message.text)}</div>`;
        }
        const member = messageMember(message);
        const mine = Boolean(
          (message.memberId && message.memberId === state.myIdentity) || message.memberId === 'me',
        );
        return `<div class="chat-row ${mine ? 'mine' : ''}">
          ${avatarHtml(member, 'xs')}
          <div class="chat-bubble-wrap">
            <div class="chat-meta"><b>${escapeHtml(member.name)}</b><span>${escapeHtml(
              message.time || '',
            )}</span></div>
            <div class="chat-bubble">${escapeHtml(message.text)}</div>
          </div>
        </div>`;
      })
      .join('');
    box.scrollTop = box.scrollHeight;
  };

  /* -------------------------------------------------------
     歌词 / 播放
     ------------------------------------------------------- */
  const activeLyricLines = () => {
    if (state.mode === 'live') return state.liveLyrics.lines;
    return currentSong()?.lyrics || [];
  };

  const lyricIndex = () => {
    if (state.mode === 'live') {
      const lines = state.liveLyrics.lines;
      const index = Number(state.liveLyrics.currentIndex);
      return Number.isInteger(index) && index >= 0 && index < lines.length ? index : -1;
    }
    const lyrics = currentSong()?.lyrics || [];
    let index = -1;
    for (let i = 0; i < lyrics.length; i += 1) {
      if (state.progress >= lyrics[i].t) index = i;
    }
    return index;
  };

  const updateLyrics = (force = false) => {
    const body = $('#lyricsBody');
    if (!body) return;
    const lines = $$('.lyric-line', body);
    if (!lines.length) {
      state.activeLyric = -1;
      return;
    }
    const index = lyricIndex();
    lines.forEach((line, i) => {
      line.classList.toggle('active', i === index);
      line.classList.toggle('near', index >= 0 && Math.abs(i - index) === 1);
    });
    if (index !== state.activeLyric || force) {
      state.activeLyric = index;
      const target = lines[index];
      if (target) {
        const top = target.offsetTop - body.clientHeight / 2 + target.clientHeight / 2;
        try {
          body.scrollTo({ top: Math.max(0, top), behavior: force ? 'auto' : 'smooth' });
        } catch {
          body.scrollTop = Math.max(0, top);
        }
      }
    }
  };

  const updateLyricSyncStatus = () => {
    const element = $('#lyricSyncStatus');
    if (!element) return;
    if (state.mode === 'live') {
      const hasLyrics = state.liveLyrics.lines.length > 0;
      element.classList.toggle('waiting', !hasLyrics);
      element.innerHTML = `<i></i>${hasLyrics ? '歌词已同步' : '等待桌面端歌词'}`;
      return;
    }
    element.classList.remove('waiting');
    element.innerHTML = '<i></i>歌词已同步';
  };

  const renderLyrics = () => {
    const body = $('#lyricsBody');
    if (!body) return;
    if (state.mode === 'live') {
      const lines = state.liveLyrics.lines;
      const title = state.currentTrack?.title || state.liveLyrics.songTitle || '等待歌曲';
      const artist = state.currentTrack?.artist || state.liveLyrics.songArtist || 'DakeMusic';
      setText('#lyricTitle', title);
      setText('#lyricArtist', artist);
      updateLyricSyncStatus();
      if (!lines.length) {
        body.innerHTML = `<div class="lyric-empty">还没有收到歌词<span>歌词由桌面端（房主或主麦 DJ）播放歌曲后广播过来</span></div>`;
        state.activeLyric = -1;
        const eq = $('#equalizer');
        if (eq) eq.classList.toggle('paused', !state.playing);
        return;
      }
      body.innerHTML = lines
        .map((line, index) => `<div class="lyric-line" data-line="${index}">${escapeHtml(line.text)}</div>`)
        .join('');
      state.activeLyric = -1;
      updateLyrics(true);
      const eq = $('#equalizer');
      if (eq) eq.classList.toggle('paused', !state.playing);
      return;
    }

    const song = currentSong();
    if (!song) return;
    setText('#lyricTitle', song.title);
    setText('#lyricArtist', song.artist);
    body.innerHTML = song.lyrics
      .map((line, index) => `<div class="lyric-line" data-line="${index}">${escapeHtml(line.text)}</div>`)
      .join('');
    state.activeLyric = -1;
    updateLyrics(true);
    updateLyricSyncStatus();
    const eq = $('#equalizer');
    if (eq) eq.classList.toggle('paused', !state.playing);
  };

  const renderNow = () => {
    const track = state.mode === 'live' ? state.currentTrack : currentSong();
    if (state.mode === 'live') {
      const title = track?.title || state.liveLyrics.songTitle || '等待开播';
      const artist = track?.artist || state.liveLyrics.songArtist || 'DakeMusic';
      setText('#nowTitle', title);
      setText('#nowArtist', artist);
      setText('#drawerTitle', title);
      setText('#drawerArtist', artist);
      setText('#lyricTitle', title);
      setText('#lyricArtist', artist);
      const cover = cleanAvatar(track?.cover) || state.room?.coverImage || 'assets/dakemusic-default-room-cover.png';
      const image = $('.np-cover img');
      if (image) image.src = cover;
      return;
    }
    if (!track) return;
    setText('#nowTitle', track.title);
    setText('#nowArtist', track.artist);
    setText('#drawerTitle', track.title);
    setText('#drawerArtist', track.artist);
    setText('#lyricTitle', track.title);
    setText('#lyricArtist', track.artist);
    const image = $('.np-cover img');
    if (image) image.src = 'assets/dakemusic-default-room-cover.png';
  };

  const updateProgress = () => {
    const song = currentSong();
    const duration = Math.max(0, Number(song?.duration) || 0);
    const progress = Math.max(0, Number(state.progress) || 0);
    const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
    ['#progressFill', '#drawerProgressFill'].forEach((selector) => {
      const element = $(selector);
      if (element) element.style.width = `${percent}%`;
    });
    const thumb = $('.progress-thumb');
    if (thumb) thumb.style.left = `${percent}%`;
    setText('#currentTime', formatTime(progress));
    setText('#totalTime', formatTime(duration));
    setText('#drawerCurrentTime', formatTime(progress));
    setText('#drawerTotalTime', formatTime(duration));
    const track = $('#progressTrack');
    if (track) track.setAttribute('aria-valuenow', String(Math.round(percent)));
  };

  const renderQueue = () => {
    const list = $('#queueList');
    if (!list) return;

    if (state.mode === 'live') {
      const items = [];
      if (state.currentTrack) items.push({ kind: 'current', track: state.currentTrack });
      state.liveQueue.forEach((song, index) => items.push({ kind: 'queue', song, index }));
      if (!items.length) {
        list.innerHTML = '<li class="queue-empty">队列还是空的<br><span>让房主在桌面端点一首歌吧</span></li>';
        setText('#queueCount', '0 首');
        return;
      }
      list.innerHTML = items
        .map((item) => {
          if (item.kind === 'current') {
            const track = item.track;
            const requester = track.requestedByName ? `${track.requestedByName} 点歌` : '房间播放';
            return `<li class="queue-item is-current" data-current="1">
              <span class="queue-no"><span class="mini-eq"><i></i><i></i><i></i></span></span>
              <span class="queue-art"><span class="queue-cover">${icon('music')}</span></span>
              <span class="queue-info"><strong>${escapeHtml(track.title || '未知歌曲')}</strong><span>${escapeHtml(
                track.artist || '未知歌手',
              )} · ${escapeHtml(requester)}</span></span>
              <span class="queue-duration">${formatTime(track.duration)}</span>
              <button class="queue-action" data-live-play aria-label="暂停">${icon(
                state.playing ? 'pause' : 'play',
              )}</button>
            </li>`;
          }
          const song = item.song;
          const canDelete =
            state.isRoomHost ||
            (song.requestedBy != null && String(song.requestedBy) === String(state.auth?.userId));
          return `<li class="queue-item" data-queue-index="${item.index}">
            <span class="queue-no">${String(item.index + 1).padStart(2, '0')}</span>
            <span class="queue-art"><span class="queue-cover">${icon('music')}</span></span>
            <span class="queue-info"><strong>${escapeHtml(song.title || '未知歌曲')}</strong><span>${escapeHtml(
              song.artist || '未知歌手',
            )} · ${escapeHtml(song.requestedByName ? `${song.requestedByName} 点歌` : '房间点歌')}</span></span>
            <span class="queue-duration">${formatTime(song.duration)}</span>
            ${
              canDelete
                ? `<button class="queue-action danger" data-remove-queue="${item.index}" aria-label="移出队列">${icon(
                    'trash',
                  )}</button>`
                : ''
            }
          </li>`;
        })
        .join('');
      setText('#queueCount', `${items.length} 首`);
      return;
    }

    list.innerHTML = state.songs
      .map((song, index) => {
        const current = index === state.songIndex;
        return `<li class="queue-item ${current ? 'is-current' : ''}" data-song="${index}">
          <span class="queue-no">${
            current ? '<span class="mini-eq"><i></i><i></i><i></i></span>' : String(index + 1).padStart(2, '0')
          }</span>
          <span class="queue-art"><span class="queue-cover">${icon('music')}</span></span>
          <span class="queue-info"><strong>${escapeHtml(song.title)}</strong><span>${escapeHtml(
            song.artist,
          )} · ${escapeHtml(song.requester)}</span></span>
          <span class="queue-duration">${formatTime(song.duration)}</span>
          <button class="queue-action" data-play="${index}" aria-label="${
            current ? (state.playing ? '暂停' : '播放') : '播放'
          }">${icon(current && state.playing ? 'pause' : 'play')}</button>
        </li>`;
      })
      .join('');
    setText('#queueCount', `${state.songs.length} 首`);
  };

  const updatePlayButton = () => {
    const label = state.playing ? '暂停' : '播放';
    $$('[data-action="toggle-play"]').forEach((button) => {
      button.innerHTML = icon(state.playing ? 'pause' : 'play');
      button.setAttribute('aria-label', label);
    });
    const eq = $('#equalizer');
    if (eq) eq.classList.toggle('paused', !state.playing);
    const npEq = $('.np-eq');
    if (npEq) npEq.classList.toggle('paused', !state.playing);
    const currentAction = $('#queueList .queue-item.is-current .queue-action');
    if (currentAction) {
      currentAction.innerHTML = icon(state.playing ? 'pause' : 'play');
      currentAction.setAttribute('aria-label', label);
    }
  };

  const updateDock = () => {
    const me = memberById(state.myIdentity) || { mic: state.micEnabled };
    const micOn = state.mode === 'live' ? state.micEnabled : Boolean(me.mic);
    const micBtn = $('#micBtn');
    if (micBtn) {
      const active = Boolean(mySeat()) && micOn;
      micBtn.classList.toggle('on', active);
      micBtn.classList.toggle('off', !micOn);
      micBtn.innerHTML = icon(micOn ? 'mic' : 'mic-off');
      if (!mySeat()) micBtn.setAttribute('aria-label', '上麦后才能开麦');
      else micBtn.setAttribute('aria-label', micOn ? '闭麦' : '开麦');
    }

    const speakerBtn = $('#speakerBtn');
    if (speakerBtn) {
      speakerBtn.classList.toggle('on', state.speakerOn);
      speakerBtn.classList.toggle('off', !state.speakerOn);
      speakerBtn.innerHTML = icon(state.speakerOn ? 'speaker' : 'speaker-off');
      speakerBtn.setAttribute('aria-label', state.speakerOn ? '静音房间声音' : '恢复房间声音');
    }

    setText('#micVolVal', state.micVolume);
    setText('#speakerVolVal', state.speakerVolume);
    const micVol = $('#micVol');
    if (micVol && document.activeElement !== micVol) micVol.value = String(state.micVolume);
    const speakerVol = $('#speakerVol');
    if (speakerVol && document.activeElement !== speakerVol) speakerVol.value = String(state.speakerVolume);
    const settingsMicVol = $('#settingsMicVol');
    if (settingsMicVol && document.activeElement !== settingsMicVol) settingsMicVol.value = String(state.micVolume);
    const settingsSpeakerVol = $('#settingsSpeakerVol');
    if (settingsSpeakerVol && document.activeElement !== settingsSpeakerVol) {
      settingsSpeakerVol.value = String(state.speakerVolume);
    }
  };

  const renderEmojis = () => {
    setHtml(
      '#emojiPop',
      EMOJIS.map(
        (emoji) => `<button type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`,
      ).join(''),
    );
  };

  const renderAll = () => {
    renderSeats();
    renderMembers();
    renderMessages();
    renderQueue();
    renderNow();
    renderLyrics();
    updateProgress();
    updatePlayButton();
    updateDock();
    renderSeatApprovals();
  };

  /* -------------------------------------------------------
     Toast / 房间信息
     ------------------------------------------------------- */
  function showToast(text, type = 'info') {
    const stack = $('#toastStack');
    if (!stack || !text) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(text)}</span>`;
    stack.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('out');
      window.setTimeout(() => toast.remove(), 240);
    }, 2800);
  }

  function setConnectionStatus(text, tone = '') {
    const element = $('#connectionStatus');
    if (!element) return;
    element.classList.toggle('warn', tone === 'warn');
    element.classList.toggle('off', tone === 'off');
    element.innerHTML = `<i></i>${escapeHtml(text)}`;
  }

  /** 语音未连接时的提示：区分「正在连接 / 连接失败 / 已断开」，避免只看到一句笼统的报错。 */
  function connectionBlockedMessage(action) {
    if (state.connectState === 'connecting') return `语音正在连接，请稍候再${action}`;
    if (state.connectState === 'failed') return '语音连接失败，正在返回房间列表，请稍后重试';
    return `语音已断开，请重新进入房间后再${action}`;
  }

  /* -------------------------------------------------------
     音频设备：读取系统真实设备，选择结果存 localStorage
     ------------------------------------------------------- */
  let audioPermissionState = 'unknown';

  const getSavedDevice = (key) => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };

  const setSavedDevice = (key, value) => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const supportsAudioOutputSelection = () =>
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  const applySinkToAudioElements = (deviceId) => {
    if (!supportsAudioOutputSelection()) return;
    $$('.lk-voice-audio').forEach((element) => {
      try {
        const result = element.setSinkId(deviceId || '');
        if (result?.catch) result.catch(() => {});
      } catch {
        /* ignore */
      }
    });
  };

  const setAudioTip = (text) => {
    const tip = $('#audioDeviceTip');
    if (!tip) return;
    const span = tip.querySelector('span');
    if (span) span.textContent = text;
    else tip.textContent = text;
  };

  const describeDeviceError = (error) => {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'SecurityError') return '麦克风权限被拒绝，无法读取设备名称';
    if (name === 'NotFoundError') return '没有检测到可用的音频设备';
    if (name === 'NotReadableError') return '音频设备被其他程序占用，暂时读不到设备列表';
    return `读取音频设备失败：${error?.message || '未知错误'}`;
  };

  const requestMicPermissionOnce = async () => {
    if (audioPermissionState !== 'unknown') return audioPermissionState === 'granted';
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      audioPermissionState = 'granted';
      return true;
    } catch (error) {
      audioPermissionState = 'denied';
      console.warn('[webroom] 麦克风授权失败', error);
      return false;
    }
  };

  const fillDeviceSelect = (select, devices, { prefix, saved, disabled = false }) => {
    if (!select) return;
    const options = [];
    // 只显示真实物理设备：跳过系统默认（default）/通信默认（communications）虚拟条目，
    // 也跳过 label 带「默认传 / 通信」视角的重复项；插一个耳机显示一条，
    // 声卡几条线显示几条，系统禁用的设备枚举不到自然隐藏
    devices
      .filter((device) => device.deviceId)
      .filter((device) => {
        const id = String(device.deviceId || '').trim();
        if (/^(default|communications)$/i.test(id)) return false;
        const label = String(device.label || '').trim();
        if (!label) return true;
        return !/(系统默认|默认设备|默认传|通信)/.test(label);
      })
      .forEach((device, index) => {
        // 去掉 Windows 设备名末尾的哈希后缀（如 (0d8c0359)），与桌面客户端显示保持一致
        let label = (device.label || `${prefix} ${index + 1}`)
          .replace(/\s*\([0-9a-f]{6,8}\)\s*$/i, '')
          .trim();
        options.push(`<option value="${escapeHtml(device.deviceId)}">${escapeHtml(label)}</option>`);
      });
    select.innerHTML = options.join('');
    select.value = saved && devices.some((device) => device.deviceId === saved) ? saved : '';
    select.disabled = disabled;
  };

  async function refreshAudioDevices(options = {}) {
    const { requestPermission = false } = options;
    const inputSelect = $('#audioInputSelect');
    const outputSelect = $('#audioOutputSelect');
    if (!inputSelect && !outputSelect) return;
    if (!navigator.mediaDevices?.enumerateDevices) {
      fillDeviceSelect(inputSelect, [], { prefix: '麦克风', saved: '' });
      fillDeviceSelect(outputSelect, [], { prefix: '扬声器', saved: '', disabled: true });
      setAudioTip('当前环境不支持读取音频设备，请用 Chrome / Edge / Safari 新版本并通过 https 打开。');
      return;
    }
    if (requestPermission) await requestMicPermissionOnce();
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (error) {
      setAudioTip(describeDeviceError(error));
      return;
    }
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    const outputs = devices.filter((device) => device.kind === 'audiooutput');
    const usableInputs = inputs.filter((device) => device.deviceId);
    const usableOutputs = outputs.filter((device) => device.deviceId);
    const outputSupported = supportsAudioOutputSelection();
    fillDeviceSelect(inputSelect, usableInputs, { prefix: '麦克风', saved: getSavedDevice(AUDIO_INPUT_KEY) });
    fillDeviceSelect(outputSelect, usableOutputs, {
      prefix: '扬声器',
      saved: getSavedDevice(AUDIO_OUTPUT_KEY),
      disabled: !outputSupported,
    });
    if (!inputs.length && !outputs.length) {
      setAudioTip('没有检测到音频设备，请检查耳机 / 麦克风是否已连接。');
    } else if (!usableInputs.length) {
      setAudioTip('还没拿到麦克风权限，暂时只能用系统默认设备；允许权限后可以选择具体麦克风。');
    } else if (!usableInputs.some((device) => device.label)) {
      setAudioTip('设备名暂时读不到（需要麦克风权限），但已可以按设备切换。');
    } else if (!outputSupported) {
      setAudioTip('当前浏览器不支持切换输出设备，请用系统音量键调节。');
    } else {
      setAudioTip('建议佩戴耳机，避免回声和啸叫。');
    }
  }

  async function resolveSavedAudioDevice(kind, key) {
    const saved = getSavedDevice(key);
    if (!saved || !navigator.mediaDevices?.enumerateDevices) return '';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === kind && device.deviceId === saved) ? saved : '';
    } catch {
      return '';
    }
  }

  async function applyAudioDevice(kind, deviceId) {
    setSavedDevice(kind === 'audioinput' ? AUDIO_INPUT_KEY : AUDIO_OUTPUT_KEY, deviceId);
    if (kind === 'audiooutput') applySinkToAudioElements(deviceId);
    const room = state.lkRoom;
    if (!room || state.connectState !== 'connected') {
      showToast('已保存，下次进房生效', 'success');
      return;
    }
    try {
      await room.switchActiveDevice(kind, deviceId || 'default', Boolean(deviceId));
      showToast(kind === 'audioinput' ? '已切换麦克风' : '已切换扬声器', 'success');
    } catch (error) {
      console.warn('[webroom] 切换音频设备失败', error);
      showToast(`切换设备失败：${error?.message || '未知错误'}`, 'warning');
    }
  }

  const setAuthError = (text) => {
    const element = $('#authError');
    if (!element) return;
    element.textContent = text || '';
    element.classList.remove('ok');
  };

  const setRoomError = (text) => {
    const element = $('#roomError');
    if (!element) return;
    element.textContent = text || '';
    element.classList.remove('ok');
  };

  const applyDemoInfo = () => {
    setText('#topRoomName', '深夜电台');
    setText('#roomName', '深夜电台');
    setText('#topOnline', state.members.length);
    setText('#roomOwner', '房主 · 知之Dake');
    setText('#roomIdText', 'ID 10086');
    const roomIdText = $('#roomIdText');
    if (roomIdText) roomIdText.title = '10086';
    setText(
      '#roomNotice',
      '今晚主题：把耳机分你一半。点歌请按顺序，上麦先打招呼，禁止刷屏～',
    );
    const cover = $('#roomCover');
    if (cover) cover.src = 'assets/dakemusic-default-room-cover.png';
    const npCover = $('.np-cover img');
    if (npCover) npCover.src = 'assets/dakemusic-default-room-cover.png';
    setText('#seatHint', '点击空位上麦 · 主座需房主同意');
    setHtml('#drawerTip', `${icon('info')}点歌后自动加入队列，房主或麦上成员可切歌`);
    const search = $('#songSearch');
    if (search) search.placeholder = '搜索歌曲 / 歌手';
    setHtml('#queueRefreshBtn', `${icon('trash')}<span>清空</span>`);
    setConnectionStatus('演示模式', 'warn');
    document.title = '深夜电台 · DakeMusic 语聊房';
    applySeatModeUI();
  };

  const applyLiveInfo = () => {
    const room = state.room;
    if (!room) return;
    setText('#topRoomName', room.name || '语聊房');
    setText('#roomName', room.name || '语聊房');
    setText('#roomOwner', `房主 · ${room.ownerNickname || room.ownerName || '未知'}`);
    setText('#roomIdText', `ID ${room.roomId || ''}`);
    const roomIdText = $('#roomIdText');
    if (roomIdText) roomIdText.title = room.roomId || '';
    const cover = $('#roomCover');
    if (cover) cover.src = room.coverImage || 'assets/dakemusic-default-room-cover.png';
    setText(
      '#roomNotice',
      room.description || `欢迎来到「${room.name || '语聊房'}」，文明聊天，一起听歌～`,
    );
    setText('#seatHint', '点击空位申请上麦 · 房主同意后入座');
    setHtml(
      '#drawerTip',
      `${icon('info')}点歌后自动加入队列，房主或麦上成员可切歌`,
    );
    const search = $('#songSearch');
    if (search) search.placeholder = '搜索歌曲 / 歌手';
    renderSongResults([]);
    setHtml('#queueRefreshBtn', `${icon('refresh')}<span>刷新</span>`);
    const modeButton = $('#seatModeBtn');
    if (modeButton) {
      const canChange = canManageSeatMode();
      modeButton.disabled = !canChange;
      modeButton.title = canChange ? '切换普通 / 对唱模式' : '只有房主或管理员可以切换模式';
    }
    if (state.connectState === 'connected') setConnectionStatus('语音已连接', '');
    else if (state.connectState === 'connecting') setConnectionStatus('正在连接语音…', 'warn');
    else if (state.connectState === 'failed') setConnectionStatus('语音连接失败', 'off');
    else if (state.connectState === 'disconnected') setConnectionStatus('语音已断开', 'off');
    else setConnectionStatus('未连接', 'warn');
    document.title = `${room.name || '语聊房'} · DakeMusic 语聊房`;
    applySeatModeUI();
  };

  function resetDemoState() {
    state.mode = 'demo';
    state.seats = SEAT_DATA.map((seat) => ({ ...seat, ts: 0 }));
    state.members = MEMBER_DATA.map((member) => ({ ...member, self: Boolean(member.self) }));
    state.songs = SONGS.map((song) => ({ ...song, lyrics: song.lyrics.map((line) => ({ ...line })) }));
    state.messages = INITIAL_MESSAGES.map((message) => ({ ...message }));
    state.seatMode = 'normal';
    state.songIndex = 0;
    state.progress = 78;
    state.playing = true;
    state.speakerOn = true;
    state.speakerVolume = 68;
    state.micVolume = 76;
    state.activeLyric = -1;
    state.emojiOpen = false;
    state.replied = false;

    state.room = null;
    state.roomId = '';
    state.lkRoom = null;
    state.connectState = 'offline';
    state.myIdentity = 'me';
    state.myName = '你';
    state.ownerIdentity = 'dake';
    state.isRoomHost = false;
    state.isGlobalAdmin = false;
    state.isRootSuper = false;
    state.adminIdentities = [];
    state.pendingSeatRequests = [];
    state.mySeatRequest = null;
    state.mySeatRequestState = 'none';
    state.liveQueue = [];
    state.currentTrack = null;
    state.songResults = [];
    state.liveLyrics = emptyLiveLyrics();
    state.lyricChunks = new Map();
    state.chatIds = new Set();
    state.messageKeys = new Set();
    state.historyAvatars = {};
    state.historyLoaded = false;
    state.badWords = [];
    state.micEnabled = true;
    state.micBusy = false;
    applyDemoInfo();
  }

  /* -------------------------------------------------------
     HTTP / 错误
     ------------------------------------------------------- */
  function describeError(error) {
    if (!error) return '请求失败';
    if (error.code === 'NETWORK') {
      return `无法连接 ${new URL(API_BASE).host}。请检查网络，并把当前网页来源 ${window.location.origin} 加入服务端 CORS_ORIGINS。`;
    }
    if (error.code === 'TIMEOUT') return '请求超时，请稍后重试。';
    const message = String(error.message || '').trim();
    if (/^BANNED$/i.test(message)) return '你已被该房间禁言，请联系房主或管理员解除。';
    if (message === '密码错误') return '房间密码不正确。';
    if (message === '房间不存在') return '房间不存在或已解散。';
    if (error.status === 403) return message || '没有权限执行该操作。';
    if (error.status === 404) return message || '请求的内容不存在。';
    return message || '请求失败';
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth !== false) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = Number(options.timeout) || 15_000;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeout) : null;

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
      });
    } catch (error) {
      const wrapped = new Error(
        error?.name === 'AbortError' ? '请求超时' : '网络请求失败',
      );
      wrapped.code = error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      throw wrapped;
    } finally {
      if (timer) window.clearTimeout(timer);
    }

    const raw = await response.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        const wrapped = new Error(`服务器返回异常（HTTP ${response.status}）`);
        wrapped.status = response.status;
        throw wrapped;
      }
    }
    if (!response.ok) {
      if (response.status === 401) clearToken();
      const wrapped = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      wrapped.status = response.status;
      wrapped.code = data.error || `HTTP_${response.status}`;
      throw wrapped;
    }
    return data || {};
  }

  const normalizeRoomId = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return '';
    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        const queryRoom = url.searchParams.get('room');
        if (queryRoom) raw = queryRoom;
        else {
          const match = url.pathname.match(/room_[A-Za-z0-9_]+/);
          if (match) raw = match[0];
        }
      }
    } catch {
      /* ignore */
    }
    const match = raw.match(/room_[A-Za-z0-9_]+/);
    if (match) return match[0];
    if (/^[A-Za-z0-9_]+$/.test(raw)) return `room_${raw}`;
    return raw;
  };

  const syncRoomUrl = (roomId) => {
    try {
      const url = new URL(window.location.href);
      if (roomId) url.searchParams.set('room', roomId);
      else url.searchParams.delete('room');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  };

  /* -------------------------------------------------------
     登录 / 选房
     ------------------------------------------------------- */
  const updateEntryUser = () => {
    const name = state.auth?.nickname || state.auth?.name || 'Dake';
    setText('#entryUserName', name);
    setText('#entryApiHost', new URL(API_BASE).host);
  };

  const setAuthBusy = (busy) => {
    state.busy = busy;
    const button = $('#authSubmit');
    if (!button) return;
    button.disabled = busy;
    const label = button.querySelector('span');
    if (label) {
      label.textContent = busy
        ? state.authMode === 'register'
          ? '注册中…'
          : '登录中…'
        : state.authMode === 'register'
          ? '注册并登录'
          : '登录';
    }
  };

  const setJoinBusy = (busy) => {
    state.busy = busy;
    const button = $('#joinRoomBtn');
    if (!button) return;
    button.disabled = busy;
    button.innerHTML = `${icon('door')}${busy ? '进入中…' : '进入'}`;
  };

  function setGateView(view) {
    if (view === 'rooms' && !state.auth) view = 'login';
    if (!['login', 'register', 'rooms'].includes(view)) view = 'login';
    state.gateView = view;
    const authView = $('#authView');
    const roomView = $('#roomView');
    if (authView) authView.hidden = view === 'rooms';
    if (roomView) roomView.hidden = view !== 'rooms';

    if (view === 'rooms') {
      updateEntryUser();
      setAuthError('');
      setRoomError('');
      document.title = '选择一个房间 · DakeMusic 语聊房';
      window.setTimeout(() => $('#roomIdInput')?.focus(), 80);
      return;
    }

    document.title = 'DakeMusic 语聊房 · 网页版';

    state.authMode = view;
    const register = view === 'register';
    setText('#authTitle', register ? '创建 DakeMusic 账号' : '登录后进入房间');
    setText(
      '#authSubtitle',
      register
        ? '注册后即可进入房间，和桌面端共用账号、麦位与歌词。'
        : '使用 DakeMusic 账号，和桌面端共享同一间房、同一份歌词。',
    );
    setText('#authSwitchText', register ? '已有账号？' : '还没有账号？');
    setText('#toggleRegister', register ? '登录' : '注册');
    const nicknameRow = $('#registerNicknameRow');
    if (nicknameRow) nicknameRow.hidden = !register;
    const submitLabel = $('#authSubmit span');
    if (submitLabel) submitLabel.textContent = register ? '注册并登录' : '登录';
    const password = $('#loginPassword');
    if (password) password.autocomplete = register ? 'new-password' : 'current-password';
    setAuthError('');
    window.setTimeout(() => $('#loginName')?.focus(), 80);
  }

  function openGate(view) {
    state.gateOpen = true;
    const gate = $('#entryGate');
    if (gate) gate.classList.remove('is-hidden');
    setGateView(view || (state.auth ? 'rooms' : 'login'));
  }

  function closeGate() {
    state.gateOpen = false;
    const gate = $('#entryGate');
    if (gate) gate.classList.add('is-hidden');
  }

  async function initAuth() {
    // 不把托管房间 ID 直接填入输入框；房间名在 loadRooms 后按匹配解析显示

    const token = getToken();
    if (!token) {
      setGateView('login');
      if (state.pendingRoomId) {
        setAuthError(`登录后将自动进入房间 ${state.pendingRoomId}`);
      }
      return;
    }

    try {
      const me = await api('/api/auth/me');
      state.auth = me;
      state.myProfile = me;
      setGateView('rooms');
      updateEntryUser();
      await loadRooms();
      await maybeAutoJoin();
    } catch (error) {
      if (error.status === 401) {
        clearToken();
        state.auth = null;
        setGateView('login');
        if (state.pendingRoomId) setAuthError('登录已过期，请重新登录后进入房间');
      } else {
        setGateView('login');
        setAuthError(describeError(error));
      }
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (state.busy) return;
    const name = ($('#loginName')?.value || '').trim();
    const password = $('#loginPassword')?.value || '';
    const nickname = ($('#registerNickname')?.value || '').trim();
    const register = state.authMode === 'register';

    if (!name || !password) {
      setAuthError('请输入账号和密码');
      return;
    }
    if (register && !/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(name)) {
      setAuthError('账号需字母开头，3-20 位字母 / 数字 / 下划线');
      return;
    }
    if (register && password.length < 6) {
      setAuthError('密码至少 6 位');
      return;
    }

    setAuthError('');
    setAuthBusy(true);
    try {
      const body = register ? { name, password, nickname: nickname || undefined } : { name, password };
      const data = await api(register ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        auth: false,
        body,
      });
      if (!data.token) throw new Error('登录响应缺少 token');
      setToken(data.token);
      state.auth = data;
      state.myProfile = data;
      try {
        const me = await api('/api/auth/me');
        state.auth = { ...data, ...me };
        state.myProfile = me;
      } catch {
        /* 登录响应已经够用 */
      }
      const passwordInput = $('#loginPassword');
      if (passwordInput) passwordInput.value = '';
      setGateView('rooms');
      updateEntryUser();
      showToast(register ? '注册成功，欢迎加入' : `欢迎回来，${state.auth.nickname || name}`, 'success');
      setAuthBusy(false);
      await loadRooms();
      await maybeAutoJoin();
    } catch (error) {
      if (error.status === 401) setAuthError('账号或密码错误');
      else if (error.status === 409) setAuthError('账号已被注册，请直接登录');
      else setAuthError(describeError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function toggleAuthMode() {
    if (state.busy) return;
    setGateView(state.authMode === 'register' ? 'login' : 'register');
  }

  async function logout() {
    if (state.busy) return;
    await leaveCurrentRoom({ toGate: false, silent: true });
    clearToken();
    state.auth = null;
    state.myProfile = null;
    state.profileCache.clear();
    state.roomList = [];
    state.pendingRoomId = '';
    state.autoJoinAttempted = false;
    renderRoomList();
    openGate('login');
    showToast('已退出登录', 'info');
  }

  async function maybeAutoJoin() {
    if (state.autoJoinAttempted || !state.auth || state.mode === 'live') return;
    const roomId = state.pendingRoomId;
    if (!roomId) return;
    state.autoJoinAttempted = true;
    try {
      const room = await api(`/api/rooms/${encodeURIComponent(roomId)}`, { auth: false });
      const input = $('#roomIdInput');
      if (input) input.value = room.name || roomId;
      if (room.hasPassword) {
        const password = $('#roomPasswordInput');
        if (password && !password.value) {
          setRoomError('该房间需要密码，请输入后进入');
          password.focus();
          return;
        }
        await joinRoomFlow(roomId, password?.value || '');
        return;
      }
      await joinRoomFlow(roomId, '');
    } catch (error) {
      setRoomError(describeError(error));
    }
  }

  async function loadRooms() {
    if (!state.auth) {
      setGateView('login');
      return;
    }
    if (state.roomsLoading) return;
    state.roomsLoading = true;
    setRoomError('');
    setHtml('#roomPicker', '<div class="room-empty">正在加载房间…</div>');
    try {
      const data = await api('/api/rooms');
      state.roomList = Array.isArray(data.list) ? data.list : [];
      renderRoomList(Number(data.total) || state.roomList.length);
      // 输入框中的 room_xxx ID 自动替换为房间名；找不到则清空（避免显示托管房间号）
      const idInput = $('#roomIdInput');
      if (idInput && /^room_[A-Za-z0-9_]+$/i.test(idInput.value.trim())) {
        const current = state.roomList.find((room) => room.id === idInput.value.trim());
        if (current && current.name) idInput.value = current.name;
        else idInput.value = '';
      }
    } catch (error) {
      if (error.status === 401) {
        clearToken();
        state.auth = null;
        setGateView('login');
        setAuthError('登录已过期，请重新登录');
        return;
      }
      setRoomError(describeError(error));
      setHtml(
        '#roomPicker',
        '<div class="room-empty"><b>房间列表加载失败</b><span>点击上方「刷新」重试</span></div>',
      );
    } finally {
      state.roomsLoading = false;
    }
  }

  function renderRoomList(total) {
    const picker = $('#roomPicker');
    if (!picker) return;
    // 不公开托管服务的真实房间列表：不渲染任何房间卡片，也不暴露房间数量
    setText('#roomCount', 0);
    picker.innerHTML =
      '<div class="room-empty"><b>房间列表暂不公开</b><span>输入房间名 / 创建者，或粘贴分享链接进入。</span></div>';
  }

  async function joinRoomFlow(roomIdRaw, password = '') {
    if (state.busy) return false;
    if (!state.auth) {
      openGate('login');
      setAuthError('请先登录');
      return false;
    }
    const keyword = String(roomIdRaw || '').trim();
    if (!keyword) {
      setRoomError('请输入房间名、创建者，或粘贴房间链接');
      return false;
    }
    setRoomError('');

    // ① 优先按房间名 / 创建者匹配公开房间（不必输入难记的 room_xxx ID）
    const kw = keyword.toLowerCase();
    const matched = state.roomList.filter((room) => {
      const name = String(room.name || '').toLowerCase();
      const owner = String(room.ownerNickname || room.ownerName || '').toLowerCase();
      return name === kw || owner === kw || name.includes(kw) || owner.includes(kw);
    });
    if (matched.length === 1) {
      const room = matched[0];
      if (room.hasPassword && !password) {
        setRoomError(`房间「${room.name}」需要密码，请输入后重试`);
        $('#roomPasswordInput')?.focus();
        return false;
      }
      return joinRoomById(room.id, password);
    }
    if (matched.length > 1) {
      setRoomError(`找到 ${matched.length} 个匹配房间，请在下方列表中选择一个`);
      renderFilteredRooms(matched);
      return false;
    }

    // ② 名称无匹配时，才当作房间 ID / 分享链接解析
    const roomId = normalizeRoomId(keyword);
    if (!roomId) {
      setRoomError('没有找到该房间名或创建者，请从列表选择，或创建新房间');
      return false;
    }
    return joinRoomById(roomId, password);
  }

  async function joinRoomById(roomId, password) {
    setJoinBusy(true);
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        body: { password: password || '' },
      });
      setJoinBusy(false);
      enterLiveRoom(data);
      return true;
    } catch (error) {
      if (error.status === 401) {
        clearToken();
        state.auth = null;
        setGateView('login');
        setAuthError('登录已过期，请重新登录');
      } else {
        setRoomError(describeError(error));
        if (/密码/.test(error.message || '')) $('#roomPasswordInput')?.focus();
      }
      return false;
    } finally {
      setJoinBusy(false);
    }
  }

  function renderFilteredRooms(list, keyword = '') {
    const picker = $('#roomPicker');
    if (!picker) return;
    if (!Array.isArray(list) || !list.length) {
      picker.innerHTML =
        '<div class="room-empty"><b>没有匹配的房间</b><span>换个房间名或创建者再试试。</span></div>';
      return;
    }
    setText('#roomCount', `${list.length} 个匹配`);
    picker.innerHTML = list
      .map((room) => {
        const cover = cleanAvatar(room.coverImage) || 'assets/dakemusic-default-room-cover.png';
        const mode = room.seatMode === 'duet' ? '对唱' : '普通';
        return `<button class="room-pick" type="button" data-room-id="${escapeHtml(
          room.id,
        )}" data-has-password="${room.hasPassword ? '1' : '0'}">
          <span class="room-pick-cover"><img src="${escapeHtml(cover)}" alt=""></span>
          <span class="room-pick-copy">
            <strong>${escapeHtml(room.name || '未命名房间')}</strong>
            <span>房主 · ${escapeHtml(room.ownerNickname || room.ownerName || '未知')} · ${Number(
              room.participantCount,
            ) || 0} 人在线</span>
          </span>
          <span class="room-pick-side">
            ${room.hasPassword ? icon('lock') : ''}
            <em>${mode}</em>
          </span>
        </button>`;
      })
      .join('');
  }

  async function createRoom(event) {
    event.preventDefault();
    if (state.busy) return;
    if (!state.auth) {
      openGate('login');
      setAuthError('请先登录');
      return;
    }
    const name = ($('#newRoomName')?.value || '').trim();
    const password = $('#newRoomPassword')?.value || '';
    if (!name) {
      setRoomError('请输入房间名');
      return;
    }
    const button = $('#createRoomBtn');
    if (button) button.disabled = true;
    setRoomError('');
    try {
      const data = await api('/api/rooms', {
        method: 'POST',
        body: { name, description: '', password, coverImage: '' },
      });
      const idInput = $('#roomIdInput');
      if (idInput) idInput.value = name;
      const passwordInput = $('#roomPasswordInput');
      if (passwordInput) passwordInput.value = password;
      showToast('房间创建成功，正在进入…', 'success');
      await joinRoomFlow(data.id, password);
    } catch (error) {
      setRoomError(describeError(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* -------------------------------------------------------
     进入真实房间
     ------------------------------------------------------- */
  const makeSelfMember = () => {
    const name = state.myName;
    const role = state.isRoomHost ? 'owner' : state.isGlobalAdmin ? 'admin' : 'me';
    return {
      id: state.myIdentity,
      name,
      initial: initialOf(name),
      role,
      colors: paletteFor(state.myIdentity),
      bio: state.myProfile?.bio || state.auth?.bio || '这个人很懒，什么都没写',
      mic: false,
      speaking: false,
      self: true,
      account: state.auth?.name || '',
      avatar: cleanAvatar(state.myProfile?.avatar || state.auth?.avatar),
      isAdmin: Boolean(state.auth?.isAdmin),
      isPlatformAdmin: Boolean(state.auth?.isAdmin),
      isRootSuper: Boolean(state.auth?.isRootSuper),
      userId: state.auth?.userId || 0,
    };
  };

  function enterLiveRoom(join) {
    const identity = join.identity || `user_${state.auth?.userId || ''}`;
    state.mode = 'live';
    state.room = { ...join };
    state.roomId = join.roomId || '';
    state.myIdentity = identity;
    state.myName = join.myNickname || state.auth?.nickname || state.auth?.name || '我';
    state.ownerIdentity = join.ownerIdentity || '';
    state.isRoomHost = state.ownerIdentity
      ? state.ownerIdentity === state.myIdentity
      : Boolean(join.isOwner);
    state.isRootSuper = Boolean(state.auth?.isRootSuper);
    state.isGlobalAdmin =
      state.isRoomHost ||
      Boolean(join.isSuperAdmin) ||
      Boolean(state.auth?.isAdmin) ||
      state.isRootSuper;
    state.seatMode = join.seatMode === 'duet' ? 'duet' : 'normal';
    state.seats = buildEmptySeats();
    state.members = [makeSelfMember()];
    state.messages = [];
    state.messageKeys = new Set();
    state.chatIds = new Set();
    state.historyAvatars = {};
    state.historyLoaded = false;
    state.liveQueue = [];
    state.currentTrack = null;
    state.songResults = [];
    state.liveLyrics = emptyLiveLyrics();
    state.lyricChunks = new Map();
    state.adminIdentities = [];
    state.pendingSeatRequests = [];
    state.mySeatRequest = null;
    state.mySeatRequestState = 'none';
    state.micEnabled = false;
    state.micBusy = false;
    state.connectState = 'connecting';
    state.leaving = false;
    state.progress = 0;
    state.playing = false;
    state.activeLyric = -1;
    state.emojiOpen = false;
    state.replied = false;
    state.badWords = [];
    state.autoJoinAttempted = true;
    state.gateOpen = false;
    state.pendingRoomId = '';

    setLocal(LAST_ROOM_KEY, state.roomId);
    syncRoomUrl(state.roomId);
    applyLiveInfo();
    renderAll();
    closeGate();
    showToast(`已进入「${join.name || '语聊房'}」`, 'success');

    void loadHistory();
    void loadQueue();
    void loadBadWords();
    void connectLiveKit(join);
    window.setTimeout(() => {
      if (state.mode === 'live') void tryStartAudio();
    }, 900);
  }

  const friendlyLiveKitError = (error) => {
    const message = String(error?.message || error || '');
    if (/permission|notallowed|microphone/i.test(message)) return '麦克风权限被拒绝';
    if (/token|401|unauthorized|expired/i.test(message)) return '房间令牌无效或已过期，请重新进入';
    if (/websocket|network|failed to fetch|timeout|connect/i.test(message)) {
      return '无法连接 LiveKit 语音服务（网络或 WebSocket 被拦截）';
    }
    return message.slice(0, 160) || '未知错误';
  };

  async function connectLiveKit(join) {
    const LK = window.LivekitClient;
    if (!LK || !LK.Room) {
      state.connectState = 'failed';
      setConnectionStatus('语音组件未加载', 'off');
      showToast('LiveKit SDK 未加载，语音与实时同步不可用', 'error');
      window.setTimeout(() => {
        if (state.mode === 'live' && state.connectState === 'failed') {
          void leaveCurrentRoom({ toGate: true, reason: 'connect-failed' });
        }
      }, 2400);
      return;
    }

    try {
      const savedInput = await resolveSavedAudioDevice('audioinput', AUDIO_INPUT_KEY);
      const savedOutput = await resolveSavedAudioDevice('audiooutput', AUDIO_OUTPUT_KEY);
      const room = new LK.Room({
        adaptiveStream: true,
        dynacast: true,
        // 允许 LiveKit 自己处理短暂网络抖动；彻底断开时才走 Disconnected 回退
        reconnect: true,
        ...(savedInput ? { audioCaptureDefaults: { deviceId: savedInput } } : {}),
        ...(savedOutput ? { audioOutput: { deviceId: savedOutput } } : {}),
      });
      state.lkRoom = room;
      bindLiveKitEvents(room);
      setConnectionStatus('正在连接语音…', 'warn');
      const livekitUrl = resolveLivekitUrl(join.wsUrl);
      state.livekitUrl = livekitUrl;
      state.lastConnectError = '';
      const connectPromise = room.connect(livekitUrl, join.token);
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('连接超时（15 秒）')), 15000);
      });
      await Promise.race([connectPromise, timeoutPromise]);

      if (state.mode !== 'live' || state.roomId !== join.roomId || state.lkRoom !== room) {
        try {
          await room.disconnect();
        } catch {
          /* ignore */
        }
        return;
      }

      try {
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        /* 没有麦克风权限时仍然可以听歌和看公屏 */
      }
      state.micEnabled = false;
      state.connectState = 'connected';
      refreshMembersFromRoom();
      setConnectionStatus('语音已连接', '');
      if (state.isRoomHost) {
        window.setTimeout(() => {
          if (state.mode === 'live' && state.lkRoom === room) tryOwnerTakeMain();
        }, 900);
      }
      if (state.isGlobalAdmin) {
        window.setTimeout(() => {
          if (state.mode === 'live' && state.lkRoom === room) publishSeatModeTo();
        }, 1500);
      }
      document.addEventListener('pointerdown', handleAudioUnlock);
      window.setTimeout(() => {
        if (state.lkRoom === room && room.canPlaybackAudio === false) {
          showToast('点击页面任意位置开启房间声音', 'info');
        }
      }, 1100);
      void tryStartAudio();
    } catch (error) {
      console.error('[webroom] LiveKit connect failed', error);
      if (state.mode !== 'live' || state.roomId !== join.roomId) return;
      state.connectState = 'failed';
      state.lastConnectError = String(error?.message || error || '').slice(0, 300);
      if (state.lkRoom) {
        const failedRoom = state.lkRoom;
        state.lkRoom = null;
        try {
          await failedRoom.disconnect();
        } catch {
          /* ignore */
        }
      }
      setConnectionStatus('语音连接失败', 'off');
      showToast(`语音连接失败：${friendlyLiveKitError(error)}`, 'error');
      window.setTimeout(() => {
        if (state.mode === 'live' && state.connectState === 'failed' && state.roomId === join.roomId) {
          void leaveCurrentRoom({ toGate: true, reason: 'connect-failed' });
        }
      }, 2800);
    }
  }

  const getMicEnabled = (participant) => {
    if (!participant) return false;
    const value = participant.isMicrophoneEnabled;
    return typeof value === 'function' ? Boolean(value.call(participant)) : Boolean(value);
  };

  const getSpeaking = (participant) => {
    if (!participant) return false;
    const value = participant.isSpeaking;
    return typeof value === 'function' ? Boolean(value.call(participant)) : Boolean(value);
  };

  function bindLiveKitEvents(room) {
    const EV = window.LivekitClient?.RoomEvent || {};
    const on = (name, handler) => room.on(EV[name] || name, handler);

    on('ParticipantConnected', (participant) => {
      if (!participant?.identity) return;
      refreshMembersFromRoom();
      onSeatPeerConnected(participant.identity);
    });

    on('ParticipantDisconnected', (participant) => {
      if (participant?.identity) handleMemberLeft(participant.identity);
    });

    on('DataReceived', (...args) => {
      void handleRoomData(args[0], args[1]);
    });

    on('TrackSubscribed', (track, publication, participant) => {
      const kind = track?.kind || '';
      if (kind === 'audio') attachAudio(track);
      if (participant?.identity) {
        const member = memberById(participant.identity);
        if (member) {
          member.mic = !getMicEnabled(participant);
          renderSeats();
          renderMembers();
          updateDock();
        }
      }
    });

    on('TrackUnsubscribed', (track) => {
      if (track) detachAudio(track);
    });

    on('ActiveSpeakersChanged', (...args) => {
      const speakers = Array.isArray(args[0]) ? args[0] : [];
      updateSpeakers(new Set(speakers.map((participant) => participant.identity)));
    });

    on('TrackMuted', (...args) => {
      const participant = args.find((item) => item && item.identity) || args[1];
      if (participant?.identity) syncMemberMic(participant);
      else syncMuteStates();
    });

    on('TrackUnmuted', (...args) => {
      const participant = args.find((item) => item && item.identity) || args[1];
      if (participant?.identity) syncMemberMic(participant);
      else syncMuteStates();
    });

    on('ParticipantChanged', (participant) => {
      if (participant?.identity) syncMemberMic(participant);
    });

    on('ParticipantMetadataChanged', () => {
      refreshMembersFromRoom();
      renderSeatApprovals();
    });

    on('Reconnecting', () => {
      setConnectionStatus('语音重连中…', 'warn');
    });

    on('Reconnected', () => {
      setConnectionStatus('语音已连接', '');
      refreshMembersFromRoom();
    });

    on('Disconnected', (reason) => {
      if (state.leaving || state.mode !== 'live' || state.connectState === 'failed') return;
      state.connectState = 'disconnected';
      setConnectionStatus('语音已断开', 'off');
      const reasons = window.LivekitClient?.DisconnectReason || {};
      const code = typeof reason === 'number' ? reason : reason?.code;
      let message = '语音连接已断开，请重新进入房间';
      if (code === reasons.DUPLICATE_IDENTITY) {
        message = '该账号已在桌面端或另一台设备进入房间，网页端语音被顶下线';
      } else if (code === reasons.PARTICIPANT_REMOVED) {
        message = '你已被移出房间';
      } else if (code === reasons.ROOM_DELETED) {
        message = '房间已被解散';
      } else if (code === reasons.SERVER_SHUTDOWN) {
        message = '语音服务重启，请重新进入房间';
      } else if (code === reasons.CONNECTION_TIMEOUT || code === reasons.MEDIA_FAILURE) {
        message = '网络不稳定，语音连接已断开，请重新进入房间';
      }
      showToast(message, 'error');
      window.setTimeout(() => {
        if (state.mode === 'live' && state.connectState === 'disconnected') {
          void leaveCurrentRoom({ toGate: true, reason: 'disconnected', message });
        }
      }, 800);
    });

    on('MediaDevicesError', (error) => {
      showToast(`麦克风设备错误：${error?.message || '请检查浏览器权限'}`, 'error');
    });

    on('AudioPlaybackStatusChanged', () => {
      if (room.canPlaybackAudio) {
        document.removeEventListener('pointerdown', handleAudioUnlock);
      }
    });
  }

  function refreshMembersFromRoom() {
    if (state.mode !== 'live' || !state.lkRoom) return;
    const room = state.lkRoom;
    const list = [];

    const addMember = (participant, local) => {
      if (!participant?.identity) return;
      const identity = participant.identity;
      const existing = memberById(identity);
      const meta = parseMetadata(participant.metadata);
      const userId = Number(meta.userId) || existing?.userId || 0;
      const cached = userId ? state.profileCache.get(String(userId)) : null;
      const isPlatformAdmin = Boolean(meta.isAdmin);
      const isAdmin = isPlatformAdmin || state.adminIdentities.includes(identity);
      const isRootSuper = Boolean(meta.isRootSuper);
      const isOwner = identity === state.ownerIdentity;
      let role = 'member';
      if (isOwner) role = 'owner';
      else if (local) role = state.isGlobalAdmin || isAdmin ? 'admin' : 'me';
      else if (isAdmin) role = 'admin';

      const name =
        (local ? state.myName : participant.name || meta.nickname) ||
        existing?.name ||
        '成员';
      const micEnabled = local ? state.micEnabled : getMicEnabled(participant);
      const member = {
        id: identity,
        name,
        initial: initialOf(name),
        role,
        colors: existing?.colors || paletteFor(identity),
        bio:
          cached?.bio ||
          existing?.bio ||
          (local ? state.myProfile?.bio || state.auth?.bio : '') ||
          '这个人很懒，什么都没写',
        mic: micEnabled,
        speaking: Boolean(getSpeaking(participant) && micEnabled),
        self: local,
        account: meta.account || existing?.account || (local ? state.auth?.name : '') || '',
        avatar: cleanAvatar(
          cached?.avatar ||
            existing?.avatar ||
            state.historyAvatars[identity] ||
            (local ? state.myProfile?.avatar || state.auth?.avatar : ''),
        ),
        isAdmin,
        isPlatformAdmin,
        isRootSuper,
        userId,
      };
      list.push(member);
    };

    addMember(room.localParticipant, true);
    room.remoteParticipants.forEach((participant) => addMember(participant, false));

    const weight = (member) => {
      if (member.role === 'owner') return 4;
      if (member.role === 'admin') return 3;
      if (member.self) return 2;
      return 1;
    };
    list.sort((a, b) => weight(b) - weight(a));

    state.members = list;
    const self = list.find((member) => member.self);
    if (self) {
      state.myName = self.name;
      state.micEnabled = self.mic;
      if (self.isRootSuper) state.isRootSuper = true;
    }
    state.isGlobalAdmin =
      state.isRoomHost ||
      Boolean(state.room?.isSuperAdmin) ||
      Boolean(self?.isPlatformAdmin) ||
      state.isRootSuper ||
      Boolean(state.auth?.isAdmin) ||
      Boolean(state.auth?.isRootSuper);

    renderSeats();
    renderMembers();
    updateDock();
    renderSeatApprovals();
  }

  function syncMemberMic(participant) {
    if (!participant?.identity) return;
    const member = memberById(participant.identity);
    if (!member) {
      refreshMembersFromRoom();
      return;
    }
    const enabled = getMicEnabled(participant);
    if (member.self) {
      state.micEnabled = enabled;
      member.mic = enabled;
      if (!enabled) member.speaking = false;
    } else {
      member.mic = !enabled;
    }
    renderSeats();
    renderMembers();
    updateDock();
  }

  function syncMuteStates() {
    if (state.mode !== 'live' || !state.lkRoom) return;
    let changed = false;
    const room = state.lkRoom;
    const local = room.localParticipant;
    if (local?.identity) {
      const enabled = getMicEnabled(local);
      if (state.micEnabled !== enabled) {
        state.micEnabled = enabled;
        changed = true;
      }
    }
    room.remoteParticipants.forEach((participant) => {
      const member = memberById(participant.identity);
      if (!member) return;
      const muted = !getMicEnabled(participant);
      if (member.mic !== muted) {
        member.mic = muted;
        changed = true;
      }
    });
    if (changed) {
      renderSeats();
      renderMembers();
      updateDock();
    }
  }

  function updateSpeakers(identities) {
    if (state.mode !== 'live') return;
    let changed = false;
    state.members.forEach((member) => {
      const speaking = identities.has(member.id) && member.mic;
      if (member.speaking !== speaking) {
        member.speaking = speaking;
        changed = true;
      }
    });
    if (changed) {
      renderSeats();
      renderMembers();
    }
  }

  function handleMemberLeft(identity) {
    refreshMembersFromRoom();
    let changed = false;
    state.seats.forEach((seat) => {
      if (seat.memberId === identity) {
        seat.memberId = null;
        seat.ts = 0;
        changed = true;
      }
    });
    const before = state.pendingSeatRequests.length;
    state.pendingSeatRequests = state.pendingSeatRequests.filter((req) => req.identity !== identity);
    if (changed) {
      renderSeats();
      renderMembers();
      updateDock();
    }
    if (before !== state.pendingSeatRequests.length) renderSeatApprovals();
  }

  function attachAudio(track) {
    try {
      const element = track.attach();
      element.className = 'lk-voice-audio';
      element.style.display = 'none';
      element.autoplay = true;
      element.playsInline = true;
      element.muted = !state.speakerOn;
      element.volume = state.speakerVolume / 100;
      const savedOutput = getSavedDevice(AUDIO_OUTPUT_KEY);
      if (savedOutput && supportsAudioOutputSelection()) {
        try {
          const result = element.setSinkId(savedOutput);
          if (result?.catch) result.catch(() => {});
        } catch {
          /* ignore */
        }
      }
      const sink = $('#audioSink') || document.body;
      sink.appendChild(element);
      element.play?.().catch(() => {});
    } catch (error) {
      console.warn('[webroom] attach audio failed', error);
    }
  }

  function detachAudio(track) {
    try {
      track.detach().forEach((element) => element.remove());
    } catch {
      /* ignore */
    }
  }

  const applySpeakerVolume = () => {
    $$('.lk-voice-audio').forEach((element) => {
      element.muted = !state.speakerOn;
      element.volume = state.speakerVolume / 100;
    });
  };

  const applyMicVolume = (value) => {
    state.micVolume = Math.max(0, Math.min(100, Number(value) || 0));
    setText('#micVolVal', state.micVolume);
    const dock = $('#micVol');
    if (dock && document.activeElement !== dock) dock.value = String(state.micVolume);
    const settings = $('#settingsMicVol');
    if (settings && document.activeElement !== settings) settings.value = String(state.micVolume);
    const source = window.LivekitClient?.Track?.Source?.Microphone || 'microphone';
    try {
      const publication = state.lkRoom?.localParticipant?.getTrackPublication?.(source);
      publication?.track?.setVolume?.(state.micVolume / 100);
    } catch {
      /* ignore */
    }
  };

  const applySpeakerVolumeSetting = (value) => {
    state.speakerVolume = Math.max(0, Math.min(100, Number(value) || 0));
    setText('#speakerVolVal', state.speakerVolume);
    const dock = $('#speakerVol');
    if (dock && document.activeElement !== dock) dock.value = String(state.speakerVolume);
    const settings = $('#settingsSpeakerVol');
    if (settings && document.activeElement !== settings) settings.value = String(state.speakerVolume);
    applySpeakerVolume();
  };

  async function tryStartAudio() {
    const room = state.lkRoom;
    if (!room || state.connectState !== 'connected') return;
    try {
      if (room.canPlaybackAudio === false) await room.startAudio();
    } catch {
      /* 等待用户手势 */
    }
  }

  async function handleAudioUnlock() {
    const room = state.lkRoom;
    if (!room || state.connectState !== 'connected') return;
    try {
      await room.startAudio();
      document.removeEventListener('pointerdown', handleAudioUnlock);
    } catch {
      /* ignore */
    }
  }

  async function publishJson(payload, destinations) {
    const room = state.lkRoom;
    if (!room) return false;
    try {
      const options = { reliable: true };
      if (Array.isArray(destinations) && destinations.length) {
        options.destinationIdentities = destinations;
      }
      const data = new TextEncoder().encode(JSON.stringify(payload));
      await room.localParticipant.publishData(data, options);
      return true;
    } catch (error) {
      console.warn('[webroom] publishData failed', error);
      return false;
    }
  }

  const publishSeat = (payload, destinations) =>
    publishJson({ ...payload, kind: 'dakemusic-seat' }, destinations);

  const publishSeatModeTo = (destinations) =>
    publishJson(
      { kind: 'dakemusic-seat-mode', mode: state.seatMode, time: Date.now() },
      destinations,
    );

  const publishLyricSyncTo = (destinations) => {
    if (!state.liveLyrics.lines.length) return false;
    return publishJson(
      {
        kind: 'dakemusic-lyric',
        type: 'lyric-sync',
        lines: state.liveLyrics.lines.map((line) => ({ time: line.t, text: line.text })),
        currentIndex: state.liveLyrics.currentIndex,
        songTitle: state.liveLyrics.songTitle,
        songArtist: state.liveLyrics.songArtist,
        time: Date.now(),
      },
      destinations,
    );
  };

  const makeOccupantForSeat = (seat) => {
    const member = memberById(seat.memberId);
    return {
      identity: seat.memberId,
      name: member?.name || '成员',
      ts: Number(seat.ts) || Date.now(),
      isOwner: seat.memberId === state.ownerIdentity,
      isAdmin: state.adminIdentities.includes(seat.memberId),
      isSuperAdmin: Boolean(member?.isPlatformAdmin),
      isRootSuper: Boolean(member?.isRootSuper),
      bio: member?.bio || '',
    };
  };

  function ensureSeatMember(occupant) {
    if (!occupant?.identity || memberById(occupant.identity)) return;
    const name = occupant.name || '成员';
    state.members.push({
      id: occupant.identity,
      name,
      initial: initialOf(name),
      role: occupant.identity === state.ownerIdentity ? 'owner' : occupant.isAdmin ? 'admin' : 'member',
      colors: paletteFor(occupant.identity),
      bio: occupant.bio || '这个人很懒，什么都没写',
      mic: false,
      speaking: false,
      self: false,
      account: '',
      avatar: '',
      isAdmin: Boolean(occupant.isAdmin || occupant.isSuperAdmin),
      isPlatformAdmin: Boolean(occupant.isSuperAdmin),
      isRootSuper: Boolean(occupant.isRootSuper),
      userId: 0,
    });
  }

  function applySeatOccupy(internalId, occupant, force = false) {
    const target = seatById(internalId);
    if (!target || !occupant?.identity) return;
    state.seats.forEach((seat) => {
      if (seat.id !== internalId && seat.memberId === occupant.identity) {
        seat.memberId = null;
        seat.ts = 0;
      }
    });
    if (target.memberId === occupant.identity) {
      target.ts = Number(occupant.ts) || target.ts;
      ensureSeatMember(occupant);
      renderSeats();
      renderMembers();
      updateDock();
      return;
    }
    if (!force && target.memberId) {
      if (target.id === 'main') {
        const incomingOwner = occupant.identity === state.ownerIdentity;
        const currentOwner = target.memberId === state.ownerIdentity;
        if (incomingOwner !== currentOwner && currentOwner) return;
      }
      const localTs = Number(target.ts) || Infinity;
      const incomingTs = Number(occupant.ts) || Infinity;
      if (localTs <= incomingTs) return;
    }
    target.memberId = occupant.identity;
    target.ts = Number(occupant.ts) || Date.now();
    ensureSeatMember(occupant);
    renderSeats();
    renderMembers();
    updateDock();
  }

  function applySeatSnapshot(message) {
    if (!Array.isArray(message.seats)) return;
    if (Array.isArray(message.adminIdentities)) {
      state.adminIdentities = Array.from(
        new Set(message.adminIdentities.filter((identity) => typeof identity === 'string' && identity)),
      );
    }
    message.seats.forEach((wireSeat) => {
      const seat = seatById(fromWireSeatId(wireSeat?.id));
      if (!seat) return;
      if (seat.memberId === state.myIdentity) return;
      const occupant = wireSeat.occupant;
      if (occupant?.identity) {
        seat.memberId = occupant.identity;
        seat.ts = Number(occupant.ts) || 0;
        ensureSeatMember(occupant);
      } else {
        seat.memberId = null;
        seat.ts = 0;
      }
    });
    refreshMembersFromRoom();
    renderSeats();
    renderMembers();
    renderSeatApprovals();
    updateDock();
  }

  /* -------------------------------------------------------
     DataChannel 数据分发
     ------------------------------------------------------- */
  const formatSystemPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return '';
    const target = payload.targetName || payload.name || '成员';
    const operator = payload.operator || '管理员';
    switch (payload.type) {
      case 'join':
        return `「${target}」加入了房间`;
      case 'leave':
        return `「${target}」离开了房间`;
      case 'kick':
        return `「${target}」已被 ${operator} 移出房间`;
      case 'mute':
        return `「${target}」已被 ${operator} 闭麦`;
      case 'unmute':
        return `「${target}」已被 ${operator} 解除闭麦`;
      default:
        return '';
    }
  };

  function addMessage(message, options = {}) {
    if (!message) return false;
    const ts = Number(message.ts) || Date.now();
    const id = message.id ? String(message.id) : randomId('msg');
    const key = options.dedupeKey || (message.id ? `id:${id}` : '');
    if (message.id && state.chatIds.has(id)) return false;
    if (key && state.messageKeys.has(key)) return false;
    if (message.id) state.chatIds.add(id);
    if (key) state.messageKeys.add(key);
    state.messages.push({
      ...message,
      id,
      ts,
      time: message.time || formatClock(ts),
    });
    if (state.messages.length > MAX_CHAT_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_CHAT_MESSAGES);
    }
    if (!options.silent) renderMessages();
    return true;
  }

  function handleLyricChunk(bytes, from) {
    const newline = bytes.indexOf(0x0a);
    if (newline <= 0 || newline > 300) return false;
    let header;
    try {
      header = JSON.parse(new TextDecoder().decode(bytes.slice(0, newline)));
    } catch {
      return false;
    }
    if (!header || header.kind !== 'dakemusic-lyric-chunk') return false;
    const chunkAllowed = isLyricSourceSender(from);
    recordPacket(from, header.kind, 'chunk', chunkAllowed, {
      index: header.index,
      total: header.total,
    });
    if (!chunkAllowed) return true;

    const transferId = String(header.transferId || '');
    const index = Number(header.index);
    const total = Number(header.total);
    if (!transferId || !Number.isInteger(index) || !Number.isInteger(total)) return true;
    if (index < 0 || index >= total || total < 1 || total > 64) return true;

    const now = Date.now();
    for (const [key, record] of state.lyricChunks.entries()) {
      if (now - record.updatedAt > 30_000) state.lyricChunks.delete(key);
    }
    while (state.lyricChunks.size > 16) {
      const first = state.lyricChunks.keys().next().value;
      state.lyricChunks.delete(first);
    }

    let record = state.lyricChunks.get(transferId);
    if (!record || record.total !== total) {
      record = { total, chunks: new Array(total).fill(null), received: 0, updatedAt: now };
      state.lyricChunks.set(transferId, record);
    }
    if (!record.chunks[index]) {
      record.chunks[index] = bytes.slice(newline + 1);
      record.received += 1;
    }
    record.updatedAt = now;

    if (record.received < total) return true;

    state.lyricChunks.delete(transferId);
    try {
      const merged = new Uint8Array(record.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      let offset = 0;
      record.chunks.forEach((chunk) => {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      });
      const payload = JSON.parse(new TextDecoder().decode(merged));
      if (payload?.type === 'lyric-sync') applyLyricSync(payload);
    } catch (error) {
      console.warn('[webroom] lyric chunk reassembly failed', error);
    }
    return true;
  }

  function applyLyricSync(payload) {
    if (!payload || !Array.isArray(payload.lines)) return;
    const lines = payload.lines
      .slice(0, 5000)
      .filter((line) => line && Number.isFinite(Number(line.time)) && typeof line.text === 'string')
      .map((line) => ({
        t: Math.max(0, Number(line.time)),
        text: String(line.text).slice(0, 500),
      }));
    const rawIndex = Number(payload.currentIndex);
    const currentIndex =
      Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < lines.length ? rawIndex : -1;
    state.liveLyrics = {
      lines,
      currentIndex,
      songTitle: String(payload.songTitle || '').slice(0, 100),
      songArtist: String(payload.songArtist || '').slice(0, 100),
      time: Number(payload.time) || Date.now(),
    };
    state.activeLyric = -1;
    if (currentIndex >= 0 && state.currentTrack?.duration) {
      state.progress = Math.min(Number(state.currentTrack.duration) || 0, lines[currentIndex].t);
      updateProgress();
    }
    renderNow();
    renderLyrics();
  }

  function applyLyricHeartbeat(payload) {
    if (!payload) return;
    if (payload.songTitle !== state.liveLyrics.songTitle) return;
    const index = Number(payload.currentIndex);
    if (!Number.isInteger(index) || index < 0 || index >= state.liveLyrics.lines.length) return;
    state.liveLyrics.currentIndex = index;
    updateLyrics(false);
    const line = state.liveLyrics.lines[index];
    if (line && state.currentTrack?.duration) {
      state.progress = Math.min(Number(state.currentTrack.duration) || 0, line.t);
      updateProgress();
    }
  }

  function handleSeatData(message, from) {
    if (!message || !from) return;
    const type = message.type;
    recordPacket(from, 'dakemusic-seat', type, true, { seatId: message.seatId || '' });

    if (type === 'seat/snapshot') {
      if (!isGlobalAdminSender(from)) return;
      applySeatSnapshot(message);
      return;
    }

    if (type === 'seat/occupy') {
      const occupant = message.occupant;
      if (!occupant?.identity || occupant.identity !== from) return;
      const seatId = fromWireSeatId(message.seatId);
      if (!seatById(seatId)) return;
      if (seatId === 'main' && !isSeatAdminSender(from)) return;
      applySeatOccupy(seatId, occupant);
      return;
    }

    if (type === 'seat/leave') {
      if (!message.identity || message.identity !== from) return;
      const seat = seatById(fromWireSeatId(message.seatId));
      if (seat && seat.memberId === from) {
        seat.memberId = null;
        seat.ts = 0;
        renderSeats();
        renderMembers();
        updateDock();
      }
      return;
    }

    if (type === 'seat/main/request') {
      if (!amSeatAdmin()) return;
      const request = message.req;
      if (!request || request.identity !== from) return;
      addPendingSeatRequest(request);
      return;
    }

    if (type === 'seat/main/request-cancel') {
      if (!message.reqId) return;
      const request = state.pendingSeatRequests.find((item) => item.reqId === message.reqId);
      if (request && request.identity === from) removePendingSeatRequest(message.reqId);
      return;
    }

    if (type === 'seat/main/approve') {
      if (!isSeatAdminSender(from)) return;
      const occupant = message.occupant;
      if (!occupant?.identity) return;
      if (message.req && message.req.identity !== occupant.identity) return;
      const seatId = fromWireSeatId(message.seatId || message.req?.seatId);
      if (!seatById(seatId)) return;
      applySeatOccupy(seatId, occupant, true);
      removePendingSeatRequest(message.reqId || message.req?.reqId);
      if (occupant.identity === state.myIdentity) {
        state.mySeatRequest = null;
        state.mySeatRequestState = 'approved';
        showToast('房主已同意你的上麦申请', 'success');
      }
      renderSeatApprovals();
      return;
    }

    if (type === 'seat/main/reject') {
      if (!isSeatAdminSender(from)) return;
      removePendingSeatRequest(message.reqId);
      if (state.mySeatRequest?.reqId === message.reqId) {
        state.mySeatRequest = null;
        state.mySeatRequestState = 'rejected';
        showToast('房主拒绝了你的上麦申请', 'warning');
      }
      return;
    }

    if (type === 'seat/main/kick') {
      if (!isSeatAdminSender(from)) return;
      const main = seatById('main');
      if (main && main.memberId === message.identity) {
        main.memberId = null;
        main.ts = 0;
        renderSeats();
        renderMembers();
        updateDock();
      }
      if (message.identity === state.myIdentity) {
        state.mySeatRequest = null;
        state.mySeatRequestState = 'none';
        if (state.micEnabled) void setMicEnabled(false, true);
        showToast('房主已把你请下主麦', 'warning');
      }
      return;
    }

    if (type === 'seat/admin/set' || type === 'seat/admin/revoke') {
      if (!isGlobalAdminSender(from)) return;
      const identity = message.identity;
      if (!identity) return;
      const set = type === 'seat/admin/set';
      if (set) {
        if (!state.adminIdentities.includes(identity)) state.adminIdentities.push(identity);
      } else {
        state.adminIdentities = state.adminIdentities.filter((item) => item !== identity);
      }
      refreshMembersFromRoom();
      renderSeatApprovals();
      if (identity === state.myIdentity) {
        showToast(set ? '你已被设为房间管理员' : '你的房间管理员身份已被取消', set ? 'success' : 'warning');
      }
    }
  }

  function addPendingSeatRequest(request) {
    if (!request) return;
    const reqId = request.reqId || randomId('req');
    if (state.pendingSeatRequests.some((item) => item.reqId === reqId)) return;
    const normalized = { ...request, reqId };
    state.pendingSeatRequests.push(normalized);
    renderSeatApprovals();
    showToast(
      `${normalized.name || memberById(normalized.identity)?.name || '成员'} 申请 ${seatLabel(
        fromWireSeatId(normalized.seatId),
      )}`,
      'info',
    );
  }

  function removePendingSeatRequest(reqId) {
    if (!reqId) return;
    const before = state.pendingSeatRequests.length;
    state.pendingSeatRequests = state.pendingSeatRequests.filter((item) => item.reqId !== reqId);
    if (before !== state.pendingSeatRequests.length) renderSeatApprovals();
  }

  function onSeatPeerConnected(identity) {
    if (state.mode !== 'live' || !identity) return;
    const mine = mySeat();
    if (mine) {
      const occupant = makeOccupantForSeat(mine);
      window.setTimeout(() => {
        if (state.mode === 'live' && mySeat() === mine) {
          void publishSeat(
            { type: 'seat/occupy', seatId: toWireSeatId(mine.id), occupant },
            [identity],
          );
        }
      }, 300);
    }

    if (state.isRoomHost || state.isRootSuper) {
      if (state.seats.some((seat) => seat.memberId) || state.adminIdentities.length) {
        window.setTimeout(() => {
          if (state.mode !== 'live') return;
          const seats = state.seats.map((seat) => ({
            id: toWireSeatId(seat.id),
            isMain: seat.id === 'main',
            occupant: seat.memberId ? makeOccupantForSeat(seat) : null,
          }));
          void publishSeat(
            { type: 'seat/snapshot', seats, adminIdentities: state.adminIdentities },
            [identity],
          );
        }, 500);
      }
    }

    if (state.isGlobalAdmin) {
      window.setTimeout(() => {
        if (state.mode === 'live') void publishSeatModeTo([identity]);
      }, 700);
    }

    if (state.isRoomHost && state.liveLyrics.lines.length) {
      window.setTimeout(() => {
        if (state.mode === 'live') void publishLyricSyncTo([identity]);
      }, 900);
    }
  }

  async function handleRoomData(payload, participant) {
    let bytes;
    if (payload instanceof Uint8Array) bytes = payload;
    else if (payload instanceof ArrayBuffer) bytes = new Uint8Array(payload);
    else return;
    if (bytes.byteLength > 2_000_000) return;
    const from = participant?.identity || '';

    if (handleLyricChunk(bytes, from)) return;

    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    const kind = typeof data.kind === 'string' ? data.kind : '';
    if (kind.startsWith('dakemusic-')) {
      if (kind === 'dakemusic-seat') {
        if (participant) handleSeatData(data, from);
        return;
      }      if (kind === 'dakemusic-lyric') {
        const allowed = isLyricSourceSender(from);
        recordPacket(from, kind, data.type, allowed, { lines: data.lines?.length ?? 0 });
        if (!allowed) return;
        if (data.type === 'lyric-sync') applyLyricSync(data);
        else if (data.type === 'lyric-heartbeat') applyLyricHeartbeat(data);
        return;
      }
      if (kind === 'dakemusic-seat-mode') {
        if (!isGlobalAdminSender(from)) return;
        if (data.mode === 'normal' || data.mode === 'duet') {
          state.seatMode = data.mode;
          if (state.room) state.room.seatMode = data.mode;
          applySeatModeUI();
          renderSeats();
        }
        return;
      }
      if (kind === 'dakemusic-badwords-refresh') {
        if (isGlobalAdminSender(from)) void loadBadWords();
        return;
      }
      if (kind === 'dakemusic-user-style') return;
      return;
    }

    if (data.type === 'lyric-sync') {
      const allowed = isLyricSourceSender(from);
      recordPacket(from, kind, data.type, allowed, { lines: data.lines?.length ?? 0 });
      if (allowed) applyLyricSync(data);
      return;
    }

    if (
      data.payload &&
      typeof data.payload.type === 'string' &&
      data.payload.type.startsWith('music_')
    ) {
      if (!participant) {
        recordPacket(from, 'server', data.payload.type, true);
        handleQueueEvent(data.payload);
      }
      return;
    }

    const isChatType =
      data.type === 'system' || data.type === 'text' || data.type === 'image' || data.type === 'chat';
    if (!isChatType) return;

    if (participant) {
      if (data.type === 'system') return;
      if (data.type !== 'text' && data.type !== 'image') return;
      const content = typeof data.content === 'string' ? data.content.trim() : '';
      if (!content || content.length > 4000) return;
      const ts = Number(data.timestamp) || Date.now();
      addMessage({
        id: data.id,
        type: 'text',
        memberId: participant.identity,
        senderName: participant.name || memberById(participant.identity)?.name || '成员',
        text: data.type === 'image' ? '[图片]' : content,
        time: formatClock(ts),
        ts,
      });
      return;
    }

    const ts = Number(data.ts) || Number(data.timestamp) || Date.now();
    const content = typeof data.content === 'string' ? data.content.trim() : '';
    if (data.type === 'system') {
      const text = content || formatSystemPayload(data.payload);
      if (!text) return;
      addMessage(
        {
          id: data.id,
          type: 'system',
          text,
          time: formatClock(ts),
          ts,
        },
        { dedupeKey: `sys:${text}:${Math.floor(ts / 10_000)}` },
      );
      return;
    }

    if ((data.type === 'text' || data.type === 'image' || data.type === 'chat') && content) {
      addMessage({
        id: data.id,
        type: 'text',
        memberId:
          data.senderIdentity && data.senderIdentity !== 'system' ? data.senderIdentity : '',
        senderName: data.senderName || '成员',
        text: content,
        time: formatClock(ts),
        ts,
      });
    }
  }

  /* -------------------------------------------------------
     历史记录 / 队列 / 违禁词
     ------------------------------------------------------- */
  async function loadHistory() {
    if (state.mode !== 'live' || !state.roomId) return;
    const roomId = state.roomId;
    try {
      const data = await api(
        `/api/rooms/${encodeURIComponent(roomId)}/messages?limit=50`,
        { auth: false },
      );
      if (state.mode !== 'live' || state.roomId !== roomId) return;
      const list = Array.isArray(data.list) ? data.list : [];
      list.forEach((row) => {
        const ts = Date.parse(row.created_at) || Date.now();
        const text = typeof row.content === 'string' ? row.content : '';
        if (!text) return;
        if (row.is_system) {
          addMessage(
            {
              id: `hist_${row.id}`,
              type: 'system',
              text,
              time: formatClock(ts),
              ts,
            },
            { silent: true, dedupeKey: `sys:${text}:${Math.floor(ts / 10_000)}` },
          );
          return;
        }
        const identity = row.user_id ? `user_${row.user_id}` : '';
        if (identity && row.user_avatar) {
          const avatar = cleanAvatar(row.user_avatar);
          if (avatar) state.historyAvatars[identity] = avatar;
        }
        addMessage(
          {
            id: `hist_${row.id}`,
            type: 'text',
            memberId: identity,
            senderName: row.user_name || '成员',
            text,
            time: formatClock(ts),
            ts,
          },
          { silent: true },
        );
      });
      state.messages.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
      state.historyLoaded = true;
      renderMessages();
    } catch (error) {
      console.warn('[webroom] load history failed', error);
    }
  }

  async function loadQueue() {
    if (state.mode !== 'live' || !state.roomId) return;
    const roomId = state.roomId;
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/queue`, { auth: false });
      if (state.mode !== 'live' || state.roomId !== roomId) return;
      state.liveQueue = Array.isArray(data.queue) ? data.queue : [];
      setCurrentTrack(data.current || null);
      renderQueue();
    } catch (error) {
      console.warn('[webroom] load queue failed', error);
    }
  }

  async function loadBadWords() {
    try {
      const data = await api('/api/bad-words', { auth: false });
      state.badWords = Array.isArray(data.words) ? data.words.filter(Boolean) : [];
    } catch {
      /* 过滤词加载失败不阻塞聊天 */
    }
  }

  function handleQueueEvent(payload) {
    if (!payload) return;
    if (payload.type === 'music_queue_updated') {
      state.liveQueue = Array.isArray(payload.queue) ? payload.queue : [];
      renderQueue();
      return;
    }
    if (payload.type === 'music_track_changed') {
      state.liveQueue = Array.isArray(payload.queue) ? payload.queue : [];
      if (payload.track === undefined) {
        void loadQueue();
      } else {
        setCurrentTrack(payload.track || null);
      }
      renderQueue();
      if (payload.track) {
        showToast(`正在播放：${payload.track.title || '未知歌曲'}`, 'success');
      } else {
        showToast('房间队列已播完', 'info');
      }
    }
  }

  function setCurrentTrack(track) {
    const previous = state.currentTrack;
    state.currentTrack = track || null;
    if (track) {
      const position = Number(track.position);
      state.progress = Number.isFinite(position) && position >= 0 ? position : 0;
      state.playing = true;
      const title = String(track.title || '');
      const previousTitle = String(previous?.title || '');
      if (
        previous &&
        title &&
        previousTitle &&
        title !== previousTitle &&
        state.liveLyrics.songTitle &&
        state.liveLyrics.songTitle !== title
      ) {
        state.liveLyrics = emptyLiveLyrics();
      }
      state.activeLyric = -1;
    } else {
      state.playing = false;
      state.progress = 0;
      state.activeLyric = -1;
      state.liveLyrics = emptyLiveLyrics();
    }
    renderNow();
    renderLyrics();
    renderQueue();
    updateProgress();
    updatePlayButton();
    updateDock();
  }

  /* -------------------------------------------------------
     麦位操作
     ------------------------------------------------------- */
  let ticker = 0;
  let speakingTicker = 0;

  function canManageSeatMode() {
    return (
      state.mode === 'demo' ||
      state.isRoomHost ||
      state.isRootSuper ||
      Boolean(state.auth?.isAdmin) ||
      Boolean(state.auth?.isRootSuper) ||
      Boolean(state.room?.isSuperAdmin)
    );
  }

  function buildSelfOccupant() {
    const seat = mySeat();
    const member = memberById(state.myIdentity);
    return {
      identity: state.myIdentity,
      name: state.myName,
      ts: Number(seat?.ts) || Date.now(),
      isOwner: state.isRoomHost,
      isAdmin: state.adminIdentities.includes(state.myIdentity),
      isSuperAdmin: Boolean(state.auth?.isAdmin),
      isRootSuper: state.isRootSuper,
      bio: member?.bio || '',
    };
  }

  function occupySeatDirect(internalId, silent = false) {
    const seat = seatById(internalId);
    if (!seat) return false;
    if (seat.memberId && seat.memberId !== state.myIdentity) {
      if (!silent) showToast('这个麦位已经有人了', 'warning');
      return false;
    }
    const occupant = buildSelfOccupant();
    occupant.ts = Date.now();
    applySeatOccupy(internalId, occupant);
    state.mySeatRequest = null;
    state.mySeatRequestState = 'approved';
    if (state.mode === 'live') {
      void publishSeat({
        type: 'seat/occupy',
        seatId: toWireSeatId(internalId),
        occupant,
      });
    }
    if (!silent) showToast(`已上麦到 ${seatLabel(internalId)}`, 'success');
    return true;
  }

  function tryOwnerTakeMain() {
    if (state.mode !== 'live' || state.connectState !== 'connected') return;
    if (!state.isRoomHost) return;
    const main = seatById('main');
    if (main && !main.memberId) occupySeatDirect('main', true);
  }

  async function requestSeat(internalId) {
    const seat = seatById(internalId);
    if (!seat) return;

    if (state.mode === 'demo') {
      if (seat.memberId === state.myIdentity) {
        await leaveSeat();
        return;
      }
      if (seat.memberId) {
        openProfile(seat.memberId);
        return;
      }
      if (internalId === 'main') {
        showToast('已发送上麦申请，等待房主同意', 'info');
        window.setTimeout(() => {
          if (state.mode !== 'demo' || state.gateOpen) return;
          const main = seatById('main');
          if (main && !main.memberId) {
            moveToSeat('main', true);
            showToast('房主已同意你的上麦申请', 'success');
          }
        }, 1500);
        return;
      }
      moveToSeat(internalId);
      return;
    }

    if (!state.lkRoom || state.connectState !== 'connected') {
      showToast(connectionBlockedMessage('上麦'), 'warning');
      return;
    }
    if (seat.memberId === state.myIdentity) {
      await leaveSeat();
      return;
    }
    if (seat.memberId) {
      openProfile(seat.memberId);
      return;
    }

    if (canManageSeatMode() || amSeatAdmin()) {
      occupySeatDirect(internalId);
      return;
    }

    if (mySeat()) {
      showToast('请先离开当前麦位，再申请其他麦位', 'warning');
      return;
    }

    const seatId = toWireSeatId(internalId);
    if (state.mySeatRequestState === 'pending' && state.mySeatRequest) {
      if (state.mySeatRequest.seatId === seatId) {
        void publishSeat({ type: 'seat/main/request-cancel', reqId: state.mySeatRequest.reqId });
        state.mySeatRequest = null;
        state.mySeatRequestState = 'none';
        showToast('已取消上麦申请', 'info');
      } else {
        showToast('你已有一个待处理的上麦申请', 'warning');
      }
      return;
    }

    const req = {
      reqId: randomId('req'),
      seatId,
      identity: state.myIdentity,
      name: state.myName,
      ts: Date.now(),
    };
    state.mySeatRequest = req;
    state.mySeatRequestState = 'pending';
    const sent = await publishSeat({ type: 'seat/main/request', req });
    if (!sent) {
      state.mySeatRequest = null;
      state.mySeatRequestState = 'none';
      showToast('上麦申请发送失败，请检查语音连接', 'error');
      return;
    }
    showToast('已发送上麦申请，等待房主同意', 'info');
  }

  async function leaveSeat() {
    const seat = mySeat();
    if (!seat) return;

    if (state.mode === 'demo') {
      seat.memberId = null;
      seat.ts = 0;
      const me = memberById(state.myIdentity);
      if (me) {
        me.mic = false;
        me.speaking = false;
      }
      state.micEnabled = false;
      renderSeats();
      renderMembers();
      updateDock();
      showToast('已下麦', 'info');
      return;
    }

    if (state.micEnabled) await setMicEnabled(false, true);
    const seatId = toWireSeatId(seat.id);
    seat.memberId = null;
    seat.ts = 0;
    state.mySeatRequest = null;
    state.mySeatRequestState = 'none';
    void publishSeat({ type: 'seat/leave', seatId, identity: state.myIdentity });
    renderSeats();
    renderMembers();
    updateDock();
    showToast('已下麦', 'info');
  }

  async function setMicEnabled(enabled, silent = false) {
    if (state.mode === 'demo') {
      const me = memberById(state.myIdentity);
      if (me) {
        me.mic = Boolean(enabled);
        if (!enabled) me.speaking = false;
      }
      state.micEnabled = Boolean(enabled);
      renderSeats();
      renderMembers();
      updateDock();
      if (!silent) showToast(enabled ? '麦克风已开启' : '麦克风已关闭', 'success');
      return true;
    }

    const room = state.lkRoom;
    if (!room || state.connectState !== 'connected') {
      if (!silent) showToast(connectionBlockedMessage('开麦'), 'warning');
      return false;
    }

    state.micBusy = true;
    try {
      await room.localParticipant.setMicrophoneEnabled(Boolean(enabled));
      state.micEnabled = Boolean(enabled);
      const me = memberById(state.myIdentity);
      if (me) {
        me.mic = Boolean(enabled);
        if (!enabled) me.speaking = false;
      }
      renderSeats();
      renderMembers();
      updateDock();
      if (!silent) showToast(enabled ? '麦克风已开启' : '麦克风已关闭', 'success');
      return true;
    } catch (error) {
      console.warn('[webroom] microphone toggle failed', error);
      if (!silent) showToast(`麦克风开启失败：${friendlyLiveKitError(error)}`, 'error');
      return false;
    } finally {
      state.micBusy = false;
    }
  }

  async function toggleMic() {
    if (state.micBusy) return;
    if (!mySeat()) {
      showToast('先申请上麦，成为麦上成员后才能开麦', 'warning');
      return;
    }
    await setMicEnabled(!state.micEnabled);
  }

  function toggleSpeaker() {
    state.speakerOn = !state.speakerOn;
    applySpeakerVolume();
    updateDock();
    showToast(state.speakerOn ? '已恢复房间声音' : '已静音房间声音', 'info');
  }

  function approveSeatRequest(req) {
    if (!req || state.mode !== 'live' || !amSeatAdmin()) return;
    const seatId = fromWireSeatId(req.seatId);
    if (!seatById(seatId)) return;
    const member = memberById(req.identity);
    const occupant = {
      identity: req.identity,
      name: req.name || member?.name || '成员',
      ts: Date.now(),
      isOwner: req.identity === state.ownerIdentity,
      isAdmin: state.adminIdentities.includes(req.identity),
      isSuperAdmin: Boolean(member?.isPlatformAdmin),
      isRootSuper: Boolean(member?.isRootSuper),
      bio: member?.bio || '',
    };
    applySeatOccupy(seatId, occupant, true);
    removePendingSeatRequest(req.reqId);
    void publishSeat({
      type: 'seat/main/approve',
      reqId: req.reqId,
      req,
      occupant,
      seatId: toWireSeatId(seatId),
    });
    if (state.micEnabled && !mySeat()) void setMicEnabled(false, true);
    showToast(`已同意 ${occupant.name} 上麦`, 'success');
  }

  function rejectSeatRequest(req) {
    if (!req || state.mode !== 'live' || !amSeatAdmin()) return;
    removePendingSeatRequest(req.reqId);
    void publishSeat({ type: 'seat/main/reject', reqId: req.reqId, req });
    showToast(`已拒绝 ${req.name || '成员'} 的上麦申请`, 'info');
  }

  function kickFromMain(identity) {
    if (!identity || state.mode !== 'live' || !amSeatAdmin()) return;
    const main = seatById('main');
    if (!main || main.memberId !== identity) return;
    void publishSeat({ type: 'seat/main/kick', identity });
    main.memberId = null;
    main.ts = 0;
    renderSeats();
    renderMembers();
    updateDock();
    if (state.micEnabled && !mySeat()) void setMicEnabled(false, true);
    closeAllModals();
    showToast('已将该成员请下主麦', 'success');
    if (state.isRoomHost) {
      window.setTimeout(() => {
        if (state.mode === 'live' && state.lkRoom) occupySeatDirect('main', true);
      }, 260);
    }
  }

  function setRoomAdmin(identity, makeAdmin) {
    if (!identity || state.mode !== 'live') return;
    if (!state.isGlobalAdmin) return;
    if (identity === state.myIdentity) return;
    if (makeAdmin) {
      if (!state.adminIdentities.includes(identity)) state.adminIdentities.push(identity);
    } else {
      state.adminIdentities = state.adminIdentities.filter((item) => item !== identity);
    }
    void publishSeat({
      type: makeAdmin ? 'seat/admin/set' : 'seat/admin/revoke',
      identity,
    });
    refreshMembersFromRoom();
    renderSeatApprovals();
    closeAllModals();
    showToast(makeAdmin ? '已设为房间管理员' : '已取消房间管理员', 'success');
  }

  async function toggleSeatMode() {
    if (state.mode === 'demo') {
      state.seatMode = state.seatMode === 'duet' ? 'normal' : 'duet';
      applySeatModeUI();
      renderSeats();
      showToast(state.seatMode === 'duet' ? '已切换到对唱模式' : '已切换到普通模式', 'info');
      return;
    }
    if (!canManageSeatMode()) {
      showToast('只有房主或管理员可以切换模式', 'warning');
      return;
    }
    const next = state.seatMode === 'duet' ? 'normal' : 'duet';
    state.seatMode = next;
    if (state.room) state.room.seatMode = next;
    applySeatModeUI();
    renderSeats();
    void publishSeatModeTo();
    try {
      await api(`/api/rooms/${encodeURIComponent(state.roomId)}`, {
        method: 'PATCH',
        body: { seatMode: next },
      });
    } catch (error) {
      showToast(`模式已在本房切换，但保存失败：${describeError(error)}`, 'warning');
    }
    showToast(next === 'duet' ? '已切换到对唱模式' : '已切换到普通模式', 'success');
  }

  function moveToSeat(internalId, silent = false) {
    if (state.mode !== 'demo') return;
    const target = seatById(internalId);
    if (!target) return;
    if (target.memberId && target.memberId !== state.myIdentity) {
      if (!silent) showToast('这个麦位已经有人了', 'warning');
      return;
    }
    state.seats.forEach((seat) => {
      if (seat.memberId === state.myIdentity) {
        seat.memberId = null;
        seat.ts = 0;
      }
    });
    target.memberId = state.myIdentity;
    target.ts = Date.now();
    const me = memberById(state.myIdentity);
    if (me) {
      me.mic = true;
      me.speaking = false;
    }
    state.micEnabled = true;
    renderSeats();
    renderMembers();
    updateDock();
    if (!silent) showToast(`已上麦到 ${seatLabel(internalId)}`, 'success');
  }

  /* -------------------------------------------------------
     公屏输入
     ------------------------------------------------------- */
  function containsBadWord(text) {
    const lower = String(text || '').toLowerCase();
    return state.badWords.find((word) => {
      const value = String(word || '').trim().toLowerCase();
      return value && lower.includes(value);
    });
  }

  async function sendMessage() {
    const input = $('#chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (state.mode === 'demo') {
      addMessage({
        type: 'text',
        memberId: state.myIdentity,
        senderName: state.myName,
        text,
        time: nowTime(),
        ts: Date.now(),
      });
      input.value = '';
      closeEmoji();
      input.focus();
      if (!state.replied) {
        state.replied = true;
        window.setTimeout(() => {
          if (state.mode !== 'demo' || state.gateOpen) return;
          addMessage({
            type: 'text',
            memberId: 'xiaolu',
            senderName: '小鹿',
            text: '欢迎欢迎，一起听歌～',
            time: nowTime(),
            ts: Date.now(),
          });
        }, 1200);
      }
      return;
    }

    if (!state.lkRoom || state.connectState !== 'connected') {
      showToast(connectionBlockedMessage('发送消息'), 'warning');
      return;
    }
    const badWord = containsBadWord(text);
    if (badWord) {
      showToast('消息包含违禁词，请修改后再发送', 'warning');
      return;
    }

    const message = {
      id: randomId('msg'),
      senderIdentity: state.myIdentity,
      senderName: state.myName,
      content: text,
      timestamp: Date.now(),
      type: 'text',
    };
    input.value = '';
    closeEmoji();
    const sent = await publishJson(message);
    if (!sent) {
      input.value = text;
      showToast('消息发送失败，请检查语音连接', 'error');
      return;
    }
    addMessage({
      id: message.id,
      type: 'text',
      memberId: state.myIdentity,
      senderName: state.myName,
      text,
      time: formatClock(message.timestamp),
      ts: message.timestamp,
    });
    void api(`/api/rooms/${encodeURIComponent(state.roomId)}/messages`, {
      method: 'POST',
      body: { content: text, silent: true },
    }).catch((error) => console.warn('[webroom] persist chat failed', error));
    input.focus();
  }

  function clearChat() {
    state.messages = [];
    state.messageKeys.clear();
    state.chatIds.clear();
    renderMessages();
    showToast('已清空本机显示的聊天记录', 'info');
  }

  function toggleEmoji() {
    const pop = $('#emojiPop');
    if (!pop) return;
    state.emojiOpen = !state.emojiOpen;
    pop.classList.toggle('open', state.emojiOpen);
    $('#emojiBtn')?.setAttribute('aria-expanded', state.emojiOpen ? 'true' : 'false');
  }

  function closeEmoji() {
    state.emojiOpen = false;
    $('#emojiPop')?.classList.remove('open');
    $('#emojiBtn')?.setAttribute('aria-expanded', 'false');
  }

  function insertEmoji(emoji) {
    const input = $('#chatInput');
    if (!input || !emoji) return;
    input.value = `${input.value}${emoji}`.slice(0, 200);
    closeEmoji();
    input.focus();
  }

  /* -------------------------------------------------------
     演示播放 / 真实队列
     ------------------------------------------------------- */
  function setSong(index, quiet = false) {
    if (state.mode !== 'demo' || !state.songs.length) return;
    const total = state.songs.length;
    state.songIndex = ((index % total) + total) % total;
    state.progress = 0;
    state.playing = true;
    state.activeLyric = -1;
    renderNow();
    renderLyrics();
    renderQueue();
    updateProgress();
    updatePlayButton();
    updateDock();
    if (!quiet) {
      const song = currentSong();
      if (song) showToast(`正在播放：${song.title}`, 'success');
    }
  }

  function togglePlay() {
    if (state.mode === 'live') {
      showToast('网页版只同步歌曲与歌词，播放 / 暂停请在桌面端操作', 'info');
      return;
    }
    if (!currentSong()) return;
    state.playing = !state.playing;
    renderLyrics();
    updatePlayButton();
    updateDock();
    showToast(state.playing ? '继续播放' : '已暂停', 'info');
  }

  function nextSong() {
    if (state.mode === 'live') {
      void nextLiveSong();
      return;
    }
    setSong(state.songIndex + 1);
  }

  function prevSong() {
    if (state.mode === 'live') {
      showToast('上一首由房主端控制', 'info');
      return;
    }
    if (state.progress > 3) {
      state.progress = 0;
      updateProgress();
      updateLyrics(true);
      return;
    }
    setSong(state.songIndex - 1);
  }

  async function nextLiveSong() {
    if (state.mode !== 'live' || !state.roomId) return;
    const roomId = state.roomId;
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/queue/next`, {
        method: 'POST',
      });
      if (state.mode !== 'live' || state.roomId !== roomId) return;
      state.liveQueue = Array.isArray(data.queue) ? data.queue : [];
      if (Object.prototype.hasOwnProperty.call(data, 'track')) setCurrentTrack(data.track || null);
      else void loadQueue();
      renderQueue();
      showToast(data.track ? `已切到：${data.track.title || '下一首'}` : '队列已播完', 'success');
    } catch (error) {
      showToast(`切歌失败：${describeError(error)}`, 'warning');
    }
  }

  async function removeQueueItem(index) {
    if (state.mode !== 'live') return;
    const roomId = state.roomId;
    try {
      const data = await api(
        `/api/rooms/${encodeURIComponent(roomId)}/queue/${encodeURIComponent(index)}`,
        { method: 'DELETE' },
      );
      if (state.mode !== 'live' || state.roomId !== roomId) return;
      state.liveQueue = Array.isArray(data.queue) ? data.queue : [];
      renderQueue();
      showToast('已移出播放队列', 'success');
    } catch (error) {
      showToast(`移出失败：${describeError(error)}`, 'warning');
    }
  }

  // DakeMusic: 把酷狗搜索结果映射为与桌面端一致的标准 Song 结构（hash 用于桌面端解析播放地址）
  function mapKugouToSong(info) {
    const hash = String(info?.hash || '').trim();
    const title = String(info?.songname || '').trim() || '未知歌曲';
    const artist = String(info?.singername || '').trim() || '未知歌手';
    const duration = Number(info?.duration) || 0;
    const albumAudioId = String(info?.album_audio_id ?? '').trim();
    const audioId = String(info?.audio_id ?? '').trim();
    const albumId = String(info?.album_id ?? '').trim();
    const relateGoods = [];
    if (info && info['320hash']) relateGoods.push({ hash: String(info['320hash']), quality: '320' });
    if (info && info.sqhash) relateGoods.push({ hash: String(info.sqhash), quality: 'flac' });
    const id = albumAudioId || audioId || hash;
    return {
      id,
      songId: audioId,
      title,
      name: title,
      artist,
      artists: artist.split('/').map((name) => ({ name: name.trim() })).filter((name) => name.name),
      singers: [{ name: artist }],
      album: String(info?.album_name || '').trim(),
      albumName: String(info?.album_name || '').trim(),
      albumId,
      duration,
      coverUrl: '',
      cover: '',
      audioUrl: '',
      hash,
      mixSongId: Number(albumAudioId || audioId || 0),
      fileId: audioId ? Number(audioId) : undefined,
      relateGoods,
      oldCpy: info && info.old_cpy !== undefined ? Number(info.old_cpy) : undefined,
      payType: info && info.pay_type !== undefined ? Number(info.pay_type) : undefined,
    };
  }

  function renderSongResults(songs) {
    const box = $('#songResults');
    if (!box) return;
    state.songResults = Array.isArray(songs) ? songs.slice(0, 8) : [];
    if (!state.songResults.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = state.songResults
      .map(
        (song, index) => `
        <li class="song-result" data-request-song="${index}">
          <div class="sr-cover">${escapeHtml((song.artist || '?').slice(0, 1))}</div>
          <div class="sr-info">
            <strong>${escapeHtml(song.title)}</strong>
            <span>${escapeHtml(song.artist)} · ${formatTime(song.duration)}</span>
          </div>
          <button class="sr-add" type="button">点歌</button>
        </li>`,
      )
      .join('');
  }

  async function searchSongs() {
    const search = $('#songSearch');
    const keyword = (search?.value || '').trim();
    if (!keyword) {
      showToast('请输入歌曲名或歌手', 'info');
      return;
    }
    try {
      const data = await api(`/kugou/search?keyword=${encodeURIComponent(keyword)}`, {
        auth: false,
        timeout: 15_000,
      });
      const list = data && data.data && Array.isArray(data.data.info) ? data.data.info : [];
      if (!list.length) {
        renderSongResults([]);
        showToast('没有找到相关歌曲，换个关键词试试', 'info');
        return;
      }
      renderSongResults(list.map(mapKugouToSong));
    } catch (error) {
      showToast(`搜索失败：${describeError(error)}`, 'warning');
    }
  }

  async function requestLiveSong(song) {
    if (state.mode !== 'live' || !state.roomId) return;
    const roomId = state.roomId;
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/request-song`, {
        method: 'POST',
        body: {
          songId: song.songId || song.hash || song.id,
          title: song.title || song.name,
          artist: song.artist || '',
          cover: song.coverUrl || '',
          url: '',
          duration: song.duration || 0,
          songData: song,
        },
      });
      if (state.mode !== 'live' || state.roomId !== roomId) return;
      if (Array.isArray(data.queue)) state.liveQueue = data.queue;
      if (data.current !== undefined) state.currentTrack = data.current ?? null;
      renderQueue();
      showToast(data.track ? `已开始播放：${song.title}` : `已加入队列：${song.title}`, 'success');
    } catch (error) {
      showToast(`点歌失败：${describeError(error)}`, 'warning');
    }
  }

  function addSong() {
    const search = $('#songSearch');
    const raw = (search?.value || '').trim();
    if (state.mode === 'live') {
      if (!raw) {
        showToast('先输入歌曲名或歌手，回车或点「点歌」搜索', 'info');
        return;
      }
      void searchSongs();
      return;
    }
    const title = raw || FALLBACK_SONGS[Math.floor(Math.random() * FALLBACK_SONGS.length)];
    const duration = 180 + Math.floor(Math.random() * 90);
    const lyricLines = [
      `${title}`,
      '这一刻的旋律，刚好落在心里',
      '把耳机分你一半，晚风也变得温柔',
      '如果刚好你也听见',
      '就让我们一起听完这首歌',
      '下一首，还在路上',
    ];
    state.songs.push({
      title,
      artist: 'DakeMusic 点歌',
      duration,
      requester: '你 点歌',
      lyrics: lyricLines.map((text, index) => ({ t: index * 20, text })),
    });
    if (search) search.value = '';
    renderQueue();
    showToast(`已把《${title}》加入队列`, 'success');
  }

  async function clearQueue() {
    if (state.mode === 'live') {
      await loadQueue();
      showToast('已刷新播放队列', 'success');
      return;
    }
    const current = currentSong();
    if (!current) return;
    state.songs = [current];
    state.songIndex = 0;
    state.progress = 0;
    renderQueue();
    updateProgress();
    updateLyrics(true);
    showToast('已清空队列，仅保留当前歌曲', 'info');
  }

  function tickDemo() {
    if (state.mode !== 'demo' || state.gateOpen || document.hidden || !state.playing) return;
    const song = currentSong();
    const duration = Number(song?.duration) || 0;
    if (duration <= 0) return;
    state.progress += 1;
    if (state.progress >= duration) {
      setSong(state.songIndex + 1, true);
      return;
    }
    updateProgress();
    updateLyrics();
  }

  function tickLive() {
    if (state.mode !== 'live' || state.gateOpen || document.hidden || !state.playing) return;
    const duration = Number(state.currentTrack?.duration) || 0;
    if (duration <= 0) return;
    state.progress = Math.min(duration, state.progress + 1);
    updateProgress();
  }

  function startTicker() {
    if (ticker) window.clearInterval(ticker);
    ticker = window.setInterval(() => {
      if (state.mode === 'live') {
        tickLive();
        if (state.connectState === 'connected') syncMuteStates();
      } else {
        tickDemo();
      }
    }, 1000);
    if (!speakingTicker) {
      speakingTicker = window.setInterval(simulateSpeaking, 7000);
    }
  }

  function simulateSpeaking() {
    if (state.mode !== 'demo' || state.gateOpen || document.hidden) return;
    const candidates = state.seats
      .map((seat) => memberById(seat.memberId))
      .filter((member) => member && !member.self && !member.speaking && member.mic);
    if (!candidates.length) return;
    const member = candidates[Math.floor(Math.random() * candidates.length)];
    state.members.forEach((item) => {
      item.speaking = false;
    });
    member.speaking = true;
    renderSeats();
    renderMembers();
    window.setTimeout(() => {
      if (state.mode !== 'demo') return;
      member.speaking = false;
      renderSeats();
      renderMembers();
    }, 2600);
  }

  /* -------------------------------------------------------
     弹层 / 资料卡 / 分享
     ------------------------------------------------------- */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    $$('.modal.open').forEach((element) => {
      if (element !== modal) {
        element.classList.remove('open');
        element.setAttribute('aria-hidden', 'true');
      }
    });
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    $('#scrim')?.classList.add('show');
  }

  function closeAllModals() {
    $$('.modal.open').forEach((modal) => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    });
    const drawerOpen = $('#songDrawer')?.classList.contains('open');
    const panelOpen =
      $('#membersPanel')?.classList.contains('open') || $('#chatPanel')?.classList.contains('open');
    if (!drawerOpen && !panelOpen) $('#scrim')?.classList.remove('show');
  }

  function openSongDrawer() {
    closeAllModals();
    closeMobilePanels();
    const drawer = $('#songDrawer');
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('#scrim')?.classList.add('show');
    closeEmoji();
  }

  function closeSongDrawer() {
    const drawer = $('#songDrawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    const modalOpen = $$('.modal.open').length > 0;
    const panelOpen =
      $('#membersPanel')?.classList.contains('open') || $('#chatPanel')?.classList.contains('open');
    if (!modalOpen && !panelOpen) $('#scrim')?.classList.remove('show');
  }

  function openMobilePanel(name) {
    closeEmoji();
    closeSongDrawer();
    if (name === 'members') {
      $('#membersPanel')?.classList.add('open');
      $('#chatPanel')?.classList.remove('open');
    } else if (name === 'chat') {
      $('#chatPanel')?.classList.add('open');
      $('#membersPanel')?.classList.remove('open');
      window.setTimeout(() => $('#chatInput')?.focus(), 180);
    }
    $('#scrim')?.classList.add('show');
  }

  function closeMobilePanels() {
    $('#membersPanel')?.classList.remove('open');
    $('#chatPanel')?.classList.remove('open');
    const modalOpen = $$('.modal.open').length > 0;
    const drawerOpen = $('#songDrawer')?.classList.contains('open');
    if (!modalOpen && !drawerOpen) $('#scrim')?.classList.remove('show');
  }

  function closeOverlays() {
    closeAllModals();
    closeSongDrawer();
    closeMobilePanels();
    closeEmoji();
    $('#scrim')?.classList.remove('show');
  }

  function fillProfile(member) {
    if (!member) return;
    setHtml('#profileAvatar', avatarHtml(member, 'profile'));
    setHtml('#profileName', `${escapeHtml(member.name)}${badgeIcon(member)}`);

    const tags = [];
    if (member.role === 'owner') tags.push('<span class="tag tag-gold">房主</span>');
    else if (member.role === 'admin') tags.push('<span class="tag tag-blue">管理员</span>');
    else tags.push('<span class="tag">听众</span>');
    if (member.self) tags.push('<span class="tag tag-violet">我</span>');
    if (member.account) tags.push(`<span class="tag">@${escapeHtml(member.account)}</span>`);
    const seat = seatOfMember(member.id);
    if (seat) tags.push(`<span class="tag">${escapeHtml(seatLabel(seat.id))}</span>`);
    setHtml('#profileTags', tags.join(''));
    setText('#profileBio', member.bio || '这个人很懒，什么都没写');

    if (state.mode === 'demo') {
      setText('#profileStatA', '128');
      setText('#profileStatALabel', '关注');
      setText('#profileStatB', '2.4k');
      setText('#profileStatBLabel', '粉丝');
      setText('#profileStatC', '36');
      setText('#profileStatCLabel', '房间');
    } else {
      setText('#profileStatA', member.account || '—');
      setText('#profileStatALabel', '账号');
      setText('#profileStatB', seat ? seatLabel(seat.id) : '听众');
      setText('#profileStatBLabel', '麦位');
      setText('#profileStatC', member.mic ? '开麦' : '闭麦');
      setText('#profileStatCLabel', '状态');
    }

    const actions = [];
    if (state.mode === 'live' && member.id !== state.myIdentity) {
      const main = seatById('main');
      if (main?.memberId === member.id && amSeatAdmin()) {
        actions.push(
          `<button class="btn danger" data-kick-main="${escapeHtml(member.id)}">请下主麦</button>`,
        );
      }
      if (state.isGlobalAdmin || state.isRootSuper) {
        const isAdmin = state.adminIdentities.includes(member.id);
        actions.push(
          `<button class="btn ghost" data-toggle-admin="${escapeHtml(member.id)}" data-admin-on="${
            isAdmin ? '0' : '1'
          }">${isAdmin ? '取消管理员' : '设为管理员'}</button>`,
        );
      }
    }
    actions.push('<button class="btn btn-primary" data-close-modal>打个招呼</button>');
    actions.push('<button class="btn ghost" data-close-modal>TA 的主页</button>');
    setHtml('#profileActions', actions.join(''));

    const modal = $('#profileModal');
    if (modal) modal.dataset.member = member.id;
  }

  function openProfile(memberId) {
    const member = memberById(memberId);
    if (!member) return;
    fillProfile(member);
    openModal('profileModal');

    const rawId = String(member.id || '');
    const uid =
      Number(member.userId) ||
      (rawId.startsWith('user_') ? Number(rawId.slice(5)) : 0) ||
      (member.self ? Number(state.auth?.userId) || 0 : 0);
    if (!uid) return;

    if (state.profileCache.has(String(uid))) {
      const cached = state.profileCache.get(String(uid));
      if (cached) applyFetchedProfile(member, cached);
      return;
    }

    void api(`/api/users/${encodeURIComponent(uid)}`, { auth: false })
      .then((profile) => {
        if (!profile || !profile.userId) return;
        state.profileCache.set(String(profile.userId), profile);
        applyFetchedProfile(member, profile);
      })
      .catch(() => {
        /* 公开资料获取失败不影响本地资料卡 */
      });
  }

  function applyFetchedProfile(member, profile) {
    if (!member || !profile) return;
    member.userId = Number(profile.userId) || member.userId || 0;
    member.account = profile.name || member.account || '';
    member.name = profile.nickname || member.name;
    member.initial = initialOf(member.name);
    member.avatar = cleanAvatar(profile.avatar) || member.avatar || '';
    member.bio = profile.bio || member.bio || '这个人很懒，什么都没写';
    member.isPlatformAdmin = Boolean(profile.isAdmin) || Boolean(member.isPlatformAdmin);
    member.isAdmin = Boolean(profile.isAdmin) || Boolean(member.isAdmin);
    member.isRootSuper = Boolean(profile.isRootSuper) || Boolean(member.isRootSuper);
    if (member.role !== 'owner' && member.isAdmin) member.role = 'admin';

    renderMembers();
    renderSeats();
    const modal = $('#profileModal');
    if (modal?.classList.contains('open') && modal.dataset.member === member.id) {
      fillProfile(memberById(member.id) || member);
    }
  }

  function toggleLyrics() {
    const card = $('#lyricsCard');
    if (!card) return;
    const collapsed = card.classList.toggle('lyrics-collapsed');
    const use = $('#lyricToggleIco use');
    if (use) use.setAttribute('href', collapsed ? '#i-chevron-right' : '#i-chevron-down');
    const button = card.querySelector('[data-action=\"toggle-lyrics\"]');
    if (button) button.setAttribute('aria-label', collapsed ? '展开歌词' : '收起歌词');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function shareRoom() {
    const url = state.mode === 'live' && state.roomId
      ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomId)}`
      : `${window.location.origin}${window.location.pathname}`;
    const ok = await copyText(url);
    if (ok) showToast(state.mode === 'live' ? '房间链接已复制' : '演示房间链接已复制', 'success');
    else showToast(`复制失败，请手动复制：${url}`, 'warning');
  }

  /* -------------------------------------------------------
     离开房间
     ------------------------------------------------------- */
  async function leaveCurrentRoom(options = {}) {
    const { toGate = true, silent = false, reason = '', message: customMessage = '' } = options;
    if (state.leaving) return;
    state.leaving = true;
    closeOverlays();
    const roomId = state.roomId;

    if (state.mode === 'live') {
      if (roomId && getToken()) {
        await Promise.race([
          api(`/api/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST' }).catch(() => {}),
          delay(1200),
        ]);
      }
      const room = state.lkRoom;
      state.lkRoom = null;
      document.removeEventListener('pointerdown', handleAudioUnlock);
      if (room) {
        try {
          await room.disconnect();
        } catch {
          /* ignore */
        }
      }
      $$('.lk-voice-audio').forEach((element) => element.remove());
    }

    resetDemoState();
    renderAll();
    syncRoomUrl('');

    if (toGate) {
      openGate(state.auth ? 'rooms' : 'login');
      if (state.auth) await loadRooms();
      if (roomId) {
        const input = $('#roomIdInput');
        // 退出后不把托管房间 ID 填回输入框；能匹配到房间名则显示房间名，否则留空
        if (input) {
          const room = state.roomList.find((r) => r.id === roomId);
          input.value = room && room.name ? room.name : '';
        }
      }
      if (reason) {
        state.pendingRoomId = roomId;
        state.autoJoinAttempted = false;
        const message =
          customMessage ||
          (reason === 'disconnected'
            ? '语音连接已断开，请重新进入房间'
            : reason === 'connect-failed'
              ? '语音连接失败，请检查网络或服务端 LiveKit 配置后重试'
              : '已离开房间');
        setRoomError(message);
      }
    }

    state.leaving = false;
    if (!silent && !reason) showToast('已离开房间', 'info');
  }

  /* -------------------------------------------------------
     事件分发
     ------------------------------------------------------- */
  function handleAction(action, target) {
    switch (action) {
      case 'leave':
        openModal('leaveModal');
        break;
      case 'notice':
        showToast(
          $('#roomNotice')?.textContent?.trim() || '全站公告：语聊房已支持中途进房同步歌词',
          'info',
        );
        break;
      case 'share':
        void shareRoom();
        break;
      case 'seat-mode':
        void toggleSeatMode();
        break;
      case 'mic':
        void toggleMic();
        break;
      case 'speaker':
        toggleSpeaker();
        break;
      case 'settings':
        openModal('settingsModal');
        void refreshAudioDevices({ requestPermission: true });
        break;
      case 'toggle-play':
        togglePlay();
        break;
      case 'prev':
        prevSong();
        break;
      case 'next':
        nextSong();
        break;
      case 'clear-chat':
        clearChat();
        break;
      case 'send':
        void sendMessage();
        break;
      case 'image':
        showToast('网页版暂不支持发送图片', 'info');
        break;
      case 'add-song':
        addSong();
        break;
      case 'clear-queue':
        void clearQueue();
        break;
      case 'toggle-lyrics':
        toggleLyrics();
        break;
      case 'home':
        showToast('你已经在 DakeMusic 语聊房', 'info');
        break;
      default:
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (state.emojiOpen && !target.closest('#emojiPop') && !target.closest('#emojiBtn')) {
        closeEmoji();
      }

      const requestSongButton = target.closest('[data-request-song]');
      if (requestSongButton) {
        event.preventDefault();
        const index = Number(requestSongButton.dataset.requestSong);
        const song = state.songResults && state.songResults[index];
        if (song) void requestLiveSong(song);
        return;
      }

      const kickButton = target.closest('[data-kick-main]');
      if (kickButton) {
        event.preventDefault();
        kickFromMain(kickButton.dataset.kickMain || '');
        return;
      }

      const adminButton = target.closest('[data-toggle-admin]');
      if (adminButton) {
        event.preventDefault();
        setRoomAdmin(
          adminButton.dataset.toggleAdmin || '',
          adminButton.dataset.adminOn === '1',
        );
        return;
      }

      const approveButton = target.closest('[data-seat-approve]');
      if (approveButton) {
        event.preventDefault();
        const request = state.pendingSeatRequests.find(
          (item) => item.reqId === approveButton.dataset.seatApprove,
        );
        if (request) approveSeatRequest(request);
        return;
      }

      const rejectButton = target.closest('[data-seat-reject]');
      if (rejectButton) {
        event.preventDefault();
        const request = state.pendingSeatRequests.find(
          (item) => item.reqId === rejectButton.dataset.seatReject,
        );
        if (request) rejectSeatRequest(request);
        return;
      }

      const actionElement = target.closest('[data-action]');
      if (actionElement) {
        event.preventDefault();
        handleAction(actionElement.dataset.action || '', actionElement);
        return;
      }

      if (target.closest('[data-close-modal]')) {
        event.preventDefault();
        closeAllModals();
        return;
      }

      if (target.closest('[data-close-overlays]')) {
        event.preventDefault();
        closeOverlays();
        return;
      }

      if (target.closest('[data-close-drawer]')) {
        event.preventDefault();
        closeMobilePanels();
        return;
      }

      if (target.closest('[data-close-song]')) {
        event.preventDefault();
        closeSongDrawer();
        return;
      }

      const openSongButton = target.closest('[data-open-song]');
      if (openSongButton) {
        event.preventDefault();
        openSongDrawer();
        return;
      }

      const drawerButton = target.closest('[data-drawer]');
      if (drawerButton) {
        event.preventDefault();
        openMobilePanel(drawerButton.dataset.drawer || 'members');
        return;
      }

      const seat = target.closest('[data-seat]');
      if (seat) {
        event.preventDefault();
        void requestSeat(seat.dataset.seat || '');
        return;
      }

      const member = target.closest('[data-member]');
      if (member) {
        event.preventDefault();
        openProfile(member.dataset.member || '');
        return;
      }

      const removeButton = target.closest('[data-remove-queue]');
      if (removeButton) {
        event.preventDefault();
        void removeQueueItem(Number(removeButton.dataset.removeQueue));
        return;
      }

      const livePlayButton = target.closest('[data-live-play]');
      if (livePlayButton) {
        event.preventDefault();
        togglePlay();
        return;
      }

      const playButton = target.closest('[data-play]');
      if (playButton) {
        event.preventDefault();
        const index = Number(playButton.dataset.play);
        if (state.mode === 'demo') {
          if (index === state.songIndex) togglePlay();
          else setSong(index);
        }
        return;
      }

      const songItem = target.closest('[data-song]');
      if (songItem) {
        event.preventDefault();
        if (state.mode === 'demo') {
          const index = Number(songItem.dataset.song);
          if (index === state.songIndex) togglePlay();
          else setSong(index);
        }
        return;
      }

      const emoji = target.closest('[data-emoji]');
      if (emoji) {
        event.preventDefault();
        insertEmoji(emoji.dataset.emoji || '');
        return;
      }

      const roomPick = target.closest('[data-room-id]');
      if (roomPick) {
        event.preventDefault();
        const roomId = roomPick.dataset.roomId || '';
        const idInput = $('#roomIdInput');
        // 点击候选房间时输入框显示房间名（而非托管 ID），进入仍用 roomId
        if (idInput) {
          const room = state.roomList.find((r) => r.id === roomId);
          idInput.value = room && room.name ? room.name : roomId;
        }
        const passwordInput = $('#roomPasswordInput');
        if (roomPick.dataset.hasPassword === '1') {
          setRoomError('该房间需要密码，请输入后进入');
          passwordInput?.focus();
          return;
        }
        if (passwordInput) passwordInput.value = '';
        void joinRoomFlow(roomId, '');
      }
    });

    $('#loginForm')?.addEventListener('submit', handleAuthSubmit);
    $('#createRoomForm')?.addEventListener('submit', createRoom);
    $('#toggleRegister')?.addEventListener('click', toggleAuthMode);
    $('#logoutBtn')?.addEventListener('click', () => void logout());
    $('#roomRefreshBtn')?.addEventListener('click', () => void loadRooms());
    $('#joinRoomBtn')?.addEventListener('click', () => {
      const roomId = $('#roomIdInput')?.value || '';
      const password = $('#roomPasswordInput')?.value || '';
      void joinRoomFlow(roomId, password);
    });
    $('#roomIdInput')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const password = $('#roomPasswordInput')?.value || '';
      void joinRoomFlow($('#roomIdInput')?.value || '', password);
    });
    $('#roomPasswordInput')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void joinRoomFlow($('#roomIdInput')?.value || '', $('#roomPasswordInput')?.value || '');
    });
    // 输入房间名 / 创建者时，实时过滤下方房间列表（room_xxx ID 或链接不参与过滤）
    $('#roomIdInput')?.addEventListener('input', (event) => {
      const keyword = String(event.target.value || '').trim().toLowerCase();
      if (!keyword || /^room_[a-z0-9_]+$/i.test(keyword) || /^https?:\/\//i.test(keyword)) {
        setText('#roomCount', state.roomList.length);
        renderFilteredRooms(state.roomList);
        return;
      }
      const matched = state.roomList.filter((room) => {
        const name = String(room.name || '').toLowerCase();
        const owner = String(room.ownerNickname || room.ownerName || '').toLowerCase();
        return name.includes(keyword) || owner.includes(keyword);
      });
      renderFilteredRooms(matched, keyword);
    });
    // 点击房间卡片：带密码则填入密码框提示，否则直接进入
    $('#roomPicker')?.addEventListener('click', (event) => {
      const card = event.target.closest('.room-pick');
      if (!card) return;
      const roomId = card.dataset.roomId;
      if (!roomId) return;
      const hasPassword = card.dataset.hasPassword === '1';
      const input = $('#roomIdInput');
      if (input) input.value = roomId;
      if (hasPassword) {
        setRoomError('该房间需要密码，请输入后点击「进入」');
        $('#roomPasswordInput')?.focus();
        return;
      }
      void joinRoomFlow(roomId, '');
    });
    $('#confirmLeave')?.addEventListener('click', () => {
      closeAllModals();
      void leaveCurrentRoom();
    });
    $('#emojiBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      toggleEmoji();
    });
    $('#chatInput')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      void sendMessage();
    });
    $('#songSearch')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (state.mode === 'live') void searchSongs();
      else addSong();
    });

    const micVol = $('#micVol');
    micVol?.addEventListener('input', () => applyMicVolume(micVol.value));

    const speakerVol = $('#speakerVol');
    speakerVol?.addEventListener('input', () => applySpeakerVolumeSetting(speakerVol.value));

    $('#settingsMicVol')?.addEventListener('input', (event) => applyMicVolume(event.target.value));
    $('#settingsSpeakerVol')?.addEventListener('input', (event) => applySpeakerVolumeSetting(event.target.value));

    $('#audioInputSelect')?.addEventListener('change', (event) => {
      void applyAudioDevice('audioinput', event.target.value);
    });
    $('#audioOutputSelect')?.addEventListener('change', (event) => {
      void applyAudioDevice('audiooutput', event.target.value);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      void refreshAudioDevices();
    });

    const progressTrack = $('#progressTrack');
    const seek = (clientX) => {
      if (state.mode === 'live') {
        showToast('播放进度由房主端控制', 'info');
        return;
      }
      const song = currentSong();
      const duration = Number(song?.duration) || 0;
      if (!duration) return;
      const rect = progressTrack.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      state.progress = Math.round(duration * ratio);
      updateProgress();
      updateLyrics(true);
    };
    progressTrack?.addEventListener('click', (event) => seek(event.clientX));
    progressTrack?.addEventListener('keydown', (event) => {
      if (state.mode === 'live') return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const duration = Number(currentSong()?.duration) || 0;
      state.progress = Math.min(
        duration,
        Math.max(0, state.progress + (event.key === 'ArrowRight' ? 5 : -5)),
      );
      updateProgress();
      updateLyrics(true);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeOverlays();
    });

    window.addEventListener('offline', () => showToast('网络已断开，正在等待恢复', 'warning'));
    window.addEventListener('online', () => showToast('网络已恢复', 'success'));

    window.addEventListener('pagehide', () => {
      if (state.mode !== 'live' || state.leaving) return;
      state.leaving = true;
      const token = getToken();
      if (state.roomId && token) {
        try {
          fetch(`${API_BASE}/api/rooms/${encodeURIComponent(state.roomId)}/leave`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true,
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      try {
        state.lkRoom?.disconnect();
      } catch {
        /* ignore */
      }
    });
  }

  /* -------------------------------------------------------
     启动
     ------------------------------------------------------- */
  function init() {
    state.pendingRoomId = normalizeRoomId(params.get('room') || '');
    state.autoJoinAttempted = false;

    window.DAKE_WEBROOM_DEBUG = {
      get state() {
        return state;
      },
      packets: debugPackets,
      clear() {
        debugPackets.length = 0;
      },
    };

    resetDemoState();
    renderAll();
    renderEmojis();
    bindEvents();
    startTicker();

    setText('#entryApiHost', new URL(API_BASE).host);
    const gate = $('#entryGate');
    if (gate) gate.classList.remove('is-hidden');
    state.gateOpen = true;
    setGateView('login');

    // 不再把托管房间 ID 直接填入输入框——房间名在 loadRooms 后解析显示

    const hadToken = Boolean(getToken());
    if (hadToken) setAuthError('正在恢复登录状态…');
    void initAuth();
  }

  init();
})();
