# Startet die App im Entwicklungsmodus direkt aus dem Repo (Windows).
# UI-Aenderungen (tauri-app\ui) werden live neu geladen,
# Rust-Aenderungen (tauri-app\src-tauri) werden automatisch neu kompiliert.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$Repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Host.UI.RawUI.WindowTitle = "Konvertierung Audio-Video (Dev) - Fenster schliessen beendet die App"

try {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
    $env:PATH = "$cargoBin;$env:PATH"
  }
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo nicht gefunden. Bitte zuerst build-windows-app.ps1 ausfuehren oder Rust installieren."
  }
  & cargo tauri --version *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "tauri-cli fehlt, installiere via cargo ..."
    cargo install tauri-cli --version "^2" --locked
  }

  Set-Location (Join-Path $Repo "tauri-app")
  cargo tauri dev
  if ($LASTEXITCODE -ne 0) { throw "cargo tauri dev beendet mit Exit-Code $LASTEXITCODE" }
} catch {
  Write-Host ""
  Write-Host "FEHLER: $_" -ForegroundColor Red
  Read-Host "Enter zum Schliessen"
  exit 1
}
