import os
import sys
import time
import platform
from typing import List

from PySide6.QtCore import Qt, QTimer, QProcess, Slot
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QRadioButton, QFileDialog, QProgressBar, QMessageBox
)

APP_NAME = "Konvertierung Audio-Video"


def add_local_bin_to_path():
    base_dirs = []
    if getattr(sys, "frozen", False):
        base_dirs.append(os.path.dirname(sys.executable))
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass and os.path.isdir(meipass):
            base_dirs.append(meipass)
    else:
        base_dirs.append(os.path.dirname(os.path.abspath(__file__)))
    sysname = platform.system().lower()
    cands = []
    for b in base_dirs:
        for sub in ("bin", os.path.join("bin", sysname)):
            p = os.path.join(b, sub)
            if os.path.isdir(p):
                cands.append(p)
    if cands:
        os.environ["PATH"] = os.pathsep.join(cands + [os.environ.get("PATH", "")])


def fmt_dur(sec: int) -> str:
    sec = max(0, int(sec))
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


class Main(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.proc: QProcess | None = None
        self.start_ts: float | None = None
        self.timer = QTimer(self, interval=200)
        self.timer.timeout.connect(self.on_tick)

        v = QVBoxLayout(self)
        v.addWidget(QLabel(f"<b>{APP_NAME}</b>"))
        v.addWidget(QLabel("Konvertierungsart:"))

        hb = QHBoxLayout()
        self.rb_v2mp3 = QRadioButton("Video → MP3")
        self.rb_a2mp3 = QRadioButton("Audio → MP3")
        self.rb_divx = QRadioButton("Video → AVI (DivX)")
        self.rb_v2mp3.setChecked(True)
        for w in (self.rb_v2mp3, self.rb_a2mp3, self.rb_divx):
            hb.addWidget(w)
        v.addLayout(hb)

        hin = QHBoxLayout()
        hin.addWidget(QLabel("Eingabedatei:"))
        self.in_edit = QLineEdit()
        btn_in = QPushButton("…")
        btn_in.clicked.connect(self.pick_input)
        hin.addWidget(self.in_edit)
        hin.addWidget(btn_in)
        v.addLayout(hin)

        hout = QHBoxLayout()
        hout.addWidget(QLabel("Ausgabe (leer=auto):"))
        self.out_edit = QLineEdit()
        hout.addWidget(self.out_edit)
        v.addLayout(hout)

        self.time_lbl = QLabel("00:00:00")
        self.pbar = QProgressBar()
        self.pbar.setRange(0, 0)  # Busy indicator
        v.addWidget(self.time_lbl)
        v.addWidget(self.pbar)

        hb2 = QHBoxLayout()
        self.btn_start = QPushButton("Start")
        self.btn_cancel = QPushButton("Abbrechen")
        self.btn_cancel.setEnabled(False)
        self.btn_start.clicked.connect(self.on_start)
        self.btn_cancel.clicked.connect(self.on_cancel)
        hb2.addWidget(self.btn_start)
        hb2.addWidget(self.btn_cancel)
        v.addLayout(hb2)

    def pick_input(self):
        f, _ = QFileDialog.getOpenFileName(self, "Eingabedatei wählen", "",
                                           "Video/Audio (*.mp4 *.MP4 *.m4a *.M4A *.avi *.AVI *.mkv *.MKV *.mov *.MOV *.mp3 *.wav);;Alle Dateien (*)")
        if f:
            self.in_edit.setText(f)

    def build_cmd(self, mode: str, inp: str, outp: str) -> List[str]:
        if mode == "v2mp3":
            return ["ffmpeg", "-y", "-i", inp, "-vn", "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", outp]
        if mode == "a2mp3":
            return ["ffmpeg", "-y", "-i", inp, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", outp]
        if mode == "divx":
            return [
                "ffmpeg", "-y", "-hwaccel", "auto", "-fflags", "+genpts", "-i", inp,
                "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn",
                "-c:v", "mpeg4", "-vtag", "XVID", "-qscale:v", "7", "-bf", "0", "-mbd", "0", "-g", "250",
                "-me_method", "epzs", "-pix_fmt", "yuv420p", "-threads", "0", "-vsync", "1",
                "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", "-ar", "44100",
                "-f", "avi", "-use_odml", "1", "-max_interleave_delta", "0", "-metadata", "title=film",
                outp
            ]
        raise ValueError("Unknown mode")

    @Slot()
    def on_start(self):
        inp = self.in_edit.text().strip()
        if not inp or not os.path.isfile(inp):
            QMessageBox.critical(self, "Fehler", "Bitte eine gültige Eingabedatei wählen.")
            return
        mode = "divx" if self.rb_divx.isChecked() else ("a2mp3" if self.rb_a2mp3.isChecked() else "v2mp3")
        outp = self.out_edit.text().strip()
        if not outp:
            root, _ = os.path.splitext(inp)
            outp = root + ("_DivX.avi" if mode == "divx" else "_LAME.mp3")

        out_dir = os.path.dirname(outp) or os.path.dirname(inp) or os.getcwd()
        os.makedirs(out_dir, exist_ok=True)

        # Start Prozess
        self.proc = QProcess(self)
        cmd = self.build_cmd(mode, inp, outp)
        self.proc.setProgram(cmd[0])
        self.proc.setArguments(cmd[1:])
        self.proc.setProcessChannelMode(QProcess.MergedChannels)
        self.proc.finished.connect(self.on_finished)

        self.btn_start.setEnabled(False)
        self.btn_cancel.setEnabled(True)
        self.start_ts = time.time()
        self.timer.start()
        self.proc.start()

    @Slot()
    def on_cancel(self):
        if self.proc and self.proc.state() != QProcess.NotRunning:
            self.proc.kill()
        self.timer.stop()
        self.btn_start.setEnabled(True)
        self.btn_cancel.setEnabled(False)

    @Slot(int, QProcess.ExitStatus)
    def on_finished(self, code, status):
        self.timer.stop()
        self.btn_start.setEnabled(True)
        self.btn_cancel.setEnabled(False)
        dur = fmt_dur(int(time.time() - self.start_ts)) if self.start_ts else "00:00:00"
        if code == 0:
            QMessageBox.information(self, "Fertig", f"Konvertierung abgeschlossen in {dur}.")
        elif code == 0x82:
            QMessageBox.information(self, "Abgebrochen", f"Vorgang abgebrochen nach {dur}.")
        else:
            QMessageBox.critical(self, "Fehler", f"Fehler bei der Konvertierung (Dauer {dur}).")

    @Slot()
    def on_tick(self):
        if self.start_ts is not None:
            self.time_lbl.setText(fmt_dur(int(time.time() - self.start_ts)))
        # Busy-Progressbar bleibt animiert


def main():
    add_local_bin_to_path()
    app = QApplication(sys.argv)
    w = Main()
    w.resize(720, 260)
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
