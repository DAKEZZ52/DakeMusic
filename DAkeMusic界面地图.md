# DakeMusic 组件地图

> 全项目 Vue 组件一览，按目录分类，标注行数和用途。
> 作者：知之Dake | 更新：2026-10-31

---

## 📁 views/ — 页面级组件（路由入口）

### 首页 & 推荐
| 文件 | 行数 | 说明 |
|------|------|------|
| Home.vue | 1008 | 首页：Hero Banner + 风格推荐歌单网格 |
| Explore.vue | 1205 | 发现页：推荐歌单、排行榜入口 |
| Search.vue | 697 | 搜索页：搜索框 + 结果切换 |
| SearchHeader.vue | 41 | 搜索子组件：搜索框头部 |
| SearchDiscovery.vue | 109 | 搜索子组件：发现页（热门搜索） |
| SearchResultsSkeleton.vue | 155 | 搜索子组件：加载骨架屏 |
| SearchSongResultsPanel.vue | 145 | 搜索子组件：歌曲结果列表 |
| SearchGridResultsPanel.vue | 43 | 搜索子组件：歌单/专辑/歌手网格 |
| SearchLoadMoreStatus.vue | 28 | 搜索子组件：加载更多状态 |
| RecommendSongs.vue | 268 | 每日推荐歌曲页 |

### 歌曲详情 & 播放
| 文件 | 行数 | 说明 |
|------|------|------|
| SongDetail.vue | 2134 | 歌曲详情页：封面+歌词+评论+相关推荐 |
| AlbumDetail.vue | 947 | 专辑详情页 |
| ArtistDetail.vue | 1252 | 歌手详情页 |
| PlaylistDetail.vue | 1233 | 歌单详情页 |
| MvDetail.vue | 798 | MV 播放页 |

### 歌词 & 播放器页
| 文件 | 行数 | 说明 |
|------|------|------|
| LyricPage.vue | 1018 | 播放器主页：黑胶唱片+歌词同步 |
| LyricScroller.vue | 1038 | 歌词滚动器：逐行高亮+拖拽 |
| LyricPlayerControls.vue | 836 | 播放器控制栏：播放/进度/切歌/音量 |
| LyricSettingsDrawer.vue | 737 | 歌词设置抽屉：字体/颜色/行高 |
| LyricSourceDialog.vue | 1007 | 歌词来源选择弹窗 |
| LyricFluidBackground.vue | 295 | 歌词页流体动态背景 |
| LyricPageTitlebar.vue | 42 | 歌词页顶部标题栏 |
| LyricMode.vue | 41 | 歌词模式切换按钮 |
| LyricSkinSettingsPanel.vue | 28 | 歌词皮肤设置面板容器 |
| PortraitMode.vue | 482 | 竖屏模式（手机风格） |
| AmllMode.vue | 332 | AMLL 动感歌词模式 |
| CoverMode.vue | 151 | 封面模式（只显示封面不滚动歌词） |

### 我的 & 个人
| 文件 | 行数 | 说明 |
|------|------|------|
| Profile.vue | 1259 | 个人主页：头像+昵称+等级+统计 |
| Favorites.vue | 874 | 我喜欢的音乐 |
| Cloud.vue | 699 | 音乐云盘：上传/管理 |
| Purchased.vue | 607 | 已购音乐 |
| LocalMusic.vue | 278 | 本地音乐扫描 |
| History.vue | 1411 | 播放历史 |
| PersonalFm.vue | 1120 | 私人 FM |
| Ranking.vue | 476 | 排行榜 |

### 语聊房
| 文件 | 行数 | 说明 |
|------|------|------|
| ChatRoom.vue | 4645 | 语聊房主界面（左侧成员栏+中央舞台+聊天+底部控制） |
| ChatRoomList.vue | 1517 | 语聊房列表：浏览/搜索/创建房间 |
| ChatRoomFloating.vue | 733 | 语聊房悬浮窗模式 |
| ProfilePage.vue | 1150 | 聊天室内用户资料卡 |
| SongRequestPanel.vue | 384 | 点歌台右侧抽屉 |
| **components/ChatRoomBackground.vue** | 125 | ✨ 语聊房背景层（星空极光/自定义图） |
| **components/ChatRoomTopbar.vue** | 199 | ✨ 语聊房顶部栏（房间名/状态/点歌/退出） |
| **components/ChatRoomMemberList.vue** | 342 | ✨ 语聊房左侧成员列表 |

