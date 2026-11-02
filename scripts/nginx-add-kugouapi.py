#!/usr/bin/env python3
# DakeMusic nginx 增加 /kugouapi/ 反代（旧 /kugou 作废，新入口指向 3101）
# 作者：知之（DAKE知之）  版权：© 2026 DakeMusic
import re, sys, shutil

p = '/etc/nginx/sites-enabled/dkyy.top'
s = open(p, encoding='utf-8').read()

block = """
    location /kugouapi/ {
        rewrite ^/kugouapi/(.*) /$1 break;
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60;
        proxy_send_timeout 60;
    }
"""

count = s.count('location /kugou/ {')
if count == 0:
    print('NO_MATCH', file=sys.stderr)
    sys.exit(1)

if 'location /kugouapi/ {' in s:
    print('ALREADY_PRESENT')
    sys.exit(0)

# 在每一处 location /kugou/ { ... } 块之后插入新块
out = re.sub(
    r'location /kugou/ \{\n(?:.*?\n)*?\}',
    lambda m: m.group(0) + block,
    s,
    count=count,
)

if out == s:
    print('NO_CHANGE', file=sys.stderr)
    sys.exit(1)

shutil.copy2(p, p + '.bak-kugouapi')
open(p, 'w', encoding='utf-8').write(out)
print('INSERTED', count)
