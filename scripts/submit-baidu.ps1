#requires -Version 5.1
<#
.SYNOPSIS
  向百度主动推送接口提交 LyriseMusic 的页面 URL。

.DESCRIPTION
  需要在百度搜索资源平台获取普通收录的 API token，然后设置环境变量：
    $env:BAIDU_PUSH_TOKEN = '你的 token'
  未设置 token 时脚本会直接跳过，不影响部署。

  -SiteUrl 必须与百度后台添加的站点完全一致。例如后台是
  https://www.dkyy.top/，就不能用 https://dkyy.top/ 提交。

  百度该接口目前使用 HTTP，HTTPS 证书与域名不匹配。

.EXAMPLE
  $env:BAIDU_PUSH_TOKEN = 'xxxx'
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\submit-baidu.ps1
#>
param(
  [string]$SiteUrl = 'https://dkyy.top/',
  [string]$Token = $env:BAIDU_PUSH_TOKEN,
  [string[]]$Urls
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

if ([string]::IsNullOrWhiteSpace($Token)) {
  Write-Host '==> 百度主动推送：未设置 BAIDU_PUSH_TOKEN，已跳过' -ForegroundColor Yellow
  return
}

$base = $SiteUrl.TrimEnd('/')
if (-not $Urls -or $Urls.Count -eq 0) {
  $Urls = @("$base/", "$base/webroom/")
}

# 百度接口要求 site 参数保持原始 URL，URL 编码会导致 site init fail。
$endpoint = 'http://data.zz.baidu.com/urls?site=' +
  $base +
  '&token=' +
  $Token

$body = ($Urls -join "`n")

Write-Host '==> 提交百度主动推送' -ForegroundColor Cyan
$response = Invoke-WebRequest `
  -Uri $endpoint `
  -Method Post `
  -ContentType 'text/plain; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
  -UseBasicParsing `
  -TimeoutSec 40

Write-Host "    HTTP $($response.StatusCode)" -ForegroundColor Green
Write-Host "    $($response.Content)"
