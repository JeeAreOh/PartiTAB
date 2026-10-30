//! Navegador de busca de partituras: abre sites numa janela do app e manda
//! para a biblioteca todo arquivo de partitura baixado nela.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use serde::Serialize;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Emitter, Manager, Url, Webview, WebviewUrl, WebviewWindowBuilder};

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

/// Endereços que podem abrir numa janela nova pedida pelo site (a aba vazia
/// que o site preenche depois inclusa).
fn opens_popup(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "blob") || url.as_str() == "about:blank"
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

/// Trata os downloads de uma janela de busca: baixa numa pasta do app e
/// importa para a biblioteca. Com `close_after`, fecha a janela ao terminar
/// (janelas abertas só para baixar, como a aba nova do Cifra Club).
fn download_handler(
    downloads: PathBuf,
    close_after: bool,
) -> impl Fn(Webview, DownloadEvent<'_>) -> bool + Send + Sync + 'static {
    move |webview, event| {
        match event {
            DownloadEvent::Requested { url, destination } => {
                // O nome sugerido pelo site vale; a pasta é a do app.
                let name = destination
                    .file_name()
                    .map(|n| n.to_owned())
                    .or_else(|| url.path_segments()?.next_back().map(Into::into))
                    .unwrap_or_else(|| "download".into());
                *destination = downloads.join(name);
            }
            DownloadEvent::Finished { path, success, url } => {
                let app = webview.app_handle().clone();
                let label = webview.label().to_string();
                // Fora da thread da interface: a importação lê e copia o arquivo.
                std::thread::spawn(move || {
                    match (success, path) {
                        (true, Some(path)) => handle_finished(&app, path),
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
                    if close_after && let Some(window) = app.get_webview_window(&label) {
                        let _ = window.close();
                    }
                });
            }
            _ => {}
        }
        true
    }
}

/// Janelas abertas pelos sites (links com nova aba, `window.open`).
static POPUPS: AtomicU32 = AtomicU32::new(0);

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
    let popup_downloads = downloads.clone();
    WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::External(url))
        .title("Buscar partituras — os arquivos baixados vão para a biblioteca")
        .inner_size(1180.0, 820.0)
        // Links com nova aba (como o "Guitar Pro" do Cifra Club, que abre uma
        // aba vazia e depois manda o arquivo para ela) ganham uma janela de
        // verdade, como num navegador. Download feito nela vai para a
        // biblioteca e a janela fecha sozinha.
        .on_new_window(move |url, features| {
            if !opens_popup(&url) {
                return NewWindowResponse::Deny;
            }
            let label = format!("busca-janela-{}", POPUPS.fetch_add(1, Ordering::Relaxed));
            let popup_label = label.clone();
            let built = WebviewWindowBuilder::new(
                &popup_app,
                label,
                WebviewUrl::External("about:blank".parse().expect("endereço fixo")),
            )
            .window_features(features)
            .title("Buscar partituras")
            .on_download(download_handler(popup_downloads.clone(), true))
            // Dentro da janela nova, outras abas abrem nela mesma.
            .on_new_window(move |_url, _features| NewWindowResponse::Deny)
            .on_document_title_changed(move |window, title| {
                if window.label() == popup_label {
                    let _ = window.set_title(&title);
                }
            })
            .build();
            match built {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => NewWindowResponse::Deny,
            }
        })
        .on_download(download_handler(downloads, false))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_windows_open_as_popups() {
        let ok = |u: &str| opens_popup(&u.parse().unwrap());
        assert!(ok(
            "https://www.cifraclub.com.br/coldplay/clocks/guitarpro/"
        ));
        assert!(ok("blob:https://www.cifraclub.com.br/0f1e"));
        assert!(ok("about:blank"));
        assert!(!ok("about:srcdoc"));
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
