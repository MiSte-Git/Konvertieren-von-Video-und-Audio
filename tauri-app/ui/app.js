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
const appEl = document.querySelector(".app");
const progressBar = document.querySelector(".progress-bar");
const tauriEvent = window.__TAURI__?.event;
const listen = tauriEvent?.listen;
const internals = window.__TAURI_INTERNALS__;
let lastAutoOutput = "";
let progressTimer = null;
let totalDurationSec = null;

function formatHms(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

function setStatus(text) {
  statusEl.textContent = text;
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
      setStatus(`${done} / ${total} (rest ${remaining})`);
    } else {
      setStatus(text);
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
  const selected = await dialogOpen({
    multiple: false,
    filters: [{ name: "Video/Audio", extensions: ["mp4", "m4a", "avi", "mkv", "mov", "mp3", "wav"] }],
  });
  if (!selected) return;
  const path = Array.isArray(selected) ? selected[0] : selected;
  inputPath.value = path;
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
  const input = inputPath.value.trim();
  let output = outputPath.value.trim();

  if (!input) {
    setStatus("Bitte eine Quelldatei wählen.");
    return;
  }

  if (!output) {
    output = defaultOutput(input, mode, getClipMode());
    outputPath.value = output;
  }

  if (mode === "clip") {
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
      setStatus("Fertig.");
    } catch (err) {
      setStatus(`Fehler: ${err}`);
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      setRunning(false);
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

  setStatus("Konvertierung läuft ...");
  setRunning(true);
  startProgressPolling();
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  try {
    await invoke("convert_media", { mode, input, output });
    setStatus("Fertig.");
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  } finally {
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    totalDurationSec = null;
    setRunning(false);
  }
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    updateClipVisibility();
    if (inputPath.value) {
      const proposed = defaultOutput(inputPath.value, getMode(), getClipMode());
      if (!outputPath.value || outputPath.value === lastAutoOutput) {
        outputPath.value = proposed;
      }
      lastAutoOutput = proposed;
    }
  });
}

for (const radio of document.querySelectorAll('input[name="clipMode"]')) {
  radio.addEventListener("change", () => {
    if (inputPath.value) {
      const proposed = defaultOutput(inputPath.value, getMode(), getClipMode());
      if (!outputPath.value || outputPath.value === lastAutoOutput) {
        outputPath.value = proposed;
      }
      lastAutoOutput = proposed;
    }
  });
}

updateClipVisibility();

document.getElementById("browseInput").addEventListener("click", pickInput);
document.getElementById("browseOutput").addEventListener("click", pickOutput);
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
  cancelBtn.disabled = true;
  setStatus("Abbruch wird angefordert ...");
  try {
    await invoke("cancel_current");
    setStatus("Abgebrochen.");
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  } finally {
    setRunning(false);
  }
});
