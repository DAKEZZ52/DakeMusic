#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
refresh-site.py — DakeMusic 官网静态版本刷新脚本
===================================================
用途：把最新安装包版本静态写进首页与下载页，页面不再依赖 JS 才有正确版本。

用法（上传新 exe 到服务器 dl 目录后执行）：
    python scripts/refresh-site.py            # 仅本地刷新 scripts/*.html
    python scripts/refresh-site.py --upload   # 刷新并 scp 上传到腾讯云 + 验证

原理：
    1. 读取 https://dkyy.top/dl-files/ （nginx autoindex json）
    2. 解析出最新 .exe 的版本号 / 大小 / 日期
    3. 把版本字段直接写死在 scripts/home-index.html 与 scripts/dl-index.html
    4. 页内保留原有 JS 作为兜底（版本一致时无感知）

作者：知之 Dake | QQ: 983064062
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME_HTML = os.path.join(BASE, 'scripts', 'home-index.html')
DL_HTML = os.path.join(BASE, 'scripts', 'dl-index.html')
DL_FILES_URL = 'https://dkyy.top/dl-files/'

SSH_KEY = os.path.join(os.path.expanduser('~'), '.ssh', 'dakemusic_webroom')
SSH_HOST = 'ubuntu@106.52.9.146'
REMOTE_HOME = '/var/www/html/index.html'
REMOTE_DL = '/var/www/dkyy/dl/index.html'

# 各版本一句话简介（与下载页 JS 中的 DESC 保持一致）
DESC = {
    '2.4.6': 'UI布局轻量改动 / 迷你播放器「唱歌模式」',
}

# 下载页历史卡片只展示该版本及之后（更早的安装包仍留在服务器，只是不再列在页面上）
HISTORY_FROM = '2.4.6'

# 各版本完整更新日志（用于首页 changelog；未配置的版本保留原条目并提示）
CHANGELOG = {
    '2.4.6': [
        'UI布局轻量改动，播放控制优化',
        '迷你播放器升级为「唱歌模式」：支持原声/伴奏一键切换、升降调调节，支持键盘快捷键（空格播放暂停、←→切歌、↑↓升降调）',
        '各位反馈的BUG基本修复',
    ],
}


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'DakeMusic-refresh/1.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def parse_ver(name):
    m = re.search(r'(\d+)\.(\d+)\.(\d+)(?:-(beta))?', name)
    if not m:
        return None
    return {'major': int(m[1]), 'minor': int(m[2]), 'patch': int(m[3]),
            'beta': bool(m[4]), 'full': m[0]}


def cmp_ver(a, b):
    for k in ('major', 'minor', 'patch'):
        if a[k] != b[k]:
            return b[k] - a[k]
    if a['beta'] != b['beta']:
        return 1 if a['beta'] else -1  # 正式版优先
    return 0


def fmt_size(bytes_):
    mb = bytes_ / 1024 / 1024
    return (str(int(round(mb))) if mb >= 100 else str(round(mb * 10) / 10)) + ' MB'


def fmt_date(mtime):
    from email.utils import parsedate_to_datetime
    d = parsedate_to_datetime(mtime)
    return d.astimezone(timezone.utc).strftime('%Y-%m-%d')


def latest_exe():
    data = fetch_json(DL_FILES_URL)
    exes = []
    for f in data:
        if not f.get('type') == 'file':
            continue
        name = f.get('name', '')
        if not name.endswith('.exe') or name.endswith('.blockmap'):
            continue
        v = parse_ver(name)
        if not v:
            continue
        exes.append({'name': name, 'size': f.get('size', 0),
                     'date': fmt_date(f.get('mtime', '')), 'ver': v})
    if not exes:
        raise RuntimeError('dl 目录未发现任何 exe')
    exes.sort(key=lambda x: (x['ver']['major'], x['ver']['minor'], x['ver']['patch'],
                             -x['ver']['beta']), reverse=True)
    # DakeMusic: 历史卡片只保留 HISTORY_FROM 及之后的版本
    floor = parse_ver(HISTORY_FROM)
    history = [e for e in exes[1:] if floor is None or cmp_ver(e['ver'], floor) <= 0]
    return exes[0], history


