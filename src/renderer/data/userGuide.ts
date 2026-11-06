/**
 * 内置使用指南
 *
 * 内容按「用户会卡在哪」组织，不按功能清单。改文案直接改这里，不需要动组件。
 */

export interface GuideItem {
  title: string;
  body: string;
}

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  items: GuideItem[];
}

export const USER_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: '快速上手',
    summary: '第一次打开，先做这三件事',
    items: [
      {
        title: '登录酷狗账号',
        body: '左上角头像 → 扫码登录（酷狗 / QQ / 微信）。扫码不需要验证码；手机号或账号密码登录时，酷狗会要求图形验证码。',
      },
      {
        title: '选一首歌试试',
        body: '首页「风格推荐」里点任意歌名开始播放。播放栏右侧可以切原声/伴奏、调音质、开桌面歌词。',
      },
      {
        title: '进入歌词页',
        body: '点播放栏的歌词按钮，或按 Ctrl + K（mac 为 ⌘ K）进入沉浸歌词页；按 Esc 或左上角箭头返回。',
      },
    ],
  },
  {
    id: 'quality',
    title: '播放与音质',
    summary: 'SQ、HQ 到底差在哪',
    items: [
      {
        title: '音质档位',
        body: '标准 128k、高品质 320k（HQ）、无损 FLAC（SQ）；部分歌曲还有 Hi-Res。档位越高流量越大，无损需要会员。',
      },
      {
        title: '输出链路',
        body: '点音质图标 → 弹层底部「输出链路」，能看到当前音源、引擎与设备的采样率、输出格式、驱动、缓冲。如果引擎采样率和设备采样率不同，说明系统做了重采样。',
      },
      {
        title: '独占输出',
        body: '设置 → 音频设备里把输出模式切成 WASAPI 独占，可以绕过系统混音器，避免被系统重采样（独占时其它程序听不到声音是正常的）。',
      },
    ],
  },
  {
    id: 'lyric',
    title: '歌词与桌面歌词',
    summary: '歌词对不上、想放在桌面',
    items: [
      {
        title: '歌词不同步',
        body: '歌词页右下角有偏移调节，按 0.1 秒微调；也可以换歌词版本（歌词来源按钮）。',
      },
      {
        title: '桌面歌词',
        body: '播放栏的「T」按钮，或 Ctrl + D（⌘ D）。桌面上会浮出一层歌词，可拖动、可锁定、可调字号。',
      },
    ],
  },
  {
    id: 'separator',
    title: '音效与人声分离',
    summary: '要伴奏、要变调、要空间音频',
    items: [
      {
        title: '人声分离',
        body: '播放栏点「原声 / 伴奏」切换：第一次需要本地跑一遍分离模型，会花几十秒，之后会缓存。也可以在侧栏「人声分离」页面批量处理。',
      },
      {
        title: '变调与变速',
        body: '播放栏的变速按钮里可以调速度（0.5x–2x）和升降调，互不影响。',
      },
      {
        title: '音效与空间音频',
        body: '音效按钮里是预设均衡器与空间音频（需要先在设置里导入 IR 文件）。',
      },
    ],
  },
  {
    id: 'chatroom',
    title: '语聊房',
    summary: '进房、上麦、点歌',
    items: [
      {
        title: '进入房间',
        body: '侧栏「语聊房」→ 选一个房间进入。设了密码的房间需要先输密码。网页版可以直接在浏览器打开 dkyy.top/webroom。',
      },
      {
        title: '上麦发言',
        body: '点空麦位即可上麦，第一次会请求麦克风权限。房主可以静音、下麦、封禁。',
      },
      {
        title: '点歌',
        body: '房间里的点歌面板可以搜歌并加入房间队列，房主或管理员通过后开始播放。',
      },
    ],
  },
  {
    id: 'download',
    title: '下载与本地音乐',
    summary: '下载、导入、整理',
    items: [
      {
        title: '下载歌曲',
        body: '播放栏的下载按钮或歌单右键菜单。下载完成会写入标签、封面与歌词。',
      },
      {
        title: '导入本地音乐',
        body: '侧栏「本地音乐」→ 添加文件夹，应用会扫描音频文件并读取标签；缺封面或缺歌词时可以手动补。',
      },
      {
        title: '云盘',
        body: '「音乐云盘」可以把本地文件上传，之后在任何设备登录同一账号都能播放。',
      },
    ],
  },
  {
    id: 'shortcuts',
    title: '快捷键',
    summary: '不用鼠标也能操作',
    items: [
      { title: '播放 / 暂停', body: 'Ctrl + 空格（⌘ + 空格）' },
      { title: '上一首 / 下一首', body: 'Ctrl + ← / Ctrl + →' },
      { title: '音量', body: 'Ctrl + ↑ / Ctrl + ↓' },
      { title: '桌面歌词', body: 'Ctrl + D' },
      { title: '沉浸歌词页', body: 'Ctrl + K' },
      { title: '切换播放模式', body: 'Ctrl + P' },
      {
        title: '自定义',
        body: '设置 → 快捷键里可以自己改，也可以开启全局快捷键（窗口不在前台也生效）。',
      },
    ],
  },
];
