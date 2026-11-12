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

  注意：Electron 的 userData 目录取自 package.json 的 name（lyrise-music），
  而不是 productName，所以脚本按「目录名匹配 lyrise」来探测，不写死大小写。

.PARAMETER OldInstaller
  旧版安装包，默认 release\DakeMusic-2.4.8.exe。

.PARAMETER NewInstaller
  新版安装包，默认 release\LyriseMusic-2.4.9.exe。

.PARAMETER Force
  跳过「本机已有用户数据」的二次确认（脚本会先备份）。

.PARAMETER Cleanup
  验证结束后卸载新版与旧版残留。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\verify-brand-upgrade.ps1 -Force

.NOTES
  作者：知之 Dake | 仅在本机执行，不联网。
#>
param(
  [string]$OldInstaller = 'release\DakeMusic-2.4.8.exe',
  [string]$NewInstaller = 'release\LyriseMusic-2.4.9.exe',
  [string]$OldDisplayName = 'DakeMusic',
  [string]$NewDisplayName = 'LyriseMusic',
  [switch]$Force,
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Electron 打包产物在 ELECTRON_RUN_AS_NODE=1 时会以 Node 模式运行并秒退，
# 必须从本进程环境里清掉，否则启动测试永远是失败。
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$repo = Split-Path -Parent $PSScriptRoot
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name, [bool]$Ok, [string]$Detail = '')
  $results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail })
  $mark = 'OK  '
  if (-not $Ok) { $mark = 'FAIL' }
  $suffix = ''
  if ($Detail) { $suffix = " — $Detail" }
  Write-Host ("  [{0}] {1}{2}" -f $mark, $Name, $suffix)
}

function Resolve-RepoPath {
  param([string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return (Join-Path $repo $Path)
}

# 卸载项键名是 electron-builder 生成的 GUID，不是 appId，必须按 DisplayName 搜索
function Get-UninstallEntry {
  param([string]$DisplayNameLike)
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($item in Get-ChildItem $root -ErrorAction SilentlyContinue) {
      $props = Get-ItemProperty $item.PSPath -ErrorAction SilentlyContinue
      if ($props -and $props.DisplayName -like "*$DisplayNameLike*") {
        return $props
      }
    }
  }
  return $null
}

function Get-UninstallerPath {
  param($Entry)
  if (-not $Entry -or -not $Entry.UninstallString) { return $null }
  $raw = [string]$Entry.UninstallString
  if ($raw -match '^"([^"]+)"') { return $matches[1] }
  return ($raw -split '\s+')[0]
}

# userData 目录名来自 package.json 的 name，探测 lyrise 开头的目录
function Find-UserDataDir {
  param([string]$Pattern)
  $match = Get-ChildItem $env:APPDATA -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $Pattern } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($match) { return $match.FullName }
  return $null
}

