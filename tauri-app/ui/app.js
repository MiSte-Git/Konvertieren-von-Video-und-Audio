const tauriCore = window.__TAURI__?.core;
const dialog = window.__TAURI__?.dialog;
const invoke =
  tauriCore?.invoke ||
  window.__TAURI__?.tauri?.invoke ||
  window.__TAURI_INTERNALS__?.invoke;

const inputPath = document.getElementById("inputPath");
const outputPath = document.getElementById("outputPath");
const clipSection = document.getElementById("clipSection");
const clipStart = document.getElementById("clipStart");
const clipEnd = document.getElementById("clipEnd");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");
const logBtn = document.getElementById("logBtn");
const browseOutputBtn = document.getElementById("browseOutput");
const appEl = document.querySelector(".app");
const progressBar = document.querySelector(".progress-bar");
const tauriEvent = window.__TAURI__?.event;
const listen = tauriEvent?.listen;
const internals = window.__TAURI_INTERNALS__;
let lastAutoOutput = "";
let progressTimer = null;
let totalDurationSec = null;
let selectedInputs = [];
let cancelRequested = false;
let currentBatchIndex = 0;
let currentBatchTotal = 0;

function formatHms(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatElapsedMs(ms) {
  const secs = Math.max(0, Math.round(ms / 1000));
  return formatHms(secs);
}

function parseHmsToSeconds(value) {
  if (!value) return null;
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  return h * 3600 + m * 60 + s;
}

function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "v2mp3";
}

function getClipMode() {
  const checked = document.querySelector('input[name="clipMode"]:checked');
  return checked ? checked.value : "only";
}

function isMp3Mode(mode = getMode()) {
  return mode === "v2mp3" || mode === "a2mp3";
}

