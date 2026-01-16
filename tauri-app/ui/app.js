const tauri = window.__TAURI__?.tauri;
const dialog = window.__TAURI__?.dialog;

const inputPath = document.getElementById("inputPath");
const outputPath = document.getElementById("outputPath");
const clipSection = document.getElementById("clipSection");
const clipStart = document.getElementById("clipStart");
const clipEnd = document.getElementById("clipEnd");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");

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

async function pickInput() {
  if (!dialog) return;
  const selected = await dialog.open({
    multiple: false,
    filters: [{ name: "Video/Audio", extensions: ["mp4", "m4a", "avi", "mkv", "mov", "mp3", "wav"] }],
  });
  if (!selected) return;
  const path = Array.isArray(selected) ? selected[0] : selected;
  inputPath.value = path;
  if (!outputPath.value) {
    outputPath.value = defaultOutput(path, getMode(), getClipMode());
  }
}

async function pickOutput() {
  if (!dialog) return;
  const selected = await dialog.save();
  if (!selected) return;
  outputPath.value = selected;
}

async function start() {
  if (!tauri) return;
  const mode = getMode();
  const input = inputPath.value.trim();
  let output = outputPath.value.trim();

  if (!input) {
    setStatus("Bitte eine Quelldatei waehlen.");
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
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    try {
      if (clipMode === "minus") {
        await tauri.invoke("remove_clip", { input, output, start, end });
      } else {
        await tauri.invoke("clip_media", { input, output, start, end });
      }
      setStatus("Fertig.");
    } catch (err) {
      setStatus(`Fehler: ${err}`);
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
    }
    return;
  }

  setStatus("Konvertierung laeuft ...");
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  try {
    await tauri.invoke("convert_media", { mode, input, output });
    setStatus("Fertig.");
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  } finally {
    startBtn.disabled = false;
    cancelBtn.disabled = true;
  }
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    updateClipVisibility();
    if (!outputPath.value && inputPath.value) {
      outputPath.value = defaultOutput(inputPath.value, getMode(), getClipMode());
    }
  });
}

for (const radio of document.querySelectorAll('input[name="clipMode"]')) {
  radio.addEventListener("change", () => {
    if (!outputPath.value && inputPath.value) {
      outputPath.value = defaultOutput(inputPath.value, getMode(), getClipMode());
    }
  });
}

updateClipVisibility();

document.getElementById("browseInput").addEventListener("click", pickInput);
document.getElementById("browseOutput").addEventListener("click", pickOutput);
startBtn.addEventListener("click", start);
cancelBtn.addEventListener("click", async () => {
  if (!tauri) return;
  cancelBtn.disabled = true;
  setStatus("Abbruch wird angefordert ...");
  try {
    await tauri.invoke("cancel_current");
    setStatus("Abgebrochen.");
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  }
});
