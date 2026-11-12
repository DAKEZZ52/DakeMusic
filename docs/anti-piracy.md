# 防翻卖 · 构建签名与拦截

## 机制

```
打包机（有私钥）                     服务器（只有公钥）
  │                                    │
  ├─ 签名 v=2.4.8;b=…;ch=release       │
  │   sig=<base64url>                  │
  │                                    │
  └─ 客户端每次请求带 X-Dake-Build ───► 验签
                                        ├─ 通过 → 放行
                                        ├─ 版本 < 2.4.8 → 放行（老包没有头）
                                        └─ 其余 → 403 NON_OFFICIAL_BUILD
```

- 算法：Ed25519（`node:crypto`，无第三方依赖、无费用）
- 私钥：`.keys/build-ed25519.pem`（**只在打包机，已 gitignore**）
- 公钥：服务器 `/home/ubuntu/room-server/.env` 的 `DAKE_BUILD_PUBKEY`

## 判定规则（按顺序）

| 顺序 | 条件 | 结果 |
|---|---|---|
| 1 | 非 `/api/*` 或 `OPTIONS` 预检 | 放行 |
| 2 | `Origin`/`Referer` 是 `https://dkyy.top` | 放行（网页版语聊房，浏览器无法签名） |
| 3 | 签名验证通过 | 放行 |
| 4 | 版本低于 `DAKE_BUILD_ENFORCE_FROM`（默认 2.4.8） | 放行（老客户端） |
| 5 | 其余 | **403 `NON_OFFICIAL_BUILD`** |

第 4 条在没有版本号时会用 `User-Agent` 里的 `LyriseMusic/x.y.z` 兜底，
所以「删掉请求头」也绕不过去（UA 会暴露版本）。

## 实测（线上）

| 场景 | 结果 |
|---|---|
| ① 老客户端（无头无版本） | 200 |
| ② 2.4.8 无签名 | **403** |
| ③ 2.4.8 有效签名 | 200 |
| ④ 2.4.8 伪造签名 | **403** |
| ⑤ 网页版（带 Origin） | 200 |
| ⑥ 2.4.8 删头但 UA 露版本 | **403** |

## 用户能看到什么

- 官方用户：无感
- 老版本（≤2.4.7）：无感（走第 4 条放行）
- 网页版语聊房：无感（走第 2 条放行）
- 改包用户：进语聊房 / 登录时提示「当前版本不是官方发布版本，在线功能已停用。请到 dkyy.top 下载官方安装包。」

## 运维

```bash
# 看拦截情况
pm2 logs room-server --lines 300 --nostream | grep client_build

# 临时关闭拦截（例如发现误伤）
ssh ubuntu@dkyy.top
cd /home/ubuntu/room-server
sed -i 's/^DAKE_BUILD_ENFORCE_FROM=.*/DAKE_BUILD_ENFORCE_FROM=99.0.0/' .env
pm2 restart room-server --update-env
```

`client_build_blocked` = 被拦、`client_build_legacy` = 老版本放行、`client_build_present` = 验签通过、`client_build_web` = 网页端。

## 限制（必须知道）

1. **只锁语聊房 / 账号 / 更新**。音乐播放直连酷狗，不经过本服务器，改包照样能听歌。
2. 改包的人如果**同时改 UA 和应用名**，会退化成「未知版本」，仍能通过第 4 条。要彻底封死就把 `DAKE_BUILD_ENFORCE_FROM` 设为 `0.0.0`，代价是老版本用户全部断线——**不建议**。
3. 私钥泄露等于白做：立刻重新生成密钥对、更新服务器公钥、发新版本。

## 备份提醒

`.keys/build-ed25519.pem` 是**唯一私钥**，丢了就只能换密钥对（旧构建全部失效）。请复制到密码管理器或离线盘。
