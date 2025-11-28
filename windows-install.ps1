param(
  [string]$AppName = "konvertierung",
  [string]$InstallDir = "C:\\Program Files\\konvertierung"
)

$ErrorActionPreference = 'Stop'

# Quelle prüfen
$exe = Join-Path -Path (Join-Path -Path (Get-Location) -ChildPath 'dist') -ChildPath ("$AppName.exe")
if (-not (Test-Path $exe)) {
  Write-Error "EXE nicht gefunden: $exe. Bitte zuerst pyinstaller-windows.ps1 ausführen."
}

# Installationsverzeichnis erstellen
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Dateien kopieren (EXE und ggf. Datenordner)
Copy-Item -Force -Path $exe -Destination (Join-Path $InstallDir "$AppName.exe")

# Startmenü-Verknüpfung erstellen
$Shell = New-Object -ComObject WScript.Shell
$Programs = [Environment]::GetFolderPath('Programs')
$ShortcutDir = Join-Path $Programs 'Konvertierung'
New-Item -ItemType Directory -Force -Path $ShortcutDir | Out-Null
$ShortcutPath = Join-Path $ShortcutDir 'Konvertierung Audio-Video.lnk'
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Join-Path $InstallDir "$AppName.exe")
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = $Shortcut.TargetPath
$Shortcut.Save()

Write-Host "Installiert nach: $InstallDir"
Write-Host "Startmenü-Eintrag: $ShortcutPath"
Write-Host "Zum Anheften an die Taskleiste: Rechtsklick auf die Verknüpfung → 'An Taskleiste anheften'"
