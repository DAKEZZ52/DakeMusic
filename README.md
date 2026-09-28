# EchoMusic

<p align="center">
  <img src="build/icons/icon.png" width="128" height="128" alt="DakeMusic Logo">
</p>

<p align="center">
  <strong>EchoMusic</strong> —— 一个专为桌面端打造的简约、精致、功能强大的第三方音乐播放器。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43.4.1-blue?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Vue-3.5-brightgreen?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-napi--rs-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform">
  <img src="https://img.shields.io/badge/License-GPLv3-orange" alt="License">
</p>

---

## ✨ 核心特性

- **极致美学**：精心适配桌面端布局，支持深浅色模式与主题色自定义，完美兼顾信息密度、个性表达与沉浸式体验。
- **数据路径透明**：核心音乐请求由本地服务直接访问对应平台；项目不提供音频中转或云端账号托管。第三方插件具备独立网络能力，安装前请确认来源可信。
- **音乐推荐**：支持歌曲、歌单、歌手、专辑、排行榜等内容推荐。
- **多维探索**：支持歌曲、歌手、专辑、歌单、歌词、MV 全方位搜索，快速发现心仪旋律。
- **外部歌单导入**：支持网易云、QQ 音乐、酷我、酷狗、汽水、Spotify、Apple Music 导入。
- **进阶播放**：支持播放队列管理、播放模式切换、音量调节、进度拖动、倍速播放、淡入淡出切歌等核心播放能力。
- **私人 FM**：智能推荐个性化电台，发现更多好音乐。
- **音乐云盘**：支持本地音频和跨平台文件导入，快速将专属音乐同步至云端存储。
- **听歌识曲**：支持麦克风和系统音频捕获，快速识别正在播放的歌曲。
- **歌曲详情**：支持查看歌曲档案及播放详情。
- **分享功能**：支持将你喜欢的歌曲、歌单、专辑、歌手、插件一键分享给好友或社交平台。
- **歌曲评论**：支持查看歌曲评论与评论楼层跳转。
- **歌词显示**：支持 LRC/YRC 逐字歌词解析、歌词选择、歌词翻译、正则过滤、滚动同步、全屏歌词、写真模式、桌面歌词。
- **音频增强**：内置跨平台音效引擎，支持 10 段均衡器（按完整频响自动前级补偿）、LUFS 响度标准化和 WAV/IRS 空间音效；也可导入兼容音效引擎，扩展更多预设、可调参数与组合音效。
- **实时频谱分析**：直接从播放引擎提取音频数据，使用 FFT 进行实时频谱分析，为插件提供低延迟、高精度的频谱帧。
- **系统媒体控制**：原生集成 macOS MPNowPlayingInfoCenter、Windows SMTC、Linux MPRIS，支持系统媒体按键和进度同步。
- **系统集成**：支持窗口控制、系统托盘、托盘快捷控制、全局快捷键、开机自启动、启动时最小化和 mini 模式。
- **音频设备**：支持切换音频输出设备、独占模式输出。
- **插件扩展**：支持在线插件源浏览安装与本地插件加载，自定义页面、侧边栏入口、设置项、播放器按钮、歌曲右键菜单与播放事件监听。
- **持久化能力**：支持设置、播放历史、收藏、播放状态等本地持久化。
- **跨平台支持**：完整适配 macOS、Windows 与 Linux 系统。
- **应用更新**：内置版本检测与更新日志；支持自动更新的平台可在应用内下载安装，macOS 当前提供 DMG 手动更新入口。
- **持续集成**：完善的 GitHub Actions 配置，支持多平台自动构建与 Release 发布。

