/**
 * 内容安全策略（构建时注入 meta，主进程对 http(s) 响应再补一次头）
 *
 * 里层说明：
 * - 'unsafe-inline' 是为了 index.html 里那段负责首帧主题的内联脚本；
 *   它不引入新的外部来源，外部脚本仍被限制在 self 与腾讯验证码域内。
 * - file: 是必须的：打包后页面通过 file:// 加载，Chromium 对 file:// 的
 *   'self' 判定不可靠，显式列出来避免本地脚本被误杀。
 * - connect-src 允许 https/wss 是音乐接口与 LiveKit 需要；本机回环留给内置服务。
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self' file:",
  "script-src 'self' 'unsafe-inline' file: https://turing.captcha.qcloud.com",
  "style-src 'self' 'unsafe-inline' file:",
  "img-src 'self' file: data: blob: https:",
  "media-src 'self' file: data: blob: https:",
  "font-src 'self' file: data:",
  "connect-src 'self' file: https: wss: http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*",
  'frame-src https://turing.captcha.qcloud.com',
  "worker-src 'self' file: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');
