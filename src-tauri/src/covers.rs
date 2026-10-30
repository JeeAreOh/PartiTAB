//! Capas de álbum: busca no catálogo do iTunes (sem chave de API) e
//! download da imagem escolhida.

use std::time::Duration;

use serde::{Deserialize, Serialize};

const SEARCH_URL: &str = "https://itunes.apple.com/search";
/// Imagens maiores que isso não são capas.
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoverCandidate {
    /// Imagem grande (600×600) para salvar.
    pub url: String,
    /// Miniatura para a lista de opções.
    pub thumb: String,
    pub album: String,
    pub artist: String,
    pub title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesResponse {
    results: Vec<ItunesItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesItem {
    artwork_url100: Option<String>,
    collection_name: Option<String>,
    artist_name: Option<String>,
    track_name: Option<String>,
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .user_agent("PartiTAB/0.1")
        .build()
        .into()
}

/// Uma opção por álbum, na ordem do iTunes.
pub fn parse_itunes(json: &str) -> Result<Vec<CoverCandidate>, String> {
    let response: ItunesResponse =
        serde_json::from_str(json).map_err(|e| format!("Resposta inesperada do iTunes: {e}"))?;
    let mut seen = std::collections::HashSet::new();
    Ok(response
        .results
        .into_iter()
        .filter_map(|item| {
            let thumb = item.artwork_url100?;
            // O iTunes devolve 100×100; o mesmo endereço serve outros tamanhos.
            let url = thumb.replace("100x100bb", "600x600bb");
            seen.insert(url.clone()).then(|| CoverCandidate {
                url,
                thumb: thumb.replace("100x100bb", "200x200bb"),
                album: item.collection_name.unwrap_or_default(),
                artist: item.artist_name.unwrap_or_default(),
                title: item.track_name.unwrap_or_default(),
            })
        })
        .collect())
}

/// Procura capas pelo artista e título da música.
pub fn search(artist: &str, title: &str) -> Result<Vec<CoverCandidate>, String> {
    let term = format!("{artist} {title}");
    let term = term.trim();
    if term.is_empty() {
        return Ok(Vec::new());
    }
    let body = agent()
        .get(SEARCH_URL)
        .query("term", term)
        .query("media", "music")
        .query("entity", "song")
        .query("limit", "24")
        .query("country", "BR")
        .call()
        .map_err(|e| format!("Não foi possível buscar capas: {e}"))?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    parse_itunes(&body)
}

/// Extensão do arquivo pelo tipo da imagem (só os formatos que a interface mostra).
pub fn image_extension(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next()?.trim() {
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

/// Baixa uma imagem https. Devolve os bytes e a extensão.
pub fn download(url: &str) -> Result<(Vec<u8>, &'static str), String> {
    if !url.starts_with("https://") {
        return Err("Só imagens https podem ser baixadas".into());
    }
    let mut response = agent()
        .get(url)
        .call()
        .map_err(|e| format!("Não foi possível baixar a capa: {e}"))?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let ext = image_extension(&content_type).ok_or("O endereço não é uma imagem")?;
    let data = response
        .body_mut()
        .with_config()
        .limit(MAX_IMAGE_BYTES)
        .read_to_vec()
        .map_err(|e| e.to_string())?;
    Ok((data, ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_itunes_results_one_per_album() {
        let json = r#"{"resultCount":3,"results":[
          {"artistName":"Luiz Gonzaga","collectionName":"Asa Branca","trackName":"Asa Branca",
           "artworkUrl100":"https://is1.mzstatic.com/image/a/100x100bb.jpg"},
          {"artistName":"Luiz Gonzaga","collectionName":"Asa Branca","trackName":"Asa Branca (ao vivo)",
           "artworkUrl100":"https://is1.mzstatic.com/image/a/100x100bb.jpg"},
          {"artistName":"Caetano Veloso","collectionName":"Transa",
           "artworkUrl100":"https://is1.mzstatic.com/image/b/100x100bb.jpg"},
          {"artistName":"Sem capa","collectionName":"X"}
        ]}"#;
        let covers = parse_itunes(json).unwrap();
        assert_eq!(covers.len(), 2);
        assert_eq!(
            covers[0].url,
            "https://is1.mzstatic.com/image/a/600x600bb.jpg"
        );
        assert_eq!(
            covers[0].thumb,
            "https://is1.mzstatic.com/image/a/200x200bb.jpg"
        );
        assert_eq!(
            (covers[1].artist.as_str(), covers[1].title.as_str()),
            ("Caetano Veloso", "")
        );
        assert!(parse_itunes("<html>").is_err());
    }

    #[test]
    fn accepts_only_displayable_images() {
        assert_eq!(image_extension("image/jpeg"), Some("jpg"));
        assert_eq!(image_extension("image/png; charset=binary"), Some("png"));
        assert_eq!(image_extension("text/html"), None);
        assert!(download("http://exemplo.com/a.jpg").is_err());
    }
}
