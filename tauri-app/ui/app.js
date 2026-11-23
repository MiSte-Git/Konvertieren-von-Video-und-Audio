const tauriCore = window.__TAURI__?.core;
const dialog = window.__TAURI__?.dialog;
const invoke =
  tauriCore?.invoke ||
  window.__TAURI__?.tauri?.invoke ||
  window.__TAURI_INTERNALS__?.invoke;

// ---------------------------------------------------------------------------
// Mehrsprachigkeit (i18n)
// Texte liegen in ui/i18n/<code>.json. Statische Texte im HTML tragen
// data-i18n (Text), data-i18n-title, data-i18n-placeholder bzw.
// data-i18n-aria-label. Fehler aus Rust kommen als JSON-Code
// {"code": "...", "params": {...}} und werden ueber errors.<code> uebersetzt.
// Neue Sprache: JSON anlegen, Flagge nach assets/flags/<code>.png (+ @2x)
// und Eintrag in LANGUAGES ergaenzen.
// ---------------------------------------------------------------------------
const LANGUAGES = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "ru", name: "Русский" },
  { code: "pl", name: "Polski" },
  { code: "es", name: "Español" },
  { code: "hr", name: "Hrvatski" },
  { code: "nl", name: "Nederlands" },
  { code: "fi", name: "Suomi" },
];
const FALLBACK_LANGUAGE = "en";
const LANGUAGE_STORAGE_KEY = "konvertierung.language";
const dictionaries = {};
let currentLanguage = "de";
let statusRenderer = null;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ohne Speicher gilt die Auswahl nur bis zum Neustart.
  }
}

function isSupportedLanguage(code) {
  return LANGUAGES.some((lang) => lang.code === code);
}

