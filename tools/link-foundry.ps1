# Link the system folder into the Foundry data directory (development setup).
# Usage: powershell -ExecutionPolicy Bypass -File tools/link-foundry.ps1 [-DataPath "C:\...\FoundryVTT\Data"]
param(
  [string]$DataPath = "$env:LOCALAPPDATA\FoundryVTT\Data"
)

$source = Join-Path (Split-Path -Parent $PSScriptRoot) "swordworld25"
$target = Join-Path $DataPath "systems\swordworld25"

if (-not (Test-Path (Join-Path $DataPath "systems"))) {
  Write-Error "Foundry systems folder not found: $DataPath\systems"
  exit 1
}
if (Test-Path $target) {
  $item = Get-Item $target -Force
  if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") {
    Write-Host "Link already exists: $target -> $($item.Target)"
    exit 0
  }
  Write-Error "$target exists and is not a link. Remove it first."
  exit 1
}
New-Item -ItemType Junction -Path $target -Target $source | Out-Null
Write-Host "Linked $target -> $source"