### 其他页面
| 文件 | 行数 | 说明 |
|------|------|------|
| Login.vue | 716 | 登录页 |
| Settings.vue | 1344 | 设置页容器 |
| Download.vue | 242 | 下载管理页 |
| Recognize.vue | 1144 | 人声分离工具页 |
| Separator.vue | 611 | 人声分离工具页（MDX-Net） |
| ListenTogether/index.vue | 1892 | 一起听房间 |
| ShareResolve.vue | 681 | 分享链接解析跳转 |
| ErrorPage.vue | 366 | 错误页 |
| Loading.vue | 260 | 加载页 |

---

## 📁 layouts/ — 布局组件

| 文件 | 行数 | 说明 |
|------|------|------|
| MainLayout.vue | 301 | 主布局：侧边栏+内容区+播放器栏 |
| Sidebar.vue | 1849 | 左侧边栏：导航菜单+歌单列表 |
| TitleBar.vue | 1329 | 自定义标题栏（毛玻璃+交通灯） |
| PlayerBar.vue | 903 | 底部播放栏（迷你播放器） |
| WindowControls.vue | 115 | 窗口控制按钮（最小化/最大化/关闭） |
| OverlayHeader.vue | 75 | 浮层页面头部 |
| TitlebarActionButton.vue | 53 | 标题栏操作按钮 |
| TitleBarMoreMenu.vue | 341 | 标题栏更多菜单 |
| **components/SidebarUserCard.vue** | 121 | ✨ 侧边栏底部用户信息卡片 |
| **components/SidebarPlaylistHeader.vue** | 149 | ✨ 侧边栏歌单 Tab 切换头部 |

---

## 📁 components/ui/ — 通用 UI 组件库

| 文件 | 行数 | 说明 |
|------|------|------|
| Button.vue | 76 | 按钮 |
| Avatar.vue | 75 | 头像（带默认占位） |
| Input.vue | 53 | 输入框 |
| Textarea.vue | 72 | 多行输入框 |
| Switch.vue | 67 | 开关 |
| Checkbox.vue | 108 | 复选框 |
| Slider.vue | 177 | 滑块（音量/进度） |
| Dialog.vue | 347 | 弹窗对话框 |
| Drawer.vue | 159 | 抽屉 |
| Popover.vue | 256 | 气泡浮层 |
| Tooltip.vue | 122 | 文字提示 |
| TooltipScope.vue | 18 | Tooltip 作用域容器 |
| Scrollbar.vue | 465 | 自定义滚动条 |
| Select.vue | 485 | 下拉选择 |
| DatePicker.vue | 484 | 日期选择器 |
| ColorPickerDialog.vue | 358 | 颜色选择弹窗 |
| Tag.vue | 79 | 标签 |
| TagInput.vue | 200 | 标签输入器 |
| Badge.vue | 29 | 角标 |
| Cover.vue | 138 | 封面图（加载失败占位） |
| Image.vue | 70 | 图片（懒加载+错误占位） |
| Skeleton.vue | 113 | 骨架屏 |
| VirtualGrid.vue | 253 | 虚拟滚动网格 |
| CustomTabBar.vue | 187 | 自定义 Tab 栏 |
| Tabs.vue / TabsList / TabsTrigger / TabsContent | 14-31 | Tabs 系列 |
| CustomPicker.vue | 148 | 自定义选择器 |
| CustomSelector.vue | 56 | 自定义下拉选择 |
| PageScrollContainer.vue | 151 | 页面滚动容器 |
| PageStickyHeader.vue | 63 | 吸顶头部 |
| BackToTop.vue | 108 | 回到顶部 |
| InputNumber.vue | 286 | 数字输入框 |
| RollingNumber.vue | 54 | 滚动数字动画 |
| BarrageIcon.vue | 17 | 弹幕图标 |
| MvIcon.vue | 12 | MV 图标 |
| PageLyricIcon.vue | 14 | 歌词页图标 |
| FontIcon.vue | 9 | 字体图标 |
| AudioWaveIcon.vue | 8 | 声波图标 |
| RefreshIcon.vue | 8 | 刷新图标 |

---

## 📁 components/music/ — 音乐业务组件

