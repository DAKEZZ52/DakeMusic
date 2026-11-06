# 安全基线

记录已生效的加固项，以及**还没做**的部分。改涉及安全边界的代码前先读这页。

## 已生效（2026-11-06，P0）

### 1. 内容安全策略（CSP）

- 定义：`src/shared/csp.ts`
- 注入：`vite.config.mts` 的 `cspPlugin`（生产构建写入 `<meta>`）+ `src/main/security.ts`（http(s) 响应头）
- 允许的来源：
  - 脚本：`self`、`file:`、`'unsafe-inline'`（首帧主题内联脚本）、腾讯验证码域
  - 图片/音频：`self file: data: blob: https:`
  - 连接：`self file: https: wss:` + 本机回环
  - `object-src 'none'`、`base-uri 'none'`、`frame-src` 只放行验证码
- 残留：`script-src 'unsafe-inline'` 是为了不闪白；外部脚本已收口到白名单

### 2. 导航拦截

- `src/main/security.ts` 的 `hardenWebContents()`：`will-navigate` / `will-redirect` 只允许 `file:`、`about:` 与开发服务器同源；外链交给系统浏览器
- 已接入三个窗口：主窗口（`window/index.ts`）、迷你播放器（`miniPlayer.ts`）、桌面歌词（`desktopLyric/window.ts`）
- 同时禁用 webview 挂载

### 3. 权限白名单

- `session.defaultSession.setPermissionRequestHandler`：只放行**音频采集**（语聊房麦克风），摄像头/通知/剪贴板一律拒绝
- `setPermissionCheckHandler` 同步收紧

### 4. 更新源校验

- `src/shared/githubAccelerator.ts`：加速地址必须是「https + 纯域名」，拒绝协议降级、路径、查询串、凭据
- 不合规的加速地址会被忽略，更新回落到官方 https 源

### 5. 语聊房内容访问

- `room-server/index.js` 新增 `canAccessRoomContent()`：
  - 公开房：保持公开（不破坏老客户端）
  - **设了密码的房**：必须是房内成员 / 房主 / 管理员
- 三处生效：`GET /api/rooms/:id/messages`、WS `join_room`、WS `chat`
- WS 发消息另外补了：封禁校验、500 字上限、10 秒 10 条限流
- 客户端拉消息改为带 token（`roomApi.ts` 的 `auth: true`）

### 6. IPC 来源校验

- `src/main/ipc/registry.ts`：所有 handler / listener 统一检查 `event.senderFrame.url`
- 只接受：应用目录下的 `file://` 页面、开发服务器同源页面、`about:blank`
- 拒绝：任意 https 页面、`data:`/`blob:` 页面、其它目录的 `file://`
- 被拒时记录 `[IPC] 已拒绝不可信来源的调用`，并抛 `IPC_FORBIDDEN:<channel>`

### 7. 更新包完整性（不依赖付费证书）

- `scripts/sign-update-manifest.mjs`：发布前用打包私钥给 `latest.yml` / `beta.yml` 生成 `.sig`
- `src/main/updateIntegrity.ts`：安装前拉取清单与签名，用内置公钥验签，并核对版本号
- 签名缺失（老发布）→ 记日志放行；签名无效 / 版本不符 → 阻止安装
- 发布流程多一步：`pnpm release:sign`，把 `latest.yml.sig` 一起传到 `/dl/`

## 还没做（按优先级）

| 项 | 说明 |
|---|---|
| 验证码隔离（待定） | `TCaptcha.js` 仍加载在主世界。彻底方案是独立窗口（无 preload），但会改变验证码的展示形态（弹窗而非内嵌），需要确认 UX |

| 真正的代码签名 | `win.publisherName` 需要付费证书才能生效；当前用自签清单签名替代 |
| IPC 数量收敛 | 当前 125 个 handler，preload 1271 行，建议按域收口 |
| 聊天记录全量鉴权 | 公开房仍是公开读；要等客户端都升级到带 token 的版本再收紧 |

## 改动验证方式

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
# 启动后确认：CSP meta 存在、页面不空白、外链导航被拦
```