def inject_home(path, latest):
    html = open(path, encoding='utf-8').read()
    ver, name, size, date = latest['ver']['full'], latest['name'], latest['size'], latest['date']
    size_s = fmt_size(size)

    # 徽标
    html, n1 = re.subn(r'(id="hero-badge">)v[\d.]+(?:\s*)(已发布)',
                       lambda m: m.group(1) + 'v' + ver + ' ' + m.group(2), html)
    # 所有下载链接（hero / 导航 / 下载卡）
    html, n2 = re.subn(r'href="/dl/DakeMusic-[\d.]+(?:-beta)?\.exe"',
                       lambda m: 'href="/dl/' + name + '"', html)
    # 版本号
    html, n3 = re.subn(r'(id="dl-ver">)DakeMusic [\d.]+(?:\s*</div>)',
                       lambda m: m.group(1) + 'DakeMusic ' + ver + '</div>', html)
    # 元信息（系统 · 大小 · 日期）
    html, n4 = re.subn(r'(id="dl-meta">Windows x64 · )约 [\d.]+ MB( · [\d-]+)',
                       lambda m: m.group(1) + '约 ' + size_s + ' · ' + date, html)

    # JSON-LD 结构化数据（softwareVersion / downloadUrl / installUrl 随最新版联动）
    html, n7 = re.subn(r'"softwareVersion": "[\d.]+(?:-beta)?"',
                       lambda m: '"softwareVersion": "' + ver + '"', html)
    html, n8 = re.subn(r'"downloadUrl": "https://dkyy\.top/dl/DakeMusic-[\d.]+(?:-beta)?\.exe"',
                       lambda m: '"downloadUrl": "https://dkyy.top/dl/' + name + '"', html)
    html, n9 = re.subn(r'"installUrl": "https://dkyy\.top/dl/DakeMusic-[\d.]+(?:-beta)?\.exe"',
                       lambda m: '"installUrl": "https://dkyy.top/dl/' + name + '"', html)

    # 更新日志（限定在 .changelog 容器内，避免误匹配页脚链接列表）
    items = CHANGELOG.get(latest['ver']['full'])
    if items is not None:
        html, n5 = re.subn(r'<h4>v[\d.]+ 更新</h4>', '<h4>v' + ver + ' 更新</h4>', html)
        lis = '\n'.join('            <li>' + i + '</li>' for i in items)
        html, n6 = re.subn(r'(<div class="changelog">\s*<h4>v[\d.]+ 更新</h4>\s*<ul>).*?(</ul>\s*</div>)',
                           lambda m: m.group(1) + '\n' + lis + '\n          ' + m.group(2), html, flags=re.S)
    else:
        n5 = n6 = 0
        print('[提示] CHANGELOG 未配置 v%s 的更新日志，首页保留现有条目，请补充到 refresh-site.py' % ver)

    open(path, 'w', encoding='utf-8').write(html)
    return {'hero_badge': n1, 'dl_links': n2, 'dl_ver': n3, 'dl_meta': n4,
            'jsonld_ver': n7, 'jsonld_dl': n8, 'jsonld_install': n9,
            'chg_title': n5, 'chg_list': n6}


