#!/bin/bash
# ============================================================
# DakeMusic 语聊房 - 一键清空用户与房间数据
# 作者：知之Dake
# 文件：room-server/clear-data.sh
# 描述：备份 users.db / rooms.json 后删除，重启后自动重建空库
# 用法：bash clear-data.sh
# ============================================================
set -e

cd "$(dirname "$0")"

echo "==> 当前目录：$(pwd)"

# 1. 备份
STAMP=$(date +%Y%m%d_%H%M%S)
[ -f users.db ]    && cp users.db    "users.db.bak.$STAMP"
[ -f rooms.json ]  && cp rooms.json  "rooms.json.bak.$STAMP"
echo "==> 已备份到 *.bak.$STAMP"

# 2. 删除数据文件（启动时自动重建）
rm -f users.db users.db-shm users.db-wal rooms.json
echo "==> 已删除 users.db / rooms.json"

# 3. 提示重启
echo ""
echo "==> 数据已清空。请重启 room-server 生效："
echo "    pm2 restart <你的服务名>      # 如果用 pm2"
echo "    或重新执行：node index.js"
echo ""
echo "==> 回滚：cp users.db.bak.$STAMP users.db && cp rooms.json.bak.$STAMP rooms.json"
