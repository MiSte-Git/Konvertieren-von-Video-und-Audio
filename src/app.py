import os
import sys
import time
import platform
import subprocess
import threading
import shutil
from typing import Optional, Tuple
import PySimpleGUI as sg

APP_NAME = "Konvertierung Audio-Video"


def format_duration(total_seconds: int) -> str:
    total = int(max(0, total_seconds))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def add_local_bin_to_path():
    # Erlaubt, ffmpeg/ffprobe beizulegen in ./bin oder ./bin/<os>
    # Unterstützt PyInstaller Onefile (sys._MEIPASS) und normale Ausführung.
    locations = []
    if getattr(sys, "frozen", False):
        locations.append(os.path.dirname(sys.executable))
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass and os.path.isdir(meipass):
            locations.append(meipass)
    else:
        locations.append(os.path.dirname(os.path.abspath(__file__)))

    system = platform.system().lower()
    candidates = []
    for base in locations:
        for sub in ("bin", os.path.join("bin", system)):
            p = os.path.join(base, sub)
            if os.path.isdir(p):
                candidates.append(p)
    if candidates:
        os.environ["PATH"] = os.pathsep.join(candidates + [os.environ.get("PATH", "")])


def which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def can_open_folder() -> Optional[str]:
    # Liefert Kommando zum Öffnen eines Ordners
    sysname = platform.system()
    if sysname == "Windows":
        return "explorer"
    if sysname == "Darwin":
        return "open"
    # Linux/Unix
    return which("xdg-open") and "xdg-open"


