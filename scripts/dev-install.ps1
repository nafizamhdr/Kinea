# Kinea dev-install (Windows).
# 1. Enables unsigned CEP extensions for CSXS 9 (PlayerDebugMode = 1).
# 2. Symlinks (preferred) or copies this repo into the per-user CEP
#    extensions folder so After Effects loads it from Window > Extensions > Kinea.
#
# Run from the repo root in an ELEVATED PowerShell (symlinks need admin),
# or it will fall back to copying:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-install.ps1
#
# Restart After Effects afterwards.

$ErrorActionPreference = "Stop"

$repoRoot   = Split-Path -Parent $PSScriptRoot
$bundleId   = "com.kinea.extension"
$extRoot    = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$target     = Join-Path $extRoot $bundleId

Write-Host "Repo:    $repoRoot"
Write-Host "Target:  $target"

# --- 1. PlayerDebugMode (allow unsigned extensions in dev) ---
# Set across CSXS 9..12 so it works whether the dev runs AE 2020 (CSXS 9)
# or AE 2021/2022+ (CSXS 10/11/12).
foreach ($csxs in 9, 10, 11, 12) {
  $csxsKey = "HKCU:\Software\Adobe\CSXS.$csxs"
  if (-not (Test-Path $csxsKey)) { New-Item -Path $csxsKey -Force | Out-Null }
  Set-ItemProperty -Path $csxsKey -Name "PlayerDebugMode" -Value "1" -Type String
}
Write-Host "PlayerDebugMode=1 set for CSXS.9 through CSXS.12"

# --- 2. Link or copy the extension into the CEP extensions dir ---
if (-not (Test-Path $extRoot)) { New-Item -ItemType Directory -Path $extRoot -Force | Out-Null }

if (Test-Path $target) {
  Remove-Item -Path $target -Recurse -Force
  Write-Host "Removed existing install."
}

try {
  New-Item -ItemType SymbolicLink -Path $target -Target $repoRoot -ErrorAction Stop | Out-Null
  Write-Host "Symlinked extension -> repo (live; edits reflect on AE restart)."
} catch {
  Write-Warning "Symlink failed (need admin?). Copying instead."
  Copy-Item -Path $repoRoot -Destination $target -Recurse -Force
  Write-Host "Copied extension into CEP folder."
}

Write-Host ""
Write-Host "Done. Restart After Effects, then open Window > Extensions > Kinea."
