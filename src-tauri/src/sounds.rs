//! Timbres do piano: instrumentos de um SoundFont, ajustes de som e o
//! catálogo de SoundFonts gratuitos para baixar dentro do app.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rustysynth::SoundFont;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// SoundFont que acompanha o app (o mesmo da reprodução do alphaTab).
pub const DEFAULT_SOUNDFONT: &str = "soundfonts/sonivox.sf2";
/// Pasta (dentro dos dados do app) onde ficam os SoundFonts baixados.
pub const DOWNLOAD_DIR: &str = "soundfonts";

/// Um instrumento do SoundFont (banco + programa General MIDI).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PresetInfo {
    pub bank: u8,
    pub patch: u8,
    pub name: String,
}

/// Instrumentos tocáveis no canal do piano, em ordem de banco e programa.
/// Kits de bateria (banco 128) ficam de fora: só soam no canal 10.
pub fn presets(sound_font: &SoundFont) -> Vec<PresetInfo> {
    let mut list: Vec<PresetInfo> = sound_font
        .get_presets()
        .iter()
        .filter(|p| {
            (0..128).contains(&p.get_bank_number()) && (0..128).contains(&p.get_patch_number())
        })
        .map(|p| PresetInfo {
            bank: p.get_bank_number() as u8,
            patch: p.get_patch_number() as u8,
            name: p.get_name().trim().to_string(),
        })
        .collect();
    list.sort_by_key(|p| (p.bank, p.patch));
    list.dedup_by_key(|p| (p.bank, p.patch));
    list
}

/// Como a força do toque vira volume da nota.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VelocityCurve {
    /// Toque leve já soa forte (teclas duras ou mão leve).
    Light,
    #[default]
    Normal,
    /// Precisa de mais força para soar forte.
    Heavy,
    /// Toda nota com o mesmo volume.
    Fixed,
}

impl VelocityCurve {
    pub fn apply(self, velocity: u8) -> u8 {
        let v = velocity.min(127);
        if v == 0 {
            return 0;
        }
        let exponent = match self {
            VelocityCurve::Normal => return v,
            VelocityCurve::Fixed => return 100,
            VelocityCurve::Light => 0.6,
            VelocityCurve::Heavy => 1.6,
        };
        let out = 127.0 * (f32::from(v) / 127.0).powf(exponent);
        (out.round() as u8).clamp(1, 127)
    }

    pub fn to_u8(self) -> u8 {
        self as u8
    }

    pub fn from_u8(value: u8) -> Self {
        match value {
            0 => VelocityCurve::Light,
            2 => VelocityCurve::Heavy,
            3 => VelocityCurve::Fixed,
            _ => VelocityCurve::Normal,
        }
    }
}

/// Ajustes do som do piano tocado no teclado.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundSettings {
    pub bank: u8,
    pub patch: u8,
    /// 0–100.
    pub volume: u8,
    /// Quantidade de reverb, 0–127 (CC 91).
    pub reverb: u8,
    pub curve: VelocityCurve,
}

impl Default for SoundSettings {
    fn default() -> Self {
        // Volume 50 = o volume mestre padrão do RustySynth; reverb 40 = o padrão do canal.
        Self {
            bank: 0,
            patch: 0,
            volume: 50,
            reverb: 40,
            curve: VelocityCurve::Normal,
        }
    }
}

impl SoundSettings {
    pub fn clamped(self) -> Self {
        Self {
            bank: self.bank.min(127),
            patch: self.patch.min(127),
            volume: self.volume.min(100),
            reverb: self.reverb.min(127),
            curve: self.curve,
        }
    }

    pub fn master_volume(&self) -> f32 {
        f32::from(self.volume) / 100.0
    }
}

/// Um SoundFont gratuito que o app sabe baixar.
pub struct CatalogEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub url: &'static str,
    pub file: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

