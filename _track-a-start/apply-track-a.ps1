# Track A: wire lobby-start → live host prepare/start (HP-only, no tip merge)
# machineId: f0b9b3cf-d8c8-4c34-a30a-e889e57e148d
param(
  [string]$Root = 'C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c',
  [string]$Fragment = ''
)
$ErrorActionPreference = 'Stop'

$game = Join-Path $Root 'crankmagic-game.js'
$idx  = Join-Path $Root 'index.html'
$fragPath = if ($Fragment) { $Fragment } else { Join-Path $PSScriptRoot 'lobby-start-bridge.fragment.js' }
if (-not (Test-Path -LiteralPath $game)) { throw "Missing $game" }
if (-not (Test-Path -LiteralPath $fragPath)) { throw "Missing fragment $fragPath" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $game -Destination ($game + ".bak-tracka-$stamp") -Force
Write-Output "Backup: crankmagic-game.js.bak-tracka-$stamp"

$src = Get-Content -Raw -LiteralPath $game
$frag = Get-Content -Raw -LiteralPath $fragPath

$actionOnly = $null
if ($frag -match '(?s)(  actions\["lobby-start"\] = async \(\) => \{[\s\S]*\};)\s*$') {
  $actionOnly = $Matches[1] + "`r`n"
}

if ($src -match 'async function lobbyApi\(' -and $src -match '/api/prepare') {
  Write-Output 'Bridge helpers already present — replacing actions["lobby-start"] only.'
  $pattern = '  actions\["lobby-start"\] = (?:async )?\(\) => \{[\s\S]*?\n  \};\r?\n'
  if (-not $actionOnly) { throw 'Could not extract action from fragment' }
  $src2 = [regex]::Replace($src, $pattern, $actionOnly, 1)
  if ($src2 -eq $src) { throw 'Failed to replace existing lobby-start action' }
  $src = $src2
} else {
  if ($src -notmatch 'startInFlight') {
    $src2 = [regex]::Replace($src, '(function allReadyForStart\s*\()', "let startInFlight = false;`r`n`r`n  `$1", 1)
    if ($src2 -eq $src) {
      $src2 = [regex]::Replace($src, '(function allReadyForStart\s*\()', "let startInFlight = false;`r`n`r`n  `$1", 1)
    }
    $src = $src2
  }
  $pattern = '  actions\["lobby-start"\] = (?:async )?\(\) => \{[\s\S]*?\n  \};\r?\n'
  if (-not [regex]::IsMatch($src, $pattern)) { throw 'actions["lobby-start"] block not found' }
  $src = [regex]::Replace($src, $pattern, ($frag.TrimEnd() + "`r`n`r`n"), 1)
}

if ($src -notmatch '/api/prepare') { throw 'Apply failed: /api/prepare not in game.js' }
if ($src -match 'actions\["lobby-start"\][\s\S]{0,500}This lobby is G0') { throw 'G0 stub still present in lobby-start' }

Set-Content -LiteralPath $game -Value $src -Encoding UTF8 -NoNewline
Write-Output 'Wrote crankmagic-game.js'

if (Test-Path -LiteralPath $idx) {
  Copy-Item -LiteralPath $idx -Destination ($idx + ".bak-tracka-$stamp") -Force
  $html = Get-Content -Raw -LiteralPath $idx
  $html2 = [regex]::Replace($html, 'crankmagic-game\.js\?v=\d+', 'crankmagic-game.js?v=27')
  if ($html2 -eq $html -and $html -notmatch 'crankmagic-game\.js\?v=27') {
    Write-Warning 'index.html had no crankmagic-game.js?v= pin'
  } else {
    Set-Content -LiteralPath $idx -Value $html2 -Encoding UTF8 -NoNewline
    Write-Output 'Bumped index.html → crankmagic-game.js?v=27'
  }
}

Write-Output 'TRACK A apply done. Hard-refresh #game (Ctrl+F5) before Start.'
