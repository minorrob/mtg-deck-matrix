$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'CrankMagic Online - Start Game.lnk'
$launcher = Join-Path $PSScriptRoot 'launch-crankmagic-online.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$iconDirectory = Join-Path $env:LOCALAPPDATA 'CrankMagicOnline'
$iconPath = Join-Path $iconDirectory 'crankmagic-online.ico'
$logoPath = Join-Path $repoRoot 'assets/crankmagic/apple-touch-icon.png'

New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::FromFile($logoPath)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $bitmap.Dispose() }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -RemoteGuests"
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = 'Start CrankMagic Online and open the Play page.'
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Save()

Write-Output "Created desktop launcher: $shortcutPath"
