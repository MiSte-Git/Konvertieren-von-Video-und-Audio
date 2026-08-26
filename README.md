# Konvertierung Audio-Video

Dieses Repository enthält zwei Varianten:

1) Bash-Skript mit Zenity-Oberfläche (Linux): `convert_to_mp3_Lame.sh`
2) Plattformunabhängige GUI (Tauri/Rust): `tauri-app/`

## Tauri GUI (Rust)
Experimental: plattformunabhängige GUI auf Basis von Tauri.

Ordnerstruktur: `tauri-app/`

Voraussetzungen fuer Build/Installer (pro Plattform):
- Windows: Rust, Visual Studio Build Tools, WebView2 Runtime; fuer MSI zusaetzlich WiX
- macOS: Rust, Xcode Command Line Tools
- Linux: Rust, WebKitGTK + systemnahe Abhaengigkeiten (z.B. `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`)

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

Install (portable EXE + Startmenueintrag):
```powershell
powershell .\install-windows.ps1
```

Hinweise (Windows):
- Das Build-Skript installiert Visual Studio Build Tools (C++ Workload) und Rust (cargo) auf Wunsch via winget.
- tauri-cli wird bei Bedarf via cargo installiert.
- WebView2 Runtime muss vorher vorhanden sein.

macOS:
```bash
# Xcode Command Line Tools
xcode-select --install

# Rust
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

ffmpeg bereitstellen:
- Systemweit installieren oder
- im App-Ordner beilegen (z.B. `tauri-app/bin/` oder `tauri-app/bin/<os>`)

Die GUI unterstützt außerdem:
- Videos per Zweipass-H.264-Kodierung auf eine frei wählbare Maximalgröße zu komprimieren (Standard: 100 MB).
- Mehrere Videos in einer änderbaren Reihenfolge ohne Neukodierung zusammenzufügen.
- Das zusammengefügte Video optional anschließend auf die gewählte Maximalgröße zu komprimieren.

Beim Zusammenfügen ohne Komprimierung müssen die Video- und Audiostreams der Quelldateien kompatibel sein.

Preflight-Check (optional):
```bash
tauri-app/scripts/check_deps.sh
```
Windows:
```powershell
tauri-app\\scripts\\check_deps.ps1
```

Start (nach Installation von Rust + tauri-cli):
```bash
cd tauri-app
cargo tauri dev
```
Hinweis: `cargo tauri dev` startet einen lokalen HTTP-Server fuer `tauri-app/ui` auf Port 1420 (via Python 3).

Build (Installer/Bundles):
```bash
cd tauri-app
cargo tauri build
```

Linux: .deb oder .rpm installieren (nach Build):
```bash
# .deb (Debian/Ubuntu)
sudo dpkg -i tauri-app/src-tauri/target/release/bundle/deb/*.deb

# .rpm (Fedora/RHEL/openSUSE)
sudo rpm -i tauri-app/src-tauri/target/release/bundle/rpm/*.rpm
```
Hinweis: Falls Abhaengigkeiten fehlen, danach `sudo apt -f install` (deb) bzw. `sudo dnf -y install` (rpm) ausfuehren.

Windows: EXE bauen und installieren (portable + Startmenueintrag):
```powershell
powershell .\build-windows-app.ps1
powershell .\install-windows.ps1
```
Hinweis: Die EXE liegt nach dem Build unter `tauri-app\src-tauri\target\release\` (z.B. `konvertierung.exe`).

## Bash-Skript (Linux)
Voraussetzungen: `ffmpeg`, `lame`, `zenity`

Installation unter Debian/Ubuntu:
```bash
sudo apt install ffmpeg lame zenity
```

Projektstruktur (Ausschnitt):
```
convert_to_mp3_Lame.sh                     # Bash-Hauptskript
tauri-app/                                  # Tauri GUI (Rust)
```

### Installation des Bash-Skripts
1. Skript ausführbar machen:
   ```bash
   chmod +x convert_to_mp3_Lame.sh
   ```
2. Systemweit nach `/usr/local/bin` installieren (erfordert sudo):
   ```bash
   sudo install -m 755 convert_to_mp3_Lame.sh /usr/local/bin/convert_to_mp3_Lame.sh
   ```
3. Testen, ob das Skript läuft:
   ```bash
   /usr/local/bin/convert_to_mp3_Lame.sh
   ```

## Lizenz
GNU General Public License v3.0 (GPL-3.0). Siehe `LICENSE`.
