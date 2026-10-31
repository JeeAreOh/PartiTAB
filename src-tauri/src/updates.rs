//! Verificador de versão. As versões são publicadas como releases do
//! repositório público no GitHub; a consulta e o download não precisam de
//! autenticação.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

pub const REPO: &str = "JeeAreOh/PartiTAB";
const API: &str = "https://api.github.com";
/// Onde versões antigas guardavam o token do GitHub.
const OLD_SETTINGS_FILE: &str = "atualizacao.json";

/// Apaga o token que versões antigas (repositório privado) guardavam: ele não
/// é mais usado, e é uma credencial.
pub fn forget_token(dir: &Path) {
    let _ = fs::remove_file(dir.join(OLD_SETTINGS_FILE));
}

/// Versão como (maior, menor, correção); ignora "v" e sufixos ("-beta").
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['-', '+'])
        .next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let major = parts.next()??;
    let minor = parts.next().flatten().unwrap_or(0);
    let patch = parts.next().flatten().unwrap_or(0);
    Some((major, minor, patch))
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Asset {
    pub id: u64,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub available: bool,
    pub title: String,
    pub notes: String,
    pub published_at: Option<String>,
    pub url: String,
    /// Instalador para Windows (o `-setup.exe` do NSIS, ou o `.msi`).
    pub installer: Option<Asset>,
}

/// Escolhe o instalador da release: o `-setup.exe` (NSIS), senão o `.msi`.
fn pick_installer(assets: &[Asset]) -> Option<Asset> {
    let by_suffix = |suffix: &str| {
        assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(suffix))
            .cloned()
    };
    by_suffix("-setup.exe")
        .or_else(|| by_suffix(".exe"))
        .or_else(|| by_suffix(".msi"))
}

pub fn parse_release(json: &str, current: &str) -> Result<UpdateInfo, String> {
    let release: Release =
        serde_json::from_str(json).map_err(|e| format!("Resposta inesperada do GitHub: {e}"))?;
    let latest = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    Ok(UpdateInfo {
        available: is_newer(&latest, current),
        current: current.to_string(),
        title: release
            .name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| release.tag_name.clone()),
        notes: release.body.unwrap_or_default(),
        published_at: release.published_at,
        url: release.html_url,
        installer: pick_installer(&release.assets),
        latest,
    })
}

fn agent(timeout: u64) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(timeout)))
        .user_agent("PartiTAB-updater")
        .build()
        .into()
}

fn explain(e: ureq::Error) -> String {
    match e {
        ureq::Error::StatusCode(403 | 429) => {
            "O GitHub limitou as consultas por agora; tente de novo daqui a uma hora".into()
        }
        ureq::Error::StatusCode(404) => "Não encontrei versões publicadas".into(),
        e => format!("Não foi possível falar com o GitHub: {e}"),
    }
}

fn request(url: String, timeout: u64) -> ureq::RequestBuilder<ureq::typestate::WithoutBody> {
    agent(timeout)
        .get(url)
        .header("X-GitHub-Api-Version", "2022-11-28")
}

/// Consulta a última release publicada.
pub fn check(current: &str) -> Result<UpdateInfo, String> {
    let body = request(format!("{API}/repos/{REPO}/releases/latest"), 20)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(explain)?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    parse_release(&body, current)
}

/// Baixa o instalador para a pasta temporária e devolve o caminho.
pub fn download(asset: &Asset, dir: &Path) -> Result<PathBuf, String> {
    // Só o nome do arquivo (o nome vem da release, mas não deve escapar da pasta).
    let name = Path::new(&asset.name)
        .file_name()
        .ok_or("Nome de instalador inválido")?
        .to_owned();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    let mut response = request(format!("{API}/repos/{REPO}/releases/assets/{}", asset.id), 600)
        .header("Accept", "application/octet-stream")
        .call()
        .map_err(explain)?;
    let data = response
        .body_mut()
        .with_config()
        .limit(asset.size.max(1) + 1024 * 1024)
        .read_to_vec()
        .map_err(|e| format!("O download foi interrompido: {e}"))?;
    if asset.size > 0 && data.len() as u64 != asset.size {
        return Err("O instalador baixado está incompleto".into());
    }
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("0.4"), Some((0, 4, 0)));
        assert_eq!(parse_version("2.0.0-beta.1"), Some((2, 0, 0)));
        assert_eq!(parse_version("x"), None);
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(is_newer("v0.10.0", "0.9.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("lixo", "0.1.0"));
    }

    #[test]
    fn reads_release_and_picks_nsis_installer() {
        let json = r#"{
          "tag_name": "v0.2.0", "name": "PartiTAB 0.2.0", "body": "- Capas",
          "html_url": "https://github.com/JeeAreOh/PartiTAB/releases/tag/v0.2.0",
          "published_at": "2026-10-30T12:00:00Z",
          "assets": [
            {"id": 1, "name": "PartiTAB_0.2.0_x64_en-US.msi", "size": 10},
            {"id": 2, "name": "PartiTAB_0.2.0_x64-setup.exe", "size": 20}
          ]
        }"#;
        let info = parse_release(json, "0.1.0").unwrap();
        assert!(info.available);
        assert_eq!(info.latest, "0.2.0");
        assert_eq!(info.title, "PartiTAB 0.2.0");
        assert_eq!(info.installer.unwrap().id, 2);

        let only_msi =
            r#"{"tag_name":"v0.1.0","html_url":"u","assets":[{"id":7,"name":"a.msi","size":1}]}"#;
        let info = parse_release(only_msi, "0.1.0").unwrap();
        assert!(!info.available);
        assert_eq!(info.title, "v0.1.0");
        assert_eq!(info.installer.unwrap().id, 7);
        assert!(parse_release("{}", "0.1.0").is_err());
    }

    #[test]
    fn forgets_the_old_token_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(OLD_SETTINGS_FILE), r#"{"token":"github_pat_abc"}"#).unwrap();
        forget_token(dir.path());
        assert!(!dir.path().join(OLD_SETTINGS_FILE).exists());
        forget_token(dir.path()); // sem arquivo, não falha
    }

    #[test]
    fn explains_errors() {
        assert!(explain(ureq::Error::StatusCode(404)).contains("versões"));
        assert!(explain(ureq::Error::StatusCode(403)).contains("limitou"));
    }
}
