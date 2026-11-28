#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

struct AppState {
    current_pid: Arc<Mutex<Option<u32>>>,
    progress: Arc<Mutex<Option<HashMap<String, String>>>>,
}

/// Fehler gehen als JSON-Code ans UI, z.B. {"code":"invalid_input","params":{}}.
/// Die Uebersetzung passiert im UI (ui/i18n/<lang>.json, Schluessel errors.<code>).
fn app_err(code: &str) -> String {
    app_err_with(code, &[])
}

fn app_err_with(code: &str, params: &[(&str, String)]) -> String {
    let params: serde_json::Map<String, serde_json::Value> = params
        .iter()
        .map(|(k, v)| (k.to_string(), serde_json::Value::String(v.clone())))
        .collect();
    serde_json::json!({ "code": code, "params": params }).to_string()
}

fn exit_code(code: Option<i32>) -> String {
    code.map(|c| c.to_string())
        .unwrap_or_else(|| "-".to_string())
}

fn apply_no_window(_cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        _cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn log_line(app: &AppHandle, message: &str) {
    let dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir());
    let dir = match dir {
        Ok(d) => d,
        Err(_) => return,
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let log_path = dir.join("konvertierung.log");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{}] {}\n", now, message);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

#[tauri::command]
fn get_log_path(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|_| app_err("log_path_unavailable"))?;
    let log_path = dir.join("konvertierung.log");
    Ok(log_path.to_string_lossy().to_string())
}

fn os_subdir() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    }
}

fn add_local_bin_to_path(app: &AppHandle) {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("bin"));
            candidates.push(dir.join("bin").join(os_subdir()));
        }
    }
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("bin"));
        candidates.push(res_dir.join("bin").join(os_subdir()));
    }

    let mut add_paths = Vec::new();
    for p in candidates {
        if p.is_dir() {
            add_paths.push(p);
        }
    }
    if add_paths.is_empty() {
        return;
    }

    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut parts: Vec<PathBuf> = std::env::split_paths(&existing).collect();
    let mut merged = add_paths;
    merged.append(&mut parts);
    if let Ok(joined) = std::env::join_paths(merged) {
        std::env::set_var("PATH", joined);
    }
}

fn ensure_output_dir(output_path: &str) -> Result<(), String> {
    if let Some(dir) = Path::new(output_path).parent() {
        if !dir.as_os_str().is_empty() {
            std::fs::create_dir_all(dir)
                .map_err(|e| app_err_with("output_dir_create", &[("detail", e.to_string())]))?;
        }
    }
    Ok(())
}

fn probe_duration(input: &str) -> Result<f64, String> {
    let mut cmd = Command::new("ffprobe");
    apply_no_window(&mut cmd);
    let output = cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &input,
        ])
        .output()
        .map_err(|e| app_err_with("ffprobe_start", &[("detail", e.to_string())]))?;
    if !output.status.success() {
        return Err(app_err("ffprobe_duration_failed"));
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let duration = raw
        .parse::<f64>()
        .map_err(|_| app_err("duration_unreadable"))?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err(app_err("duration_invalid"));
    }
    Ok(duration)
}

fn is_hh_mm_ss(value: &str) -> bool {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 3 {
        return false;
    }
    let h = parts[0].parse::<u32>();
    let m = parts[1].parse::<u32>();
    let s = parts[2].parse::<u32>();
    match (h, m, s) {
        (Ok(_), Ok(mm), Ok(ss)) => mm < 60 && ss < 60,
        _ => false,
    }
}

fn get_audio_filter(mode: Option<&str>) -> Result<Option<&'static str>, String> {
    match mode.unwrap_or("none") {
        "none" => Ok(None),
        "normalize" => Ok(Some("loudnorm=I=-16:LRA=11:TP=-1.5")),
        "speech" => Ok(Some(
            "dynaudnorm=f=500:g=15:p=0.9,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,alimiter=limit=0.95",
        )),
        "strong" => Ok(Some(
            "dynaudnorm=f=500:g=12:p=0.85,acompressor=threshold=-20dB:ratio=4:attack=15:release=300,alimiter=limit=0.90",
        )),
        _ => Err(app_err("unknown_audio_adjustment")),
    }
}

// RNNoise-Modell (somnolent-hogwash: Sprache in Aufnahmen mit Stoergeraeuschen),
// gemeinfrei, aus github.com/GregorR/rnnoise-models.
const RNNOISE_MODEL: &[u8] = include_bytes!("../resources/rnnoise/sh.rnnn");
const RNNOISE_MODEL_FILE: &str = "sh.rnnn";

// Hintergrundgeraeusche reduzieren. Hoch-/Tiefpass entfernt Brummen und Zischen
// ausserhalb des Sprachbereichs.
// light:  FFT-Entrauschen, das Rauschprofil wird laufend nachgefuehrt (tn=1),
//         damit ein Geraet, das an- und ausgeht, abgefangen wird.
// strong: RNNoise, erkennt Sprache pro Frame und ist unabhaengig davon,
//         ob das Stoergeraeusch gerade laeuft.
fn get_noise_filter(mode: Option<&str>) -> Result<Option<String>, String> {
    match mode.unwrap_or("none") {
        "none" => Ok(None),
        "light" => Ok(Some(
            "highpass=f=80,lowpass=f=8000,afftdn=nr=12:nf=-40:tn=1".to_string(),
        )),
        "strong" => Ok(Some(format!(
            "highpass=f=80,lowpass=f=8000,arnndn=m={}",
            RNNOISE_MODEL_FILE
        ))),
        _ => Err(app_err("unknown_noise_reduction")),
    }
}

