#!/usr/bin/env bash
# DakeMusic 聊天房部署审查脚本
# 用法：把本文件放到仓库根目录，双击或在 PowerShell 里跑
#   Windows:  cd C:\Users\Dake\Desktop\DakeMusic
#             bash 审查.sh        （需 Git for Windows 自带 bash）
#   Linux:    bash 审查.sh
set -euo pipefail

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'
OUT="聊天房部署审查报告.txt"
> "$OUT"

section() { printf "\n${B}===== %s =====${N}\n" "$1" | tee -a "$OUT"; }
ok()     { printf "${G}[OK]${N}   %s\n" "$1" | tee -a "$OUT"; }
warn()   { printf "${Y}[!!]${N}   %s\n" "$1" | tee -a "$OUT"; }
crit()   { printf "${R}[P0]${N}   %s\n" "$1" | tee -a "$OUT"; }
info()   { printf "      %s\n" "$1" | tee -a "$OUT"; }

section "1. 进程边界：聊天房代码落在哪"
echo "--- 搜索 isOwner / password / kick / mute / roomPassword ---" >> "$OUT"
FD=0
for f in $(find src -type f \( -name "*.ts" -o -name "*.vue" -o -name "*.js" \) 2>/dev/null); do
  if grep -qE 'isOwner|isAdmin|roomPassword|kick|mute|ban|transfer' "$f" 2>/dev/null; then
    n=$(grep -cE 'isOwner|isAdmin|roomPassword|kick|mute|ban|transfer' "$f")
    info "$f  ($n 处)"
    FD=$((FD + n))
  fi
done
if [ "$FD" -gt 0 ]; then
  warn "共 $FD 处权限/密码相关代码。若主要在 src/renderer，即为 P0"
else
  ok "未发现明文权限字段"
fi

section "2. 凭据是否进了 git"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner 2>/dev/null && ok "gitleaks 未报泄漏" || crit "gitleaks 发现凭据泄漏"
else
  warn "未装 gitleaks，改用字符串扫描（会误报，需人工确认）"
  for pat in 'sk_live_' 'LIVEKIT_API_SECRET' 'lk_' '-----BEGIN' 'password\s*[:=]\s*"[^"]{6,}'; do
    hit=$(grep -rE "$pat" --include="*.ts" --include="*.js" --include="*.vue" --include="*.yml" --include="*.yaml" --include="*.env" -l 2>/dev/null | grep -v node_modules | grep -v '\.git/' | grep -v '\.env$' || true)
    [ -n "$hit" ] && crit "命中 $pat : $hit" || ok "无 $pat 明文"
  done
fi
[ -f .env ] && crit ".env 存在于仓库根目录（应进 .gitignore）"
grep -q '\.env' .gitignore 2>/dev/null && ok ".gitignore 已含 .env" || crit ".gitignore 未忽略 .env"

section "3. 版本口径"
if [ -f package.json ]; then
  V=$(grep -E '"version"' package.json | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  N=$(grep -E '"name"' package.json | head -1 | grep -oE '"name": *"[^"]+"')
  info "package.json : $N / v$V"
fi
for t in $(git tag 2>/dev/null | head -20); do info "tag: $t"; done
LATEST=$(git describe --tags --abbrev=0 2>/dev/null || echo "无 tag")
[ "$V" = "${LATEST#v}" ] && ok "tag 与 package.json 一致 ($LATEST)" || warn "不一致：package.json=v$V  latest tag=$LATEST"

section "4. 锁文件卫生"
for l in package-lock.json yarn.lock bun.lockb; do
  [ -f "$l" ] && crit "存在 $l（应只留 pnpm-lock.yaml）"
done
[ -f pnpm-lock.yaml ] && ok "pnpm-lock.yaml 存在" || crit "缺 pnpm-lock.yaml"

section "5. ESLint 双配置"
[ -f .eslintrc.json ] && [ -f eslint.config.js ] && crit "两者并存：ESLint 9 仍会读 .eslintrc.json，规则叠加" || ok "仅一个 ESLint 配置"

section "6. server/ 是否真实存在且被构建"
[ -d server ] || crit "server/ 目录不存在 → 无房间服务 → 权限必在渲染进程"
[ -f server/package.json ] && info "server/package.json 存在" || warn "server/ 无独立 package.json"
grep -qE 'server' package.json 2>/dev/null && ok "根 package.json 含 server 脚本" || warn "根 package.json 未见 server 脚本"

section "7. 依赖许可证（GPL-3.0 传染性核查）"
if command -v pnpm >/dev/null 2>&1; then
  pnpm licenses list 2>/dev/null | grep -iE 'GPL|AGPL|SSPL' | head -20 >> "$OUT" && warn "上方许可证需法务确认（详见 THIRD_PARTY_NOTICES.md）" || ok "未见强 Copyleft 依赖"
else
  warn "未装 pnpm，跳过许可证扫描"
fi

section "8. 测试基线"
n=0
for p in '**/*.test.ts' '**/*.spec.ts' 'tests/**'; do
  c=$(find . -path './node_modules' -prune -o -path './.git' -prune -o -path "$p" -print 2>/dev/null | wc -l)
  n=$((n + c))
done
[ "$n" -gt 0 ] && warn "测试文件数: $n（需确认是否覆盖权限矩阵）" || crit "零测试"

section "9. CI 是否真实存在"
[ -d .github/workflows ] && ok "$(ls .github/workflows | wc -l) 个 workflow" || crit "无 CI"
grep -qE 'electron-builder|electron-updater|notar' .github/workflows/*.yml 2>/dev/null && ok "含构建/签名/公证步骤" || warn "CI 未见签名与公证"

section "10. IPC 通道是否白名单化"
if grep -rqE 'ipcRenderer\.invoke\(["'"'"'][^"'"'"']*room|ipcRenderer\.on\(' src 2>/dev/null; then
  warn "渲染进程存在 ipcRenderer 调用，需确认是否走 preload 白名单"
  grep -rE 'ipcRenderer\.(invoke|on)\(' src --include="*.ts" --include="*.vue" -n 2>/dev/null | head -10 >> "$OUT"
else
  ok "渲染进程未直接调用 ipcRenderer"
fi

section "11. 生产构建产物是否含调试入口"
grep -qE 'devTools|openDevTools' src 2>/dev/null && warn "含 openDevTools 调用，生产包应移除"
grep -qE 'VITE_.*(KEY|SECRET|TOKEN)' src 2>/dev/null && crit "Vite 环境变量可能泄漏密钥"

section "12. 容量与带宽自查（对照 4核/4GB/500GB）"
info "单人语音房 Opus 40kbps：20人下行 ≈ 15.2 Mbps，2小时 ≈ 14.4 GB"
info "500 GB / 14.4 ≈ 34 场/月；若开视频(1.5Mbps/路) ≈ 1场 27 GB"
[ -f deploy/docker-compose.yml ] && grep -q 'video.*false' deploy/docker-compose.yml 2>/dev/null && ok "已禁视频" || warn "未确认是否已禁视频/屏幕共享"

section "13. 域名与 TLS"
grep -qE 'https://' src 2>/dev/null && info "代码中出现 https 地址（请确认是否为生产域名）"
grep -rqE 'ws://[^s]|wss://[^/]*:7880' src 2>/dev/null && warn "信令地址可能硬编码，应走配置"

printf "\n${B}报告已写入 ${OUT}${N}\n"