def open_folder(folder: str):
    cmd = can_open_folder()
    if not cmd or not folder:
        return
    try:
        subprocess.Popen([cmd, folder], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def run_with_timer(command, shell: bool = False, log_path: Optional[str] = None, cancel_event: Optional[threading.Event] = None) -> Tuple[int, int]:
    # Führt den Prozess aus, tracked Dauer, ermöglicht Abbruch
    start = time.time()
    # stderr in Logdatei (falls angegeben), sonst unterdrücken
    stderr_target = open(log_path, "wb") if log_path else subprocess.DEVNULL
    try:
        proc = subprocess.Popen(
            command,
            shell=shell,
            stdout=subprocess.DEVNULL,
            stderr=stderr_target,
            stdin=subprocess.DEVNULL,
            text=False
        )
    except FileNotFoundError:
        duration = int(time.time() - start)
        if log_path and hasattr(stderr_target, "close"):
            try:
                stderr_target.close()
            except Exception:
                pass
        return 127, duration

    rc = None
    while True:
        if cancel_event and cancel_event.is_set():
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.kill()
            except Exception:
                pass
            rc = 130
            break
        if proc.poll() is not None:
            rc = proc.returncode
            break
        time.sleep(0.1)

    if log_path and hasattr(stderr_target, "close"):
        try:
            stderr_target.close()
        except Exception:
            pass

    duration = int(time.time() - start)
    return rc, duration


def ffprobe_duration_seconds(path: str) -> Optional[int]:
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", path]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True)
        val = out.strip()
        if val:
            secs = int(float(val))
            return secs
    except Exception:
        return None
    return None


def build_commands(mode: str, input_path: str, output_path: str) -> Tuple[list, bool]:
    # Nutzt ffmpeg + libmp3lame direkt (keine separate lame.exe nötig)
    if mode == "v2mp3":
        return ["ffmpeg", "-y", "-i", input_path, "-vn", "-ar", "44100", "-ac", "2",
                "-c:a", "libmp3lame", "-b:a", "192k", output_path], False
    if mode == "a2mp3":
        return ["ffmpeg", "-y", "-i", input_path, "-vn",
                "-c:a", "libmp3lame", "-b:a", "192k", output_path], False
    if mode == "divx":
        cmd = [
            "ffmpeg", "-y", "-hwaccel", "auto", "-fflags", "+genpts", "-i", input_path,
            "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn",
            "-c:v", "mpeg4", "-vtag", "XVID", "-qscale:v", "7", "-bf", "0", "-mbd", "0", "-g", "250",
            "-me_method", "epzs", "-pix_fmt", "yuv420p", "-threads", "0", "-vsync", "1",
            "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", "-ar", "44100",
            "-f", "avi", "-use_odml", "1", "-max_interleave_delta", "0", "-metadata", "title=film",
            output_path
        ]
        return cmd, False
    raise ValueError("Unknown mode")


def default_output_path(mode: str, input_path: str) -> str:
    root, _ = os.path.splitext(input_path)
    if mode in ("v2mp3", "a2mp3"):
        return root + "_LAME.mp3"
    if mode == "divx":
        return root + "_DivX.avi"
    return root + "_out"


def main():
    add_local_bin_to_path()
    try:
        # Kompatibel mit verschiedenen PySimpleGUI-Versionen
        if hasattr(sg, "theme"):
            sg.theme("SystemDefault")
    except Exception:
        pass

    layout = [
        [sg.Text(APP_NAME, font=("Sans", 14, "bold"))],
        [sg.Text("Konvertierungsart:")],
        [sg.Radio("Video zu MP3 (ffmpeg + LAME)", "mode", key="-V2MP3-", default=True),
         sg.Radio("Audio zu MP3 (ffmpeg + LAME)", "mode", key="-A2MP3-"),
         sg.Radio("Video mit DivX zu AVI (Panasonic TV)", "mode", key="-DIVX-")],
        [sg.Text("Eingabedatei:"), sg.Input(key="-IN-"), sg.FileBrowse(file_types=(("Video/Audio", "*.mp4;*.MP4;*.m4a;*.M4A;*.avi;*.AVI;*.mkv;*.MKV;*.mov;*.MOV;*.mp3;*.wav"),))],
        [sg.Text("Ausgabedatei (optional, leer = automatisch):"), sg.Input(key="-OUT-")],
        [sg.HorizontalSeparator()],
        [sg.Button("Start"), sg.Button("Beenden")],
    ]
    win = sg.Window(APP_NAME, layout)

    while True:
        ev, vals = win.read()
        if ev in (sg.WIN_CLOSED, "Beenden"):
            break
        if ev == "Start":
            input_path = (vals.get("-IN-") or "").strip()
            if vals.get("-DIVX-"):
                mode = "divx"
            elif vals.get("-A2MP3-"):
                mode = "a2mp3"
            else:
                mode = "v2mp3"

            if not input_path or not os.path.isfile(input_path):
                sg.popup_error("Bitte eine gültige Eingabedatei wählen.")
                continue

            output_path = (vals.get("-OUT-") or "").strip()
            if not output_path:
                output_path = default_output_path(mode, input_path)

            out_dir = os.path.dirname(output_path) or os.path.dirname(input_path) or os.getcwd()
            if not os.path.isdir(out_dir):
                try:
                    os.makedirs(out_dir, exist_ok=True)
                except Exception as e:
                    sg.popup_error(f"Ausgabeordner kann nicht erstellt werden:\n{e}")
                    continue

            if which("ffmpeg") is None:
                sg.popup_error("ffmpeg wurde nicht gefunden. Bitte installieren oder im PATH bereitstellen.\n(Tipp: ffmpeg/ffprobe im Ordner bin bzw. bin/<os> beilegen.)")
                continue

            log_path = os.path.splitext(output_path)[0] + ".log" if mode == "divx" else None
            cmd, use_shell = build_commands(mode, input_path, output_path)

            # Fortschrittsfenster
            cancel_event = threading.Event()
            prog_layout = [
                [sg.Text("Vorgang:"), sg.Text("", key="-MSG-", size=(50, 1))],
                [sg.Text("Laufzeit:"), sg.Text("00:00:00", key="-T-")],
                [sg.ProgressBar(100, orientation="h", size=(40, 20), key="-P-")],
                [sg.Button("Abbrechen")],
            ]
            msg = {
                "v2mp3": "Konvertiere Video zu MP3 ...",
                "a2mp3": "Konvertiere Audio zu MP3 ...",
                "divx": "Konvertiere Video zu AVI ...",
            }[mode]
            pwin = sg.Window(f"{APP_NAME} - Fortschritt", prog_layout, modal=True, finalize=True)
            pwin["-MSG-"].update(msg)

            start_ts = time.time()
            rc_holder = {"rc": None, "duration": 0}

            def worker():
                rc, duration = run_with_timer(cmd if not use_shell else " ".join(cmd), shell=use_shell, log_path=log_path, cancel_event=cancel_event)
                rc_holder["rc"] = rc
                rc_holder["duration"] = duration

            th = threading.Thread(target=worker, daemon=True)
            th.start()

            # Pulsierender Fortschritt + Timer
            pulse = 0
            while True:
                ev2, _ = pwin.read(timeout=200)
                elapsed = int(time.time() - start_ts)
                pwin["-T-"].update(format_duration(elapsed))
                pulse = (pulse + 5) % 100
                pwin["-P-"].update(pulse)
                if ev2 in (sg.WIN_CLOSED, "Abbrechen"):
                    cancel_event.set()
                    th.join(timeout=5)
                    pwin.close()
                    sg.popup_ok(f"Vorgang abgebrochen nach {format_duration(int(time.time() - start_ts))}.")
                    break
                if rc_holder["rc"] is not None:
                    pwin.close()
                    duration = rc_holder["duration"]
                    rc = rc_holder["rc"]
                    if rc == 0:
                        warn_txt = ""
                        if mode == "divx" and which("ffprobe") is not None:
                            in_s = ffprobe_duration_seconds(input_path)
                            out_s = ffprobe_duration_seconds(output_path)
                            if isinstance(in_s, int) and isinstance(out_s, int):
                                diff = abs(in_s - out_s)
                                if diff > 60:
                                    warn_txt = f"\n\nHinweis: Laufzeiten unterscheiden sich deutlich.\nOriginal: {in_s}s, Ausgabe: {out_s}s.\nLogdatei: {log_path or '—'}"
                        if sg.popup_yes_no(f"Konvertierung abgeschlossen (Dauer: {format_duration(duration)}):\n{output_path}{warn_txt}\n\nAusgabeordner öffnen?") == "Yes":
                            open_folder(os.path.dirname(output_path))
                    elif rc == 130:
                        sg.popup_ok(f"Vorgang abgebrochen nach {format_duration(duration)}.")
                    else:
                        sg.popup_error(f"Fehler bei der Konvertierung! (Dauer: {format_duration(duration)})")
                    break

    win.close()


if __name__ == "__main__":
    main()
