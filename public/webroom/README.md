# DakeMusic 语聊房 · 网页版

`public/webroom/` 是从桌面端语聊房布局延伸出来的独立网页版，原生 HTML / CSS / JS，无构建依赖。页面只提供一种使用方式：

- **真实房间**：使用 DakeMusic 账号登录，进入生产房间，通过 LiveKit 同步语音、麦位、歌词、公屏和播放队列。演示模式入口已移除（原有演示数据仅作为登录门背后的背景占位，无法进入）。

## 本地预览

在项目根目录启动 Vite：

```bash
npm run dev
```

打开：

```text
http://localhost:5173/webroom/index.html
```

> 请使用 `localhost`，不要使用 `127.0.0.1`。生产服务的 CORS 白名单默认包含 `http://localhost:5173`，`127.0.0.1` 不在白名单内。
>
> 请保留 `index.html` 完整路径。直接访问 `/webroom/` 时，Vite 的 SPA fallback 可能回退到根应用。

## 接入生产服务

默认配置：

- API：`https://dkyy.top`
- LiveKit：`wss://dkyy.top/livekit`

进入房间时优先使用 `POST /api/rooms/:id/join` 返回的 `wsUrl`。登录态保存在 `localStorage.chat_session`，请求使用 `Authorization: Bearer <token>`。

也可以直接在页面里覆盖配置：

```html
<script>
  window.DAKE_WEBROOM_CONFIG = {
    apiBase: 'https://dkyy.top',
    livekitUrl: 'wss://dkyy.top/livekit',
  };
</script>
```

本地调试时，页面还支持 `?api=` 和 `?lk=` 查询参数覆盖 API / LiveKit 地址（仅在 `localhost` 生效）。

### 房间链接

- 登录后可以在房间列表选择房间，或输入 `room_xxx` / 分享链接进入。
- 直接链接：`https://你的域名/webroom/index.html?room=room_xxx`
- 进入真实房间后地址栏会自动同步 `?room=`；离开房间会移除该参数。
- 房间有密码时，会在房间列表/输入框下方提示输入密码。
- 也可以在网页里创建新房间，创建后会自动加入。

## 已接入的真实能力

- 账号登录 / 注册 / 自动恢复登录态。
- 公开房间列表、刷新、密码房、创建房间、房间分享链接。
- LiveKit 真实语音连接；加入后默认闭麦，上麦后可开麦。
- 麦位协议与桌面端一致：请求上麦、房主/管理员同意或拒绝、下麦、主麦踢人、房间管理员设置/取消。
- 房主/管理员可在网页端处理上麦申请；房主空主麦自动入座。
- 歌词同步：接收桌面端广播的歌词、当前行、心跳和分片大歌词。
  - 歌词来源 = 桌面端「房主」或「当前坐在主麦上、且本地正在放这首歌的 DJ」（两端判定一致）。
  - 浏览器读不到酷狗词库，所以网页端只能被动接收；房间里必须有桌面端在放这首歌才会有歌词。
- 公屏：通过 LiveKit DataChannel 实时收发；网页发送的消息会静默持久化到服务端；支持清屏、表情、违禁词过滤。
- 播放队列：接收服务端广播的 `music_queue_updated` / `music_track_changed`，展示当前歌曲与队列；房主或点歌者可移出队列；“下一首”调用真实接口。

## 网页端限制

网页端不能直接调用 Electron 主进程的酷狗曲库、本地文件、播放器 IPC。因此：

- **点歌搜索与播放受限制**：网页端点歌按钮在真实房间会提示“请在桌面端完成”；歌曲和歌词由房主桌面端广播，网页端只负责展示与同步。
- **播放 / 暂停 / 上一首 / 进度拖动**：真实房间内这些操作由房主端控制；网页端点击会显示限制提示。“下一首”会调用真实接口。
- **发送图片**：暂不支持，点击图片按钮会提示。
- **音频设备选择**：设置弹窗会读取系统真实设备（`enumerateDevices`），选择后立即切换并保存在 `localStorage`；首次打开会请求麦克风权限，未授权时设备名不可见、只能使用系统默认。输出设备切换依赖浏览器的 `setSinkId`（iOS Safari 不支持，需要用系统音量键）。
- **队列“下一首”权限**：服务端会检查旧版 REST 麦位数据库中的 DJ 身份。LiveKit 麦位协议不会更新该表，因此非房主的网页端麦上用户可能收到 `403`；这是服务端既有逻辑，不是网页端渲染问题。
- 公屏历史/队列通过 REST 拉取，实时更新通过 LiveKit DataChannel，和桌面端保持一致。

## CORS 与部署

