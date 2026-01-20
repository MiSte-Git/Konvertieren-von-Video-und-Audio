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

# Visual Studio Build Tools
winget install --id Microsoft.VisualStudio.2022.BuildTools -e

# WebView2 Runtime
winget install --id Microsoft.EdgeWebView2Runtime -e

# WiX (nur fuer MSI)
winget install --id WiXToolset.WiXToolset -e
```

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
