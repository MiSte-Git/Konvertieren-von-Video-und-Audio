# Erstellt ein Release und stellt danach auf die naechste Entwicklungsversion um.
#
#   scripts\release.ps1            aktuelle Version ohne -dev (1.2.3-dev -> 1.2.3)
#   scripts\release.ps1 1.3.0      bestimmte Version
#
# Ablauf: Version in Cargo.toml/Cargo.lock setzen, committen, Tag vX.Y.Z setzen,
# dann auf X.Y.(Z+1)-dev umstellen und committen. Nach Rueckfrage wird
# main mit dem Tag gepusht. GitHub Actions baut daraufhin den Release-Entwurf.
param([string]$Version = "")

# Exit-Codes von git werden selbst geprueft. "Stop" wuerde in PowerShell 5.1
# bei umgeleitetem stderr von git abbrechen.
$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
$CargoToml = Join-Path $Root "tauri-app\src-tauri\Cargo.toml"
$CargoLock = Join-Path $Root "tauri-app\src-tauri\Cargo.lock"
$Crate = "konvertierung-tauri"
$Branch = "main"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
  Write-Host "Fehler: $Message" -ForegroundColor Red
  exit 1
}

function Invoke-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ') ist fehlgeschlagen." }
}

function Get-CurrentVersion {
  $text = [IO.File]::ReadAllText($CargoToml)
  $m = [regex]::Match($text, '(?m)^version = "([^"]*)"')
  if (-not $m.Success) { Fail "Keine Version in Cargo.toml gefunden." }
  return $m.Groups[1].Value
}

function Set-Version([string]$V) {
  # Nur die erste version-Zeile (Abschnitt [package]).
  $text = [IO.File]::ReadAllText($CargoToml)
  $text = ([regex]'(?m)^version = "[^"]*"').Replace($text, "version = `"$V`"", 1)
  [IO.File]::WriteAllText($CargoToml, $text, $Utf8NoBom)

  # Im Lockfile die version-Zeile direkt nach dem eigenen Paketnamen.
  $lock = [IO.File]::ReadAllText($CargoLock)
  $pattern = '(?m)(^name = "' + [regex]::Escape($Crate) + '"\r?\nversion = ")[^"]*(")'
  $lock = ([regex]$pattern).Replace($lock, '${1}' + $V + '${2}', 1)
  [IO.File]::WriteAllText($CargoLock, $lock, $Utf8NoBom)

  if ((Get-CurrentVersion) -ne $V) { Fail "Version in Cargo.toml konnte nicht gesetzt werden." }
}

Set-Location $Root

$current = Get-CurrentVersion
if (-not $Version) { $Version = $current -replace '-dev$', '' }

$m = [regex]::Match($Version, '^(\d+)\.(\d+)\.(\d+)$')
if (-not $m.Success) { Fail "Version '$Version' ungueltig, erwartet X.Y.Z (nur Zahlen)." }
$next = "{0}.{1}.{2}-dev" -f $m.Groups[1].Value, $m.Groups[2].Value, ([int]$m.Groups[3].Value + 1)
$tag = "v$Version"

if ((git branch --show-current) -ne $Branch) { Fail "Nicht auf Branch $Branch." }
git diff --quiet; $unstaged = $LASTEXITCODE
git diff --cached --quiet; $staged = $LASTEXITCODE
if ($unstaged -ne 0 -or $staged -ne 0) { Fail "Es gibt nicht committete Aenderungen. Bitte zuerst committen." }
git rev-parse -q --verify "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { Fail "Tag $tag existiert bereits lokal." }
git ls-remote --exit-code --tags origin "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { Fail "Tag $tag existiert bereits auf GitHub." }

Write-Host "Aktuelle Version:  $current"
Write-Host "Release:           $Version (Tag $tag)"
Write-Host "Danach weiter mit: $next"
$answer = Read-Host "Fortfahren? [j/N]"
if ($answer -notmatch '^[jJyY]$') { Write-Host "Abgebrochen."; exit 0 }

Set-Version $Version
Invoke-Git add $CargoToml $CargoLock
Invoke-Git commit -q -m "Version $Version"
Invoke-Git tag $tag

Set-Version $next
Invoke-Git add $CargoToml $CargoLock
Invoke-Git commit -q -m "Naechste Entwicklungsversion $next"

Write-Host ""
Write-Host "Lokal erstellt: Commit Version $Version, Tag $tag, Commit $next."
$answer = Read-Host "Jetzt $Branch und $tag zu GitHub pushen? [j/N]"
if ($answer -match '^[jJyY]$') {
  Invoke-Git push origin $Branch $tag
  Write-Host "Gepusht. GitHub Actions baut jetzt den Release-Entwurf."
  Write-Host "Danach auf GitHub unter Releases pruefen und veroeffentlichen."
} else {
  Write-Host "Nicht gepusht. Spaeter mit: git push origin $Branch $tag"
}
