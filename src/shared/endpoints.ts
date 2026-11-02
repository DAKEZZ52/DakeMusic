/**
 * DakeMusic 官方服务端点。
 *
 * 域名统一在这里维护：主进程（如自动更新源）与渲染进程（房间后端、LiveKit）
 * 都从这里取值，换域名时只需改一处，避免多份硬编码不同步。
 */
export const DAKE_SERVICE_HOST = 'dkyy.top';

/** 房间/业务后端（HTTP） */
export const DAKE_API_BASE_URL = `https://${DAKE_SERVICE_HOST}`;

/** 客户端更新包下载目录（腾讯云，国内直连） */
export const DAKE_DOWNLOAD_BASE_URL = `https://${DAKE_SERVICE_HOST}/dl/`;

/** LiveKit 实时音视频服务（经 nginx 443 的 /livekit 反代） */
export const DAKE_LIVEKIT_URL = `wss://${DAKE_SERVICE_HOST}/livekit`;
