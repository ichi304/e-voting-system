const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');

// データディレクトリの作成
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const ROSTER_PATH = path.join(DB_DIR, 'roster.db');
const BALLOT_PATH = path.join(DB_DIR, 'ballotbox.db');
const AUDIT_PATH = path.join(DB_DIR, 'audit.db');

let rosterDb, ballotDb, auditDb;
let initialized = false;

async function initDatabases() {
  if (initialized) return { rosterDb, ballotDb, auditDb };

  const SQL = await initSqlJs();

  // ===== 名簿DB =====
  if (fs.existsSync(ROSTER_PATH)) {
    const buffer = fs.readFileSync(ROSTER_PATH);
    rosterDb = new SQL.Database(buffer);
  } else {
    rosterDb = new SQL.Database();
  }

  rosterDb.run(`
    CREATE TABLE IF NOT EXISTS members (
      employee_id TEXT PRIMARY KEY,
      birthdate TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'voter' CHECK(role IN ('admin', 'reception', 'voter')),
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  rosterDb.run(`
    CREATE TABLE IF NOT EXISTS elections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('officer', 'strike', 'agenda', 'confidence')),
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'active', 'closed', 'counted')),
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  rosterDb.run(`
    CREATE TABLE IF NOT EXISTS election_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      candidate_description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (election_id) REFERENCES elections(id)
    )
  `);

  rosterDb.run(`
    CREATE TABLE IF NOT EXISTS voting_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_voted' CHECK(status IN ('not_voted', 'voted_electronic', 'voted_paper')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (election_id) REFERENCES elections(id),
      FOREIGN KEY (employee_id) REFERENCES members(employee_id),
      UNIQUE(election_id, employee_id)
    )
  `);

  // ===== 投票箱DB（名簿DBとの紐付け用外部キーやIDを一切持たない） =====
  if (fs.existsSync(BALLOT_PATH)) {
    const buffer = fs.readFileSync(BALLOT_PATH);
    ballotDb = new SQL.Database(buffer);
  } else {
    ballotDb = new SQL.Database();
  }

  ballotDb.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id TEXT NOT NULL,
      selected_candidate TEXT NOT NULL,
      voted_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ===== 監査ログDB =====
  if (fs.existsSync(AUDIT_PATH)) {
    const buffer = fs.readFileSync(AUDIT_PATH);
    auditDb = new SQL.Database(buffer);
  } else {
    auditDb = new SQL.Database();
  }

  auditDb.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now', 'localtime')),
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_employee_id TEXT,
      election_id TEXT,
      reason TEXT,
      details TEXT,
      ip_address TEXT
    )
  `);

  initialized = true;

  // 定期的にDBを保存
  setInterval(() => saveDatabases(), 5000);

  return { rosterDb, ballotDb, auditDb };
}

function saveDatabases() {
  try {
    if (rosterDb) {
      const data = rosterDb.export();
      fs.writeFileSync(ROSTER_PATH, Buffer.from(data));
    }
    if (ballotDb) {
      const data = ballotDb.export();
      fs.writeFileSync(BALLOT_PATH, Buffer.from(data));
    }
    if (auditDb) {
      const data = auditDb.export();
      fs.writeFileSync(AUDIT_PATH, Buffer.from(data));
    }
  } catch (err) {
    console.error('DB保存エラー:', err);
  }
}

// DB ヘルパー関数
function dbAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function dbGet(db, sql, params = []) {
  const results = dbAll(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
}

// 監査ログ記録関数
function writeAuditLog(entry) {
  if (!auditDb) return;
  dbRun(auditDb, `
    INSERT INTO audit_logs (actor_id, actor_role, action, target_employee_id, election_id, reason, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.actor_id, entry.actor_role, entry.action,
    entry.target_employee_id || null, entry.election_id || null,
    entry.reason || null, entry.details || null, entry.ip_address || null
  ]);
  saveDatabases();
}

function getDb() {
  return { rosterDb, ballotDb, auditDb };
}

module.exports = {
  initDatabases,
  saveDatabases,
  getDb,
  dbAll,
  dbGet,
  dbRun,
  writeAuditLog
};
