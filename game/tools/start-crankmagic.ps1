param([int]$Port = 8768, [int]$GuestPort = 8769, [string]$OpenAiCredential = 'crankmagic_openai_api')
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'The local host port must be between 1024 and 65535.' }
if ($GuestPort -lt 1024 -or $GuestPort -gt 65535) { throw 'The guest gateway port must be between 1024 and 65535.' }
if ($Port -eq $GuestPort) { throw 'The local host and guest gateway must use different ports.' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$hostUrl = "http://127.0.0.1:$Port"
try {
    $health = Invoke-RestMethod "$hostUrl/api/health" -TimeoutSec 2
    if ($health.product -eq 'CrankMagic Online' -and $health.protocol -eq 1) {
        Write-Output "Ready: $hostUrl/app/#game (existing host retained)"
        exit 0
    }
} catch { }
# Never stop an existing process or discard its game to make this port available.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is occupied. Inspect the existing host before restarting; a game may be active." }
$guestListener = Get-NetTCPConnection -LocalPort $GuestPort -State Listen -ErrorAction SilentlyContinue
if ($guestListener) { throw "Guest port $GuestPort is occupied. Inspect the existing process before starting CrankMagic Online." }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$logDir = Join-Path $repoRoot 'game/.local/host'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$env:COMMANDER_PORT = "$Port"
$env:COMMANDER_GUEST_PORT = "$GuestPort"
$env:COMMANDER_OPENAI_CREDENTIAL = $OpenAiCredential
$child = Start-Process -FilePath $nodePath -ArgumentList 'game/tools/serve-review.mjs' -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "$stamp-out.log") -RedirectStandardError (Join-Path $logDir "$stamp-error.log")
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($child.HasExited) { throw "Host exited during startup. Inspect $logDir/$stamp-error.log." }
    try {
        $health = Invoke-RestMethod "$hostUrl/api/health" -TimeoutSec 1
        if ($health.product -eq 'CrankMagic Online' -and $health.protocol -eq 1) {
            $record = @{pid=$child.Id; port=$Port; guestPort=$GuestPort; startedAt=(Get-Date).ToString('o'); root=$repoRoot} | ConvertTo-Json
            $record | Set-Content (Join-Path $logDir "host-$Port.json")
            if ($Port -eq 8768) { $record | Set-Content (Join-Path $logDir 'host.json') }
            Write-Output "Ready: $hostUrl/app/#game"
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 300
}
throw "Host did not become ready. Inspect $logDir/$stamp-error.log."
