param(
    [Parameter(Mandatory=$true)][string]$ForgeRoot,
    [Parameter(Mandatory=$true)][string]$JdkRoot,
    [Parameter(Mandatory=$true)][string]$MavenRoot,
    [Parameter(Mandatory=$true)][string]$MavenRepository
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$forgePath = (Resolve-Path -LiteralPath $ForgeRoot).Path
$jdkPath = (Resolve-Path -LiteralPath $JdkRoot).Path
$mavenPath = (Resolve-Path -LiteralPath $MavenRoot).Path
$cachePath = [IO.Path]::GetFullPath($MavenRepository)
$engineLock = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'game/engine-adapter/forge.lock.json') | ConvertFrom-Json
$revision = & git -c "safe.directory=$($forgePath.Replace('\','/'))" -C $forgePath rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $revision.Trim() -ne $engineLock.commit) { throw 'Forge checkout does not match the pinned commit.' }
$changes = & git -c "safe.directory=$($forgePath.Replace('\','/'))" -C $forgePath status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Build the proof from an unchanged pinned Forge checkout.' }
$priorJava = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $jdkPath
    Push-Location -LiteralPath $forgePath
    try {
        & (Join-Path $mavenPath 'bin/mvn.cmd') "-Dmaven.repo.local=$cachePath" -B -ntp -pl forge-gui-desktop -am '-DskipTests' '-Dcheckstyle.skip' package
        if ($LASTEXITCODE -ne 0) { throw "Forge build failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
} finally { $env:JAVA_HOME = $priorJava }
$jar = Join-Path $forgePath "forge-gui-desktop/target/forge-gui-desktop-$($engineLock.version)-jar-with-dependencies.jar"
Get-FileHash -Algorithm SHA256 -LiteralPath $jar
