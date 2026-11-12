#requires -Version 5.1
<#
.SYNOPSIS
  把 public/webroom/ 发布到线上 nginx（默认 https://dkyy.top/webroom/）。

.DESCRIPTION
  - 本地打包 public/webroom（含 assets/、vendor/）为 tar.gz
  - scp 到服务器 /tmp，解压到 nginx 根目录（默认 /var/www/html）
  - 解压后删除 README.md，统一权限为 a+rX
  - 最后探测一次线上页面与登录接口（登录接口用错误密码，期望 401）

.EXAMPLE
  pwsh scripts/deploy-webroom.ps1
  pwsh scripts/deploy-webroom.ps1 -SshHost 106.52.9.146 -User ubuntu -Port 22
#>
param(
  [string]$SshHost = '106.52.9.146',
  [string]$User = 'ubuntu',
  [int]$Port = 22,
  [string]$KeyPath = "$env:USERPROFILE\.ssh\lyrise_webroom",
  [string]$RemoteRoot = '/var/www/html',
  [string]$SiteUrl = 'https://dkyy.top/webroom/',
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$repo = Split-Path -Parent $PSScriptRoot
$public = Join-Path $repo 'public'
$tarball = Join-Path ([System.IO.Path]::GetTempPath()) 'webroom-dist.tar.gz'

if (-not (Test-Path (Join-Path $public 'webroom\index.html'))) {
  throw "找不到 public/webroom/index.html，请在仓库根目录运行"
}
if (-not (Test-Path $KeyPath)) {
  throw "找不到 SSH 私钥：$KeyPath（用 -KeyPath 指定）"
}

$target = "$User@$SshHost"
$sshOpts = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
$sshArgs = $sshOpts + @('-p', $Port)
$scpArgs = $sshOpts + @('-P', $Port)

Write-Host "==> 打包 public/webroom" -ForegroundColor Cyan
if (Test-Path $tarball) { Remove-Item $tarball -Force }
& tar -czf $tarball -C $public webroom
if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
$size = [math]::Round((Get-Item $tarball).Length / 1MB, 2)
Write-Host "    $tarball ($size MB)"

Write-Host "==> 上传到 ${target}:/tmp" -ForegroundColor Cyan
& scp @scpArgs $tarball "${target}:/tmp/webroom-dist.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }

Write-Host "==> 解压到 $RemoteRoot" -ForegroundColor Cyan
$remoteDeploy = "cd $RemoteRoot && tar -xzf /tmp/webroom-dist.tar.gz && rm -f webroom/README.md && chmod -R a+rX webroom && echo DEPLOY_OK"
$deployOut = (& ssh @sshArgs $target $remoteDeploy) -join "`n"
if ($LASTEXITCODE -ne 0 -or $deployOut -notmatch 'DEPLOY_OK') {
  throw "远端解压失败：$deployOut"
}
Write-Host "    完成" -ForegroundColor Green

if ($SkipVerify) { return }

Write-Host "==> 线上探测" -ForegroundColor Cyan
$origin = ([uri]$SiteUrl).GetLeftPart([System.UriPartial]::Authority)
$pageCode = ((& ssh @sshArgs $target "curl -s -o /dev/null -w '%{http_code}' $SiteUrl") -join '').Trim()
Write-Host "    $SiteUrl -> $pageCode"
if ($pageCode -ne '200') { Write-Warning "页面返回 $pageCode，请检查 nginx 与目录权限" }

# 登录接口：用 Origin 头 + 空 Body 探测 CORS。CORS 通过时应返回 400（账号和密码必填），
# 被 CORS 拒绝时中间件抛错会变成 500
$loginCmd = "curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'Origin: $origin' -d '' $origin/api/auth/login"
$loginCode = ((& ssh @sshArgs $target $loginCmd) -join '').Trim()
Write-Host "    POST /api/auth/login（CORS 探测）-> $loginCode（期望 400）"
if ($loginCode -eq '500') {
  Write-Warning "登录接口 500：把 $origin 加进服务端 CORS_ORIGINS，然后 pm2 restart room-server"
}

Write-Host "部署完成：$SiteUrl" -ForegroundColor Green