| 文件 | 行数 | 说明 |
|------|------|------|
| SongList.vue | 1174 | 歌曲列表（通用，支持排序/右键菜单） |
| SongCard.vue | 754 | 歌曲卡片（专辑封面网格） |
| SongListHeader.vue | 207 | 歌曲列表头部（列标题） |
| SongListSkeletonRows.vue | 141 | 歌曲列表骨架屏行 |
| PlaylistCard.vue | 169 | 歌单卡片 |
| PlaylistEditDialog.vue | 364 | 编辑歌单弹窗 |
| PlaylistOrderDialog.vue | 707 | 歌单排序管理弹窗 |
| AddToPlaylistDialog.vue | 201 | 添加到歌单弹窗 |
| ImportPlaylistDialog.vue | 1141 | 导入外部歌单弹窗 |
| PlayerQueueDrawer.vue | 1388 | 播放队列抽屉 |
| PlayerQueueVirtualList.vue | 371 | 播放队列虚拟列表 |
| CommentList.vue | 931 | 评论列表 |
| CommentDrawer.vue | 362 | 评论抽屉 |
| CommentComposer.vue | 202 | 评论输入框 |
| FloorReplyComposer.vue | 150 | 楼层回复输入框 |
| BatchActionDrawer.vue | 821 | 批量操作抽屉 |
| CloudUploadDialog.vue | 1079 | 云盘上传弹窗 |
| BarrageControls.vue | 404 | 弹幕控制栏 |
| BarrageLayer.vue | 275 | 弹幕渲染层 |
| ArtistCard.vue | 119 | 歌手卡片 |
| AlbumCard.vue | 85 | 专辑卡片 |
| MvCard.vue | 135 | MV 卡片 |
| DetailPageSliverHeader.vue | 268 | 详情页吸顶头部 |
| DetailPageSkeleton.vue | 186 | 详情页骨架屏 |
| DetailPageError.vue | 85 | 详情页错误状态 |
| DetailPageActionRow.vue | 126 | 详情页操作按钮行 |
| DynamicAlbumCover.vue | 209 | 动态专辑封面 |

---

## 📁 components/player/ — 播放器效果组件

| 文件 | 行数 | 说明 |
|------|------|------|
| EffectPopover.vue | 2832 | 音效设置弹窗（EQ/混响/变调） |
| EffectPlaza.vue | 523 | 音效广场（在线音效推荐） |
| OnlineAudioEffectCard.vue | 199 | 在线音效卡片 |
| VolumePopover.vue | 165 | 音量调节弹窗 |
| SleepTimerPopover.vue | 517 | 定时关闭弹窗 |
| QualityPopover.vue | 344 | 音质选择弹窗 |
| PitchSpeedPopover.vue | 379 | 变调变速弹窗 |
| PitchPopover.vue | 144 | 变调弹窗 |
| SpeedPopover.vue | 129 | 倍速弹窗 |
| ProgressBusyOverlay.vue | 59 | 加载中转圈遮罩 |

---

## 📁 components/app/ — 应用级组件

| 文件 | 行数 | 说明 |
|------|------|------|
| ToastViewport.vue | 411 | Toast 提示容器 |
| UpdateDialog.vue | 251 | 检查更新弹窗 |
| RouteErrorBoundary.vue | 194 | 路由错误边界 |
| AuthExpiredDialog.vue | 74 | 登录过期弹窗 |
| UserAgreementDialog.vue | 103 | 用户协议弹窗 |
| DisclaimerDialog.vue | 78 | 免责声明弹窗 |
| SettingsDialog.vue | 54 | 设置快捷入口弹窗 |
| KugouVerificationFlow.vue | 765 | 酷狗登录验证流程 |

---

## 📁 components/profile/ — 个人资料组件

| 文件 | 行数 | 说明 |
|------|------|------|
| VipClaimCard.vue | 201 | VIP 领取卡片 |
| ListeningPreferencesDialog.vue | 596 | 听歌偏好设置弹窗 |
| ContentBlacklistDialog.vue | 579 | 内容黑名单弹窗 |
| PreferenceStrengthSlider.vue | 106 | 偏好强度滑块 |

---

## 📁 components/download/ — 下载组件

