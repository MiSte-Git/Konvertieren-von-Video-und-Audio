param(
  [string]$AppName = "konvertierung"
)

$ErrorActionPreference = 'Stop'

# Optional: venv aktivieren, falls vorhanden
if (Test-Path .venv\Scripts\Activate.ps1) {
  . .venv\Scripts\Activate.ps1
}

# PyInstaller sicherstellen
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
  Write-Host "Installing pyinstaller..."
  pip install pyinstaller | Out-Null
}

function Copy-FfmpegLicenses {
  $dest = "bin/licenses/ffmpeg"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null

  foreach ($p in @('bin/windows','bin')) {
    if (Test-Path $p) {
      Get-ChildItem -Path $p -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^(license|copying|readme).*' } |
        ForEach-Object { Copy-Item $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue }
    }
  }
}

Copy-FfmpegLicenses

# Build (Onefile, GUI) und bin/ anhängen
pyinstaller --onefile --windowed --name $AppName `
  --hidden-import PySide6 `
  --collect-all PySide6 `
  --add-data "bin;bin" `
  src/app_qt.py

Write-Host "Build fertig: dist/$AppName.exe"
