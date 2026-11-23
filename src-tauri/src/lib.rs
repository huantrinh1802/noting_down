use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

/// ~/Documents/noting_down (falls back to the app data dir).
fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("noting_down");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Keep only filename-safe characters so the frontend can't escape the notes dir.
fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if s.is_empty() {
        "note".into()
    } else {
        s
    }
}

#[tauri::command]
fn save_note(app: AppHandle, name: String, json: String) -> Result<(), String> {
    let path = notes_dir(&app)?.join(format!("{}.json", safe_name(&name)));
    // write-then-rename so a crash can't leave a half-written note
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_note(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = notes_dir(&app)?.join(format!("{}.json", safe_name(&name)));
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn export_png(app: AppHandle, name: String, data_base64: String) -> Result<String, String> {
    let bytes = STANDARD.decode(data_base64).map_err(|e| e.to_string())?;
    let path = notes_dir(&app)?.join(format!("{}.png", safe_name(&name)));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_note, load_note, export_png])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::safe_name;

    #[test]
    fn names_are_sanitised() {
        assert_eq!(safe_name("../../etc/passwd"), "etcpasswd");
        assert_eq!(safe_name("///"), "note");
        assert_eq!(safe_name("my-note_1"), "my-note_1");
    }
}
