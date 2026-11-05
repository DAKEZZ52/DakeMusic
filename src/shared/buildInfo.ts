/**
 * 客户端构建标识
 *
 * 目的：让服务端能区分「官方发布构建」和「第三方重新打包的构建」。
 * 现阶段只用于日志观察（服务端记录缺失/存在，不拒绝请求）；
 * 观察期确认没有误伤之后，才可能对明显改包做拦截。
 *
 * 构建时由 vite define 注入 __DAKE_VERSION__ / __DAKE_BUILD__ / __DAKE_CHANNEL__；
 * 开发环境下没有注入，回退成 dev 标识。
 */

declare const __DAKE_VERSION__: string | undefined;
declare const __DAKE_BUILD__: string | undefined;
declare const __DAKE_CHANNEL__: string | undefined;

const version = typeof __DAKE_VERSION__ === 'string' && __DAKE_VERSION__ ? __DAKE_VERSION__ : 'dev';
const build = typeof __DAKE_BUILD__ === 'string' && __DAKE_BUILD__ ? __DAKE_BUILD__ : 'dev';
const channel = typeof __DAKE_CHANNEL__ === 'string' && __DAKE_CHANNEL__ ? __DAKE_CHANNEL__ : 'dev';

/** 形如 `v=2.4.7;b=20261106T1234;ch=release`，放在 X-Dake-Build 头里 */
export const CLIENT_BUILD_TAG = `v=${version};b=${build};ch=${channel}`;

/** 请求头名字，客户端与服务端共用 */
export const CLIENT_BUILD_HEADER = 'X-Dake-Build';

export const getClientBuildTag = (): string => CLIENT_BUILD_TAG;
