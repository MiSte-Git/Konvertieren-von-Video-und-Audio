param(
  [string]$AppName = "konvertierung",
  [string]$SourceExe = "",
  [switch]$AllUsers
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

function Assert-File($p, $msg) {
  if (-not (Test-Path $p)) { throw $msg }
}

# In Repo-Root arbeiten (wo das Script liegt)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if ([string]::IsNullOrWhiteSpace($SourceExe)) {
  $SourceExe = Join-Path (Join-Path (Get-Location) "dist") "$AppName.exe"
}
Assert-File $SourceExe "EXE nicht gefunden: $SourceExe. Bitte zuerst pyinstaller-windows.ps1 ausführen."

# Installationsziel
if ($AllUsers) {
  $InstallDir = Join-Path ${env:ProgramFiles} $AppName
} else {
  $InstallDir = Join-Path $env:LOCALAPPDATA $AppName
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Copy EXE
Copy-Item -Force $SourceExe (Join-Path $InstallDir "$AppName.exe")

# Optional: zusätzliche Ordner, falls du zur Laufzeit externe Dateien brauchst
if (Test-Path "bin") {
  Copy-Item -Recurse -Force "bin" (Join-Path $InstallDir "bin")
}

# Startmenü-Verknüpfung
$Shell = New-Object -ComObject WScript.Shell

if ($AllUsers) {
  $Programs = [Environment]::GetFolderPath('CommonPrograms')
} else {
  $Programs = [Environment]::GetFolderPath('Programs')
}

$ShortcutDir = Join-Path $Programs $AppName
New-Item -ItemType Directory -Force -Path $ShortcutDir | Out-Null

$ShortcutPath = Join-Path $ShortcutDir "$AppName.lnk"
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Join-Path $InstallDir "$AppName.exe")
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = $Shortcut.TargetPath
$Shortcut.Save()

Write-Host "Installiert nach: $InstallDir"
Write-Host "Startmenü-Eintrag: $ShortcutPath"
