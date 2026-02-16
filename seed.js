const { initDatabases, getDb, dbRun, dbAll, saveDatabases } = require('./db/init');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('🌱 シードデータの投入を開始します...\n');

  await initDatabases();
  const { rosterDb } = getDb();

  // ===== 管理者・受付担当の作成 =====
  const insertMember = (id, birth, name, role) => {
    dbRun(rosterDb, 'INSERT OR IGNORE INTO members (employee_id, birthdate, name, role) VALUES (?, ?, ?, ?)',
      [id, birth, name, role]);
  };

  insertMember('ADMIN001', '19800101', '選挙管理 太郎', 'admin');
  console.log('✅ 管理者アカウント作成: ADMIN001 / 19800101');

  insertMember('STAFF001', '19850515', '事務局 花子', 'reception');
  insertMember('STAFF002', '19870320', '事務局 次郎', 'reception');
  console.log('✅ 受付担当アカウント作成: STAFF001 / 19850515, STAFF002 / 19870320');

  // ===== テスト用組合員の作成（50名） =====
  const names = [
    '田中 一郎', '鈴木 二郎', '佐藤 三郎', '高橋 四郎', '渡辺 五郎',
    '伊藤 六郎', '山本 七郎', '中村 八郎', '小林 九郎', '加藤 十郎',
    '吉田 太一', '山田 太二', '松本 太三', '井上 太四', '木村 太五',
    '林 太六', '清水 太七', '森 太八', '阿部 太九', '池田 太十',
    '橋本 光一', '山口 光二', '石川 光三', '前田 光四', '藤田 光五',
    '小川 光六', '岡田 光七', '後藤 光八', '長谷川 光九', '村上 光十',
    '近藤 健一', '坂本 健二', '遠藤 健三', '青木 健四', '藤井 健五',
    '西村 健六', '福田 健七', '太田 健八', '三浦 健九', '岡本 健十',
    '松田 正一', '中川 正二', '中野 正三', '原田 正四', '小野 正五',
    '竹内 正六', '金子 正七', '和田 正八', '中山 正九', '石田 正十'
  ];

  for (let i = 0; i < names.length; i++) {
    const empId = `EMP${String(i + 1).padStart(4, '0')}`;
    const year = 1980 + Math.floor(Math.random() * 20);
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const birthdate = `${year}${month}${day}`;
    insertMember(empId, birthdate, names[i], 'voter');
  }

  // 最初の組合員は固定の生年月日にする（テスト用）
  dbRun(rosterDb, 'UPDATE members SET birthdate = ? WHERE employee_id = ?', ['19900607', 'EMP0001']);

  console.log(`✅ テスト用組合員 ${names.length}名 作成完了`);
  console.log('   テスト組合員: EMP0001 / 19900607（田中 一郎）');

  // ===== テスト用投票の作成 =====
  const electionId = uuidv4();
  const now = new Date();
  const startTime = new Date(now.getTime() - 60 * 60 * 1000);
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const fmtDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  dbRun(rosterDb, `
    INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    electionId,
    '2026年度 役員選挙',
    '2026年度の組合役員（委員長・副委員長・書記長）を選出する選挙です。',
    'officer',
    fmtDate(startTime),
    fmtDate(endTime),
    'active'
  ]);

  const addCandidate = (eid, name, desc, order) => {
    dbRun(rosterDb, `
      INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
      VALUES (?, ?, ?, ?)
    `, [eid, name, desc, order]);
  };

  addCandidate(electionId, '山本 太郎', '現職委員長。組合活動歴15年。労働環境改善に注力。', 0);
  addCandidate(electionId, '佐藤 花子', '副委員長候補。福利厚生制度の充実を公約。', 1);
  addCandidate(electionId, '鈴木 一郎', '書記長候補。若手の意見反映を重視。', 2);
  addCandidate(electionId, '白票（棄権）', '棄権する場合はこちらを選択してください', 3);

  // 全組合員のvoting_statusを初期化
  const voters = dbAll(rosterDb, "SELECT employee_id FROM members WHERE role = 'voter'");
  for (const voter of voters) {
    dbRun(rosterDb,
      'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [electionId, voter.employee_id, 'not_voted']
    );
  }

  console.log(`✅ テスト投票作成完了: 「2026年度 役員選挙」`);

  // ===== もう1つのテスト投票（ストライキ批准投票）=====
  const electionId2 = uuidv4();
  const startTime2 = new Date(now.getTime() - 30 * 60 * 1000);
  const endTime2 = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  dbRun(rosterDb, `
    INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    electionId2,
    'ストライキ批准投票',
    '春闘における24時間ストライキの実施について批准投票を行います。',
    'strike',
    fmtDate(startTime2),
    fmtDate(endTime2),
    'active'
  ]);

  addCandidate(electionId2, '賛成', 'ストライキの実施に賛成します。', 0);
  addCandidate(electionId2, '反対', 'ストライキの実施に反対します。', 1);
  addCandidate(electionId2, '白票（棄権）', '棄権する場合はこちらを選択してください', 2);

  for (const voter of voters) {
    dbRun(rosterDb,
      'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [electionId2, voter.employee_id, 'not_voted']
    );
  }

  console.log(`✅ テスト投票作成完了: 「ストライキ批准投票」`);

  // ===== 信任投票（チェックボックス複数選択型） =====
  const electionId3 = uuidv4();
  const startTime3 = new Date(now.getTime() - 15 * 60 * 1000);
  const endTime3 = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  dbRun(rosterDb, `
    INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    electionId3,
    '2026年度 執行委員信任投票',
    '2026年度の執行委員候補について信任投票を行います。信任する候補者を全て選択してください（複数選択可）。',
    'confidence',
    fmtDate(startTime3),
    fmtDate(endTime3),
    'active'
  ]);

  addCandidate(electionId3, '田村 健太郎', '現職執行委員。労使交渉において成果を挙げている。', 0);
  addCandidate(electionId3, '中島 美咲', '新任候補。安全衛生委員としての実績あり。', 1);
  addCandidate(electionId3, '河野 大輔', '現職執行委員。賃金改定交渉を担当。', 2);
  addCandidate(electionId3, '吉村 亮太', '新任候補。若手組合員の声を代弁。工場現場出身。', 3);
  addCandidate(electionId3, '白票（棄権）', '棄権する場合はこちらを選択してください', 4);

  for (const voter of voters) {
    dbRun(rosterDb,
      'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [electionId3, voter.employee_id, 'not_voted']
    );
  }

  console.log(`✅ テスト投票作成完了: 「2026年度 執行委員信任投票」（信任投票・複数選択型）`);

  saveDatabases();
  console.log('\n🎉 シードデータの投入が完了しました！');
  console.log('サーバーを起動するには: npm run dev\n');
}

seed().catch(err => {
  console.error('シードエラー:', err);
  process.exit(1);
});