// Ersetzt NaN/Unendlich durch Stille. Mit ffmpeg 7 liefert die Rauschunterdrueckung
// bei langen Dateien vereinzelt NaN-Werte, die der AAC-Encoder mit
// "Input contains (near) NaN/+-Inf" (Exit-Code 234) ablehnt.
// Normale Werte (Betrag < 1e6) bleiben unveraendert.
const NAN_GUARD_FILTER: &str = "aeval=exprs='if(lt(abs(val(ch)),1e6),val(ch),0)':c=same";

fn needs_noise_model(noise_reduction: Option<&str>) -> bool {
    noise_reduction == Some("strong")
}

// Entrauschen zuerst, danach die Lautstaerke anpassen, damit das Rauschen
// nicht vorher mit angehoben wird.
fn build_audio_filter_chain(
    audio_adjustment: Option<&str>,
    noise_reduction: Option<&str>,
) -> Result<Option<String>, String> {
    let noise = get_noise_filter(noise_reduction)?;
    let guard = noise.as_ref().map(|_| NAN_GUARD_FILTER.to_string());
    let parts: Vec<String> = [
        noise,
        get_audio_filter(audio_adjustment)?.map(String::from),
        guard,
    ]
    .into_iter()
    .flatten()
    .collect();
    Ok(if parts.is_empty() {
        None
    } else {
        Some(parts.join(","))
    })
}

// Schreibt das Modell in den Cache-Ordner der App. ffmpeg wird in diesem Ordner
// gestartet und bekommt nur den Dateinamen, so muss der Pfad (z.B. C:\...) nicht
// fuer die Filtersyntax maskiert werden.
fn ensure_noise_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("konvertierung-audio-video"));
    let dir = base.join("rnnoise");
    let file = dir.join(RNNOISE_MODEL_FILE);
    let up_to_date = std::fs::metadata(&file)
        .map(|m| m.len() == RNNOISE_MODEL.len() as u64)
        .unwrap_or(false);
    if !up_to_date {
        std::fs::create_dir_all(&dir)
            .and_then(|_| std::fs::write(&file, RNNOISE_MODEL))
            .map_err(|e| app_err_with("noise_model_write", &[("detail", e.to_string())]))?;
    }
    Ok(dir)
}

fn absolute_path(path: &str) -> String {
    let p = Path::new(path);
    if p.is_absolute() {
        return path.to_string();
    }
    std::env::current_dir()
        .map(|cwd| cwd.join(p).to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string())
}

fn build_audio_mp3_ffmpeg_args(
    mode: &str,
    input: &str,
    audio_adjustment: Option<&str>,
    noise_reduction: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = match mode {
        "v2mp3" => [
            "ffmpeg",
            "-y",
            "-i",
            &input,
            "-vn",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-nostats",
            "-loglevel",
            "error",
            "-progress",
            "pipe:2",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "a2mp3" => [
            "ffmpeg",
            "-y",
            "-i",
            input,
            "-vn",
            "-nostats",
            "-loglevel",
            "error",
            "-progress",
            "pipe:2",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        _ => return Err(app_err("unknown_mode")),
    };

    if let Some(filter) = build_audio_filter_chain(audio_adjustment, noise_reduction)? {
        args.push("-af".to_string());
        args.push(filter);
    }
    args.extend(["-f", "wav", "pipe:1"].into_iter().map(String::from));
    Ok(args)
}

fn build_adjust_video_audio_args(
    input: &str,
    output: &str,
    audio_adjustment: Option<&str>,
    noise_reduction: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut args = [
        "ffmpeg", "-y", "-i", input, "-map", "0", "-c", "copy", "-c:a", "aac", "-b:a", "192k",
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();
    if let Some(filter) = build_audio_filter_chain(audio_adjustment, noise_reduction)? {
        args.push("-filter:a".to_string());
        args.push(filter);
    }
    args.extend(
        [
            "-nostats",
            "-loglevel",
            "error",
            "-progress",
            "pipe:1",
            output,
        ]
        .into_iter()
        .map(String::from),
    );
    Ok(args)
}

#[derive(Serialize, Clone)]
struct FfmpegProgress {
    values: HashMap<String, String>,
}

fn run_ffmpeg(
    args: Vec<String>,
    current_pid: Arc<Mutex<Option<u32>>>,
    progress_state: Arc<Mutex<Option<HashMap<String, String>>>>,
    app: AppHandle,
) -> Result<(), String> {
    run_ffmpeg_in(args, None, current_pid, progress_state, app)
}

fn run_ffmpeg_in(
    mut args: Vec<String>,
    work_dir: Option<PathBuf>,
    current_pid: Arc<Mutex<Option<u32>>>,
    progress_state: Arc<Mutex<Option<HashMap<String, String>>>>,
    app: AppHandle,
) -> Result<(), String> {
    if args.is_empty() {
        return Err(app_err("empty_command"));
    }
    if !args.iter().any(|a| a == "-progress") && args.len() >= 2 {
        let output = args.pop().unwrap_or_default();
        args.push("-progress".to_string());
        args.push("pipe:1".to_string());
        args.push(output);
    }
    let mut cmd = Command::new(&args[0]);
    apply_no_window(&mut cmd);
    if let Some(dir) = &work_dir {
        cmd.current_dir(dir);
    }
    cmd.args(&args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| app_err_with("ffmpeg_start", &[("detail", e.to_string())]))?;
    {
        let mut guard = current_pid.lock().map_err(|_| app_err("lock_error"))?;
        *guard = Some(child.id());
    }
    // stderr parallel lesen (sonst kann ffmpeg blockieren) und die letzten
    // Zeilen fuer die Fehlermeldung aufheben.
    let stderr_reader = child.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            let mut lines: Vec<String> = Vec::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    lines.push(line);
                    if lines.len() > 20 {
                        lines.remove(0);
                    }
                }
            }
            lines
        })
    });
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut values: HashMap<String, String> = HashMap::new();
        for line in reader.lines() {
            let line =
                line.map_err(|e| app_err_with("ffmpeg_read", &[("detail", e.to_string())]))?;
            if let Some((key, value)) = line.split_once('=') {
                values.insert(key.to_string(), value.to_string());
                if let Ok(mut guard) = progress_state.lock() {
                    *guard = Some(values.clone());
                }
                if key == "progress" {
                    let payload = FfmpegProgress {
                        values: values.clone(),
                    };
                    let _ = app.emit("ffmpeg_progress", payload);
                }
            }
        }
    }
    let status = child
        .wait()
        .map_err(|e| app_err_with("ffmpeg_start", &[("detail", e.to_string())]))?;
    if let Ok(mut guard) = current_pid.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = progress_state.lock() {
        *guard = None;
    }
    let stderr_lines = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    if !status.success() {
        return Err(app_err_with(
            "ffmpeg_failed",
            &[
                ("exit", exit_code(status.code())),
                ("detail", stderr_lines.join("\n")),
            ],
        ));
    }
    Ok(())
}

