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

/// Registro do que a janela de busca fez (aparece na aba Buscar, para
/// entender por que um download não chegou).
#[derive(Debug, Clone, Serialize)]
pub struct SearchLog {
    pub kind: &'static str,
    pub detail: String,
}

fn log(app: &AppHandle, kind: &'static str, detail: impl Into<String>) {
    let _ = app.emit_to(
        "main",
        "search-log",
        SearchLog {
            kind,
            detail: detail.into(),
        },
    );
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
    // Link direto sem extensão no nome: reconhece o formato pelo conteúdo.
    let path = if is_score_file(&path) {
        path
    } else {
        match std::fs::read(&path)
            .ok()
            .as_deref()
            .and_then(sniff_extension)
        {
            Some(ext) => {
                let renamed = PathBuf::from(format!("{}.{ext}", path.to_string_lossy()));
                match std::fs::rename(&path, &renamed) {
                    Ok(()) => renamed,
                    Err(_) => path,
                }
            }
            None => path,
        }
    };
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
                // O nome sugerido pelo site vale; a pasta é a do app. Links como
                // o do Cifra Club (`.../gp_partitura_download.php?arq=musica.gp3`)
                // trazem o nome verdadeiro num parâmetro.
                let suggested = destination
                    .file_name()
                    .map(|n| n.to_owned())
                    .or_else(|| url.path_segments()?.next_back().map(Into::into));
                let name = match suggested {
                    Some(n) if is_score_file(Path::new(&n)) => n,
                    other => score_name_in_query(&url)
                        .map(Into::into)
                        .or(other)
                        .unwrap_or_else(|| "download".into()),
                };
                *destination = downloads.join(&name);
                log(
                    webview.app_handle(),
                    "download",
                    format!("{} ← {url}", name.to_string_lossy()),
                );
            }
            DownloadEvent::Finished { path, success, url } => {
                let app = webview.app_handle().clone();
                log(
                    &app,
                    if success { "baixado" } else { "falhou" },
                    path.as_ref()
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or_else(|| url.to_string()),
                );
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

const SCORE_LINKS_SCRIPT: &str = include_str!("search_links.js");

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
        // Clique em link de partitura abre o download aqui mesmo, antes do
        // código do site (que abriria uma aba nova por script).
        .initialization_script(SCORE_LINKS_SCRIPT)
        // Links com nova aba (como o "Guitar Pro" do Cifra Club, que abre uma
        // aba vazia e depois manda o arquivo para ela) ganham uma janela de
        // verdade, como num navegador. Download feito nela vai para a
        // biblioteca e a janela fecha sozinha.
        .on_new_window(move |url, features| {
            if !opens_popup(&url) {
                log(&popup_app, "janela recusada", url.as_str());
                return NewWindowResponse::Deny;
            }
            log(&popup_app, "janela nova", url.as_str());
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
            .on_navigation({
                let app = popup_app.clone();
                move |url| {
                    log(&app, "janela nova abriu", url.as_str());
                    true
                }
            })
            .on_document_title_changed(move |window, title| {
                if window.label() == popup_label {
                    let _ = window.set_title(&title);
                }
            })
            .build();
            match built {
                Ok(window) => NewWindowResponse::Create { window },
                Err(e) => {
                    log(&popup_app, "erro", format!("não abriu a janela nova: {e}"));
                    NewWindowResponse::Deny
                }
            }
        })
        .on_download(download_handler(downloads, false))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Extensão pelo conteúdo, para links sem extensão no nome.
fn sniff_extension(data: &[u8]) -> Option<&'static str> {
    let head = String::from_utf8_lossy(&data[..data.len().min(40)]).to_string();
    if head.contains("FICHIER GUITAR PRO v3") {
        Some("gp3")
    } else if head.contains("FICHIER GUITAR PRO v4") {
        Some("gp4")
    } else if head.contains("FICHIER GUITAR PRO v5") {
        Some("gp5")
    } else if data.starts_with(b"BCF") {
        Some("gpx")
    } else if data.starts_with(b"PK") {
        // Guitar Pro 7/8 (.gp) e MusicXML compactado (.mxl) são zip.
        let text = String::from_utf8_lossy(data);
        Some(if text.contains("Content/score.gpif") {
            "gp"
        } else {
            "mxl"
        })
    } else if head.trim_start().starts_with("<?xml") || head.contains("<score-partwise") {
        Some("musicxml")
    } else {
        None
    }
}

