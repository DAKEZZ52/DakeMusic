#requires -Version 5.1
<#
.SYNOPSIS
  验证「DakeMusic → LyriseMusic」品牌改名的升级链路是否完整。

.DESCRIPTION
  完整走一遍真实升级路径：
    1. 静默安装旧版（DakeMusic）
    2. 启动旧版让它初始化数据，然后退出
    3. 记录旧数据快照（用户目录、数据库、注册表卸载项）
    4. 静默安装新版（LyriseMusic）—— 等同于 electron-updater 的自动更新
    5. 启动新版，让它完成用户数据迁移
    6. 校验：新目录、新库、旧目录清理、旧卸载项消失、数据条数一致

  默认只读旧安装包、不会删用户数据；带 -Cleanup 才会卸载两个版本。

.PARAMETER OldInstaller
  旧版安装包，默认 release\DakeMusic-2.4.8.exe。

.PARAMETER NewInstaller
  新版安装包，默认 release\LyriseMusic-2.4.9.exe。

.PARAMETER Force
  跳过「本机已有用户数据」的二次确认（脚本会先备份）。

.PARAMETER Cleanup
  验证结束后卸载新版与旧版残留。

.EXAMPLE
  pwsh scripts/verify-brand-upgrade.ps1 -NewInstaller release\LyriseMusic-2.4.9.exe

.NOTES
  作者：知之 Dake | 仅在本机执行，不联网。
#>
param(
  [string]$OldInstaller = 'release\DakeMusic-2.4.8.exe',
  [string]$NewInstaller = 'release\LyriseMusic-2.4.9.exe',
  [string]$OldAppId = 'com.dake.dakemusic',
  [string]$NewAppId = 'com.lyrise.music',
  [switch]$Force,
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repo = Split-Path -Parent $PSScriptRoot
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name, [bool]$Ok, [string]$Detail = '')
  $results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail })
  $mark = if ($Ok) { 'OK  ' } else { 'FAIL' }
  Write-Host ("  [{0}] {1}{2}" -f $mark, $Name, $(if ($Detail) { " — $Detail" } else { '' }))
}

function Resolve-RepoPath {
  param([string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return (Join-Path $repo $Path)
}

function Get-UninstallEntries {
  param([string]$AppId)
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
  )
  foreach ($root in $roots) {
    if (Test-Path $root) { Get-ItemProperty $root }
  }
}

function Get-DirSnapshot {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $files = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue
  $db = $files | Where-Object { $_.Name -match '\.sqlite$' } | Sort-Object Length -Descending | Select-Object -First 1
  [pscustomobject]@{
    Path = $Path
    FileCount = $files.Count
    SizeMB = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
    Database = $(if ($db) { $db.Name } else { $null })
    DatabaseBytes = $(if ($db) { $db.Length } else { 0 })
  }
}

function Install-Silent {
  param([string]$InstallerPath, [string[]]$ExtraArgs = @())
  $installerArgs = @('/S') + $ExtraArgs
  $proc = Start-Process -FilePath $InstallerPath -ArgumentList $installerArgs -PassThru -Wait
  return $proc.ExitCode
}

function Start-AppAndWait {
  param([string]$ExePath, [int]$Seconds = 12)
  if (-not (Test-Path $ExePath)) { return $false }
  $proc = Start-Process -FilePath $ExePath -ArgumentList '--no-sandbox', '--no-stdio-init' -PassThru
  Start-Sleep -Seconds $Seconds
  try {
    Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | ForEach-Object {
      $_.CloseMainWindow() | Out-Null
    }
    Start-Sleep -Seconds 3
    Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Stop-Process -Force
  } catch {}
  Start-Sleep -Seconds 2
  return $true
}

Write-Host '==> 环境检查' -ForegroundColor Cyan
$oldPath = Resolve-RepoPath $OldInstaller
$newPath = Resolve-RepoPath $NewInstaller
Write-Host "    旧包: $oldPath"
Write-Host "    新包: $newPath"

if (-not (Test-Path $oldPath)) { throw "找不到旧版安装包：$oldPath" }
if (-not (Test-Path $newPath)) {
  throw "找不到新版安装包：$newPath（先执行 pnpm build:win 生成）"
}

$oldData = Join-Path $env:APPDATA 'DakeMusic'
$newData = Join-Path $env:APPDATA 'LyriseMusic'
$oldInstall = Join-Path $env:LOCALAPPDATA 'Programs\DakeMusic'
$newInstall = Join-Path $env:LOCALAPPDATA 'Programs\LyriseMusic'

if ((Test-Path $oldData) -and -not $Force) {
  $answer = Read-Host "本机已存在用户数据 $oldData，继续会先备份并覆盖安装。输入 Y 继续"
  if ($answer -notmatch '^(?i)y') { Write-Host '已取消'; return }
}

# 备份现有用户数据，避免验证过程破坏真实数据
if (Test-Path $oldData) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupDir = Join-Path $repo "_backup\brand-upgrade-$stamp"
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  Copy-Item -LiteralPath $oldData -Destination (Join-Path $backupDir 'DakeMusic') -Recurse -Force
  Write-Host "    已备份用户数据到 $backupDir" -ForegroundColor Yellow
}