fn run_ffmpeg_lame(
    ffmpeg_args: Vec<String>,
    lame_args: Vec<String>,
    output_path: String,
    work_dir: Option<PathBuf>,
    current_pid: Arc<Mutex<Option<u32>>>,
    progress_state: Arc<Mutex<Option<HashMap<String, String>>>>,
    app: AppHandle,
) -> Result<(), String> {
    if ffmpeg_args.is_empty() || lame_args.is_empty() {
        return Err(app_err("empty_command"));
    }

    let mut ffmpeg_cmd = Command::new(&ffmpeg_args[0]);
    apply_no_window(&mut ffmpeg_cmd);
    if let Some(dir) = &work_dir {
        ffmpeg_cmd.current_dir(dir);
    }
    ffmpeg_cmd
        .args(&ffmpeg_args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut ffmpeg_child = ffmpeg_cmd
        .spawn()
        .map_err(|e| app_err_with("ffmpeg_start", &[("detail", e.to_string())]))?;

    {
        let mut guard = current_pid.lock().map_err(|_| app_err("lock_error"))?;
        *guard = Some(ffmpeg_child.id());
    }

    let ffmpeg_stdout = ffmpeg_child
        .stdout
        .take()
        .ok_or_else(|| app_err("ffmpeg_stdout_unavailable"))?;
    let mut lame_cmd = Command::new(&lame_args[0]);
    apply_no_window(&mut lame_cmd);
    lame_cmd
        .args(&lame_args[1..])
        .stdin(Stdio::from(ffmpeg_stdout))
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    let mut lame_child = lame_cmd
        .spawn()
        .map_err(|e| app_err_with("lame_start", &[("detail", e.to_string())]))?;

    let mut ffmpeg_error_lines: Vec<String> = Vec::new();
    if let Some(stderr) = ffmpeg_child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut values: HashMap<String, String> = HashMap::new();
        for line in reader.lines() {
            let line =
                line.map_err(|e| app_err_with("ffmpeg_read", &[("detail", e.to_string())]))?;
            if let Some((key, value)) = line.split_once('=') {
                values.insert(key.to_string(), value.to_string());
                if let Ok(mut guard) = progress_state.lock() {
                    *guard = Some(values.clone());
                }
                if key == "progress" {
                    let payload = FfmpegProgress {
                        values: values.clone(),
                    };
                    let _ = app.emit("ffmpeg_progress", payload);
                }
            } else if !line.trim().is_empty() {
                ffmpeg_error_lines.push(line);
            }
        }
    }

    let ffmpeg_status = ffmpeg_child
        .wait()
        .map_err(|e| app_err_with("ffmpeg_start", &[("detail", e.to_string())]))?;
    if !ffmpeg_status.success() {
        let _ = lame_child.kill();
        let _ = lame_child.wait();
        if let Ok(mut guard) = current_pid.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = progress_state.lock() {
            *guard = None;
        }
        return Err(app_err_with(
            "ffmpeg_failed",
            &[
                ("exit", exit_code(ffmpeg_status.code())),
                ("detail", ffmpeg_error_lines.join("\n")),
            ],
        ));
    }

    let lame_status = lame_child
        .wait()
        .map_err(|e| app_err_with("lame_start", &[("detail", e.to_string())]))?;

    if let Ok(mut guard) = current_pid.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = progress_state.lock() {
        *guard = None;
    }
    if !lame_status.success() {
        return Err(app_err_with(
            "lame_failed",
            &[("exit", exit_code(lame_status.code()))],
        ));
    }
    if let Err(warn) = verify_lame_output(&output_path) {
        let _ = app.emit("lame_warning", warn);
    }
    Ok(())
}

