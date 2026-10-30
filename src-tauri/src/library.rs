//! Biblioteca de partituras: cópia dos arquivos importados e histórico de
//! execuções em SQLite, na pasta de dados do app.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Cada mudança de esquema ganha uma entrada aqui; a versão fica em `user_version`.
const MIGRATIONS: &[&str] = &[
    "
    CREATE TABLE songs (
        id INTEGER PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        style TEXT NOT NULL DEFAULT '',
        difficulty INTEGER,
        difficulty_manual INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        prefs TEXT NOT NULL DEFAULT '{}',
        added_at INTEGER NOT NULL
    );
    CREATE TABLE attempts (
        id INTEGER PRIMARY KEY,
        song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        played_at INTEGER NOT NULL,
        mode TEXT NOT NULL,
        hands TEXT NOT NULL,
        track TEXT NOT NULL,
        level TEXT NOT NULL,
        speed INTEGER NOT NULL,
        score INTEGER NOT NULL,
        accuracy INTEGER NOT NULL,
        hit INTEGER NOT NULL,
        early INTEGER NOT NULL,
        late INTEGER NOT NULL,
        wrong INTEGER NOT NULL,
        miss INTEGER NOT NULL,
        completed INTEGER NOT NULL
    );
    CREATE INDEX attempts_song ON attempts(song_id, played_at);
",
    "
    -- Onde se erra: por compasso e por nota, em cada execução.
    CREATE TABLE attempt_bars (
        attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        bar INTEGER NOT NULL,
        notes INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        timing INTEGER NOT NULL,
        PRIMARY KEY (attempt_id, bar)
    );
    CREATE TABLE attempt_keys (
        attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        key INTEGER NOT NULL,
        notes INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        PRIMARY KEY (attempt_id, key)
    );
    -- Treino de leitura: uma caixa (repetição espaçada) por nota e clave.
    CREATE TABLE reading_cards (
        clef TEXT NOT NULL,
        key INTEGER NOT NULL,
        box INTEGER NOT NULL,
        seen INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        total_ms INTEGER NOT NULL,
        last_seen INTEGER,
        PRIMARY KEY (clef, key)
    );
",
    "
    -- Capa do álbum: caminho da imagem na pasta capas (NULL = capa gerada).
    ALTER TABLE songs ADD COLUMN cover TEXT;
",
    "
    -- Quanto durou cada prática (0 nas anteriores a esta versão).
    ALTER TABLE attempts ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX attempts_played_at ON attempts(played_at);
",
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub style: String,
    /// 1 (fácil) a 5 (difícil); `None` até ser estimada.
    pub difficulty: Option<u8>,
    pub difficulty_manual: bool,
    pub favorite: bool,
    pub file_name: String,
    pub path: String,
    /// Preferências da interface para esta música (JSON livre: faixa, nível...).
    pub prefs: String,
    pub added_at: i64,
    pub plays: i64,
    pub last_played_at: Option<i64>,
    pub best_score: Option<i64>,
    pub last_score: Option<i64>,
    /// Imagem da capa (caminho no disco); `None` = a interface desenha uma.
    pub cover: Option<String>,
}

/// Campos editáveis; os ausentes ficam como estão.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongPatch {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub style: Option<String>,
    /// `Some(None)` volta para a dificuldade estimada.
    #[serde(default, deserialize_with = "nullable")]
    pub difficulty: Option<Option<u8>>,
    pub favorite: Option<bool>,
    pub prefs: Option<String>,
}

fn nullable<'de, D, T>(d: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    #[serde(default)]
    pub id: i64,
    pub song_id: i64,
    #[serde(default)]
    pub played_at: i64,
    pub mode: String,
    pub hands: String,
    pub track: String,
    pub level: String,
    pub speed: i64,
    pub score: i64,
    pub accuracy: i64,
    pub hit: i64,
    pub early: i64,
    pub late: i64,
    pub wrong: i64,
    pub miss: i64,
    pub completed: bool,
    #[serde(default)]
    pub duration_ms: i64,
    /// Detalhe por compasso e por nota (só na gravação; a listagem não traz).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bars: Vec<BarStat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keys: Vec<KeyStat>,
}

/// Notas avaliadas, erros (errada/perdida) e fora do tempo num compasso.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BarStat {
    pub bar: i64,
    pub notes: i64,
    pub errors: i64,
    pub timing: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyStat {
    pub key: i64,
    pub notes: i64,
    pub errors: i64,
}

/// Soma das últimas execuções de uma música.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ErrorMap {
    pub attempts: i64,
    pub bars: Vec<BarStat>,
    pub keys: Vec<KeyStat>,
}

