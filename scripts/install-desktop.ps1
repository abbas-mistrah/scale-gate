$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$launcher = Join-Path $projectRoot 'launch-scale-gate.ps1'
$icon = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'SCALE GATE.lnk'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher not found: $launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'SCALE GATE — Enterprise AI Evidence & Scale Decision Engine'
if (Test-Path -LiteralPath $icon) {
  $shortcut.IconLocation = "$icon,0"
}
$shortcut.Save()

Write-Output "Desktop shortcut created: $shortcutPath"
