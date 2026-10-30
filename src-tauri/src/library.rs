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

pub struct Library {
    conn: Mutex<Connection>,
    files: PathBuf,
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
           (SELECT score FROM attempts a WHERE a.song_id = s.id ORDER BY played_at DESC, id DESC LIMIT 1)
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
    })
}

impl Library {
    /// Abre (ou cria) a biblioteca em `dir`: `partitab.db` e a pasta `partituras`.
    pub fn open(dir: &Path) -> Result<Self> {
        let files = dir.join("partituras");
        fs::create_dir_all(&files).map_err(err)?;
        let mut conn = Connection::open(dir.join("partitab.db")).map_err(err)?;
        conn.pragma_update(None, "foreign_keys", true)
            .map_err(err)?;
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            files,
        })
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
            return get(&conn, id);
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
        get(&conn, conn.last_insert_rowid())
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
        let path: String = conn
            .query_row("SELECT stored_path FROM songs WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .map_err(err)?;
        conn.execute("DELETE FROM songs WHERE id = ?1", [id])
            .map_err(err)?;
        let _ = fs::remove_file(path);
        Ok(())
    }

    pub fn record_attempt(&self, a: &Attempt) -> Result<Song> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO attempts (song_id, played_at, mode, hands, track, level, speed, score,
                                   accuracy, hit, early, late, wrong, miss, completed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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
                a.completed
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
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, song_id, played_at, mode, hands, track, level, speed, score, accuracy,
                        hit, early, late, wrong, miss, completed
                 FROM attempts WHERE song_id = ?1 ORDER BY played_at DESC, id DESC",
            )
            .map_err(err)?;
        stmt.query_map([song_id], |r| {
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
}