fn extract_version_token(input: &str) -> Option<String> {
    for token in input.split_whitespace() {
        let mut has_digit = false;
        let mut has_dot = false;
        for ch in token.chars() {
            if ch.is_ascii_digit() {
                has_digit = true;
            } else if ch == '.' {
                has_dot = true;
            } else if ch == ',' || ch == ')' || ch == '(' {
                continue;
            }
        }
        if has_digit && has_dot {
            return Some(
                token
                    .trim_matches(|c: char| !c.is_ascii_digit() && c != '.')
                    .to_string(),
            );
        }
    }
    None
}

fn get_lame_version() -> Option<String> {
    let mut cmd = Command::new("lame");
    apply_no_window(&mut cmd);
    let output = cmd.arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    extract_version_token(&text)
}

fn verify_lame_output(path: &str) -> Result<(), String> {
    let mut cmd = Command::new("ffprobe");
    apply_no_window(&mut cmd);
    let output = cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format_tags=encoder:stream_tags=encoder",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| app_err_with("ffprobe_start", &[("detail", e.to_string())]))?;

    if !output.status.success() {
        return Err(app_err("ffprobe_tags_failed"));
    }

    let tags = String::from_utf8_lossy(&output.stdout);
    if !tags.to_ascii_lowercase().contains("lame") {
        return Err(app_err("lame_tag_missing"));
    }

    if let Some(expected) = get_lame_version() {
        if !tags.contains(&expected) {
            return Err(app_err_with(
                "lame_version_mismatch",
                &[("version", expected)],
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_arg(args: &[String], value: &str) -> bool {
        args.iter().any(|arg| arg == value)
    }

    #[test]
    fn app_err_produces_code_json() {
        let v: serde_json::Value =
            serde_json::from_str(&app_err_with("input_not_found", &[("path", "a\"b".into())]))
                .unwrap();
        assert_eq!(v["code"], "input_not_found");
        assert_eq!(v["params"]["path"], "a\"b");
        let v: serde_json::Value = serde_json::from_str(&app_err("invalid_input")).unwrap();
        assert_eq!(v["code"], "invalid_input");
    }

    #[test]
    fn audio_filter_none_returns_no_filter() {
        assert_eq!(get_audio_filter(None).unwrap(), None);
        assert_eq!(get_audio_filter(Some("none")).unwrap(), None);
    }

    #[test]
    fn audio_filter_modes_return_expected_ffmpeg_filters() {
        assert_eq!(
            get_audio_filter(Some("normalize")).unwrap(),
            Some("loudnorm=I=-16:LRA=11:TP=-1.5")
        );
        assert_eq!(
            get_audio_filter(Some("speech")).unwrap(),
            Some("dynaudnorm=f=500:g=15:p=0.9,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,alimiter=limit=0.95")
        );
        assert_eq!(
            get_audio_filter(Some("strong")).unwrap(),
            Some("dynaudnorm=f=500:g=12:p=0.85,acompressor=threshold=-20dB:ratio=4:attack=15:release=300,alimiter=limit=0.90")
        );
    }

    #[test]
    fn audio_filter_rejects_unknown_mode() {
        assert!(get_audio_filter(Some("invalid")).is_err());
    }

    #[test]
    fn audio_mp3_args_omit_af_for_none() {
        let args =
            build_audio_mp3_ffmpeg_args("v2mp3", "/tmp/in file.mp4", Some("none"), None).unwrap();
        assert!(!has_arg(&args, "-af"));
        assert_eq!(args.last().map(String::as_str), Some("pipe:1"));
    }

    #[test]
    fn audio_mp3_args_include_filter_for_video_to_mp3() {
        let args =
            build_audio_mp3_ffmpeg_args("v2mp3", "/tmp/in file.mp4", Some("speech"), None).unwrap();
        let af_pos = args.iter().position(|arg| arg == "-af").unwrap();
        assert_eq!(
            args.get(af_pos + 1).map(String::as_str),
            get_audio_filter(Some("speech")).unwrap()
        );
        assert!(af_pos < args.iter().position(|arg| arg == "-f").unwrap());
    }

    #[test]
    fn audio_mp3_args_include_filter_for_audio_to_mp3() {
        let args =
            build_audio_mp3_ffmpeg_args("a2mp3", "/tmp/in file.wav", Some("strong"), None).unwrap();
        let af_pos = args.iter().position(|arg| arg == "-af").unwrap();
        assert_eq!(
            args.get(af_pos + 1).map(String::as_str),
            get_audio_filter(Some("strong")).unwrap()
        );
    }

    #[test]
    fn adjust_video_audio_copies_video_and_encodes_audio() {
        let args = build_adjust_video_audio_args(
            "/tmp/input.mp4",
            "/tmp/output.mp4",
            Some("normalize"),
            None,
        )
        .unwrap();
        assert!(args.windows(2).any(|pair| pair == ["-c", "copy"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:a", "aac"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-filter:a", "loudnorm=I=-16:LRA=11:TP=-1.5"]));
        assert!(!has_arg(&args, "-c:v"));
    }

    #[test]
    fn noise_filter_modes() {
        assert_eq!(get_noise_filter(None).unwrap(), None);
        assert_eq!(get_noise_filter(Some("none")).unwrap(), None);
        assert!(get_noise_filter(Some("light"))
            .unwrap()
            .unwrap()
            .contains("afftdn"));
        assert!(get_noise_filter(Some("light"))
            .unwrap()
            .unwrap()
            .contains("tn=1"));
        assert!(get_noise_filter(Some("strong"))
            .unwrap()
            .unwrap()
            .contains("arnndn=m=sh.rnnn"));
        assert!(get_noise_filter(Some("invalid")).is_err());
        assert!(needs_noise_model(Some("strong")));
        assert!(!needs_noise_model(Some("light")));
    }

    #[test]
    fn noise_filter_runs_before_volume_adjustment() {
        let chain = build_audio_filter_chain(Some("speech"), Some("strong"))
            .unwrap()
            .unwrap();
        let noise_pos = chain.find("arnndn").unwrap();
        let volume_pos = chain.find("dynaudnorm").unwrap();
        assert!(noise_pos < volume_pos);
        assert!(chain.ends_with(NAN_GUARD_FILTER));
        assert_eq!(
            build_audio_filter_chain(Some("none"), Some("none")).unwrap(),
            None
        );
        assert_eq!(
            build_audio_filter_chain(Some("normalize"), None)
                .unwrap()
                .as_deref(),
            get_audio_filter(Some("normalize")).unwrap()
        );
    }

    #[test]
    fn noise_filter_is_added_to_adjust_video_audio() {
        let args = build_adjust_video_audio_args(
            "/tmp/input.mp4",
            "/tmp/output.mp4",
            Some("none"),
            Some("light"),
        )
        .unwrap();
        let pos = args.iter().position(|arg| arg == "-filter:a").unwrap();
        assert!(args[pos + 1].contains("afftdn"));
    }

    #[test]
    fn embedded_noise_model_is_present() {
        assert!(RNNOISE_MODEL.len() > 100_000);
    }

    #[test]
    fn target_size_uses_five_percent_container_reserve() {
        assert_eq!(target_video_bitrate_kbit(100.0, 100.0).unwrap(), 7654);
    }

    #[test]
    fn target_size_rejects_impossibly_small_bitrate() {
        assert!(target_video_bitrate_kbit(1.0, 3600.0).is_err());
    }

    #[test]
    fn concat_file_line_escapes_quotes_and_windows_separators() {
        assert_eq!(
            concat_file_line("C:\\Videos\\Max's Clip.mp4"),
            "file 'C:/Videos/Max'\\''s Clip.mp4'\n"
        );
    }
}

#[tauri::command]
fn get_media_duration(input: String) -> Result<f64, String> {
    probe_media_duration(&input)
}

fn probe_media_duration(input: &str) -> Result<f64, String> {
    if !Path::new(&input).is_file() {
        return Err(app_err("invalid_input"));
    }
    probe_duration(&input)
}

#[cfg(target_family = "unix")]
fn kill_pid(pid: u32) -> Result<(), String> {
    let status = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|e| app_err_with("kill_failed", &[("detail", e.to_string())]))?;
    if !status.success() {
        return Err(app_err_with("kill_failed", &[("detail", String::new())]));
    }
    Ok(())
}

#[cfg(target_family = "windows")]
fn kill_pid(pid: u32) -> Result<(), String> {
    let mut cmd = Command::new("taskkill");
    apply_no_window(&mut cmd);
    let status = cmd
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map_err(|e| app_err_with("kill_failed", &[("detail", e.to_string())]))?;
    if !status.success() {
        return Err(app_err_with("kill_failed", &[("detail", String::new())]));
    }
    Ok(())
}

#[tauri::command]
fn cancel_current(state: State<AppState>) -> Result<(), String> {
    let mut guard = state
        .current_pid
        .lock()
        .map_err(|_| app_err("lock_error"))?;
    if let Some(pid) = *guard {
        kill_pid(pid)?;
        *guard = None;
        if let Ok(mut progress_guard) = state.progress.lock() {
            *progress_guard = None;
        }
        return Ok(());
    }
    Err(app_err("no_running_process"))
}

#[tauri::command]
fn get_progress(state: State<AppState>) -> Option<HashMap<String, String>> {
    state.progress.lock().ok().and_then(|p| p.clone())
}

#[tauri::command]
async fn convert_media(
    mode: String,
    input: String,
    output: String,
    audio_adjustment: Option<String>,
    noise_reduction: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let started = Instant::now();
    log_line(
        &app,
        &format!(
            "convert start mode={} audio_adjustment={} noise_reduction={} input={} output={}",
            mode,
            audio_adjustment.as_deref().unwrap_or("none"),
            noise_reduction.as_deref().unwrap_or("none"),
            input,
            output
        ),
    );
    if !Path::new(&input).is_file() {
        return Err(app_err("invalid_input"));
    }
    if mode == "adjustvideoaudio" && Path::new(&input) == Path::new(&output) {
        return Err(app_err("same_input_output"));
    }
    ensure_output_dir(&output)?;

    let uses_audio_filters = matches!(mode.as_str(), "v2mp3" | "a2mp3" | "adjustvideoaudio");
    let noise_reduction = if uses_audio_filters {
        noise_reduction
    } else {
        None
    };
    // ffmpeg laeuft fuer RNNoise im Modell-Ordner, relative Pfade daher vorher aufloesen.
    let work_dir = if needs_noise_model(noise_reduction.as_deref()) {
        Some(ensure_noise_model_dir(&app)?)
    } else {
        None
    };
    let (input, output) = if work_dir.is_some() {
        (absolute_path(&input), absolute_path(&output))
    } else {
        (input, output)
    };

    let args_owned = match mode.as_str() {
        "v2mp3" | "a2mp3" => build_audio_mp3_ffmpeg_args(
            mode.as_str(),
            &input,
            audio_adjustment.as_deref(),
            noise_reduction.as_deref(),
        )?,
        "adjustvideoaudio" => build_adjust_video_audio_args(
            &input,
            &output,
            audio_adjustment.as_deref(),
            noise_reduction.as_deref(),
        )?,
        "divx" => vec![
            "ffmpeg",
            "-y",
            "-hwaccel",
            "auto",
            "-fflags",
            "+genpts",
            "-i",
            &input,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-sn",
            "-dn",
            "-c:v",
            "mpeg4",
            "-vtag",
            "XVID",
            "-qscale:v",
            "7",
            "-bf",
            "0",
            "-mbd",
            "0",
            "-g",
            "250",
            "-me_method",
            "epzs",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "0",
            "-vsync",
            "1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-f",
            "avi",
            "-use_odml",
            "1",
            "-max_interleave_delta",
            "0",
            "-metadata",
            "title=film",
            &output,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        _ => return Err(app_err("unknown_mode")),
    };

    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if mode == "v2mp3" || mode == "a2mp3" {
            let output_path = output.clone();
            let lame_args = vec![
                "lame".to_string(),
                "-b".to_string(),
                "192".to_string(),
                "--cbr".to_string(),
                "--id3v2-only".to_string(),
                "-".to_string(),
                output,
            ];
            run_ffmpeg_lame(
                args_owned,
                lame_args,
                output_path,
                work_dir,
                current_pid,
                progress_state,
                app_handle,
            )
        } else {
            run_ffmpeg_in(
                args_owned,
                work_dir,
                current_pid,
                progress_state,
                app_handle,
            )
        }
    })
    .await
    .map_err(|e| app_err_with("task_failed", &[("detail", e.to_string())]))?;

    match result {
        Ok(()) => {
            let elapsed = started.elapsed().as_secs();
            log_line(&app, &format!("convert done elapsed_sec={}", elapsed));
            Ok(())
        }
        Err(err) => {
            log_line(&app, &format!("convert error={}", err));
            Err(err)
        }
    }
}

fn target_video_bitrate_kbit(target_size_mb: f64, duration_sec: f64) -> Result<u64, String> {
    if !target_size_mb.is_finite() || target_size_mb < 1.0 {
        return Err(app_err("target_size_min"));
    }
    if !duration_sec.is_finite() || duration_sec <= 0.0 {
        return Err(app_err("duration_unknown"));
    }
    const AUDIO_KBIT: f64 = 128.0;
    // Fünf Prozent Reserve für MP4-Container und Schwankungen der Zweipass-Kodierung.
    let total_kbit = target_size_mb * 0.95 * 8192.0 / duration_sec;
    let video_kbit = total_kbit - AUDIO_KBIT;
    if video_kbit < 50.0 {
        return Err(app_err("target_size_too_small"));
    }
    Ok(video_kbit.floor() as u64)
}

fn concat_file_line(path: &str) -> String {
    let escaped = path.replace('\\', "/").replace('\'', "'\\''");
    format!("file '{escaped}'\n")
}

fn unique_temp_prefix(label: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        "konvertierung_{label}_{}_{}",
        std::process::id(),
        stamp
    ))
}

