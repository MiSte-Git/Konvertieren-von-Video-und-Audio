# Konvertierung Audio-Video

[Deutsch](README.md) | English

This repository contains two variants:

1) Cross-platform GUI (Tauri/Rust): `tauri-app/`
2) Bash script with a Zenity interface (Linux): `convert_to_mp3_Lame.sh`

## Features (GUI)

- Video to MP3, audio to MP3, video to AVI (DivX), video clip
- Adjust the audio track of a video with the selected volume options without re-encoding the video.
- Compress videos to a freely selectable maximum size using two-pass H.264 encoding (default: 100 MB).
- Join several videos in a changeable order without re-encoding.
- Optionally compress the joined video to the selected maximum size afterwards.
- User interface in German and English, switchable via the flags at the top of the window (see [Languages](#languages)).
- Version shown below the title and an **About** dialog with version, license and components used.

When joining without compression, the video and audio streams of the source files must be compatible.

## Languages

The user interface is available in German and English.
- On first start the system language is used. If it is not available, the app starts in English.
- The flags above the title switch the language at any time. The choice is saved (`localStorage`).
- Error messages from the Rust side are sent to the UI as error codes and translated there.

Adding a language (e.g. Spanish):
1. Copy `tauri-app/ui/i18n/en.json` to `es.json` and translate it (keep placeholders such as `{count}`).
2. Add the flag as `tauri-app/ui/assets/flags/es.png` (22 px wide) and `es@2x.png`.
3. Add `{ code: "es", name: "Español" }` to the `LANGUAGES` list in `tauri-app/ui/app.js`.

Static texts in the HTML carry `data-i18n` (or `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-aria-label`); texts set from JavaScript use `t("key", { param })`. Create new Rust errors with `app_err("code")` or `app_err_with("code", &[("param", value)])` and add the key `errors.code` to every language file.

## Installation (ready-made installers)

The installers are available under **Releases** on GitHub.

| System | File | ffmpeg/lame |
|---|---|---|
| Windows | `*_x64-setup.exe` or `.msi` | included |
| macOS Apple Silicon | `*_aarch64.dmg` | included |
| macOS Intel | `*_x64.dmg` | included |
| Debian/Ubuntu | `.deb` | installed as dependencies |
| Fedora/openSUSE | `.rpm` | installed as dependencies |
| Linux (other) | `.AppImage` | required on the system (`ffmpeg`, `lame`) |

The installers are not signed:
- Windows: SmartScreen warning, *More info* > *Run anyway*.
- macOS: on first start right-click > *Open*. If macOS reports the app is damaged:
  `xattr -cr "/Applications/Konvertierung Audio-Video.app"`

Install the Linux `.deb`:
```bash
sudo apt install ./Konvertierung*.deb
```

## Development (dev mode, no reinstall)

In dev mode the app runs directly from the repository:
- Changes to `tauri-app/ui/` (HTML/JS/CSS) are reloaded immediately.
- Changes to `tauri-app/src-tauri/` (Rust) are recompiled automatically and the app restarts.

Create a launcher once:

Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev\install-dev-shortcut.ps1
```
Then start **Konvertierung Audio-Video (Dev)** from the Start menu (can be pinned to the taskbar). The minimized console window shows the build output; closing it quits the app.

Linux / macOS:
```bash
bash scripts/dev/install-dev-launcher.sh
```
Linux: entry **Konvertierung Audio-Video (Dev)** in the application menu, log at `~/.cache/konvertierung-dev.log`.
macOS: `~/Applications/Konvertierung Audio-Video (Dev).command`.

Remove the launcher: run the script with `-Remove` (Windows) or `--remove` (Linux/macOS).

Directly in a terminal also works:
```bash
cd tauri-app
cargo tauri dev
```

In dev mode `ffmpeg`, `ffprobe` and `lame` are taken from the `PATH`, so they must be installed locally. The first start takes a few minutes (compiling), after that it is fast.

## Creating a release

1. Bump the version in `tauri-app/src-tauri/Cargo.toml`. This is the only place for the version: `tauri.conf.json` contains no version, and the app shows the version from `Cargo.toml` below the title and in the **About** dialog.
2. Commit, then create and push a tag. The tag must match the version (`v` + version from `Cargo.toml`):
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
3. GitHub Actions (`.github/workflows/release.yml`) builds all installers and creates a **draft release**. Review it and publish it under *Releases*.

Notes:
- Use numeric versions only (`0.3.0`, not `0.3.0-beta.1`). The Windows MSI installer (WiX) does not accept pre-release suffixes, the build fails otherwise.
- For test builds, tag normally and mark the release on GitHub as *Pre-release* instead.
- *Re-run* of an Actions run builds the old commit. After changes, push a new tag or use *Run workflow*.

Build only, without a release: *Actions* > *Release* > *Run workflow*. The installers are then attached to the run as artifacts.

The workflow downloads ffmpeg/ffprobe (Windows: BtbN builds, macOS: ffmpeg.martin-riedl.de) and lame (Windows: MSYS2, macOS: built from source) into `bin/windows/` or `bin/darwin/` and bundles them into the app. On start the app looks for these programs in the resource folder `bin/<os>/` and otherwise in the `PATH`.

## Building locally

Requirements (per platform):
- Windows: Rust, Visual Studio Build Tools, WebView2 Runtime; WiX additionally for MSI
- macOS: Rust, Xcode Command Line Tools
- Linux: Rust, WebKitGTK + system dependencies (e.g. `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`)

Install examples:

Windows (PowerShell, as administrator):
```powershell
# Rust
winget install --id Rustlang.Rustup -e

# Visual Studio Build Tools (C++ compiler/linker + Windows SDK only, without recommended extras -> approx. 6 GB instead of 8+ GB)
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"

# WebView2 Runtime
winget install --id Microsoft.EdgeWebView2Runtime -e

# WiX (optional, only for the MSI installer)
winget install --id WiXToolset.WiXToolset -e
```

Build (Windows, PowerShell):
```powershell
powershell .\build-windows-app.ps1
```
The build script optionally installs Visual Studio Build Tools and Rust via winget, and tauri-cli via cargo if needed. The installers are then located in `tauri-app\src-tauri\target\release\bundle\`.

Portable installation (EXE + Start menu entry, without setup):
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
Note (Debian 12/Bookworm): `libwebkit2gtk-4.0-dev` fails because of libsoup2.4, please use `libwebkit2gtk-4.1-dev`.

Install the Tauri CLI (v2):
```bash
cargo install tauri-cli --version "^2"
```

Preflight check (optional):
```bash
tauri-app/scripts/check_deps.sh
```
Windows:
```powershell
tauri-app\scripts\check_deps.ps1
```

Build (installers/bundles for the current system):
```bash
cd tauri-app
cargo tauri build
```
Without `--config src-tauri/ci/<os>.json` ffmpeg/lame are not bundled; the app then uses the programs from the `PATH`.

## Bash script (Linux)
Requirements: `ffmpeg`, `lame`, `zenity`

Installation on Debian/Ubuntu:
```bash
sudo apt install ffmpeg lame zenity
```

Installing the script:
```bash
sudo install -m 755 convert_to_mp3_Lame.sh /usr/local/bin/convert_to_mp3_Lame.sh
/usr/local/bin/convert_to_mp3_Lame.sh
```

## Project structure (excerpt)
```
tauri-app/                     # Tauri GUI (Rust + HTML/JS)
  src-tauri/                   # Rust part, version in Cargo.toml
  src-tauri/ci/                # Extra config for CI (bundle ffmpeg/lame)
  ui/                          # User interface (index.html, app.js, style.css)
  ui/i18n/                     # Language files (de.json, en.json)
  ui/assets/flags/             # Flags for the language selection
scripts/dev/                   # Dev launchers (Windows/Linux/macOS)
scripts/ci/                    # Helper scripts for GitHub Actions
.github/workflows/release.yml  # Build installers and create release
convert_to_mp3_Lame.sh         # Bash variant
```

## License
GNU General Public License v3.0 (GPL-3.0). See `LICENSE`.

Bundled programs: ffmpeg (GPL, https://ffmpeg.org) and LAME (LGPL, https://lame.sourceforge.io). The sources are available on the respective project pages.

Flag icons: [flag-icons](https://github.com/lipis/flag-icons) (MIT), see `THIRD_PARTY_LICENSES.md`.
