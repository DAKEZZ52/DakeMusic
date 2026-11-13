/**
 * 远程功能开关
 * 文件：remoteFlags.ts
 *
 * 从 dkyy.top 拉取 /api/feature-flags，用于在服务端关闭某些客户端功能
 * （人声分离、扒谱）。拉取失败或离线时保持上一次已知状态，默认全部开启，
 * 不会因为网络问题误伤正常使用。
 */
import { net } from 'electron';
import logger from './logger';

export type RemoteFeatureKey = 'separator' | 'scoreflow';

interface FeatureFlag {
  enabled: boolean;
  message: string;
}

interface RemoteFlags {
  features: Record<RemoteFeatureKey, FeatureFlag>;
  fetchedAt: number;
}

const FLAGS_URL = 'https://dkyy.top/api/feature-flags';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const DEFAULT_FEATURES: Record<RemoteFeatureKey, FeatureFlag> = {
  separator: { enabled: true, message: '' },
  scoreflow: { enabled: true, message: '' },
};

let cache: RemoteFlags = { features: { ...DEFAULT_FEATURES }, fetchedAt: 0 };
let timer: NodeJS.Timeout | null = null;

export function getRemoteFlags(): RemoteFlags {
  return cache;
}

export function isFeatureEnabled(key: RemoteFeatureKey): boolean {
  return cache.features[key]?.enabled !== false;
}

export function getFeatureMessage(key: RemoteFeatureKey): string {
  return cache.features[key]?.message || '';
}

/**
 * 功能被服务端关闭时抛出带提示的错误。
 * IPC handler 抛出后，渲染层会收到 reject 并把 message 显示出来。
 */
export function assertFeatureEnabled(key: RemoteFeatureKey): void {
  if (isFeatureEnabled(key)) return;
  const fallback = key === 'separator' ? '人声分离暂时不可用' : '扒谱暂时不可用';
  throw new Error(getFeatureMessage(key) || fallback);
}

async function fetchFlags(): Promise<void> {
  try {
    const response = await net.fetch(FLAGS_URL, {
      headers: { 'User-Agent': 'LyriseMusic-Updater' },
    });
    if (!response.ok) {
      logger.warn('[RemoteFlags] non-ok response', response.status);
      return;
    }
    const data = (await response.json()) as {
      features?: Record<string, { enabled?: unknown; message?: unknown }>;
    };
    const features = { ...DEFAULT_FEATURES };
    for (const key of Object.keys(features) as RemoteFeatureKey[]) {
      const raw = data?.features?.[key];
      if (raw && typeof raw.enabled === 'boolean') {
        features[key] = {
          enabled: raw.enabled,
          message: typeof raw.message === 'string' ? raw.message : '',
        };
      }
    }
    cache = { features, fetchedAt: Date.now() };
    logger.info('[RemoteFlags] updated', {
      separator: features.separator.enabled,
      scoreflow: features.scoreflow.enabled,
    });
  } catch (error) {
    logger.warn('[RemoteFlags] fetch failed', error);
  }
}

export function startRemoteFlags(): void {
  void fetchFlags();
  if (timer) clearInterval(timer);
  timer = setInterval(() => void fetchFlags(), REFRESH_INTERVAL_MS);
  // 不阻止应用退出
  (timer as unknown as { unref?: () => void }).unref?.();
}

export function stopRemoteFlags(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
