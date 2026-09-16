param([int]$Port = 8768)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$recordPath = Join-Path $repoRoot "game/.local/host/host-$Port.json"
if (-not (Test-Path $recordPath)) { Write-Output 'CrankMagic Online is already stopped.'; exit 0 }
$record = Get-Content -Raw $recordPath | ConvertFrom-Json
if ($record.root -ne $repoRoot -or $record.port -ne $Port) { throw 'The host record does not match this CrankMagic checkout.' }
try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    if ($health.product -ne 'CrankMagic Online' -or $health.protocol -ne 1) { throw 'The recorded port is not CrankMagic Online.' }
    $live = Invoke-RestMethod "http://127.0.0.1:$Port/api/live" -TimeoutSec 2
    if ($live.status -and $live.status -notin @('idle','closed','finished','incomplete','error')) {
        throw 'A Forge game is still active. In Play, open Game setup and use End current game before stopping the host.'
    }
} catch {
    if ($_.Exception.Message -like 'A Forge game is still active*') { throw }
}
$hostProcess = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if ($hostProcess) {
    if ($hostProcess.ProcessName -ne 'node') { throw 'The recorded host PID no longer belongs to Node; nothing was stopped.' }
    Stop-Process -Id $record.pid
}
if ($record.tunnelPid) {
    $tunnelProcess = Get-Process -Id $record.tunnelPid -ErrorAction SilentlyContinue
    if ($tunnelProcess) {
        if ($tunnelProcess.ProcessName -ne 'cloudflared') { throw 'The recorded tunnel PID no longer belongs to cloudflared.' }
        Stop-Process -Id $record.tunnelPid
    }
}
Remove-Item -LiteralPath $recordPath
if ($Port -eq 8768) {
    $defaultRecord = Join-Path $repoRoot 'game/.local/host/host.json'
    if (Test-Path $defaultRecord) { Remove-Item -LiteralPath $defaultRecord }
}
Write-Output 'CrankMagic Online and its guest tunnel are stopped.'
