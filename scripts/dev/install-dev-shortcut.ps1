# Legt eine Startmenue-Verknuepfung "Konvertierung Audio-Video (Dev)" an,
# die die App immer aus diesem Repo startet (kein Neuinstallieren bei Code-Aenderungen).
# Die Verknuepfung kann an die Taskleiste angeheftet werden.
# Entfernen: powershell -ExecutionPolicy Bypass -File scripts\dev\install-dev-shortcut.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$Repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$StartScript = Join-Path $Repo "scripts\dev\dev-start.ps1"
$Icon = Join-Path $Repo "tauri-app\src-tauri\icons\icon.ico"
$Programs = [Environment]::GetFolderPath('Programs')
$ShortcutPath = Join-Path $Programs "Konvertierung Audio-Video (Dev).lnk"

if ($Remove) {
  Remove-Item -Force -ErrorAction SilentlyContinue $ShortcutPath
  Write-Host "Entfernt: $ShortcutPath"
  exit 0
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Get-Command powershell.exe).Source
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
$Shortcut.WorkingDirectory = "$Repo"
$Shortcut.WindowStyle = 7  # minimiert
$Shortcut.Description = "Startet die App aus $Repo (cargo tauri dev)"
if (Test-Path $Icon) { $Shortcut.IconLocation = "$Icon,0" }
$Shortcut.Save()

Write-Host "Startmenue-Eintrag angelegt: $ShortcutPath"
Write-Host "Hinweis: Das minimierte Konsolenfenster zeigt die Build-Ausgabe. Schliessen beendet die App."
