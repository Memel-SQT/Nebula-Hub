# Runs INSIDE Windows Sandbox (LogonCommand written by scripts/sandbox.ps1). Installs the Hub from
# the mapped installer folder, starts it with remote debugging, and lets the Hub's own executable
# (as Node) drive a recipe. Everything lands in C:\results, mapped to .sandbox\results on the host.
param([ValidateSet('m4', 'm5')][string]$Recipe = 'm4')

$ErrorActionPreference = 'Continue'
$results = 'C:\results'
New-Item -ItemType Directory -Force $results | Out-Null
Start-Transcript -Path (Join-Path $results 'run-log.txt') -Force
function Note($text) { "$(Get-Date -Format o) $text" | Tee-Object -FilePath (Join-Path $results 'steps.txt') -Append }

$setup = Get-ChildItem 'C:\Users\WDAGUtilityAccount\Desktop\Nebula Hub\Nebula-Hub-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Note "recipe $Recipe, installing $($setup.Name)"
Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait
$hub = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter 'Nebula Hub.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $hub) { Note 'HUB NOT INSTALLED'; New-Item (Join-Path $results 'done.flag') -Force | Out-Null; exit 1 }

function Invoke-Recipe($script, $log) {
  $env:ELECTRON_RUN_AS_NODE = '1'
  $env:RESULTS_DIR = $results
  & $hub.FullName 'C:\kit\cdp.mjs' 9222 "C:\kit\$script" 2>&1 | Tee-Object -FilePath (Join-Path $results $log)
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}

if ($Recipe -eq 'm5') {
  # Finterest 0.1.35, checked against its release latest.yml (R02 applies to the test too).
  $base = 'https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.35'
  $installer = Join-Path $env:TEMP 'Nebula-Finterest-Setup-0.1.35.exe'
  Invoke-WebRequest -UseBasicParsing "$base/Nebula-Finterest-Setup-0.1.35.exe" -OutFile $installer
  $feed = (Invoke-WebRequest -UseBasicParsing "$base/latest.yml").Content
  $expected = ([regex]::Match($feed, '(?m)^sha512:\s*(\S+)')).Groups[1].Value
  $actual = [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($installer)))
  Note "finterest 0.1.35 sha512 match: $($expected -eq $actual)"
  if ($expected -ne $actual) { New-Item (Join-Path $results 'done.flag') -Force | Out-Null; exit 1 }
  Start-Process -FilePath $installer -ArgumentList '/S' -Wait
  # Finterest's own updater would install 0.1.36 by itself on quit: block its network so the
  # update under test is the Hub's.
  $exe = Join-Path $env:LOCALAPPDATA 'Programs\finterest\Nebula Finterest.exe'
  New-NetFirewallRule -DisplayName 'Test: no self-update for Finterest' -Direction Outbound -Program $exe -Action Block | Out-Null
  Note "finterest installed: $(Test-Path $exe)"
}

Start-Process -FilePath $hub.FullName -ArgumentList '--remote-debugging-port=9222'

if ($Recipe -eq 'm4') {
  Invoke-Recipe 'm4.mjs' 'driver.txt'
  # 4.11: restart the Hub — downloads folder emptied, history kept.
  Get-Process 'Nebula Hub' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
  Start-Process -FilePath $hub.FullName -ArgumentList '--remote-debugging-port=9222'
  Invoke-Recipe 'm4-restart.mjs' 'driver-restart.txt'
} else {
  Invoke-Recipe 'm5.mjs' 'driver.txt'
}

foreach ($key in Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall') {
  $p = Get-ItemProperty $key.PSPath
  if ($p.DisplayName -like 'Nebula*') { Note "registry: $($p.DisplayName) $($p.DisplayVersion)" }
}
Note 'done'
Stop-Transcript
New-Item (Join-Path $results 'done.flag') -Force | Out-Null
