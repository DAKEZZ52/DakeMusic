/**
 * 版本亮点
 *
 * 每次发版往数组顶部加一条，version 必须和 package.json 一致。
 * 应用升级后首次启动会自动弹出当前版本的亮点；也可以在「设置 → 关于」里再看。
 */

export interface WhatsNewFeature {
  title: string;
  desc: string;
}

export interface WhatsNewRelease {
  version: string;
  /** 可选：留空时弹窗只显示版本号与条目 */
  headline?: string;
  features: WhatsNewFeature[];
}

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    version: '2.4.9',
    features: [
      {
        title: 'OBS 浏览器源',
        desc: '直播时把「正在播放」叠到画面上：卡片 / 极简两套样式，只在本机提供，OBS 里添加浏览器源即可。',
      },
      {
        title: '下一首预告',
        desc: '歌词页最后 20 秒浮出下一首，点一下就能切；OBS 浮层也支持 ?next=1 显示下一首。',
      },
      {
        title: '音频频谱条',
        desc: '歌词页底部随音乐跳动的频谱，实验性功能，可在设置里开关。',
      },
    ],
  },
  {
    version: '2.4.8',
    features: [
      {
        title: '音质链路面板',
        desc: '音质弹层里新增「输出链路」：看清当前音源、采样率有没有被系统重采样、输出格式与缓冲。',
      },
      {
        title: '切歌浮卡',
        desc: '换歌时右下角浮出封面与歌名，4.5 秒自动收起，点一下也能关。',
      },
      {
        title: '本地信息匹配',
        desc: '本地歌曲可以搜线上信息，按时长比对后把标题、歌手、专辑、封面写回文件标签。',
      },
      {
        title: '更新更稳',
        desc: '更新检查优先走腾讯云源，国内直连更快；弹窗只保留一个主按钮，不再同时出现三种下载入口。',
      },
    ],
  },
  {
    version: '2.4.7',
    headline: '界面与交互的一次大整理',
    features: [
      { title: 'Windows 11 圆角', desc: '主窗口跟随系统使用原生圆角。' },
      { title: '布局密度统一', desc: '列表、详情、设置、搜索与首页的间距收敛到同一套刻度。' },
      { title: '播放栏通栏化', desc: '播放控制栏改为底部通栏样式。' },
      { title: '侧边栏简化', desc: '合并分组结构，常用入口更靠前。' },
    ],
  },
];

export const findRelease = (version: string): WhatsNewRelease | undefined =>
  WHATS_NEW_RELEASES.find((item) => item.version === version);
