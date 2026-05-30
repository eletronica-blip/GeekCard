import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../geekcard.db');
const SCHEMA_PATH = join(__dirname, '../../schema/schema.sql');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  }
  return db;
}

export function query(sql, params = []) {
  return getDb().prepare(sql).all(params);
}

export function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(params);
}

export function run(sql, params = []) {
  return getDb().prepare(sql).run(params);
}

export function transaction(fn) {
  return getDb().transaction(fn)();
}
