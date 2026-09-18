param(
    [switch]$RemoteGuests,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$startScript = Join-Path $PSScriptRoot 'start-crankmagic.ps1'
$playUrl = 'http://127.0.0.1:8768/app/#game'
$hostRecord = Join-Path $repoRoot 'game/.local/host/host.json'

function New-StatusWindow {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'CrankMagic Online'
    $form.Size = New-Object System.Drawing.Size(620, 280)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(16, 25, 40)
    $form.ForeColor = [System.Drawing.Color]::White

    $title = New-Object System.Windows.Forms.Label
    $title.Location = New-Object System.Drawing.Point(28, 24)
    $title.Size = New-Object System.Drawing.Size(540, 34)
    $title.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
    $title.Text = 'CrankMagic Online'
    $form.Controls.Add($title)

    $status = New-Object System.Windows.Forms.Label
    $status.Location = New-Object System.Drawing.Point(30, 78)
    $status.Size = New-Object System.Drawing.Size(540, 38)
    $status.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($status)

    $detail = New-Object System.Windows.Forms.Label
    $detail.Location = New-Object System.Drawing.Point(32, 122)
    $detail.Size = New-Object System.Drawing.Size(540, 58)
    $detail.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $detail.ForeColor = [System.Drawing.Color]::FromArgb(190, 210, 235)
    $form.Controls.Add($detail)

    $openButton = New-Object System.Windows.Forms.Button
    $openButton.Text = 'Open Play'
    $openButton.Location = New-Object System.Drawing.Point(32, 196)
    $openButton.Size = New-Object System.Drawing.Size(128, 36)
    $openButton.Enabled = $false
    $openButton.Add_Click({ Start-Process $playUrl })
    $form.Controls.Add($openButton)

    $copyButton = New-Object System.Windows.Forms.Button
    $copyButton.Text = 'Copy guest link'
    $copyButton.Location = New-Object System.Drawing.Point(170, 196)
    $copyButton.Size = New-Object System.Drawing.Size(140, 36)
    $copyButton.Enabled = $false
    $form.Controls.Add($copyButton)

    $closeButton = New-Object System.Windows.Forms.Button
    $closeButton.Text = 'Close'
    $closeButton.Location = New-Object System.Drawing.Point(444, 196)
    $closeButton.Size = New-Object System.Drawing.Size(128, 36)
    $closeButton.Add_Click({ $form.Close() })
    $form.Controls.Add($closeButton)

    return @{ Form = $form; Status = $status; Detail = $detail; Open = $openButton; Copy = $copyButton }
}

function Set-Status($window, [string]$symbol, [string]$heading, [string]$message, [System.Drawing.Color]$color) {
    $window.Status.Text = "$symbol  $heading"
    $window.Status.ForeColor = $color
    $window.Detail.Text = $message
    $window.Form.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
}

$window = New-StatusWindow
Set-Status $window '●' 'Checking CrankMagic Online…' 'Starting the local rules host and checking the guest gateway.' ([System.Drawing.Color]::FromArgb(255, 210, 90))
$window.Form.Show()

try {
    $launchOutput = if ($RemoteGuests) { & $startScript -RemoteGuests 2>&1 | Out-String } else { & $startScript 2>&1 | Out-String }
    $health = Invoke-RestMethod 'http://127.0.0.1:8768/api/health' -TimeoutSec 5
    if ($health.product -ne 'CrankMagic Online' -or $health.protocol -ne 1) { throw 'The local service did not identify itself as CrankMagic Online.' }

    $guestUrl = $null
    if (Test-Path -LiteralPath $hostRecord) {
        $record = Get-Content -LiteralPath $hostRecord -Raw | ConvertFrom-Json
        $guestUrl = $record.guestPublicOrigin
    }

    # Pre-flight before anyone is invited. The host answers it, so this needs no Node of its own.
    # A blocking problem is worth seeing now rather than after the invitations go out.
    $blocking = $null
    try {
        $doctor = Invoke-RestMethod "http://127.0.0.1:8768/api/doctor" -TimeoutSec 10
        if (-not $doctor.ok) { $blocking = ($doctor.checks | Where-Object { $_.status -eq 'fail' } | ForEach-Object { "$($_.label): $($_.detail)" }) -join '  ' }
    } catch { $blocking = $null }

    $window.Open.Enabled = $true
    if (-not $NoBrowser) { Start-Process $playUrl }

    if ($blocking) {
        Set-Status $window '✕' 'Not ready to host' $blocking ([System.Drawing.Color]::FromArgb(255, 112, 112))
        [void]$window.Form.ShowDialog()
        return
    }

    if ($RemoteGuests -and -not $guestUrl) {
        Set-Status $window '⚠' 'Local game ready; guest link unavailable' 'The Play page is open. Stop the host only after any active game ends, then start again to create a remote guest link.' ([System.Drawing.Color]::FromArgb(255, 210, 90))
    } elseif ($guestUrl) {
        $window.Copy.Enabled = $true
        $window.Copy.Add_Click({ Set-Clipboard -Value $guestUrl; Set-Status $window '✓' 'Ready to play' "Guest link copied: $guestUrl" ([System.Drawing.Color]::FromArgb(94, 220, 148)) })
        Set-Status $window '✓' 'Ready to play' 'Local game and private guest gateway are online. Send invitations from Game setup when your table is ready.' ([System.Drawing.Color]::FromArgb(94, 220, 148))
    } else {
        Set-Status $window '✓' 'Ready to play' 'Local game is online. The Play page is open in your default browser.' ([System.Drawing.Color]::FromArgb(94, 220, 148))
    }
} catch {
    Set-Status $window '✕' 'CrankMagic could not start' $_.Exception.Message ([System.Drawing.Color]::FromArgb(255, 112, 112))
}

[void]$window.Form.ShowDialog()
