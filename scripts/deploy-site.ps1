#requires -Version 5.1
<#
.SYNOPSIS
  把 site/ 发布到 dkyy.top 站点根目录（默认 https://dkyy.top/）。

.DESCRIPTION
  - 本地打包 site/ 为 tar.gz（index.html + assets/）
  - scp 到服务器 /tmp，解压到 nginx 根目录（默认 /var/www/html）
  - 首次部署时备份原有 index.html 为 index.html.bak-site
  - 统一权限为 a+rX，并探测首页、样式、脚本与图片
  - 部署后自动提交 IndexNow（Bing 等）与百度主动推送（需 BAIDU_PUSH_TOKEN）
  - 百度站点可用 -BaiduSiteUrl 或 BAIDU_SITE_URL 指定，必须与百度后台站点完全一致

.EXAMPLE
  pwsh scripts/deploy-site.ps1
  pwsh scripts/deploy-site.ps1 -SshHost 106.52.9.146 -User ubuntu -Port 22
#>
param(
  [string]$SshHost = '106.52.9.146',
  [string]$User = 'ubuntu',
  [int]$Port = 22,
  [string]$KeyPath = "$env:USERPROFILE\.ssh\dakemusic_webroom",
  [string]$RemoteRoot = '/var/www/html',
  [string]$SiteUrl = 'https://dkyy.top/',
  [string]$BaiduSiteUrl,
  [switch]$SkipVerify,
  [switch]$SkipSearchSubmit
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$repo = Split-Path -Parent $PSScriptRoot
$site = Join-Path $repo 'site'
$tarball = Join-Path ([System.IO.Path]::GetTempPath()) 'site-dist.tar.gz'

if (-not (Test-Path (Join-Path $site 'index.html'))) {
  throw "找不到 site/index.html，请在仓库根目录运行"
}
if (-not (Test-Path $KeyPath)) {
  throw "找不到 SSH 私钥：$KeyPath（用 -KeyPath 指定）"
}

$target = "$User@$SshHost"
$sshOpts = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
$sshArgs = $sshOpts + @('-p', $Port)
$scpArgs = $sshOpts + @('-P', $Port)

Write-Host "==> 打包 site/" -ForegroundColor Cyan
if (Test-Path $tarball) { Remove-Item $tarball -Force }
& tar -czf $tarball -C $site .
if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
$size = [math]::Round((Get-Item $tarball).Length / 1MB, 2)
Write-Host "    $tarball ($size MB)"

Write-Host "==> 上传到 ${target}:/tmp" -ForegroundColor Cyan
& scp @scpArgs $tarball "${target}:/tmp/site-dist.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }

Write-Host "==> 解压到 $RemoteRoot" -ForegroundColor Cyan
$remoteDeploy = "cd $RemoteRoot && if [ -f index.html ] && [ ! -f index.html.bak-site ]; then cp index.html index.html.bak-site; fi; tar -xzf /tmp/site-dist.tar.gz && chmod -R a+rX index.html assets && echo DEPLOY_OK"
$deployOut = (& ssh @sshArgs $target $remoteDeploy) -join "`n"
if ($LASTEXITCODE -ne 0 -or $deployOut -notmatch 'DEPLOY_OK') {
  throw "远端解压失败：$deployOut"
}
Write-Host "    完成" -ForegroundColor Green

if (-not $SkipVerify) {
  Write-Host "==> 线上探测" -ForegroundColor Cyan
  $pageCode = ((& ssh @sshArgs $target "curl -s -o /dev/null -w '%{http_code}' $SiteUrl") -join '').Trim()
  Write-Host "    $SiteUrl -> $pageCode"
  if ($pageCode -ne '200') { Write-Warning "页面返回 $pageCode，请检查 nginx 与目录权限" }

  $checks = @(
    @{ Path = 'assets/site.css'; Label = '样式' },
    @{ Path = 'assets/site.js'; Label = '脚本' },
    @{ Path = 'assets/img/hero.webp'; Label = '首屏图' },
    @{ Path = 'assets/img/logo.png'; Label = '图标' }
  )
  foreach ($check in $checks) {
    $url = $SiteUrl.TrimEnd('/') + '/' + $check.Path
    $code = ((& ssh @sshArgs $target "curl -s -o /dev/null -w '%{http_code}' $url") -join '').Trim()
    Write-Host "    $($check.Label) $url -> $code"
    if ($code -ne '200') { Write-Warning "$($check.Label) 返回 $code" }
  }

  $title = ((& ssh @sshArgs $target "curl -s $SiteUrl | grep -o '<title>[^<]*</title>' | head -1") -join '').Trim()
  Write-Host "    $title"
}

if (-not $SkipSearchSubmit) {
  $indexNowScript = Join-Path $PSScriptRoot 'submit-indexnow.ps1'
  if (Test-Path $indexNowScript) {
    try {
      & $indexNowScript -SiteUrl $SiteUrl
    } catch {
      Write-Warning "IndexNow 提交失败：$($_.Exception.Message)"
    }
  }

  $baiduScript = Join-Path $PSScriptRoot 'submit-baidu.ps1'
  if (Test-Path $baiduScript) {
    if (-not $BaiduSiteUrl) {
      if ($env:BAIDU_SITE_URL) {
        $BaiduSiteUrl = $env:BAIDU_SITE_URL
      } else {
        $BaiduSiteUrl = $SiteUrl
      }
    }
    try {
      & $baiduScript -SiteUrl $BaiduSiteUrl
    } catch {
      Write-Warning "百度主动推送失败：$($_.Exception.Message)"
    }
  }
}

Write-Host "部署完成：$SiteUrl" -ForegroundColor Green
