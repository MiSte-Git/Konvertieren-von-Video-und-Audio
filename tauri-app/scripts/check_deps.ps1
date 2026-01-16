$missing = $false

function Write-Ok {
  param([string]$Text)
  Write-Host "OK: $Text" -ForegroundColor Green
}

function Write-Miss {
  param([string]$Text)
  Write-Host "Fehlt: $Text" -ForegroundColor Red
}

function Write-Note {
  param([string]$Text)
  Write-Host "Hinweis: $Text" -ForegroundColor Yellow
}

function Check-Command {
  param([string]$Name)
  if (Get-Command $Name -ErrorAction SilentlyContinue) {
    Write-Ok $Name
  } else {
    Write-Miss $Name
    $script:missing = $true
  }
}

Check-Command rustc
Check-Command cargo
Check-Command ffmpeg
Check-Command cargo-tauri
try {
  $verOut = & cargo tauri --version 2>$null
  if ($verOut -match "([0-9]+)\.([0-9]+)\.([0-9]+)") {
    $major = [int]$matches[1]
    if ($major -lt 2) {
      Write-Miss "tauri-cli $($matches[0]) erkannt, fuer dieses Projekt wird v2 benoetigt"
      $missing = $true
    } else {
      Write-Ok "tauri-cli $($matches[0])"
    }
  } else {
    Write-Note "tauri-cli Version konnte nicht ermittelt werden"
  }
} catch {
  Write-Note "tauri-cli Version konnte nicht ermittelt werden"
}

if (-not (Get-Command cl -ErrorAction SilentlyContinue)) {
  Write-Miss "Visual Studio Build Tools (cl.exe)"
  $missing = $true
} else {
  Write-Ok "Visual Studio Build Tools"
}

$webviewPaths = @(
  "$Env:ProgramFiles\Microsoft\EdgeWebView\Application\msedgewebview2.exe",
  "$Env:ProgramFiles(x86)\Microsoft\EdgeWebView\Application\msedgewebview2.exe"
)
$webviewFound = $false
foreach ($p in $webviewPaths) {
  if (Test-Path $p) {
    $webviewFound = $true
    break
  }
}
if (-not $webviewFound) {
  $regPaths = @(
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"
  )
  foreach ($rp in $regPaths) {
    if (Test-Path $rp) {
      $keys = Get-ChildItem $rp -ErrorAction SilentlyContinue
      foreach ($k in $keys) {
        $name = (Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue).name
        if ($name -like "*WebView2 Runtime*") {
          $webviewFound = $true
          break
        }
      }
    }
    if ($webviewFound) { break }
  }
}
if ($webviewFound) {
  Write-Ok "WebView2 Runtime"
} else {
  Write-Miss "WebView2 Runtime"
  $missing = $true
}

if ((Get-Command candle -ErrorAction SilentlyContinue) -or (Get-Command light -ErrorAction SilentlyContinue)) {
  Write-Ok "WiX Toolset"
} else {
  Write-Note "WiX Toolset fehlt (nur fuer MSI erforderlich)"
}

if (-not $missing) {
  Write-Ok "Alle erforderlichen Abhaengigkeiten sind vorhanden."
  exit 0
}

Write-Miss "Es fehlen Abhaengigkeiten."
exit 1