| 文件 | 行数 | 说明 |
|------|------|------|
| DownloadTaskList.vue | 514 | 下载任务列表 |
| DownloadSettingsPanel.vue | 171 | 下载设置面板 |
| DownloadStatsPanel.vue | 74 | 下载统计面板 |
| DownloadActionBar.vue | 68 | 下载操作栏 |

---

## 📁 components/separator/ — 人声分离组件

| 文件 | 行数 | 说明 |
|------|------|------|
| SeparatorModelSelector.vue | 425 | 分离模型选择 |
| SeparatorActionPanel.vue | 375 | 分离操作面板 |
| SeparatorSourceSelector.vue | 374 | 音频源选择 |
| SeparatorStatusPanel.vue | 200 | 分离状态显示 |
| SeparatorActionBar.vue | 60 | 分离操作按钮栏 |

---

## 📁 components/localMusic/ — 本地音乐组件

| 文件 | 行数 | 说明 |
|------|------|------|
| LocalMusicStatsPanel.vue | 153 | 本地音乐统计面板 |
| LocalMusicActionBar.vue | 90 | 本地音乐操作栏 |

---

## 📁 views/settings/components/ — 设置页子模块

| 文件 | 行数 | 说明 |
|------|------|------|
| PlaybackSettingsSection.vue | 700 | 播放设置（音质/ Gapless /  crossfade） |
| AppearanceSettingsSection.vue | 696 | 外观设置（主题/字体/毛玻璃） |
| SpatialAudioSettingsSection.vue | 710 | 空间音频设置 |
| PlayerSettingsSection.vue | 388 | 播放器设置 |
| DesktopLyricSettingsSection.vue | 333 | 桌面歌词设置 |
| NetworkSettingsSection.vue | 339 | 网络设置（代理/缓存） |
| DataSettingsSection.vue | 318 | 数据设置（导入导出/清空） |
| WindowSettingsSection.vue | 239 | 窗口设置 |
| ShortcutSettingsSection.vue | 137 | 快捷键设置 |
| FontSettingsSection.vue | 127 | 字体设置 |
| AudioDeviceSettingsSection.vue | 141 | 音频设备设置 |
| AboutSettingsSection.vue | 122 | 关于页面 |
| ExperimentalSettingsSection.vue | 439 | 实验性功能 |
| InterfaceSettingsSection.vue | 65 | 界面设置 |
| PageLyricSettingsSection.vue | 147 | 歌词页设置 |
| SettingsSectionShell.vue | 22 | 设置区块外壳（标题+内容插槽） |

---

## 📁 views/lyric/skins/ — 歌词皮肤

| 文件 | 行数 | 说明 |
|------|------|------|
| AmllSkinSettings.vue | 196 | AMLL 歌词皮肤设置 |
| LyricTextStyleSettings.vue | 160 | 歌词文字样式设置 |
| PortraitSkinSettings.vue | 142 | 竖屏皮肤设置 |
| CoverSkinSettings.vue | 40 | 封面模式设置 |
| LyricSkinSettings.vue | 10 | 皮肤设置入口 |

---

## 📁 seatManager/ — 语聊房座位系统

| 文件 | 行数 | 说明 |
|------|------|------|
| SeatStage.vue | 1082 | 座位舞台组件（6小座+1主座） |

---

## 📁 miniPlayer/ — 迷你播放器

| 文件 | 行数 | 说明 |
|------|------|------|
| MiniPlayerView.vue | 1877 | 迷你播放器窗口 |
| MiniLyricPanel.vue | 756 | 迷你歌词面板 |

---

## 📁 desktopLyric/ — 桌面歌词

| 文件 | 行数 | 说明 |
|------|------|------|
| DesktopLyricView.vue | 2218 | 桌面歌词悬浮窗 |

---

## ✨ 本次优化新建组件

| 文件 | 行数 | 说明 |
|------|------|------|
| SidebarUserCard.vue | 121 | 侧边栏底部用户信息卡片（头像+昵称+VIP+设置） |
| SidebarPlaylistHeader.vue | 149 | 侧边栏歌单 Tab 切换 + 排序/刷新/新建菜单 |
| ChatRoomBackground.vue | 125 | 语聊房背景层（星空极光 CSS / 自定义背景图） |
| ChatRoomTopbar.vue | 199 | 语聊房顶部栏（房间名+在线数+点歌+退出） |
| ChatRoomMemberList.vue | 342 | 语聊房左侧成员列表（头像+角色徽章） |
