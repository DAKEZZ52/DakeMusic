import { createPublicKey, verify } from 'node:crypto';
import log from './logger';
import { DAKE_DOWNLOAD_BASE_URL } from '../shared/endpoints';

/**
 * 更新包完整性校验（不依赖付费代码签名证书）
 *
 * 链路：发布时用打包私钥签 latest.yml → 客户端验签 → 用清单里的 sha512 校验安装包
 * （electron-updater 本身会用清单里的 sha512 校验下载的文件，所以只要清单可信，链路就成立）
 *
 * 兼容策略：
 * - 服务器上没有 latest.yml.sig（老版本发布）→ 记日志放行，不打断更新
 * - 签名存在但校验失败 / 版本不符 → 阻止安装
 */

/** 与构建签名共用同一对 Ed25519 密钥（公钥可公开） */
const UPDATE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1Emo1I0bJBD1Ib6gO5YXBzQEHp1baCMQslyPAg7wERc=
-----END PUBLIC KEY-----`;

const publicKey = createPublicKey(UPDATE_PUBLIC_KEY_PEM);

interface ManifestFileEntry {
  url?: string;
  sha512?: string;
  size?: number;
}

interface Manifest {
  version?: string;
  path?: string;
  sha512?: string;
  files?: ManifestFileEntry[];
}

export type UpdateIntegrityResult =
  | { ok: true; skipped?: 'unsigned' | 'no-manifest' }
  | { ok: false; reason: string };

const fetchText = async (url: string, timeoutMs = 8000): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const parseManifest = (raw: string): Manifest | null => {
  const manifest: Manifest = {};
  const files: ManifestFileEntry[] = [];
  let currentFile: ManifestFileEntry | null = null;
  let inFiles = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('files:')) {
      inFiles = true;
      continue;
    }
    if (trimmed.startsWith('- url:')) {
      currentFile = { url: trimmed.slice('- url:'.length).trim() };
      if (inFiles) files.push(currentFile);
      continue;
    }
    if (trimmed.startsWith('version:')) {
      manifest.version = trimmed.slice('version:'.length).trim();
      inFiles = false;
      continue;
    }
    if (trimmed.startsWith('path:')) {
      manifest.path = trimmed.slice('path:'.length).trim();
      inFiles = false;
      continue;
    }
    if (trimmed.startsWith('sha512:')) {
      const value = trimmed.slice('sha512:'.length).trim();
      if (inFiles && currentFile) currentFile.sha512 = value;
      else manifest.sha512 = value;
      continue;
    }
  }

  if (files.length) manifest.files = files;
  if (!manifest.version) return null;
  return manifest;
};

/**
 * @param expectedVersion 客户端当前准备安装的版本（来自 update-available）
 */
export const verifyUpdateIntegrity = async (
  expectedVersion?: string,
): Promise<UpdateIntegrityResult> => {
  const base = DAKE_DOWNLOAD_BASE_URL.endsWith('/')
    ? DAKE_DOWNLOAD_BASE_URL
    : `${DAKE_DOWNLOAD_BASE_URL}/`;
  const manifestUrl = `${base}latest.yml`;
  const signatureUrl = `${base}latest.yml.sig`;

  const manifestText = await fetchText(manifestUrl);
  if (!manifestText) {
    log.warn('[Updater] 无法读取更新清单，跳过签名校验');
    return { ok: true, skipped: 'no-manifest' };
  }

  const signatureText = await fetchText(signatureUrl);
  if (!signatureText) {
    // 老发布没有签名文件：放行，但记录一次，便于后续收紧
    log.warn('[Updater] 更新清单没有签名文件（latest.yml.sig），本次跳过校验');
    return { ok: true, skipped: 'unsigned' };
  }

  let verified = false;
  try {
    verified = verify(
      null,
      Buffer.from(manifestText, 'utf8'),
      publicKey,
      Buffer.from(signatureText.trim(), 'base64url'),
    );
  } catch (error) {
    log.error('[Updater] 更新清单签名校验异常', { error: (error as Error).message });
    return { ok: false, reason: 'signature-error' };
  }

  if (!verified) {
    log.error('[Updater] 更新清单签名无效，已阻止安装');
    return { ok: false, reason: 'signature-invalid' };
  }

  const manifest = parseManifest(manifestText);
  if (!manifest?.version) {
    return { ok: false, reason: 'manifest-malformed' };
  }

  if (expectedVersion && manifest.version !== expectedVersion) {
    log.error('[Updater] 清单版本与待安装版本不一致', {
      manifest: manifest.version,
      expected: expectedVersion,
    });
    return { ok: false, reason: 'version-mismatch' };
  }

  const fileHash = manifest.files?.[0]?.sha512 || manifest.sha512;
  if (!fileHash) {
    return { ok: false, reason: 'manifest-no-hash' };
  }

  log.info('[Updater] 更新清单签名校验通过', { version: manifest.version });
  return { ok: true };
};