生产服务只接受白名单中的精确 Origin。若把网页版部署到新的域名/端口，需要把该 Origin 加入服务端的 `CORS_ORIGINS`（逗号分隔，例如 `http://localhost:5173,https://your-domain.example`），然后重启服务。

注意：**同源部署也要加白名单**。浏览器对 `POST` 请求（登录、进房等）会带 `Origin` 头，即使页面和接口同源也一样；服务端若不在白名单里就会直接拒绝。线上把网页版放在 `https://dkyy.top/webroom/` 时，`CORS_ORIGINS` 必须包含 `https://dkyy.top`（以及需要的话 `https://www.dkyy.top`）。

未列入白名单的 Origin 会表现为浏览器网络错误或服务端 `500 INTERNAL_ERROR`（日志里是 `request_error {"err":"CORS 拒绝"}`），页面会提示检查 CORS。

### 线上部署位置（dkyy.top）

- nginx：`/etc/nginx/sites-enabled/dkyy.top`，`root /var/www/html`，`location / { try_files $uri $uri/ /index.html; }`
- 网页版目录：`/var/www/html/webroom/`，访问地址 `https://dkyy.top/webroom/`
- 同源反代（无需额外配置）：`/api/` → `127.0.0.1:3001`，`/livekit` → `127.0.0.1:7880`
- 整个 `webroom/` 目录自包含（含 `assets/`），更新时整目录覆盖即可，不会影响站点根目录的首页
- nginx 对 `/webroom/` 额外加了 `Cache-Control: no-cache`，部署后浏览器会回源校验，避免手机 / WebView 一直看到旧页面

```bash
# 本地打包（在仓库根目录）
tar -czf webroom-dist.tar.gz -C public webroom

# 上传并解压
scp webroom-dist.tar.gz ubuntu@dkyy.top:/tmp/
ssh ubuntu@dkyy.top 'cd /var/www/html && tar -xzf /tmp/webroom-dist.tar.gz && chmod -R a+rX webroom'
```

也可以直接用 `scripts/deploy-webroom.ps1`（见仓库 `scripts/`）。

## 排障

浏览器控制台可以用下面这个调试入口查看实时状态（只读，不影响业务）：

```js
DAKE_WEBROOM_DEBUG.state          // 当前模式、连接状态、麦位、身份等
DAKE_WEBROOM_DEBUG.packets        // 最近收到的 LiveKit DataChannel 数据包（kind/type/是否被接受）
DAKE_WEBROOM_DEBUG.clear()        // 清空上面的记录
```

常见问题：

- **没有歌词**：歌词只能由桌面端广播。确认房间里有一个桌面端正在播放房间当前歌曲，并且它在房主或主麦上；网页端自己无法生成歌词。
- **点麦位提示「语音尚未连接」**：语音连接没建立。先看顶部状态：`正在连接语音…` 说明还在连；`语音连接失败` / `语音已断开` 会给出原因。最常见的原因是服务端 `LK_WS_URL` 配成了 `ws://IP:7880`——https 页面连 `ws://` 会被浏览器按混合内容拦截，必须配成 `wss://dkyy.top/livekit`（网页端也会自动把同源地址纠正成 wss）。
- **被顶下线**：桌面端和网页端用同一个账号会抢同一个 LiveKit identity，后进来的会把先前的踢掉，提示「该账号已在桌面端或另一台设备进入房间」。
- **进房提示「你已被该房间禁言」**：服务端禁言状态未解除，请让房主/管理员解除。
- **提示 CORS / 无法连接**：把网页来源（Origin）加入服务端 `CORS_ORIGINS`。
- **一直显示「正在连接语音…」**：LiveKit 首次连接 15 秒后会判定失败并退回选房页。

## 文件结构

- `index.html`：页面骨架、内联 SVG、三栏布局、座位舞台、歌词卡、公屏、底部控制坞、移动端导航、点歌抽屉、登录/选房入口、弹窗。
- `style.css`：暗色极光玻璃拟态样式、桌面/平板/手机断点、对唱模式、抽屉、弹窗、Toast、登录门、房间选择器、上麦审批面板。
- `app.js`：演示数据与真实模式状态、REST API、LiveKit 连接、音频挂载、DataChannel 协议、麦位/歌词/公屏/队列同步、所有交互。
- `vendor/livekit-client.umd.js`：浏览器版 LiveKit SDK（v2.22.3，UMD 全局 `LivekitClient`）。

## 资源复用

- `/chatroom-bg.jpg`
- `/dakemusic-default-room-cover.png`
- `/seat/speaking-ring.webp`

## 演示数据

演示模式入口（登录门「先看看演示」、选房页「先看看演示房间」）已移除，网页版只能登录进入真实房间。

`app.js` 里仍保留「深夜电台」演示数据，仅用于登录门背后的背景占位；用户无法进入演示房间，也不会影响真实房间逻辑。
