param(
  [string]$AppName = "konvertierung",
  [ValidateSet("qt","sg")]
  [string]$Ui = "qt",
  [string]$VenvDir = ".venv",
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

function Assert-Cmd($name, $msg) { if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw $msg } }
function Assert-File($p, $msg) { if (-not (Test-Path $p)) { throw $msg } }

# Admin-Warnung (PyInstaller will künftig blocken)
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "WARN: Bitte PyInstaller/Build NICHT als Admin ausführen (nur Install ggf. als Admin)."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# UI-Auswahl -> Entry + Required pip packages
if ($Ui -eq "qt") {
  $EntryScript = "src\app_qt.py"
  $RequiredPkgs = @("PySide6")
  $PyInstallerExtras = @()   # WICHTIG: erstmal leer lassen
} else {
  $EntryScript = "src\app.py"
  $RequiredPkgs = @("PySimpleGUI")
  $PyInstallerExtras = @()
}

Assert-File $EntryScript "Entry-Script nicht gefunden: $EntryScript"

# Optional: .env nur für Build (NICHT einpacken)
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      $k = $matches[1]
      $v = $matches[2].Trim().Trim("'`"")
      [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
  }
}

if ($Clean) {
  if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
  if (Test-Path "dist")  { Remove-Item -Recurse -Force "dist" }
  if (Test-Path "$AppName.spec") { Remove-Item -Force "$AppName.spec" }
}

Assert-Cmd python "python nicht gefunden. Python 3 installieren und 'Add to PATH' aktivieren."

# venv sicherstellen (ohne Activate)
$Py = Join-Path $VenvDir "Scripts\python.exe"
$Pip = Join-Path $VenvDir "Scripts\pip.exe"
$PyInstaller = Join-Path $VenvDir "Scripts\pyinstaller.exe"

if (-not (Test-Path $Py)) {
  Write-Host "Erstelle venv: $VenvDir"
  python -m venv $VenvDir
}
Assert-File $Py "venv python nicht gefunden: $Py"
Assert-File $Pip "venv pip nicht gefunden: $Pip"

Write-Host "Python (venv):"
& $Py -c "import sys; print(sys.executable)"

# pip tooling updaten
& $Py -m pip install --upgrade pip setuptools wheel | Out-Null

# requirements.txt installieren (wenn vorhanden)
if (Test-Path "requirements.txt") {
  Write-Host "Installiere requirements.txt"
  & $Pip install -r requirements.txt
}

# fehlende RequiredPkgs ergänzen
foreach ($p in $RequiredPkgs) {
  & $Pip show $p *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Installiere fehlendes Paket: $p"
    & $Pip install $p
  }
}

# pyinstaller sicherstellen (in venv)
if (-not (Test-Path $PyInstaller)) {
  Write-Host "Installiere pyinstaller"
  & $Pip install pyinstaller
}
Assert-File $PyInstaller "pyinstaller nicht gefunden in venv: $PyInstaller"

# Konsistenz prüfen
Write-Host "pip check..."
& $Pip check

# bin/ in EXE mitnehmen (dein Code sucht bin und bin/<os> zur Laufzeit)
$addDataArgs = @()
if (Test-Path "bin") { $addDataArgs = @("--add-data", "bin;bin") }

# Build
Write-Host "Baue EXE..."
& $PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name $AppName `
  @PyInstallerExtras `
  @addDataArgs `
  $EntryScript

$exe = Join-Path "dist" "$AppName.exe"
Assert-File $exe "Build fehlgeschlagen, EXE nicht gefunden: $exe"
Write-Host "OK: $exe"
