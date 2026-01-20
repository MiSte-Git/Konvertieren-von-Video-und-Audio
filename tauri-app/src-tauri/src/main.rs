use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use std::sync::{Arc, Mutex};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    current_pid: Arc<Mutex<Option<u32>>>,
    progress: Arc<Mutex<Option<HashMap<String, String>>>>,
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
            std::fs::create_dir_all(dir).map_err(|e| format!("Ausgabeordner kann nicht erstellt werden: {e}"))?;
        }
    }
    Ok(())
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

#[derive(Serialize, Clone)]
struct FfmpegProgress {
    values: HashMap<String, String>,
}

fn run_ffmpeg(
    mut args: Vec<String>,
    current_pid: Arc<Mutex<Option<u32>>>,
    progress_state: Arc<Mutex<Option<HashMap<String, String>>>>,
    app: AppHandle,
) -> Result<(), String> {
    if args.is_empty() {
        return Err("Leerer ffmpeg-Befehl".into());
    }
    if !args.iter().any(|a| a == "-progress") && args.len() >= 2 {
        let output = args.pop().unwrap_or_default();
        args.push("-progress".to_string());
        args.push("pipe:1".to_string());
        args.push(output);
    }
    let mut cmd = Command::new(&args[0]);
    cmd.args(&args[1..]).stdout(Stdio::piped()).stderr(Stdio::inherit());
    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg konnte nicht gestartet werden: {e}"))?;
    {
        let mut guard = current_pid.lock().map_err(|_| "Lock-Fehler".to_string())?;
        *guard = Some(child.id());
    }
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut values: HashMap<String, String> = HashMap::new();
        for line in reader.lines() {
            let line = line.map_err(|e| format!("ffmpeg-Ausgabe konnte nicht gelesen werden: {e}"))?;
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
    let status = child.wait().map_err(|e| format!("ffmpeg konnte nicht gestartet werden: {e}"))?;
    if let Ok(mut guard) = current_pid.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = progress_state.lock() {
        *guard = None;
    }
    if !status.success() {
        return Err(format!("ffmpeg fehlgeschlagen (Exit-Code {:?})", status.code()));
    }
    Ok(())
}

#[cfg(target_family = "unix")]
fn kill_pid(pid: u32) -> Result<(), String> {
    let status = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|e| format!("kill fehlgeschlagen: {e}"))?;
    if !status.success() {
        return Err("kill fehlgeschlagen".into());
    }
    Ok(())
}

#[cfg(target_family = "windows")]
fn kill_pid(pid: u32) -> Result<(), String> {
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map_err(|e| format!("taskkill fehlgeschlagen: {e}"))?;
    if !status.success() {
        return Err("taskkill fehlgeschlagen".into());
    }
    Ok(())
}

#[tauri::command]
fn cancel_current(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.current_pid.lock().map_err(|_| "Lock-Fehler".to_string())?;
    if let Some(pid) = *guard {
        kill_pid(pid)?;
        *guard = None;
        if let Ok(mut progress_guard) = state.progress.lock() {
            *progress_guard = None;
        }
        return Ok(());
    }
    Err("Kein laufender Prozess.".into())
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
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if !Path::new(&input).is_file() {
        return Err("Bitte eine gültige Eingabedatei wählen.".into());
    }
    ensure_output_dir(&output)?;

    let args = match mode.as_str() {
        "v2mp3" => vec![
            "ffmpeg", "-y", "-i", &input, "-vn", "-ar", "44100", "-ac", "2",
            "-c:a", "libmp3lame", "-b:a", "192k", &output,
        ],
        "a2mp3" => vec![
            "ffmpeg", "-y", "-i", &input, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", &output,
        ],
        "divx" => vec![
            "ffmpeg", "-y", "-hwaccel", "auto", "-fflags", "+genpts", "-i", &input,
            "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn",
            "-c:v", "mpeg4", "-vtag", "XVID", "-qscale:v", "7", "-bf", "0", "-mbd", "0", "-g", "250",
            "-me_method", "epzs", "-pix_fmt", "yuv420p", "-threads", "0", "-vsync", "1",
            "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", "-ar", "44100",
            "-f", "avi", "-use_odml", "1", "-max_interleave_delta", "0", "-metadata", "title=film",
            &output,
        ],
        _ => return Err("Unbekannter Modus".into()),
    };

    let args_owned = args.into_iter().map(|s| s.to_string()).collect();
    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(args_owned, current_pid, progress_state, app_handle)
    })
        .await
        .map_err(|e| e.to_string())?
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
    if !Path::new(&input).is_file() {
        return Err("Bitte eine gültige Eingabedatei wählen.".into());
    }
    if !is_hh_mm_ss(&start) || !is_hh_mm_ss(&end) {
        return Err("Zeitformat ungültig. Bitte HH:MM:SS verwenden.".into());
    }
    ensure_output_dir(&output)?;

    let args = vec![
        "ffmpeg", "-i", &input, "-ss", &start, "-to", &end,
        "-c:v", "libx264", "-b:v", "450k", "-maxrate", "450k", "-bufsize", "900k", "-preset", "slow",
        "-c:a", "copy", "-map", "0:v:0", "-map", "0:a:0", "-map", "-0:d",
        &output,
    ];
    let args_owned = args.into_iter().map(|s| s.to_string()).collect();
    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(args_owned, current_pid, progress_state, app_handle)
    })
        .await
        .map_err(|e| e.to_string())?
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
    if !Path::new(&input).is_file() {
        return Err("Bitte eine gültige Eingabedatei wählen.".into());
    }
    if !is_hh_mm_ss(&start) || !is_hh_mm_ss(&end) {
        return Err("Zeitformat ungültig. Bitte HH:MM:SS verwenden.".into());
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

    let list_content = format!(
        "file '{}'\nfile '{}'\n",
        part1.display(),
        part2.display()
    );
    std::fs::write(&list_path, list_content).map_err(|e| format!("list.txt konnte nicht erstellt werden: {e}"))?;

    let part1_str = part1.to_string_lossy().to_string();
    let part2_str = part2.to_string_lossy().to_string();
    let list_str = list_path.to_string_lossy().to_string();

    let cmd1 = vec![
        "ffmpeg", "-i", &input, "-to", &start,
        "-c:v", "libx264", "-b:v", "450k", "-maxrate", "450k", "-bufsize", "900k", "-preset", "slow",
        "-c:a", "copy", "-map", "0:v:0", "-map", "0:a:0", "-map", "-0:d",
        &part1_str,
    ];
    let cmd2 = vec![
        "ffmpeg", "-i", &input, "-ss", &end,
        "-c:v", "libx264", "-b:v", "450k", "-maxrate", "450k", "-bufsize", "900k", "-preset", "slow",
        "-c:a", "copy", "-map", "0:v:0", "-map", "0:a:0", "-map", "-0:d",
        &part2_str,
    ];
    let cmd3 = vec![
        "ffmpeg", "-f", "concat", "-safe", "0", "-i", &list_str,
        "-c", "copy", &output,
    ];

    let cmds: Vec<Vec<String>> = vec![cmd1, cmd2, cmd3]
        .into_iter()
        .map(|c| c.into_iter().map(|s| s.to_string()).collect())
        .collect();

    let current_pid = state.current_pid.clone();
    let progress_state = state.progress.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        for cmd in cmds {
            run_ffmpeg(cmd, current_pid.clone(), progress_state.clone(), app_handle.clone())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            current_pid: Arc::new(Mutex::new(None)),
            progress: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            add_local_bin_to_path(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            convert_media,
            clip_media,
            remove_clip,
            cancel_current,
            get_progress
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
