# 架构地图

改代码前先看这一页。它只回答「东西在哪、怎么连起来」，细节去对应文档。

## 进程与目录

| 目录 | 跑在哪 | 负责什么 |
|---|---|---|
| `src/main/` | 主进程（Node） | 窗口、原生播放引擎、下载、更新、本地库、语聊房客户端、IPC 注册 |
| `src/preload/` | 预加载（隔离世界） | 把主进程能力包成 `window.electron.*`，带通道白名单 |
| `src/renderer/` | 渲染进程（Vue 3） | 全部界面：播放器、歌词页、设置、语聊房 UI |
| `src/shared/` | 两边共用 | 类型、常量、纯函数（CSP、端点、下载元信息、快捷键表） |
| `native/` | 主进程加载的 `.node` | 播放器、音频采集、媒体控制、SQLite（Rust/C++ 编译产物） |
| `server/` | 主进程内嵌 | 打包进安装包的酷狗接口服务（`server/module`、`server/util`） |
| `room-server/` | 独立 Node 服务 | 语聊房后端（用户、房间、麦位、消息、LiveKit 令牌、网页版） |
| `site/` | 静态站点 | 官网，部署到 dkyy.top |
| `scripts/` | 工具 | 部署脚本、更新清单签名等 |

## 一次请求怎么走

```
界面点击
  └─ src/renderer/utils/request.ts
       └─ window.electron.api.request        （preload 暴露）
            └─ 主进程 server.ts 执行 server/module/*.js
                 └─ 直连酷狗网关（gateway.kugou.com / complexsearch.kugou.com）
```

音乐播放**不经过自己的服务器**：地址解析在 `src/renderer/stores/player/resolver.ts`，真正解码在原生引擎。

## IPC 约定

- 注册入口：`src/main/ipc/registry.ts` 的 `ipcRegistry.registerHandler / registerListener`
- 当前 **126 个通道**，全部集中注册，前缀按域命名（`player:`、`storage:`、`local-music:`、`update:install`…）
- 两道闸：
  1. `registry.ts` 校验 `event.senderFrame.url` 必须属于应用自身页面（`IPC_FORBIDDEN`）
  2. `preload` 的 `RENDERER_CHANNEL_ALLOWLIST` 只放行明确列出的通道
- 加新通道的标准做法：
  1. main 里 `ipcRegistry.registerHandler('域:动作', ...)`
  2. preload 在对应命名空间加类型化方法（不要往 allowlist 里塞）
  3. `src/renderer/electron.d.ts` 补签名

## 数据存在哪

| 数据 | 位置 |
|---|---|
| 应用设置 | 渲染层 Pinia `setting`，由 `window.electron.storage` 落到原生 SQLite（`native/dake-sqlite-store`） |
| 本地音乐库 | `userData/local-music-libraries.json`（库列表 + 曲目缓存） |
| 开发模式 userData | 项目根 `.dev-userdata/`（`src/main/index.ts` 强制切换） |
| 播放缓存 / 下载 | `userData` 下的下载目录与缓存目录 |
| 日志 | `electron-log`，设置里可打开日志目录 |

## 关键链路

**播放**：`stores/player.ts` → `stores/player/playback.ts`（状态机）→ `utils/player.ts`（引擎桥）→ 原生 `.node` → `player:audio-output-stats` 回到渲染层（音质链路面板用的就是它）。

**歌词**：`stores/lyric.ts` 拉取与解析 → `LyricScroller` 渲染；桌面歌词是独立 BrowserWindow（`main/desktopLyric/`）。

**更新**：`main/ipc/settings.ts` → `electron-updater`，源顺序 = 腾讯云 `/dl/` → GitHub 加速 → GitHub；安装前 `main/updateIntegrity.ts` 用 Ed25519 校验 `latest.yml.sig`。

**安全**：`shared/csp.ts`（策略）+ `main/security.ts`（响应头、导航拦截、权限白名单）+ `main/ipc/registry.ts`（IPC 来源）。

## 构建与发布

| 命令 | 作用 |
|---|---|
| `pnpm dev` | Vite + Electron 开发模式 |
| `pnpm test` | `node --test tests/*.test.ts tests/*.test.mjs` |
| `pnpm lint` / `pnpm build` | ESLint（带 --fix）/ 类型检查 + 打包 |
| `pnpm build:win` | Windows 安装包（先装 `server/` 生产依赖） |
| `pnpm release:sign` | 给 `release/latest.yml` 生成 `.sig`，发版必跑 |

打包配置在 `package.json` 的 `build` 字段：asar、`files` 白名单、`server/` 作为 extraResources、NSIS 安装器、更新源。

## 相关文档

- `docs/security.md`：安全基线与未做项
- `docs/anti-piracy.md`：构建签名与防翻卖
- `docs/packaging.md`：打包细节
- `docs/plugin-system.md`：插件系统
- `docs/ui-inventory.md`：界面清单与改样式的入口
- `docs/ui-borrowed.md`：从别的项目借鉴的交互清单
