const { Pool } = require('pg');

let pool = null;

// SQLite の ? プレースホルダーを PostgreSQL の $1, $2, ... に変換
function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// SQLite 構文を PostgreSQL 構文に変換
function convertSql(sql) {
  let converted = convertPlaceholders(sql);
  converted = converted.replace(/INSERT OR IGNORE/gi, 'INSERT');
  // ON CONFLICT DO NOTHING を追加（INSERT文のみ）
  if (/^INSERT/i.test(converted.trim()) && !/ON CONFLICT/i.test(converted)) {
    converted = converted.replace(/\)\s*$/, ') ON CONFLICT DO NOTHING');
    // VALUES(...) で終わるパターン
    if (!/ON CONFLICT/i.test(converted)) {
      converted += ' ON CONFLICT DO NOTHING';
    }
  }
  converted = converted.replace(/datetime\('now',\s*'localtime'\)/gi, 'CURRENT_TIMESTAMP');
  return converted;
}

async function initDatabases() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL が設定されていません。');
    console.log('ローカル開発の場合: DATABASE_URL=postgresql://user:pass@localhost:5432/evoting');
    process.exit(1);
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  // 接続テスト
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL に接続しました');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL 接続エラー:', err.message);
    process.exit(1);
  }

  // テーブル作成
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      employee_id TEXT PRIMARY KEY,
      login_pin TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'voter' CHECK(role IN ('admin', 'reception', 'voter')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 旧テーブルからのマイグレーション: birthdate列が存在する場合はlogin_pinに名前変更
  try {
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'members' AND column_name = 'birthdate'
    `);
    if (colCheck.rows.length > 0) {
      await pool.query('ALTER TABLE members RENAME COLUMN birthdate TO login_pin');
      console.log('✅ birthdate 列を login_pin に名前変更しました');
    }
  } catch (e) {
    // 既にlogin_pinの場合は無視
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS elections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('strike', 'agenda', 'confidence')),
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'active', 'closed', 'counted')),
      detail_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // detail_url列が無い場合は追加
  try {
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'elections' AND column_name = 'detail_url'
    `);
    if (colCheck.rows.length === 0) {
      await pool.query('ALTER TABLE elections ADD COLUMN detail_url TEXT');
      console.log('✅ elections テーブルに detail_url 列を追加しました');
    }
  } catch (e) {
    // 無視
  }

  // type制約をofficerを含まないように更新（既存データがあるので柔軟に対応）
  // PostgreSQLはALTER CONSTRAINT が面倒なので、既存の制約は残して新規作成時にフロントで制御

  await pool.query(`
    CREATE TABLE IF NOT EXISTS election_candidates (
      id SERIAL PRIMARY KEY,
      election_id TEXT NOT NULL REFERENCES elections(id),
      candidate_name TEXT NOT NULL,
      candidate_description TEXT,
      display_order INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS voting_status (
      election_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_voted' CHECK(status IN ('not_voted', 'voted_electronic', 'voted_paper')),
      voted_at TIMESTAMP,
      PRIMARY KEY (election_id, employee_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      election_id TEXT NOT NULL,
      selected_candidate TEXT NOT NULL,
      vote_source TEXT NOT NULL DEFAULT 'electronic',
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // vote_source列が無い場合は追加
  try {
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'votes' AND column_name = 'vote_source'
    `);
    if (colCheck.rows.length === 0) {
      await pool.query("ALTER TABLE votes ADD COLUMN vote_source TEXT NOT NULL DEFAULT 'electronic'");
      console.log('✅ votes テーブルに vote_source 列を追加しました');
    }
  } catch (e) {
    // 無視
  }

  // 紙投票集計テーブル（開票後に紙投票の結果を反映する）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_vote_results (
      id SERIAL PRIMARY KEY,
      election_id TEXT NOT NULL REFERENCES elections(id),
      candidate_name TEXT NOT NULL,
      vote_count INTEGER NOT NULL DEFAULT 0,
      registered_by TEXT NOT NULL,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      actor_id TEXT,
      target_employee_id TEXT,
      election_id TEXT,
      reason TEXT,
      ip_address TEXT,
      details TEXT
    )
  `);

  console.log('✅ テーブルの初期化が完了しました');
}

function getPool() {
  return pool;
}

// ===== ヘルパー関数（async） =====
async function dbAll(sql, params = []) {
  const converted = convertSql(sql);
  const result = await pool.query(converted, params);
  return result.rows;
}

async function dbGet(sql, params = []) {
  const converted = convertSql(sql);
  const result = await pool.query(converted, params);
  return result.rows[0] || null;
}

async function dbRun(sql, params = []) {
  const converted = convertSql(sql);
  const result = await pool.query(converted, params);
  return result;
}

// ===== 監査ログ =====
async function writeAuditLog({ action, actorId, targetEmployeeId, electionId, reason, ipAddress, details }) {
  await dbRun(
    `INSERT INTO audit_logs (action, actor_id, target_employee_id, election_id, reason, ip_address, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [action, actorId || null, targetEmployeeId || null, electionId || null, reason || null, ipAddress || null, details || null]
  );
}

module.exports = {
  initDatabases,
  getPool,
  dbAll,
  dbGet,
  dbRun,
  writeAuditLog,
};
