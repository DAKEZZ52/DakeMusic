<#
.SYNOPSIS
  发布一个已构建好的版本到腾讯云（含清单签名，防止漏传 latest.yml.sig）

.DESCRIPTION
  2.4.10 曾因为手工上传漏掉 latest.yml.sig，导致客户端报「更新清单签名无效」。
  该脚本把打包后的发布动作固定成一条链路：签名 → 上传 → 线上校验。

.EXAMPLE
  .\publish-release.ps1                # 用 release/ 里现成的产物发布
  .\publish-release.ps1 -Build         # 先重新打包再发布
#>
param(
  [switch]$Build,
  [switch]$SkipRefresh
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $pkg = Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $pkg.version
  $exe = "release\LyriseMusic-$version.exe"
  $blockmap = "$exe.blockmap"
  $manifest = 'release\latest.yml'
  $sig = 'release\latest.yml.sig'

  Write-Host "==> 目标版本 $version" -ForegroundColor Cyan

  if ($Build) {
    Write-Host '==> 构建' -ForegroundColor Cyan
    $env:ELECTRON_RUN_AS_NODE = $null
    & "$root\node_modules\.bin\vue-tsc.cmd" --noEmit
    if ($LASTEXITCODE -ne 0) { throw '类型检查未通过' }
    & "$root\node_modules\.bin\vite.cmd" build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
    & "$root\node_modules\.bin\electron-builder.cmd" --win --x64
    if ($LASTEXITCODE -ne 0) { throw '打包失败' }
  }

  foreach ($file in @($exe, $blockmap, $manifest)) {
    if (-not (Test-Path $file)) { throw "缺少发布产物：$file" }
  }

  Write-Host '==> 给更新清单签名' -ForegroundColor Cyan
  & node scripts\sign-update-manifest.mjs
  if ($LASTEXITCODE -ne 0) { throw '清单签名失败（私钥 .keys/build-ed25519.pem 是否在？）' }
  if (-not (Test-Path $sig)) { throw '签名文件未生成' }

  # 本地自校验：清单里声明的 sha512 必须与 exe 实际一致
  Write-Host '==> 本地一致性校验' -ForegroundColor Cyan
  $declared = (Select-String -Path $manifest -Pattern '^\s+sha512:\s*(\S+)' | Select-Object -First 1).Matches.Groups[1].Value
  $sha = [System.Security.Cryptography.SHA512]::Create()
  $stream = [System.IO.File]::OpenRead((Resolve-Path $exe))
  $actual = [Convert]::ToBase64String($sha.ComputeHash($stream))
  $stream.Close()
  if ($declared -ne $actual) {
    throw "清单 sha512 与安装包不一致`n清单: $declared`n实际: $actual"
  }
  $declaredSize = [int64](Select-String -Path $manifest -Pattern '^\s+size:\s*(\d+)' | Select-Object -First 1).Matches.Groups[1].Value
  if ($declaredSize -ne (Get-Item $exe).Length) {
    throw "清单 size（$declaredSize）与安装包实际大小（$((Get-Item $exe).Length)）不一致"
  }
  Write-Host '    清单与安装包一致' -ForegroundColor Green

  Write-Host '==> 上传到腾讯云（exe / blockmap / latest.yml / latest.yml.sig）' -ForegroundColor Cyan
  $key = Join-Path $env:USERPROFILE '.ssh\dakemusic_webroom'
  & scp -i $key -o BatchMode=yes $exe $blockmap $manifest $sig ubuntu@106.52.9.146:/var/www/dkyy/dl/
  if ($LASTEXITCODE -ne 0) { throw '上传失败' }

  Write-Host '==> 线上校验' -ForegroundColor Cyan
  $onlineManifest = (& curl.exe -sS --max-time 30 'https://dkyy.top/dl/latest.yml') -join "`n"
  if ($onlineManifest -notmatch "version:\s*$([regex]::Escape($version))") {
    throw "线上 latest.yml 版本不符：$($onlineManifest -split "`n" | Select-Object -First 1)"
  }
  $onlineSig = ((& curl.exe -sS --max-time 30 'https://dkyy.top/dl/latest.yml.sig') -join "`n").Trim()
  $localSig = (Get-Content $sig -Raw).Trim()
  if ($onlineSig -ne $localSig) {
    throw "线上 latest.yml.sig 与本地不一致（可能被缓存）`n线上: $onlineSig`n本地: $localSig"
  }
  $head = Invoke-WebRequest -Uri "https://dkyy.top/dl/LyriseMusic-$version.exe" -Method Head -TimeoutSec 60 -UseBasicParsing
  if ($head.StatusCode -ne 200) { throw "安装包不可访问：HTTP $($head.StatusCode)" }
  Write-Host "    清单 + 签名 + 安装包（$([math]::Round([int64]$head.Headers['Content-Length']/1MB,2)) MB）均已就位" -ForegroundColor Green

  if (-not $SkipRefresh) {
    Write-Host '==> 刷新下载页' -ForegroundColor Cyan
    & python scripts\refresh-site.py --upload
  }

  Write-Host ''
  Write-Host "发布完成：$version" -ForegroundColor Green
  Write-Host '提醒：GitHub 兜底源由推 tag 触发的 CI 构建，不需要手动上传。' -ForegroundColor DarkGray
}
finally {
  Pop-Location
}
