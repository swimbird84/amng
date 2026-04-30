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
  if (!actorCols.includes('comment')) {
    db.prepare('ALTER TABLE actors ADD COLUMN comment TEXT').run()
  }
  if (!actorCols.includes('debut_date')) {
    db.prepare('ALTER TABLE actors ADD COLUMN debut_date TEXT').run()
  }
  if (!actorCols.includes('cup')) {
    db.prepare('ALTER TABLE actors ADD COLUMN cup TEXT').run()
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
}
