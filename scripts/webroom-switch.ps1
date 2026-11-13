<#
.SYNOPSIS
  远程切换语聊房维护开关
.EXAMPLE
  .\webroom-switch.ps1 close "今晚维护，明早 8 点恢复"
  .\webroom-switch.ps1 open
  .\webroom-switch.ps1 status
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('open', 'close', 'status')]
  [string]$Action = 'status',
  [Parameter(Position = 1)]
  [string]$Message = ''
)

$sshKey = Join-Path $env:USERPROFILE '.ssh\dakemusic_webroom'
$host_ = 'ubuntu@106.52.9.146'
$remote = '/home/ubuntu/room-server/set-webroom.sh'

$arg = if ($Action -eq 'close') { "close '$Message'" } else { $Action }
Write-Host "→ $Action $Message" -ForegroundColor Cyan
& ssh -i $sshKey -o BatchMode=yes $host_ "$remote $arg"