fn remove_pass_files(prefix: &Path) {
    for suffix in ["-0.log", "-0.log.mbtree", ".log", ".log.mbtree"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", prefix.to_string_lossy()));
    }
}

fn two_pass_h264_args(
    input_args: &[String],
    output: &str,
    video_kbit: u64,
    passlog: &Path,
) -> (Vec<String>, Vec<String>) {
    let bitrate = format!("{video_kbit}k");
    let passlog = passlog.to_string_lossy().to_string();
    let null_output = if cfg!(target_os = "windows") {
        "NUL"
    } else {
        "/dev/null"
    };

    let mut pass1 = vec!["ffmpeg".to_string(), "-y".to_string()];
    pass1.extend_from_slice(input_args);
    pass1.extend(
        [
            "-map",
            "0:v:0",
            "-c:v",
            "libx264",
            "-b:v",
            &bitrate,
            "-pass",
            "1",
            "-passlogfile",
            &passlog,
            "-an",
            "-f",
            "null",
            "-progress",
            "pipe:1",
            null_output,
        ]
        .into_iter()
        .map(String::from),
    );

    let mut pass2 = vec!["ffmpeg".to_string(), "-y".to_string()];
    pass2.extend_from_slice(input_args);
    pass2.extend(
        [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-b:v",
            &bitrate,
            "-pass",
            "2",
            "-passlogfile",
            &passlog,
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            output,
        ]
        .into_iter()
        .map(String::from),
    );
    (pass1, pass2)
}

