# Opens Windows Sandbox with the freshly built Hub installer (docs/TEST_PLAN_WINDOWS.md).
#
#   npm run dist:win
#   powershell -ExecutionPolicy Bypass -File scripts/sandbox.ps1
#
# The .wsb file is generated in %TEMP% from this checkout's path, so the repository never holds a
# machine-specific path. install\windows is mapped read-only on the sandbox desktop; nothing in
# the sandbox can write back to this computer, and everything is discarded when it closes.

$ErrorActionPreference = 'Stop'

$sandbox = Join-Path $env:WINDIR 'System32\WindowsSandbox.exe'
if (-not (Test-Path $sandbox)) {
  Write-Host 'Windows Sandbox is not enabled. In an administrator PowerShell, run:'
  Write-Host '  Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All'
  Write-Host 'then restart Windows.'
  exit 1
}

$installers = Join-Path (Split-Path $PSScriptRoot -Parent) 'install\windows'
$setup = Get-ChildItem -Path $installers -Filter 'Nebula-Hub-Setup-*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
  Write-Host "No Nebula Hub installer in $installers. Run: npm run dist:win"
  exit 1
}

$config = @"
<Configuration>
  <MemoryInMB>4096</MemoryInMB>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Enable</ClipboardRedirection>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$installers</HostFolder>
      <SandboxFolder>C:\Users\WDAGUtilityAccount\Desktop\Nebula Hub</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
</Configuration>
"@

$wsb = Join-Path $env:TEMP 'nebula-hub-test.wsb'
Set-Content -Path $wsb -Value $config -Encoding utf8
Write-Host "Starting Windows Sandbox with $($setup.Name) on its desktop."
Start-Process -FilePath $wsb
