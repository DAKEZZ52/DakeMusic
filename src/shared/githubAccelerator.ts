export const isGithubHostedUrl = (value: string): boolean => {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'github.com' ||
      hostname === 'raw.githubusercontent.com' ||
      hostname === 'codeload.github.com' ||
      hostname.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
};

/**
 * 加速地址只允许「https + 纯域名」，不接受协议降级、路径、查询串或凭据。
 * 例：https://ghproxy.net ✅ / http://evil.com ❌ / https://evil.com/a ❌
 */
export const normalizeGithubAcceleratorUrl = (value?: string): string => {
  const raw = String(value ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (url.pathname !== '/' && url.pathname !== '') return '';
    if (url.search || url.hash) return '';
    return `https://${url.host}`;
  } catch {
    return '';
  }
};

/** 只在目标确实是 GitHub 域名时才拼接加速前缀 */
export const applyGithubAcceleratorUrl = (url: string, acceleratorUrl?: string): string => {
  const target = String(url ?? '').trim();
  if (!target || !/^https:\/\//i.test(target) || !isGithubHostedUrl(target)) return target;
  const accelerator = normalizeGithubAcceleratorUrl(acceleratorUrl);
  if (!accelerator) return target;
  return `${accelerator}/${target}`;
};

interface GithubAcceleratorFallbackOptions<T> {
  acceleratorEnabled: boolean;
  accelerated: () => Promise<T>;
  github: () => Promise<T>;
  onAcceleratorFailure?: (error: unknown) => void;
  shouldFallback?: (error: unknown) => boolean;
}

export const runGithubAcceleratorFallback = async <T>({
  acceleratorEnabled,
  accelerated,
  github,
  onAcceleratorFailure,
  shouldFallback = () => true,
}: GithubAcceleratorFallbackOptions<T>): Promise<T> => {
  if (!acceleratorEnabled) return github();
  try {
    return await accelerated();
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    onAcceleratorFailure?.(error);
    return github();
  }
};
