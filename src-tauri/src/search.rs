//! Navegador de busca de partituras: abre sites numa janela do app e manda
//! para a biblioteca todo arquivo de partitura baixado nela.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::LibraryState;

const WINDOW: &str = "busca";

/// Formatos que o app abre (os mesmos do diálogo "Abrir arquivo").
const SCORE_EXTENSIONS: &[&str] = &[
    "gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl", "xml", "cap",
];

/// Resultado de um download feito no navegador de busca.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DownloadResult {
    Imported {
        song: crate::library::Song,
    },
    /// Arquivo baixado que não é partitura (ex.: PDF).
    Ignored {
        file_name: String,
        reason: String,
    },
    Failed {
        file_name: String,
        reason: String,
    },
}

/// Endereços que a janela de busca segue quando o site pede uma janela nova.
fn follows_in_same_window(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "blob")
}

pub fn is_score_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| SCORE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
}

/// Explicação para arquivos que não dá para usar.
fn ignored_reason(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("pdf") => "PDF é imagem da partitura; o app precisa de Guitar Pro ou MusicXML".into(),
        Some("mid" | "midi") => "MIDI ainda não é suportado".into(),
        Some("mscz" | "mscx") => "arquivo do MuseScore: exporte como MusicXML no MuseScore".into(),
        Some("zip") => "arquivo compactado: extraia e use Adicionar partituras".into(),
        _ => "não é um formato de partitura suportado".into(),
    }
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "download".into())
}

/// Importa o arquivo baixado e avisa a janela principal.
fn handle_finished(app: &AppHandle, path: PathBuf) {
    let file_name = file_name_of(&path);
    let result = if !is_score_file(&path) {
        let _ = std::fs::remove_file(&path);
        DownloadResult::Ignored {
            reason: ignored_reason(&path),
            file_name,
        }
    } else {
        let imported = app
            .state::<LibraryState>()
            .get()
            .and_then(|lib| lib.import(&path, None, None));
        let _ = std::fs::remove_file(&path);
        match imported {
            Ok(song) => DownloadResult::Imported { song },
            Err(reason) => DownloadResult::Failed { file_name, reason },
        }
    };
    let _ = app.emit_to("main", "search-download", result);
}

/// Abre (ou reaproveita) a janela de busca no endereço dado.
pub fn open(app: &AppHandle, url: &str) -> Result<(), String> {
    let url: Url = url.parse().map_err(|e| format!("Endereço inválido: {e}"))?;
    if !matches!(url.scheme(), "https" | "http") {
        return Err("Só endereços http(s) podem ser abertos".into());
    }
    if let Some(window) = app.get_webview_window(WINDOW) {
        window.navigate(url).map_err(|e| e.to_string())?;
        let _ = window.unminimize();
        return window.set_focus().map_err(|e| e.to_string());
    }

    let downloads = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("downloads");
    std::fs::create_dir_all(&downloads).map_err(|e| e.to_string())?;

    let popup_app = app.clone();
    WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::External(url))
        .title("Buscar partituras — os arquivos baixados vão para a biblioteca")
        .inner_size(1180.0, 820.0)
        // Links que abririam outra aba ou janela (como o "Guitar Pro" do Cifra
        // Club) abrem nesta mesma janela; sem isso o clique não faz nada.
        .on_new_window(move |url, _features| {
            if follows_in_same_window(&url) {
                let app = popup_app.clone();
                // Fora do callback do navegador: navegar dentro dele pode travar.
                std::thread::spawn(move || {
                    if let Some(window) = app.get_webview_window(WINDOW) {
                        let _ = window.navigate(url);
                    }
                });
            }
            NewWindowResponse::Deny
        })
        .on_download(move |webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    // Baixa numa pasta do app (o original sugerido dá o nome).
                    let name = destination
                        .file_name()
                        .map(|n| n.to_owned())
                        .or_else(|| url.path_segments()?.next_back().map(Into::into))
                        .unwrap_or_else(|| "download".into());
                    *destination = downloads.join(name);
                }
                DownloadEvent::Finished { path, success, url } => {
                    let app = webview.app_handle().clone();
                    match (success, path) {
                        (true, Some(path)) => {
                            // Fora da thread da interface: a importação lê e copia o arquivo.
                            std::thread::spawn(move || handle_finished(&app, path));
                        }
                        _ => {
                            let file_name = url
                                .path_segments()
                                .and_then(|mut s| s.next_back().map(str::to_string))
                                .unwrap_or_else(|| "download".into());
                            let _ = app.emit_to(
                                "main",
                                "search-download",
                                DownloadResult::Failed {
                                    file_name,
                                    reason: "o download não terminou".into(),
                                },
                            );
                        }
                    }
                }
                _ => {}
            }
            true
        })
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_windows_open_in_the_search_window() {
        let ok = |u: &str| follows_in_same_window(&u.parse().unwrap());
        assert!(ok(
            "https://www.cifraclub.com.br/coldplay/clocks/guitarpro/"
        ));
        assert!(ok("blob:https://www.cifraclub.com.br/0f1e"));
        assert!(!ok("about:blank"));
        assert!(!ok("javascript:alert(1)"));
        assert!(!ok("file:///C:/Windows/notepad.exe"));
    }

    #[test]
    fn recognizes_score_files_case_insensitively() {
        for name in ["a.gp5", "b.GPX", "c.gp", "d.musicxml", "e.MXL", "f.xml"] {
            assert!(is_score_file(Path::new(name)), "{name}");
        }
        for name in ["a.pdf", "b.mid", "c.mscz", "d", "e.gp5.part"] {
            assert!(!is_score_file(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn serializes_like_the_interface_expects() {
        let ignored = DownloadResult::Ignored {
            file_name: "a.pdf".into(),
            reason: "x".into(),
        };
        assert_eq!(
            serde_json::to_value(&ignored).unwrap(),
            serde_json::json!({ "type": "ignored", "fileName": "a.pdf", "reason": "x" })
        );
    }

    #[test]
    fn explains_unsupported_files() {
        assert!(ignored_reason(Path::new("x.PDF")).contains("PDF"));
        assert!(ignored_reason(Path::new("x.mscz")).contains("MusicXML"));
        assert!(ignored_reason(Path::new("x.mid")).contains("MIDI"));
    }
}