function Find-InstallExe {
  param([string]$ProductName)
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\$ProductName\$ProductName.exe"),
    (Join-Path $env:PROGRAMFILES "$ProductName\$ProductName.exe"),
    (Join-Path ${env:PROGRAMFILES(x86)} "$ProductName\$ProductName.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Get-DirSnapshot {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path)) { return $null }
  $files = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue
  $db = $files | Where-Object { $_.Name -match '\.sqlite$' } | Sort-Object Length -Descending | Select-Object -First 1
  $dbName = $null
  $dbBytes = 0
  if ($db) {
    $dbName = $db.Name
    $dbBytes = $db.Length
  }
  [pscustomobject]@{
    Path = $Path
    FileCount = $files.Count
    SizeMB = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
    Database = $dbName
    DatabaseBytes = $dbBytes
  }
}

function Install-Silent {
  param([string]$InstallerPath, [string[]]$ExtraArgs = @())
  $installerArgs = @('/S') + $ExtraArgs
  $proc = Start-Process -FilePath $InstallerPath -ArgumentList $installerArgs -PassThru -Wait
  return $proc.ExitCode
}

function Uninstall-Silent {
  param([string]$DisplayNameLike)
  $entry = Get-UninstallEntry -DisplayNameLike $DisplayNameLike
  if (-not $entry) { return $false }
  $uninstaller = Get-UninstallerPath -Entry $entry
  if (-not $uninstaller -or -not (Test-Path $uninstaller)) { return $false }
  Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
  Start-Sleep -Seconds 2
  return $true
}

function Start-AppAndWait {
  param([string]$ExePath, [int]$Seconds = 15)
  if (-not $ExePath -or -not (Test-Path $ExePath)) { return $false }
  $proc = Start-Process -FilePath $ExePath -PassThru
  Start-Sleep -Seconds $Seconds
  $alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if ($alive) { $script:appStarted = $true }
  try {
    Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Seconds 3
  } catch {}
  Get-Process -Name (Split-Path $ExePath -Leaf).Replace('.exe', '') -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  return [bool]$alive
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

$legacyDataDir = Find-UserDataDir -Pattern 'dake-music'
$newDataDirPreview = Find-UserDataDir -Pattern 'lyrise-music'

if ($legacyDataDir -and -not $Force) {
  $answer = Read-Host "本机已存在用户数据 $legacyDataDir，继续会先备份并覆盖安装。输入 Y 继续"
  if ($answer -notmatch '^(?i)y') { Write-Host '已取消'; return }
}

if ($legacyDataDir) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupDir = Join-Path $repo "_backup\brand-upgrade-$stamp"
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  Copy-Item -LiteralPath $legacyDataDir -Destination (Join-Path $backupDir 'legacy-userdata') -Recurse -Force
  Write-Host "    已备份旧用户数据到 $backupDir" -ForegroundColor Yellow
}

Write-Host "`n==> 0/6 清理上一次验证的残留" -ForegroundColor Cyan
Uninstall-Silent -DisplayNameLike $NewDisplayName | Out-Null
Uninstall-Silent -DisplayNameLike $OldDisplayName | Out-Null
# 清掉旧的数据目录，让第 2 步从零创建，确保迁移演示真实
if ($legacyDataDir -and (Test-Path $legacyDataDir)) {
  Remove-Item -LiteralPath $legacyDataDir -Recurse -Force -ErrorAction SilentlyContinue
}
if ($newDataDirPreview -and (Test-Path $newDataDirPreview)) {
  Remove-Item -LiteralPath $newDataDirPreview -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n==> 1/6 安装旧版 $(Split-Path $oldPath -Leaf)" -ForegroundColor Cyan
$oldExit = Install-Silent -InstallerPath $oldPath
Start-Sleep -Seconds 3
Add-Result "旧版安装退出码为 0" ($oldExit -eq 0) "exit=$oldExit"
$oldExe = Find-InstallExe -ProductName $OldDisplayName
Add-Result '旧版程序已安装' ($null -ne $oldExe) "$oldExe"

Write-Host "`n==> 2/6 启动旧版初始化数据" -ForegroundColor Cyan
$started = Start-AppAndWait -ExePath $oldExe -Seconds 15
Add-Result '旧版能正常启动' $started
$legacyDataDir = Find-UserDataDir -Pattern 'dake-music'
$oldSnapshot = Get-DirSnapshot -Path $legacyDataDir
Add-Result '旧版创建了用户数据目录' ($null -ne $oldSnapshot) "$legacyDataDir"
if ($oldSnapshot) {
  Add-Result '旧版用户目录里有数据库' ($null -ne $oldSnapshot.Database) "$($oldSnapshot.Database) / $([math]::Round($oldSnapshot.DatabaseBytes / 1KB, 1)) KB"
}
$oldEntry = Get-UninstallEntry -DisplayNameLike $OldDisplayName
Add-Result '旧版卸载项已注册' ($null -ne $oldEntry) "$($oldEntry.DisplayName)"

Write-Host "`n==> 3/6 静默安装新版（模拟自动更新）" -ForegroundColor Cyan
$newExit = Install-Silent -InstallerPath $newPath -ExtraArgs @('--updated')
Start-Sleep -Seconds 4
Add-Result "新版安装退出码为 0" ($newExit -eq 0) "exit=$newExit"
$newExe = Find-InstallExe -ProductName $NewDisplayName
Add-Result '新版程序已安装' ($null -ne $newExe) "$newExe"

Write-Host "`n==> 4/6 启动新版触发用户数据迁移" -ForegroundColor Cyan
$newStarted = Start-AppAndWait -ExePath $newExe -Seconds 30
Add-Result '新版能正常启动' $newStarted
$newDataDir = Find-UserDataDir -Pattern 'lyrise-music'
$newSnapshot = Get-DirSnapshot -Path $newDataDir
Add-Result '新版用户数据目录已生成' ($null -ne $newSnapshot) "$newDataDir"
Add-Result '新版数据库文件为 lyrise.sqlite' ($null -ne $newSnapshot -and $newSnapshot.Database -eq 'lyrise.sqlite') "$($newSnapshot.Database)"

Write-Host "`n==> 5/6 校验数据迁移与旧版清理" -ForegroundColor Cyan
if ($oldSnapshot -and $newSnapshot) {
  $ratio = 0
  if ($oldSnapshot.DatabaseBytes -gt 0) { $ratio = $newSnapshot.DatabaseBytes / $oldSnapshot.DatabaseBytes }
  Add-Result '数据库已迁移（新库不小于旧库一半）' ($ratio -ge 0.5) ("旧 " + [math]::Round($oldSnapshot.DatabaseBytes / 1KB, 1) + " KB → 新 " + [math]::Round($newSnapshot.DatabaseBytes / 1KB, 1) + " KB")
}
if ($newDataDir) {
  $legacyLeft = @()
  foreach ($name in @('dakemusic.sqlite', 'echomusic.sqlite')) {
    if (Test-Path (Join-Path $newDataDir $name)) { $legacyLeft += $name }
  }
  Add-Result '新目录里没有遗留旧库文件名' ($legacyLeft.Count -eq 0) ($legacyLeft -join ', ')
}
if ($legacyDataDir) {
  Add-Result '旧用户目录已迁移（不再存在）' (-not (Test-Path $legacyDataDir)) $legacyDataDir
}
$oldEntryAfter = Get-UninstallEntry -DisplayNameLike $OldDisplayName
Add-Result '旧版卸载项已被清理' ($null -eq $oldEntryAfter) "$($oldEntryAfter.DisplayName)"
$newEntry = Get-UninstallEntry -DisplayNameLike $NewDisplayName
Add-Result '新版卸载项已注册' ($null -ne $newEntry) "$($newEntry.DisplayName)"
if ($newEntry -and $newEntry.DisplayIcon) {
  Add-Result '新版卸载项指向 LyriseMusic.exe' ($newEntry.DisplayIcon -match 'LyriseMusic\.exe') $newEntry.DisplayIcon
}

Write-Host "`n==> 6/6 汇总" -ForegroundColor Cyan
$failed = $results | Where-Object { -not $_.Ok }
$passed = $results.Count - $failed.Count
Write-Host ("    通过 {0} / {1}" -f $passed, $results.Count)
if ($failed) {
  Write-Host '    失败项：' -ForegroundColor Red
  $failed | ForEach-Object {
    $suffix = ''
    if ($_.Detail) { $suffix = " ($($_.Detail))" }
    Write-Host ("      - " + $_.Name + $suffix) -ForegroundColor Red
  }
}

if ($Cleanup) {
  Write-Host "`n==> 卸载验证版本" -ForegroundColor Cyan
  Uninstall-Silent -DisplayNameLike $NewDisplayName | Out-Null
  Uninstall-Silent -DisplayNameLike $OldDisplayName | Out-Null
  Write-Host '    已卸载'
}

if ($failed) { exit 1 } else { exit 0 }
