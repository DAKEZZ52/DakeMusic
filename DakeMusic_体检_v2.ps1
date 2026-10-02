# ===== DakeMusic 体检 v2（防乱码版）=====
# 修复：PowerShell 5 的 Where-Object 不支持 { $_.FullName -notmatch '\\(...)\\' } 中的 -notmatch 历史记录冲突
# 修复：全程 -Encoding UTF8，避免 GBK 乱码
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = (Get-Location).Path
$out  = Join-Path $root 'DakeMusic_体检报告.txt'
$sw   = [System.IO.StreamWriter]::new($out, $false, [System.Text.UTF8Encoding]::new($false))
$t0   = Get-Date

function L($m) { $sw.WriteLine("===== $m ====="); Write-Host ">> $m" }

function Scan($label, $path, $pattern) {
  L $label
  if (-not (Test-Path $path)) { $sw.WriteLine('[不存在] ' + $path); return }
  $hits = Get-Content -LiteralPath $path -Encoding UTF8 |
    Select-String -Pattern $pattern |
    ForEach-Object { $_.Line.Trim() -replace '\s+', ' ' }
  if ($hits) { $hits | ForEach-Object { $sw.WriteLine($_) } }
  else { $sw.WriteLine('[无命中]') }
}

L '0. 环境'
"PowerShell {0}" -f $PSVersionTable.PSVersion.ToString() | ForEach-Object { $sw.WriteLine($_); Write-Host $_ }
"代码页: $((chcp) -replace '.*: ','')" | ForEach-Object { $sw.WriteLine($_) }
"cwd: $root" | ForEach-Object { $sw.WriteLine($_) }
"TZ: $((Get-TimeZone).Id)" | ForEach-Object { $sw.WriteLine($_) }

L '1. 提交基线'
$log = git -C $root log --oneline --decorate -20 2>&1
$log | ForEach-Object { $sw.WriteLine($_) }
"HEAD: $(git -C $root rev-parse --short HEAD 2>&1)" | ForEach-Object { $sw.WriteLine($_) }
"branch: $(git -C $root branch --show-current 2>&1)" | ForEach-Object { $sw.WriteLine($_) }
"tags: $(git -C $root tag --sort=-creatordate 2>&1)" | ForEach-Object { $sw.WriteLine($_) }

L '2. 包名/版本/产品名（A1 关键）'
Scan '  package.json 身份字段' 'package.json' '"name"\s*:|"version"\s*:|"productName"\s*:|"identifier"\s*:|"author"\s*:|"homepage"\s*:|"description"\s*:'

L '3. 锁文件卫生（A0 关键）'
Get-ChildItem -LiteralPath $root -Filter *.lock -File | Select-Object Name, Length, LastWriteTime |
  ForEach-Object { '{0}  {1}  {2}' -f $_.Name, $_.Length, $_.LastWriteTime } |
  ForEach-Object { $sw.WriteLine($_) }
if (Test-Path (Join-Path $root 'package-lock.json')) { $sw.WriteLine('[!!] 存在 package-lock.json，与 pnpm workspace 冲突，须删除') }

L '4. 运行时选型'
Scan '  package.json 运行时依赖' 'package.json' 'electron|@electron|@tauri-apps|tauri'
@('src-tauri','electron','src/native','native','server','src/core','src/renderer') | ForEach-Object {
  '{0,-18} -> {1}' -f $_, (Test-Path (Join-Path $root $_)) | ForEach-Object { $sw.WriteLine($_) }
}

L '5. 一级目录结构'
Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -notin '.git','node_modules','dist','target','coverage' } |
  Sort-Object Mode, Name | ForEach-Object {
    $t = if ($_.PSIsContainer) { 'D' } else { 'F' }
    '{0} {1,-30} {2}' -f $t, $_.Name, $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
  } | ForEach-Object { $sw.WriteLine($_) }

L '6. 聊天房提交 cac7b94 改动范围（B 阶段施工图）'
$stat = git -C $root show --stat cac7b94 2>&1
$stat | ForEach-Object { $sw.WriteLine($_) }
$sw.WriteLine('---- diff name-status ----')
$diff = git -C $root diff --name-status 0e43a8c..cac7b94 2>&1
$diff | ForEach-Object { $sw.WriteLine($_) }

