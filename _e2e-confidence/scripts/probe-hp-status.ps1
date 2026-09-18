<#
.SYNOPSIS
  Personal-HP status probe for Trey E2E confidence loop.
  Run ON Personal-HP (machineId f0b9b3cf-d8c8-4c34-a30a-e889e57e148d).
#>
param(
  [string]$Root = 'C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c',
  [string]$AppUrl = 'http://127.0.0.1:8768/app/#game',
  [int]$CdpPort = 9222,
  [int]$HostPort = 8768
)

$ErrorActionPreference = 'Continue'
Write-Output "=== CM E2E probe $(Get-Date -Format o) ==="
Write-Output "Root: $Root"

# Host port
$hostListen = Get-NetTCPConnection -LocalPort $HostPort -State Listen -ErrorAction SilentlyContinue
if ($hostListen) {
  Write-Output "HOST: LISTEN on $HostPort (OwningProcess=$($hostListen.OwningProcess | Select-Object -First 1))"
} else {
  Write-Output "HOST: NOT listening on $HostPort — start via game\tools\start-crankmagic.ps1 (or Desktop shortcut)"
}

# CDP port
$cdpListen = Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue
if ($cdpListen) {
  Write-Output "CDP: LISTEN on $CdpPort"
  try {
    $ver = Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/version" -TimeoutSec 3
    Write-Output "CDP Browser: $($ver.Browser)"
    Write-Output "CDP webSocketDebuggerUrl: $($ver.webSocketDebuggerUrl)"
  } catch {
    Write-Output "CDP: port open but /json/version failed: $($_.Exception.Message)"
  }
} else {
  Write-Output "CDP: NOT listening on $CdpPort — launch Chrome with --remote-debugging-port=$CdpPort"
}

# HTTP live
try {
  $live = Invoke-RestMethod -Uri "http://127.0.0.1:$HostPort/api/live" -TimeoutSec 3
  Write-Output "API /api/live: $($live | ConvertTo-Json -Compress)"
} catch {
  Write-Output "API /api/live: FAIL $($_.Exception.Message)"
}

# Asset versions from index / app shell
$candidates = @(
  (Join-Path $Root 'index.html'),
  (Join-Path $Root 'app\index.html'),
  (Join-Path $Root 'public\index.html')
)
foreach ($idx in $candidates) {
  if (Test-Path $idx) {
    Write-Output "INDEX: $idx"
    Select-String -Path $idx -Pattern 'game\.js\?v=|crankmagic\.css\?v=' -AllMatches | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
  }
}

# Expected shipped pins (lobby slice)
Write-Output "EXPECTED (last lobby ship): game.js?v=26  crankmagic.css?v=130"
Write-Output "App URL: $AppUrl"
Write-Output "Start script: $Root\game\tools\start-crankmagic.ps1"
Write-Output "=== end probe ==="
