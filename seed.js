const { initDatabases, getPool, dbRun, dbAll } = require('./db/init');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('🌱 シードデータの投入を開始します...\n');

  await initDatabases();

  const insertMember = async (id, pin, name, role) => {
    await dbRun('INSERT OR IGNORE INTO members (employee_id, login_pin, name, role) VALUES (?, ?, ?, ?)',
      [id, pin, name, role]);
  };

  // ===== 管理者・受付担当の作成 =====
  await insertMember('ADMIN001', '0000', '選挙管理 太郎', 'admin');
  await insertMember('STAFF001', '1111', '事務局 花子', 'reception');
  await insertMember('STAFF002', '2222', '受付 次郎', 'reception');
  console.log('✅ 管理者・受付担当を登録しました');

  // ===== 組合員の作成 =====
  const names = [
    '田中 太郎', '鈴木 花子', '佐藤 一郎', '高橋 美咲', '渡辺 健太',
    '伊藤 さくら', '山本 大輔', '中村 あかり', '小林 翔太', '加藤 由美',
    '吉田 拓海', '山田 千尋', '松本 隼人', '井上 葵', '木村 悠斗',
    '林 美月', '斎藤 蓮', '清水 結衣', '山崎 陽向', '森 凛',
    '池田 大地', '橋本 ひなた', '阿部 颯', '石川 心愛', '前田 奏',
    '藤田 朝陽', '後藤 彩花', '岡田 湊', '長谷川 詩', '村上 樹'
  ];

  for (let i = 1; i <= 30; i++) {
    const empId = `EMP${String(i).padStart(4, '0')}`;
    const pin = String(1000 + i);
    await insertMember(empId, pin, names[i - 1], 'voter');
  }
  console.log('✅ 組合員30名を登録しました');

  // ===== テスト投票の作成 =====
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // ストライキ批准投票
  const strikeId = uuidv4();
  await dbRun(
    `INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [strikeId, 'テスト: ストライキ批准投票', 'テスト用のストライキ批准投票です。', 'strike', fmt(start), fmt(end), 'active']
  );

  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '賛成', 'ストライキを批准する', 0]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '反対', 'ストライキを批准しない', 1]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '白票（棄権）', '棄権する場合はこちらを選択してください', 2]);

  console.log('✅ テスト投票(ストライキ批准)を作成しました');

  // 議案審議投票（detail_url付き）
  const agendaId = uuidv4();
  await dbRun(
    `INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status, detail_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [agendaId, 'テスト: 議案審議投票', '来年度の予算案について審議します。', 'agenda', fmt(start), fmt(end), 'active', 'https://example.com/budget-proposal-2026.pdf']
  );

  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '賛成', '予算案を承認する', 0]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '反対', '予算案を否決する', 1]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '白票（棄権）', '棄権する場合はこちらを選択してください', 2]);

  console.log('✅ テスト投票(議案審議 / 資料リンク付き)を作成しました');

  // 全組合員のvoting_statusを初期化
  const voters = await dbAll("SELECT employee_id FROM members WHERE role = 'voter'");
  for (const voter of voters) {
    await dbRun('INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [strikeId, voter.employee_id, 'not_voted']);
    await dbRun('INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [agendaId, voter.employee_id, 'not_voted']);
  }
  console.log('✅ 投票ステータス初期化完了');

  console.log('\n🎉 シードデータの投入が完了しました！\n');
  console.log('📋 ログイン情報:');
  console.log('  管理者:     ADMIN001 / PIN: 0000');
  console.log('  受付担当:   STAFF001 / PIN: 1111');
  console.log('  組合員:     EMP0001 / PIN: 1001');
  console.log('              EMP0002 / PIN: 1002  ... etc\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ シードエラー:', err);
  process.exit(1);
});