def inject_dl(path, latest, history):
    html = open(path, encoding='utf-8').read()
    ver, name, size_s, date = latest['ver']['full'], latest['name'], fmt_size(latest['size']), latest['date']
    beta_tag = ' <span class="tag beta">测试版</span>' if latest['ver']['beta'] else ''

    # 徽标（静态初始值，JS 兜底保持一致）
    html, n1 = re.subn(r'(id="badge">)[^<]*(<)',
                       lambda m: m.group(1) + 'v' + ver + ' 已发布' + m.group(2), html)

    # 最新版静态卡（替换 loading 占位）
    desc = ' · ' + DESC.get(ver, '') if DESC.get(ver) else ''
    latest_card = (
        '<div class="latest">'
        '<div class="latest-info">'
        '<span class="latest-label"><span class="latest-dot"></span>最新版本</span>'
        '<div class="latest-name">DakeMusic ' + ver + '</div>'
        '<div class="latest-meta">Windows x64 · 约 ' + size_s + ' · ' + date + desc + '</div>'
        '</div>'
        '<a class="btn" href="' + name + '">'
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12m0 0l-5-5m5 5l5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'
        ' 下载</a>'
        '</div>'
    )
    html, n2 = replace_element(html, 'latest', latest_card)

    # 历史版本静态列表（替换 loading 占位）
    icon = ('<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V6l10-2v12" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="#fff"/><circle cx="16.5" cy="16" r="2.5" fill="#fff"/></svg>')
    down = ('<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12m0 0l-5-5m5 5l5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>')
    cards = []
    for f in history:
        v = f['ver']['full']
        tag = ' <span class="tag beta">测试版</span>' if f['ver']['beta'] else ''
        d = ' · ' + DESC.get(v, '') if DESC.get(v) else ''
        cards.append(
            '<div class="ver-card">'
            '<div class="ver-icon">' + icon + '</div>'
            '<div class="ver-info">'
            '<div class="ver-name">DakeMusic ' + v + tag + '</div>'
            '<div class="ver-meta">Windows x64 · 约 ' + fmt_size(f['size']) + ' · ' + f['date'] + d + '</div>'
            '</div>'
            '<a class="ver-btn" href="' + f['name'] + '">' + down + ' 下载</a>'
            '</div>'
        )
    history_html = '\n'.join(cards) if cards else '<div class="loading">暂无历史版本</div>'
    html, n3 = replace_element(html, 'history', history_html)

    open(path, 'w', encoding='utf-8').write(html)
    return {'badge': n1, 'latest_card': n2, 'history': n3}


def replace_element(html, element_id, new_inner):
    """幂等替换：定位 <div id=...> 到其平衡闭合 </div>，整体替换为干净单份内容。

    多次运行不会叠加嵌套（原 re.subn 非贪婪匹配会反复包裹导致页面重复）。
    """
    m = re.search(r'<div id="%s">' % element_id, html)
    if not m:
        return html, 0
    start = m.start()
    i = m.end()
    depth = 1
    j = i
    while j < len(html) and depth:
        if html.startswith('<div', j):
            depth += 1
            j += 4
        elif html.startswith('</div>', j):
            depth -= 1
            j += 6
        else:
            j += 1
    return html[:start] + '<div id="%s">%s</div>' % (element_id, new_inner) + html[j:], 1


def scp(local, remote):
    subprocess.run(['scp', '-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', local, remote],
                   check=True)


def main():
    upload = '--upload' in sys.argv
    print('==> 读取 %s' % DL_FILES_URL)
    latest, history = latest_exe()
    print('    最新：DakeMusic %s · %s · %s' % (latest['ver']['full'], fmt_size(latest['size']), latest['date']))
    print('    历史：%s' % ', '.join(f['ver']['full'] for f in history) if history else '无')

    print('==> 刷新首页')
    r1 = inject_home(HOME_HTML, latest)
    print('    %s' % r1)

    print('==> 刷新下载页')
    r2 = inject_dl(DL_HTML, latest, history)
    print('    %s' % r2)

    if not upload:
        print('完成。本地已刷新；加 --upload 上传到服务器。')
        return

    print('==> 上传到服务器')
    scp(HOME_HTML, SSH_HOST + ':' + REMOTE_HOME)
    scp(DL_HTML, SSH_HOST + ':' + REMOTE_DL)
    print('    已上传：%s' % REMOTE_HOME)
    print('    已上传：%s' % REMOTE_DL)

    print('==> 线上验证')
    for url, label in (('https://dkyy.top/', '首页'), ('https://dkyy.top/dl/', '下载页')):
        out = subprocess.run(['curl', '-s', url], capture_output=True, text=True).stdout
        ok = 'DakeMusic ' + latest['ver']['full'] in out
        print('    %s v%s -> %s' % (label, latest['ver']['full'], 'OK' if ok else '未命中'))

    print('完成。' if upload else '')


if __name__ == '__main__':
    main()
