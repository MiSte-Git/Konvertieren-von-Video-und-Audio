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

function Resolve-RepoRoot {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Get-LatestExe($exeDir) {
  return Get-ChildItem -Path $exeDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

# In Repo-Root arbeiten (wo das Script liegt)
$ScriptDir = Resolve-RepoRoot
Set-Location $ScriptDir

if ([string]::IsNullOrWhiteSpace($SourceExe)) {
  $releaseDir = Join-Path $ScriptDir "tauri-app\\target\\release"
  $latestExe = Get-LatestExe $releaseDir
  if (-not $latestExe) {
    throw "EXE nicht gefunden in $releaseDir. Bitte zuerst in tauri-app 'cargo tauri build' ausführen."
  }
  $SourceExe = $latestExe.FullName
}
Assert-File $SourceExe "EXE nicht gefunden: $SourceExe"

# Installationsziel
if ($AllUsers) {
  $InstallDir = Join-Path ${env:ProgramFiles} $AppName
} else {
  $InstallDir = Join-Path $env:LOCALAPPDATA $AppName
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$ExeName = [System.IO.Path]::GetFileName($SourceExe)
Copy-Item -Force $SourceExe (Join-Path $InstallDir $ExeName)

# Optional: zusätzliche Binärdateien (z.B. ffmpeg) neben die EXE legen
$BinSource = Join-Path $ScriptDir "tauri-app\\bin"
if (Test-Path $BinSource) {
  Copy-Item -Recurse -Force $BinSource (Join-Path $InstallDir "bin")
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
$Shortcut.TargetPath = (Join-Path $InstallDir $ExeName)
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = $Shortcut.TargetPath
$Shortcut.Save()

Write-Host "Installiert nach: $InstallDir"
Write-Host "Startmenü-Eintrag: $ShortcutPath"