/// Estado de uma nota no treino de leitura.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadingCard {
    pub clef: String,
    pub key: i64,
    /// Caixa da repetição espaçada: 1 (revê sempre) a 5 (já sabe).
    #[serde(rename = "box")]
    pub box_: i64,
    pub seen: i64,
    pub correct: i64,
    pub total_ms: i64,
    pub last_seen: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct CollectionEntry {
    file: String,
    title: String,
    artist: String,
    #[serde(default)]
    style: String,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct CollectionResult {
    pub added: usize,
    pub existing: usize,
    pub failed: Vec<String>,
}

pub struct Library {
    conn: Mutex<Connection>,
    dir: PathBuf,
    files: PathBuf,
    covers: PathBuf,
}

const DB_FILE: &str = "partitab.db";
const FILES_DIR: &str = "partituras";
const COVERS_DIR: &str = "capas";
/// Cópia do que havia antes da última restauração de backup.
const PREVIOUS_DIR: &str = "antes-da-restauracao";

fn open_connection(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open(path).map_err(err)?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(err)?;
    migrate(&mut conn)?;
    Ok(conn)
}

/// Só o nome do arquivo de um caminho gravado (aceita `/` e `\\`).
fn stored_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

const SONG_SELECT: &str = "
    SELECT s.id, s.title, s.artist, s.style, s.difficulty, s.difficulty_manual, s.favorite,
           s.file_name, s.stored_path, s.prefs, s.added_at,
           (SELECT COUNT(*) FROM attempts a WHERE a.song_id = s.id),
           (SELECT MAX(played_at) FROM attempts a WHERE a.song_id = s.id),
           (SELECT MAX(score) FROM attempts a WHERE a.song_id = s.id AND a.completed = 1),
           (SELECT score FROM attempts a WHERE a.song_id = s.id ORDER BY played_at DESC, id DESC LIMIT 1),
           s.cover
    FROM songs s";

fn song_from_row(r: &Row) -> rusqlite::Result<Song> {
    Ok(Song {
        id: r.get(0)?,
        title: r.get(1)?,
        artist: r.get(2)?,
        style: r.get(3)?,
        difficulty: r.get(4)?,
        difficulty_manual: r.get(5)?,
        favorite: r.get(6)?,
        file_name: r.get(7)?,
        path: r.get(8)?,
        prefs: r.get(9)?,
        added_at: r.get(10)?,
        plays: r.get(11)?,
        last_played_at: r.get(12)?,
        best_score: r.get(13)?,
        last_score: r.get(14)?,
        cover: r.get(15)?,
    })
}

impl Library {
    /// Abre (ou cria) a biblioteca em `dir`: `partitab.db` e a pasta `partituras`.
    pub fn open(dir: &Path) -> Result<Self> {
        let files = dir.join(FILES_DIR);
        fs::create_dir_all(&files).map_err(err)?;
        let covers = dir.join(COVERS_DIR);
        fs::create_dir_all(&covers).map_err(err)?;
        let conn = open_connection(&dir.join(DB_FILE))?;
        Ok(Self {
            conn: Mutex::new(conn),
            dir: dir.to_path_buf(),
            files,
            covers,
        })
    }

    /// Pasta da biblioteca (banco, partituras e capas).
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Cópia consistente do banco em `target` (para o backup).
    pub fn export_db(&self, target: &Path) -> Result<()> {
        let _ = fs::remove_file(target);
        let conn = self.conn.lock().unwrap();
        conn.execute("VACUUM INTO ?1", [target.to_string_lossy()])
            .map_err(err)?;
        Ok(())
    }

    /// Substitui a biblioteca pelo conteúdo de `staging` (banco, partituras e
    /// capas de um backup). O que havia antes fica em `antes-da-restauracao`.
    pub fn restore_from(&self, staging: &Path) -> Result<()> {
        // Prepara o banco restaurado: versão, migrações e caminhos desta máquina.
        {
            let staged = staging.join(DB_FILE);
            let check = Connection::open(&staged).map_err(err)?;
            let version: usize = check
                .pragma_query_value(None, "user_version", |r| r.get(0))
                .map_err(err)?;
            drop(check);
            if version > MIGRATIONS.len() {
                return Err("O backup é de uma versão mais nova do PartiTAB. Atualize o app antes de restaurar.".into());
            }
            let conn = open_connection(&staged)?;
            let rows: Vec<(i64, String, Option<String>)> = {
                let mut stmt = conn
                    .prepare("SELECT id, stored_path, cover FROM songs")
                    .map_err(err)?;
                stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                    .map_err(err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(err)?
            };
            for (id, path, cover) in rows {
                let path = self.files.join(stored_name(&path));
                let cover = cover.map(|c| self.covers.join(stored_name(&c)));
                conn.execute(
                    "UPDATE songs SET stored_path = ?1, cover = ?2 WHERE id = ?3",
                    params![
                        path.to_string_lossy(),
                        cover.map(|c| c.to_string_lossy().into_owned()),
                        id
                    ],
                )
                .map_err(err)?;
            }
        }
        for sub in [FILES_DIR, COVERS_DIR] {
            fs::create_dir_all(staging.join(sub)).map_err(err)?;
        }

        let mut conn = self.conn.lock().unwrap();
        // Fecha o banco atual para poder mover o arquivo.
        *conn = Connection::open_in_memory().map_err(err)?;
        let previous = self.dir.join(PREVIOUS_DIR);
        let _ = fs::remove_dir_all(&previous);
        fs::create_dir_all(&previous).map_err(err)?;
        let names = [DB_FILE, FILES_DIR, COVERS_DIR];
        let swap = || -> Result<()> {
            for name in names {
                let current = self.dir.join(name);
                if current.exists() {
                    fs::rename(&current, previous.join(name)).map_err(err)?;
                }
            }
            for name in names {
                fs::rename(staging.join(name), self.dir.join(name)).map_err(err)?;
            }
            Ok(())
        };
        let result = swap();
        if result.is_err() {
            // Desfaz: volta o que havia antes.
            for name in names {
                if previous.join(name).exists() {
                    let _ = fs::remove_dir_all(self.dir.join(name));
                    let _ = fs::remove_file(self.dir.join(name));
                    let _ = fs::rename(previous.join(name), self.dir.join(name));
                }
            }
        }
        *conn = open_connection(&self.dir.join(DB_FILE))?;
        result
    }

    /// Copia o arquivo para a biblioteca. O mesmo conteúdo importado de novo
    /// devolve a música que já existe.
    pub fn import(&self, source: &Path, title: Option<&str>, artist: Option<&str>) -> Result<Song> {
        let data = fs::read(source).map_err(|e| format!("Não foi possível ler o arquivo: {e}"))?;
        let file_name = source
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "partitura".into());
        self.import_bytes(&file_name, &data, title, artist)
    }

    /// Como `import`, para conteúdo gerado pelo app (ex.: arranjo para piano).
    pub fn import_bytes(
        &self,
        file_name: &str,
        data: &[u8],
        title: Option<&str>,
        artist: Option<&str>,
    ) -> Result<Song> {
        self.import_bytes_status(file_name, data, title, artist)
            .map(|(song, _)| song)
    }

    /// Como `import_bytes`, dizendo também se a música é nova na biblioteca.
    fn import_bytes_status(
        &self,
        file_name: &str,
        data: &[u8],
        title: Option<&str>,
        artist: Option<&str>,
    ) -> Result<(Song, bool)> {
        let hash = format!("{:x}", Sha256::digest(data));
        let conn = self.conn.lock().unwrap();

        let existing: Option<i64> = conn
            .query_row("SELECT id FROM songs WHERE hash = ?1", [&hash], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?;
        if let Some(id) = existing {
            // Completa o artista se a importação anterior não tinha.
            if let Some(artist) = artist.filter(|a| !a.is_empty()) {
                conn.execute(
                    "UPDATE songs SET artist = ?1 WHERE id = ?2 AND artist = ''",
                    params![artist, id],
                )
                .map_err(err)?;
            }
            return get(&conn, id).map(|song| (song, false));
        }

        let path = Path::new(file_name);
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default();
        let stored = self.files.join(format!("{}{ext}", &hash[..16]));
        fs::write(&stored, data).map_err(err)?;

        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| file_name.to_string());
        let title = title.filter(|t| !t.trim().is_empty()).unwrap_or(&stem);
        conn.execute(
            "INSERT INTO songs (hash, file_name, stored_path, title, artist, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                hash,
                file_name,
                stored.to_string_lossy(),
                title.trim(),
                artist.unwrap_or("").trim(),
                now_ms()
            ],
        )
        .map_err(err)?;
        get(&conn, conn.last_insert_rowid()).map(|song| (song, true))
    }

    /// Importa uma coleção que vem com o app: uma pasta com `catalog.json`
    /// (arquivo, título, compositor, estilo) e as partituras. Pode rodar de novo:
    /// o que já está na biblioteca não é duplicado nem alterado.
    pub fn import_collection(&self, dir: &Path) -> Result<CollectionResult> {
        let catalog = fs::read_to_string(dir.join("catalog.json"))
            .map_err(|e| format!("Coleção não encontrada: {e}"))?;
        let entries: Vec<CollectionEntry> =
            serde_json::from_str(&catalog).map_err(|e| format!("Catálogo inválido: {e}"))?;
        let mut result = CollectionResult::default();
        for entry in entries {
            let imported = fs::read(dir.join(&entry.file))
                .map_err(err)
                .and_then(|data| {
                    self.import_bytes_status(
                        &entry.file,
                        &data,
                        Some(&entry.title),
                        Some(&entry.artist),
                    )
                });
            match imported {
                Ok((song, true)) => {
                    if !entry.style.is_empty() {
                        let patch = SongPatch {
                            style: Some(entry.style),
                            ..Default::default()
                        };
                        self.update(song.id, patch)?;
                    }
                    result.added += 1;
                }
                Ok((_, false)) => result.existing += 1,
                Err(_) => result.failed.push(entry.file),
            }
        }
        Ok(result)
    }

    pub fn list(&self) -> Result<Vec<Song>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(&format!("{SONG_SELECT} ORDER BY s.title COLLATE NOCASE"))
            .map_err(err)?;
        stmt.query_map([], song_from_row)
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)
    }

    pub fn update(&self, id: i64, patch: SongPatch) -> Result<Song> {
        let conn = self.conn.lock().unwrap();
        let text = |col: &str, v: &Option<String>| -> Result<()> {
            if let Some(v) = v {
                conn.execute(
                    &format!("UPDATE songs SET {col} = ?1 WHERE id = ?2"),
                    params![v.trim(), id],
                )
                .map_err(err)?;
            }
            Ok(())
        };
        if let Some(t) = patch.title.as_ref().filter(|t| t.trim().is_empty()) {
            return Err(format!("O título não pode ficar vazio ({t:?})"));
        }
        text("title", &patch.title)?;
        text("artist", &patch.artist)?;
        text("style", &patch.style)?;
        if let Some(prefs) = &patch.prefs {
            conn.execute(
                "UPDATE songs SET prefs = ?1 WHERE id = ?2",
                params![prefs, id],
            )
            .map_err(err)?;
        }
        if let Some(favorite) = patch.favorite {
            conn.execute(
                "UPDATE songs SET favorite = ?1 WHERE id = ?2",
                params![favorite, id],
            )
            .map_err(err)?;
        }
        if let Some(difficulty) = patch.difficulty {
            let difficulty = difficulty.map(|d| d.clamp(1, 5));
            conn.execute(
                "UPDATE songs SET difficulty = ?1, difficulty_manual = ?2 WHERE id = ?3",
                params![difficulty, difficulty.is_some(), id],
            )
            .map_err(err)?;
        }
        get(&conn, id)
    }

    /// Grava a dificuldade estimada pelo app, a menos que o usuário tenha
    /// escolhido uma.
    pub fn set_auto_difficulty(&self, id: i64, difficulty: u8) -> Result<Song> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE songs SET difficulty = ?1 WHERE id = ?2 AND difficulty_manual = 0",
            params![difficulty.clamp(1, 5), id],
        )
        .map_err(err)?;
        get(&conn, id)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let (path, cover): (String, Option<String>) = conn
            .query_row(
                "SELECT stored_path, cover FROM songs WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(err)?;
        conn.execute("DELETE FROM songs WHERE id = ?1", [id])
            .map_err(err)?;
        let _ = fs::remove_file(path);
        if let Some(cover) = cover {
            let _ = fs::remove_file(cover);
        }
        Ok(())
    }

    /// Salva a imagem como capa da música (substitui a anterior).
    pub fn set_cover(&self, id: i64, data: &[u8], ext: &str) -> Result<Song> {
        if data.is_empty() {
            return Err("Imagem vazia".into());
        }
        let conn = self.conn.lock().unwrap();
        let old: Option<String> = conn
            .query_row("SELECT cover FROM songs WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    "Partitura não encontrada na biblioteca".to_string()
                }
                e => e.to_string(),
            })?;
        // O nome muda com o conteúdo, para a interface não mostrar a imagem antiga do cache.
        let hash = format!("{:x}", Sha256::digest(data));
        let path = self.covers.join(format!("{id}-{}.{ext}", &hash[..12]));
        fs::write(&path, data).map_err(err)?;
        let new = path.to_string_lossy().into_owned();
        conn.execute(
            "UPDATE songs SET cover = ?1 WHERE id = ?2",
            params![new, id],
        )
        .map_err(err)?;
        if let Some(old) = old.filter(|o| *o != new) {
            let _ = fs::remove_file(old);
        }
        get(&conn, id)
    }

    /// Usa um arquivo de imagem do computador como capa.
    pub fn set_cover_from_file(&self, id: i64, source: &Path) -> Result<Song> {
        let ext = match source
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_lowercase)
            .as_deref()
        {
            Some("jpg" | "jpeg") => "jpg",
            Some("png") => "png",
            Some("webp") => "webp",
            _ => return Err("Escolha uma imagem JPG, PNG ou WebP".into()),
        };
        let data = fs::read(source).map_err(|e| format!("Não foi possível ler a imagem: {e}"))?;
        self.set_cover(id, &data, ext)
    }

    /// Volta para a capa gerada.
    pub fn remove_cover(&self, id: i64) -> Result<Song> {
        let conn = self.conn.lock().unwrap();
        let old: Option<String> = conn
            .query_row("SELECT cover FROM songs WHERE id = ?1", [id], |r| r.get(0))
            .map_err(err)?;
        conn.execute("UPDATE songs SET cover = NULL WHERE id = ?1", [id])
            .map_err(err)?;
        if let Some(old) = old {
            let _ = fs::remove_file(old);
        }
        get(&conn, id)
    }

    pub fn record_attempt(&self, a: &Attempt) -> Result<Song> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO attempts (song_id, played_at, mode, hands, track, level, speed, score,
                                   accuracy, hit, early, late, wrong, miss, completed, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                a.song_id,
                now_ms(),
                a.mode,
                a.hands,
                a.track,
                a.level,
                a.speed,
                a.score,
                a.accuracy,
                a.hit,
                a.early,
                a.late,
                a.wrong,
                a.miss,
                a.completed,
                a.duration_ms.max(0)
            ],
        )
        .map_err(err)?;
        let id = tx.last_insert_rowid();
        for b in &a.bars {
            tx.execute(
                "INSERT INTO attempt_bars (attempt_id, bar, notes, errors, timing)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, b.bar, b.notes, b.errors, b.timing],
            )
            .map_err(err)?;
        }
        for k in &a.keys {
            tx.execute(
                "INSERT INTO attempt_keys (attempt_id, key, notes, errors) VALUES (?1, ?2, ?3, ?4)",
                params![id, k.key, k.notes, k.errors],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        get(&conn, a.song_id)
    }

    /// Erros por compasso e por nota nas últimas `last` execuções.
    pub fn error_map(&self, song_id: i64, last: i64) -> Result<ErrorMap> {
        let conn = self.conn.lock().unwrap();
        let recent = "SELECT id FROM attempts WHERE song_id = ?1
                      ORDER BY played_at DESC, id DESC LIMIT ?2";
        let attempts: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM ({recent})"),
                params![song_id, last],
                |r| r.get(0),
            )
            .map_err(err)?;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT bar, SUM(notes), SUM(errors), SUM(timing) FROM attempt_bars
                 WHERE attempt_id IN ({recent}) GROUP BY bar ORDER BY bar"
            ))
            .map_err(err)?;
        let bars = stmt
            .query_map(params![song_id, last], |r| {
                Ok(BarStat {
                    bar: r.get(0)?,
                    notes: r.get(1)?,
                    errors: r.get(2)?,
                    timing: r.get(3)?,
                })
            })
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)?;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT key, SUM(notes), SUM(errors) FROM attempt_keys
                 WHERE attempt_id IN ({recent}) GROUP BY key ORDER BY key"
            ))
            .map_err(err)?;
        let keys = stmt
            .query_map(params![song_id, last], |r| {
                Ok(KeyStat {
                    key: r.get(0)?,
                    notes: r.get(1)?,
                    errors: r.get(2)?,
                })
            })
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)?;
        Ok(ErrorMap {
            attempts,
            bars,
            keys,
        })
    }

    pub fn reading_cards(&self) -> Result<Vec<ReadingCard>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT clef, key, box, seen, correct, total_ms, last_seen FROM reading_cards
                 ORDER BY clef, key",
            )
            .map_err(err)?;
        stmt.query_map([], |r| {
            Ok(ReadingCard {
                clef: r.get(0)?,
                key: r.get(1)?,
                box_: r.get(2)?,
                seen: r.get(3)?,
                correct: r.get(4)?,
                total_ms: r.get(5)?,
                last_seen: r.get(6)?,
            })
        })
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)
    }

    pub fn save_reading_card(&self, c: &ReadingCard) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO reading_cards (clef, key, box, seen, correct, total_ms, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (clef, key) DO UPDATE SET box = ?3, seen = ?4, correct = ?5,
                 total_ms = ?6, last_seen = ?7",
            params![
                c.clef,
                c.key,
                c.box_.clamp(1, 5),
                c.seen,
                c.correct,
                c.total_ms,
                c.last_seen
            ],
        )
        .map_err(err)?;
        Ok(())
    }

    /// Execuções da música, da mais recente para a mais antiga.
    pub fn attempts(&self, song_id: i64) -> Result<Vec<Attempt>> {
        self.query_attempts("song_id = ?1", song_id)
    }

    /// Execuções de todas as músicas desde `since` (ms), da mais recente para a
    /// mais antiga (alimenta o painel de progresso).
    pub fn all_attempts(&self, since: i64) -> Result<Vec<Attempt>> {
        self.query_attempts("played_at >= ?1", since)
    }

    fn query_attempts(&self, filter: &str, value: i64) -> Result<Vec<Attempt>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(&format!(
                "SELECT id, song_id, played_at, mode, hands, track, level, speed, score, accuracy,
                        hit, early, late, wrong, miss, completed, duration_ms
                 FROM attempts WHERE {filter} ORDER BY played_at DESC, id DESC"
            ))
            .map_err(err)?;
        stmt.query_map([value], |r| {
            Ok(Attempt {
                id: r.get(0)?,
                song_id: r.get(1)?,
                played_at: r.get(2)?,
                mode: r.get(3)?,
                hands: r.get(4)?,
                track: r.get(5)?,
                level: r.get(6)?,
                speed: r.get(7)?,
                score: r.get(8)?,
                accuracy: r.get(9)?,
                hit: r.get(10)?,
                early: r.get(11)?,
                late: r.get(12)?,
                wrong: r.get(13)?,
                miss: r.get(14)?,
                completed: r.get(15)?,
                duration_ms: r.get(16)?,
                bars: Vec::new(),
                keys: Vec::new(),
            })
        })
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)
    }
}

