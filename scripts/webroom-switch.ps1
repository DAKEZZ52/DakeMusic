<#
.SYNOPSIS
  远程切换语聊房开关
.EXAMPLE
  .\webroom-switch.ps1 drain 10 "今晚 22:30 维护"
  .\webroom-switch.ps1 close "维护中"
  .\webroom-switch.ps1 open
  .\webroom-switch.ps1 status
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('open', 'drain', 'close', 'status')]
  [string]$Action = 'status',
  [Parameter(Position = 1)]
  [string]$Arg = '',
  [Parameter(Position = 2)]
  [string]$Message = ''
)

$sshKey = Join-Path $env:USERPROFILE '.ssh\dakemusic_webroom'
$target = 'ubuntu@106.52.9.146'
$remote = '/home/ubuntu/room-server/set-webroom.sh'

switch ($Action) {
  'open'   { $cmd = "$remote open" }
  'drain'  {
    $minutes = if ($Arg) { $Arg } else { '10' }
    $text = if ($Message) { $Message } else { '语聊房即将关闭，请留意时间' }
    $cmd = "$remote drain $minutes '$text'"
  }
  'close'  {
    $text = if ($Arg) { $Arg } else { '语聊房维护中，请稍后再来' }
    $cmd = "$remote close '$text'"
  }
  default  { $cmd = "$remote status" }
}

Write-Host "→ $Action $Arg $Message" -ForegroundColor Cyan
& ssh -i $sshKey -o BatchMode=yes $target $cmd