L '7. 架构入口'
'stores=' + (Test-Path (Join-Path $root 'src/stores')) | ForEach-Object { $sw.WriteLine($_) }
'router=' + (Test-Path (Join-Path $root 'src/router')) | ForEach-Object { $sw.WriteLine($_) }
'composables=' + (Test-Path (Join-Path $root 'src/composables')) | ForEach-Object { $sw.WriteLine($_) }
'core=' + (Test-Path (Join-Path $root 'src/core')) | ForEach-Object { $sw.WriteLine($_) }
'preload=' + ((Get-ChildItem -LiteralPath $root -Recurse -File -Filter preload*.ts -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' }).Count) | ForEach-Object { $sw.WriteLine($_) }

L '8. 音频实现层（C 阶段定位）'
$pat = 'AudioContext|AudioWorkletNode|AnalyserNode|OfflineAudioContext|WebAudioAPI|FFT|eqBand|equalizer|EQ|compressor|DynamicsCompressorNode|LUFS|loudness|YRC|\.lrc|lrcParser|MediaSession|SMTC|MPRIS|MPNowPlaying|setSinkId|exclusiveMode|audioOutput'
Get-ChildItem -LiteralPath $root -Recurse -File -Include *.ts,*.js,*.vue,*.rs,*.c,*.cpp |
  Where-Object { $_.FullName -notmatch '\\(node_modules|\.git|dist|target|coverage)\\' } |
  Select-String -Encoding UTF8 -Pattern $pat -List |
  ForEach-Object { '{0,-42} {1}' -f $_.Filename, $_.Path.Replace($root + '\', '') } |
  ForEach-Object { $sw.WriteLine($_) }

L '9. 房间鉴权关键词（B 阶段越权面定位）'
$pat2 = 'isOwner|isAdmin|isHost|roomPassword|kick|mute|ban|transferOwner|roomId|peerId|virtual|handle'
Get-ChildItem -LiteralPath $root -Recurse -File -Include *.ts,*.js,*.vue |
  Where-Object { $_.FullName -notmatch '\\(node_modules|\.git|dist|target|coverage)\\' } |
  Select-String -Encoding UTF8 -Pattern $pat2 |
  Group-Object Filename |
  Sort-Object Count -Descending |
  Select-Object -First 25 |
  ForEach-Object { '{0,-40} {1} 处' -f $_.Name, $_.Count } |
  ForEach-Object { $sw.WriteLine($_) }

L '10. ESLint 双配置（A3 关键）'
if ((Test-Path (Join-Path $root '.eslintrc.json')) -and (Test-Path (Join-Path $root 'eslint.config.js'))) {
  $sw.WriteLine('[!! 冲突] .eslintrc.json 与 eslint.config.js 并存 -> 删除 .eslintrc.json')
}
Scan '  eslint 相关依赖' 'package.json' 'eslint|@typescript-eslint|eslint-plugin'

L '11. TypeScript 分层（A4）'
Get-ChildItem -LiteralPath $root -Filter tsconfig*.json | Select-Object Name, Length |
  ForEach-Object { $sw.WriteLine('{0,-22} {1}' -f $_.Name, $_.Length) }
Scan '  tsconfig.json 结构' 'tsconfig.json' '"references"|"extends"|"include"|"exclude"|"compilerOptions"'

L '12. 名称散落扫描（A1 关键，防乱码核心项）'
Get-ChildItem -LiteralPath $root -Recurse -File |
  Where-Object {
    $_.FullName -notmatch '\\(node_modules|\.git|dist|target|coverage)\\' -and
    $_.Extension -notin '.lock','.png','.jpg','.jpeg','.ico','.ttf','.woff2','.mp3','.wav','.webp','.gif' -and
    $_.Name -ne 'THIRD_PARTY_NOTICES.md'
  } |
  Select-String -Encoding UTF8 -Pattern 'EchoMusic|DakeMusic|Echo\s*Music' |
  Group-Object Filename |
  Sort-Object Count -Descending |
  ForEach-Object { '{0,-40} {1} 处' -f $_.Name, $_.Count } |
  ForEach-Object { $sw.WriteLine($_) }

L '13. 凭据与硬编码端点（A9 关键）'
$pat3 = '\b(API_KEY|APIKEY|apikey|SECRET|PRIVATE_KEY|PRIVATEKEY|access_token|refresh_token|"authorization"|"cookie"|"token"\s*:|sign\s*=\s*[A-Za-z0-9]{32,}|nonce\s*=\s*"[A-Za-z0-9]{16,})'
Get-ChildItem -LiteralPath $root -Recurse -File |
  Where-Object {
    $_.FullName -notmatch '\\(node_modules|\.git|dist|target|coverage)\\' -and
    $_.Name -ne 'THIRD_PARTY_NOTICES.md' -and
    $_.Extension -notin '.png','.jpg','.ico','.ttf','.woff2','.mp3','.wav'
  } |
  Select-String -Encoding UTF8 -Pattern $pat3 |
  ForEach-Object { '{0}:{1}  ::  {2}' -f $_.Filename, $_.LineNumber, ($_.Line.Trim() -replace '\s+', ' ' -replace '"[^"]{16,}"', '"***"') } |
  Select-Object -First 50 |
  ForEach-Object { $sw.WriteLine($_) }

L '14. 测试基线（A7 关键）'
Scan '  package.json scripts 中的测试命令' 'package.json' '"test"|"vitest"|"playwright"|"jest"|"mocha"'
$testCount = (Get-ChildItem -LiteralPath $root -Recurse -File -Include *.test.ts,*.test.js,*.spec.ts,*.spec.js,*.e2e.ts |
  Where-Object { $_.FullName -notmatch '\\(node_modules|\.git|dist|target)\\' }).Count
'测试文件数: {0}' -f $testCount | ForEach-Object { $sw.WriteLine($_) }
'src 下 .ts/.vue 文件数: {0}' -f ((Get-ChildItem -LiteralPath $root -Path src -Recurse -File -Include *.ts,*.vue -ErrorAction SilentlyContinue).Count) | ForEach-Object { $sw.WriteLine($_) }

L '15. 构建与发布（A5/A6）'
@('.github\workflows','scripts','build','codesign*','.github\actions') | ForEach-Object {
  if (Test-Path (Join-Path $root $_)) {
    Get-ChildItem -LiteralPath (Join-Path $root $_) -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
      ForEach-Object { $_.FullName.Replace($root + '\', '') } |
      ForEach-Object { $sw.WriteLine($_) }
  }
}
Scan '  package.json 发布/签名/更新字段' 'package.json' '"build"|"publish"|"release"|"files"|"extraResources"|"updater"|"codeSign"|"notarize"'

L '16. 文档与合规（A8）'
@('LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','CODE_OF_CONDUCT.md') | ForEach-Object {
  $p = Join-Path $root $_
  if (Test-Path $p) { '{0,-26} 存在  ({1} 行)' -f $_, ((Get-Content -LiteralPath $p -Encoding UTF8).Count) }
  else { '{0,-26} [缺失]' -f $_ }
} | ForEach-Object { $sw.WriteLine($_) }
'.github 模板: PR={0}  Issue={1}' -f (Test-Path (Join-Path $root '.github\PULL_REQUEST_TEMPLATE.md')), (Test-Path (Join-Path $root '.github\ISSUE_TEMPLATE')) | ForEach-Object { $sw.WriteLine($_) }

L '17. 原生模块与依赖许可证（A8 关键）'
'native 目录: ' + (Test-Path (Join-Path $root 'native')) | ForEach-Object { $sw.WriteLine($_) }
if (Test-Path (Join-Path $root 'native\Cargo.toml')) {
  Scan '  native/Cargo.toml 依赖' (Join-Path $root 'native\Cargo.toml') '^\w|license'
}
Scan '  package.json 依赖清单（含许可证风险的音频/加解密类）' 'package.json' 'fft|webrtc|opus|vorbis|aes|crypto|electron-builder|electron-updater|better-sqlite|better_sqlite'

L '18. Git 配置与子模块'
"submodule: $(git -C $root submodule status 2>&1 | Select-Object -First 5)" | ForEach-Object { $sw.WriteLine($_) }
"hooks: $((Get-ChildItem -LiteralPath (Join-Path $root '.git\hooks') -File -ErrorAction SilentlyContinue).Name -join ',')" | ForEach-Object { $sw.WriteLine($_) }

$elapsed = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
L "完成（耗时 ${elapsed}s）"
$sw.Close()
Write-Host "`n===== 体检完成 =====`n报告：$out`n`n下一步：把该文件内容发给我（或直接截图第 2/6/9/12/14 节）"
