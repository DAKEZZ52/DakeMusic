# AGENTS.md

给在这个仓库里改代码的人和 AI 的规矩。先读 `docs/architecture.md` 摸清结构，再动手。

## 动手前

1. 改任何东西之前先跑一遍基线：`pnpm typecheck`（即 `vue-tsc --noEmit`）、`pnpm test`。
2. 找文件用搜索，不要猜路径；界面改动先在 `docs/ui-inventory.md` 里确认有没有现成入口。
3. 涉及安全边界的改动（CSP、IPC、更新、权限、语聊房鉴权）先看 `docs/security.md`。

## 语言与风格

- 代码注释、提交信息、界面文案用中文；标识符用英文。
- 提交信息格式：`类型(范围): 做了什么`，类型用 `feat / fix / style / refactor / docs / test / chore / revert`。
- 不要写「修复了一些问题」这种空话；一句话说清改了什么、为什么。
- 不要擅自改用户已经定过的偏好（例如歌词页布局、快捷键绑定），要改先问。

## 界面规矩

- 颜色、圆角、间距优先用 `src/renderer/style.css` 里的令牌；不要新写死十六进制色值。
- 浮层模糊只用 `--surface-blur-sm/md/lg/xl` 四档，不要再写 `blur(13px)` 这种。
- 图标颜色统一走 `--window-action-color`，不要在组件里单独写死深浅。
- 主动效遵守 `prefers-reduced-motion`。
- 原生元素不允许 `title` 属性（有测试盯着），需要提示就用 `Tooltip` 组件。
- `:deep()` 只能用在该用它的地方：样式写在**拥有该 DOM 的组件**里，不要跨组件用 `:has()` 去改别人的根节点（会被作用域编译破坏，历史事故见 `8746dff` 之前的提交）。

## 加东西的标准路径

**加一个 IPC 通道**

1. `src/main/ipc/*.ts` 里 `ipcRegistry.registerHandler('域:动作', ...)`
2. `src/preload/index.ts` 加类型化方法（不要塞进 `RENDERER_CHANNEL_ALLOWLIST`）
3. `src/renderer/electron.d.ts` 补类型
4. 如果是写文件/删文件/执行命令，必须在主进程校验路径来源

**加一个歌词页皮肤**

1. `src/renderer/views/lyric/builtinSkins.ts` 注册
2. `src/renderer/views/lyric/skins/config.ts` 加 key 与默认配置
3. 皮肤组件用 `useLyricSkin(key, defaults)` 取配置
4. `plugins/lyricsPage.ts` 的 `HostSkinId` 同步扩展
5. 跑 `pnpm test`，`tests/plugin-lyrics-page.test.mjs` 里有内置皮肤数量断言

**加测试**

- 纯函数放 `src/shared` 或 `src/renderer/utils`，测试放 `tests/*.test.ts`，用 `node --test`。
- 涉及组件树/渲染的用 `tests/*.test.mjs` + `@vue/compiler-sfc`。

## 不要做的事

- 不要复制 AGPL 项目的代码（例如 Folia）。借鉴交互可以，代码自己写，并记到 `docs/ui-borrowed.md`。
- 不要动 `.keys/`（构建签名私钥），也不要把它带进仓库或 CI。
- 不要在没跑通 `vue-tsc`、`eslint`、`test` 的情况下说「改好了」。
- 不要为了通过检查去放宽规则（改断言、加 `eslint-disable`）；要么改代码，要么说明理由。

## 交付前自检

```bash
pnpm typecheck      # 类型
pnpm lint           # 风格（会自动修）
pnpm test           # 611+ 断言
pnpm build          # 生产构建
```

四项都绿再说完成；界面改动附一张截图路径。