/// Endereços fixos (commit ou revisão) e conferidos pelo SHA-256, para o
/// arquivo baixado ser exatamente o que foi testado.
pub const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "generaluser-gs",
        name: "GeneralUser GS",
        description: "Piano de cauda bem equilibrado e 260 instrumentos. Leve e recomendado.",
        license: "Livre (S. Christian Collins)",
        url: "https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2",
        file: "GeneralUser-GS.sf2",
        size: 32_319_396,
        sha256: "9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe",
    },
    CatalogEntry {
        id: "fluidr3-gm",
        name: "FluidR3 GM",
        description: "General MIDI completo com amostras grandes. Piano mais encorpado; ocupa mais memória.",
        license: "MIT (Frank Wen)",
        url: "https://raw.githubusercontent.com/urish/cinto/f5c3c5fb738af6a75c867cb9991900421c32a8fb/media/FluidR3%20GM.sf2",
        file: "FluidR3_GM.sf2",
        size: 148_358_590,
        sha256: "eebdac4b1f95625bf2902b77838769111cb478fb9d2c66aa8e9a8ae80fe7d0c0",
    },
    CatalogEntry {
        id: "timgm6mb",
        name: "TimGM6mb",
        description: "General MIDI compacto, do MuseScore 1. Bom para computadores modestos.",
        license: "GPL (Tim Brechbill)",
        url: "https://sourceforge.net/p/mscore/code/HEAD/tree/trunk/mscore/share/sound/TimGM6mb.sf2?format=raw",
        file: "TimGM6mb.sf2",
        size: 5_969_788,
        sha256: "c5378b62028c920cb11e4803327983fee2f2cdff5dc89c708e39da417e51c854",
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub license: String,
    pub size: u64,
    /// Caminho do arquivo, quando já foi baixado.
    pub path: Option<String>,
}

pub fn catalog(dir: &Path) -> Vec<CatalogItem> {
    CATALOG
        .iter()
        .map(|e| {
            let path = dir.join(e.file);
            CatalogItem {
                id: e.id.into(),
                name: e.name.into(),
                description: e.description.into(),
                license: e.license.into(),
                size: e.size,
                path: path
                    .metadata()
                    .is_ok_and(|m| m.len() == e.size)
                    .then(|| path.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

pub fn entry(id: &str) -> Result<&'static CatalogEntry, String> {
    CATALOG
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("SoundFont desconhecido: {id}"))
}

/// Copia `reader` para `dir/entry.file`, conferindo tamanho e SHA-256. Grava
/// num arquivo temporário e só troca no fim, para não deixar arquivo pela metade.
pub fn save_verified(
    entry: &CatalogEntry,
    reader: &mut dyn Read,
    dir: &Path,
    mut progress: impl FnMut(u64),
) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = dir.join(entry.file);
    let partial = dir.join(format!("{}.parcial", entry.file));
    let result = (|| {
        let mut out = fs::File::create(&partial).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 256 * 1024];
        let mut total = 0u64;
        loop {
            let n = reader
                .read(&mut buffer)
                .map_err(|e| format!("O download foi interrompido: {e}"))?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > entry.size {
                return Err("O arquivo baixado é maior que o esperado".to_string());
            }
            hasher.update(&buffer[..n]);
            out.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            progress(total);
        }
        out.flush().map_err(|e| e.to_string())?;
        let digest: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if total != entry.size || digest != entry.sha256 {
            return Err("O arquivo baixado não confere com o original".to_string());
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            fs::rename(&partial, &target).map_err(|e| e.to_string())?;
            Ok(target)
        }
        Err(e) => {
            let _ = fs::remove_file(&partial);
            Err(e)
        }
    }
}

/// Baixa um SoundFont do catálogo. `progress` recebe os bytes já baixados.
pub fn download(id: &str, dir: &Path, progress: impl FnMut(u64)) -> Result<PathBuf, String> {
    let entry = entry(id)?;
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(20)))
        .timeout_recv_body(Some(Duration::from_secs(60)))
        .user_agent("PartiTAB")
        .build()
        .into();
    let mut response = agent
        .get(entry.url)
        .call()
        .map_err(|e| format!("Não foi possível baixar {}: {e}", entry.name))?;
    let mut reader = response.body_mut().as_reader();
    save_verified(entry, &mut reader, dir, progress)
}

