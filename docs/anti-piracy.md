# 防翻卖 · 第一阶段（只观察，不拦截）

目标：先看清「真实用户里有多少是非官方构建」，确认没有误伤，再决定要不要拒绝。

## 现在做了什么

1. **客户端带上构建标识**
   - 打包时由 `vite.config.mts` 注入 `版本 / 构建时间戳 / 渠道`
   - `src/shared/buildInfo.ts` 拼成 `v=2.4.7;b=20261105T1622;ch=release`
   - `src/renderer/utils/roomApi.ts` 每次请求官方接口都带 `X-Dake-Build`

2. **服务端只记录，不拒绝**
   - `room-server/index.js` 中间件解析该头，写结构化日志
   - 事件名：`client_build_present` / `client_build_missing`
   - 同一个「路径 + 状态」每分钟最多记一次，避免刷日志
   - 请求继续走原流程，一律正常返回

## 怎么看结果

```bash
# 最近 300 行里的构建标识记录
pm2 logs room-server --lines 300 --nostream | grep client_build

# 按天统计（示例：缺标识的请求数）
pm2 logs room-server --lines 5000 --nostream | grep -c client_build_missing
pm2 logs room-server --lines 5000 --nostream | grep -c client_build_present
```

日志字段：`path`、`ip`（取 `X-Real-IP`）、`build`、`ua`。

## 判读要点

| 现象 | 含义 |
|---|---|
| `missing` 几乎全部来自旧版本号（≤ 2.4.7） | 正常，旧包本来没有这个头 |
| 出现大量 `missing` 且 UA 是官方安装包 | 说明有人在用旧包，属于预期 |
| 出现 `present` 但 `b=` 不是你的发布时间戳 | 有人拿新源码自己构建 |
| 出现 `missing` 但版本号写的是新版本 | 明显改包（改了版本却没改代码） |

## 第二阶段（观察 2 周后再做）

满足以下条件才收紧：

1. 新版本发布后，`present` 占比稳定（说明官方包正常工作）
2. `missing` 里没有大比例的真实用户（避免误伤）

收紧方式（按保守到激进）：

- **A. 只对新版本拒绝**：`v >= 2.4.8` 且无有效头 → 403，旧的 2.4.7 继续放行
- **B. 加签名**：构建时用私钥签 `版本+时间戳`，服务端用公钥验签；改包无法伪造
- **C. 白名单**：服务器配置允许的构建 ID，发版时登记

## 注意

- 音乐播放直连酷狗，**不经过本项目服务器**，所以这套机制只能锁「语聊房 / 账号 / 更新」
- 没有商标时不要贸然收紧：误伤的用户没有依据投诉你，只会给差评
- 私钥（若启用签名）只放打包机，绝不进仓库
