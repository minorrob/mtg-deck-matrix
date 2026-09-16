param(
    [int]$Port = 8768,
    [int]$GuestPort = 8769,
    [string]$OpenAiCredential = 'crankmagic_openai_api',
    [switch]$RemoteGuests,
    [string]$GuestPublicOrigin = ''
)
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
        if ($RemoteGuests) { Write-Warning 'The existing host was retained. Stop it cleanly before changing remote guest access.' }
        exit 0
    }
} catch { }
# Never stop an existing process or discard its game to make this port available.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is occupied. Inspect the existing host before restarting; a game may be active." }
$guestListener = Get-NetTCPConnection -LocalPort $GuestPort -State Listen -ErrorAction SilentlyContinue
if ($guestListener) { throw "Guest port $GuestPort is occupied. Inspect the existing process before starting CrankMagic Online." }
function Resolve-CrankMagicNode {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        $env:CRANKMAGIC_NODE,
        $env:NVM_SYMLINK,
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\node.exe'),
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    )
    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        $path = if ((Test-Path -LiteralPath $candidate -PathType Container)) { Join-Path $candidate 'node.exe' } else { $candidate }
        if (Test-Path -LiteralPath $path -PathType Leaf) { return (Resolve-Path -LiteralPath $path).Path }
    }

    throw @'
CrankMagic Online needs Node.js on the host computer, but node.exe was not found.
Install the current Node.js LTS once with:
  winget install --id OpenJS.NodeJS.LTS --exact
Then close and reopen PowerShell and run this launcher again.
'@
}
$nodePath = Resolve-CrankMagicNode
$logDir = Join-Path $repoRoot 'game/.local/host'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tunnel = $null
if ($RemoteGuests -and -not $GuestPublicOrigin) {
    $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    $cloudflaredPath = if ($cloudflared) { $cloudflared.Source } elseif (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe') { 'C:\Program Files (x86)\cloudflared\cloudflared.exe' } else { $null }
    if (-not $cloudflaredPath) { throw 'Remote guests require cloudflared. Install it with: winget install --id Cloudflare.cloudflared' }
    $tunnelOut = Join-Path $logDir "$stamp-tunnel-out.log"
    $tunnelError = Join-Path $logDir "$stamp-tunnel-error.log"
    $tunnel = Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel','--no-autoupdate','--url',"http://127.0.0.1:$GuestPort") -WindowStyle Hidden -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelError
    for ($attempt = 0; $attempt -lt 60 -and -not $GuestPublicOrigin; $attempt++) {
        if ($tunnel.HasExited) { throw "Guest tunnel exited during startup. Inspect $tunnelError." }
        $text = ((Get-Content $tunnelOut,$tunnelError -Raw -ErrorAction SilentlyContinue) -join "`n")
        $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { $GuestPublicOrigin = $match.Value; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $GuestPublicOrigin) {
        Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
        throw "Guest tunnel did not publish an HTTPS address. Inspect $tunnelError."
    }
}
if ($GuestPublicOrigin) {
    $public = [Uri]$GuestPublicOrigin
    if ($public.Scheme -ne 'https' -or $public.PathAndQuery -ne '/') { throw 'GuestPublicOrigin must be an HTTPS origin without a path, query, or fragment.' }
}
$env:COMMANDER_PORT = "$Port"
$env:COMMANDER_GUEST_PORT = "$GuestPort"
$env:COMMANDER_OPENAI_CREDENTIAL = $OpenAiCredential
$env:COMMANDER_GUEST_PUBLIC_ORIGIN = $GuestPublicOrigin
try {
$child = Start-Process -FilePath $nodePath -ArgumentList 'game/tools/serve-review.mjs' -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "$stamp-out.log") -RedirectStandardError (Join-Path $logDir "$stamp-error.log")
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($child.HasExited) { throw "Host exited during startup. Inspect $logDir/$stamp-error.log." }
    try {
        $health = Invoke-RestMethod "$hostUrl/api/health" -TimeoutSec 1
        if ($health.product -eq 'CrankMagic Online' -and $health.protocol -eq 1) {
            $tunnelPid = if ($tunnel) { $tunnel.Id } else { $null }
            $record = @{pid=$child.Id; port=$Port; guestPort=$GuestPort; guestPublicOrigin=$GuestPublicOrigin; tunnelPid=$tunnelPid; startedAt=(Get-Date).ToString('o'); root=$repoRoot} | ConvertTo-Json
            $record | Set-Content (Join-Path $logDir "host-$Port.json")
            if ($Port -eq 8768) { $record | Set-Content (Join-Path $logDir 'host.json') }
            Write-Output "Ready: $hostUrl/app/#game"
            if ($GuestPublicOrigin) { Write-Output "Remote guest invitations: $GuestPublicOrigin" }
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 300
}
throw "Host did not become ready. Inspect $logDir/$stamp-error.log."
} catch {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    throw
}