function detectSystemLanguage() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const base = String(candidate || "").toLowerCase().split(/[-_]/)[0];
    if (isSupportedLanguage(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}

function initialLanguage() {
  const saved = storageGet(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(saved) ? saved : detectSystemLanguage();
}

async function loadDictionary(code) {
  if (dictionaries[code]) return dictionaries[code];
  try {
    const response = await fetch(`i18n/${code}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    dictionaries[code] = await response.json();
  } catch (err) {
    console.error(`i18n: ${code}.json konnte nicht geladen werden`, err);
    dictionaries[code] = {};
  }
  return dictionaries[code];
}

function lookup(dict, key) {
  return key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dict);
}

function interpolate(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

function t(key, params = {}) {
  // Vor dem Laden der Woerterbuecher nichts anzeigen statt roher Schluessel.
  if (!dictionaries.de) return "";
  let text = lookup(dictionaries[currentLanguage], key);
  if (typeof text !== "string") text = lookup(dictionaries.de, key);
  if (typeof text !== "string") return key;
  return interpolate(text, params);
}

function translateError(err) {
  const raw = typeof err === "string" ? err : err?.message || String(err);
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed.code !== "string") return raw;
  const params = parsed.params || {};
  const key = `errors.${parsed.code}`;
  let text = t(key, params);
  if (text === key) text = parsed.code;
  const template = lookup(dictionaries[currentLanguage], key) || lookup(dictionaries.de, key) || "";
  if (params.detail && !template.includes("{detail}")) {
    text = `${text}: ${params.detail}`;
  }
  return text;
}

function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
}

function renderLanguageBar() {
  const bar = document.getElementById("langBar");
  if (!bar) return;
  bar.replaceChildren();
  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-btn";
    btn.dataset.lang = lang.code;
    btn.title = lang.name;
    const img = document.createElement("img");
    img.src = `assets/flags/${lang.code}.png`;
    img.srcset = `assets/flags/${lang.code}.png 1x, assets/flags/${lang.code}@2x.png 2x`;
    img.alt = lang.name;
    img.width = 22;
    img.height = 16;
    // Fallback auf Sprachcode, falls die Flagge fehlt.
    img.addEventListener("error", () => {
      img.remove();
      btn.textContent = lang.code.toUpperCase();
    });
    btn.append(img);
    btn.addEventListener("click", () => setLanguage(lang.code));
    bar.append(btn);
  }
}

function updateLanguageBar() {
  for (const btn of document.querySelectorAll(".lang-btn")) {
    const active = btn.dataset.lang === currentLanguage;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

async function setLanguage(code, { persist = true } = {}) {
  if (!isSupportedLanguage(code)) code = FALLBACK_LANGUAGE;
  await Promise.all([loadDictionary("de"), loadDictionary(code)]);
  currentLanguage = code;
  document.documentElement.lang = code;
  if (persist) storageSet(LANGUAGE_STORAGE_KEY, code);
  applyTranslations();
  updateLanguageBar();
  refreshDynamicTexts();
}

const inputPath = document.getElementById("inputPath");
const outputPath = document.getElementById("outputPath");
const audioOptionsSection = document.getElementById("audioOptionsSection");
const audioAdjustment = document.getElementById("audioAdjustment");
const audioAdjustmentHelp = document.getElementById("audioAdjustmentHelp");
const clipSection = document.getElementById("clipSection");
const clipStart = document.getElementById("clipStart");
const clipEnd = document.getElementById("clipEnd");
const targetSizeSection = document.getElementById("targetSizeSection");
const targetSizeMb = document.getElementById("targetSizeMb");
const joinCompressOption = document.getElementById("joinCompressOption");
const compressAfterJoin = document.getElementById("compressAfterJoin");
const joinCopyHint = document.getElementById("joinCopyHint");
const joinOrderSection = document.getElementById("joinOrderSection");
const joinOrderList = document.getElementById("joinOrderList");
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
const AUDIO_ADJUSTMENT_STORAGE_KEY = "konvertierung.audioAdjustment";

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

function getAudioAdjustment() {
  return audioAdjustment?.value || "none";
}

function supportsBatchMode(mode = getMode()) {
  return mode === "v2mp3" || mode === "a2mp3" || mode === "adjustvideoaudio" || mode === "divx" || mode === "join";
}

function supportsAudioAdjustment(mode = getMode()) {
  return mode === "v2mp3" || mode === "a2mp3" || mode === "adjustvideoaudio";
}

function isBatchModeActive() {
  return supportsBatchMode() && getMode() !== "join" && selectedInputs.length > 1;
}

function setStatus(text) {
  statusRenderer = null;
  statusEl.textContent = text;
}

// Status ueber Uebersetzungsschluessel setzen; wird beim Sprachwechsel neu gerendert.
function setStatusT(key, params = {}) {
  statusRenderer = () => t(key, params);
  statusEl.textContent = statusRenderer();
}

function setStatusError(err) {
  statusRenderer = () => t("status.error", { message: translateError(err) });
  statusEl.textContent = statusRenderer();
}

function batchStatusSuffix() {
  if (currentBatchTotal > 1 && currentBatchIndex > 0) {
    return t("status.batchSuffix", { index: currentBatchIndex, total: currentBatchTotal });
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

// Dateinamen-Endung in der aktuellen Sprache (suffix.<key> in ui/i18n/*.json).
// Zeichen, die in Dateinamen nicht erlaubt sind, werden entfernt.
const SUFFIX_FALLBACK = {
  clip: "ausschnitt",
  clipRemoved: "ohne_ausschnitt",
  compressed: "komprimiert",
  joined: "zusammengefuegt",
  audioAdjusted: "audio_angepasst",
  audioNormalize: "normalisiert",
  audioSpeech: "sprache_ausgeglichen",
  audioStrong: "stark_ausgeglichen",
};

const AUDIO_SUFFIX_KEYS = {
  normalize: "audioNormalize",
  speech: "audioSpeech",
  strong: "audioStrong",
};

// Endung fuer die gewaehlte Lautstaerkeanpassung, leer bei "Keine"
// oder wenn der Modus keine Anpassung unterstuetzt.
function audioSuffix(mode) {
  if (!supportsAudioAdjustment(mode)) return "";
  const key = AUDIO_SUFFIX_KEYS[getAudioAdjustment()];
  return key ? `_${fileSuffix(key)}` : "";
}

function fileSuffix(key) {
  const cleaned = t(`suffix.${key}`)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
  return cleaned || SUFFIX_FALLBACK[key];
}

function defaultOutput(input, mode, clipMode) {
  if (!input) return "";
  const { dir, base, sep } = splitPath(input);
  const stem = stripExt(base);
  if (mode === "clip") {
    const suffix = fileSuffix(clipMode === "minus" ? "clipRemoved" : "clip");
    const name = `${stem}_${suffix}_${tsSuffix()}.mp4`;
    return dir ? `${dir}${sep}${name}` : name;
  }
  if (mode === "targetsize") {
    const name = `${stem}_${fileSuffix("compressed")}.mp4`;
    return dir ? `${dir}${sep}${name}` : name;
  }
  if (mode === "join") {
    const name = `${stem}_${fileSuffix("joined")}.mp4`;
    return dir ? `${dir}${sep}${name}` : name;
  }
  if (mode === "adjustvideoaudio") {
    const extensionIndex = base.lastIndexOf(".");
    const extension = extensionIndex > 0 ? base.slice(extensionIndex) : ".mp4";
    // Mit gewaehlter Anpassung ersetzt deren Endung das allgemeine audio_angepasst.
    const adjusted = audioSuffix(mode) || `_${fileSuffix("audioAdjusted")}`;
    const name = `${stem}${adjusted}${extension}`;
    return dir ? `${dir}${sep}${name}` : name;
  }
  const ext = mode === "divx" ? "_DivX.avi" : "_LAME.mp3";
  const name = `${stem}${audioSuffix(mode)}${ext}`;
  return dir ? `${dir}${sep}${name}` : name;
}

function setInputSelection(paths) {
  selectedInputs = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (selectedInputs.length > 1) {
    inputPath.value = t("files.selectedCount", { count: selectedInputs.length });
    inputPath.title = selectedInputs.join("\n");
    renderJoinOrder();
    return;
  }

  const single = selectedInputs[0] || "";
  inputPath.value = single;
  inputPath.title = single;
  renderJoinOrder();
}

function renderJoinOrder() {
  if (!joinOrderList) return;
  joinOrderList.replaceChildren();
  selectedInputs.forEach((path, index) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "file-order-row";
    const name = document.createElement("span");
    name.className = "file-order-name";
    name.textContent = splitPath(path).base;
    name.title = path;
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = t("join.up");
    up.disabled = index === 0;
    up.addEventListener("click", () => moveJoinInput(index, index - 1));
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = t("join.down");
    down.disabled = index === selectedInputs.length - 1;
    down.addEventListener("click", () => moveJoinInput(index, index + 1));
    row.append(name, up, down);
    item.append(row);
    joinOrderList.append(item);
  });
}

function moveJoinInput(from, to) {
  if (to < 0 || to >= selectedInputs.length) return;
  const [item] = selectedInputs.splice(from, 1);
  selectedInputs.splice(to, 0, item);
  inputPath.title = selectedInputs.join("\n");
  renderJoinOrder();
}

function getInputList() {
  if (selectedInputs.length > 0) {
    return [...selectedInputs];
  }
  const manualInput = inputPath.value.trim();
  return manualInput ? [manualInput] : [];
}

function updateOutputControls() {
  const disableOutput = isBatchModeActive();
  outputPath.disabled = disableOutput;
  browseOutputBtn.disabled = disableOutput;
  outputPath.placeholder = disableOutput ? t("files.targetAuto") : t("files.targetPlaceholder");
  if (disableOutput) {
    outputPath.value = "";
    lastAutoOutput = "";
  }
}

function isTime(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[2]) < 60 && Number(match[3]) < 60;
}

function timeToSeconds(value) {
  const [h, m, s] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// Zeiteingabe beim Tippen formatieren: nur Ziffern, Punkt/Komma werden zu
// Doppelpunkten, nach je zwei Ziffern wird automatisch ein Doppelpunkt
// eingefuegt (010203 -> 01:02:03). Maximal HH:MM:SS.
function formatTimeTyping(raw) {
  const segments = [""];
  let explicitColon = false;
  for (const ch of raw.replace(/[.,]/g, ":")) {
    const current = segments.length - 1;
    if (ch === ":") {
      if (segments[current] && segments.length < 3) {
        segments.push("");
        explicitColon = true;
      }
      continue;
    }
    if (!/\d/.test(ch)) continue;
    if (segments[current].length === 2) {
      if (segments.length === 3) break;
      segments.push("");
    }
    segments[segments.length - 1] += ch;
    explicitColon = false;
  }
  let text = segments.filter((seg, i) => seg || i < segments.length - 1).join(":");
  if (explicitColon && !text.endsWith(":")) text += ":";
  return text;
}

// Beim Verlassen des Feldes vervollstaendigen: 1:2:3 -> 01:02:03,
// fehlende Teile werden mit 00 aufgefuellt (0130 -> 01:30:00).
function normalizeTime(value) {
  const parts = formatTimeTyping(value).split(":").filter(Boolean);
  if (!parts.length) return "";
  while (parts.length < 3) parts.push("00");
  return parts.map((part) => part.padStart(2, "0")).join(":");
}

function validateClipFields() {
  const startValue = clipStart.value;
  const endValue = clipEnd.value;
  const startOk = !startValue || isTime(startValue);
  let endOk = !endValue || isTime(endValue);
  if (startOk && endOk && startValue && endValue && timeToSeconds(endValue) <= timeToSeconds(startValue)) {
    endOk = false;
  }
  clipStart.classList.toggle("invalid", !startOk);
  clipEnd.classList.toggle("invalid", !endOk);
}

function setupTimeInput(field) {
  if (!field) return;
  field.setAttribute("inputmode", "numeric");
  field.setAttribute("maxlength", "8");
  field.setAttribute("autocomplete", "off");
  field.addEventListener("input", (event) => {
    // Beim Loeschen nicht neu formatieren, sonst kehrt ein entfernter
    // Doppelpunkt sofort zurueck.
    if (event.inputType && event.inputType.startsWith("delete")) return;
    const caret = field.selectionStart ?? field.value.length;
    const digitsBefore = field.value.slice(0, caret).replace(/\D/g, "").length;
    const formatted = formatTimeTyping(field.value);
    if (formatted === field.value) return;
    field.value = formatted;
    // Cursor hinter dieselbe Anzahl Ziffern setzen.
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[pos])) seen += 1;
      pos += 1;
    }
    if (formatted[pos] === ":" && seen === digitsBefore && pos === formatted.length - 1) pos += 1;
    field.setSelectionRange(pos, pos);
  });
  field.addEventListener("blur", () => {
    field.value = normalizeTime(field.value);
    validateClipFields();
  });
  field.addEventListener("focus", () => field.classList.remove("invalid"));
}

setupTimeInput(clipStart);
setupTimeInput(clipEnd);

function updateClipVisibility() {
  const isClip = getMode() === "clip";
  clipSection.classList.toggle("hidden", !isClip);
}

function updateAudioOptionsVisibility() {
  if (!audioOptionsSection) return;
  audioOptionsSection.classList.toggle("hidden", !supportsAudioAdjustment());
}

function updateVideoOptionsVisibility() {
  const mode = getMode();
  const isJoin = mode === "join";
  const isTargetSize = mode === "targetsize";
  targetSizeSection?.classList.toggle("hidden", !isJoin && !isTargetSize);
  joinCompressOption?.classList.toggle("hidden", !isJoin);
  joinCopyHint?.classList.toggle("hidden", !isJoin);
  joinOrderSection?.classList.toggle("hidden", !isJoin);
  if (targetSizeMb) targetSizeMb.disabled = isJoin && !compressAfterJoin?.checked;
}

function updateAudioAdjustmentHelp() {
  if (!audioAdjustmentHelp) return;
  audioAdjustmentHelp.textContent = t(`audio.help.${getAudioAdjustment()}`);
}

function loadAudioAdjustment() {
  if (!audioAdjustment) return;
  const saved = localStorage.getItem(AUDIO_ADJUSTMENT_STORAGE_KEY) || "none";
  const hasOption = Array.from(audioAdjustment.options).some((option) => option.value === saved);
  audioAdjustment.value = hasOption ? saved : "none";
  updateAudioAdjustmentHelp();
}

function saveAudioAdjustment() {
  localStorage.setItem(AUDIO_ADJUSTMENT_STORAGE_KEY, getAudioAdjustment());
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
  const text = parts.length ? parts.join(" ") : t("status.wait");
  if (document.body.classList.contains("is-running")) {
    if (Number.isFinite(totalDurationSec) && Number.isFinite(elapsed)) {
      const total = formatHms(totalDurationSec);
      const done = formatHms(elapsed);
      const remaining = formatHms(Math.max(0, totalDurationSec - elapsed));
      setStatus(`${t("status.progress", { done, total, remaining })}${batchStatusSuffix()}`);
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
    multiple: supportsBatchMode(mode),
    filters: [{ name: t("files.filterName"), extensions: ["mp4", "m4a", "avi", "mkv", "mov", "mp3", "wav"] }],
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  setInputSelection(paths);
  updateOutputControls();

  if (paths.length > 1 && supportsBatchMode(mode)) {
    setStatusT(mode === "join" ? "status.selectedJoin" : "status.selectedBatch", { count: paths.length });
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
    setStatusT(supportsBatchMode(mode) ? "status.needInputs" : "status.needInput");
    return;
  }

  const input = inputs[0];
  let output = outputPath.value.trim();

  if (!output) {
    output = defaultOutput(input, mode, getClipMode());
    if (!isBatchModeActive()) {
      outputPath.value = output;
    }
  }

  const requestedSizeMb = Number(targetSizeMb?.value || 100);
  if ((mode === "targetsize" || (mode === "join" && compressAfterJoin?.checked)) &&
      (!Number.isFinite(requestedSizeMb) || requestedSizeMb < 1)) {
    setStatusT("status.needTargetSize");
    return;
  }

  if (mode === "join") {
    if (inputs.length < 2) {
      setStatusT("status.needTwoVideos");
      return;
    }
    const startedAt = Date.now();
    setRunning(true);
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    totalDurationSec = null;
    try {
      const durations = await Promise.all(inputs.map((path) => invoke("get_media_duration", { input: path })));
      totalDurationSec = durations.reduce((sum, value) => sum + (Number(value) || 0), 0) || null;
    } catch {
      totalDurationSec = null;
    }
    setStatusT(compressAfterJoin.checked ? "status.joinCompress" : "status.join");
    startProgressPolling();
    try {
      await invoke("join_videos", {
        inputs,
        output,
        compress: compressAfterJoin.checked,
        targetSizeMb: requestedSizeMb,
      });
      setStatusT("status.done", { elapsed: formatElapsedMs(Date.now() - startedAt) });
    } catch (err) {
      if (cancelRequested) setStatusT("status.cancelled");
      else setStatusError(err);
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      totalDurationSec = null;
      setRunning(false);
    }
    return;
  }

  if (mode === "targetsize") {
    const startedAt = Date.now();
    setRunning(true);
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    try {
      totalDurationSec = await invoke("get_media_duration", { input });
      setStatusT("status.compress", { mb: requestedSizeMb });
      startProgressPolling();
      await invoke("compress_to_size", { input, output, targetSizeMb: requestedSizeMb });
      setStatusT("status.done", { elapsed: formatElapsedMs(Date.now() - startedAt) });
    } catch (err) {
      if (cancelRequested) setStatusT("status.cancelled");
      else setStatusError(err);
    } finally {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      totalDurationSec = null;
      setRunning(false);
    }
    return;
  }

  if (mode === "clip") {
    const startedAt = Date.now();
    clipStart.value = normalizeTime(clipStart.value);
    clipEnd.value = normalizeTime(clipEnd.value);
    validateClipFields();
    const start = clipStart.value;
    const end = clipEnd.value;
    if (!start || !end || !isTime(start) || !isTime(end)) {
      setStatusT("status.needClipTimes");
      return;
    }
    if (timeToSeconds(end) <= timeToSeconds(start)) {
      setStatusT("status.clipEndBeforeStart");
      return;
    }
    const clipMode = getClipMode();
    setStatusT(clipMode === "minus" ? "status.clipRemove" : "status.clipCut");
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
      setStatusT("status.done", { elapsed });
    } catch (err) {
      if (cancelRequested) setStatusT("status.cancelled");
      else setStatusError(err);
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
    if (supportsBatchMode(mode) && inputs.length > 1) {
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

        setStatusT("status.batchFile", { index: currentBatchIndex, total: currentBatchTotal });
        startProgressPolling();
        await invoke("convert_media", {
          mode,
          input: currentInput,
          output: currentOutput,
          audioAdjustment: getAudioAdjustment(),
        });
      }

      if (cancelRequested) {
        setStatusT("status.cancelled");
      } else {
        const elapsed = formatElapsedMs(Date.now() - startedAt);
        setStatusT("status.batchDone", { count: inputs.length, elapsed });
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
      setStatusT("status.cancelled");
      return;
    }

    setStatusT("status.converting");
    startProgressPolling();
    const startedAt = Date.now();
    await invoke("convert_media", { mode, input, output, audioAdjustment: getAudioAdjustment() });
    const elapsed = formatElapsedMs(Date.now() - startedAt);
    setStatusT("status.done", { elapsed });
  } catch (err) {
    if (cancelRequested) setStatusT("status.cancelled");
    else setStatusError(err);
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
    if (selectedInputs.length > 1 && !supportsBatchMode(getMode())) {
      setInputSelection(selectedInputs.slice(0, 1));
    }
    updateClipVisibility();
    updateAudioOptionsVisibility();
    updateVideoOptionsVisibility();
    updateOutputControls();
    const inputs = getInputList();
    if (inputs.length && !isBatchModeActive()) {
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
    if (inputs.length && !isBatchModeActive()) {
      const proposed = defaultOutput(inputs[0], getMode(), getClipMode());
      if (!outputPath.value || outputPath.value === lastAutoOutput) {
        outputPath.value = proposed;
      }
      lastAutoOutput = proposed;
    }
  });
}

updateClipVisibility();
loadAudioAdjustment();
updateAudioOptionsVisibility();
updateVideoOptionsVisibility();
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
audioAdjustment?.addEventListener("change", () => {
  updateAudioAdjustmentHelp();
  saveAudioAdjustment();
  refreshAutoOutput();
});
compressAfterJoin?.addEventListener("change", updateVideoOptionsVisibility);

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
  const message = event?.payload ? translateError(event.payload) : t("dialog.lameFailed");
  if (dialog?.message) {
    await dialog.message(message, { title: t("dialog.lameTitle"), type: "warning" });
    return;
  }
  if (dialog?.alert) {
    await dialog.alert(message);
    return;
  }
  setStatusT("status.warning", { message });
});
startBtn.addEventListener("click", start);
cancelBtn.addEventListener("click", async () => {
  if (!invoke) return;
  cancelRequested = true;
  cancelBtn.disabled = true;
  setStatusT("status.cancelRequested");
  try {
    await invoke("cancel_current");
    setStatusT("status.cancelRunning");
  } catch (err) {
    if (cancelRequested) setStatusT("status.cancelQueued");
    else setStatusError(err);
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
      await dialog.message(t("status.logFileCopied", { path: logPath }), { title: t("dialog.logTitle"), type: "info" });
      return;
    }
    setStatusT("status.logFile", { path: logPath });
  } catch (err) {
    setStatusError(err);
  }
});

const appVersionEl = document.getElementById("appVersion");
const aboutBtn = document.getElementById("aboutBtn");
const aboutDialog = document.getElementById("aboutDialog");
const aboutVersionEl = document.getElementById("aboutVersion");
const aboutTauriEl = document.getElementById("aboutTauri");

let appVersion = null;
let versionLoaded = false;

function renderVersion() {
  if (!versionLoaded) return;
  const text = appVersion ? t("app.version", { version: appVersion }) : t("app.versionUnknown");
  appVersionEl.textContent = text;
  aboutVersionEl.textContent = text;
}

async function loadVersionInfo() {
  if (invoke) {
    try {
      appVersion = await invoke("plugin:app|version");
    } catch {
      appVersion = null;
    }
    try {
      const tauriVersion = await invoke("plugin:app|tauri_version");
      aboutTauriEl.textContent = `Tauri ${tauriVersion}`;
    } catch {
      /* optional */
    }
  }
  versionLoaded = true;
  renderVersion();
}

// Automatisch vorgeschlagenen Zielnamen an die neue Sprache anpassen,
// sofern der Nutzer ihn nicht selbst geaendert hat.
function refreshAutoOutput() {
  if (isBatchModeActive() || !lastAutoOutput || outputPath.value !== lastAutoOutput) return;
  const inputs = getInputList();
  if (!inputs.length) return;
  const proposed = defaultOutput(inputs[0], getMode(), getClipMode());
  outputPath.value = proposed;
  lastAutoOutput = proposed;
}

// Texte, die per JS gesetzt werden, beim Sprachwechsel neu aufbauen.
function refreshDynamicTexts() {
  if (statusRenderer) statusEl.textContent = statusRenderer();
  updateAudioAdjustmentHelp();
  updateOutputControls();
  if (selectedInputs.length > 1) {
    inputPath.value = t("files.selectedCount", { count: selectedInputs.length });
  }
  renderJoinOrder();
  refreshAutoOutput();
  if (appVersionEl) renderVersion();
}

aboutBtn?.addEventListener("click", () => {
  if (aboutDialog?.showModal) aboutDialog.showModal();
});

renderLanguageBar();
setLanguage(initialLanguage(), { persist: false }).then(() => {
  if (!document.body.classList.contains("is-running")) setStatusT("status.ready");
  loadVersionInfo();
});
