#!/usr/bin/env node
/**
 * 代码签名自检
 *
 * 作用：在打包前快速回答「这次构建会不会签上 Authenticode」，
 * 避免构建日志里出现 `signing with signtool.exe` 却被误读成「已经签好了」。
 *
 * 说明：electron-builder 26 的 `signAndEditExecutable` 在**没有证书**时只做资源编辑，
 * 仍然会打印 "signing with signtool.exe"，但产物 `Get-AuthenticodeSignature` 是 NotSigned。
 *
 * 退出码始终为 0（只提示，不阻断构建）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const c = {
  gray: (s) => `\u001b[90m${s}\u001b[0m`,
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  yellow: (s) => `\u001b[33m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

console.log(c.bold('\n代码签名自检'));

const env = process.env;
const envCert = env.WIN_CSC_LINK || env.CSC_LINK;
const envPassword = env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD;
const win = pkg.build?.win ?? {};
const fileCert = win.certificateFile;
const subjectName = win.certificateSubjectName;
const azure = win.azureSignOptions;

const rows = [];
rows.push([
  '环境变量证书 (CSC_LINK)',
  envCert ? c.green('已配置 ' + (envCert.length > 40 ? '（内容/路径已隐藏）' : envCert)) : c.gray('未配置'),
]);
rows.push(['证书文件 (win.certificateFile)', fileCert ? (fs.existsSync(fileCert) ? c.green(fileCert) : c.red('配置了但文件不存在: ' + fileCert)) : c.gray('未配置')]);
rows.push(['证书主题 (certificateSubjectName)', subjectName ? c.green(String(subjectName)) : c.gray('未配置')]);
rows.push(['Azure Trusted Signing', azure ? c.green('已配置') : c.gray('未配置')]);
rows.push(['时间戳服务器', win.rfc3161TimeStampServer ? c.green(win.rfc3161TimeStampServer) : c.yellow('未配置')]);
rows.push(['哈希算法', Array.isArray(win.signingHashAlgorithms) ? c.green(win.signingHashAlgorithms.join(', ')) : c.yellow('未配置')]);

// Windows 证书存储里是否有代码签名证书（1.3.6.1.5.5.7.3.3）
let storeCerts = [];
if (process.platform === 'win32') {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' } | ForEach-Object { $_.Subject + '|' + $_.NotAfter }",
      ],
      { encoding: 'utf8' },
    );
    storeCerts = out.split(/\r?\n/).filter(Boolean);
  } catch {
    storeCerts = [];
  }
}
rows.push([
  '本机证书存储（当前用户）',
  storeCerts.length ? c.green(`${storeCerts.length} 张代码签名证书`) : c.gray('没有代码签名证书'),
]);

const width = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`);

const willSign = Boolean(envCert || fileCert || subjectName || azure || storeCerts.length);
console.log('');
if (willSign) {
  console.log(c.green('  ✓ 本次构建会尝试 Authenticode 签名'));
  if (!envPassword && (envCert || fileCert)) {
    console.log(c.yellow('    提示：证书有密码时需要同时设置 CSC_KEY_PASSWORD / WIN_CSC_KEY_PASSWORD'));
  }
} else {
  console.log(c.yellow('  ! 本次构建不会签名（产物 Get-AuthenticodeSignature = NotSigned）'));
  console.log(c.gray('    Windows 会因此显示「未知发布者」；想让用户不再看到 SmartScreen 提示，需要：'));
  console.log(c.gray('      1) OV/EV 代码签名证书（约 ¥1000–3000/年，需实名/企业资料）'));
  console.log(c.gray('      2) Azure Trusted Signing（约 $9.99/月，需 Azure 账号 + 身份验证）'));
  console.log(c.gray('      3) 自签名证书（仅内部分发有效，公开分发仍会警告）'));
  console.log(c.gray('    拿到证书后设置环境变量即可：'));
  console.log(c.gray('      set CSC_LINK=D:\\path\\to\\cert.pfx'));
  console.log(c.gray('      set CSC_KEY_PASSWORD=你的证书密码'));
  console.log(c.gray('    或写进 package.json：build.win.certificateFile / certificateSubjectName'));
}
console.log('');
