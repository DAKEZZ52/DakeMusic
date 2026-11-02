#requires -Version 5.1
<#
.SYNOPSIS
  向 IndexNow 提交 DakeMusic 的页面 URL（Bing、Yandex、Seznam 等共享）。

.DESCRIPTION
  IndexNow key 文件必须能从站点根目录访问：
  https://dkyy.top/<Key>.txt

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\submit-indexnow.ps1
#>
param(
  [string]$SiteUrl = 'https://dkyy.top/',
  [string]$Key = 'a6ee54c0ef16432a8c5baf8581804a9a',
  [string]$KeyFile,
  [string[]]$Urls
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $KeyFile) {
  $KeyFile = Join-Path $repo "site\$Key.txt"
}
if (-not (Test-Path $KeyFile)) {
  throw "找不到 IndexNow key 文件：$KeyFile"
}

$keyOnDisk = (Get-Content $KeyFile -Raw -Encoding UTF8).Trim()
if ($keyOnDisk -ne $Key) {
  throw "IndexNow key 文件内容与 Key 不一致：$KeyFile"
}

$base = $SiteUrl.TrimEnd('/')
if (-not $Urls -or $Urls.Count -eq 0) {
  $Urls = @("$base/", "$base/webroom/")
}

$body = @{
  host = ([uri]$base).Host
  key = $Key
  keyLocation = "$base/$Key.txt"
  urlList = @($Urls)
} | ConvertTo-Json -Depth 5

Write-Host '==> 提交 IndexNow（Bing / Yandex 等）' -ForegroundColor Cyan
$response = Invoke-WebRequest `
  -Uri 'https://api.indexnow.org/indexnow' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
  -UseBasicParsing `
  -TimeoutSec 40

Write-Host "    HTTP $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
if ($response.Content) {
  Write-Host "    $($response.Content)"
}
