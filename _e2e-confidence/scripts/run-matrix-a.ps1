param(
  [string]$CdpUrl = 'http://127.0.0.1:9222',
  [string]$AppUrl = 'http://127.0.0.1:8768/app/#game',
  [ValidateSet('A','B','C','D')][string]$Matrix = 'A'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..')
Set-Location $root
if (-not (Test-Path '.\node_modules\puppeteer-core')) {
  Write-Output 'npm install…'
  npm install
}
$env:CM_CDP_URL = $CdpUrl
$env:CM_APP_URL = $AppUrl
$env:CM_MATRIX = $Matrix
Write-Output "Running matrix $Matrix against $AppUrl via $CdpUrl"
node .\scripts\run-matrix.mjs --matrix $Matrix
exit $LASTEXITCODE
