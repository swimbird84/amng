import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database

export function getDatabase(): Database.Database {
  return db
}

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'app.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      cover_path TEXT,
      product_number TEXT UNIQUE,
      title TEXT,
      release_date TEXT,
      rating REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_path TEXT,
      name TEXT NOT NULL,
      birthday TEXT,
      rating REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_tag_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS actor_tag_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS work_tags_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category_id INTEGER REFERENCES work_tag_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS actor_tags_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category_id INTEGER REFERENCES actor_tag_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS work_actors (
      work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
      PRIMARY KEY (work_id, actor_id)
    );

    CREATE TABLE IF NOT EXISTS work_tags (
      work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES work_tags_master(id) ON DELETE CASCADE,
      PRIMARY KEY (work_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS actor_tags (
      actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES actor_tags_master(id) ON DELETE CASCADE,
      PRIMARY KEY (actor_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS actor_scores (
      actor_id INTEGER PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
      face INTEGER DEFAULT 0,
      bust INTEGER DEFAULT 0,
      hip INTEGER DEFAULT 0,
      physical INTEGER DEFAULT 0,
      skin INTEGER DEFAULT 0,
      acting INTEGER DEFAULT 0,
      sexy INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS studios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_works_release_date ON works(release_date);
    CREATE INDEX IF NOT EXISTS idx_works_rating ON works(rating);
    CREATE INDEX IF NOT EXISTS idx_works_product_number ON works(product_number);
    CREATE INDEX IF NOT EXISTS idx_actors_birthday ON actors(birthday);
    CREATE INDEX IF NOT EXISTS idx_actors_rating ON actors(rating);
    CREATE INDEX IF NOT EXISTS idx_work_actors_actor_id ON work_actors(actor_id);
    CREATE INDEX IF NOT EXISTS idx_work_actors_work_id ON work_actors(work_id);
    CREATE INDEX IF NOT EXISTS idx_work_tags_tag_id ON work_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_actor_tags_tag_id ON actor_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_actors_name ON actors(name);
    CREATE INDEX IF NOT EXISTS idx_works_studio_id ON works(studio_id);
    CREATE INDEX IF NOT EXISTS idx_actors_debut_date ON actors(debut_date);
  `)

  // work_files 테이블 마이그레이션
  const workFilesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_files'").get()
  if (!workFilesTable) {
    db.exec(`
      CREATE TABLE work_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'local',
        sort_order INTEGER DEFAULT 0
      );
      CREATE INDEX idx_work_files_work_id ON work_files(work_id);
    `)
    db.prepare(`
      INSERT INTO work_files (work_id, file_path, type, sort_order)
      SELECT id, file_path, 'local', 0 FROM works WHERE file_path IS NOT NULL AND file_path != ''
    `).run()
  }

  // work_files.type 컬럼 추가 마이그레이션
  const workFilesCols = (db.prepare("PRAGMA table_info(work_files)").all() as { name: string }[]).map(c => c.name)
  if (!workFilesCols.includes('type')) {
    db.prepare("ALTER TABLE work_files ADD COLUMN type TEXT NOT NULL DEFAULT 'local'").run()
  }

  // work_tags_master.category_id 마이그레이션
  const workTagsMasterCols = (db.prepare("PRAGMA table_info(work_tags_master)").all() as { name: string }[]).map(c => c.name)
  if (!workTagsMasterCols.includes('category_id')) {
    db.prepare('ALTER TABLE work_tags_master ADD COLUMN category_id INTEGER REFERENCES work_tag_categories(id) ON DELETE SET NULL').run()
  }

  // actor_tags_master.category_id 마이그레이션
  const actorTagsMasterCols = (db.prepare("PRAGMA table_info(actor_tags_master)").all() as { name: string }[]).map(c => c.name)
  if (!actorTagsMasterCols.includes('category_id')) {
    db.prepare('ALTER TABLE actor_tags_master ADD COLUMN category_id INTEGER REFERENCES actor_tag_categories(id) ON DELETE SET NULL').run()
  }

  // work_actors.is_rep 컬럼 추가 마이그레이션
  const workActorsCols = (db.prepare("PRAGMA table_info(work_actors)").all() as { name: string }[]).map(c => c.name)
  if (!workActorsCols.includes('is_rep')) {
    db.prepare('ALTER TABLE work_actors ADD COLUMN is_rep INTEGER NOT NULL DEFAULT 0').run()
  }

  // 기존 배우에 대한 scores 행 생성 (마이그레이션)
  db.prepare('INSERT OR IGNORE INTO actor_scores (actor_id) SELECT id FROM actors').run()
  // sexy 컬럼 추가 마이그레이션
  const scoreCols = (db.prepare("PRAGMA table_info(actor_scores)").all() as { name: string }[]).map(c => c.name)
  if (!scoreCols.includes('sexy')) {
    db.prepare('ALTER TABLE actor_scores ADD COLUMN sexy INTEGER DEFAULT 0').run()
  }
  if (!scoreCols.includes('charm')) {
    db.prepare('ALTER TABLE actor_scores ADD COLUMN charm INTEGER DEFAULT 0').run()
  }
  if (!scoreCols.includes('technique')) {
    db.prepare('ALTER TABLE actor_scores ADD COLUMN technique INTEGER DEFAULT 0').run()
  }
  if (!scoreCols.includes('proportions')) {
    db.prepare('ALTER TABLE actor_scores ADD COLUMN proportions INTEGER DEFAULT 0').run()
  }

  // is_favorite 컬럼 추가 마이그레이션
  const workCols = (db.prepare("PRAGMA table_info(works)").all() as { name: string }[]).map(c => c.name)
  if (!workCols.includes('is_favorite')) {
    db.prepare('ALTER TABLE works ADD COLUMN is_favorite INTEGER DEFAULT 0').run()
  }
  if (!workCols.includes('comment')) {
    db.prepare('ALTER TABLE works ADD COLUMN comment TEXT').run()
  }
  if (workCols.includes('comment')) {
    db.prepare('UPDATE works SET title = comment WHERE title IS NULL').run()
  }
  if (!workCols.includes('studio_id')) {
    db.prepare('ALTER TABLE works ADD COLUMN studio_id INTEGER').run()
  }
  const actorCols = (db.prepare("PRAGMA table_info(actors)").all() as { name: string }[]).map(c => c.name)
  if (!actorCols.includes('is_favorite')) {
    db.prepare('ALTER TABLE actors ADD COLUMN is_favorite INTEGER DEFAULT 0').run()
  }
  if (!actorCols.includes('height')) {
    db.prepare('ALTER TABLE actors ADD COLUMN height INTEGER').run()
  }
  if (!actorCols.includes('bust')) {
    db.prepare('ALTER TABLE actors ADD COLUMN bust INTEGER').run()
  }
  if (!actorCols.includes('waist')) {
    db.prepare('ALTER TABLE actors ADD COLUMN waist INTEGER').run()
  }
  if (!actorCols.includes('hip')) {
    db.prepare('ALTER TABLE actors ADD COLUMN hip INTEGER').run()
  }
  if (!actorCols.includes('phys_arbitrary')) {
    db.prepare('ALTER TABLE actors ADD COLUMN phys_arbitrary TEXT').run()
  }
  if (!actorCols.includes('comment')) {
    db.prepare('ALTER TABLE actors ADD COLUMN comment TEXT').run()
  }
  if (!actorCols.includes('debut_date')) {
    db.prepare('ALTER TABLE actors ADD COLUMN debut_date TEXT').run()
  }
  if (!actorCols.includes('cup')) {
    db.prepare('ALTER TABLE actors ADD COLUMN cup TEXT').run()
  }
  if (!actorCols.includes('score_excluded')) {
    db.prepare('ALTER TABLE actors ADD COLUMN score_excluded INTEGER DEFAULT 0').run()
  }
  if (!actorCols.includes('delete_pending')) {
    db.prepare('ALTER TABLE actors ADD COLUMN delete_pending INTEGER DEFAULT 0').run()
  }
  if (!workCols.includes('delete_pending')) {
    db.prepare('ALTER TABLE works ADD COLUMN delete_pending INTEGER DEFAULT 0').run()
  }

  // studios color 컬럼 추가 마이그레이션
  const studioCols = (db.prepare("PRAGMA table_info(studios)").all() as { name: string }[]).map(c => c.name)
  if (!studioCols.includes('color')) {
    db.prepare('ALTER TABLE studios ADD COLUMN color TEXT').run()
  }

  // makers 테이블 마이그레이션
  const makersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='makers'").get()
  if (!makersTable) {
    db.exec(`
      CREATE TABLE makers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
  }

  // studios.maker_id 컬럼 마이그레이션
  if (!studioCols.includes('maker_id')) {
    db.prepare('ALTER TABLE studios ADD COLUMN maker_id INTEGER REFERENCES makers(id) ON DELETE SET NULL').run()
  }

  // studios.name 유니크 제약 변경: 글로벌 UNIQUE → 부분 인덱스
  // (미분류: name 단독 유니크, 제작사 있음: (name, maker_id) 유니크)
  const studioSchemaSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='studios'").get() as { sql: string } | undefined)?.sql ?? ''
  if (studioSchemaSql.toUpperCase().includes('UNIQUE')) {
    db.exec(`PRAGMA foreign_keys = OFF`)
    db.exec(`
      CREATE TABLE studios_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT,
        maker_id INTEGER REFERENCES makers(id) ON DELETE SET NULL
      );
      INSERT INTO studios_new SELECT id, name, color, maker_id FROM studios;
      DROP TABLE studios;
      ALTER TABLE studios_new RENAME TO studios;
    `)
    db.exec(`PRAGMA foreign_keys = ON`)
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS studios_unique_null_maker ON studios(name) WHERE maker_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS studios_unique_with_maker ON studios(name, maker_id) WHERE maker_id IS NOT NULL;
  `)

  // studios.created_at 컬럼 마이그레이션
  const studioColsLatest = (db.prepare("PRAGMA table_info(studios)").all() as { name: string }[]).map(c => c.name)
  if (!studioColsLatest.includes('created_at')) {
    db.prepare("ALTER TABLE studios ADD COLUMN created_at TEXT").run()
    db.prepare("UPDATE studios SET created_at = datetime('now') WHERE created_at IS NULL").run()
  }

  // studio_codes 테이블 마이그레이션
  const studioCodesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_codes'").get()
  if (!studioCodesTable) {
    db.exec(`
      CREATE TABLE studio_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studio_id INTEGER NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE
      )
    `)
  }

  // 대표 태그 is_rep 컬럼 추가 마이그레이션
  const workTagCols = (db.prepare("PRAGMA table_info(work_tags)").all() as { name: string }[]).map(c => c.name)
  if (!workTagCols.includes('is_rep')) {
    db.prepare('ALTER TABLE work_tags ADD COLUMN is_rep INTEGER DEFAULT 0').run()
  }
  const actorTagCols = (db.prepare("PRAGMA table_info(actor_tags)").all() as { name: string }[]).map(c => c.name)
  if (!actorTagCols.includes('is_rep')) {
    db.prepare('ALTER TABLE actor_tags ADD COLUMN is_rep INTEGER DEFAULT 0').run()
  }

  // work_tag_links / actor_tag_links 마이그레이션
  const workTagLinksTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_tag_links'").get()
  if (!workTagLinksTable) {
    db.exec(`
      CREATE TABLE work_tag_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_tag_id INTEGER NOT NULL REFERENCES work_tags_master(id) ON DELETE CASCADE,
        child_tag_id INTEGER NOT NULL REFERENCES work_tags_master(id) ON DELETE CASCADE,
        UNIQUE(parent_tag_id, child_tag_id),
        CHECK(parent_tag_id != child_tag_id)
      )
    `)
  }
  const actorTagLinksTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='actor_tag_links'").get()
  if (!actorTagLinksTable) {
    db.exec(`
      CREATE TABLE actor_tag_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_tag_id INTEGER NOT NULL REFERENCES actor_tags_master(id) ON DELETE CASCADE,
        child_tag_id INTEGER NOT NULL REFERENCES actor_tags_master(id) ON DELETE CASCADE,
        UNIQUE(parent_tag_id, child_tag_id),
        CHECK(parent_tag_id != child_tag_id)
      )
    `)
  }

  // work_tags_master / actor_tags_master created_at 마이그레이션
  const workTagMasterCols = (db.prepare("PRAGMA table_info(work_tags_master)").all() as { name: string }[]).map(c => c.name)
  if (!workTagMasterCols.includes('created_at')) {
    db.prepare("ALTER TABLE work_tags_master ADD COLUMN created_at TEXT").run()
    db.prepare("UPDATE work_tags_master SET created_at = datetime('now') WHERE created_at IS NULL").run()
  }
  const actorTagMasterCols = (db.prepare("PRAGMA table_info(actor_tags_master)").all() as { name: string }[]).map(c => c.name)
  if (!actorTagMasterCols.includes('created_at')) {
    db.prepare("ALTER TABLE actor_tags_master ADD COLUMN created_at TEXT").run()
    db.prepare("UPDATE actor_tags_master SET created_at = datetime('now') WHERE created_at IS NULL").run()
  }

  // 기존 worldcup_* 테이블 제거 (cup 시스템으로 교체, 최초 1회)
  const wcLegacyExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worldcup_categories'").get()
  if (wcLegacyExists) {
    db.exec(`
      DROP TABLE IF EXISTS _worldcup_orphan_cleaned;
      DROP TABLE IF EXISTS _rank_history_migrated;
      DROP TABLE IF EXISTS worldcup_rank_history;
      DROP TABLE IF EXISTS worldcup_stats;
      DROP TABLE IF EXISTS worldcup_matches;
      DROP TABLE IF EXISTS worldcup_sessions;
      DROP TABLE IF EXISTS worldcup_categories;
    `)
  }

  // cup 대회 시스템 테이블 (B안: tournament=템플릿, run=실행기록)
  const cupTournamentsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cup_tournaments'").get()
  if (!cupTournamentsTable) {
    db.exec(`
      CREATE TABLE cup_tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
        name TEXT NOT NULL,
        is_master INTEGER NOT NULL DEFAULT 0,
        format TEXT NOT NULL CHECK(format IN ('tournament', 'league', 'worldcup')),
        division_range TEXT,
        filter_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE cup_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL REFERENCES cup_tournaments(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
        round_total INTEGER,
        winner_id INTEGER,
        settings_snapshot TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE cup_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
        item_id INTEGER NOT NULL,
        total_cups INTEGER NOT NULL DEFAULT 0,
        cup_wins INTEGER NOT NULL DEFAULT 0,
        total_matches INTEGER NOT NULL DEFAULT 0,
        match_wins INTEGER NOT NULL DEFAULT 0,
        UNIQUE(type, item_id)
      );

      CREATE TABLE cup_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        division INTEGER,
        UNIQUE(run_id, item_id)
      );

      CREATE TABLE cup_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        phase TEXT NOT NULL DEFAULT 'main' CHECK(phase IN ('group', 'main', 'tiebreak')),
        group_id INTEGER,
        round INTEGER NOT NULL,
        match_index INTEGER NOT NULL,
        item1_id INTEGER NOT NULL,
        item2_id INTEGER,
        winner_id INTEGER,
        is_bye INTEGER NOT NULL DEFAULT 0,
        is_draw INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE cup_match_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        match_id INTEGER NOT NULL REFERENCES cup_matches(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        base_points REAL NOT NULL DEFAULT 0,
        bonus_points REAL NOT NULL DEFAULT 0,
        total_points REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE master_ranking_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
        item_id INTEGER NOT NULL,
        points REAL NOT NULL DEFAULT 0,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE ranking_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL UNIQUE CHECK(type IN ('actor', 'work')),
        settings_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX idx_cup_tournaments_type ON cup_tournaments(type);
      CREATE INDEX idx_cup_runs_tournament ON cup_runs(tournament_id);
      CREATE INDEX idx_cup_entries_run ON cup_entries(run_id);
      CREATE INDEX idx_cup_matches_run ON cup_matches(run_id);
      CREATE INDEX idx_master_ranking_history_item ON master_ranking_history(type, item_id);
    `)

    // ranking_settings 기본값 삽입 (배우/작품 각각)
    const defaultSettings = JSON.stringify({
      basePoints: { win: 3, draw: 1, loss: 0 },
      divisionWeights: [5.0, 3.5, 2.5, 1.5, 1.0, 0.5],
      opponentWeights: [5.0, 3.5, 2.5, 1.5, 1.0, 0.5],
      rankBonus: {
        '32':  { '1': 15, '2': 8,  '4': 4, '8': 2 },
        '64':  { '1': 20, '2': 10, '4': 5, '8': 3, '16': 1 },
        '128': { '1': 25, '2': 13, '4': 6, '8': 3, '16': 1 },
        '256': { '1': 30, '2': 15, '4': 8, '8': 4, '16': 2, '32': 1 },
        '512': { '1': 35, '2': 18, '4': 9, '8': 5, '16': 2, '32': 1 }
      }
    })
    db.prepare("INSERT INTO ranking_settings (type, settings_json) VALUES ('actor', ?)").run(defaultSettings)
    db.prepare("INSERT INTO ranking_settings (type, settings_json) VALUES ('work', ?)").run(defaultSettings)
  }

  // B안 마이그레이션: tournament_id → run_id (기존 설치 대상)
  const cupEntriesCols = (db.prepare("PRAGMA table_info(cup_entries)").all() as { name: string }[]).map(c => c.name)
  if (cupEntriesCols.includes('tournament_id')) {
    db.exec(`PRAGMA foreign_keys = OFF`)

    // 1. cup_runs 생성
    db.exec(`
      CREATE TABLE IF NOT EXISTS cup_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL REFERENCES cup_tournaments(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
        round_total INTEGER,
        winner_id INTEGER,
        settings_snapshot TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cup_runs_tournament ON cup_runs(tournament_id);
    `)

    // 2. 기존 실행된 tournament → run 마이그레이션
    db.exec(`
      INSERT OR IGNORE INTO cup_runs (tournament_id, status, round_total, winner_id, settings_snapshot, started_at, completed_at)
      SELECT id,
        CASE WHEN status IN ('in_progress', 'completed') THEN status ELSE 'completed' END,
        round_total, winner_id, settings_snapshot,
        COALESCE(started_at, datetime('now')), completed_at
      FROM cup_tournaments WHERE status IN ('in_progress', 'completed');
    `)

    // 3. cup_entries 재생성
    db.exec(`
      CREATE TABLE cup_entries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        division INTEGER,
        UNIQUE(run_id, item_id)
      );
      INSERT INTO cup_entries_new (id, run_id, item_id, division)
      SELECT e.id, r.id, e.item_id, e.division
      FROM cup_entries e
      JOIN cup_runs r ON r.tournament_id = e.tournament_id;
      DROP TABLE cup_entries;
      ALTER TABLE cup_entries_new RENAME TO cup_entries;
      CREATE INDEX idx_cup_entries_run ON cup_entries(run_id);
    `)

    // 4. cup_matches 재생성
    db.exec(`
      CREATE TABLE cup_matches_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        phase TEXT NOT NULL DEFAULT 'main' CHECK(phase IN ('group', 'main', 'tiebreak')),
        group_id INTEGER,
        round INTEGER NOT NULL,
        match_index INTEGER NOT NULL,
        item1_id INTEGER NOT NULL,
        item2_id INTEGER,
        winner_id INTEGER,
        is_bye INTEGER NOT NULL DEFAULT 0,
        is_draw INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO cup_matches_new (id, run_id, phase, group_id, round, match_index, item1_id, item2_id, winner_id, is_bye, is_draw)
      SELECT m.id, r.id, m.phase, m.group_id, m.round, m.match_index, m.item1_id, m.item2_id, m.winner_id, m.is_bye, m.is_draw
      FROM cup_matches m
      JOIN cup_runs r ON r.tournament_id = m.tournament_id;
      DROP TABLE cup_matches;
      ALTER TABLE cup_matches_new RENAME TO cup_matches;
      CREATE INDEX idx_cup_matches_run ON cup_matches(run_id);
    `)

    // 5. cup_match_points 재생성
    db.exec(`
      CREATE TABLE cup_match_points_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        match_id INTEGER NOT NULL REFERENCES cup_matches(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        base_points REAL NOT NULL DEFAULT 0,
        bonus_points REAL NOT NULL DEFAULT 0,
        total_points REAL NOT NULL DEFAULT 0
      );
      INSERT INTO cup_match_points_new (id, run_id, match_id, item_id, base_points, bonus_points, total_points)
      SELECT p.id, r.id, p.match_id, p.item_id, p.base_points, p.bonus_points, p.total_points
      FROM cup_match_points p
      JOIN cup_runs r ON r.tournament_id = p.tournament_id;
      DROP TABLE cup_match_points;
      ALTER TABLE cup_match_points_new RENAME TO cup_match_points;
    `)

    // 6. master_ranking_history 재생성
    db.exec(`
      CREATE TABLE master_ranking_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
        item_id INTEGER NOT NULL,
        points REAL NOT NULL DEFAULT 0,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO master_ranking_history_new (id, run_id, type, item_id, points, recorded_at)
      SELECT h.id, r.id, h.type, h.item_id, h.points, h.recorded_at
      FROM master_ranking_history h
      JOIN cup_runs r ON r.tournament_id = h.tournament_id;
      DROP TABLE master_ranking_history;
      ALTER TABLE master_ranking_history_new RENAME TO master_ranking_history;
      CREATE INDEX idx_master_ranking_history_item ON master_ranking_history(type, item_id);
    `)

    // 7. cup_tournaments 재생성 (run 전용 컬럼 제거)
    db.exec(`
      CREATE TABLE cup_tournaments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
        name TEXT NOT NULL,
        is_master INTEGER NOT NULL DEFAULT 0,
        format TEXT NOT NULL CHECK(format IN ('tournament', 'league', 'worldcup')),
        division_range TEXT,
        filter_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO cup_tournaments_new (id, type, name, is_master, format, division_range, filter_json, created_at)
      SELECT id, type, name, is_master, format, division_range, filter_json, created_at
      FROM cup_tournaments;
      DROP TABLE cup_tournaments;
      ALTER TABLE cup_tournaments_new RENAME TO cup_tournaments;
      CREATE INDEX idx_cup_tournaments_type ON cup_tournaments(type);
    `)

    db.exec(`PRAGMA foreign_keys = ON`)
  }

  // cup_matches phase CHECK에 'tiebreak' 추가 마이그레이션
  const cupMatchesSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cup_matches'").get() as { sql: string } | undefined)?.sql ?? ''
  if (!cupMatchesSql.includes('tiebreak')) {
    db.exec(`PRAGMA foreign_keys = OFF`)
    db.exec(`
      CREATE TABLE cup_matches_tiebreak_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES cup_runs(id) ON DELETE CASCADE,
        phase TEXT NOT NULL DEFAULT 'main' CHECK(phase IN ('group', 'main', 'tiebreak')),
        group_id INTEGER,
        round INTEGER NOT NULL,
        match_index INTEGER NOT NULL,
        item1_id INTEGER NOT NULL,
        item2_id INTEGER,
        winner_id INTEGER,
        is_bye INTEGER NOT NULL DEFAULT 0,
        is_draw INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO cup_matches_tiebreak_new SELECT * FROM cup_matches;
      DROP TABLE cup_matches;
      ALTER TABLE cup_matches_tiebreak_new RENAME TO cup_matches;
      CREATE INDEX idx_cup_matches_run ON cup_matches(run_id);
    `)
    db.exec(`PRAGMA foreign_keys = ON`)
  }

  // cup_rank_snapshots 테이블 추가
  db.exec(`
    CREATE TABLE IF NOT EXISTS cup_rank_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES cup_tournaments(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cup_rank_snapshots ON cup_rank_snapshots(tournament_id, item_id);
  `)

  // cup_matches.block_id 컬럼 추가 (worldcup 블럭 구조 UI용)
  const cupMatchesCols = (db.prepare("PRAGMA table_info(cup_matches)").all() as { name: string }[]).map(c => c.name)
  if (!cupMatchesCols.includes('block_id')) {
    db.prepare('ALTER TABLE cup_matches ADD COLUMN block_id INTEGER DEFAULT NULL').run()
  }
}
