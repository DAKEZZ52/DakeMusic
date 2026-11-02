#!/usr/bin/env bash
# DakeMusic 酷狗标准 API server（本地直连版）部署脚本
# 作者：知之（DAKE知之）  版权：© 2026 DakeMusic
# 用途：部署到 /srv/kugouapi2，端口 3101（新入口 /kugouapi/，旧 /kugou 作废）
set -e

sudo -n mkdir -p /srv/kugouapi2 && sudo -n chown ubuntu:ubuntu /srv/kugouapi2
tar -xzf /tmp/kugouapi2.tar.gz -C /srv/kugouapi2

# 写入 .env（客户端 register 带指纹时会覆盖这些默认值，此处为兜底）
cat > /srv/kugouapi2/.env <<'EOF'
PORT=3101
HOST=0.0.0.0
KUGOU_API_GUID=__GUID__
KUGOU_API_DEV=DakeMusic
KUGOU_API_MAC=02:00:00:00:00:00
KUGOU_API_WEBGL=__WEBGL__
EOF

cd /srv/kugouapi2
npm install --omit=dev --no-audit --no-fund > /tmp/kugouapi2-npm.log 2>&1 || { echo "NPM_INSTALL_FAIL"; tail -20 /tmp/kugouapi2-npm.log; exit 1; }

pm2 start app.js --name kugou-api2 > /tmp/kugouapi2-pm2.log 2>&1 || { echo "PM2_START_FAIL"; tail -20 /tmp/kugouapi2-pm2.log; exit 1; }
sleep 2
pm2 list | grep kugou-api2

# 本地探活
curl -s -m 10 "http://127.0.0.1:3101/login/qr/key" | head -c 160
echo
echo DEPLOY_OK
