//! Backup da biblioteca num único arquivo `.zip`: o banco (músicas, práticas,
//! treino de leitura), as partituras, as capas e as preferências da interface.
//! SoundFonts baixados e o token do GitHub ficam de fora.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::library::Library;

const MANIFEST: &str = "manifest.json";
const SETTINGS: &str = "preferencias.json";
const DB: &str = "partitab.db";
const FOLDERS: [&str; 2] = ["partituras", "capas"];
const APP: &str = "PartiTAB";
const FORMAT: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct Manifest {
    app: String,
    format: u32,
    version: String,
    created_at: u64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub files: usize,
    pub bytes: u64,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Grava o backup em `target`. `settings` é o JSON das preferências da interface.
pub fn export(
    lib: &Library,
    target: &Path,
    settings: &str,
    version: &str,
) -> Result<BackupSummary, String> {
    let snapshot = lib.dir().join("backup-banco.tmp");
    lib.export_db(&snapshot)?;
    let result = write_zip(lib.dir(), &snapshot, target, settings, version);
    let _ = fs::remove_file(&snapshot);
    if result.is_err() {
        let _ = fs::remove_file(target);
    }
    result
}

fn write_zip(
    dir: &Path,
    snapshot: &Path,
    target: &Path,
    settings: &str,
    version: &str,
) -> Result<BackupSummary, String> {
    let mut zip = ZipWriter::new(File::create(target).map_err(err)?);
    let deflate = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // Imagens e partituras compactadas (.mxl, .gp) quase não encolhem.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let manifest = Manifest {
        app: APP.into(),
        format: FORMAT,
        version: version.into(),
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };
    zip.start_file(MANIFEST, deflate).map_err(err)?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .map_err(err)?
            .as_bytes(),
    )
    .map_err(err)?;
    zip.start_file(SETTINGS, deflate).map_err(err)?;
    zip.write_all(settings.as_bytes()).map_err(err)?;

    let mut summary = BackupSummary { files: 0, bytes: 0 };
    zip.start_file(DB, deflate).map_err(err)?;
    summary.bytes += io::copy(&mut File::open(snapshot).map_err(err)?, &mut zip).map_err(err)?;
    for folder in FOLDERS {
        let Ok(entries) = fs::read_dir(dir.join(folder)) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            zip.start_file(format!("{folder}/{name}"), stored)
                .map_err(err)?;
            summary.bytes +=
                io::copy(&mut File::open(&path).map_err(err)?, &mut zip).map_err(err)?;
            summary.files += 1;
        }
    }
    zip.finish().map_err(err)?;
    Ok(summary)
}

/// Só entram na restauração o banco, as preferências e arquivos soltos dentro
/// de `partituras/` e `capas/` (nada de caminhos com `..` ou subpastas).
fn allowed(name: &Path) -> bool {
    let parts: Vec<_> = name.components().collect();
    match parts.as_slice() {
        [Component::Normal(f)] => *f == DB || *f == SETTINGS || *f == MANIFEST,
        [Component::Normal(folder), Component::Normal(_)] => FOLDERS.iter().any(|d| *folder == *d),
        _ => false,
    }
}