#[tauri::command]
async fn compress_to_size(
    input: String,
    output: String,
    target_size_mb: f64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if !Path::new(&input).is_file() {
        return Err(app_err("invalid_input"));
    }
    if Path::new(&input) == Path::new(&output) {
        return Err(app_err("same_input_output"));
    }
    ensure_output_dir(&output)?;
    let duration = probe_media_duration(&input)?;
    let video_kbit = target_video_bitrate_kbit(target_size_mb, duration)?;
    let passlog = unique_temp_prefix("pass");
    let input_args = vec!["-i".to_string(), input.clone()];
    let (pass1, pass2) = two_pass_h264_args(&input_args, &output, video_kbit, &passlog);
    log_line(
        &app,
        &format!(
            "compress start input={} output={} target_mb={} video_kbit={}",
            input, output, target_size_mb, video_kbit
        ),
    );

    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    let passlog_for_cleanup = passlog.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = run_ffmpeg(
            pass1,
            current_pid.clone(),
            progress_state.clone(),
            app_handle.clone(),
        )
        .and_then(|_| run_ffmpeg(pass2, current_pid, progress_state, app_handle));
        remove_pass_files(&passlog_for_cleanup);
        result
    })
    .await
    .map_err(|e| app_err_with("task_failed", &[("detail", e.to_string())]))?;
    if let Err(ref err) = result {
        log_line(&app, &format!("compress error={err}"));
    } else {
        log_line(&app, "compress done");
    }
    result
}

