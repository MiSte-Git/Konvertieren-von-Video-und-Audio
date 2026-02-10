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
  if ($PSScriptRoot) { return $PSScriptRoot }
  $path = $MyInvocation.MyCommand.Path
  if (-not $path) { throw "Scriptpfad konnte nicht ermittelt werden. Bitte aus dem Repo-Root starten." }
  Split-Path -Parent $path
}

function Get-LatestExe($exeDir) {
  return Get-ChildItem -Path $exeDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Get-LameVersion {
  $lameCmd = Get-Command "lame" -ErrorAction SilentlyContinue
  if (-not $lameCmd) { return $null }
  try {
    $out = & $lameCmd.Source --version 2>$null
    if (-not $out) { return $null }
    foreach ($line in $out) {
      if ($line -match 'version\s+([0-9]+(?:\.[0-9]+)*)') {
        return $matches[1]
      }
      if ($line -match 'LAME\s+([0-9]+(?:\.[0-9]+)*)') {
        return $matches[1]
      }
    }
  } catch {
    return $null
  }
  return $null
}

# In Repo-Root arbeiten (wo das Script liegt)
$ScriptDir = Resolve-RepoRoot
Set-Location $ScriptDir

if ([string]::IsNullOrWhiteSpace($SourceExe)) {
  $releaseDir = Join-Path $ScriptDir "tauri-app\\src-tauri\\target\\release"
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

$LameVersion = Get-LameVersion
$DisplayName = if ($LameVersion) {
  "Konvertierung von Video zu Audio (MP3 with Lame $LameVersion and DivX)"
} else {
  "Konvertierung von Video zu Audio (MP3 with Lame and DivX)"
}

$ShortcutDir = Join-Path $Programs $AppName
New-Item -ItemType Directory -Force -Path $ShortcutDir | Out-Null

$ShortcutPath = Join-Path $ShortcutDir "$DisplayName.lnk"
Get-ChildItem -Path $ShortcutDir -Filter "*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Join-Path $InstallDir $ExeName)
$Shortcut.WorkingDirectory = $InstallDir
$IconIco = Join-Path $ScriptDir "tauri-app\\src-tauri\\icons\\icon.ico"
$InstalledIcon = Join-Path $InstallDir "app.ico"
if (Test-Path $IconIco) {
  Copy-Item -Force $IconIco $InstalledIcon
  $Shortcut.IconLocation = "$InstalledIcon,0"
} else {
  $Shortcut.IconLocation = "$($Shortcut.TargetPath),0"
}
$Shortcut.Save()

Write-Host "Installiert nach: $InstallDir"
Write-Host "Startmenü-Eintrag: $ShortcutPath"