/// Restaura um backup. Devolve o JSON das preferências da interface.
pub fn import(lib: &Library, source: &Path) -> Result<String, String> {
    let file = File::open(source).map_err(|e| format!("Não foi possível abrir o backup: {e}"))?;
    let mut zip = ZipArchive::new(file)
        .map_err(|_| "Esse arquivo não é um backup do PartiTAB".to_string())?;

    let manifest: Manifest = {
        let mut entry = zip
            .by_name(MANIFEST)
            .map_err(|_| "Esse arquivo não é um backup do PartiTAB".to_string())?;
        let mut text = String::new();
        entry.read_to_string(&mut text).map_err(err)?;
        serde_json::from_str(&text)
            .map_err(|_| "Backup danificado (manifesto ilegível)".to_string())?
    };
    if manifest.app != APP {
        return Err("Esse arquivo não é um backup do PartiTAB".into());
    }
    if manifest.format > FORMAT {
        return Err(
            "O backup é de uma versão mais nova do PartiTAB. Atualize o app antes de restaurar."
                .into(),
        );
    }

    let staging: PathBuf = lib.dir().join("restaurando");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(err)?;
    let result = (|| {
        let mut settings = String::from("{}");
        let mut has_db = false;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(err)?;
            if entry.is_dir() {
                continue;
            }
            let Some(name) = entry.enclosed_name() else {
                continue;
            };
            if !allowed(&name) {
                continue;
            }
            if name == Path::new(SETTINGS) {
                settings.clear();
                entry.read_to_string(&mut settings).map_err(err)?;
                continue;
            }
            if name == Path::new(MANIFEST) {
                continue;
            }
            has_db |= name == Path::new(DB);
            let out = staging.join(&name);
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(err)?;
            }
            io::copy(&mut entry, &mut File::create(&out).map_err(err)?).map_err(err)?;
        }
        if !has_db {
            return Err("Backup danificado (sem o banco da biblioteca)".to_string());
        }
        lib.restore_from(&staging)?;
        Ok(settings)
    })();
    let _ = fs::remove_dir_all(&staging);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::Attempt;

    fn attempt(song_id: i64) -> Attempt {
        serde_json::from_value(serde_json::json!({
            "songId": song_id, "mode": "play", "hands": "right", "track": "Piano",
            "level": "original", "speed": 100, "score": 80, "accuracy": 90, "hit": 9,
            "early": 0, "late": 0, "wrong": 1, "miss": 0, "completed": true, "durationMs": 1000
        }))
        .unwrap()
    }

    #[test]
    fn backup_round_trip_moves_library_to_another_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let a = Library::open(&tmp.path().join("pc-antigo")).unwrap();
        let src = tmp.path().join("Valsa.gp5");
        fs::write(&src, b"partitura").unwrap();
        let song = a.import(&src, Some("Valsa"), Some("Chopin")).unwrap();
        let cover = tmp.path().join("capa.png");
        fs::write(&cover, b"png").unwrap();
        a.set_cover_from_file(song.id, &cover).unwrap();
        a.record_attempt(&attempt(song.id)).unwrap();

        let zip_path = tmp.path().join("backup.zip");
        let summary = export(&a, &zip_path, r#"{"partitab.sound":"x"}"#, "0.2.0").unwrap();
        assert_eq!(summary.files, 2);

        // Outro computador: biblioteca nova, com uma música que some na restauração.
        let b = Library::open(&tmp.path().join("pc-novo")).unwrap();
        let other = tmp.path().join("Outra.gp5");
        fs::write(&other, b"outra").unwrap();
        b.import(&other, None, None).unwrap();

        let settings = import(&b, &zip_path).unwrap();
        assert_eq!(settings, r#"{"partitab.sound":"x"}"#);
        let songs = b.list().unwrap();
        assert_eq!(songs.len(), 1);
        let restored = &songs[0];
        assert_eq!(restored.title, "Valsa");
        assert!(
            restored
                .path
                .starts_with(b.dir().to_string_lossy().as_ref())
        );
        assert_eq!(fs::read(&restored.path).unwrap(), b"partitura");
        assert_eq!(fs::read(restored.cover.as_ref().unwrap()).unwrap(), b"png");
        assert_eq!(b.attempts(restored.id).unwrap().len(), 1);
        // O que havia antes fica guardado.
        assert!(b.dir().join("antes-da-restauracao/partitab.db").exists());
        assert!(!b.dir().join("restaurando").exists());
    }

    #[test]
    fn rejects_files_that_are_not_backups() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::open(&tmp.path().join("dados")).unwrap();
        let bogus = tmp.path().join("x.zip");
        fs::write(&bogus, b"nada").unwrap();
        assert!(
            import(&lib, &bogus)
                .unwrap_err()
                .contains("não é um backup")
        );

        let mut zip = ZipWriter::new(File::create(&bogus).unwrap());
        zip.start_file(MANIFEST, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"{"app":"PartiTAB","format":1,"version":"0","created_at":0}"#)
            .unwrap();
        zip.finish().unwrap();
        assert!(import(&lib, &bogus).unwrap_err().contains("sem o banco"));
    }

    #[test]
    fn only_known_paths_are_restored() {
        assert!(allowed(Path::new("partitab.db")));
        assert!(allowed(Path::new("partituras/a.gp5")));
        assert!(allowed(Path::new("capas/b.png")));
        assert!(!allowed(Path::new("partituras/sub/a.gp5")));
        assert!(!allowed(Path::new("outra/a.gp5")));
        assert!(!allowed(Path::new("atualizacao.json")));
    }
}
