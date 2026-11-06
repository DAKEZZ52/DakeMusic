/**
 * 给更新清单签名：release/latest.yml → latest.yml.sig
 *
 * 用法（在打包机上，发布前执行）：
 *   pnpm release:sign
 *
 * 私钥默认读 .keys/build-ed25519.pem，可用 DAKE_BUILD_KEY_PATH 覆盖。
 * 生成的 .sig 与清单一起上传到 dkyy.top/dl/，客户端安装前会验签。
 */
import { createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDir = join(root, 'release');
const keyPath = process.env.DAKE_BUILD_KEY_PATH || join(root, '.keys', 'build-ed25519.pem');

const candidates = ['latest.yml', 'beta.yml'];

if (!existsSync(keyPath)) {
  console.error(`找不到签名私钥：${keyPath}`);
  console.error('私钥只在打包机上，别把它拷进仓库或 CI。');
  process.exit(1);
}

const privateKey = createPrivateKey(readFileSync(keyPath));
let signed = 0;

for (const name of candidates) {
  const manifestPath = join(releaseDir, name);
  if (!existsSync(manifestPath)) continue;
  const bytes = readFileSync(manifestPath);
  const signature = sign(null, bytes, privateKey).toString('base64url');
  writeFileSync(`${manifestPath}.sig`, signature, 'utf8');
  console.log(`已签名 ${name} → ${name}.sig`);
  signed += 1;
}

if (!signed) {
  console.error('release 目录下没有 latest.yml / beta.yml，先打包再签名。');
  process.exit(1);
}
