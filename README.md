# Konvertierung Audio-Video

Deutsch | [English](README.en.md)

Dieses Repository enthält zwei Varianten:

1) Plattformunabhängige GUI (Tauri/Rust): `tauri-app/`
2) Bash-Skript mit Zenity-Oberfläche (Linux): `convert_to_mp3_Lame.sh`

## Funktionen (GUI)

- Video zu MP3, Audio zu MP3, Video zu AVI (DivX), Video-Ausschnitt
- Die Audiospur eines Videos mit den gewählten Lautstärkeoptionen anpassen, ohne das Video neu zu kodieren.
- Hintergrundgeräusche wie Klimaanlage oder Lüfter reduzieren (Leicht: adaptive FFT-Rauschunterdrückung, Stark: KI-Filter RNNoise für Sprache). Kombinierbar mit der Lautstärkeanpassung, gilt für MP3-Modi und die Audiospur im Video.
- Videos per Zweipass-H.264-Kodierung auf eine frei wählbare Maximalgröße komprimieren (Standard: 100 MB).
- Mehrere Videos in einer änderbaren Reihenfolge ohne Neukodierung zusammenfügen.
- Das zusammengefügte Video optional anschließend auf die gewählte Maximalgröße komprimieren.
- Oberfläche in 10 Sprachen, umschaltbar über die Flaggen oben im Fenster (siehe [Sprachen](#sprachen)).
- Versionsanzeige unter dem Titel und Dialog **Über** mit Version, Lizenz und verwendeten Komponenten.

Beim Zusammenfügen ohne Komprimierung müssen die Video- und Audiostreams der Quelldateien kompatibel sein.

## Sprachen

Die Oberfläche gibt es auf Deutsch, Englisch, Französisch, Italienisch, Russisch, Polnisch, Spanisch, Kroatisch, Niederländisch und Finnisch.
- Beim ersten Start wird die Systemsprache verwendet. Ist sie nicht verfügbar, startet die App auf Englisch.
- Über die Flaggen oberhalb des Titels lässt sich die Sprache jederzeit wechseln. Die Auswahl wird gespeichert (`localStorage`).
- Fehlermeldungen aus dem Rust-Teil kommen als Fehlercodes ans UI und werden dort übersetzt.
- Vorgeschlagene Zieldateinamen verwenden Endungen in der gewählten Sprache (z.B. `_komprimiert`, `_compressed`, `_comprimido`). Ein bereits vorgeschlagener Name wird beim Sprachwechsel angepasst, ein selbst eingetragener nicht.

Neue Sprache hinzufügen (z.B. Portugiesisch):
1. `tauri-app/ui/i18n/de.json` nach `pt.json` kopieren und übersetzen (Platzhalter wie `{count}` beibehalten, Endungen unter `suffix` ohne Leer- und Sonderzeichen).
2. Flagge als `tauri-app/ui/assets/flags/pt.png` (22 px breit) und `pt@2x.png` ablegen.
3. In `tauri-app/ui/app.js` die Liste `LANGUAGES` um `{ code: "pt", name: "Português" }` ergänzen.

Statische Texte im HTML tragen `data-i18n` (bzw. `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-aria-label`), Texte aus JavaScript laufen über `t("schluessel", { param })`. Neue Rust-Fehler mit `app_err("code")` bzw. `app_err_with("code", &[("param", wert)])` erzeugen und den Schlüssel `errors.code` in allen Sprachdateien ergänzen.

## Installation (fertige Installer)

Die Installer liegen unter **Releases** auf GitHub.

| System | Datei | ffmpeg/lame |
|---|---|---|
| Windows | `*_x64-setup.exe` oder `.msi` | enthalten |
| macOS Apple Silicon | `*_aarch64.dmg` | enthalten |
| macOS Intel | `*_x64.dmg` | enthalten |
| Debian/Ubuntu | `.deb` | werden als Abhängigkeit installiert |
| Fedora/openSUSE | `.rpm` | werden als Abhängigkeit installiert |
| Linux (andere) | `.AppImage` | vom System nötig (`ffmpeg`, `lame`) |

Die Installer sind nicht signiert:
- Windows: SmartScreen-Warnung, *Weitere Informationen* > *Trotzdem ausführen*.
- macOS: beim ersten Start Rechtsklick > *Öffnen*. Meldet macOS, die App sei beschädigt:
  `xattr -cr "/Applications/Konvertierung Audio-Video.app"`

Linux `.deb` installieren:
```bash
sudo apt install ./Konvertierung*.deb
```

## Entwicklung (Dev-Modus, ohne Neuinstallieren)

Im Dev-Modus läuft die App direkt aus dem Repo:
- Änderungen an `tauri-app/ui/` (HTML/JS/CSS) werden sofort neu geladen.
- Änderungen an `tauri-app/src-tauri/` (Rust) werden automatisch neu kompiliert und die App startet neu.

Einmalig einen Starter anlegen:

Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev\install-dev-shortcut.ps1
```
Danach im Startmenü **Konvertierung Audio-Video (Dev)** starten (an die Taskleiste anheftbar). Das minimierte Konsolenfenster zeigt die Build-Ausgabe, Schließen beendet die App.

Linux / macOS:
```bash
bash scripts/dev/install-dev-launcher.sh
```
Linux: Eintrag **Konvertierung Audio-Video (Dev)** im Anwendungsmenü, Log unter `~/.cache/konvertierung-dev.log`.
macOS: `~/Applications/Konvertierung Audio-Video (Dev).command`.

Starter entfernen: Skript mit `-Remove` (Windows) bzw. `--remove` (Linux/macOS) aufrufen.

Direkt im Terminal geht auch:
```bash
cd tauri-app
cargo tauri dev
```

Im Dev-Modus werden `ffmpeg`, `ffprobe` und `lame` aus dem `PATH` verwendet, sie müssen also lokal installiert sein. Der erste Start dauert einige Minuten (Kompilieren), danach geht es schnell.

## Release erstellen

Die Version steht nur in `tauri-app/src-tauri/Cargo.toml` (`tauri.conf.json` enthält keine Version). Die App zeigt sie unter dem Titel und im Dialog **Über** an.

Zwischen zwei Releases trägt der Code eine Entwicklungsversion wie `1.2.3-dev`. So ist ein Dev-Build klar von der veröffentlichten Version zu unterscheiden.

1. Alle Änderungen committen, dann das Release-Skript starten:
   ```bash
   scripts/release.sh            # 1.2.3-dev -> Release 1.2.3
   scripts/release.sh 1.3.0      # oder eine bestimmte Version
   ```
   Unter Windows: `scripts\release.ps1` (bzw. `scripts\release.ps1 1.3.0`).

   Das Skript setzt die Version in `Cargo.toml` und `Cargo.lock`, committet `Version 1.2.3`, setzt den Tag `v1.2.3`, stellt auf `1.2.4-dev` um und committet das. Nach Rückfrage pusht es `main` mit dem Tag.
2. GitHub Actions (`.github/workflows/release.yml`) baut alle Installer und legt einen **Release-Entwurf** an.
3. Den Entwurf unter *Releases* prüfen und **veröffentlichen** (Stift-Symbol > *Publish release*). Erst danach bieten installierte Apps das Update an.

Hinweise:
- Release-Versionen sind rein numerisch (`1.2.3`). Der Windows-MSI-Installer (WiX) akzeptiert keine Suffixe wie `-dev`. Bei Entwicklungsversionen bauen `build-windows-app.ps1` und *Run workflow* unter Windows deshalb nur den NSIS-Installer.
- Testversionen stattdessen normal taggen und den Release auf GitHub als *Pre-release* markieren.
- *Re-run* eines Actions-Laufs baut den alten Commit. Nach Änderungen einen neuen Tag setzen oder *Run workflow* nutzen.

Nur bauen ohne Release: *Actions* > *Release* > *Run workflow*. Die Installer liegen dann als Artefakte am Lauf.

Der Workflow lädt ffmpeg/ffprobe (Windows: BtbN-Builds, macOS: ffmpeg.martin-riedl.de) und lame (Windows: MSYS2, macOS: aus den Quellen gebaut) nach `bin/windows/` bzw. `bin/darwin/` und bündelt sie in die App. Die App sucht diese Programme beim Start im Ressourcen-Ordner `bin/<os>/` und sonst im `PATH`.

## Automatische Updates
Die App sucht kurz nach dem Start nach einer neuen Version (im Dev-Modus nicht), manuell unter *Über* > *Nach Updates suchen*. Grundlage ist `latest.json` im neuesten veröffentlichten (nicht Pre-release) GitHub-Release. Updates sind signiert.

Einmalig einrichten:
```bash
cargo tauri signer generate -w ~/.tauri/konvertierung.key
```
- Öffentlichen Schlüssel (`~/.tauri/konvertierung.key.pub`) in `tauri-app/src-tauri/tauri.conf.json` unter `plugins.updater.pubkey` eintragen.
- Inhalt von `~/.tauri/konvertierung.key` als Secret `TAURI_SIGNING_PRIVATE_KEY`, das Passwort als `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` im Repo hinterlegen (Settings > Secrets and variables > Actions).
- Den privaten Schlüssel sicher aufbewahren: ohne ihn können keine Updates mehr ausgeliefert werden.

Die Updater-Dateien (`.sig`, `latest.json`) entstehen nur im CI (`createUpdaterArtifacts` in `src-tauri/ci/*.json`), lokales `cargo tauri build` braucht keinen Schlüssel. Ein Update wird erst angeboten, wenn der Release-Entwurf veröffentlicht ist.

## Lokal bauen

Voraussetzungen (pro Plattform):
- Windows: Rust, Visual Studio Build Tools, WebView2 Runtime; für MSI zusätzlich WiX
- macOS: Rust, Xcode Command Line Tools
- Linux: Rust, WebKitGTK + systemnahe Abhängigkeiten (z.B. `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`)

Install-Beispiele:

Windows (PowerShell, als Administrator):
```powershell
# Rust
winget install --id Rustlang.Rustup -e

# Visual Studio Build Tools (nur C++ Compiler/Linker + Windows SDK, ohne Recommended-Extras -> ca. 6 GB statt 8+ GB)
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"

# WebView2 Runtime
winget install --id Microsoft.EdgeWebView2Runtime -e

# WiX (optional, nur fuer MSI-Installer)
winget install --id WiXToolset.WiXToolset -e
```

Build (Windows, PowerShell):
```powershell
powershell .\build-windows-app.ps1
```
Das Build-Skript installiert Visual Studio Build Tools und Rust auf Wunsch via winget, tauri-cli bei Bedarf via cargo. Die Installer liegen danach unter `tauri-app\src-tauri\target\release\bundle\`.

Portable Installation (EXE + Startmenüeintrag, ohne Setup):
```powershell
powershell .\install-windows.ps1
```

macOS:
```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Linux (Debian/Ubuntu):
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev pkg-config build-essential curl
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Hinweis (Debian 12/Bookworm): `libwebkit2gtk-4.0-dev` scheitert wegen libsoup2.4, bitte `libwebkit2gtk-4.1-dev` verwenden.

Tauri CLI installieren (v2):
```bash
cargo install tauri-cli --version "^2"
```

Preflight-Check (optional):
```bash
tauri-app/scripts/check_deps.sh
```
Windows:
```powershell
tauri-app\scripts\check_deps.ps1
```

Build (Installer/Bundles für das aktuelle System):
```bash
cd tauri-app
cargo tauri build
```
Ohne `--config src-tauri/ci/<os>.json` werden ffmpeg/lame nicht gebündelt, die App nutzt dann die Programme aus dem `PATH`.

## Bash-Skript (Linux)
Voraussetzungen: `ffmpeg`, `lame`, `zenity`

Installation unter Debian/Ubuntu:
```bash
sudo apt install ffmpeg lame zenity
```

Installation des Skripts:
```bash
sudo install -m 755 convert_to_mp3_Lame.sh /usr/local/bin/convert_to_mp3_Lame.sh
/usr/local/bin/convert_to_mp3_Lame.sh
```

## Projektstruktur (Ausschnitt)
```
tauri-app/                     # Tauri GUI (Rust + HTML/JS)
  src-tauri/                   # Rust-Teil, Version in Cargo.toml
  src-tauri/ci/                # Zusatz-Config für CI (ffmpeg/lame bündeln)
  ui/                          # Oberfläche (index.html, app.js, style.css)
  ui/i18n/                     # Sprachdateien (de.json, en.json, ...)
  ui/assets/flags/             # Flaggen für die Sprachauswahl
scripts/dev/                   # Dev-Starter (Windows/Linux/macOS)
scripts/ci/                    # Hilfsskripte für GitHub Actions
.github/workflows/release.yml  # Installer bauen und Release anlegen
convert_to_mp3_Lame.sh         # Bash-Variante
```

## Lizenz
GNU General Public License v3.0 (GPL-3.0). Siehe `LICENSE`.

Mitgelieferte Programme: ffmpeg (GPL, https://ffmpeg.org) und LAME (LGPL, https://lame.sourceforge.io). Die Quellen sind auf den jeweiligen Projektseiten verfügbar.

Flaggen-Icons: [flag-icons](https://github.com/lipis/flag-icons) (MIT), siehe `THIRD_PARTY_LICENSES.md`.