/// Nome de partitura num parâmetro do link (ex.: `arq=coldplay-clocks.gp3`).
fn score_name_in_query(url: &Url) -> Option<String> {
    url.query_pairs().find_map(|(_, value)| {
        let name = value.rsplit(['/', '\\']).next()?.to_string();
        is_score_file(Path::new(&name)).then_some(name)
    })
}

/// Nome do arquivo de um link: o do `Content-Disposition`, o de um parâmetro,
/// ou o fim do caminho.
fn file_name_from(url: &Url, disposition: Option<&str>) -> String {
    disposition
        .and_then(|d| {
            d.split(';').find_map(|part| {
                let part = part.trim();
                let value = part
                    .strip_prefix("filename*=UTF-8''")
                    .or_else(|| part.strip_prefix("filename="))?;
                Some(value.trim_matches('"').to_string())
            })
        })
        .or_else(|| score_name_in_query(url))
        .or_else(|| url.path_segments()?.next_back().map(str::to_string))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "partitura".into())
}

/// Baixa um link direto de partitura e importa para a biblioteca.
pub fn import_url(app: &AppHandle, url: &str) -> Result<crate::library::Song, String> {
    let url: Url = url.parse().map_err(|e| format!("Endereço inválido: {e}"))?;
    if !matches!(url.scheme(), "https" | "http") {
        return Err("Só endereços http(s)".into());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(60)))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) PartiTAB")
        .build()
        .into();
    let mut response = agent
        .get(url.as_str())
        .call()
        .map_err(|e| format!("Não foi possível baixar: {e}"))?;
    let disposition = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let data = response
        .body_mut()
        .with_config()
        .limit(30 * 1024 * 1024)
        .read_to_vec()
        .map_err(|e| format!("O download foi interrompido: {e}"))?;
    let mut name = file_name_from(&url, disposition.as_deref());
    if !is_score_file(Path::new(&name)) {
        match sniff_extension(&data) {
            Some(ext) => name = format!("{name}.{ext}"),
            None => {
                return Err(
                    "O link não é de um arquivo de partitura (talvez seja uma página ou peça login)"
                        .into(),
                );
            }
        }
    }
    app.state::<LibraryState>()
        .get()?
        .import_bytes(&name, &data, None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_score_format_from_content_and_headers() {
        assert_eq!(
            sniff_extension(b"\x18FICHIER GUITAR PRO v3.00\x00\x00"),
            Some("gp3")
        );
        assert_eq!(
            sniff_extension(b"\x18FICHIER GUITAR PRO v5.10"),
            Some("gp5")
        );
        assert_eq!(sniff_extension(b"BCFZ...."), Some("gpx"));
        assert_eq!(
            sniff_extension(b"PK\x03\x04...Content/score.gpif"),
            Some("gp")
        );
        assert_eq!(
            sniff_extension(b"<?xml version=\"1.0\"?>"),
            Some("musicxml")
        );
        assert_eq!(sniff_extension(b"<!DOCTYPE html><html>"), None);

        let cifra: Url = "https://www.cifraclub.com.br/ajax/gp_partitura_download.php?c=822&a=1033&m=8795&t=6&arq=coldplay-clocks.gp3".parse().unwrap();
        assert_eq!(
            score_name_in_query(&cifra).as_deref(),
            Some("coldplay-clocks.gp3")
        );
        assert_eq!(file_name_from(&cifra, None), "coldplay-clocks.gp3");

        let url: Url = "https://x.com/download/123?t=1".parse().unwrap();
        assert_eq!(score_name_in_query(&url), None);
        assert_eq!(file_name_from(&url, None), "123");
        assert_eq!(
            file_name_from(&url, Some(r#"attachment; filename="Clocks.gp3""#)),
            "Clocks.gp3"
        );
        assert_eq!(
            file_name_from(&url, Some("attachment; filename*=UTF-8''M%C3%BAsica.gp5")),
            "M%C3%BAsica.gp5"
        );
    }

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