function isBatchMp3Mode() {
  return isMp3Mode() && selectedInputs.length > 1;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function batchStatusSuffix() {
  if (currentBatchTotal > 1 && currentBatchIndex > 0) {
    return ` Datei ${currentBatchIndex}/${currentBatchTotal}`;
  }
  return "";
}

function setRunning(running) {
  document.body.classList.toggle("is-running", running);
  if (appEl) {
    appEl.setAttribute("aria-busy", running ? "true" : "false");
  }
  if (!running && progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function splitPath(p) {
  const sep = p.includes("\\") ? "\\" : "/";
  const parts = p.split(sep);
  const base = parts.pop() || "";
  const dir = parts.join(sep);
  return { sep, dir, base };
}

function stripExt(name) {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

function tsSuffix() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function defaultOutput(input, mode, clipMode) {
  if (!input) return "";
  const { dir, base, sep } = splitPath(input);
  const stem = stripExt(base);
  if (mode === "clip") {
    const suffix = clipMode === "minus" ? "minus_clip" : "clip";
    const name = `${stem}_${suffix}_${tsSuffix()}.mp4`;
    return dir ? `${dir}${sep}${name}` : name;
  }
  const ext = mode === "divx" ? "_DivX.avi" : "_LAME.mp3";
  const name = `${stem}${ext}`;
  return dir ? `${dir}${sep}${name}` : name;
}

function setInputSelection(paths) {
  selectedInputs = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (selectedInputs.length > 1) {
    inputPath.value = `${selectedInputs.length} Dateien ausgewählt`;
    inputPath.title = selectedInputs.join("\n");
    return;
  }

  const single = selectedInputs[0] || "";
  inputPath.value = single;
  inputPath.title = single;
}

function getInputList() {
  if (selectedInputs.length > 0) {
    return [...selectedInputs];
  }
  const manualInput = inputPath.value.trim();
  return manualInput ? [manualInput] : [];
}

function updateOutputControls() {
  const disableOutput = isBatchMp3Mode();
  outputPath.disabled = disableOutput;
  browseOutputBtn.disabled = disableOutput;
  outputPath.placeholder = disableOutput
    ? "Wird pro Datei automatisch erzeugt"
    : "Zieldatei (optional)";
  if (disableOutput) {
    outputPath.value = "";
    lastAutoOutput = "";
  }
}

function isTime(value) {
  return /^\d{2}:\d{2}:\d{2}$/.test(value);
}

function updateClipVisibility() {
  const isClip = getMode() === "clip";
  clipSection.classList.toggle("hidden", !isClip);
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatTimeFromMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return "";
  const totalSeconds = Math.floor(ms / 1000000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function updateProgressUI(values) {
  if (!values) return;
  const time = values.out_time || formatTimeFromMs(values.out_time_ms);
  const elapsed =
    values.out_time ? parseHmsToSeconds(values.out_time) : Math.floor(Number(values.out_time_ms || 0) / 1000000);
  const size = values.total_size ? formatBytes(values.total_size) : "";
  const speed = values.speed || "";
  const bitrate = values.bitrate || "";
  const parts = [];
  if (size) parts.push(`size=${size}`);
  if (time) parts.push(`time=${time}`);
  if (bitrate) parts.push(`bitrate=${bitrate}`);
  if (speed) parts.push(`speed=${speed}`);
  const text = parts.length ? parts.join(" ") : "Bitte warten ...";
  if (document.body.classList.contains("is-running")) {
    if (Number.isFinite(totalDurationSec) && Number.isFinite(elapsed)) {
      const total = formatHms(totalDurationSec);
      const done = formatHms(elapsed);
      const remaining = formatHms(Math.max(0, totalDurationSec - elapsed));
      setStatus(`${done} / ${total} (rest ${remaining})${batchStatusSuffix()}`);
    } else {
      setStatus(`${text}${batchStatusSuffix()}`);
    }
  }
  if (progressBar) {
    progressBar.style.opacity = values.progress === "end" ? "0.5" : "1";
  }
}

function startProgressPolling() {
  if (!invoke) return;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(async () => {
    try {
      const values = await invoke("get_progress");
      if (values) {
        updateProgressUI(values);
      }
    } catch {
      // Ignore polling errors.
    }
  }, 400);
}

async function dialogOpen(options = {}) {
  if (dialog?.open) return dialog.open(options);
  if (!invoke) return null;
  return invoke("plugin:dialog|open", { options });
}

async function dialogSave(options = {}) {
  if (dialog?.save) return dialog.save(options);
  if (!invoke) return null;
  return invoke("plugin:dialog|save", { options });
}

async function pickInput() {
  if (!invoke && !dialog?.open) return;
  const mode = getMode();
  const selected = await dialogOpen({
    multiple: isMp3Mode(mode),
    filters: [{ name: "Video/Audio", extensions: ["mp4", "m4a", "avi", "mkv", "mov", "mp3", "wav"] }],
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  setInputSelection(paths);
  updateOutputControls();

  if (paths.length > 1 && isMp3Mode(mode)) {
    setStatus(`${paths.length} Dateien ausgewählt. Ausgabe erfolgt je Datei neben der Quelle.`);
    return;
  }

  const path = paths[0];
  const proposed = defaultOutput(path, getMode(), getClipMode());
  if (!outputPath.value || outputPath.value === lastAutoOutput) {
    outputPath.value = proposed;
  }
  lastAutoOutput = proposed;
}

async function pickOutput() {
  if (!invoke && !dialog?.save) return;
  const fallback = inputPath.value ? defaultOutput(inputPath.value, getMode(), getClipMode()) : "";
  const selected = await dialogSave({
    defaultPath: outputPath.value || fallback || undefined,
  });
  if (!selected) return;
  outputPath.value = selected;
  lastAutoOutput = "";
}

async function start() {
  if (!invoke) return;
  const mode = getMode();
  const inputs = getInputList();
  cancelRequested = false;
  currentBatchIndex = 0;
  currentBatchTotal = 0;

  if (!inputs.length) {
    setStatus(isMp3Mode(mode) ? "Bitte mindestens eine Quelldatei wählen." : "Bitte eine Quelldatei wählen.");
    return;
  }

  const input = inputs[0];
  let output = outputPath.value.trim();

  if (!output) {
    output = defaultOutput(input, mode, getClipMode());
    if (!isBatchMp3Mode()) {
      outputPath.value = output;
    }
  }

  if (mode === "clip") {
    const startedAt = Date.now();
    const start = clipStart.value.trim();
    const end = clipEnd.value.trim();
    if (!start || !end || !isTime(start) || !isTime(end)) {
      setStatus("Bitte Start/Ende im Format HH:MM:SS eingeben.");
      return;
    }
    const clipMode = getClipMode();
    setStatus(clipMode === "minus" ? "Ausschnitt entfernen ..." : "Ausschnitt schneiden ...");
    setRunning(true);
    startProgressPolling();
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    try {
      if (clipMode === "minus") {
        await invoke("remove_clip", { input, output, start, end });
      } else {
        await invoke("clip_media", { input, output, start, end });
      }
      const elapsed = formatElapsedMs(Date.now() - startedAt);
      setStatus(`Fertig in ${elapsed}.`);
    } catch (err) {
      setStatus(cancelRequested ? "Abgebrochen." : `Fehler: ${err}`);
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      setRunning(false);
    }
    return;
  }

  setRunning(true);
  startBtn.disabled = true;
  cancelBtn.disabled = false;

  try {
    if (isMp3Mode(mode) && inputs.length > 1) {
      const startedAt = Date.now();
      currentBatchTotal = inputs.length;
      for (let index = 0; index < inputs.length; index += 1) {
        if (cancelRequested) break;
        const currentInput = inputs[index];
        const currentOutput = defaultOutput(currentInput, mode, getClipMode());
        currentBatchIndex = index + 1;
        totalDurationSec = null;
        try {
          const dur = await invoke("get_media_duration", { input: currentInput });
          if (Number.isFinite(dur) && dur > 0) totalDurationSec = dur;
        } catch {
          totalDurationSec = null;
        }
        if (cancelRequested) break;

        setStatus(`Datei ${currentBatchIndex}/${currentBatchTotal}`);
        startProgressPolling();
        await invoke("convert_media", {
          mode,
          input: currentInput,
          output: currentOutput,
        });
      }

      if (cancelRequested) {
        setStatus("Abgebrochen.");
      } else {
        const elapsed = formatElapsedMs(Date.now() - startedAt);
        setStatus(`${inputs.length} Dateien fertig in ${elapsed}.`);
      }
      return;
    }

    totalDurationSec = null;
    try {
      const dur = await invoke("get_media_duration", { input });
      if (Number.isFinite(dur) && dur > 0) totalDurationSec = dur;
    } catch {
      totalDurationSec = null;
    }
    if (cancelRequested) {
      setStatus("Abgebrochen.");
      return;
    }

    setStatus("Konvertierung läuft ...");
    startProgressPolling();
    const startedAt = Date.now();
    await invoke("convert_media", { mode, input, output });
    const elapsed = formatElapsedMs(Date.now() - startedAt);
    setStatus(`Fertig in ${elapsed}.`);
  } catch (err) {
    setStatus(cancelRequested ? "Abgebrochen." : `Fehler: ${err}`);
  } finally {
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    totalDurationSec = null;
    currentBatchIndex = 0;
    currentBatchTotal = 0;
    setRunning(false);
  }
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    if (selectedInputs.length > 1 && !isMp3Mode(getMode())) {
      setInputSelection(selectedInputs.slice(0, 1));
    }
    updateClipVisibility();
    updateOutputControls();
    const inputs = getInputList();
    if (inputs.length && !isBatchMp3Mode()) {
      const proposed = defaultOutput(inputs[0], getMode(), getClipMode());
      if (!outputPath.value || outputPath.value === lastAutoOutput) {
        outputPath.value = proposed;
      }
      lastAutoOutput = proposed;
    }
  });
}

for (const radio of document.querySelectorAll('input[name="clipMode"]')) {
  radio.addEventListener("change", () => {
    const inputs = getInputList();
    if (inputs.length && !isBatchMp3Mode()) {
      const proposed = defaultOutput(inputs[0], getMode(), getClipMode());
      if (!outputPath.value || outputPath.value === lastAutoOutput) {
        outputPath.value = proposed;
      }
      lastAutoOutput = proposed;
    }
  });
}

updateClipVisibility();
updateOutputControls();

document.getElementById("browseInput").addEventListener("click", pickInput);
document.getElementById("browseOutput").addEventListener("click", pickOutput);
inputPath.addEventListener("input", () => {
  selectedInputs = [];
  inputPath.title = inputPath.value.trim();
  updateOutputControls();
});
outputPath.addEventListener("input", () => {
  lastAutoOutput = "";
});

async function listenEvent(name, handler) {
  if (listen) return listen(name, handler);
  if (!internals?.invoke || !internals?.transformCallback) return null;
  const callback = internals.transformCallback(handler);
  return internals.invoke("plugin:event|listen", {
    event: name,
    target: { kind: "Any" },
    handler: callback,
  });
}

listenEvent("ffmpeg_progress", (event) => {
  const payload = event?.payload?.values || event?.payload || event?.values;
  updateProgressUI(payload);
});
listenEvent("lame_warning", async (event) => {
  const message = event?.payload || "LAME-Prüfung fehlgeschlagen.";
  if (dialog?.message) {
    await dialog.message(message, { title: "LAME-Prüfung", type: "warning" });
    return;
  }
  if (dialog?.alert) {
    await dialog.alert(message);
    return;
  }
  setStatus(`Warnung: ${message}`);
});
startBtn.addEventListener("click", start);
cancelBtn.addEventListener("click", async () => {
  if (!invoke) return;
  cancelRequested = true;
  cancelBtn.disabled = true;
  setStatus("Abbruch wird angefordert ...");
  try {
    await invoke("cancel_current");
    setStatus("Abbruch wird ausgeführt ...");
  } catch (err) {
    setStatus(cancelRequested ? "Abbruch vorgemerkt ..." : `Fehler: ${err}`);
  }
});

logBtn.addEventListener("click", async () => {
  if (!invoke) return;
  try {
    const logPath = await invoke("get_log_path");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(logPath);
    }
    if (dialog?.message) {
      await dialog.message(`Logfile: ${logPath}\n(Pfad wurde kopiert.)`, { title: "Log-Pfad", type: "info" });
      return;
    }
    setStatus(`Logfile: ${logPath}`);
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  }
});
