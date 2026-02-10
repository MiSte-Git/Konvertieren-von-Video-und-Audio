param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

function Assert-Dir($p, $msg) {
  if (-not (Test-Path $p)) { throw $msg }
}

function Command-Exists($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Prompt-Install($name, $wingetId) {
  $answer = Read-Host "$name fehlt. Soll es per winget installiert werden? (j/N)"
  if ($answer -match '^(j|ja|y|yes)$') {
    if (-not (Command-Exists "winget")) {
      throw "winget nicht gefunden. Bitte $name manuell installieren."
    }
    winget install --id $wingetId -e
  } else {
    throw "$name fehlt. Bitte installieren und erneut ausfuehren."
  }
}

function Ensure-IconIco($pngPath, $icoPath) {
  if (Test-Path $icoPath) { return }
  if (-not (Test-Path $pngPath)) {
    throw "Icon PNG nicht gefunden: $pngPath"
  }
  # Create a minimal ICO that embeds a PNG image (valid for Windows)
  $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
  $fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
  try {
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
      # ICONDIR
      $bw.Write([UInt16]0)  # reserved
      $bw.Write([UInt16]1)  # type = icon
      $bw.Write([UInt16]1)  # count

      # ICONDIRENTRY
      $bw.Write([Byte]0)    # width (0 = 256)
      $bw.Write([Byte]0)    # height (0 = 256)
      $bw.Write([Byte]0)    # color count
      $bw.Write([Byte]0)    # reserved
      $bw.Write([UInt16]1)  # planes
      $bw.Write([UInt16]32) # bit count
      $bw.Write([UInt32]$pngBytes.Length) # bytes in resource
      $bw.Write([UInt32]22) # image offset (6 + 16)

      # PNG data
      $bw.Write($pngBytes)
    } finally {
      $bw.Close()
    }
  } finally {
    $fs.Close()
  }
  Write-Host "Icon erstellt: $icoPath"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TauriDir = Join-Path $ScriptDir "tauri-app"
Assert-Dir $TauriDir "tauri-app Ordner nicht gefunden: $TauriDir"

if (-not (Command-Exists "cargo")) {
  Prompt-Install "Rust (cargo)" "Rustlang.Rustup"
}

if (-not (Command-Exists "cargo")) {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\\bin"
  if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
  }
}

if (-not (Command-Exists "cargo-tauri")) {
  if (Command-Exists "cargo") {
    Write-Host "tauri-cli fehlt. Installiere via cargo..."
    cargo install tauri-cli --version "^2"
  }
}

if (-not (Command-Exists "cargo-tauri")) {
  throw "tauri-cli fehlt. Bitte 'cargo install tauri-cli --version ^2' ausfuehren."
}

Ensure-IconIco (Join-Path $ScriptDir "tauri-app\\src-tauri\\icons\\icon-256.png") `
  (Join-Path $ScriptDir "tauri-app\\src-tauri\\icons\\icon.ico")

Push-Location $TauriDir
try {
  Write-Host "Baue Windows App via Tauri..."
  cargo tauri build
} finally {
  Pop-Location
}