#[tauri::command]
async fn join_videos(
    inputs: Vec<String>,
    output: String,
    compress: bool,
    target_size_mb: f64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if inputs.len() < 2 {
        return Err(app_err("join_min_two"));
    }
    for input in &inputs {
        if !Path::new(input).is_file() {
            return Err(app_err_with("input_not_found", &[("path", input.clone())]));
        }
        if Path::new(input) == Path::new(&output) {
            return Err(app_err("join_output_overwrites_input"));
        }
    }
    ensure_output_dir(&output)?;
    let video_kbit = if compress {
        let duration: f64 = inputs
            .iter()
            .map(|p| probe_media_duration(p))
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum();
        Some(target_video_bitrate_kbit(target_size_mb, duration)?)
    } else {
        None
    };
    let list_path = unique_temp_prefix("concat").with_extension("txt");
    let list_content = inputs
        .iter()
        .map(|path| {
            std::fs::canonicalize(path)
                .map(|absolute| concat_file_line(&absolute.to_string_lossy()))
                .map_err(|e| {
                    app_err_with(
                        "path_unreadable",
                        &[("path", path.clone()), ("detail", e.to_string())],
                    )
                })
        })
        .collect::<Result<Vec<_>, _>>()?
        .concat();
    std::fs::write(&list_path, list_content)
        .map_err(|e| app_err_with("temp_list_create", &[("detail", e.to_string())]))?;
    let list_string = list_path.to_string_lossy().to_string();
    let concat_input = vec![
        "-f".to_string(),
        "concat".to_string(),
        "-safe".to_string(),
        "0".to_string(),
        "-i".to_string(),
        list_string,
    ];
    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    let passlog = unique_temp_prefix("join_pass");

    let commands = if let Some(video_kbit) = video_kbit {
        let (pass1, pass2) = two_pass_h264_args(&concat_input, &output, video_kbit, &passlog);
        vec![pass1, pass2]
    } else {
        let mut args = vec!["ffmpeg".to_string(), "-y".to_string()];
        args.extend(concat_input);
        args.extend(
            ["-c", "copy", "-movflags", "+faststart", &output]
                .into_iter()
                .map(String::from),
        );
        vec![args]
    };
    log_line(
        &app,
        &format!(
            "join start files={} compress={} output={}",
            inputs.len(),
            compress,
            output
        ),
    );
    let list_for_cleanup = list_path.clone();
    let passlog_for_cleanup = passlog.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = Ok(());
        for command in commands {
            if let Err(err) = run_ffmpeg(
                command,
                current_pid.clone(),
                progress_state.clone(),
                app_handle.clone(),
            ) {
                result = Err(err);
                break;
            }
        }
        let _ = std::fs::remove_file(list_for_cleanup);
        remove_pass_files(&passlog_for_cleanup);
        result
    })
    .await
    .map_err(|e| app_err_with("task_failed", &[("detail", e.to_string())]))?;
    if let Err(ref err) = result {
        log_line(&app, &format!("join error={err}"));
    } else {
        log_line(&app, "join done");
    }
    result
}

#[tauri::command]
async fn clip_media(
    input: String,
    output: String,
    start: String,
    end: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let started_at = Instant::now();
    log_line(
        &app,
        &format!(
            "clip start input={} output={} start={} end={}",
            input, output, start, end
        ),
    );
    if !Path::new(&input).is_file() {
        return Err(app_err("invalid_input"));
    }
    if !is_hh_mm_ss(&start) || !is_hh_mm_ss(&end) {
        return Err(app_err("time_format_invalid"));
    }
    ensure_output_dir(&output)?;

    let args = vec![
        "ffmpeg", "-i", &input, "-ss", &start, "-to", &end, "-c:v", "libx264", "-b:v", "450k",
        "-maxrate", "450k", "-bufsize", "900k", "-preset", "slow", "-c:a", "copy", "-map", "0:v:0",
        "-map", "0:a:0", "-map", "-0:d", &output,
    ];
    let args_owned = args.into_iter().map(|s| s.to_string()).collect();
    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(args_owned, current_pid, progress_state, app_handle)
    })
    .await
    .map_err(|e| app_err_with("task_failed", &[("detail", e.to_string())]))?;

    match result {
        Ok(()) => {
            let elapsed = started_at.elapsed().as_secs();
            log_line(&app, &format!("clip done elapsed_sec={}", elapsed));
            Ok(())
        }
        Err(err) => {
            log_line(&app, &format!("clip error={}", err));
            Err(err)
        }
    }
}