pub fn remove(id: &str, dir: &Path) -> Result<(), String> {
    let path = dir.join(entry(id)?.file);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::BufReader;

    #[test]
    fn velocity_curves() {
        assert_eq!(VelocityCurve::Normal.apply(64), 64);
        assert_eq!(VelocityCurve::Fixed.apply(10), 100);
        assert_eq!(VelocityCurve::Fixed.apply(0), 0);
        assert!(VelocityCurve::Light.apply(40) > 40);
        assert!(VelocityCurve::Heavy.apply(80) < 80);
        assert_eq!(VelocityCurve::Light.apply(127), 127);
        assert_eq!(VelocityCurve::Heavy.apply(127), 127);
        assert!(VelocityCurve::Heavy.apply(1) >= 1);
        for c in [0, 1, 2, 3] {
            assert_eq!(VelocityCurve::from_u8(c).to_u8(), c);
        }
    }

    #[test]
    fn settings_are_clamped() {
        let s = SoundSettings {
            bank: 200,
            patch: 130,
            volume: 180,
            reverb: 255,
            curve: VelocityCurve::Light,
        }
        .clamped();
        assert_eq!((s.bank, s.patch, s.volume, s.reverb), (127, 127, 100, 127));
        assert_eq!(SoundSettings::default().master_volume(), 0.5);
    }

    #[test]
    fn bundled_soundfont_lists_general_midi_instruments() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(DEFAULT_SOUNDFONT);
        let sf = SoundFont::new(&mut BufReader::new(File::open(path).unwrap())).unwrap();
        let list = presets(&sf);
        assert!(list.len() >= 100, "{} instrumentos", list.len());
        assert_eq!((list[0].bank, list[0].patch), (0, 0));
        assert!(list.iter().all(|p| p.bank < 128));
    }

    #[test]
    fn verified_download_keeps_only_matching_files() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"partitab".repeat(1000);
        let digest: String = Sha256::digest(&data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let digest: &'static str = Box::leak(digest.into_boxed_str());
        let good = CatalogEntry {
            id: "teste",
            name: "Teste",
            description: "",
            license: "",
            url: "",
            file: "teste.sf2",
            size: data.len() as u64,
            sha256: digest,
        };
        let mut seen = 0;
        let path = save_verified(&good, &mut data.as_slice(), dir.path(), |n| seen = n).unwrap();
        assert_eq!(fs::read(&path).unwrap(), data);
        assert_eq!(seen, data.len() as u64);

        let corrupt = CatalogEntry {
            file: "ruim.sf2",
            ..good
        };
        let mut other = data.clone();
        other[0] = b'X';
        assert!(save_verified(&corrupt, &mut other.as_slice(), dir.path(), |_| {}).is_err());
        assert!(!dir.path().join("ruim.sf2").exists());
        assert!(!dir.path().join("ruim.sf2.parcial").exists());

        let short = CatalogEntry {
            file: "curto.sf2",
            ..good
        };
        assert!(save_verified(&short, &mut &data[..10], dir.path(), |_| {}).is_err());
    }

    #[test]
    fn catalog_only_reports_complete_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(catalog(dir.path()).iter().all(|i| i.path.is_none()));
        fs::write(dir.path().join(CATALOG[2].file), b"incompleto").unwrap();
        assert!(catalog(dir.path())[2].path.is_none());
        assert!(entry("nada").is_err());
        assert!(remove(CATALOG[2].id, dir.path()).is_ok());
        assert!(remove(CATALOG[2].id, dir.path()).is_ok());
    }

    /// Confere os arquivos reais do catálogo quando estão numa pasta local
    /// (PARTITAB_SF_DIR); sem a variável, não faz nada.
    #[test]
    fn catalog_files_load_in_the_synth() {
        let Ok(dir) = std::env::var("PARTITAB_SF_DIR") else {
            return;
        };
        for e in CATALOG {
            let file = File::open(Path::new(&dir).join(e.file)).unwrap();
            let sf = SoundFont::new(&mut BufReader::new(file)).unwrap();
            let list = presets(&sf);
            assert!(
                list.iter().any(|p| p.bank == 0 && p.patch == 0),
                "{}",
                e.name
            );
            println!(
                "{}: {} instrumentos, 0:0 = {}",
                e.name,
                list.len(),
                list[0].name
            );
        }
    }

    /// Baixa de verdade o menor SoundFont do catálogo (só com PARTITAB_NET=1).
    #[test]
    fn downloads_from_the_catalog() {
        if std::env::var("PARTITAB_NET").is_err() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let path = download("timgm6mb", dir.path(), |_| {}).unwrap();
        assert_eq!(fs::metadata(path).unwrap().len(), CATALOG[2].size);
    }
}