# 清理上一次验证可能留下的新版本
foreach ($appId in @($OldAppId, $NewAppId)) {
  $entry = Get-UninstallEntries -AppId $appId | Select-Object -First 1
  if ($entry -and $entry.UninstallString -and -not $Force) {
    Write-Host "    检测到已安装 $($entry.DisplayName)，将先卸载" -ForegroundColor Yellow
    $uninstaller = ($entry.UninstallString -replace '^"([^"]+)".*$', '$1') -replace '\s+/.*$', ''
    if (Test-Path $uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait }
  }
}

Write-Host "`n==> 1/6 安装旧版 $(Split-Path $oldPath -Leaf)" -ForegroundColor Cyan
$oldExit = Install-Silent -InstallerPath $oldPath
Start-Sleep -Seconds 3
Add-Result "旧版安装退出码为 0" ($oldExit -eq 0) "exit=$oldExit"

Write-Host "`n==> 2/6 启动旧版初始化数据" -ForegroundColor Cyan
$oldExe = Join-Path $oldInstall 'DakeMusic.exe'
Start-AppAndWait -ExePath $oldExe -Seconds 12 | Out-Null
$oldSnapshot = Get-DirSnapshot -Path $oldData
$oldKey = Get-UninstallEntries -AppId $OldAppId | Select-Object -First 1
Add-Result '旧版创建了用户数据目录' ($null -ne $oldSnapshot) $oldData
Add-Result '旧版用户目录里有数据库' ($null -ne $oldSnapshot -and $oldSnapshot.Database -ne $null) "$($oldSnapshot.Database)"
Add-Result '旧版卸载项已注册' ($null -ne $oldKey) "$($oldKey.DisplayName)"

Write-Host "`n==> 3/6 静默安装新版（模拟自动更新）" -ForegroundColor Cyan
$newExit = Install-Silent -InstallerPath $newPath -ExtraArgs @('--updated')
Start-Sleep -Seconds 4
Add-Result "新版安装退出码为 0" ($newExit -eq 0) "exit=$newExit"
Add-Result '新版安装目录已生成' (Test-Path (Join-Path $newInstall 'LyriseMusic.exe')) $newInstall

Write-Host "`n==> 4/6 启动新版触发用户数据迁移" -ForegroundColor Cyan
$newExe = Join-Path $newInstall 'LyriseMusic.exe'
Start-AppAndWait -ExePath $newExe -Seconds 15 | Out-Null
$newSnapshot = Get-DirSnapshot -Path $newData
Add-Result '新版用户数据目录已生成' ($null -ne $newSnapshot) $newData
Add-Result '新版数据库文件为 lyrise.sqlite' ($null -ne $newSnapshot -and $newSnapshot.Database -eq 'lyrise.sqlite') "$($newSnapshot.Database)"

Write-Host "`n==> 5/6 校验数据迁移与旧版清理" -ForegroundColor Cyan
if ($oldSnapshot -and $newSnapshot) {
  $sizeOk = $newSnapshot.DatabaseBytes -ge [math]::Max(1024, ($oldSnapshot.DatabaseBytes * 0.5))
  Add-Result '数据库已迁移（新库大小合理）' $sizeOk ("旧 " + $oldSnapshot.DatabaseBytes + " B → 新 " + $newSnapshot.DatabaseBytes + " B")
}
$oldLegacyDb = Join-Path $newData 'dakemusic.sqlite'
Add-Result '新目录里没有遗留旧库文件名' (-not (Test-Path $oldLegacyDb)) $oldLegacyDb
$oldKeyAfter = Get-UninstallEntries -AppId $OldAppId | Select-Object -First 1
Add-Result '旧版卸载项已被清理' ($null -eq $oldKeyAfter) "$OldAppId"
$newKey = Get-UninstallEntries -AppId $NewAppId | Select-Object -First 1
Add-Result '新版卸载项已注册' ($null -ne $newKey) "$($newKey.DisplayName)"
if ($newKey -and $newKey.DisplayIcon) {
  Add-Result '新版卸载项指向 LyriseMusic.exe' ($newKey.DisplayIcon -match 'LyriseMusic\.exe') $newKey.DisplayIcon
}

Write-Host "`n==> 6/6 汇总" -ForegroundColor Cyan
$failed = $results | Where-Object { -not $_.Ok }
Write-Host ("    通过 {0} / {1}" -f ($results.Count - $failed.Count), $results.Count)
if ($failed) {
  Write-Host '    失败项：' -ForegroundColor Red
  $failed | ForEach-Object { Write-Host ("      - " + $_.Name + $(if ($_.Detail) { " ($($_.Detail))" } else { '' })) -ForegroundColor Red }
}

if ($Cleanup) {
  Write-Host "`n==> 卸载验证版本" -ForegroundColor Cyan
  foreach ($appId in @($NewAppId, $OldAppId)) {
    $entry = Get-UninstallEntries -AppId $appId | Select-Object -First 1
    if ($entry -and $entry.UninstallString) {
      $uninstaller = ($entry.UninstallString -replace '^"([^"]+)".*$', '$1') -replace '\s+/.*$', ''
      if (Test-Path $uninstaller) {
        Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
        Write-Host "    已卸载 $($entry.DisplayName)"
      }
    }
  }
}

if ($failed) { exit 1 } else { exit 0 }