fn get(conn: &Connection, id: i64) -> Result<Song> {
    conn.query_row(
        &format!("{SONG_SELECT} WHERE s.id = ?1"),
        [id],
        song_from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "Partitura não encontrada na biblioteca".into(),
        e => e.to_string(),
    })
}

fn migrate(conn: &mut Connection) -> Result<()> {
    let version: usize = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(err)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version) {
        let tx = conn.transaction().map_err(err)?;
        tx.execute_batch(sql).map_err(err)?;
        tx.pragma_update(None, "user_version", i + 1).map_err(err)?;
        tx.commit().map_err(err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Library, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let lib = Library::open(&dir.path().join("dados")).unwrap();
        let src = dir.path().join("Minha Música.gp5");
        fs::write(&src, b"conteudo da partitura").unwrap();
        (dir, lib, src)
    }

    fn attempt(song_id: i64, score: i64, completed: bool) -> Attempt {
        Attempt {
            id: 0,
            song_id,
            played_at: 0,
            mode: "play".into(),
            hands: "right".into(),
            track: "1".into(),
            level: "original".into(),
            speed: 100,
            score,
            accuracy: score,
            hit: 10,
            early: 0,
            late: 0,
            wrong: 0,
            miss: 0,
            completed,
            duration_ms: 60_000,
            bars: Vec::new(),
            keys: Vec::new(),
        }
    }

    #[test]
    fn import_copies_file_and_uses_file_name_as_title() {
        let (_dir, lib, src) = setup();
        let song = lib.import(&src, None, Some("Artista")).unwrap();
        assert_eq!(song.title, "Minha Música");
        assert_eq!(song.artist, "Artista");
        assert_eq!(song.file_name, "Minha Música.gp5");
        assert!(song.path.ends_with(".gp5"));
        assert_eq!(fs::read(&song.path).unwrap(), b"conteudo da partitura");
        assert_eq!(song.plays, 0);
        assert_eq!(song.best_score, None);
    }

    #[test]
    fn same_content_is_not_imported_twice() {
        let (dir, lib, src) = setup();
        let first = lib.import(&src, Some("Título"), None).unwrap();
        let copy = dir.path().join("outro nome.gp5");
        fs::copy(&src, &copy).unwrap();
        let second = lib.import(&copy, Some("Outro"), Some("Banda")).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(second.title, "Título");
        assert_eq!(second.artist, "Banda");
        assert_eq!(lib.list().unwrap().len(), 1);
    }

    #[test]
    fn update_and_difficulty_rules() {
        let (_dir, lib, src) = setup();
        let id = lib.import(&src, None, None).unwrap().id;
        assert_eq!(lib.set_auto_difficulty(id, 2).unwrap().difficulty, Some(2));

        let patch = SongPatch {
            style: Some(" Rock ".into()),
            difficulty: Some(Some(9)),
            favorite: Some(true),
            ..Default::default()
        };
        let song = lib.update(id, patch).unwrap();
        assert_eq!(song.style, "Rock");
        assert_eq!(song.difficulty, Some(5));
        assert!(song.difficulty_manual && song.favorite);
        // Estimativa não sobrescreve a escolha do usuário...
        assert_eq!(lib.set_auto_difficulty(id, 1).unwrap().difficulty, Some(5));
        // ...até ela ser apagada.
        let patch = SongPatch {
            difficulty: Some(None),
            ..Default::default()
        };
        assert!(!lib.update(id, patch).unwrap().difficulty_manual);
        assert_eq!(lib.set_auto_difficulty(id, 1).unwrap().difficulty, Some(1));

        let patch = SongPatch {
            title: Some("  ".into()),
            ..Default::default()
        };
        assert!(lib.update(id, patch).is_err());
    }

    #[test]
    fn attempts_feed_play_count_and_scores() {
        let (_dir, lib, src) = setup();
        let id = lib.import(&src, None, None).unwrap().id;
        lib.record_attempt(&attempt(id, 70, true)).unwrap();
        lib.record_attempt(&attempt(id, 95, false)).unwrap();
        let song = lib.record_attempt(&attempt(id, 80, true)).unwrap();
        assert_eq!(song.plays, 3);
        // Melhor nota só conta execuções completas; última é a mais recente.
        assert_eq!(song.best_score, Some(80));
        assert_eq!(song.last_score, Some(80));
        assert!(song.last_played_at.is_some());
        let history = lib.attempts(id).unwrap();
        assert_eq!(
            history.iter().map(|a| a.score).collect::<Vec<_>>(),
            [80, 95, 70]
        );
    }

    #[test]
    fn error_map_sums_recent_attempts_per_bar_and_key() {
        let (_dir, lib, src) = setup();
        let id = lib.import(&src, None, None).unwrap().id;
        let with_stats = |bars: &[(i64, i64, i64)], keys: &[(i64, i64, i64)]| {
            let mut a = attempt(id, 50, false);
            a.bars = bars
                .iter()
                .map(|&(bar, notes, errors)| BarStat {
                    bar,
                    notes,
                    errors,
                    timing: 1,
                })
                .collect();
            a.keys = keys
                .iter()
                .map(|&(key, notes, errors)| KeyStat { key, notes, errors })
                .collect();
            a
        };
        lib.record_attempt(&with_stats(&[(0, 4, 0), (1, 4, 3)], &[(60, 8, 3)]))
            .unwrap();
        lib.record_attempt(&with_stats(
            &[(1, 4, 1), (2, 2, 2)],
            &[(60, 6, 1), (62, 2, 2)],
        ))
        .unwrap();

        let map = lib.error_map(id, 10).unwrap();
        assert_eq!(map.attempts, 2);
        assert_eq!(
            map.bars,
            vec![
                BarStat {
                    bar: 0,
                    notes: 4,
                    errors: 0,
                    timing: 1
                },
                BarStat {
                    bar: 1,
                    notes: 8,
                    errors: 4,
                    timing: 2
                },
                BarStat {
                    bar: 2,
                    notes: 2,
                    errors: 2,
                    timing: 1
                },
            ]
        );
        assert_eq!(
            map.keys[0],
            KeyStat {
                key: 60,
                notes: 14,
                errors: 4
            }
        );
        // Só a última execução.
        assert_eq!(lib.error_map(id, 1).unwrap().bars.len(), 2);
        // Apagar a música apaga o detalhe junto.
        lib.delete(id).unwrap();
        assert!(lib.error_map(id, 10).unwrap().bars.is_empty());
    }

    #[test]
    fn reading_cards_are_upserted() {
        let (_dir, lib, _src) = setup();
        let mut card = ReadingCard {
            clef: "treble".into(),
            key: 64,
            box_: 1,
            seen: 1,
            correct: 1,
            total_ms: 1500,
            last_seen: Some(10),
        };
        lib.save_reading_card(&card).unwrap();
        card.box_ = 9;
        card.seen = 2;
        lib.save_reading_card(&card).unwrap();
        let cards = lib.reading_cards().unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!((cards[0].box_, cards[0].seen), (5, 2));
        let json = serde_json::to_value(&cards[0]).unwrap();
        assert_eq!(json["box"], 5);
        assert_eq!(json["totalMs"], 1500);
    }

    #[test]
    fn collection_import_is_idempotent_and_keeps_user_edits() {
        let (dir, lib, _src) = setup();
        let col = dir.path().join("colecao");
        fs::create_dir_all(&col).unwrap();
        fs::write(col.join("a.mxl"), b"partitura a").unwrap();
        fs::write(col.join("b.mxl"), b"partitura b").unwrap();
        fs::write(
            col.join("catalog.json"),
            r#"[{"file":"a.mxl","title":"Für Elise","artist":"Beethoven","style":"Clássico"},
                {"file":"b.mxl","title":"Cânone","artist":"Pachelbel","style":"Barroco"},
                {"file":"faltando.mxl","title":"X","artist":"Y"}]"#,
        )
        .unwrap();

        let first = lib.import_collection(&col).unwrap();
        assert_eq!((first.added, first.existing), (2, 0));
        assert_eq!(first.failed, vec!["faltando.mxl".to_string()]);
        let songs = lib.list().unwrap();
        let elise = songs.iter().find(|s| s.title == "Für Elise").unwrap();
        assert_eq!(
            (elise.artist.as_str(), elise.style.as_str()),
            ("Beethoven", "Clássico")
        );

        // O usuário muda o estilo; importar de novo não duplica nem desfaz.
        let patch = SongPatch {
            style: Some("Estudo".into()),
            ..Default::default()
        };
        lib.update(elise.id, patch).unwrap();
        let again = lib.import_collection(&col).unwrap();
        assert_eq!((again.added, again.existing), (0, 2));
        assert_eq!(lib.list().unwrap().len(), 2);
        assert!(lib.list().unwrap().iter().any(|s| s.style == "Estudo"));
        assert!(lib.import_collection(&dir.path().join("nada")).is_err());
    }

    #[test]
    fn bundled_musetrainer_catalog_matches_its_files() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/collections/musetrainer");
        let entries: Vec<CollectionEntry> =
            serde_json::from_str(&fs::read_to_string(dir.join("catalog.json")).unwrap()).unwrap();
        assert_eq!(entries.len(), 63);
        for e in &entries {
            assert!(dir.join(&e.file).is_file(), "{}", e.file);
            assert!(!e.title.is_empty() && !e.artist.is_empty() && !e.style.is_empty());
        }
    }

    #[test]
    fn covers_are_stored_replaced_and_removed() {
        let (dir, lib, src) = setup();
        let id = lib.import(&src, None, None).unwrap().id;
        assert_eq!(lib.list().unwrap()[0].cover, None);

        let first = lib.set_cover(id, b"jpeg 1", "jpg").unwrap().cover.unwrap();
        assert!(first.ends_with(".jpg") && Path::new(&first).is_file());
        // Trocar apaga a imagem antiga.
        let second = lib.set_cover(id, b"png 2", "png").unwrap().cover.unwrap();
        assert_ne!(first, second);
        assert!(!Path::new(&first).exists());

        let image = dir.path().join("capa.JPEG");
        fs::write(&image, b"jpeg 3").unwrap();
        let third = lib.set_cover_from_file(id, &image).unwrap().cover.unwrap();
        assert!(third.ends_with(".jpg") && !Path::new(&second).exists());
        assert!(
            lib.set_cover_from_file(id, &dir.path().join("a.gif"))
                .is_err()
        );
        assert!(lib.set_cover(id, b"", "jpg").is_err());
        assert!(lib.set_cover(999, b"x", "jpg").is_err());

        assert_eq!(lib.remove_cover(id).unwrap().cover, None);
        assert!(!Path::new(&third).exists());

        // Apagar a música apaga a capa.
        let cover = lib.set_cover(id, b"jpeg 4", "jpg").unwrap().cover.unwrap();
        lib.delete(id).unwrap();
        assert!(!Path::new(&cover).exists());
    }

    #[test]
    fn delete_removes_file_and_history() {
        let (_dir, lib, src) = setup();
        let song = lib.import(&src, None, None).unwrap();
        lib.record_attempt(&attempt(song.id, 50, true)).unwrap();
        lib.delete(song.id).unwrap();
        assert!(!Path::new(&song.path).exists());
        assert!(lib.list().unwrap().is_empty());
        assert!(lib.attempts(song.id).unwrap().is_empty());
    }

    #[test]
    fn reopening_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.musicxml");
        fs::write(&src, b"x").unwrap();
        {
            let lib = Library::open(dir.path()).unwrap();
            lib.import(&src, None, None).unwrap();
        }
        let lib = Library::open(dir.path()).unwrap();
        assert_eq!(lib.list().unwrap().len(), 1);
    }

    #[test]
    fn all_attempts_include_duration_for_the_progress_panel() {
        let (_dir, lib, src) = setup();
        let a = lib.import(&src, None, None).unwrap();
        lib.record_attempt(&attempt(a.id, 70, true)).unwrap();
        lib.record_attempt(&attempt(a.id, 90, true)).unwrap();
        let all = lib.all_attempts(0).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].score, 90);
        assert!(
            all.iter()
                .all(|x| x.duration_ms == 60_000 && x.played_at > 0)
        );
        assert!(lib.all_attempts(i64::MAX).unwrap().is_empty());
    }
}
