/**
 * 客户端构建标识（带 Ed25519 签名）
 *
 * 打包时由 vite 注入 __DAKE_BUILD_TAG__：
 *   v=2.4.8;b=20261106T0031;ch=release;sig=<base64url>
 *
 * 服务端用公钥验签：
 *   - 签名有效 → 官方构建，放行
 *   - 版本低于强制线（默认 2.4.8）→ 老版本放行（它们本来没这个头）
 *   - 其余 → 403，判定为非官方构建
 *
 * 开发环境没有注入，回退 dev 标识，服务端会拒绝——开发构建本就不该连生产。
 */

declare const __DAKE_BUILD_TAG__: string | undefined;

/** 请求头名字，客户端与服务端共用 */
export const CLIENT_BUILD_HEADER = 'X-Dake-Build';

/** 形如 `v=2.4.8;b=...;ch=release;sig=...`，放在 X-Dake-Build 头里 */
export const CLIENT_BUILD_TAG =
  typeof __DAKE_BUILD_TAG__ === 'string' && __DAKE_BUILD_TAG__
    ? __DAKE_BUILD_TAG__
    : 'v=dev;b=dev;ch=dev';

export const getClientBuildTag = (): string => CLIENT_BUILD_TAG;

/** 服务端返回 NON_OFFICIAL_BUILD 时给用户看的提示 */
export const NON_OFFICIAL_BUILD_MESSAGE =
  '当前版本不是官方发布版本，在线功能已停用。请到 dkyy.top 下载官方安装包。';