#[tauri::command]
async fn remove_clip(
    input: String,
    output: String,
    start: String,
    end: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let started_at = Instant::now();
    log_line(
        &app,
        &format!(
            "remove start input={} output={} start={} end={}",
            input, output, start, end
        ),
    );
    if !Path::new(&input).is_file() {
        return Err(app_err("invalid_input"));
    }
    if !is_hh_mm_ss(&start) || !is_hh_mm_ss(&end) {
        return Err(app_err("time_format_invalid"));
    }
    ensure_output_dir(&output)?;

    let out_dir = Path::new(&output)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let start_tag = start.replace(':', "-");
    let end_tag = end.replace(':', "-");
    let part1 = out_dir.join(format!("part1_00-00-00__{start_tag}.mp4"));
    let part2 = out_dir.join(format!("part2_{end_tag}__end.mp4"));
    let list_path = out_dir.join("list.txt");

    let list_content = format!("file '{}'\nfile '{}'\n", part1.display(), part2.display());
    std::fs::write(&list_path, list_content)
        .map_err(|e| app_err_with("temp_list_create", &[("detail", e.to_string())]))?;

    let part1_str = part1.to_string_lossy().to_string();
    let part2_str = part2.to_string_lossy().to_string();
    let list_str = list_path.to_string_lossy().to_string();

    let cmd1 = vec![
        "ffmpeg", "-i", &input, "-to", &start, "-c:v", "libx264", "-b:v", "450k", "-maxrate",
        "450k", "-bufsize", "900k", "-preset", "slow", "-c:a", "copy", "-map", "0:v:0", "-map",
        "0:a:0", "-map", "-0:d", &part1_str,
    ];
    let cmd2 = vec![
        "ffmpeg", "-i", &input, "-ss", &end, "-c:v", "libx264", "-b:v", "450k", "-maxrate", "450k",
        "-bufsize", "900k", "-preset", "slow", "-c:a", "copy", "-map", "0:v:0", "-map", "0:a:0",
        "-map", "-0:d", &part2_str,
    ];
    let cmd3 = vec![
        "ffmpeg", "-f", "concat", "-safe", "0", "-i", &list_str, "-c", "copy", &output,
    ];

    let cmds: Vec<Vec<String>> = vec![cmd1, cmd2, cmd3]
        .into_iter()
        .map(|c| c.into_iter().map(|s| s.to_string()).collect())
        .collect();

    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        for cmd in cmds {
            run_ffmpeg(
                cmd,
                current_pid.clone(),
                progress_state.clone(),
                app_handle.clone(),
            )?;
        }
        Ok(())
    })
    .await
    .map_err(|e| app_err_with("task_failed", &[("detail", e.to_string())]))?;

    match result {
        Ok(()) => {
            let elapsed = started_at.elapsed().as_secs();
            log_line(&app, &format!("remove done elapsed_sec={}", elapsed));
            Ok(())
        }
        Err(err) => {
            log_line(&app, &format!("remove error={}", err));
            Err(err)
        }
    }
}

/// AppUserModelID fuer die Windows-Taskleiste. Muss mit der ID in der
/// Startmenue-Verknuepfung uebereinstimmen, damit Windows das Fenster der
/// Verknuepfung zuordnet und beim Anheften diese statt der EXE pinnt.
/// Release = Bundle-Identifier aus tauri.conf.json (setzen auch NSIS/MSI),
/// Debug (cargo tauri dev) = eigene ID fuer die Dev-Verknuepfung.
#[cfg(target_os = "windows")]
const APP_USER_MODEL_ID: &str = if cfg!(debug_assertions) {
    "de.michael.konvertierung.dev"
} else {
    "de.michael.konvertierung"
};

#[cfg(target_os = "windows")]
fn set_app_user_model_id() {
    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }
    let wide: Vec<u16> = APP_USER_MODEL_ID
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    // Fehler sind unkritisch: dann gruppiert Windows nur nach EXE-Pfad.
    unsafe {
        SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

// Sucht auf GitHub nach einer neueren Version (latest.json im letzten Release).
// Im Dev-Modus wird nie ein Update gemeldet.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    let updater = app
        .updater()
        .map_err(|e| app_err_with("update_failed", &[("detail", e.to_string())]))?;
    let update = updater
        .check()
        .await
        .map_err(|e| app_err_with("update_failed", &[("detail", e.to_string())]))?;
    Ok(update.map(|u| {
        serde_json::json!({
            "version": u.version,
            "currentVersion": u.current_version,
            "notes": u.body,
        })
    }))
}

// Laedt das Update, prueft die Signatur, installiert und startet neu.
// Fortschritt per Event update_progress {downloaded, total}.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let to_err = |e: tauri_plugin_updater::Error| {
        app_err_with("update_failed", &[("detail", e.to_string())])
    };
    let update = app
        .updater()
        .map_err(to_err)?
        .check()
        .await
        .map_err(to_err)?
        .ok_or_else(|| app_err("update_none"))?;
    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit(
                    "update_progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            },
            || {},
        )
        .await
        .map_err(to_err)?;
    app.restart();
}

fn main() {
    // Vor dem Erzeugen des ersten Fensters setzen.
    #[cfg(target_os = "windows")]
    set_app_user_model_id();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            current_pid: Arc::new(Mutex::new(None)),
            progress: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            add_local_bin_to_path(&app.handle());
            let icon_bytes = include_bytes!("../icons/icon.png");
            if let Ok(icon) = Image::from_bytes(icon_bytes) {
                for window in app.webview_windows().values() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            convert_media,
            compress_to_size,
            join_videos,
            clip_media,
            remove_clip,
            cancel_current,
            get_progress,
            get_media_duration,
            get_log_path,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
