# Opens Windows Sandbox with the freshly built Hub installer (docs/TEST_PLAN_WINDOWS.md).
#
#   npm run dist:win
#   powershell -ExecutionPolicy Bypass -File scripts/sandbox.ps1              # manual recipe
#   powershell -ExecutionPolicy Bypass -File scripts/sandbox.ps1 -Recipe m4   # automated M4 recipe
#   powershell -ExecutionPolicy Bypass -File scripts/sandbox.ps1 -Recipe m5   # automated [CRITIQUE] tests
#
# The .wsb file is generated in %TEMP% from this checkout's path, so the repository never holds a
# machine-specific path. install\windows and scripts\sandbox are mapped read-only; an automated
# recipe writes its results (JSON, screenshots, logs) to .sandbox\results (git-ignored), the only
# writable folder. Everything else is discarded when the sandbox closes.
param([ValidateSet('manual', 'm4', 'm5')][string]$Recipe = 'manual')

$ErrorActionPreference = 'Stop'

$sandbox = Join-Path $env:WINDIR 'System32\WindowsSandbox.exe'
if (-not (Test-Path $sandbox)) {
  Write-Host 'Windows Sandbox is not enabled. In an administrator PowerShell, run:'
  Write-Host '  Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All'
  Write-Host 'then restart Windows.'
  exit 1
}

$repo = Split-Path $PSScriptRoot -Parent
$installers = Join-Path $repo 'install\windows'
$setup = Get-ChildItem -Path $installers -Filter 'Nebula-Hub-Setup-*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
  Write-Host "No Nebula Hub installer in $installers. Run: npm run dist:win"
  exit 1
}

$folders = @"
    <MappedFolder>
      <HostFolder>$installers</HostFolder>
      <SandboxFolder>C:\Users\WDAGUtilityAccount\Desktop\Nebula Hub</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
"@
$logon = ''
if ($Recipe -ne 'manual') {
  $results = Join-Path $repo '.sandbox\results'
  Remove-Item $results -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $results | Out-Null
  $folders += @"

    <MappedFolder>
      <HostFolder>$(Join-Path $repo 'scripts\sandbox')</HostFolder>
      <SandboxFolder>C:\kit</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$results</HostFolder>
      <SandboxFolder>C:\results</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
"@
  $logon = @"
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\kit\run.ps1 -Recipe $Recipe</Command>
  </LogonCommand>
"@
}

$config = @"
<Configuration>
  <MemoryInMB>4096</MemoryInMB>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Enable</ClipboardRedirection>
  <MappedFolders>
$folders
  </MappedFolders>
$logon</Configuration>
"@

$wsb = Join-Path $env:TEMP "nebula-hub-$Recipe.wsb"
[IO.File]::WriteAllText($wsb, $config, (New-Object Text.UTF8Encoding $false))
Write-Host "Starting Windows Sandbox ($Recipe) with $($setup.Name)."
if ($Recipe -ne 'manual') { Write-Host "Results: $results (done.flag appears at the end)." }
Start-Process -FilePath $wsb
